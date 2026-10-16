import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import api from "../../config/api";
import CosmicBackground from "../../components/common/CosmicBackground";
import AppIcon from "../../components/common/AppIcon";
import LeafletMap, { LeafletMapHandle, MapMarker } from "../../components/map/LeafletMap";
import { useLocationContext } from "../../context/LocationContext";
import { colors } from "../../theme";
import type { CrowdLocationApiResponse, CrowdStatus } from "./types";

type Filter = "ALL" | "SAFE" | "MODERATE" | "CROWDED";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "SAFE", label: "Safe" },
  { key: "MODERATE", label: "Moderate" },
  { key: "CROWDED", label: "Crowded" },
];

const DEFAULT_CENTER = { latitude: 28.6139, longitude: 77.209 }; // New Delhi

const statusColor = (status?: CrowdStatus) => {
  switch (status) {
    case "OVERCROWDED":
    case "HIGH":
      return colors.danger;
    case "MODERATE":
      return colors.warning;
    default:
      return colors.success;
  }
};

const statusFilter = (status?: CrowdStatus): Filter =>
  status === "OVERCROWDED" || status === "HIGH" ? "CROWDED" : status === "MODERATE" ? "MODERATE" : "SAFE";

const distanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const formatDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export default function MapViewScreen() {
  const navigation = useNavigation<any>();
  const { height } = useWindowDimensions();
  const { activeLocation, gpsCoordinates } = useLocationContext();
  const mapRef = useRef<LeafletMapHandle>(null);

  const [locations, setLocations] = useState<CrowdLocationApiResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");

  const origin = activeLocation
    ? { latitude: activeLocation.latitude, longitude: activeLocation.longitude }
    : null;

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CrowdLocationApiResponse[]>("/crowd/locations");
      const valid = (Array.isArray(res.data) ? res.data : []).filter(
        (l) => typeof l.latitude === "number" && typeof l.longitude === "number"
      );
      setLocations(valid);
    } catch {
      setError("Couldn't load safety zones. Tap to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Visible list: search + filter, sorted by distance from the active location
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations
      .filter((l) => filter === "ALL" || statusFilter(l.crowd_status) === filter)
      .filter((l) => !q || l.location_name.toLowerCase().includes(q))
      .map((l) => ({ ...l, distance: origin ? distanceKm(origin, l) : null }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, filter, query, origin?.latitude, origin?.longitude]);

  const selected = visible.find((l) => l.location_id === selectedId) ?? null;
  const place = selected ?? visible[0] ?? null;

  const markers: MapMarker[] = visible.map((l) => ({
    id: l.location_id,
    latitude: l.latitude,
    longitude: l.longitude,
    title: l.location_name,
    subtitle: `${l.crowd_status ?? "LOW"} · ${l.crowd_count ?? 0}/${l.capacity ?? 0} people`,
    color: statusColor(l.crowd_status),
    radius: l.radius_meters,
  }));

  const center = selected
    ? { latitude: selected.latitude, longitude: selected.longitude }
    : origin ?? (visible[0] ? { latitude: visible[0].latitude, longitude: visible[0].longitude } : DEFAULT_CENTER);

  const openDirections = (loc: { latitude: number; longitude: number; location_name: string }) => {
    const dest = `${loc.latitude},${loc.longitude}`;
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(loc.location_name)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`;
    Linking.openURL(url).catch(() => {});
  };

  const counts = useMemo(() => {
    const c = { SAFE: 0, MODERATE: 0, CROWDED: 0 };
    locations.forEach((l) => {
      c[statusFilter(l.crowd_status) as keyof typeof c] += 1;
    });
    return c;
  }, [locations]);

  const placeColor = statusColor(place?.crowd_status);

  return (
    <CosmicBackground>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
          <AppIcon name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Safety Map</Text>
          <Text style={styles.headerSubtitle}>
            {counts.SAFE} safe · {counts.MODERATE} moderate · {counts.CROWDED} crowded
          </Text>
        </View>
        <TouchableOpacity style={styles.headerActionBtn} onPress={fetchLocations} activeOpacity={0.8}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <AppIcon name="refresh-outline" size={18} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchBarContainer}>
        <AppIcon name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search monitored places..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <AppIcon name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* FILTER PILLS */}
      <View style={styles.filterPillsRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => {
                setFilter(f.key);
                setSelectedId(null);
              }}
            >
              <Text style={active ? styles.filterPillActiveText : styles.filterPillInactiveText}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* MAP */}
      <View style={[styles.mapContainer, { height: Math.max(260, height * 0.48) }]}>
        <LeafletMap
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          center={center}
          zoom={selected ? 16 : 13}
          markers={markers}
          user={
            gpsCoordinates
              ? { latitude: gpsCoordinates.latitude, longitude: gpsCoordinates.longitude, accuracy: gpsCoordinates.accuracy }
              : origin
          }
          selectedId={selectedId}
          fitToMarkers={!selected && !origin}
          onMarkerPress={(id) => setSelectedId(Number(id))}
        />

        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={() => {
            setSelectedId(null);
            mapRef.current?.recenter();
          }}
          activeOpacity={0.8}
        >
          <AppIcon name="navigate" size={18} color={colors.primary} />
        </TouchableOpacity>

        {!loading && !error && visible.length === 0 && (
          <View style={styles.mapNotice} pointerEvents="none">
            <Text style={styles.mapNoticeText}>
              {locations.length === 0 ? "No monitored safety zones yet." : "No places match your search."}
            </Text>
          </View>
        )}
        {error && (
          <TouchableOpacity style={styles.mapNotice} onPress={fetchLocations}>
            <Text style={[styles.mapNoticeText, { color: colors.danger }]}>{error}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* SELECTED / NEAREST PLACE CARD */}
      {place && (
        <View style={styles.bottomCardWrap}>
          <View style={styles.placeCard}>
            <View style={styles.placeHeaderRow}>
              <View style={[styles.placeThumbWrap, { backgroundColor: `${placeColor}22` }]}>
                <AppIcon name="location" size={20} color={placeColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.placeName} numberOfLines={1}>
                  {place.location_name}
                </Text>
                <Text style={styles.placeSub}>
                  {place.distance != null ? `${formatDistance(place.distance)} away` : "Distance unavailable"}
                  {!selected ? " · Nearest" : ""}
                </Text>
                <View style={styles.placeStatusRow}>
                  <View style={[styles.statusDot, { backgroundColor: placeColor }]} />
                  <Text style={[styles.placeStatusText, { color: placeColor }]}>
                    {place.crowd_status ?? "LOW"} · {place.crowd_count ?? 0}/{place.capacity ?? 0} (
                    {Math.round(place.occupancy_percentage ?? 0)}%)
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.placeActionsRow}>
              <TouchableOpacity style={styles.navigateBtn} onPress={() => openDirections(place)} activeOpacity={0.8}>
                <AppIcon name="navigate-outline" size={15} color={colors.textPrimary} />
                <Text style={styles.navigateBtnText}>Navigate</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.viewDetailsBtn}
                onPress={() => navigation.navigate("CrowdLocationDetail", { location: place })}
                activeOpacity={0.8}
              >
                <Text style={styles.viewDetailsText}>View Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
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
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    marginTop: 6,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  filterPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillActiveText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.white,
  },
  filterPillInactiveText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  mapContainer: {
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: colors.border,
  },
  recenterBtn: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mapNotice: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 64,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 10,
    padding: 10,
  },
  mapNoticeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  bottomCardWrap: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  placeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  placeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  placeThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  placeName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  placeSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  placeStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  placeStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  placeActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  navigateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
  },
  navigateBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  viewDetailsBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
  },
});
