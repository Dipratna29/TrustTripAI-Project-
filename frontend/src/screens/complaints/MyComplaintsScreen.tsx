import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import api from "../../config/api";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import { StatusBadge } from "../../components/common/StatusIndicator";
import CustomBottomNav from "../../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../../theme";

type Complaint = {
  id: number;
  category: string;
  description: string;
  latitude: string | number;
  longitude: string | number;
  status?: string;
  created_at: string;
};

const FILTERS = ["All", "Pending", "Resolved"];

export default function MyComplaintsScreen() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<any>();

  useEffect(() => {
    loadComplaints();
  }, []);

  const loadComplaints = async () => {
    setLoading(true);
    try {
      const user = await AsyncStorage.getItem("user");
      const parsed = JSON.parse(user || "{}");
      const username = parsed.username;
      const res = await api.get(`/user-complaints/${username}`);
      if (Array.isArray(res.data)) {
        setComplaints(res.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const filteredComplaints = complaints.filter((c) => {
    if (activeFilter === "All") return true;
    const s = (c.status || "pending").toLowerCase();
    if (activeFilter === "Pending") return s.includes("pending") || s.includes("progress");
    if (activeFilter === "Resolved") return s.includes("resolved");
    return true;
  });

  const formatDate = (dStr: string) => {
    try {
      const d = new Date(dStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dStr;
    }
  };

  const getStatusType = (status?: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("resolved")) return "ready";
    if (s.includes("reject")) return "danger";
    return "moderate";
  };

  return (
    <CosmicBackground>
      <ScreenHeader
        title="My Safety Reports"
        subtitle="Tracking resolution status with authorities"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.newReportBtn}
            onPress={() => navigation.navigate("Complaint")}
          >
            <AppIcon name="add" size={16} color={colors.white} />
            <Text style={styles.newReportBtnText}>New</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        {/* FILTER CHIPS */}
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* LIST */}
        <FlatList
          data={filteredComplaints}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadComplaints}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyCard}>
              <AppIcon name="document-text-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No Reports Found</Text>
              <Text style={styles.emptyDesc}>
                {activeFilter === "All"
                  ? "You haven't filed any safety reports yet."
                  : `No ${activeFilter.toLowerCase()} reports at this time.`}
              </Text>
              <TouchableOpacity
                style={styles.fileReportBtn}
                onPress={() => navigation.navigate("Complaint")}
              >
                <Text style={styles.fileReportBtnText}>File an Incident Report</Text>
              </TouchableOpacity>
            </SurfaceCard>
          }
          renderItem={({ item }) => (
            <SurfaceCard style={styles.card} variant="elevated">
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.h4}>{item.category}</Text>
                  <Text style={styles.dateText}>Filed on {formatDate(item.created_at)}</Text>
                </View>
                <StatusBadge
                  label={item.status || "PENDING"}
                  status={getStatusType(item.status)}
                />
              </View>

              <Text style={styles.descriptionText} numberOfLines={3}>
                {item.description}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.ticketNum}>Incident #{item.id}</Text>
                {item.latitude && (
                  <View style={styles.locBadge}>
                    <AppIcon name="location-outline" size={12} color={colors.primary} />
                    <Text style={styles.locText}>GPS Attached</Text>
                  </View>
                )}
              </View>
            </SurfaceCard>
          )}
        />
      </View>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="MyComplaints" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  newReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    gap: 4,
  },
  newReportBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.white,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 12,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  filterTextActive: {
    color: colors.white,
    fontWeight: "800",
  },
  listContent: {
    paddingBottom: 32,
  },
  card: {
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  dateText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  descriptionText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ticketNum: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  locBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "600",
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 8,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 8,
  },
  emptyDesc: {
    ...typography.bodySm,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
  fileReportBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  fileReportBtnText: {
    ...typography.caption,
    fontWeight: "800",
    color: colors.white,
  },
});
