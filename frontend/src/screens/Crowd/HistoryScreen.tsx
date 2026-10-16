import React, { useState } from "react";
import { useRoute, useNavigation, type RouteProp } from "@react-navigation/native";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import { StatusBadge } from "../../components/common/StatusIndicator";
import { colors, typography, radius, spacing } from "../../theme";
import type { CrowdLocationApiResponse, CrowdStackParamList } from "./types";

const { width } = Dimensions.get("window");
const TABS = ["Today", "24H", "7D"];

const PEAK_PERIODS = [
  { time: "11:00 AM - 01:00 PM", level: "HIGH", note: "Peak visitor arrival" },
  { time: "04:30 PM - 06:30 PM", level: "MODERATE", note: "Evening gathering" },
];

export default function HistoryScreen() {
  const route = useRoute<RouteProp<CrowdStackParamList, "CrowdHistory">>();
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState("Today");
  const location: CrowdLocationApiResponse | null = route.params?.location ?? null;

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Crowd History & Analytics"
        subtitle={location?.location_name ?? "Historical Density Radar"}
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* TIME FILTER TABS */}
        <View style={styles.tabsRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* SUMMARY CARD */}
        <SurfaceCard style={styles.summaryCard} variant="elevated">
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>AVERAGE DENSITY</Text>
              <Text style={styles.summaryValue}>Moderate</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>TYPICAL PEAK</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>12:30 PM</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>SAFE VISITING</Text>
              <Text style={[styles.summaryValue, { color: colors.cream }]}>08:00 AM</Text>
            </View>
          </View>
        </SurfaceCard>

        {/* KNOWN PEAK PERIODS */}
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>High Density Windows</Text>
        </View>

        {PEAK_PERIODS.map((period, idx) => (
          <SurfaceCard key={idx} style={styles.periodCard}>
            <View style={styles.periodRow}>
              <View style={styles.periodIconWrap}>
                <AppIcon name="time" size={18} color={period.level === "HIGH" ? colors.danger : colors.cream} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={typography.h4}>{period.time}</Text>
                <Text style={styles.periodNote}>{period.note}</Text>
              </View>
              <StatusBadge
                label={period.level}
                status={period.level === "HIGH" ? "danger" : "moderate"}
              />
            </View>
          </SurfaceCard>
        ))}
      </ScrollView>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 32,
  },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.pill,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  summaryCard: {
    padding: 18,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  summaryValue: {
    ...typography.h4,
    color: colors.textPrimary,
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  periodCard: {
    padding: 16,
    marginBottom: 10,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  periodIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${colors.primary}15`,
    alignItems: "center",
    justifyContent: "center",
  },
  periodNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
