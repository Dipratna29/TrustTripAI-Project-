import React, { useState, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from "react-native";
import api from "../../config/api";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import { StatusBadge } from "../../components/common/StatusIndicator";
import CustomBottomNav from "../../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../../theme";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - spacing.screenPadding * 2 - 12) / 2;

type Equipment = {
  id: number;
  name: string;
  price: number;
  status: string;
  current_stock?: number;
  inStock?: boolean;
};

export default function EquipmentScreen() {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState("");
  const [equipmentData, setEquipmentData] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const res = await api.get("/equipment");
      if (Array.isArray(res.data)) {
        // Backend reports stock via status/current_stock; derive the flag the cards use
        setEquipmentData(
          res.data.map((item: any) => ({
            ...item,
            inStock: item.status !== "OUT_OF_STOCK" && Number(item.current_stock ?? 1) > 0,
          }))
        );
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const filteredData = equipmentData.filter((item) =>
    (item.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Safety Gear & Equipment"
        subtitle="Certified personal protection & emergency tools"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.ordersHeaderBtn}
            onPress={() => navigation.navigate("MyOrders")}
          >
            <AppIcon name="cube" size={16} color={colors.primary} />
            <Text style={styles.ordersHeaderText}>My Orders</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <AppIcon name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search helmets, alarms, first aid..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <AppIcon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* GEAR GRID */}
        <FlatList
          data={filteredData}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchEquipment}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyCard}>
              <AppIcon name="cube-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No Equipment Found</Text>
              <Text style={styles.emptyDesc}>
                {search ? `No safety items matching "${search}".` : "Loading equipment inventory..."}
              </Text>
            </SurfaceCard>
          }
          renderItem={({ item }) => (
            <SurfaceCard
              style={styles.itemCard}
              variant="elevated"
              onPress={() => navigation.navigate("EquipmentDetails", { item })}
            >
              <View style={styles.itemTopRow}>
                <View style={styles.iconCircle}>
                  <AppIcon name="shield-checkmark" size={24} color={colors.primary} />
                </View>
                <StatusBadge
                  label={item.inStock === false ? "OOS" : "IN STOCK"}
                  status={item.inStock === false ? "danger" : "ready"}
                />
              </View>

              <Text style={styles.itemName} numberOfLines={2}>
                {item.name}
              </Text>

              <View style={styles.itemFooter}>
                <View>
                  <Text style={styles.priceLabel}>PRICE</Text>
                  <Text style={styles.priceValue}>₹{Number(item.price || 0).toFixed(2)}</Text>
                </View>
                <View style={styles.arrowCircle}>
                  <AppIcon name="arrow-forward" size={14} color={colors.white} />
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
  },
  ordersHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${colors.primary}18`,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    gap: 6,
  },
  ordersHeaderText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "800",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 10,
  },
  listContent: {
    paddingBottom: 90,
  },
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  itemCard: {
    width: CARD_WIDTH,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 194, 146, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    minHeight: 36,
  },
  itemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  priceLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.6,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#00C292",
    marginTop: 2,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#00C292",
    alignItems: "center",
    justifyContent: "center",
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
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
});
