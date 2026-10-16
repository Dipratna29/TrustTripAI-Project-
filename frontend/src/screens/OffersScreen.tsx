import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import CosmicBackground from "../components/common/CosmicBackground";
import ScreenHeader from "../components/common/ScreenHeader";
import AppIcon from "../components/common/AppIcon";
import { fetchOffers, Offer } from "../services/placesService";
import { colors, radius, spacing } from "../theme";

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

const discountLabel = (d: Offer["discount"]) => {
  if (d === null || d === undefined || d === "") return null;
  const s = String(d).trim();
  return /^\d+(\.\d+)?$/.test(s) ? `${s}% OFF` : s;
};

/**
 * Partner offers from the backend /offers API (server returns only PUBLISHED offers whose
 * validity window includes today). TrustTrip's order system does not apply discounts, so offers
 * are informational and redeemed with the partner; nothing here claims a discount was applied.
 */
export default function OffersScreen() {
  const navigation = useNavigation<any>();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setOffers(await fetchOffers());
    } catch (err: any) {
      setError(err?.request && !err?.response ? "You're offline. Pull down to retry." : "Couldn't load offers right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderOffer = ({ item }: { item: Offer }) => {
    const discount = discountLabel(item.discount);
    const open = expanded === item.id;
    const endsSoon = item.days_left != null && item.days_left <= 3;
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => setExpanded(open ? null : item.id)}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" /> : null}
        <View style={styles.body}>
          <View style={styles.topRow}>
            {discount ? (
              <View style={styles.discount}>
                <Text style={styles.discountText}>{discount}</Text>
              </View>
            ) : null}
            {item.days_left != null ? (
              <Text style={[styles.validity, endsSoon && { color: colors.danger }]}>
                {item.days_left === 0 ? "Ends today" : `${item.days_left} day${item.days_left === 1 ? "" : "s"} left`}
              </Text>
            ) : null}
          </View>
          <Text style={styles.title}>{item.title}</Text>
          {item.vendor ? <Text style={styles.vendor}>by {item.vendor}</Text> : null}
          {item.description ? (
            <Text style={styles.desc} numberOfLines={open ? undefined : 2}>
              {item.description}
            </Text>
          ) : null}
          {open ? (
            <View style={styles.terms}>
              <Text style={styles.termsTitle}>Validity & terms</Text>
              <Text style={styles.termsText}>
                {formatDate(item.start_date) ? `From ${formatDate(item.start_date)} ` : ""}
                {formatDate(item.end_date) ? `until ${formatDate(item.end_date)}` : "No end date announced"}.
              </Text>
              <Text style={styles.termsText}>
                Show this offer to {item.vendor || "the partner"} to redeem. Discounts are applied by the partner, not
                automatically in TrustTrip orders. Partner terms apply.
              </Text>
            </View>
          ) : (
            <Text style={styles.more}>Tap for validity & terms</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <CosmicBackground>
      <ScreenHeader title="Special Offers" subtitle="Current deals from TrustTrip partners" showBack onBack={() => navigation.goBack()} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => String(o.id)}
          renderItem={renderOffer}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppIcon name="pricetag-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>{error ? "Offers unavailable" : "No active offers"}</Text>
              <Text style={styles.emptyText}>{error || "There are no partner offers running right now. Check back soon."}</Text>
              {error ? (
                <TouchableOpacity onPress={() => load()}>
                  <Text style={styles.retry}>Retry</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.screenPadding, paddingBottom: 32, gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  image: { width: "100%", height: 140, backgroundColor: colors.surfaceHighlight },
  body: { padding: 16 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  discount: { backgroundColor: colors.dangerSurface, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
  discountText: { color: colors.danger, fontWeight: "900", fontSize: 12 },
  validity: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  title: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  vendor: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  desc: { fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 19 },
  more: { fontSize: 11, color: colors.primary, fontWeight: "700", marginTop: 8 },
  terms: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: colors.lightBackground },
  termsTitle: { fontSize: 11, fontWeight: "800", color: colors.textPrimary, marginBottom: 4 },
  termsText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginTop: 2 },
  empty: { alignItems: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  retry: { fontSize: 13, fontWeight: "800", color: colors.primary, marginTop: 4 },
});
