/**
 * LocationContext.tsx
 * Single source of truth for location across TrustTrip.
 * Supports:
 * - Automatic GPS location detection
 * - Manual location selection with persistence across app restarts
 * - Non-blocking fallback ("Couldn't detect your location" with Try Again / Enter Location Manually)
 * - Safe state management without technical Alert crashes
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import locationService from '../services/locationService';
import type {
  ActiveLocation,
  LocationCoordinates,
  GpsStatusMode,
  LocationPermissionState,
  LocationType,
} from '../services/types';

export type FallbackReason =
  | 'permission_denied'
  | 'gps_disabled'
  | 'unavailable'
  | 'network_failure'
  | null;

interface LocationContextValue {
  activeLocation: ActiveLocation | null;
  locationType: LocationType;
  gpsStatus: GpsStatusMode;
  isDetecting: boolean;
  isManual: boolean;
  manualLocation: ActiveLocation | null;
  gpsCoordinates: LocationCoordinates | null;
  permissionState: LocationPermissionState;
  fallbackVisible: boolean;
  fallbackReason: FallbackReason;
  // Actions
  detectGpsLocation: (force?: boolean, showFallbackOnError?: boolean) => Promise<boolean>;
  retryGps: () => Promise<boolean>;
  setManualLocation: (loc: {
    latitude: number;
    longitude: number;
    name: string;
    address?: string;
  }) => Promise<void>;
  clearManualLocation: () => Promise<void>;
  openManualLocationSelection: () => void;
  continueWithoutLocation: () => void;
  showFallback: (reason?: FallbackReason) => void;
  dismissFallback: () => void;
  openSettings: () => Promise<void>;
}

const STORAGE_MANUAL_LOCATION_KEY = '@trusttrip_manual_location';
const STORAGE_LOCATION_MODE_KEY = '@trusttrip_location_mode';

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeLocation, setActiveLocation] = useState<ActiveLocation | null>(null);
  const [manualLocation, setManualLocationState] = useState<ActiveLocation | null>(null);
  const [gpsCoordinates, setGpsCoordinates] = useState<LocationCoordinates | null>(null);
  const [isManual, setIsManual] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatusMode>('SEARCHING');
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('not-requested');
  const [fallbackVisible, setFallbackVisible] = useState<boolean>(false);
  const [fallbackReason, setFallbackReason] = useState<FallbackReason>(null);
  const lastGeocodedRef = useRef<{ latitude: number; longitude: number } | null>(null);

  /**
   * Load saved manual location from AsyncStorage on startup
   */
  useEffect(() => {
    const initializeLocation = async () => {
      try {
        const [savedManual, savedMode] = await Promise.all([
          AsyncStorage.getItem(STORAGE_MANUAL_LOCATION_KEY),
          AsyncStorage.getItem(STORAGE_LOCATION_MODE_KEY),
        ]);

        if (savedManual) {
          const parsed = JSON.parse(savedManual);
          if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
            const manualLoc: ActiveLocation = {
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              name: parsed.name || 'Selected Location',
              address: parsed.address,
              source: 'MANUAL',
              timestamp: parsed.timestamp || Date.now(),
            };

            setManualLocationState(manualLoc);

            // Only restore a manual location the user explicitly chose; otherwise prefer live GPS
            if (savedMode === 'manual') {
              setActiveLocation(manualLoc);
              setIsManual(true);
              setGpsStatus('MANUAL');
              // Still check GPS status in background without overriding active location
              checkBackgroundGpsStatus();
              return;
            }
          }
        }

        // Default: Attempt automatic GPS detection silently (no intrusive popup on launch)
        await detectGpsLocation(false, false);
      } catch (err) {
        console.log('[LocationContext] Init error (non-fatal):', err);
        setGpsStatus('OFF');
      }
    };

    initializeLocation();
  }, []);

  /**
   * Background status check for GPS without affecting active manual selection
   */
  const checkBackgroundGpsStatus = async () => {
    try {
      const isEnabled = await locationService.isLocationServicesEnabled();
      if (!isEnabled) return;
      const perm = await locationService.getLocationPermissionState();
      setPermissionState(perm);
      if (perm === 'granted') {
        const coords = await locationService.getLastKnownLocation();
        if (coords) setGpsCoordinates(coords);
      }
    } catch {
      // Non-critical background check
    }
  };

  /**
   * Attempt GPS location detection.
   * Never throws blocking Alert dialogs or crashes.
   */
  const detectGpsLocation = useCallback(
    async (force: boolean = false, showFallbackOnError: boolean = true): Promise<boolean> => {
      setIsDetecting(true);
      setGpsStatus('SEARCHING');

      try {
        // 1. Check if device location services (GPS toggle) are ON
        const isEnabled = await locationService.isLocationServicesEnabled();
        if (!isEnabled) {
          setGpsStatus('OFF');
          setIsDetecting(false);
          if (showFallbackOnError && !isManual) {
            setFallbackReason('gps_disabled');
            setFallbackVisible(true);
          }
          return false;
        }

        // 2. Check & request permission
        let perm = await locationService.getLocationPermissionState();
        if (perm !== 'granted') {
          perm = await locationService.requestLocationPermission();
        }
        setPermissionState(perm);

        if (perm !== 'granted') {
          setGpsStatus('PERMISSION_DENIED');
          setIsDetecting(false);
          if (showFallbackOnError && !isManual) {
            setFallbackReason('permission_denied');
            setFallbackVisible(true);
          }
          return false;
        }

        // 3. Acquire GPS coordinates safely
        const coords = await locationService.getCurrentLocation();
        if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
          setGpsCoordinates(coords);

          // Get human-readable place name
          const rev = await locationService.reverseGeocodeCoords(coords.latitude, coords.longitude);
          lastGeocodedRef.current = { latitude: coords.latitude, longitude: coords.longitude };

          const gpsLoc: ActiveLocation = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            name: rev.name || 'Current GPS Location',
            address: rev.address,
            locality: rev.locality,
            source: 'GPS',
            accuracy: coords.accuracy,
            timestamp: Date.now(),
          };

          // If not explicitly set to manual or if forced, update active location
          if (force || !isManual) {
            setActiveLocation(gpsLoc);
            setIsManual(false);
            setGpsStatus('ACTIVE');
            await AsyncStorage.setItem(STORAGE_LOCATION_MODE_KEY, 'gps');
          } else {
            // Keep manual active, but record GPS status as active for easy toggle
            setGpsStatus('MANUAL');
          }

          setFallbackVisible(false);
          setFallbackReason(null);
          setIsDetecting(false);
          return true;
        }

        // 4. GPS couldn't acquire location
        setGpsStatus('ERROR');
        setIsDetecting(false);

        if (showFallbackOnError && !isManual) {
          setFallbackReason('unavailable');
          setFallbackVisible(true);
        }
        return false;
      } catch (error) {
        console.log('[LocationContext] detectGpsLocation error:', error);
        setGpsStatus('ERROR');
        setIsDetecting(false);

        if (showFallbackOnError && !isManual) {
          setFallbackReason('unavailable');
          setFallbackVisible(true);
        }
        return false;
      }
    },
    [isManual]
  );

  /**
   * Keep the GPS location live while the app is in GPS mode, so it stays exact as the
   * traveler moves (previously it was captured once at launch and went stale).
   */
  const trackingActive = !isManual && gpsStatus === 'ACTIVE';

  useEffect(() => {
    if (!trackingActive) return;

    const metersBetween = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
      const R = 6371000;
      const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
      const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const stop = locationService.watchLocation(
      async (coords) => {
        // Ignore very coarse fixes so a network-only reading doesn't replace a good GPS fix
        if ((coords.accuracy ?? 0) > 100) return;
        setGpsCoordinates(coords);

        let name: string | undefined;
        let address: string | undefined;
        let locality: string | undefined;
        const last = lastGeocodedRef.current;
        if (!last || metersBetween(last, coords) > 150) {
          lastGeocodedRef.current = { latitude: coords.latitude, longitude: coords.longitude };
          const rev = await locationService.reverseGeocodeCoords(coords.latitude, coords.longitude);
          name = rev.name;
          address = rev.address;
          locality = rev.locality;
        }

        setActiveLocation((prev) =>
          prev && prev.source === 'GPS'
            ? {
                ...prev,
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
                name: name ?? prev.name,
                address: address ?? prev.address,
                locality: locality ?? prev.locality,
                timestamp: Date.now(),
              }
            : prev
        );
      },
      () => {},
      { updateIntervalMs: 15000 }
    );

    return stop;
  }, [trackingActive]);

  /**
   * Set and persist manual location across all features
   */
  const setManualLocation = useCallback(
    async (loc: { latitude: number; longitude: number; name: string; address?: string }) => {
      const manualLoc: ActiveLocation = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        name: loc.name,
        address: loc.address,
        source: 'MANUAL',
        timestamp: Date.now(),
      };

      setManualLocationState(manualLoc);
      setActiveLocation(manualLoc);
      setIsManual(true);
      setGpsStatus('MANUAL');
      setFallbackVisible(false);
      setFallbackReason(null);

      try {
        await Promise.all([
          AsyncStorage.setItem(STORAGE_MANUAL_LOCATION_KEY, JSON.stringify(manualLoc)),
          AsyncStorage.setItem(STORAGE_LOCATION_MODE_KEY, 'manual'),
        ]);
      } catch (err) {
        console.log('[LocationContext] Error saving manual location:', err);
      }
    },
    []
  );

  /**
   * Reset / clear manual location and switch back to GPS
   */
  const clearManualLocation = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_MANUAL_LOCATION_KEY),
        AsyncStorage.setItem(STORAGE_LOCATION_MODE_KEY, 'gps'),
      ]);
    } catch (err) {
      console.log('[LocationContext] Error clearing manual location:', err);
    }

    setManualLocationState(null);
    setIsManual(false);

    // Re-detect GPS immediately
    await detectGpsLocation(true, true);
  }, [detectGpsLocation]);

  const retryGps = useCallback(async (): Promise<boolean> => {
    return await detectGpsLocation(true, true);
  }, [detectGpsLocation]);

  const showFallback = useCallback((reason: FallbackReason = 'unavailable') => {
    setFallbackReason(reason);
    setFallbackVisible(true);
  }, []);

  const dismissFallback = useCallback(() => {
    setFallbackVisible(false);
    setFallbackReason(null);
  }, []);

  const continueWithoutLocation = useCallback(() => {
    setFallbackVisible(false);
    setFallbackReason(null);
  }, []);

  const openManualLocationSelection = useCallback(() => {
    setFallbackVisible(false);
    setFallbackReason(null);
  }, []);

  const openSettings = useCallback(async () => {
    await locationService.openLocationSettings();
  }, []);

  const locationType: LocationType = !activeLocation
    ? 'none'
    : isManual || activeLocation.source === 'MANUAL'
    ? 'manual'
    : 'gps';

  return (
    <LocationContext.Provider
      value={{
        activeLocation,
        locationType,
        gpsStatus,
        isDetecting,
        isManual,
        manualLocation,
        gpsCoordinates,
        permissionState,
        fallbackVisible,
        fallbackReason,
        detectGpsLocation,
        retryGps,
        setManualLocation,
        clearManualLocation,
        openManualLocationSelection,
        continueWithoutLocation,
        showFallback,
        dismissFallback,
        openSettings,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocationContext = (): LocationContextValue => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocationContext must be used within a LocationProvider');
  }
  return context;
};

export default LocationContext;
