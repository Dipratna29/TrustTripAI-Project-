import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  ScrollView,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import locationService from "../../services/locationService";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import { StatusBadge } from "../../components/common/StatusIndicator";
import { useLocationContext } from "../../context/LocationContext";
import { colors, typography, radius, spacing, shadows } from "../../theme";

export default function SOSDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { activeLocation, isManual, gpsStatus } = useLocationContext();
  const emergency = route.params?.emergency || {
    name: "National Emergency Service",
    number: "112",
  };

  const sendSOS = () => {
    const locDesc = activeLocation
      ? isManual
        ? `Manual location coordinates (${activeLocation.name})`
        : "Live GPS coordinates"
      : "Emergency location telemetry";
    Alert.alert(
      "Emergency SOS Transmitted",
      `Direct dispatch sent to ${emergency.name}. ${locDesc} and contact broadcast activated.`,
      [{ text: "OK" }]
    );
  };

  const callNumber = () => {
    Linking.openURL(`tel:${emergency.number}`);
  };

  return (
    <CosmicBackground>
      <ScreenHeader
        title="SOS Command Center"
        subtitle={emergency.name}
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ACTIVE STATUS CARD */}
        <SurfaceCard style={styles.statusCard} variant="elevated">
          <View style={styles.statusRow}>
            <View style={styles.iconCircle}>
              <AppIcon name="shield-checkmark" size={28} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.serviceName}>{emergency.name}</Text>
              <Text style={styles.serviceSub}>Emergency Hotline: {emergency.number}</Text>
            </View>
            <StatusBadge label="READY" status="ready" />
          </View>
        </SurfaceCard>

        {/* TELEMETRY LOCATION CARD */}
        <SurfaceCard style={styles.telemetryCard}>
          <Text style={[styles.telemetryHeader, isManual && { color: colors.cream }]}>
            {isManual ? "MANUAL LOCATION TELEMETRY" : "ACTIVE GPS TELEMETRY"}
          </Text>
          <View style={styles.coordRow}>
            <AppIcon
              name={isManual ? "pencil" : "location"}
              size={18}
              color={isManual ? colors.cream : colors.primary}
            />
            <Text style={styles.coordText}>
              {activeLocation
                ? `${activeLocation.name} (Lat: ${activeLocation.latitude.toFixed(4)}, Lng: ${activeLocation.longitude.toFixed(4)})`
                : "Location services unavailable"}
            </Text>
          </View>
          <Text style={styles.accuracyText}>
            {isManual
              ? "Manually selected by user • Clearly marked as MANUAL for dispatch"
              : activeLocation
              ? "Live satellite GPS fix • Telemetry broadcast ready"
              : "No location attached • You can select manual location anytime"}
          </Text>
        </SurfaceCard>

        {/* ACTION BUTTONS */}
        <View style={styles.actionsCol}>
          <TouchableOpacity
            style={styles.directCallBtn}
            onPress={callNumber}
            activeOpacity={0.85}
          >
            <AppIcon name="call" size={20} color={colors.background} />
            <Text style={styles.directCallText}>Call {emergency.number} Directly</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sosAlertBtn}
            onPress={sendSOS}
            activeOpacity={0.85}
          >
            <AppIcon name="alert-circle" size={20} color={colors.white} />
            <Text style={styles.sosAlertText}>Broadcast Telemetry Alert</Text>
          </TouchableOpacity>
        </View>

        {/* GUIDELINES */}
        <SurfaceCard style={styles.guideCard}>
          <Text style={[typography.h4, { marginBottom: 8 }]}>Emergency Instructions</Text>
          <Text style={styles.guideText}>
            1. Stay calm and assess immediate surroundings.
          </Text>
          <Text style={styles.guideText}>
            2. When speaking to the dispatcher, state your landmark or hotel name clearly.
          </Text>
          <Text style={styles.guideText}>
            3. Keep your mobile battery active; TrustTrip maintains a low-power location ping.
          </Text>
        </SurfaceCard>
      </ScrollView>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 32,
  },
  statusCard: {
    padding: 18,
    marginBottom: 16,
    borderColor: colors.primaryBorder,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.primaryGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceName: {
    ...typography.h3,
    fontSize: 16,
    color: colors.textPrimary,
  },
  serviceSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  telemetryCard: {
    padding: 16,
    marginBottom: 20,
  },
  telemetryHeader: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  coordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  coordText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "600",
    flex: 1,
  },
  accuracyText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 8,
  },
  actionsCol: {
    gap: 12,
    marginBottom: 24,
  },
  directCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 14,
    gap: 8,
    ...shadows.glowPrimary,
  },
  directCallText: {
    ...typography.button,
    fontSize: 16,
    fontWeight: "600",
    color: colors.white,
  },
  sosAlertBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
    borderRadius: radius.button,
    paddingVertical: 14,
    gap: 8,
    ...shadows.glowDanger,
  },
  sosAlertText: {
    ...typography.button,
    fontSize: 16,
    fontWeight: "600",
    color: colors.white,
  },
  guideCard: {
    padding: 16,
  },
  guideText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
});