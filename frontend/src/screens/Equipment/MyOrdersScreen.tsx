import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
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

type Order = {
  id: number;
  name: string;
  quantity: number;
  total_price: number;
  status: string;
  created_at: string;
  payment_method?: string;
  payment_status?: string;
};

const isCod = (o: Order) =>
  (o.payment_method || "").toUpperCase() === "COD" || (o.status || "").toUpperCase().includes("COD");

export default function MyOrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<any>();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const user = await AsyncStorage.getItem("user");
      const parsed = JSON.parse(user || "{}");
      const userId = parsed.id || parsed.user_id;

      if (!userId) {
        setLoading(false);
        return;
      }

      const res = await api.get(`/user-orders/${userId}`);
      if (Array.isArray(res.data)) {
        setOrders(res.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getStatusType = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("delivered") || s.includes("paid") || s.includes("captured")) return "ready";
    if (s.includes("cancel") || s.includes("fail")) return "danger";
    return "moderate";
  };

  return (
    <CosmicBackground>
      <ScreenHeader
        title="My Gear Orders"
        subtitle="Active reservations & delivery tracking"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={() => navigation.navigate("Equipment")}
          >
            <AppIcon name="add" size={16} color={colors.white} />
            <Text style={styles.browseBtnText}>Order Gear</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadOrders}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyCard}>
              <AppIcon name="cube-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No Orders Yet</Text>
              <Text style={styles.emptyDesc}>
                Order verified tourist safety equipment. Pay online or with cash on delivery.
              </Text>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => navigation.navigate("Equipment")}
              >
                <Text style={styles.exploreBtnText}>Browse Safety Equipment</Text>
              </TouchableOpacity>
            </SurfaceCard>
          }
          renderItem={({ item }) => (
            <SurfaceCard style={styles.orderCard} variant="elevated">
              <View style={styles.orderTopRow}>
                <View style={styles.orderIconWrap}>
                  <AppIcon name="cube" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={typography.h4}>{item.name}</Text>
                  <Text style={styles.orderDate}>
                    {formatDate(item.created_at)} · {isCod(item) ? "Cash on Delivery" : "Paid online"}
                  </Text>
                </View>
                <StatusBadge
                  label={item.status || "CONFIRMED"}
                  status={getStatusType(item.status)}
                />
              </View>

              <View style={styles.orderMetaRow}>
                <View>
                  <Text style={styles.metaLabel}>QUANTITY</Text>
                  <Text style={styles.metaValue}>{item.quantity || 1} units</Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>ORDER ID</Text>
                  <Text style={styles.metaValue}>#{item.id}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.metaLabel}>{isCod(item) ? "PAY ON DELIVERY" : "TOTAL PAID"}</Text>
                  <Text style={[styles.metaValue, { color: colors.primary }]}>
                    ₹{Number(item.total_price || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            </SurfaceCard>
          )}
        />
      </View>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="Home" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 8,
  },
  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    gap: 4,
  },
  browseBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.white,
  },
  listContent: {
    paddingBottom: 32,
  },
  orderCard: {
    padding: 16,
    marginBottom: 12,
  },
  orderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  orderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  orderDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  orderMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  metaValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    marginTop: 2,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
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
  exploreBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  exploreBtnText: {
    ...typography.caption,
    fontWeight: "800",
    color: colors.white,
  },
});
