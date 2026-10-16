import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../config/api";

export type Facility = {
  id: number;
  name: string;
  category: string;
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_verified: boolean;
  is_stale: boolean;
  updated_at?: string | null;
  distance_km?: number | null;
};

export type Weather = {
  temperature_c: number;
  feels_like_c: number;
  humidity?: number | null;
  wind_kph?: number | null;
  condition: string;
  icon: string;
  is_day: boolean;
  observed_at?: string;
  provider: string;
  fetchedAt: number;
  latitude: number;
  longitude: number;
};

export type Offer = {
  id: number;
  title: string;
  description?: string | null;
  discount?: string | number | null;
  vendor?: string | null;
  image_url?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  days_left?: number | null;
};

export const distanceKm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * Facilities are fetched without the traveler's coordinates; distance is computed on the phone
 * so the precise location never leaves the device for this feature.
 */
export async function fetchFacilities(origin?: { latitude: number; longitude: number } | null): Promise<Facility[]> {
  const res = await api.get("/facilities", { timeout: 15000 });
  const list: Facility[] = Array.isArray(res.data) ? res.data : [];
  const withDistance = list.map((f) => ({
    ...f,
    distance_km:
      origin && typeof f.latitude === "number" && typeof f.longitude === "number"
        ? distanceKm(origin.latitude, origin.longitude, f.latitude, f.longitude)
        : null,
  }));
  if (origin) withDistance.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  return withDistance;
}

const WEATHER_CACHE_KEY = "@trusttrip_weather";
const WEATHER_TTL_MS = 10 * 60 * 1000;

/** Live weather for the active location, cached for 10 minutes or until the traveler moves ~2 km. */
export async function fetchWeather(lat: number, lon: number, force = false): Promise<Weather> {
  if (!force) {
    try {
      const cached = JSON.parse((await AsyncStorage.getItem(WEATHER_CACHE_KEY)) || "null") as Weather | null;
      if (
        cached &&
        Date.now() - cached.fetchedAt < WEATHER_TTL_MS &&
        distanceKm(cached.latitude, cached.longitude, lat, lon) < 2
      ) {
        return cached;
      }
    } catch {
      // ignore cache errors
    }
  }
  // ~1 km precision is plenty for weather and avoids sending an exact position
  const res = await api.get("/weather", { params: { lat: lat.toFixed(2), lon: lon.toFixed(2) }, timeout: 15000 });
  if (!res.data?.success) throw new Error(res.data?.message || "Weather unavailable");
  const weather: Weather = { ...res.data, fetchedAt: Date.now(), latitude: lat, longitude: lon };
  AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather)).catch(() => {});
  return weather;
}

/** Last successful weather (shown, clearly timestamped, when offline). */
export async function getCachedWeather(): Promise<Weather | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(WEATHER_CACHE_KEY)) || "null");
  } catch {
    return null;
  }
}

export async function fetchOffers(): Promise<Offer[]> {
  const res = await api.get("/offers", { timeout: 15000 });
  return Array.isArray(res.data) ? res.data : [];
}
