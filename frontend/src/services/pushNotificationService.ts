/**
 * Push Notification Service for TrustTrip
 * Handles Expo push notification token management and registration
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../config/api";

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Configure default Android Notification Channel (Required for Android 8.0+)
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "TrustTrip Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#f59e0b",
    sound: "default",
    showBadge: true,
  }).catch((err) => console.log("Failed to set notification channel:", err));
}

/**
 * Triggers an immediate local notification on device
 */
export const triggerLocalNotification = async (
  title: string,
  body: string,
  data: any = {}
) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  } catch (error) {
    console.log("Could not trigger local notification:", error);
  }
};

/**
 * Request notification permission from user
 * @returns Promise<boolean> - true if permission granted
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    const permObj = permissions as any;
    let finalStatus = permObj.status || permObj.ios?.status || "undetermined";

    if (finalStatus !== "granted") {
      const response = await Notifications.requestPermissionsAsync();
      const respObj = response as any;
      finalStatus = respObj.status || respObj.ios?.status || "undetermined";
    }

    return finalStatus === "granted";
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return false;
  }
};

/**
 * Get Expo push notification token for this device
 * @returns Promise<string | null> - The push token or null if unavailable
 */
export const getExpoPushToken = async (): Promise<string | null> => {
  try {
    // Check if permission is granted first
    const permissions = await Notifications.getPermissionsAsync();
    const permObj = permissions as any;
    const status = permObj.status || permObj.ios?.status || "undetermined";
    
    if (status !== "granted") {
      const granted = await requestNotificationPermission();
      if (!granted) {
        return null;
      }
    }

    // Safely attempt token retrieval without triggering LogBox modal
    try {
      const token = await Notifications.getExpoPushTokenAsync();
      return token.data || null;
    } catch (tokenErr: any) {
      // Internal diagnostic log - safe and non-blocking
      console.log("[PushNotificationService] Push token unavailable in current dev build:", tokenErr?.message || "Unavailable");
      return null;
    }
  } catch (error: any) {
    console.log("[PushNotificationService] Notification permission exception:", error?.message || error);
    return null;
  }
};

/**
 * Register push token with TrustTrip backend
 * @param userId - User ID from authentication
 * @param pushToken - Expo push notification token
 * @param deviceType - "android" or "ios"
 * @param deviceName - Optional device name/model
 * @returns Promise<{success: boolean, message: string, deviceId?: number}>
 */
export const registerPushTokenWithBackend = async (
  userId: number,
  pushToken: string,
  deviceType: "android" | "ios" = "android",
  deviceName?: string
): Promise<{ success: boolean; message: string; deviceId?: number }> => {
  try {
    const response = await api.post("/device", {
      user_id: userId,
      push_token: pushToken,
      device_type: deviceType,
      device_name: deviceName,
    });

    const data = response.data;

    if (data.success) {
      // Store locally as well
      await AsyncStorage.setItem(
        "pushToken",
        JSON.stringify({
          token: pushToken,
          userId,
          deviceId: data.device_id,
          registeredAt: new Date().toISOString(),
        })
      );

      return {
        success: true,
        message: data.message || "Token registered successfully",
        deviceId: data.device_id,
      };
    } else {
      return {
        success: false,
        message: data.message || "Failed to register token",
      };
    }
  } catch (error: any) {
    const errorMsg =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to register token with backend";
    console.error("Error registering push token:", errorMsg);
    return {
      success: false,
      message: errorMsg,
    };
  }
};

/**
 * Initialize push notifications on app start
 * Requests permission, gets token, and registers with backend if user is logged in
 * @returns Promise<{success: boolean, token?: string, userId?: number}>
 */
export const initializePushNotifications = async (): Promise<{
  success: boolean;
  token?: string;
  userId?: number;
}> => {
  try {
    // Get user from AsyncStorage
    const userStr = await AsyncStorage.getItem("user");
    if (!userStr) {
      console.log(
        "No logged-in user, skipping push notification initialization"
      );
      return { success: false };
    }

    const user = JSON.parse(userStr);
    if (!user.id) {
      console.log("User ID not found in session");
      return { success: false };
    }

    // Request permission
    const permissionGranted = await requestNotificationPermission();
    if (!permissionGranted) {
      console.log(
        "Notification permission denied, will try again later or on next login"
      );
      return { success: false };
    }

    // Get push token
    const pushToken = await getExpoPushToken();
    if (!pushToken) {
      console.log("Could not obtain push token (possibly on simulator)");
      return { success: false };
    }

    // Register with backend
    const result = await registerPushTokenWithBackend(user.id, pushToken);

    if (result.success) {
      return {
        success: true,
        token: pushToken,
        userId: user.id,
      };
    } else {
      return {
        success: false,
      };
    }
  } catch (error) {
    console.error("Error initializing push notifications:", error);
    return { success: false };
  }
};

/**
 * Get stored push token from local storage
 * @returns Promise<{token: string, userId: number, deviceId: number} | null>
 */
export const getStoredPushToken = async (): Promise<{
  token: string;
  userId: number;
  deviceId: number;
} | null> => {
  try {
    const stored = await AsyncStorage.getItem("pushToken");
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  } catch (error) {
    console.error("Error getting stored push token:", error);
    return null;
  }
};

/**
 * Clear stored push token (e.g., on logout)
 */
export const clearStoredPushToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem("pushToken");
  } catch (error) {
    console.error("Error clearing push token:", error);
  }
};

/**
 * Listen for incoming notifications in foreground
 * @param callback - Function to call when notification received
 */
export const listenToForegroundNotifications = (
  callback: (notification: Notifications.Notification) => void
) => {
  const subscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log("Notification received (foreground):", notification);
      callback(notification);
    }
  );

  return () => subscription.remove();
};

/**
 * Listen for notification taps (app in foreground or background)
 * @param callback - Function to call when notification tapped
 */
export const listenToNotificationTaps = (
  callback: (response: Notifications.NotificationResponse) => void
) => {
  const subscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("Notification tapped:", response);
      callback(response);
    });

  return () => subscription.remove();
};

/**
 * Get last notification response (for handling notification tap when app was closed)
 * @returns Promise<Notifications.NotificationResponse | null>
 */
export const getLastNotificationResponse = async (): Promise<Notifications.NotificationResponse | null> => {
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch (error) {
    console.error("Error getting last notification response:", error);
    return null;
  }
};

/**
 * Send a welcome push notification to a user on first login
 * @param userId - User ID to send the welcome notification to
 * @returns Promise<void>
 */
export const send_notification_to_user_welcome = async (userId: string): Promise<void> => {
  try {
    await api.post("/notifications/send", {
      user_id: userId,
      type: "welcome",
      title: "Welcome to TrustTrip! 🌍",
      body: "Your secure travel dashboard is ready. Safe travels!",
    });
  } catch (error) {
    console.warn("Error sending welcome notification:", error);
  }
};