import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import CosmicBackground from "../../components/common/CosmicBackground";
import AppIcon from "../../components/common/AppIcon";
import { useLocationContext } from "../../context/LocationContext";
import { Facility, fetchFacilities } from "../../services/placesService";
import { colors, radius } from "../../theme";

type Tab = "Nearby" | "Helplines" | "All";
const TABS: Tab[] = ["Nearby", "Helplines", "All"];
const NEARBY_RADIUS_KM = 25;

const HELPLINES = [
  { number: "1091", title: "1091 · Women Helpline", sub: "National 24/7 women's helpline" },
  { number: "112", title: "112 · National Emergency", sub: "Police, ambulance and fire" },
  { number: "181", title: "181 · Women in Distress", sub: "State women's helpline (most states)" },
  { number: "1363", title: "1363 · Tourist Helpline", sub: "Ministry of Tourism, 24/7, multilingual" },
];

const iconFor = (category: string): { icon: string; color: string } => {
  const c = category.toLowerCase();
  if (c.includes("police")) return { icon: "shield", color: "#3B82F6" };
  if (c.includes("hospital") || c.includes("medical") || c.includes("pharm")) return { icon: "medkit", color: "#EF4444" };
  if (c.includes("women") || c.includes("safe")) return { icon: "shield-checkmark", color: "#00C292" };
  if (c.includes("tourist") || c.includes("info")) return { icon: "information-circle", color: "#8B5CF6" };
  return { icon: "location", color: "#64748B" };
};

