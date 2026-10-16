/**
 * Location Service
 * Handles GPS location tracking, manual geocoding, and communication with backend.
 * Production-ready: never crashes or blocks UI on GPS failure.
 */

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../config/api';
import type {
  LocationCoordinates,
  LocationPermissionState,
  LocationUpdateResponse,
  LocationTrackingConfig,
  ActiveLocation,
} from './types';
import { POPULAR_TRAVEL_LOCATIONS, CuratedLocation } from './locationConstants';

// Default configuration
const DEFAULT_CONFIG: LocationTrackingConfig = {
  updateIntervalMs: 60000, // 60 seconds between updates
  foregroundTracking: true,
  backgroundTracking: false,
};

/**
 * Check if system location services (GPS) are enabled on the device
 */
export const isLocationServicesEnabled = async (): Promise<boolean> => {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch (error) {
    console.log('[LocationService] hasServicesEnabledAsync check error:', error);
    return false;
  }
};

/**
 * Get current permission state
 */
export const getLocationPermissionState = async (): Promise<LocationPermissionState> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();

    if (status === 'granted') {
      return 'granted';
    } else if (status === 'denied') {
      return 'denied';
    } else if (status === 'undetermined') {
      return 'not-requested';
    }

    return 'denied-forever';
  } catch (error) {
    console.log('[LocationService] Error checking location permission:', error);
    return 'denied';
  }
};

/**
 * Request foreground location permission
 */
export const requestLocationPermission = async (): Promise<LocationPermissionState> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status === 'granted') {
      return 'granted';
    } else if (status === 'denied') {
      return 'denied';
    }

    return 'denied-forever';
  } catch (error) {
    console.log('[LocationService] Error requesting location permission:', error);
    return 'denied';
  }
};

/**
 * Get last known GPS coordinates (fast, low battery, instant fallback)
 */
export const getLastKnownLocation = async (): Promise<LocationCoordinates | null> => {
  try {
    const location = await Location.getLastKnownPositionAsync();
    if (!location) return null;

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      altitude: location.coords.altitude,
      altitudeAccuracy: location.coords.altitudeAccuracy ?? null,
      heading: location.coords.heading,
      speed: location.coords.speed,
    };
  } catch (error) {
    console.log('[LocationService] Error getting last known location (non-fatal):', error);
    return null;
  }
};

const toCoords = (location: Location.LocationObject): LocationCoordinates => ({
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  accuracy: location.coords.accuracy,
  altitude: location.coords.altitude,
  altitudeAccuracy: location.coords.altitudeAccuracy ?? null,
  heading: location.coords.heading,
  speed: location.coords.speed,
});

/** Target accuracy (meters) at which we stop sampling and accept the fix. */
const TARGET_ACCURACY_M = 20;
/** How long to keep refining a fix before returning the best sample. */
const PRECISE_FIX_TIMEOUT_MS = 12000;
/** A cached fix younger than this and at least this accurate is good enough to use immediately. */
const FRESH_FIX_MAX_AGE_MS = 30000;

/**
 * On Android, ask the user to switch on Google "Location Accuracy" (Wi-Fi + cell assisted GPS).
 * Without it the device often reports coarse, network-only positions hundreds of meters off.
 */
let highAccuracyPrompted = false;
const ensureHighAccuracyMode = async () => {
  if (Platform.OS !== 'android' || highAccuracyPrompted) return;
  highAccuracyPrompted = true; // ask at most once per app session
  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    // User declined - continue with GPS only
  }
};

/**
 * Sample high-accuracy positions for a few seconds and return the most accurate one.
 * A single getCurrentPositionAsync call frequently returns the first (coarse) fix.
 */
const getPreciseFix = (): Promise<LocationCoordinates | null> =>
  new Promise((resolve) => {
    let best: LocationCoordinates | null = null;
    let subscription: Location.LocationSubscription | null = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      resolve(best);
    };

    const timer = setTimeout(finish, PRECISE_FIX_TIMEOUT_MS);

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (location) => {
        const coords = toCoords(location);
        if (!best || (coords.accuracy ?? Infinity) < (best.accuracy ?? Infinity)) best = coords;
        if ((coords.accuracy ?? Infinity) <= TARGET_ACCURACY_M) finish();
      }
    )
      .then((sub) => {
        subscription = sub;
        if (settled) sub.remove();
      })
      .catch((error) => {
        console.log('[LocationService] precise fix watch error:', error);
        finish();
      });
  });

/**
 * Get current GPS coordinates safely and as precisely as the device allows.
 * Never throws blocking errors, never hangs, and never returns fake coordinates.
 */
