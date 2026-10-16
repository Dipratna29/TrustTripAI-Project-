import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, StatusBar, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import AppIcon from "../components/common/AppIcon";
import { colors, typography, radius } from "../theme";

import { usePushNotifications } from "../hooks/usePushNotifications";
import { clearStoredPushToken, getLastNotificationResponse } from "../services/pushNotificationService";
import { AuthProvider, useAuth } from "../context/AuthContext";

/* AUTH SCREENS */
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";

/* APP SCREENS */
import EquipmentDetailsScreen from "../screens/Equipment/EquipmentDetailsScreen";
import HomeScreen from "../screens/HomeScreen";
import ProfileScreen from "../screens/ProfileScreen";
import LanguageScreen from "../screens/LanguageScreen";
import WomenSafetyScreen from "../screens/women/WomenSafetyScreen";
import GuideScreen from "../screens/GuideScreen";
import SOSScreen from "../screens/SOS/SOSScreen";
import ComplaintScreen from "../screens/complaints/ComplaintScreen";
import PriceCheckScreen from "../screens/PriceCheckScreen";
import CrowdScreen from "../screens/Crowd/CrowdScreen";
import MapViewScreen from "../screens/Crowd/MapViewScreen";
import LocationDetailScreen from "../screens/Crowd/LocationDetailScreen";
import HistoryScreen from "../screens/Crowd/HistoryScreen";
import EquipmentScreen from "../screens/Equipment/EquipmentScreen";
import WomenSafetyDetailScreen from "../screens/women/WomenSafetyDetailScreen";
import SOSDetailScreen from "../screens/SOS/SOSDetailScreen";
import ChatBotScreen from "../screens/ChatBotScreen";
import MyComplaintsScreen from "../screens/complaints/MyComplaintsScreen";
import MyOrdersScreen from "../screens/Equipment/MyOrdersScreen";
import PaymentSuccessScreen from "../screens/Equipment/PaymentSuccessScreen";
import DashboardScreen from "../screens/DashboardScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import DebugAxiosErrorsScreen from "../screens/DebugAxiosErrorsScreen";
import SelectLocationScreen from "../screens/SelectLocationScreen";
import OffersScreen from "../screens/OffersScreen";
import { LocationProvider } from "../context/LocationContext";
import LocationFallbackModal from "../components/common/LocationFallbackModal";

const Stack = createNativeStackNavigator();

type RootStackParamList = {
  Home: undefined;
  SelectLocation: undefined;
  Notifications: { selectedNotification?: any; notificationId?: number } | undefined;
  Login: undefined;
  Register: undefined;
  Profile: undefined;
  MyComplaints: undefined;
  Dashboard: undefined;
  MyOrders: undefined;
  PaymentSuccess: { paymentId: string; orderId: string; amount: number; equipmentName?: string };
  Language: undefined;
  WomenSafety: undefined;
  WomenSafetyDetail: undefined;
  Guide: undefined;
  SOS: undefined;
  SOSDetail: undefined;
  Complaint: undefined;
  PriceCheck: undefined;
  Crowd: undefined;
  CrowdMap: undefined;
  CrowdLocationDetail: undefined;
  CrowdHistory: undefined;
  Equipment: undefined;
  EquipmentDetails: undefined;
  ChatBot: undefined;
  DebugAxiosErrors: undefined;
  Offers: undefined;
};

