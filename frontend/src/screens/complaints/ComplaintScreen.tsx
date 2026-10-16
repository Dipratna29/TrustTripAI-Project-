import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import api from "../../config/api";
import { triggerLocalNotification } from "../../services/pushNotificationService";
import CosmicBackground from "../../components/common/CosmicBackground";
import SurfaceCard from "../../components/common/SurfaceCard";
import ScreenHeader from "../../components/common/ScreenHeader";
import AppIcon from "../../components/common/AppIcon";
import CustomBottomNav from "../../components/common/CustomBottomNav";
import ActiveLocationBar from "../../components/common/ActiveLocationBar";
import { useLocationContext } from "../../context/LocationContext";
import { colors, typography, radius, shadows, spacing } from "../../theme";

const CATEGORIES = [
  "Overpricing",
  "Women Safety",
  "No Washroom",
  "Language Problem",
  "Overcrowded Area",
  "Police Issue",
  "Dirty Area",
  "Fake Products",
  "Other",
];

export default function ComplaintScreen() {
  const navigation = useNavigation<any>();
  const [selectedCategory, setSelectedCategory] = useState("");
  const [complaint, setComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [acquiringLoc, setAcquiringLoc] = useState(false);
  const { activeLocation, isManual, detectGpsLocation, showFallback } = useLocationContext();

  const handleAttachLocation = async () => {
    if (activeLocation) {
      return; // Already attached
    }
    setAcquiringLoc(true);
    try {
      const success = await detectGpsLocation(true, false);
      if (!success) {
        showFallback('unavailable');
      }
    } finally {
      setAcquiringLoc(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCategory) {
      Alert.alert("Required Category", "Please select a complaint category.");
      return;
    }

    if (!complaint.trim()) {
      Alert.alert("Required Description", "Please describe the issue in detail.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await AsyncStorage.getItem("user");
      if (!user) {
        Alert.alert("Session Error", "Please sign in to submit a complaint.");
        return;
      }

      const parsedUser = JSON.parse(user);
      const username = parsedUser.username;

      const response = await api.post("/complaint", {
        username: username,
        category: selectedCategory,
        description: complaint.trim(),
        latitude: activeLocation?.latitude || null,
        longitude: activeLocation?.longitude || null,
        location_name: activeLocation?.name || null,
      });

      if (response.status >= 200 && response.status < 300) {
        triggerLocalNotification(
          "📋 Complaint Submitted to Authorities",
          `Your report regarding "${selectedCategory}" has been received and assigned for review.`,
          { type: "complaint_submitted", screen: "MyComplaints" }
        );

        Alert.alert("Report Filed", "Your complaint has been submitted successfully to local authorities.", [
          { text: "View Reports", onPress: () => navigation.navigate("MyComplaints") },
        ]);
        setComplaint("");
        setSelectedCategory("");
      } else {
        Alert.alert("Submission Issue", response.data?.message || "Could not submit report.");
      }
    } catch {
      Alert.alert("Error", "Could not submit complaint. Please check your network connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const getSuggestion = () => {
    if (selectedCategory === "Overpricing")
      return "Tip: Check verified shop list in Local Guide section.";
    if (selectedCategory === "Women Safety")
      return "Tip: Use the SOS button for immediate responder dispatch.";
    if (selectedCategory === "No Washroom")
      return "Tip: Check nearby amenities in the Women Safety section.";
    if (selectedCategory === "Language Problem")
      return "Tip: Use the in-app AI Translator tool.";
    if (selectedCategory === "Overcrowded Area")
      return "Tip: Check the Crowd Density Radar for alternate routes.";
    if (selectedCategory === "Police Issue")
      return "Tip: Use SOS button for emergency authority dispatch.";
    if (selectedCategory === "Dirty Area")
      return "Tip: Environmental reports are forwarded to tourism sanitation teams.";
    if (selectedCategory === "Fake Products")
      return "Tip: Report merchant details for regulatory inspection.";
    if (selectedCategory === "Other")
      return "Tip: Please provide specific landmark & time details.";
    return null;
  };

  const tip = getSuggestion();

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Report an Issue"
        subtitle="Submit complaints to safety authorities"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            style={styles.myReportsBtn}
            onPress={() => navigation.navigate("MyComplaints")}
          >
            <Text style={styles.myReportsBtnText}>My Reports</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* CATEGORY SELECTION */}
          <Text style={styles.sectionTitle}>SELECT ISSUE CATEGORY</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                  onPress={() => setSelectedCategory(cat)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* AI / GUARDIAN TIP */}
          {tip && (
            <SurfaceCard style={styles.tipCard}>
              <View style={styles.tipRow}>
                <AppIcon name="sparkles" size={18} color={colors.cream} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            </SurfaceCard>
          )}

          {/* DESCRIPTION INPUT */}
          <Text style={styles.sectionTitle}>INCIDENT DETAILS</Text>
          <SurfaceCard style={styles.inputCard}>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={5}
              placeholder="Describe what happened, merchant or vehicle details, landmarks..."
              placeholderTextColor={colors.textMuted}
              value={complaint}
              onChangeText={setComplaint}
            />
          </SurfaceCard>

          {/* ACTIVE LOCATION FOR COMPLAINT */}
          <Text style={styles.sectionTitle}>INCIDENT LOCATION</Text>
          <ActiveLocationBar style={{ marginBottom: 12 }} />

          {/* SUBMIT BUTTON */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? "Submitting Report..." : "Submit Incident Report"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="MyComplaints" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  myReportsBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: `${colors.primary}18`,
  },
  myReportsBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 90,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 8,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  categoryChip: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  categoryTextSelected: {
    color: colors.white,
    fontWeight: "800",
  },
  tipCard: {
    padding: 12,
    marginBottom: 16,
    borderColor: "rgba(251, 226, 180, 0.25)",
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tipText: {
    ...typography.caption,
    color: colors.cream,
    flex: 1,
    lineHeight: 18,
  },
  inputCard: {
    padding: 14,
    marginBottom: 16,
  },
  textArea: {
    color: colors.textPrimary,
    fontSize: 14,
    textAlignVertical: "top",
    minHeight: 110,
  },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.button,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 20,
  },
  locationBtnAttached: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  locationBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  locationBtnTextAttached: {
    color: colors.white,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glowPrimary,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    fontWeight: "800",
    color: colors.white,
  },
});
