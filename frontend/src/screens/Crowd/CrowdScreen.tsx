import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
} from "react-native";
import { useFocusEffect, useNavigation, type NavigationProp } from "@react-navigation/native";
import api from "../../config/api";
import locationService from "../../services/locationService";
import CosmicBackground from "../../components/common/CosmicBackground";
import AppIcon from "../../components/common/AppIcon";
import { useLocationContext } from "../../context/LocationContext";
import CustomBottomNav from "../../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../../theme";
import type {
  CrowdLocationApiResponse,
  CrowdLocationCardItem,
  CrowdStackParamList,
} from "./types";

const DEFAULT_PRECINCTS = [
  {
    name: "Gateway of India",
    current: 0,
    max: 500,
    percent: 0,
    level: "LOW",
    image: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=200&q=80",
  },
  {
    name: "Marine Drive",
    current: 120,
    max: 400,
    percent: 30,
    level: "MODERATE",
    image: "https://images.unsplash.com/photo-1567157577867-05ccb1388e66?w=200&q=80",
  },
  {
    name: "Colaba Causeway",
    current: 280,
    max: 300,
    percent: 93,
    level: "HIGH",
    image: "https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=200&q=80",
  },
  {
    name: "Juhu Beach",
    current: 150,
    max: 400,
    percent: 38,
    level: "MODERATE",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&q=80",
  },
  {
    name: "CST Station",
    current: 200,
    max: 800,
    percent: 25,
    level: "LOW",
    image: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=200&q=80",
  },
];

export default function CrowdMonitoringScreen() {
  const [locations, setLocations] = useState<any[]>(DEFAULT_PRECINCTS);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<NavigationProp<CrowdStackParamList>>();
  const { activeLocation } = useLocationContext();

  useEffect(() => {
    fetchLocations();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeLocation) {
        locationService.sendLocationToBackend({
          latitude: activeLocation.latitude,
          longitude: activeLocation.longitude,
          accuracy: activeLocation.accuracy,
        }).catch(() => {});
      }
    }, [activeLocation])
  );

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const res = await api.get<CrowdLocationApiResponse[]>("/crowd/locations");
      if (Array.isArray(res.data) && res.data.length > 0) {
        const mapped = res.data.map((r: CrowdLocationApiResponse, index: number) => ({
          name: r.location_name,
          current: r.crowd_count,
          max: r.capacity || 500,
          percent: r.occupancy_percentage || 0,
          level: r.crowd_status || "LOW",
          image: DEFAULT_PRECINCTS[index % DEFAULT_PRECINCTS.length].image,
          raw: r,
        }));
        setLocations(mapped);
      } else {
        setLocations(DEFAULT_PRECINCTS);
      }
    } catch {
      setLocations(DEFAULT_PRECINCTS);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (loc: any) => {
    if (loc.raw) {
      navigation.navigate("CrowdLocationDetail", { location: loc.raw });
    }
  };

  const getBadgeStyle = (level: string) => {
    const l = level.toUpperCase();
    if (l === "HIGH" || l === "OVERCROWDED") {
      return {
        bg: "rgba(255, 77, 94, 0.15)",
        text: colors.danger,
        label: "High",
      };
    }
    if (l === "MODERATE") {
      return {
        bg: "rgba(245, 158, 11, 0.15)",
        text: colors.warning,
        label: "Moderate",
      };
    }
    return {
      bg: "rgba(0, 194, 146, 0.15)",
      text: colors.primary,
      label: "Low",
    };
  };

  return (
    <CosmicBackground variant="dark">
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.8}
        >
          <AppIcon name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Crowd Density</Text>
          <Text style={styles.headerSubtitle}>Live tourist area status</Text>
        </View>
        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={() => navigation.navigate("CrowdMap")}
          activeOpacity={0.8}
        >
          <AppIcon name="expand-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchLocations}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* LOCATION SELECTOR */}
        <View style={styles.locationSelectorCard}>
          <AppIcon name="location-outline" size={16} color={colors.primary} />
          <Text style={styles.locationText} numberOfLines={1}>
            {activeLocation?.locality || activeLocation?.address || "Location not set"}
          </Text>
          <AppIcon name="chevron-down" size={16} color={colors.textSecondary} />
        </View>

        {/* LIST / MAP TOGGLE PILLS */}
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.toggleBtn, styles.toggleActive]}>
            <Text style={styles.toggleActiveText}>List View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => navigation.navigate("CrowdMap")}
          >
            <Text style={styles.toggleInactiveText}>Map View</Text>
          </TouchableOpacity>
        </View>

        {/* PRECINCTS LIST */}
        {locations.map((item, index) => {
          const badge = getBadgeStyle(item.level);
          return (
            <TouchableOpacity
              key={index}
              style={styles.precinctCard}
              onPress={() => openDetail(item)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: item.image }}
                style={styles.thumbnail}
                resizeMode="cover"
              />

              <View style={styles.infoCol}>
                <Text style={styles.placeName}>{item.name}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.metaCount}>{item.current} / {item.max}</Text>
                  <Text style={styles.metaPct}>{item.percent}%</Text>
                </View>
              </View>

              <View style={[styles.levelBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.levelBadgeText, { color: badge.text }]}>
                  {badge.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
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
    paddingTop: 16,
    paddingBottom: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 194, 146, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 194, 146, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  locationSelectorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    gap: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleActiveText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
  },
  toggleInactiveText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  precinctCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  infoCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  placeName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metaCount: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  metaPct: {
    fontSize: 12,
    color: "#64748B",
  },
  levelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