function RootNavigationContent() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const navigationRef = useRef<any>(null);

  // Push notifications hook
  const {
    permissionStatus,
    isInitialized: notificationsInitialized,
    registerToken,
    initializeNotifications,
  } = usePushNotifications(
    // onNotificationReceived - handle foreground notifications
    (notification) => {
      console.log("Foreground notification:", notification);
    },
    // onNotificationTapped - handle notification tap and navigate
    (response) => {
      handleNotificationTap(response);
    }
  );

  // Initialize push notifications when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      initializeNotifications().catch((err) =>
        console.log("Error initializing notifications:", err)
      );
    }
  }, [isAuthenticated]);

  // Handle cold-start notification tap
  useEffect(() => {
    getLastNotificationResponse()
      .then((response) => {
        if (response && navigationRef.current) {
          handleNotificationTap(response);
        }
      })
      .catch((err) => console.log("Cold start notification check error:", err));
  }, []);

  /**
   * Handle notification tap and show full notification in phone
   */
  const handleNotificationTap = (response: Notifications.NotificationResponse) => {
    try {
      const content = response.notification.request.content;
      const data = (content.data as any) || {};
      console.log("Notification tapped from phone tray:", content);

      if (navigationRef.current) {
        const notifItem = {
          notification_id: data.notification_id || Date.now(),
          user_id: data.user_id || 0,
          notification_type: data.type || "system",
          title: content.title || "Notification",
          body: content.body || "",
          data: data,
          is_read: true,
          created_at: new Date().toISOString(),
        };

        // Open Notifications screen with full notification detail modal displayed
        navigationRef.current.navigate("Notifications", {
          selectedNotification: notifItem,
        });
      }
    } catch (error) {
      console.log("Error handling notification tap:", error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.splashCenter}>
          <View style={styles.splashIconCircle}>
            <AppIcon name="shield-checkmark" size={44} color={colors.primary} />
          </View>
          <Text style={styles.splashTitle}>
            Trust<Text style={{ color: colors.primary }}>Trip</Text>
          </Text>
          <Text style={styles.splashTagline}>Travel Safe. Travel Smart.</Text>
        </View>
        <View style={styles.splashFooter}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.splashLoadingText}>Preparing your safety tools...</Text>
        </View>
      </View>
    );
  }

  return (
    <LocationProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="SelectLocation" component={SelectLocationScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Profile">
                {(props) => <ProfileScreen {...props} logoutUser={logout} />}
              </Stack.Screen>
              <Stack.Screen name="MyComplaints" component={MyComplaintsScreen} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="MyOrders" component={MyOrdersScreen} />
              <Stack.Screen name="PaymentSuccess" component={PaymentSuccessScreen} />
              <Stack.Screen name="Language" component={LanguageScreen} />
              <Stack.Screen name="WomenSafety" component={WomenSafetyScreen} />
              <Stack.Screen name="WomenSafetyDetail" component={WomenSafetyDetailScreen} />
              <Stack.Screen name="Guide" component={GuideScreen} />
              <Stack.Screen name="SOS" component={SOSScreen} />
              <Stack.Screen name="SOSDetail" component={SOSDetailScreen} />
              <Stack.Screen name="Complaint" component={ComplaintScreen} />
              <Stack.Screen name="PriceCheck" component={PriceCheckScreen} />
              <Stack.Screen name="Crowd" component={CrowdScreen} />
              <Stack.Screen name="CrowdMap" component={MapViewScreen} />
              <Stack.Screen name="CrowdLocationDetail" component={LocationDetailScreen} />
              <Stack.Screen name="CrowdHistory" component={HistoryScreen} />
              <Stack.Screen name="Equipment" component={EquipmentScreen} />
              <Stack.Screen name="EquipmentDetails" component={EquipmentDetailsScreen} />
              <Stack.Screen name="ChatBot" component={ChatBotScreen} />
              <Stack.Screen name="Offers" component={OffersScreen} />
              <Stack.Screen name="DebugAxiosErrors" component={DebugAxiosErrorsScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            </>
          )}
        </Stack.Navigator>
        <LocationFallbackModal />
      </NavigationContainer>
    </LocationProvider>
  );
}

export default function AppNavigator() {
  return (
    <AuthProvider>
      <RootNavigationContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 60,
  },
  splashCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  splashIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.primaryGlow,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  splashTitle: {
    fontFamily: typography.displayLarge.fontFamily,
    fontSize: 34,
    fontWeight: "900",
    color: colors.white,
    letterSpacing: -0.5,
  },
  splashTagline: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: 8,
    letterSpacing: 0.3,
  },
  splashFooter: {
    alignItems: "center",
    gap: 12,
  },
  splashLoadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
