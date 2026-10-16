import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import CosmicBackground from "../../components/common/CosmicBackground";
import AppIcon from "../../components/common/AppIcon";
import CustomBottomNav from "../../components/common/CustomBottomNav";
import { useLocationContext } from "../../context/LocationContext";
import { colors, radius } from "../../theme";

const TABS = ["Nearby", "Helplines", "Amenities"];

const FACILITIES = [
  {
    id: "1",
    name: "Women Safe Restroom",
    category: "Verified Amenity",
    distance: "0.4 km",
    available: true,
    icon: "shield-checkmark",
    iconBg: "rgba(0, 208, 156, 0.12)",
    iconColor: "#00C292",
    statusLabel: "Available",
    badgeBg: "rgba(0, 208, 156, 0.12)",
    badgeColor: "#00C292",
  },
  {
    id: "2",
    name: "Mother & Baby Care Room",
    category: "Comfort Station",
    distance: "0.8 km",
    available: true,
    icon: "heart",
    iconBg: "rgba(236, 72, 153, 0.12)",
    iconColor: "#EC4899",
    statusLabel: "Available",
    badgeBg: "rgba(0, 208, 156, 0.12)",
    badgeColor: "#00C292",
  },
  {
    id: "3",
    name: "Police Help Center",
    category: "24/7 Security",
    distance: "1.2 km",
    available: true,
    icon: "shield",
    iconBg: "rgba(59, 130, 246, 0.12)",
    iconColor: "#3B82F6",
    statusLabel: "On Duty",
    badgeBg: "rgba(59, 130, 246, 0.12)",
    badgeColor: "#3B82F6",
  },
  {
    id: "4",
    name: "Safe Transport Zone",
    category: "Rest Station",
    distance: "1.5 km",
    available: true,
    icon: "car",
    iconBg: "rgba(16, 185, 129, 0.12)",
    iconColor: "#10B981",
    statusLabel: "Available",
    badgeBg: "rgba(0, 208, 156, 0.12)",
    badgeColor: "#00C292",
  },
];

export default function WomenSafetyScreen() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState("Nearby");
  const { activeLocation } = useLocationContext();

  const callNumber = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  return (
    <CosmicBackground variant="dark">
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <AppIcon name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Women Safety</Text>
          <Text style={styles.headerSubtitle}>Safe spaces & helplines</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* LOCATION SELECTOR BAR */}
        <TouchableOpacity
          style={styles.locationBar}
          onPress={() => navigation.navigate("SelectLocation")}
          activeOpacity={0.8}
        >
          <AppIcon name="location-outline" size={16} color="#00C292" />
          <Text style={styles.locationText} numberOfLines={1}>
            {activeLocation ? activeLocation.locality || activeLocation.name : "Location not set"}
          </Text>
          <AppIcon name="chevron-down" size={16} color="#94A3B8" />
        </TouchableOpacity>

        {/* TABS ROW */}
        <View style={styles.tabsRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabChip, isActive && styles.tabChipActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 24/7 HELPLINES (IF ON HELPLINES TAB) */}
        {activeTab === "Helplines" && (
          <View style={styles.helplinesContainer}>
            <TouchableOpacity
              style={styles.helplineCard}
              onPress={() => callNumber("1091")}
              activeOpacity={0.85}
            >
              <View style={[styles.facilityIconCircle, { backgroundColor: "rgba(236, 72, 153, 0.12)" }]}>
                <AppIcon name="heart" size={20} color="#EC4899" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.facilityName}>1091 (Women Helpline)</Text>
                <Text style={styles.facilityDistance}>National 24/7 Rapid Response</Text>
              </View>
              <AppIcon name="call" size={18} color="#00C292" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.helplineCard}
              onPress={() => callNumber("112")}
              activeOpacity={0.85}
            >
              <View style={[styles.facilityIconCircle, { backgroundColor: "rgba(255, 77, 94, 0.12)" }]}>
                <AppIcon name="shield" size={20} color="#FF4D5E" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.facilityName}>112 (National Emergency)</Text>
                <Text style={styles.facilityDistance}>All-in-one Police & Ambulance</Text>
              </View>
              <AppIcon name="call" size={18} color="#FF4D5E" />
            </TouchableOpacity>
          </View>
        )}

        {/* FACILITIES LIST (WHITE CARDS AS IN MOCKUP) */}
        {activeTab !== "Helplines" && (
          <View style={styles.facilitiesList}>
            {FACILITIES.map((facility) => (
              <TouchableOpacity
                key={facility.id}
                style={styles.facilityCard}
                onPress={() => navigation.navigate("WomenSafetyDetail", { facility })}
                activeOpacity={0.85}
              >
                <View style={[styles.facilityIconCircle, { backgroundColor: facility.iconBg }]}>
                  <AppIcon name={facility.icon} size={22} color={facility.iconColor} />
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.facilityName}>{facility.name}</Text>
                  <Text style={styles.facilityDistance}>{facility.distance}</Text>
                </View>

                <View style={[styles.statusBadge, { backgroundColor: facility.badgeBg }]}>
                  <Text style={[styles.statusBadgeText, { color: facility.badgeColor }]}>
                    {facility.statusLabel}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="Home" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#0B1120",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 16,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#F8FAFC",
    marginLeft: 8,
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  tabChip: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  tabChipActive: {
    backgroundColor: "#00C292",
    borderColor: "#00C292",
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },
  tabChipTextActive: {
    color: "#FFFFFF",
  },
  facilitiesList: {
    gap: 12,
  },
  facilityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  facilityIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  facilityName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  facilityDistance: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  helplinesContainer: {
    gap: 12,
  },
  helplineCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
});
