import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import api from "../config/api";
import CosmicBackground from "../components/common/CosmicBackground";
import SurfaceCard from "../components/common/SurfaceCard";
import ScreenHeader from "../components/common/ScreenHeader";
import AppIcon from "../components/common/AppIcon";
import { StatusBadge } from "../components/common/StatusIndicator";
import CustomBottomNav from "../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../theme";

const CATEGORY_OPTIONS = [
  { label: "Tourist Hub", value: "Tourist", mult: 1.5 },
  { label: "Municipal", value: "Municipal", mult: 1.0 },
  { label: "Highway", value: "Highway", mult: 1.3 },
  { label: "Rural", value: "Rural", mult: 0.8 },
];

export default function PriceCheckScreen() {
  const navigation = useNavigation<any>();
  const [category, setCategory] = useState("Tourist");
  const [prices, setPrices] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const res = await api.get("/prices");
      if (Array.isArray(res.data)) {
        setPrices(res.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const getMultiplier = () => {
    const opt = CATEGORY_OPTIONS.find((o) => o.value === category);
    return opt?.mult ?? 1.0;
  };

  const multiplier = getMultiplier();

  const filteredPrices = prices.filter((item) =>
    (item.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Fair Price Radar"
        subtitle="Transparent benchmarks to avoid tourist overpricing"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity onPress={fetchPrices} style={{ padding: 8 }}>
            <AppIcon name="refresh" size={18} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <AppIcon name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items: water, taxi, tea, food..."
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

        {/* REGIONAL ZONE FILTER */}
        <View style={styles.zoneFilterRow}>
          {CATEGORY_OPTIONS.map((opt) => {
            const isSel = category === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.zoneChip, isSel && styles.zoneChipActive]}
                onPress={() => setCategory(opt.value)}
              >
                <Text style={[styles.zoneText, isSel && styles.zoneTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* LIST */}
        <FlatList
          data={filteredPrices}
          keyExtractor={(item, index) => item.id ? String(item.id) : String(index)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchPrices}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyCard}>
              <AppIcon name="pricetag-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No Price Items</Text>
              <Text style={styles.emptyDesc}>No benchmarks found matching "{search}".</Text>
            </SurfaceCard>
          }
          renderItem={({ item }) => {
            const base = Number(item.price || item.base_price || 20);
            const calculated = Math.round(base * multiplier);

            return (
              <SurfaceCard style={styles.priceCard} variant="elevated">
                <View style={styles.itemRow}>
                  <View style={styles.iconWrap}>
                    <AppIcon name="pricetag" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={typography.h4}>{item.name}</Text>
                    <Text style={styles.baseText}>Base rate: ₹{base}</Text>
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.priceValue}>₹{calculated}</Text>
                    <Text style={styles.fairTag}>FAIR LIMIT</Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <StatusBadge label="VERIFIED BENCHMARK" status="ready" />
                  <Text style={styles.zoneNote}>Zone multiplier applied ({multiplier}x)</Text>
                </View>
              </SurfaceCard>
            );
          }}
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 10,
  },
  zoneFilterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  zoneChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  zoneText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 11,
  },
  zoneTextActive: {
    color: colors.white,
    fontWeight: "800",
  },
  listContent: {
    paddingBottom: 90,
  },
  priceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 194, 146, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  baseText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  priceCol: {
    alignItems: "flex-end",
  },
  priceValue: {
    color: "#00C292",
    fontSize: 20,
    fontWeight: "900",
  },
  fairTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    marginTop: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  zoneNote: {
    fontSize: 10,
    color: "#94A3B8",
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
