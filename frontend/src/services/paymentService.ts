import AsyncStorage from "@react-native-async-storage/async-storage";
import RazorpayCheckout from "react-native-razorpay";
import api from "../config/api";
import { RAZORPAY_KEY_ID } from "../config/constants";

export type PaymentOrder = {
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  equipment_name?: string;
};

export type PaymentResult = {
  message: string;
  payment_id: string;
  order_id: string;
};

async function getUserId() {
  const storedUser = await AsyncStorage.getItem("user");
  if (!storedUser) throw new Error("User not logged in");
  const user = JSON.parse(storedUser);
  if (!user?.id) throw new Error("User ID missing — login issue");
  return Number(user.id);
}

export async function createPaymentOrder(equipmentId: number, quantity: number, location: { latitude: number; longitude: number }) {
  const userId = await getUserId();
  const response = await api.post<PaymentOrder>("/payments/razorpay/order", {
    user_id: userId,
    equipment_id: equipmentId,
    quantity,
    latitude: location.latitude,
    longitude: location.longitude,
  });
  return { ...response.data, userId };
}

export type CodOrderResult = {
  order_id: number;
  name: string;
  quantity: number;
  total_price: number;
  payment_method: "COD";
  status: string;
};

/** Cash on Delivery: server prices the order and reserves stock; payment is collected at delivery. */
export async function placeCodOrder(
  equipmentId: number,
  quantity: number,
  location: { latitude: number; longitude: number },
  delivery: { address?: string; phone?: string } = {}
) {
  const userId = await getUserId();
  const response = await api.post<{ success: boolean; message: string; order_id: number; data: CodOrderResult }>(
    "/orders/cod",
    {
      user_id: userId,
      equipment_id: equipmentId,
      quantity,
      latitude: location.latitude,
      longitude: location.longitude,
      delivery_address: delivery.address,
      contact_phone: delivery.phone,
    }
  );
  return response.data;
}

export async function openRazorpayCheckout(
  order: PaymentOrder,
  prefill: { name?: string; contact?: string } = {}
) {
  // The order was created with the server's key; using a different client key makes checkout fail
  const key = order.key_id || RAZORPAY_KEY_ID;
  if (!key) throw new Error("Payment is not configured");
  return RazorpayCheckout.open({
    key,
    amount: String(order.amount),
    currency: order.currency,
    name: "TrustTrip",
    description: order.equipment_name ? `${order.equipment_name} safety equipment` : "Safety equipment order",
    order_id: order.order_id,
    prefill: { name: prefill.name || "TrustTrip user", contact: prefill.contact || "" },
    theme: { color: "#4050C8" },
  });
}

export async function verifyPayment(orderId: string, payment: { razorpay_payment_id: string; razorpay_signature: string }) {
  const userId = await getUserId();
  const response = await api.post<PaymentResult>("/payments/razorpay/verify", {
    user_id: userId,
    razorpay_order_id: orderId,
    razorpay_payment_id: payment.razorpay_payment_id,
    razorpay_signature: payment.razorpay_signature,
  });
  return { ...response.data, order_id: orderId };
}

export async function markPaymentFailed(orderId: string, reason: string) {
  const userId = await getUserId();
  await api.post("/payments/razorpay/failure", {
    user_id: userId,
    razorpay_order_id: orderId,
    reason,
  });
}
