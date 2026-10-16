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


def get_current_weather(lat: float, lon: float) -> Dict[str, Any]:
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise WeatherError("Invalid coordinates", 400)
    key = (round(lat, 2), round(lon, 2))
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL_SECONDS:
            return {**hit[1], "cached": True}

    try:
        resp = requests.get(
            _base_url(),
            params={
                "latitude": key[0], "longitude": key[1], "timezone": "auto",
                "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
            },
            timeout=8,
        )
        resp.raise_for_status()
        cur = (resp.json() or {}).get("current") or {}
    except requests.Timeout:
        raise WeatherError("Weather service timed out", 504)
    except Exception as exc:
        logger.warning("Weather provider error: %s", type(exc).__name__)
        raise WeatherError("Weather service is unavailable")

    if cur.get("temperature_2m") is None:
        raise WeatherError("Weather service returned no data")
    code = int(cur.get("weather_code") or 0)
    label, icon = WMO.get(code, ("Unknown", "cloudy"))
    data = {
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
    with _lock:
        _cache[key] = (now, data)
    return {**data, "cached": False}


def clear_cache():
    with _lock:
        _cache.clear()
