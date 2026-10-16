import React, { ReactNode } from "react";
import { View, StyleSheet, StatusBar, StyleProp, ViewStyle } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";

interface ScreenCanvasProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Kept for backwards compatibility; every screen now uses the light canvas. */
  variant?: "dark" | "light";
  showAtmosphericGlow?: boolean;
  /** Safe-area edges to pad. Bottom is left to CustomBottomNav / footers by default. */
  edges?: Edge[];
}

const CANVAS = "#F8FAFC";

/**
 * TrustTrip Screen Canvas Container
 * One light canvas (#F8FAFC) for every screen so the white cards and dark typography
 * of the design system stay readable (the old dark canvas hid dark headings and the
 * white cards hid white text). Uses react-native-safe-area-context so content clears
 * the status bar and notches on Android as well as iOS.
 */
export default function CosmicBackground({
  children,
  style,
  edges = ["top", "left", "right"],
}: ScreenCanvasProps) {
  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, style]}>
      <StatusBar barStyle="dark-content" backgroundColor={CANVAS} translucent={false} />
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
}

export const ScreenCanvas = CosmicBackground;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CANVAS,
  },
  container: {
    flex: 1,
    backgroundColor: CANVAS,
  },
});
