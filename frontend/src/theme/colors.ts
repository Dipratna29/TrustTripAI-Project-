/**
 * TrustTrip Design System — Color Palette
 * Matched precisely to the TrustTrip master UI mockup:
 * Primary: Vibrant Emerald Mint (#00C292)
 * SOS / Danger: Coral Red (#FF4D5E)
 * Light Canvas: (#F8FAFC)
 * Dark Canvas: Midnight Navy (#0B1120)
 * Card Surface: Pure White (#FFFFFF) & Dark Elevated (#1E293B)
 * Semantics: Success (#10B981), Warning (#F59E0B), Danger (#FF4D5E)
 */

export const colors = {
  // Backgrounds & Canvas
  background: "#0B1120",
  backgroundSecondary: "#0F172A",
  backgroundDeep: "#070B14",
  backgroundDark: "#0B1120",
  backgroundNavy: "#0B1120",
  lightBackground: "#F8FAFC",
  darkCanvas: "#0B1120",

  // Surfaces & Cards
  surface: "#FFFFFF", // High-contrast clean white card surfaces from mockup
  surfaceDark: "#131C2E",
  surfaceElevated: "#FFFFFF",
  surfaceHighlight: "#F1F5F9",
  surfaceGlass: "rgba(255, 255, 255, 0.96)",
  surfaceGlassElevated: "#FFFFFF",
  cardWhite: "#FFFFFF",
  cardBorderLight: "#E2E8F0",

  // Primary Brand: Vibrant Emerald Mint (from mockup)
  primary: "#00C292",
  primaryDark: "#00A87E",
  primaryLight: "#00E5AB",
  primaryGlow: "rgba(0, 194, 146, 0.15)",
  electricBlue: "#00C292",
  brightBlue: "#00C292",
  cyanGlow: "rgba(0, 194, 146, 0.2)",

  // Accent & Status
  accent: "#00C292",
  accentMint: "#00C292",
  accentSubtle: "rgba(0, 194, 146, 0.12)",
  cream: "#F59E0B",
  creamDark: "#D97706",
  creamSurface: "rgba(245, 158, 11, 0.12)",
  violet: "#8B5CF6",
  purple: "#8B5CF6",
  pink: "#EC4899",
  blue: "#3B82F6",
  lavenderGlow: "rgba(139, 92, 246, 0.15)",

  // Base Neutrals
  white: "#FFFFFF",
  black: "#000000",

  // Typography & Text
  textPrimary: "#0F172A", // Dark charcoal for white cards & light screens
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  textLight: "#F8FAFC", // Light text for dark canvas headers & banners
  textAccent: "#00C292",
  textInverse: "#FFFFFF",

  // Borders & Dividers
  border: "#E2E8F0",
  borderSubtle: "#F1F5F9",
  borderGlass: "#E2E8F0",
  primaryBorder: "rgba(0, 194, 146, 0.35)",
  borderGlow: "rgba(0, 194, 146, 0.25)",
  borderDanger: "rgba(255, 77, 94, 0.35)",

  // Status & Safety Semantics
  success: "#10B981",
  successSurface: "rgba(16, 185, 129, 0.12)",
  warning: "#F59E0B",
  warningSurface: "rgba(245, 158, 11, 0.12)",
  danger: "#FF4D5E", // Vibrant Coral Red from mockup
  dangerGlow: "#FF334B",
  dangerSurface: "rgba(255, 77, 94, 0.12)",
  info: "#38BDF8",
  infoSurface: "rgba(56, 189, 248, 0.12)",
} as const;

export type ColorsType = typeof colors;
export default colors;
