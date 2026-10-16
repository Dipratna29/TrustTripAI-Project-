import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useRoute, useNavigation, type RouteProp } from "@react-navigation/native";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import { StatusBadge } from "../../components/common/StatusIndicator";
import { colors, typography, radius, spacing } from "../../theme";
import type { CrowdLocationApiResponse, CrowdStackParamList } from "./types";

const BAR_DATA = [0.35, 0.5, 0.65, 0.55, 0.75, 0.95];

export default function LocationDetailScreen() {
  const route = useRoute<RouteProp<CrowdStackParamList, "CrowdLocationDetail">>();
  const navigation = useNavigation<any>();
  const location: CrowdLocationApiResponse | null = route.params?.location ?? null;

  const getStatusType = (level?: string) => {
    if (level === "HIGH" || level === "VERY HIGH") return "danger";
    if (level === "MODERATE") return "moderate";
    return "ready";
  };

  const occupancy = location?.occupancy_percentage ?? 45;

  return (
    <CosmicBackground>
      <ScreenHeader
        title={location?.location_name ?? "Location Details"}
        subtitle="Detailed precinct capacity & peak hours"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => navigation.navigate("CrowdHistory", { location })}
          >
            <AppIcon name="time-outline" size={18} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* HERO STATUS CARD */}
        <SurfaceCard style={styles.heroCard} variant="elevated">
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>{location?.location_name ?? "Tourist Precinct"}</Text>
              <View style={styles.coordsRow}>
                <AppIcon name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.coordsText}>
                  Coordinates: {location?.latitude != null && location?.longitude != null ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : "Pending update"}
                </Text>
              </View>
            </View>
            <StatusBadge
              label={location?.crowd_status ?? "MODERATE"}
              status={getStatusType(location?.crowd_status)}
            />
          </View>

          <View style={styles.divider} />

          {/* CAPACITY METRICS */}
          <View style={styles.capacityGrid}>
            <View style={styles.capacityCol}>
              <Text style={styles.capacityLabel}>CURRENT CROWD</Text>
              <Text style={styles.capacityNum}>{location?.crowd_count ?? 120}</Text>
            </View>
            <View style={styles.capacityCol}>
              <Text style={styles.capacityLabel}>MAX CAPACITY</Text>
              <Text style={styles.capacityNum}>{location?.capacity ?? 250}</Text>
            </View>
            <View style={styles.capacityCol}>
              <Text style={styles.capacityLabel}>OCCUPANCY</Text>
              <Text style={[styles.capacityNum, { color: colors.primary }]}>{occupancy}%</Text>
            </View>
          </View>

          {/* PROGRESS BAR */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(occupancy, 100)}%`,
                  backgroundColor: occupancy >= 80 ? colors.danger : occupancy >= 50 ? colors.cream : colors.primary,
                },
              ]}
            />
          </View>
        </SurfaceCard>

        {/* HOURLY DENSITY PATTERN */}
        <SurfaceCard style={styles.chartCard}>
          <View style={styles.chartHeaderRow}>
            <Text style={typography.h4}>Hourly Density Pattern</Text>
            <Text style={styles.chartSub}>Today's Trend</Text>
          </View>

          <View style={styles.barsContainer}>
            {BAR_DATA.map((val, idx) => (
              <View key={idx} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barValue,
                      {
                        height: `${val * 100}%`,
                        backgroundColor: val >= 0.8 ? colors.danger : val >= 0.6 ? colors.cream : colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{`${10 + idx * 2}:00`}</Text>
              </View>
            ))}
          </View>
        </SurfaceCard>

        {/* SAFETY RECOMMENDATION */}
        <SurfaceCard style={styles.recommendationCard}>
          <View style={styles.recommendationRow}>
            <View style={styles.recommendationIconCircle}>
              <AppIcon name="shield-checkmark" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={typography.h4}>Guardian Recommendation</Text>
              <Text style={styles.recommendationText}>
                {occupancy >= 80
                  ? "High congestion. Travel with companion and safeguard personal belongings."
                  : "Moderate tourist presence. Normal safety precautions apply."}
              </Text>
            </View>
          </View>
        </SurfaceCard>
      </ScrollView>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  historyBtn: {
    padding: 8,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 32,
  },
  heroCard: {
    marginBottom: 16,
    padding: 18,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  locationTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  coordsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  coordsText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  capacityGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  capacityCol: {
    alignItems: "center",
  },
  capacityLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  capacityNum: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  chartCard: {
    marginBottom: 16,
    padding: 18,
  },
  chartHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  chartSub: {
    ...typography.caption,
    color: colors.textMuted,
  },
  barsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 120,
    paddingHorizontal: 8,
  },
  barCol: {
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
    flex: 1,
  },
  barTrack: {
    width: 20,
    height: 90,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barValue: {
    width: "100%",
    borderRadius: 6,
  },
  barLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 6,
  },
  recommendationCard: {
    padding: 16,
    borderColor: colors.primaryBorder,
  },
  recommendationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  recommendationIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.primaryGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  recommendationText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
});
