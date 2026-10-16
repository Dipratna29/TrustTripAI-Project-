"""
Current weather via Open-Meteo (free, no API key; base URL configurable with WEATHER_API_URL).
Results are cached ~10 minutes per ~1 km grid cell so the free provider is not hammered.
"""

import logging
import os
import threading
import time
from typing import Any, Dict, Tuple

import requests

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 600
_cache: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}
_lock = threading.Lock()

# WMO weather interpretation codes -> (label, icon key used by the app)
WMO = {
    0: ("Clear sky", "sunny"), 1: ("Mainly clear", "sunny"), 2: ("Partly cloudy", "partly-sunny"),
    3: ("Overcast", "cloudy"), 45: ("Fog", "cloudy"), 48: ("Freezing fog", "cloudy"),
    51: ("Light drizzle", "rainy"), 53: ("Drizzle", "rainy"), 55: ("Heavy drizzle", "rainy"),
    56: ("Freezing drizzle", "rainy"), 57: ("Freezing drizzle", "rainy"),
    61: ("Light rain", "rainy"), 63: ("Rain", "rainy"), 65: ("Heavy rain", "rainy"),
    66: ("Freezing rain", "rainy"), 67: ("Freezing rain", "rainy"),
    71: ("Light snow", "snow"), 73: ("Snow", "snow"), 75: ("Heavy snow", "snow"), 77: ("Snow grains", "snow"),
    80: ("Rain showers", "rainy"), 81: ("Rain showers", "rainy"), 82: ("Violent rain showers", "rainy"),
    85: ("Snow showers", "snow"), 86: ("Snow showers", "snow"),
    95: ("Thunderstorm", "thunderstorm"), 96: ("Thunderstorm with hail", "thunderstorm"),
    99: ("Thunderstorm with hail", "thunderstorm"),
}


class WeatherError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _base_url() -> str:
    return os.environ.get("WEATHER_API_URL", "https://api.open-meteo.com/v1/forecast")


USER_AGENT = "TrustTrip/1.0 (+https://github.com/Dipratna29/TrustTripAI-Project-)"

# MET Norway symbol codes (suffixes _day/_night/_polartwilight stripped) -> (label, icon)
MET_SYMBOLS = {
    "clearsky": ("Clear sky", "sunny"), "fair": ("Mainly clear", "sunny"),
    "partlycloudy": ("Partly cloudy", "partly-sunny"), "cloudy": ("Overcast", "cloudy"), "fog": ("Fog", "cloudy"),
    "lightrain": ("Light rain", "rainy"), "rain": ("Rain", "rainy"), "heavyrain": ("Heavy rain", "rainy"),
    "lightrainshowers": ("Light rain showers", "rainy"), "rainshowers": ("Rain showers", "rainy"),
    "heavyrainshowers": ("Heavy rain showers", "rainy"), "lightsleet": ("Light sleet", "snow"), "sleet": ("Sleet", "snow"),
    "lightsnow": ("Light snow", "snow"), "snow": ("Snow", "snow"), "heavysnow": ("Heavy snow", "snow"),
}


def _open_meteo(lat: float, lon: float) -> Dict[str, Any]:
    resp = requests.get(
        _base_url(),
        params={
            "latitude": lat, "longitude": lon, "timezone": "auto",
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=8,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Open-Meteo HTTP {resp.status_code}")
    cur = (resp.json() or {}).get("current") or {}
    if cur.get("temperature_2m") is None:
        raise RuntimeError("Open-Meteo returned no data")
    code = int(cur.get("weather_code") or 0)
    label, icon = WMO.get(code, ("Unknown", "cloudy"))
    return {
        "temperature_c": round(float(cur["temperature_2m"]), 1),
        "feels_like_c": round(float(cur.get("apparent_temperature") or cur["temperature_2m"]), 1),
        "humidity": cur.get("relative_humidity_2m"),
        "wind_kph": cur.get("wind_speed_10m"),
        "condition": label,
        "icon": icon,
        "weather_code": code,
        "is_day": bool(cur.get("is_day", 1)),
        "observed_at": cur.get("time"),
        "provider": "Open-Meteo",
    }


def _met_norway(lat: float, lon: float) -> Dict[str, Any]:
    """Fallback: MET Norway Locationforecast (free; requires an identifying User-Agent)."""
    resp = requests.get(
        "https://api.met.no/weatherapi/locationforecast/2.0/compact",
        params={"lat": lat, "lon": lon},
        headers={"User-Agent": USER_AGENT},
        timeout=8,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"MET Norway HTTP {resp.status_code}")
    series = ((resp.json() or {}).get("properties") or {}).get("timeseries") or []
    if not series:
        raise RuntimeError("MET Norway returned no data")
    first = series[0]
    details = ((first.get("data") or {}).get("instant") or {}).get("details") or {}
    if details.get("air_temperature") is None:
        raise RuntimeError("MET Norway returned no temperature")
    symbol = (((first.get("data") or {}).get("next_1_hours") or {}).get("summary") or {}).get("symbol_code", "")
    base = symbol.split("_")[0]
    if "thunder" in base:
        label, icon = ("Thunderstorm", "thunderstorm")
    else:
        label, icon = MET_SYMBOLS.get(base, ("Unknown", "cloudy"))
    temp = round(float(details["air_temperature"]), 1)
    wind = details.get("wind_speed")
    return {
        "temperature_c": temp,
        "feels_like_c": temp,
        "humidity": details.get("relative_humidity"),
        "wind_kph": round(float(wind) * 3.6, 1) if wind is not None else None,
        "condition": label,
        "icon": icon,
        "weather_code": None,
        "is_day": not symbol.endswith("_night"),
        "observed_at": first.get("time"),
        "provider": "MET Norway",
    }


def get_current_weather(lat: float, lon: float) -> Dict[str, Any]:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise WeatherError("Invalid coordinates", 400)
    key = (round(lat, 2), round(lon, 2))
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL_SECONDS:
            return {**hit[1], "cached": True}

    data = None
    errors = []
    for provider in (_open_meteo, _met_norway):
        try:
            data = provider(key[0], key[1])
            break
        except requests.Timeout:
            errors.append("timeout")
        except Exception as exc:  # try the next provider
            errors.append(str(exc)[:80] or type(exc).__name__)
    if data is None:
        logger.warning("All weather providers failed: %s", "; ".join(errors))
        if errors and all(e == "timeout" for e in errors):
            raise WeatherError("Weather service timed out", 504)
        raise WeatherError("Weather service is unavailable")

    with _lock:
        _cache[key] = (now, data)
    return {**data, "cached": False}


def clear_cache():
    with _lock:
        _cache.clear()
