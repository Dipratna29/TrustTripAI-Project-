/**
 * TrustTrip Design System — Border Radii
 * Clean, modern 10–16 pt curves.
 */

export const radius = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  card: 16,
  button: 14,
  input: 12,
  pill: 9999,
} as const;

export type RadiusType = typeof radius;
export default radius;
