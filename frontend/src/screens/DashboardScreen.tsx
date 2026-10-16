import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import api from "../config/api";
import CosmicBackground from "../components/common/CosmicBackground";
import AppIcon from "../components/common/AppIcon";
import CustomBottomNav from "../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../theme";

type Complaint = { id: number; category: string; status?: string; created_at: string };
type GuideShort = { g_id: number; name: string; rating: number; status: string };
type Order = { id: number; name: string; total_price: number; status: string };

export default function DashboardScreen() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [bookedGuides, setBookedGuides] = useState<GuideShort[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<any>();

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const userRaw = await AsyncStorage.getItem("user");
      if (!userRaw) {
        setLoading(false);
        return;
      }
      const user = JSON.parse(userRaw);
      const username = user.username;
      const user_id = user.id;

      const [complaintsRes, guidesRes, ordersRes] = await Promise.all([
        api.get(`/user-complaints/${username}`).catch(() => ({ data: [] })),
        api.get(`/guides`, { params: { username } }).catch(() => ({ data: [] })),
        api.get(`/user-orders/${user_id}`).catch(() => ({ data: [] })),
      ]);

      setComplaints(Array.isArray(complaintsRes.data) ? complaintsRes.data : []);

      const allGuides = Array.isArray(guidesRes.data) ? guidesRes.data : [];
      const booked = allGuides
        .filter((g: any) => g.booked_by_user)
        .map((g: any) => ({
          g_id: g.g_id,
          name: g.name,
          rating: Number(g.rating || 0),
          status: g.status || "CONFIRMED",
        }));
      setBookedGuides(booked);

      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  const hasActivity = complaints.length > 0 || orders.length > 0 || bookedGuides.length > 0;

  return (
    <CosmicBackground variant="dark">
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Activity & Explorer</Text>
          <Text style={styles.headerSubtitle}>Your travel records</Text>
        </View>
        <TouchableOpacity
          onPress={loadAll}
          style={styles.headerRefreshBtn}
          activeOpacity={0.8}
        >
          <AppIcon name="refresh-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* TOP 3 SUMMARY TILES */}
        <View style={styles.overviewGrid}>
          {/* Reports */}
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() => navigation.navigate("MyComplaints")}
            activeOpacity={0.8}
          >
            <AppIcon name="document-text-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.summaryLabel}>Reports</Text>
            <Text style={styles.summaryValue}>{complaints.length}</Text>
          </TouchableOpacity>

          {/* Orders */}
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() => navigation.navigate("MyOrders")}
            activeOpacity={0.8}
          >
            <AppIcon name="cube-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.summaryLabel}>Orders</Text>
            <Text style={styles.summaryValue}>{orders.length}</Text>
          </TouchableOpacity>

          {/* Guides */}
          <TouchableOpacity
            style={styles.summaryCard}
            onPress={() => navigation.navigate("Guide")}
            activeOpacity={0.8}
          >
            <AppIcon name="compass-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.summaryLabel}>Guides</Text>
            <Text style={styles.summaryValue}>{bookedGuides.length}</Text>
          </TouchableOpacity>
        </View>

        {/* RECENT ACTIVITY SECTION */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>

        {!hasActivity ? (
          /* EMPTY STATE CARD (EXACT MOCKUP MATCH) */
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <AppIcon name="document-text-outline" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>No recent activity</Text>
            <Text style={styles.emptySub}>Your travel activities will appear here.</Text>
            <TouchableOpacity
              style={styles.exploreBtn}
              onPress={() => navigation.navigate("Home")}
              activeOpacity={0.8}
            >
              <Text style={styles.exploreBtnText}>Explore Services</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ACTIVE LIST OF RECORDS */
          <View style={styles.activityListCard}>
            {complaints.slice(0, 3).map((item) => (
              <TouchableOpacity
                key={`c-${item.id}`}
                style={styles.activityItem}
                onPress={() => navigation.navigate("MyComplaints")}
                activeOpacity={0.7}
              >
                <View style={[styles.itemIconCircle, { backgroundColor: "rgba(0, 194, 146, 0.12)" }]}>
                  <AppIcon name="document-text" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.itemTitle}>{item.category || "Safety Report"}</Text>
                  <Text style={styles.itemSub}>Report #{item.id}</Text>
                </View>
                <View style={[styles.itemBadge, { backgroundColor: "rgba(0, 194, 146, 0.15)" }]}>
                  <Text style={[styles.itemBadgeText, { color: colors.primary }]}>
                    {item.status || "Pending"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {orders.slice(0, 3).map((item) => (
              <TouchableOpacity
                key={`o-${item.id}`}
                style={styles.activityItem}
                onPress={() => navigation.navigate("MyOrders")}
                activeOpacity={0.7}
              >
                <View style={[styles.itemIconCircle, { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}>
                  <AppIcon name="cube" size={18} color={colors.warning} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.itemTitle}>{item.name}</Text>
                  <Text style={styles.itemSub}>Order #{item.id} • ₹{item.total_price}</Text>
                </View>
                <View style={[styles.itemBadge, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
                  <Text style={[styles.itemBadgeText, { color: colors.warning }]}>
                    {item.status || "Paid"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.exploreBtnInner}
              onPress={() => navigation.navigate("Home")}
              activeOpacity={0.8}
            >
              <Text style={styles.exploreBtnText}>Explore Services</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="Activity" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerRefreshBtn: {
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
  overviewGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 22,
  },
  exploreBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
    width: "100%",
    alignItems: "center",
  },
  exploreBtnInner: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    alignItems: "center",
  },
  exploreBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.white,
  },
  activityListCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  itemIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  itemSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  itemBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  itemBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },

});