export const getCurrentLocation = async (): Promise<LocationCoordinates | null> => {
  try {
    // 1. Check if device location services are turned on
    const isEnabled = await isLocationServicesEnabled();
    if (!isEnabled) {
      console.log('[LocationService] Location services disabled on device.');
      return null;
    }

    // 2. Check permission
    const permission = await getLocationPermissionState();
    if (permission !== 'granted') {
      console.log('[LocationService] Location permission not granted:', permission);
      return null;
    }

    await ensureHighAccuracyMode();

    // 3. A very recent, accurate cached fix can be used immediately
    try {
      const cached = await Location.getLastKnownPositionAsync({
        maxAge: FRESH_FIX_MAX_AGE_MS,
        requiredAccuracy: TARGET_ACCURACY_M,
      });
      if (cached) return toCoords(cached);
    } catch {
      // ignore - fall through to a live fix
    }

    // 4. Refine a live high-accuracy fix (returns the best sample within the time budget)
    const precise = await getPreciseFix();
    if (precise) return precise;

    // 5. Last resort: one-shot high accuracy read, then any last known position
    try {
      const single = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (single) return toCoords(single);
    } catch {
      // ignore
    }
    return await getLastKnownLocation();
  } catch (error) {
    console.log('[LocationService] getCurrentLocation non-fatal notice, trying last known position:', error);
    return await getLastKnownLocation();
  }
};

/**
 * Watch location changes (for continuous tracking)
 */
export const watchLocation = (
  onLocationChange: (coords: LocationCoordinates) => void,
  onError: (error: Error) => void,
  config: Partial<LocationTrackingConfig> = {}
): (() => void) => {
  const settings = { ...DEFAULT_CONFIG, ...config };
  let unsubscribeFn: (() => void) | null = null;
  let cancelled = false;

  Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: settings.updateIntervalMs,
      distanceInterval: 10,
    },
    (location) => {
      onLocationChange(toCoords(location));
    }
  )
    .then((subscription) => {
      // Caller may have unsubscribed before the watch finished starting
      if (cancelled) subscription.remove();
      else unsubscribeFn = () => subscription.remove();
    })
    .catch((error) => {
      console.log('[LocationService] watchLocation notice:', error);
      onError(error instanceof Error ? error : new Error(String(error)));
    });

  return () => {
    cancelled = true;
    if (unsubscribeFn) {
      unsubscribeFn();
    }
  };
};

export type ReverseGeocodeResult = { name: string; address: string; locality?: string };

// Google "plus codes" (e.g. PCFP+6Q4) are returned as place names on Android; they are not human readable
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/i;
const isMeaningfulName = (value?: string | null) =>
  !!value && !/^[0-9\s/-]+$/.test(value) && !PLUS_CODE.test(value.trim());

const joinLocality = (city?: string | null, region?: string | null) =>
  [city, region].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ') || undefined;

/**
 * Free OpenStreetMap reverse geocoder, used when the device geocoder fails or returns no city
 * (common on Android devices/emulators without Google Play geocoding).
 */
