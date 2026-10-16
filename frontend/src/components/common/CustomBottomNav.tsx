import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppIcon, { IconName } from "./AppIcon";
import { colors, radius, shadows } from "../../theme";

export type TabKey = "Home" | "Guide" | "SOS" | "MyComplaints" | "Activity" | "Profile";

interface CustomBottomNavProps {
  activeTab: TabKey;
  navigation: any;
}

interface TabItem {
  key: TabKey;
  label: string;
  iconActive: IconName;
  iconInactive: IconName;
  screen: string;
  isCenter?: boolean;
}

const TABS: TabItem[] = [
  { key: "Home", label: "Home", iconActive: "home", iconInactive: "home-outline", screen: "Home" },
  { key: "Guide", label: "Explore", iconActive: "compass", iconInactive: "compass-outline", screen: "Guide" },
  { key: "SOS", label: "SOS", iconActive: "alert-circle", iconInactive: "alert-circle-outline", screen: "SOS", isCenter: true },
  { key: "Activity", label: "Activity", iconActive: "document-text", iconInactive: "document-text-outline", screen: "Dashboard" },
  { key: "Profile", label: "Profile", iconActive: "person", iconInactive: "person-outline", screen: "Profile" },
];

export default function CustomBottomNav({ activeTab, navigation }: CustomBottomNavProps) {
  const handleTabPress = (tab: TabItem) => {
    if (activeTab === tab.key && tab.screen === "Home") return;
    navigation.navigate(tab.screen);
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.outerContainer, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      <View style={styles.navBar}>
        {TABS.map((tab) => {
          const isActive =
            activeTab === tab.key ||
            (tab.key === "Activity" && activeTab === "MyComplaints") ||
            (tab.key === "MyComplaints" && activeTab === "Activity");

          if (tab.isCenter) {
            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.85}
                onPress={() => handleTabPress(tab)}
                style={styles.centerButtonOuter}
              >
                <View style={styles.centerButtonInner}>
                  <AppIcon name="alert-circle" size={24} color={colors.white} />
                  <Text style={styles.centerLabel}>SOS</Text>
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.7}
              onPress={() => handleTabPress(tab)}
              style={styles.tabItem}
            >
              <View style={styles.iconContainer}>
                {isActive && <View style={styles.activeDot} />}
                <AppIcon
                  name={isActive ? tab.iconActive : tab.iconInactive}
                  size={20}
                  color={isActive ? colors.primary : colors.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.primary : colors.textMuted },
                  isActive && { fontWeight: "700" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    backgroundColor: "transparent",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    paddingHorizontal: 8,
    minWidth: 54,
  },
  iconContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    height: 24,
  },
  activeDot: {
    position: "absolute",
    top: -3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  centerButtonOuter: {
    top: -14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  centerButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  centerLabel: {
    color: colors.white,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginTop: -2,
  },
});
