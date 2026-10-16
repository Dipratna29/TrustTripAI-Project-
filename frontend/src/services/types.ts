/**
 * Location-related type definitions
 */

/** Raw coordinates from device GPS */
export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

/** Location permission state */
export type LocationPermissionState =
  | 'not-requested'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'denied-forever';

/** Location tracking status */
export type LocationTrackingStatus =
  | 'idle'
  | 'requesting-permission'
  | 'permission-denied'
  | 'acquiring-location'
  | 'tracking'
  | 'error'
  | 'gps-disabled';

/** Backend response when location is sent */
export interface LocationUpdateResponse {
  success: boolean;
  message: string;
  insideGeofence?: boolean;
  locationId?: number;
  locationName?: string;
}

/** Configuration for location tracking */
export interface LocationTrackingConfig {
  updateIntervalMs: number; // milliseconds between location updates (e.g., 60000 = 60 seconds)
  foregroundTracking: boolean; // enable foreground tracking
  backgroundTracking: boolean; // enable background tracking (requires additional permissions)
}

/** Location tracking state */
export interface LocationTrackingState {
  status: LocationTrackingStatus;
  currentLocation: LocationCoordinates | null;
  permissionState: LocationPermissionState;
  lastUpdateTime: number | null;
  error: string | null;
  isTracking: boolean;
}

/** Authenticated user (from AsyncStorage) */
export interface AuthenticatedUser {
  id: number | string;
  username: string;
}

/** Location source identification */
export type LocationSource = 'GPS' | 'MANUAL' | 'NONE';

/** Normalized location type */
export type LocationType = 'gps' | 'manual' | 'none';

/** Comprehensive GPS status mode for UI indicators */
export type GpsStatusMode = 'ACTIVE' | 'SEARCHING' | 'OFF' | 'PERMISSION_DENIED' | 'ERROR' | 'MANUAL';

/** Active unified location used across all features in TrustTrip */
export interface ActiveLocation {
  latitude: number;
  longitude: number;
  name: string;
  address?: string;
  /** "City, State" for display, e.g. "Ichalkaranji, Maharashtra" */
  locality?: string;
  source: LocationSource;
  accuracy?: number | null;
  timestamp?: number;
}