const formatKm = (km?: number | null) => (km == null ? null : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

export default function WomenSafetyScreen() {
  const navigation = useNavigation<any>();
  const { activeLocation, isDetecting } = useLocationContext();
  const [tab, setTab] = useState<Tab>("Nearby");
  const [category, setCategory] = useState("All");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = activeLocation ? { latitude: activeLocation.latitude, longitude: activeLocation.longitude } : null;

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setFacilities(await fetchFacilities(origin));
      } catch (err: any) {
        setError(err?.request && !err?.response ? "You're offline. Helplines below still work." : "Couldn't load safety facilities.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [origin?.latitude, origin?.longitude]
  );

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(facilities.map((f) => f.category).filter(Boolean)))],
    [facilities]
  );

  const visible = useMemo(() => {
    let list = facilities;
    if (category !== "All") list = list.filter((f) => f.category === category);
    if (tab === "Nearby") list = list.filter((f) => f.distance_km != null && f.distance_km <= NEARBY_RADIUS_KM);
    return list;
  }, [facilities, category, tab]);

  const call = (number: string) => Linking.openURL(`tel:${number}`).catch(() => {});
  const navigateTo = (f: Facility) => {
    if (f.latitude == null || f.longitude == null) return;
    const dest = `${f.latitude},${f.longitude}`;
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(f.name)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    Linking.openURL(url).catch(() => {});
  };

  const renderFacility = (f: Facility) => {
    const { icon, color } = iconFor(f.category || "");
    const distance = formatKm(f.distance_km);
    return (
      <View key={f.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, { backgroundColor: `${color}1F` }]}>
            <AppIcon name={icon} size={20} color={color} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.name} numberOfLines={2}>{f.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {f.category}
              {distance ? ` · ${distance} away` : origin ? "" : " · set your location for distance"}
            </Text>
            {f.opening_hours ? <Text style={styles.meta}>Hours: {f.opening_hours}</Text> : null}
            {f.address ? <Text style={styles.meta} numberOfLines={2}>{f.address}</Text> : null}
          </View>
        </View>
        <View style={styles.badgesRow}>
          {f.is_verified ? (
            <View style={[styles.badge, { backgroundColor: "rgba(16,185,129,0.12)" }]}>
              <AppIcon name="checkmark-circle" size={12} color={colors.success} />
              <Text style={[styles.badgeText, { color: colors.success }]}>Verified by TrustTrip</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: "rgba(245,158,11,0.14)" }]}>
              <Text style={[styles.badgeText, { color: "#B45309" }]}>Unverified</Text>
            </View>
          )}
          {f.is_stale ? (
            <View style={[styles.badge, { backgroundColor: colors.surfaceHighlight }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>Info may be outdated</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {f.phone ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => call(f.phone!)}>
              <AppIcon name="call" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
          ) : null}
          {f.latitude != null && f.longitude != null ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => navigateTo(f)}>
              <AppIcon name="navigate-outline" size={14} color={colors.primary} />
              <Text style={styles.actionText}>Directions</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <CosmicBackground>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Back">
          <AppIcon name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Women Safety</Text>
          <Text style={styles.headerSubtitle}>Safe spaces, help points & helplines</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <TouchableOpacity style={styles.locationBar} onPress={() => navigation.navigate("SelectLocation")} activeOpacity={0.8}>
          <AppIcon name="location-outline" size={16} color={colors.primary} />
          <Text style={styles.locationText} numberOfLines={1}>
            {activeLocation
              ? activeLocation.locality || activeLocation.name
              : isDetecting
              ? "Detecting your location..."
              : "Location not set · tap to choose"}
          </Text>
          <AppIcon name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.tabsRow}>
          {TABS.map((t) => (
            <TouchableOpacity key={t} style={[styles.tabChip, tab === t && styles.tabChipActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabChipText, tab === t && styles.tabChipTextActive]}>
                {t === "Nearby" ? `Nearby (${NEARBY_RADIUS_KM} km)` : t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "Helplines" ? (
          <View style={{ gap: 12 }}>
            {HELPLINES.map((h) => (
              <TouchableOpacity key={h.number} style={styles.helpline} onPress={() => call(h.number)} activeOpacity={0.8}>
                <View style={[styles.iconCircle, { backgroundColor: "rgba(255,77,94,0.12)" }]}>
                  <AppIcon name="call" size={18} color={colors.danger} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.name}>{h.title}</Text>
                  <Text style={styles.meta}>{h.sub}</Text>
                </View>
                <AppIcon name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <>
            {categories.length > 2 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                {categories.map((c) => (
                  <TouchableOpacity key={c} style={[styles.catChip, category === c && styles.catChipActive]} onPress={() => setCategory(c)}>
                    <Text style={[styles.catText, category === c && styles.catTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            ) : error ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{error}</Text>
                <TouchableOpacity onPress={() => load()}>
                  <Text style={styles.retry}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : visible.length === 0 ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>
                  {tab === "Nearby" && origin ? `No listed facilities within ${NEARBY_RADIUS_KM} km` : "No facilities found"}
                </Text>
                <Text style={styles.noticeText}>
                  {tab === "Nearby" && !origin
                    ? "Set your location to see facilities near you."
                    : "TrustTrip hasn't verified safety facilities in this area yet. Use the helplines, which work everywhere in India."}
                </Text>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                  <TouchableOpacity onPress={() => setTab("Helplines")}>
                    <Text style={styles.retry}>Show helplines</Text>
                  </TouchableOpacity>
                  {tab === "Nearby" && facilities.length > 0 ? (
                    <TouchableOpacity onPress={() => setTab("All")}>
                      <Text style={styles.retry}>See all facilities</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={{ gap: 12 }}>{visible.map(renderFacility)}</View>
            )}
          </>
        )}
      </ScrollView>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  locationBar: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill,
    paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 14,
  },
  locationText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginLeft: 8 },
  tabsRow: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  tabChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabChipText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  tabChipTextActive: { color: colors.white },
  catRow: { gap: 8, paddingBottom: 12 },
  catChip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceHighlight },
  catChipActive: { backgroundColor: colors.textPrimary },
  catText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  catTextActive: { color: colors.white },
  card: {
    backgroundColor: colors.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  iconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
  badgeText: { fontSize: 10, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primaryBorder,
  },
  actionText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  helpline: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  notice: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 4 },
  noticeTitle: { fontSize: 14, fontWeight: "800", color: colors.textPrimary, marginBottom: 4 },
  noticeText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  retry: { fontSize: 13, fontWeight: "800", color: colors.primary, marginTop: 6 },
});
