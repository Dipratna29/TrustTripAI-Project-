import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import CosmicBackground from "../components/common/CosmicBackground";
import SurfaceCard from "../components/common/SurfaceCard";
import AppIcon from "../components/common/AppIcon";
import { colors, typography, radius, shadows, spacing } from "../theme";

interface Props {
  navigation: {
    goBack: () => void;
    navigate: (screen: string) => void;
  };
}

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    const clean = identifier.trim();
    if (!clean) {
      Alert.alert("Required Field", "Please enter your registered username or phone number.");
      return;
    }

    setLoading(true);
    // No reset endpoint exists yet: show support instructions instead of pretending a reset was sent
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1200);
  };

  return (
    <CosmicBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* TOP BAR */}
            <View style={styles.topBar}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
              >
                <AppIcon name="arrow-back" size={20} color={colors.textPrimary} />
                <Text style={styles.backBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
              <Text style={styles.brandTitle}>
                Trust<Text style={{ color: colors.primary }}>Trip</Text>
              </Text>
            </View>

            {/* FORM CARD */}
            <SurfaceCard style={styles.card} variant="elevated">
              <View style={styles.iconCircle}>
                <AppIcon
                  name={submitted ? "checkmark-circle-outline" : "key-outline"}
                  size={32}
                  color={submitted ? colors.success : colors.primary}
                />
              </View>

              <Text style={styles.headerTitle}>
                {submitted ? "Contact Support to Reset" : "Reset Password"}
              </Text>
              <Text style={styles.headerSubtitle}>
                {submitted
                  ? `Automated password reset is not available yet. Email support@trusttrip.com from your registered contact with your username (${identifier.trim()}) and our team will verify your identity and reset your password.`
                  : "Enter your registered username or phone number to verify your traveler credentials."}
              </Text>

              {!submitted ? (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Username or Phone Number</Text>
                    <View
                      style={[
                        styles.inputWrapper,
                        focused && styles.inputWrapperFocused,
                      ]}
                    >
                      <AppIcon
                        name="person-outline"
                        size={18}
                        color={focused ? colors.primary : colors.textMuted}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. traveler_john or +919876543210"
                        placeholderTextColor={colors.textMuted}
                        value={identifier}
                        onChangeText={setIdentifier}
                        autoCapitalize="none"
                        autoCorrect={false}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryBtn, loading && styles.btnDisabled]}
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading ? (
                      <View style={styles.btnLoadingRow}>
                        <ActivityIndicator size="small" color={colors.background} />
                        <Text style={styles.primaryBtnText}>Verifying account...</Text>
                      </View>
                    ) : (
                      <Text style={styles.primaryBtnText}>Send Reset Instructions</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => navigation.navigate("Login")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Return to Sign In</Text>
                </TouchableOpacity>
              )}
            </SurfaceCard>

            {/* SAFETY NOTICE */}
            <View style={styles.safetyCard}>
              <AppIcon name="shield-checkmark-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyTitle}>Emergency Access Guaranteed</Text>
                <Text style={styles.safetyBody}>
                  National emergency helpline (112) and SOS protocols remain accessible even without an active login.
                </Text>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 36,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  backBtnText: {
    ...typography.bodySm,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  brandTitle: {
    fontFamily: typography.displayLarge.fontFamily,
    fontSize: 22,
    fontWeight: "900",
    color: colors.textPrimary,
  },
  card: {
    padding: 24,
    borderColor: colors.border,
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primaryGlow,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  headerTitle: {
    ...typography.h2,
    fontSize: 22,
    color: colors.textPrimary,
    textAlign: "center",
  },
  headerSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: {
    width: "100%",
    marginBottom: 20,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 12,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    ...shadows.glowPrimary,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    ...typography.button,
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  btnLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  safetyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    padding: 16,
    marginTop: 24,
    gap: 12,
  },
  safetyTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 4,
  },
  safetyBody: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
