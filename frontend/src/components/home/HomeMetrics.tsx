import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import api from "../../config/api";
import AppIcon from "../common/AppIcon";
import { useLocationContext } from "../../context/LocationContext";
import { distanceKm, fetchFacilities, fetchWeather, getCachedWeather, Weather } from "../../services/placesService";
import { colors } from "../../theme";

const CROWD_RADIUS_KM = 10;
const HELP_RADIUS_KM = 5;

type Crowd = { name: string; status: string; percent: number; distance: number } | null;

const crowdColor = (status: string) =>
  status === "OVERCROWDED" || status === "HIGH" ? colors.danger : status === "MODERATE" ? colors.warning : colors.success;

const timeLabel = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Home tiles backed by live data (weather, nearest monitored crowd zone, verified help nearby). No placeholder values. */
export default function HomeMetrics() {
  const navigation = useNavigation<any>();
  const { activeLocation, isDetecting } = useLocationContext();
  const lat = activeLocation?.latitude;
  const lon = activeLocation?.longitude;

  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "ok" | "stale" | "error">("idle");
  const [crowd, setCrowd] = useState<Crowd | undefined>(undefined);
  const [helpCount, setHelpCount] = useState<number | null | undefined>(undefined);

  const loadWeather = useCallback(
    async (force = false) => {
      if (lat == null || lon == null) return;
      setWeatherState("loading");
      try {
        setWeather(await fetchWeather(lat, lon, force));
        setWeatherState("ok");
      } catch {
        const cached = await getCachedWeather();
        if (cached) {
          setWeather(cached);
          setWeatherState("stale");
        } else {
          setWeatherState("error");
        }
      }
    },
    [lat, lon]
  );

  const loadNearby = useCallback(async () => {
    if (lat == null || lon == null) return;
    try {
      const res = await api.get("/crowd/locations", { timeout: 15000 });
      const nearest = (Array.isArray(res.data) ? res.data : [])
        .filter((l: any) => typeof l.latitude === "number" && typeof l.longitude === "number")
        .map((l: any) => ({ l, d: distanceKm(lat, lon, l.latitude, l.longitude) }))
        .sort((a: any, b: any) => a.d - b.d)[0];
      setCrowd(
        nearest && nearest.d <= CROWD_RADIUS_KM
          ? { name: nearest.l.location_name, status: nearest.l.crowd_status || "LOW", percent: Math.round(nearest.l.occupancy_percentage || 0), distance: nearest.d }
          : null
      );
    } catch {
      setCrowd(undefined);
    }
    try {
      const facilities = await fetchFacilities({ latitude: lat, longitude: lon });
      setHelpCount(facilities.filter((f) => f.is_verified && f.distance_km != null && f.distance_km <= HELP_RADIUS_KM).length);
    } catch {
      setHelpCount(undefined);
    }
  }, [lat, lon]);

  useEffect(() => {
    loadWeather();
    loadNearby();
  }, [loadWeather, loadNearby]);

  const noLocation = lat == null || lon == null;

  return (
    <View style={styles.row}>
      {/* WEATHER */}
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => (noLocation ? navigation.navigate("SelectLocation") : loadWeather(true))}
        accessibilityLabel="Current weather, tap to refresh"
      >
        {weatherState === "loading" && !weather ? (
          <ActivityIndicator size="small" color={colors.warning} style={{ marginVertical: 8 }} />
        ) : (
          <AppIcon name={weather?.icon || "sunny"} size={20} color="#F59E0B" />
        )}
        <Text style={styles.val}>{weather ? `${Math.round(weather.temperature_c)}°C` : "--"}</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {noLocation
            ? isDetecting
              ? "Finding you..."
              : "Set location"
            : weatherState === "error"
            ? "Weather unavailable · tap to retry"
            : weather
            ? weatherState === "stale"
              ? `${weather.condition} · as of ${timeLabel(weather.fetchedAt)}`
              : weather.condition
            : "Loading..."}
        </Text>
      </TouchableOpacity>

      {/* CROWD */}
      <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => navigation.navigate("Crowd")}>
        <AppIcon name="people" size={20} color={crowd ? crowdColor(crowd.status) : colors.textMuted} />
        <Text style={styles.val}>
          {crowd ? crowd.status.charAt(0) + crowd.status.slice(1).toLowerCase() : crowd === null ? "No data" : "--"}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {crowd ? `${crowd.percent}% · ${crowd.name}` : crowd === null ? `No monitored zone within ${CROWD_RADIUS_KM} km` : noLocation ? "Set location" : "Crowd level"}
        </Text>
      </TouchableOpacity>

      {/* HELP NEARBY */}
      <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => navigation.navigate("WomenSafety")}>
        <AppIcon name="shield-checkmark" size={20} color={helpCount ? colors.success : colors.textMuted} />
        <Text style={styles.val}>{helpCount == null ? "--" : helpCount}</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {helpCount == null ? (noLocation ? "Set location" : "Help points") : `Verified help within ${HELP_RADIUS_KM} km`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    minHeight: 92,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  val: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 6 },
  sub: { fontSize: 10, color: "#64748B", fontWeight: "600", marginTop: 2, textAlign: "center" },
});
