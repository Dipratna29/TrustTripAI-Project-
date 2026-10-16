import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import { StatusBadge } from "../../components/common/StatusIndicator";
import { useLocationContext } from "../../context/LocationContext";
import { colors, typography, radius, spacing } from "../../theme";

export default function WomenSafetyDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { activeLocation, isManual } = useLocationContext();
  const facility = route.params?.facility || {
    name: "Safe Zone Facility",
    available: true,
    category: "Verified Amenity",
    distance: "0.5 km",
  };

  const handleBooking = () => {
    Alert.alert(
      "Access Confirmed",
      `Access pass for ${facility.name} generated. Show this digital pass upon arrival.`,
      [{ text: "OK", onPress: () => navigation.goBack() }]
    );
  };

  return (
    <CosmicBackground>
      <ScreenHeader
        title={facility.name}
        subtitle="Verified safe location details"
        showBack
        onBack={() => navigation.goBack()}
      />

      <View style={styles.content}>
        {/* DETAILS CARD */}
        <SurfaceCard style={styles.card} variant="elevated">
          <View style={styles.iconCircle}>
            <AppIcon name="shield-checkmark" size={32} color={colors.primary} />
          </View>
          <Text style={styles.facilityName}>{facility.name}</Text>
          <Text style={styles.categoryText}>{facility.category || "Verified Travel Safe Haven"}</Text>

          <View style={styles.statusRow}>
            <StatusBadge
              label={facility.available ? "VERIFIED ACTIVE" : "TEMPORARILY UNAVAILABLE"}
              status={facility.available ? "ready" : "moderate"}
            />
          </View>

          <View style={styles.infoRow}>
            <AppIcon name={isManual ? "pencil" : "location-outline"} size={16} color={isManual ? colors.cream : colors.textMuted} />
            <Text style={styles.infoText}>
              Approx. {facility.distance || "0.4 km"} from {activeLocation ? activeLocation.name : "current location"} ({isManual ? "Manual" : "GPS"})
            </Text>
          </View>

          <View style={styles.infoRow}>
            <AppIcon name="time-outline" size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>Operating Hours: 24/7 Security & Monitoring</Text>
          </View>

          {facility.available && (
            <TouchableOpacity style={styles.bookBtn} onPress={handleBooking} activeOpacity={0.85}>
              <Text style={styles.bookBtnText}>Request Access Pass</Text>
            </TouchableOpacity>
          )}
        </SurfaceCard>
      </View>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 20,
    flex: 1,
  },
  card: {
    alignItems: "center",
    padding: 24,
    borderColor: colors.primaryBorder,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primaryGlow,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  facilityName: {
    ...typography.h2,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: "center",
  },
  categoryText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
    marginTop: 4,
    textTransform: "uppercase",
  },
  statusRow: {
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  infoText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 24,
    width: "100%",
    alignItems: "center",
  },
  bookBtnText: {
    fontFamily: typography.button.fontFamily,
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
  },
});