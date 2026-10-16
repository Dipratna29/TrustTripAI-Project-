import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api from "../../config/api";
import {
  createPaymentOrder,
  markPaymentFailed,
  openRazorpayCheckout,
  placeCodOrder,
  verifyPayment,
} from "../../services/paymentService";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import ActiveLocationBar from "../../components/common/ActiveLocationBar";
import LeafletMap from "../../components/map/LeafletMap";
import { useLocationContext } from "../../context/LocationContext";
import { useAuth } from "../../context/AuthContext";
import locationService from "../../services/locationService";
import { StatusBadge } from "../../components/common/StatusIndicator";
import { getFriendlyErrorMessage } from "../../utils/apiError";
import { colors, typography, radius, shadows, spacing } from "../../theme";

type PaymentMethod = "ONLINE" | "COD";

const COD_MAX_QUANTITY = 10;
const COD_MAX_ORDER_VALUE = 10000;

export default function EquipmentDetailsScreen({ route, navigation }: any) {
  const { item } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [quantity, setQuantity] = useState(1);
  const [deliveryPoint, setDeliveryPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pricePerItem, setPricePerItem] = useState(Number(item?.price || 0));
  const [stock, setStock] = useState<number | null>(
    typeof item?.current_stock === "number" ? item.current_stock : null
  );
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ONLINE");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const { activeLocation, showFallback } = useLocationContext();

  // Fetch live price/stock and sync the delivery point with the active location
  useEffect(() => {
    fetchPrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeLocation) {
      setDeliveryPoint({ latitude: activeLocation.latitude, longitude: activeLocation.longitude });
      if (!address && activeLocation.address) setAddress(activeLocation.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocation]);

  useEffect(() => {
    if (!phone && (user?.full_phone_number || user?.mob)) setPhone(String(user.full_phone_number || user.mob));
    if (!address && user?.address) setAddress(String(user.address));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchPrice = async () => {
    if (!item || !item.id) return;
    setLoadingPrice(true);
    try {
      const res = await api.get(`/equipment/${item.id}`);
      const data = res.data;
      if (data && typeof data.price !== "undefined") setPricePerItem(Number(data.price));
      if (data && typeof data.current_stock !== "undefined") setStock(Number(data.current_stock));
    } catch {
      // keep the list price passed from the catalogue
    } finally {
      setLoadingPrice(false);
    }
  };

  const totalPrice = pricePerItem * quantity;
  const outOfStock = stock !== null && stock <= 0;
  const maxQty = Math.max(1, Math.min(stock ?? 99, paymentMethod === "COD" ? COD_MAX_QUANTITY : 99));
  const codBlockedReason =
    totalPrice > COD_MAX_ORDER_VALUE
      ? `Cash on Delivery is available for orders up to ₹${COD_MAX_ORDER_VALUE.toLocaleString("en-IN")}.`
      : null;

  const useCurrentLocation = async () => {
    setGettingLocation(true);
    try {
      const coords = await locationService.getCurrentLocation();
      if (coords) {
        setDeliveryPoint({ latitude: coords.latitude, longitude: coords.longitude });
        const rev = await locationService.reverseGeocodeCoords(coords.latitude, coords.longitude);
        if (rev.address) setAddress(rev.address);
      } else {
        showFallback("unavailable");
      }
    } finally {
      setGettingLocation(false);
    }
  };

  const resolveLocation = () =>
    deliveryPoint ||
    (activeLocation ? { latitude: activeLocation.latitude, longitude: activeLocation.longitude } : null);

  const placeCashOnDelivery = async (loc: { latitude: number; longitude: number }) => {
    if (address.trim().length < 8) {
      Alert.alert("Delivery address needed", "Please enter a complete delivery address (house, street, area).");
      return;
    }
    if (!/^\+?[0-9\s-]{7,15}$/.test(phone.trim())) {
      Alert.alert("Contact number needed", "Please enter a valid phone number so the courier can reach you.");
      return;
    }

    setPlacingOrder(true);
    try {
      const result = await placeCodOrder(Number(item.id), quantity, loc, {
        address: address.trim(),
        phone: phone.trim(),
      });
      navigation.replace("PaymentSuccess", {
        paymentMethod: "COD",
        orderId: result.order_id,
        amount: Math.round(Number(result.data?.total_price ?? totalPrice) * 100),
        equipmentName: result.data?.name || item.name,
      });
    } catch (error: any) {
      Alert.alert("Order not placed", getFriendlyErrorMessage(error, "Could not place your order. Please try again."));
    } finally {
      setPlacingOrder(false);
    }
  };

  // Authoritative Razorpay payment flow
  const payOnline = async (loc: { latitude: number; longitude: number }) => {
    setPlacingOrder(true);
    let paymentOrder: Awaited<ReturnType<typeof createPaymentOrder>> | null = null;
    let checkoutCompleted = false;
    try {
      paymentOrder = await createPaymentOrder(Number(item.id), quantity, loc);
      const checkoutResponse = await openRazorpayCheckout(paymentOrder, {
        name: user?.name || user?.username,
        contact: phone.trim(),
      });
      checkoutCompleted = true;
      const verified = await verifyPayment(paymentOrder.order_id, checkoutResponse);

      navigation.replace("PaymentSuccess", {
        paymentMethod: "ONLINE",
        paymentId: verified.payment_id,
        orderId: verified.order_id,
        amount: paymentOrder.amount,
        equipmentName: paymentOrder.equipment_name || item.name,
      });
    } catch (error: any) {
      const description =
        error?.description || getFriendlyErrorMessage(error, "Payment could not be completed.");
      if (paymentOrder?.order_id && !checkoutCompleted) {
        try {
          await markPaymentFailed(paymentOrder.order_id, description);
        } catch {
          // Payment failure reporting is best effort
        }
      }

      Alert.alert(
        "Payment Incomplete",
        `${description}\n\nYou can also choose Cash on Delivery.`,
        [{ text: "OK" }]
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleOrder = () => {
    if (outOfStock) {
      Alert.alert("Out of stock", "This item is currently out of stock.");
      return;
    }
    const loc = resolveLocation();
    if (!loc) {
      showFallback("unavailable");
      return;
    }

    if (paymentMethod === "COD") {
      if (codBlockedReason) {
        Alert.alert("Cash on Delivery unavailable", `${codBlockedReason} Please pay online.`);
        return;
      }
      Alert.alert(
        "Confirm Cash on Delivery",
        `${quantity} × ${item.name}\nAmount to pay at delivery: ₹${totalPrice.toFixed(2)}\n\nDeliver to:\n${address.trim() || "your current location"}`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Place Order", onPress: () => placeCashOnDelivery(loc) },
        ]
      );
      return;
    }

    payOnline(loc);
  };

  return (
    <CosmicBackground>
      <ScreenHeader title="Equipment Checkout" subtitle={item.name} showBack onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* HERO CARD */}
          <SurfaceCard style={styles.heroCard} variant="elevated">
            <View style={styles.iconCircle}>
              <AppIcon name="cube" size={36} color={colors.primary} />
            </View>
            <Text style={styles.equipmentName}>{item.name}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge
                label={outOfStock ? "OUT OF STOCK" : stock !== null ? `${stock} IN STOCK` : "VERIFIED AVAILABLE"}
                status={outOfStock ? "danger" : "ready"}
              />
            </View>
            <Text style={styles.descText}>
              {item.description ||
                "Certified personal travel safety equipment inspected for regional safety compliance."}
            </Text>
          </SurfaceCard>

          {/* PRICING & QUANTITY */}
          <SurfaceCard style={styles.priceCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>PRICE PER UNIT</Text>
              {loadingPrice ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.priceValue}>₹{pricePerItem.toFixed(2)}</Text>
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <Text style={styles.metaLabel}>QUANTITY</Text>
              <View style={styles.qtyControl}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => quantity > 1 && setQuantity(quantity - 1)}
                  disabled={quantity <= 1}
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{quantity}</Text>
                <TouchableOpacity
                  style={[styles.qtyBtn, styles.qtyBtnAdd, quantity >= maxQty && styles.btnDisabled]}
                  onPress={() => quantity < maxQty && setQuantity(quantity + 1)}
                  disabled={quantity >= maxQty}
                >
                  <Text style={[styles.qtyBtnText, { color: colors.white }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.rowBetween}>
              <Text style={typography.h4}>Total Amount</Text>
              <Text style={styles.totalPriceValue}>₹{totalPrice.toFixed(2)}</Text>
            </View>
          </SurfaceCard>

          {/* PAYMENT METHOD */}
          <SurfaceCard style={styles.priceCard}>
            <Text style={[typography.h4, { marginBottom: 10 }]}>Payment Method</Text>

            <TouchableOpacity
              style={[styles.payOption, paymentMethod === "ONLINE" && styles.payOptionActive]}
              onPress={() => setPaymentMethod("ONLINE")}
              activeOpacity={0.8}
            >
              <AppIcon name="card-outline" size={20} color={paymentMethod === "ONLINE" ? colors.primary : colors.textSecondary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.payOptionTitle}>Pay Online</Text>
                <Text style={styles.payOptionSub}>UPI, cards, net banking via Razorpay</Text>
              </View>
              <View style={[styles.radio, paymentMethod === "ONLINE" && styles.radioActive]}>
                {paymentMethod === "ONLINE" && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payOption, paymentMethod === "COD" && styles.payOptionActive, { marginTop: 10 }]}
              onPress={() => {
                setPaymentMethod("COD");
                if (quantity > COD_MAX_QUANTITY) setQuantity(COD_MAX_QUANTITY);
              }}
              activeOpacity={0.8}
            >
              <AppIcon name="cash-outline" size={20} color={paymentMethod === "COD" ? colors.primary : colors.textSecondary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.payOptionTitle}>Cash on Delivery</Text>
                <Text style={styles.payOptionSub}>Pay in cash when your gear arrives</Text>
              </View>
              <View style={[styles.radio, paymentMethod === "COD" && styles.radioActive]}>
                {paymentMethod === "COD" && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            {paymentMethod === "COD" && codBlockedReason && (
              <Text style={styles.codWarning}>{codBlockedReason} Please choose Pay Online.</Text>
            )}
          </SurfaceCard>

          {/* DELIVERY DETAILS */}
          <SurfaceCard style={styles.locationCard}>
            <View style={styles.locHeaderRow}>
              <AppIcon name="location-outline" size={18} color={colors.primary} />
              <Text style={[typography.h4, { marginLeft: 8 }]}>Delivery Details</Text>
            </View>

            <ActiveLocationBar style={{ marginVertical: 8 }} />

            <Text style={styles.inputLabel}>DELIVERY ADDRESS{paymentMethod === "COD" ? " *" : ""}</Text>
            <TextInput
              style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
              value={address}
              onChangeText={setAddress}
              placeholder="House / hotel, street, area, city"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />

            <Text style={styles.inputLabel}>CONTACT NUMBER{paymentMethod === "COD" ? " *" : ""}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={16}
            />

            <TouchableOpacity
              style={[styles.locBtn, { marginTop: 12 }]}
              onPress={useCurrentLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <AppIcon name="navigate-outline" size={18} color={colors.primary} />
                  <Text style={styles.locBtnText}>Use my precise current location</Text>
                </>
              )}
            </TouchableOpacity>
          </SurfaceCard>

          {/* DELIVERY POINT MAP */}
          {deliveryPoint && (
            <SurfaceCard style={styles.mapCard}>
              <LeafletMap
                style={styles.map}
                center={deliveryPoint}
                zoom={16}
                markers={[
                  {
                    id: "delivery",
                    latitude: deliveryPoint.latitude,
                    longitude: deliveryPoint.longitude,
                    title: "Delivery point",
                    subtitle: address || undefined,
                    color: colors.primary,
                  },
                ]}
              />
              <View style={styles.mapNote}>
                <AppIcon name="time-outline" size={14} color={colors.primary} />
                <Text style={styles.mapNoteText}>
                  Courier delivers to this point. Estimated delivery: same day in city limits.
                </Text>
              </View>
            </SurfaceCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* PINNED CHECKOUT FOOTER */}
      <View style={[styles.footer, { paddingBottom: 14 + insets.bottom }]}>
        <View style={styles.footerPriceCol}>
          <Text style={styles.footerPriceLabel}>{paymentMethod === "COD" ? "PAY ON DELIVERY" : "TOTAL PAYABLE"}</Text>
          <Text style={styles.footerPriceValue}>₹{totalPrice.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkoutBtn, (placingOrder || outOfStock) && styles.btnDisabled]}
          onPress={handleOrder}
          disabled={placingOrder || outOfStock}
          activeOpacity={0.85}
        >
          {placingOrder ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <View style={styles.btnRow}>
              <AppIcon name={paymentMethod === "COD" ? "cash" : "card"} size={18} color={colors.white} />
              <Text style={styles.checkoutBtnText}>
                {outOfStock ? "Out of Stock" : paymentMethod === "COD" ? "Place Order" : "Pay Now"}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  payOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.lightBackground,
  },
  payOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSubtle,
  },
  payOptionTitle: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  payOptionSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  codWarning: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 10,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    backgroundColor: colors.lightBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 24,
  },
  heroCard: {
    alignItems: "center",
    padding: 22,
    marginBottom: 14,
    borderColor: colors.primaryBorder,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.primaryGlow,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  equipmentName: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  badgeRow: {
    marginBottom: 10,
  },
  descText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  priceCard: {
    padding: 16,
    marginBottom: 14,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  priceValue: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  totalPriceValue: {
    ...typography.h3,
    color: colors.primary,
    fontSize: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  qtyBtnAdd: {
    backgroundColor: colors.primary,
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  qtyValue: {
    ...typography.h4,
    color: colors.textPrimary,
    paddingHorizontal: 14,
  },
  locationCard: {
    padding: 16,
    marginBottom: 14,
  },
  locHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  locSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  locBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.button,
    paddingVertical: 12,
    gap: 8,
  },
  locBtnDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  locBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  locBtnTextDone: {
    color: colors.white,
    fontWeight: "800",
  },
  mapCard: {
    overflow: "hidden",
    padding: 0,
    marginBottom: 14,
  },
  map: {
    width: "100%",
    height: 180,
  },
  mapNote: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: colors.surface,
    gap: 6,
  },
  mapNoteText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: 14,
  },
  footerPriceCol: {
    justifyContent: "center",
  },
  footerPriceLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  footerPriceValue: {
    ...typography.h3,
    color: colors.primary,
    fontSize: 20,
    marginTop: 2,
  },
  checkoutBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glowPrimary,
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  checkoutBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    fontWeight: "800",
    color: colors.white,
  },
});
