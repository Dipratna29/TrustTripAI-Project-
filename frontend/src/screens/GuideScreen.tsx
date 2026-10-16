import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  TextInput,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import api from "../config/api";
import { triggerLocalNotification } from "../services/pushNotificationService";
import CosmicBackground from "../components/common/CosmicBackground";
import SurfaceCard from "../components/common/SurfaceCard";
import ScreenHeader from "../components/common/ScreenHeader";
import AppIcon from "../components/common/AppIcon";
import { StatusBadge } from "../components/common/StatusIndicator";
import CustomBottomNav from "../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../theme";

type Guide = {
  g_id: number;
  name: string;
  languages: string;
  status: string;
  rating: number;
  booked_by_user?: boolean;
};

const guideImages = [
  "https://randomuser.me/api/portraits/men/11.jpg",
  "https://randomuser.me/api/portraits/women/21.jpg",
  "https://randomuser.me/api/portraits/men/31.jpg",
  "https://randomuser.me/api/portraits/women/41.jpg",
  "https://randomuser.me/api/portraits/men/51.jpg",
  "https://randomuser.me/api/portraits/women/61.jpg",
  "https://randomuser.me/api/portraits/men/71.jpg",
  "https://randomuser.me/api/portraits/women/81.jpg",
];

export default function GuideScreen() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [filteredGuides, setFilteredGuides] = useState<Guide[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookedGuideIds, setBookedGuideIds] = useState<Set<number>>(new Set());
  const navigation = useNavigation<any>();

  useEffect(() => {
    fetchGuides();
  }, []);

  useEffect(() => {
    if (searchText.trim() === "") {
      setFilteredGuides(guides);
    } else {
      const lower = searchText.toLowerCase();
      setFilteredGuides(
        guides.filter(
          (g) =>
            g.name.toLowerCase().includes(lower) ||
            g.languages.toLowerCase().includes(lower)
        )
      );
    }
  }, [searchText, guides]);

  const fetchGuides = async () => {
    setLoading(true);
    try {
      const userData = await AsyncStorage.getItem("user");
      const username = userData ? JSON.parse(userData).username : null;
      const res = await api.get("/guides", {
        params: username ? { username } : {},
      });

      const guideData = Array.isArray(res.data) ? res.data : [];
      setGuides(guideData);

      const bookedIds = new Set<number>();
      guideData.forEach((guide: Guide) => {
        if (guide.booked_by_user) {
          bookedIds.add(guide.g_id);
        }
      });
      setBookedGuideIds(bookedIds);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const getUsername = async (): Promise<string | null> => {
    const userData = await AsyncStorage.getItem("user");
    if (!userData) {
      Alert.alert("Session Error", "Please sign in to book a guide.");
      return null;
    }
    return JSON.parse(userData).username;
  };

  const selectGuide = async (guideId: number) => {
    const username = await getUsername();
    if (!username) return;
    try {
      await api.post("/select-guide", { guide_id: guideId, username });
      setBookedGuideIds((prev) => new Set(prev).add(guideId));
      await fetchGuides();
      triggerLocalNotification(
        "🧭 Guide Reserved Successfully",
        "Your certified local guide has been reserved and contact details shared.",
        { type: "guide_requested", screen: "Guide", guide_id: guideId }
      );
      Alert.alert("Guide Booked ✅", "Your certified local guide has been reserved.");
    } catch {
      Alert.alert("Booking Error", "Could not complete guide booking. Please try again.");
    }
  };

  const cancelGuide = async (guideId: number) => {
    const username = await getUsername();
    if (!username) return;
    try {
      await api.post("/cancel-booking", { guide_id: guideId, username });
      setBookedGuideIds((prev) => {
        const copy = new Set(prev);
        copy.delete(guideId);
        return copy;
      });
      await fetchGuides();
      triggerLocalNotification(
        "ℹ️ Guide Reservation Cancelled",
        "Your booking with the certified local guide has been cancelled.",
        { type: "guide_cancelled", screen: "Guide", guide_id: guideId }
      );
      Alert.alert("Booking Cancelled", "Your guide reservation has been cancelled.");
    } catch {
      Alert.alert("Error", "Could not cancel booking. Please try again.");
    }
  };

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Verified Local Guides"
        subtitle="Certified regional storytellers & safety escorts"
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchGuides}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* SEARCH BAR */}
        <View style={styles.searchContainer}>
          <AppIcon name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by guide name or language..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <AppIcon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* GUIDES LIST */}
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>Available Guides</Text>
          <Text style={styles.countBadge}>{filteredGuides.length} Verified</Text>
        </View>

        {filteredGuides.length === 0 && !loading ? (
          <SurfaceCard style={styles.emptyCard}>
            <AppIcon name="compass-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Guides Found</Text>
            <Text style={styles.emptyDesc}>Try searching for a different language or name.</Text>
          </SurfaceCard>
        ) : (
          filteredGuides.map((guide, index) => {
            const isBooked = bookedGuideIds.has(guide.g_id);
            const avatarUri = guideImages[index % guideImages.length];

            return (
              <SurfaceCard key={guide.g_id} style={styles.guideCard} variant="elevated">
                <View style={styles.guideTopRow}>
                  <View style={styles.avatarCircle}>
                    <AppIcon name="person" size={26} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <View style={styles.nameRow}>
                      <Text style={typography.h4}>{guide.name}</Text>
                      <AppIcon name="shield-checkmark" size={16} color={colors.primary} />
                    </View>

                    <View style={styles.ratingRow}>
                      <AppIcon name="star" size={14} color={colors.cream} />
                      <Text style={styles.ratingText}>
                        {Number(guide.rating || 4.8).toFixed(1)}
                      </Text>
                      <Text style={styles.ratingCount}>• Verified Local Guide</Text>
                    </View>

                    <View style={styles.langRow}>
                      <AppIcon name="language-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.langText}>{guide.languages || "English, Regional"}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <StatusBadge
                    label={isBooked ? "BOOKED BY YOU" : guide.status || "AVAILABLE"}
                    status={isBooked ? "moderate" : "ready"}
                  />

                  {isBooked ? (
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => cancelGuide(guide.g_id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cancelBtnText}>Cancel Booking</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.bookBtn}
                      onPress={() => selectGuide(guide.g_id)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.bookBtnText}>Book Guide</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </SurfaceCard>
            );
          })
        )}
      </ScrollView>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="Guide" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 90,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  countBadge: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  guideCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  guideTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(0, 194, 146, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(0, 194, 146, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    ...typography.caption,
    color: "#F59E0B",
    fontWeight: "800",
  },
  ratingCount: {
    ...typography.caption,
    color: "#64748B",
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  langText: {
    ...typography.caption,
    color: "#64748B",
    fontSize: 11,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  bookBtn: {
    backgroundColor: "#00C292",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
  },
  bookBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.white,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: colors.borderDanger,
    backgroundColor: colors.dangerSurface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 8,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 8,
  },
  emptyDesc: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
});