import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../config/api";
import CosmicBackground from "../components/common/CosmicBackground";
import AppIcon from "../components/common/AppIcon";
import CustomBottomNav from "../components/common/CustomBottomNav";
import { useLocationContext } from "../context/LocationContext";
import { colors, radius } from "../theme";

const { width } = Dimensions.get("window");
const QUICK_ACTION_WIDTH = (width - 40 - 20) / 3;

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [userName, setUserName] = useState("Divya");
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [activeSOS, setActiveSOS] = useState<any>(null);

  const {
    activeLocation,
    isManual,
    gpsStatus,
    isDetecting,
  } = useLocationContext();

  // SOS hold animation
  const sosHoldAnim = useRef(new Animated.Value(0)).current;
  const [holdingSOS, setHoldingSOS] = useState(false);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  useEffect(() => {
    loadUserProfile();
    checkSOSStatus();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserProfile();
      fetchUnreadCount();
      checkSOSStatus();
    }, [])
  );

  const fetchUnreadCount = async () => {
    try {
      const userStr = await AsyncStorage.getItem("user");
      if (!userStr) return;
      const user = JSON.parse(userStr);
      const uid = user.id || user.user_id;
      if (!uid) return;

      const res = await api.get("/api/notifications/unread-count", {
        params: { user_id: uid },
      });
      if (res.data && res.data.success) {
        setUnreadNotificationsCount(res.data.unread_count || 0);
      }
    } catch {
      // Clean fallback
    }
  };

  const loadUserProfile = async () => {
    try {
      const userStr = await AsyncStorage.getItem("user");
      if (!userStr) return;
      const user = JSON.parse(userStr);
      if (user.name) {
        setUserName(user.name.split(" ")[0]);
      } else if (user.username) {
        setUserName(user.username);
      }
    } catch {
      // Clean fallback
    }
  };

  const checkSOSStatus = async () => {
    try {
      const userStr = await AsyncStorage.getItem("user");
      if (!userStr) return;
      const user = JSON.parse(userStr);
      const uid = user.id || user.user_id;
      if (!uid) return;

      const res = await api.get(`/sos/status/${uid}`);
      if (res.data?.active_incident) {
        setActiveSOS(res.data.active_incident);
      } else {
        setActiveSOS(null);
      }
    } catch {
      setActiveSOS(null);
    }
  };

  const handleSosPressIn = () => {
    setHoldingSOS(true);
    Animated.timing(sosHoldAnim, {
      toValue: 1,
      duration: 1800,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        navigation.navigate("SOS");
      }
    });
  };

  const handleSosPressOut = () => {
    setHoldingSOS(false);
    Animated.timing(sosHoldAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  };

  return (
    <CosmicBackground variant="light">
      {/* 1. TOP HEADER & GREETING */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetingTitle}>
            {getGreeting()}, <Text style={styles.greetingName}>{userName}!</Text> 👋
          </Text>
          <Text style={styles.greetingSubtitle}>Stay safe on your journey.</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => navigation.navigate("Notifications")}
            accessibilityLabel="Notifications"
          >
            <AppIcon name="notifications-outline" size={20} color="#0F172A" />
            {unreadNotificationsCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => navigation.navigate("Profile")}
            accessibilityLabel="Profile"
          >
            <AppIcon name="person" size={18} color="#00C292" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ACTIVE SOS INCIDENT ALERT BANNER (IF ACTIVE) */}
        {activeSOS && (
          <TouchableOpacity
            style={styles.activeSosBanner}
            onPress={() => navigation.navigate("SOS")}
            activeOpacity={0.85}
          >
            <View style={styles.alertIconCircle}>
              <AppIcon name="alert-circle" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.activeSosTitle}>SOS Incident Active</Text>
              <Text style={styles.activeSosSubtitle} numberOfLines={1}>
                Incident #{activeSOS.id} • Responders alerted
              </Text>
            </View>
            <AppIcon name="chevron-forward" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* 2. CURRENT LOCATION CARD */}
        <TouchableOpacity
          style={styles.locationCard}
          onPress={() => navigation.navigate("SelectLocation")}
          activeOpacity={0.8}
        >
          <View style={styles.locationIconWrap}>
            <AppIcon
              name={isManual ? "pencil" : "location"}
              size={20}
              color="#00C292"
            />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.locationCardLabel}>Current Location</Text>
            <Text style={styles.locationCardValue} numberOfLines={1}>
              {activeLocation ? activeLocation.name : isDetecting ? "Detecting GPS..." : "Location unavailable"}
            </Text>
            <Text style={styles.locationCardRegion} numberOfLines={1}>
              {activeLocation?.locality ||
                activeLocation?.address ||
                (isManual ? "Manually selected destination" : "Tap to detect or choose your location")}
            </Text>
          </View>

          {activeLocation && !isManual && gpsStatus === "ACTIVE" ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveGreenDot} />
              <Text style={styles.liveBadgeText}>Live</Text>
            </View>
          ) : isManual ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>Manual</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {/* 3. THREE METRICS TILES (WEATHER, CROWD, SAFE STATUS) */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <AppIcon name="sunny" size={20} color="#F59E0B" />
            <Text style={styles.metricVal}>28°C</Text>
            <Text style={styles.metricSub}>Clear</Text>
          </View>

          <View style={styles.metricCard}>
            <AppIcon name="people" size={20} color="#00C292" />
            <Text style={styles.metricVal}>Low</Text>
            <Text style={styles.metricSub}>0% Crowd Level</Text>
          </View>

          <View style={styles.metricCard}>
            <AppIcon name="shield-checkmark" size={20} color="#00C292" />
            <Text style={styles.metricVal}>Safe</Text>
            <Text style={styles.metricSub}>Area Status</Text>
          </View>
        </View>

        {/* 4. EMERGENCY SOS ACTION BAR */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={handleSosPressIn}
          onPressOut={handleSosPressOut}
          onPress={() => navigation.navigate("SOS")}
          style={styles.sosBar}
        >
          <View style={styles.sosIconCircle}>
            <AppIcon name="alert-circle" size={22} color="#FF4D5E" />
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.sosTitle}>EMERGENCY SOS</Text>
            <Text style={styles.sosSubtitle}>
              {holdingSOS ? "Broadcasting Emergency Alert..." : "Hold for 2 seconds to alert"}
            </Text>
          </View>

          <AppIcon name="chevron-forward" size={18} color="#FFFFFF" />

          {/* Press-and-hold progress bar fill */}
          <Animated.View
            style={[
              styles.sosProgressFill,
              {
                width: sosHoldAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </TouchableOpacity>

        {/* 5. QUICK ACTIONS SECTION HEADER */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>

        {/* 6. QUICK ACTIONS 3x2 GRID */}
        <View style={styles.quickGrid}>
          {/* Safety Map */}
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("CrowdMap")}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#E6FBF5" }]}>
              <AppIcon name="map-outline" size={22} color="#00C292" />
            </View>
            <Text style={styles.actionLabel}>Safety Map</Text>
          </TouchableOpacity>

          {/* Women Safety */}
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("WomenSafety")}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#FDF2F8" }]}>
              <AppIcon name="heart-outline" size={22} color="#EC4899" />
            </View>
            <Text style={styles.actionLabel}>Women Safety</Text>
          </TouchableOpacity>

          {/* AI Assistant */}
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("ChatBot")}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#F5F3FF" }]}>
              <AppIcon name="sparkles-outline" size={22} color="#8B5CF6" />
            </View>
            <Text style={styles.actionLabel}>AI Assistant</Text>
          </TouchableOpacity>

          {/* Fair Prices */}
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("PriceCheck")}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#FFFBEB" }]}>
              <AppIcon name="pricetag-outline" size={22} color="#F59E0B" />
            </View>
            <Text style={styles.actionLabel}>Fair Prices</Text>
          </TouchableOpacity>

          {/* Local Guides */}
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Guide")}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#EFF6FF" }]}>
              <AppIcon name="compass-outline" size={22} color="#3B82F6" />
            </View>
            <Text style={styles.actionLabel}>Local Guides</Text>
          </TouchableOpacity>

          {/* Report Issue */}
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Complaint")}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIconBox, { backgroundColor: "#FEF2F2" }]}>
              <AppIcon name="chatbubble-ellipses-outline" size={22} color="#FF4D5E" />
            </View>
            <Text style={styles.actionLabel}>Report Issue</Text>
          </TouchableOpacity>
        </View>

        {/* 7. MORE TRAVEL SERVICES ROW */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>More Services</Text>
        </View>

        <View style={styles.moreServicesRow}>
          <TouchableOpacity
            style={styles.serviceChip}
            onPress={() => navigation.navigate("Equipment")}
            activeOpacity={0.8}
          >
            <AppIcon name="cube-outline" size={18} color="#00C292" />
            <Text style={styles.serviceChipText}>Safety Gear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.serviceChip}
            onPress={() => navigation.navigate("Language")}
            activeOpacity={0.8}
          >
            <AppIcon name="language-outline" size={18} color="#3B82F6" />
            <Text style={styles.serviceChipText}>Translator</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.serviceChip}
            onPress={() => navigation.navigate("Dashboard")}
            activeOpacity={0.8}
          >
            <AppIcon name="document-text-outline" size={18} color="#8B5CF6" />
            <Text style={styles.serviceChipText}>My Activity</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* PINNED BOTTOM NAVIGATION */}
      <CustomBottomNav activeTab="Home" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#F8FAFC",
  },
  greetingTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  greetingName: {
    color: "#00C292",
  },
  greetingSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  unreadBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#FF4D5E",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  unreadBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#00C292",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  activeSosBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF4D5E",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.card,
    marginBottom: 14,
    shadowColor: "#FF4D5E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  alertIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeSosTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  activeSosSubtitle: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.9)",
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  locationIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
  },
  locationCardLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  locationCardValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  locationCardRegion: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    gap: 4,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#10B981",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  metricVal: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 6,
  },
  metricSub: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  sosBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF4D5E",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#FF4D5E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  sosIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sosTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  sosSubtitle: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 2,
  },
  sosProgressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  actionCard: {
    width: QUICK_ACTION_WIDTH,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
    textAlign: "center",
  },
  moreServicesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  serviceChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  serviceChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
});
