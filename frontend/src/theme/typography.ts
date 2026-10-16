/**
 * TrustTrip Design System — Typography
 * Modern, readable platform typography with accessible weights and line heights.
 */

import { Platform } from "react-native";
import { colors } from "./colors";

const FONT_FAMILY = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

const FONT_FAMILY_MEDIUM = Platform.select({
  ios: "System",
  android: "sans-serif-medium",
  default: "System",
});

export const typography = {
  // Screen Titles (24–28 pt)
  displayLarge: {
    fontFamily: FONT_FAMILY,
    fontSize: 28,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  displayMedium: {
    fontFamily: FONT_FAMILY,
    fontSize: 26,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  displaySmall: {
    fontFamily: FONT_FAMILY,
    fontSize: 24,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 30,
  },

  // Section Headings (18–22 pt)
  h1: {
    fontFamily: FONT_FAMILY,
    fontSize: 26,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  h2: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 26,
  },
  h3: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: 17,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    lineHeight: 23,
  },
  h4: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: 15,
    fontWeight: "600" as const,
    color: colors.textPrimary,
    lineHeight: 21,
  },

  // Body Text (14–16 pt)
  bodyLg: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: "400" as const,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  body: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "400" as const,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  bodySm: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "400" as const,
    color: colors.textMuted,
    lineHeight: 18,
  },

  // UI Labels & Controls (13–15 pt)
  label: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: 14,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
  labelSm: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: 12,
    fontWeight: "600" as const,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  caption: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "400" as const,
    color: colors.textMuted,
    lineHeight: 16,
  },
  button: {
    fontFamily: FONT_FAMILY_MEDIUM,
    fontSize: 15,
    fontWeight: "600" as const,
    letterSpacing: 0.1,
  },
} as const;

export type TypographyType = typeof typography;
export default typography;