const reverseGeocodeOsm = async (latitude: number, longitude: number): Promise<ReverseGeocodeResult | null> => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1&accept-language=en`;
    const res = await fetch(url, { headers: { 'User-Agent': 'TrustTrip/1.0 (travel safety app)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.suburb || a.county;
    const region = a.state;
    const name = a.road || a.neighbourhood || a.suburb || city || 'Current Location';
    const address = [a.road, a.neighbourhood || a.suburb, city, region, a.postcode].filter(Boolean).join(', ');
    return { name, address: address || data?.display_name || '', locality: joinLocality(city, region) };
  } catch {
    return null;
  }
};

/**
 * Reverse geocode coordinates to get a clean human-readable name, address and "City, State"
 */
export const reverseGeocodeCoords = async (
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> => {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const place = results[0];
      const parts: string[] = [];

      const meaningfulName = isMeaningfulName(place.name) ? place.name : null;
      if (meaningfulName && meaningfulName !== place.street) parts.push(meaningfulName);
      if (place.street) parts.push(place.streetNumber ? `${place.streetNumber} ${place.street}` : place.street);
      if (place.district || place.subregion) parts.push(place.district || place.subregion || '');
      if (place.city) parts.push(place.city);
      if (place.region) parts.push(place.region);
      if (place.postalCode) parts.push(place.postalCode);

      const city = place.city || place.subregion || place.district;
      const locality = joinLocality(city, place.region);

      // Device geocoder gave no usable city: prefer OpenStreetMap's answer
      if (!place.city) {
        const osm = await reverseGeocodeOsm(latitude, longitude);
        if (osm?.locality) return osm;
      }

      const cleanParts = parts.filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
      const name = meaningfulName || place.street || place.district || place.city || 'Current Location';
      const address = cleanParts.length > 0 ? cleanParts.join(', ') : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      return { name, address, locality };
    }
  } catch (error) {
    console.log('[LocationService] reverseGeocode non-critical notice:', error);
  }

  const osm = await reverseGeocodeOsm(latitude, longitude);
  if (osm) return osm;

  // Fallback to match curated locations or coordinates string
  const matched = POPULAR_TRAVEL_LOCATIONS.find(
    (loc) => Math.abs(loc.latitude - latitude) < 0.05 && Math.abs(loc.longitude - longitude) < 0.05
  );

  if (matched) {
    return {
      name: matched.name,
      address: `${matched.area}, ${matched.city}, ${matched.state}`,
      locality: `${matched.city}, ${matched.state}`,
    };
  }

  return {
    name: 'Selected Location',
    address: `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`,
  };
};

export interface LocationSearchResult {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  latitude: number;
  longitude: number;
  isCurated?: boolean;
}

/**
 * Real geocoding search for city, area, landmark, or address
 * Never generates fake coordinates.
 */
export const searchLocations = async (query: string): Promise<LocationSearchResult[]> => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    // Return curated popular list
    return POPULAR_TRAVEL_LOCATIONS.map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: `${loc.area}, ${loc.city}, ${loc.state}`,
      city: loc.city,
      state: loc.state,
      latitude: loc.latitude,
      longitude: loc.longitude,
      isCurated: true,
    }));
  }

  const results: LocationSearchResult[] = [];

  // 1. Check curated directory for instant matches
  const curatedMatches = POPULAR_TRAVEL_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(trimmed) ||
      loc.area.toLowerCase().includes(trimmed) ||
      loc.city.toLowerCase().includes(trimmed) ||
      loc.state.toLowerCase().includes(trimmed)
  );

  for (const match of curatedMatches) {
    results.push({
      id: match.id,
      name: match.name,
      address: `${match.area}, ${match.city}, ${match.state}`,
      city: match.city,
      state: match.state,
      latitude: match.latitude,
      longitude: match.longitude,
      isCurated: true,
    });
  }

  // 2. Perform live geocoding using expo-location for arbitrary addresses or landmarks
  try {
    const geocoded = await Location.geocodeAsync(query);
    if (geocoded && geocoded.length > 0) {
      for (let i = 0; i < Math.min(geocoded.length, 5); i++) {
        const item = geocoded[i];
        if (
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number' &&
          item.latitude >= -90 &&
          item.latitude <= 90 &&
          item.longitude >= -180 &&
          item.longitude <= 180
        ) {
          // Check if already matched
          const exists = results.some(
            (r) => Math.abs(r.latitude - item.latitude) < 0.005 && Math.abs(r.longitude - item.longitude) < 0.005
          );

          if (!exists) {
            const rev = await reverseGeocodeCoords(item.latitude, item.longitude);
            results.push({
              id: `geo_${item.latitude.toFixed(4)}_${item.longitude.toFixed(4)}_${i}`,
              name: rev.name || query,
              address: rev.address || `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`,
              latitude: item.latitude,
              longitude: item.longitude,
              isCurated: false,
            });
          }
        }
      }
    }
  } catch (geoError) {
    console.log('[LocationService] Geocode search notice (non-fatal):', geoError);
  }

  return results;
};

/**
 * Send location to backend
 */
export const sendLocationToBackend = async (
  coordinates: { latitude: number; longitude: number; accuracy?: number | null }
): Promise<LocationUpdateResponse> => {
  try {
    const userStr = await AsyncStorage.getItem('user');
    if (!userStr) {
      return {
        success: false,
        message: 'User not authenticated',
      };
    }

    const user: any = JSON.parse(userStr);
    const userId = user.id || user.user_id;
    if (!userId) {
      return {
        success: false,
        message: 'Invalid user ID',
      };
    }

    const response = await api.post<LocationUpdateResponse>('/crowd/location-update', {
      user_id: userId,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracy: coordinates.accuracy ?? 15,
    });

    return response.data;
  } catch (error) {
    console.log('[LocationService] Error sending location to backend (non-critical):', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to send location: ${errorMessage}`,
    };
  }
};

/**
 * Complete location tracking flow:
 * 1. Check/request permission
 * 2. Get current location
 * 3. Send to backend
 */
export const trackAndSendLocation = async (
  config: Partial<LocationTrackingConfig> = {}
): Promise<{
  success: boolean;
  location: LocationCoordinates | null;
  backendResponse: LocationUpdateResponse | null;
  error: string | null;
}> => {
  try {
    const permissionState = await getLocationPermissionState();

    if (permissionState !== 'granted') {
      return {
        success: false,
        location: null,
        backendResponse: null,
        error: 'Location permission not granted',
      };
    }

    const location = await getCurrentLocation();

    if (!location) {
      return {
        success: false,
        location: null,
        backendResponse: null,
        error: 'Unable to detect location',
      };
    }

    const backendResponse = await sendLocationToBackend(location);

    return {
      success: backendResponse.success,
      location,
      backendResponse,
      error: backendResponse.success ? null : backendResponse.message,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      location: null,
      backendResponse: null,
      error: errorMessage,
    };
  }
};

export const openLocationSettings = async (): Promise<void> => {
  try {
    const { Linking } = require('react-native');
    await Linking.openSettings();
  } catch (error) {
    console.log('[LocationService] Error opening settings:', error);
  }
};

export default {
  isLocationServicesEnabled,
  getLocationPermissionState,
  requestLocationPermission,
  getCurrentLocation,
  getLastKnownLocation,
  watchLocation,
  reverseGeocodeCoords,
  searchLocations,
  sendLocationToBackend,
  trackAndSendLocation,
  openLocationSettings,
};
