import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import { triggerLocalNotification } from "../../services/pushNotificationService";
import { colors, typography, radius, spacing, shadows } from "../../theme";

export default function PaymentSuccessScreen({ route, navigation }: any) {
  const { paymentId, orderId, amount, equipmentName, paymentMethod } = route.params || {};
  const isCod = paymentMethod === "COD";

  useEffect(() => {
    triggerLocalNotification(
      isCod ? "📦 Order Placed (Cash on Delivery)" : "💳 Payment & Order Confirmed",
      `Your order for ${equipmentName || "Safety Equipment"} is confirmed (Ref: ${orderId || "N/A"}).`,
      { type: "payment_success", screen: "MyOrders", order_id: orderId }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CosmicBackground>
      <ScreenHeader title={isCod ? "Order Placed" : "Payment Verified"} showBack={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* CHECKMARK HERO */}
        <View style={styles.heroSection}>
          <View style={styles.checkCircle}>
            <AppIcon name="checkmark" size={42} color={colors.white} />
          </View>
          <Text style={styles.title}>{isCod ? "Order Confirmed" : "Payment Authorized & Captured"}</Text>
          <Text style={styles.subtitle}>
            {isCod
              ? "Your safety equipment is on its way. Please keep the exact amount ready and pay in cash at delivery."
              : "Your safety equipment order is confirmed and the Razorpay payment has been verified."}
          </Text>
        </View>

        {/* ORDER DETAILS RECEIPT CARD */}
        <SurfaceCard style={styles.receiptCard} variant="elevated">
          <View style={styles.cardHeaderRow}>
            <AppIcon name="shield-checkmark" size={18} color={colors.primary} />
            <Text style={styles.receiptTitle}>{isCod ? "ORDER SUMMARY" : "OFFICIAL TRANSACTION RECEIPT"}</Text>
          </View>

          <View style={styles.divider} />

          <Row label="Equipment Item" value={equipmentName || "Personal Safety Alarm"} />
          <Row label={isCod ? "Order ID" : "Gateway Order ID"} value={String(orderId || "—")} />
          <Row label="Payment Method" value={isCod ? "Cash on Delivery" : "Razorpay (Online)"} />
          {!isCod && <Row label="Razorpay Payment ID" value={paymentId || "—"} />}
          <Row
            label={isCod ? "Amount Due on Delivery" : "Total Authorized"}
            value={`₹${(Number(amount || 0) / 100).toFixed(2)}`}
            isTotal
          />
        </SurfaceCard>

        {/* ACTIONS */}
        <View style={styles.actionsCol}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate("MyOrders")}
            activeOpacity={0.85}
          >
            <AppIcon name="cube" size={18} color={colors.white} />
            <Text style={styles.primaryBtnText}>View My Orders</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate("Home")}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryBtnText}>Return to Command Center</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </CosmicBackground>
  );
}

function Row({ label, value, isTotal }: { label: string; value: string; isTotal?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, isTotal && styles.rowValueTotal]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 20,
    paddingBottom: 32,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    ...shadows.glowPrimary,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
    maxWidth: 300,
  },
  receiptCard: {
    padding: 18,
    marginBottom: 24,
    borderColor: colors.primaryBorder,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  receiptTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  rowLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  rowValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: "700",
    maxWidth: "60%",
  },
  rowValueTotal: {
    ...typography.h3,
    color: colors.primary,
    fontSize: 18,
  },
  actionsCol: {
    gap: 12,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 15,
    gap: 8,
    ...shadows.glowPrimary,
  },
  primaryBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    fontWeight: "800",
    color: colors.white,
  },
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryBtnText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
});
