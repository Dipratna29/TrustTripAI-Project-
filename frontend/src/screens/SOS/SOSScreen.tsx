import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Animated,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../../config/api";
import { triggerLocalNotification } from "../../services/pushNotificationService";
import CosmicBackground from "../../components/common/CosmicBackground";
import AppIcon from "../../components/common/AppIcon";
import CustomBottomNav from "../../components/common/CustomBottomNav";
import { useLocationContext } from "../../context/LocationContext";
import { colors, radius } from "../../theme";

interface EmergencyContact {
  id: string;
  name: string;
  number: string;
  icon: string;
}

const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { id: "1", name: "Police", number: "100", icon: "shield" },
  { id: "2", name: "Ambulance", number: "108", icon: "medkit" },
  { id: "3", name: "Women Helpline", number: "1091", icon: "heart" },
  { id: "4", name: "National Emergency", number: "112", icon: "call" },
];

export default function SOSScreen() {
  const navigation = useNavigation<any>();
  const [holdingSOS, setHoldingSOS] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const holdAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { activeLocation } = useLocationContext();

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const performSOSBroadcast = async (loc: typeof activeLocation) => {
    setBroadcasting(true);
    try {
      const userStr = await AsyncStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;
      const uid = user?.id || user?.user_id;

      const payload: any = {
        user_id: uid ? Number(uid) : undefined,
        username: user?.username || undefined,
        phone: user?.mob || user?.phone_number || undefined,
        type: "EMERGENCY_BROADCAST",
      };

      if (loc) {
        payload.latitude = loc.latitude;
        payload.longitude = loc.longitude;
        payload.location_name = loc.name;
        payload.location_source = loc.source;
      }

      // Retry once: SOS must not silently fail on a flaky connection
      let delivered = false;
      for (let attempt = 0; attempt < 2 && !delivered; attempt++) {
        try {
          const res = await api.post("/sos/trigger", payload, { timeout: 15000 });
          delivered = !!res.data?.success;
        } catch {
          delivered = false;
        }
      }

      if (!delivered) {
        // Never claim responders were alerted when the server did not receive the SOS
        Alert.alert(
          "SOS NOT DELIVERED",
          "We could not reach TrustTrip servers. Call emergency services directly now.",
          [
            { text: "Call 112", style: "destructive", onPress: () => Linking.openURL("tel:112") },
            { text: "Retry", onPress: () => performSOSBroadcast(loc) },
          ]
        );
        return;
      }

      triggerLocalNotification(
        "🚨 SOS Dispatched to Administration",
        loc
          ? `Emergency alert broadcast for ${loc.name}. Administration and local first responders have been notified.`
          : "Emergency distress signal sent. Administration and local first responders have been notified.",
        { type: "sos_dispatched", screen: "SOS" }
      );

      Alert.alert(
        "EMERGENCY ALERT BROADCAST",
        loc
          ? `Your location (${loc.name}) has been sent to TrustTrip responders. If you are in immediate danger, also call 112.`
          : "Distress signal sent without location. Turn on GPS if possible, and call 112 if you are in immediate danger.",
        [
          { text: "Call 112", onPress: () => Linking.openURL("tel:112") },
          {
            text: "Open Command Center",
            onPress: () =>
              navigation.navigate("SOSDetail", {
                emergency: { name: "National Emergency Dispatch", number: "112" },
              }),
          },
        ]
      );
    } catch {
      Alert.alert("SOS NOT DELIVERED", "Something went wrong. Call emergency services (112) directly.", [
        { text: "Call 112", style: "destructive", onPress: () => Linking.openURL("tel:112") },
        { text: "OK" },
      ]);
    } finally {
      setBroadcasting(false);
      setHoldingSOS(false);
      holdAnim.setValue(0);
    }
  };

  const handlePressIn = () => {
    setHoldingSOS(true);
    Animated.timing(holdAnim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        performSOSBroadcast(activeLocation);
      }
    });
  };

  const handlePressOut = () => {
    if (!broadcasting) {
      setHoldingSOS(false);
      Animated.timing(holdAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  };

  const callNumber = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {
      Alert.alert("Notice", `Unable to place call to ${number}. Please dial directly.`);
    });
  };

  return (
    <CosmicBackground variant="dark">
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <AppIcon name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Emergency SOS</Text>
          <Text style={styles.headerSubtitle}>Get immediate help</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* CONCENTRIC GLOWING RINGS WITH CENTRAL PULSATING SOS BUTTON */}
        <View style={styles.concentricWrapper}>
          <View style={styles.outerGlowRing}>
            <View style={styles.middleGlowRing}>
              <Animated.View
                style={[
                  styles.pulsingWrap,
                  {
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.sosCenterButton}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  activeOpacity={0.88}
                >
                  <AppIcon name="alert-circle" size={48} color="#FFFFFF" />
                  <Text style={styles.sosHoldPrompt}>
                    {broadcasting
                      ? "ALERTING..."
                      : holdingSOS
                      ? "HOLDING..."
                      : "Hold for 2 seconds"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        </View>

        {/* WARNING NOTICE BANNER */}
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            Your location will be shared with emergency contacts and authorities.
          </Text>
        </View>

        {/* EMERGENCY CONTACTS LIST */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
        </View>

        <View style={styles.contactsContainer}>
          {EMERGENCY_CONTACTS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.contactCard}
              onPress={() => callNumber(item.number)}
              activeOpacity={0.85}
            >
              <View style={styles.contactIconWrap}>
                <AppIcon name={item.icon} size={20} color="#FF4D5E" />
              </View>

              <Text style={styles.contactName}>{item.name}</Text>

              <View style={styles.contactCallRow}>
                <AppIcon name="call" size={16} color="#FF4D5E" />
                <Text style={styles.contactNumber}>{item.number}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="SOS" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#0B1120",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    alignItems: "center",
  },
  concentricWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 18,
  },
  outerGlowRing: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(255, 77, 94, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  middleGlowRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 77, 94, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulsingWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  sosCenterButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#FF4D5E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF4D5E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  sosHoldPrompt: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 8,
    textAlign: "center",
  },
  warningBanner: {
    width: "100%",
    backgroundColor: "rgba(255, 77, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 77, 94, 0.3)",
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  warningText: {
    fontSize: 12,
    color: "#FF8A96",
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "600",
  },
  sectionHeader: {
    width: "100%",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  contactsContainer: {
    width: "100%",
    gap: 10,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  contactIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 77, 94, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  contactName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginLeft: 12,
  },
  contactCallRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FF4D5E",
  },
});
