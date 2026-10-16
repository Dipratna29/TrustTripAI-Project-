import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import api from "../config/api";
import CosmicBackground from "../components/common/CosmicBackground";
import SurfaceCard from "../components/common/SurfaceCard";
import AppIcon from "../components/common/AppIcon";
import { getFriendlyErrorMessage } from "../utils/apiError";
import { colors, typography, radius, shadows, spacing } from "../theme";

interface Props {
  navigation: {
    goBack: () => void;
    navigate: (screen: string) => void;
  };
}

type Step = "request" | "verify" | "done";

const RESEND_SECONDS = 60;

export const passwordProblem = (pw: string, confirm: string) => {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must include a letter and a number.";
  if (pw !== confirm) return "Passwords do not match.";
  return null;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    const clean = identifier.trim();
    if (!clean) {
      setError("Enter your username or registered phone number (with country code, e.g. +91...).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/auth/password-reset/request", { identifier: clean }, { timeout: 30000 });
      setInfo(res.data?.message || "If an account matches, a reset code has been sent by SMS.");
      setStep("verify");
      setCooldown(RESEND_SECONDS);
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err, "Could not request a reset code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from the SMS.");
      return;
    }
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post(
        "/auth/password-reset/confirm",
        { identifier: identifier.trim(), code: code.trim(), new_password: password },
        { timeout: 30000 }
      );
      setPassword("");
      setConfirm("");
      setStep("done");
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err, "Could not reset your password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const field = (
    key: string,
    label: string,
    icon: string,
    value: string,
    onChange: (v: string) => void,
    extra: Partial<React.ComponentProps<typeof TextInput>> = {}
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputWrapper, focused === key && styles.inputWrapperFocused]}>
        <AppIcon name={icon} size={18} color={focused === key ? colors.primary : colors.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(v) => {
            onChange(v);
            setError(null);
          }}
          onFocus={() => setFocused(key)}
          onBlur={() => setFocused(null)}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          {...extra}
        />
      </View>
    </View>
  );

  const title = step === "request" ? "Reset Password" : step === "verify" ? "Enter Reset Code" : "Password Changed";
  const subtitle =
    step === "request"
      ? "Enter your username or registered phone number. We'll text a 6-digit code to the phone on your account."
      : step === "verify"
      ? info || "Enter the code from the SMS and choose a new password. The code expires in 10 minutes."
      : "Your password has been updated. Sign in with your new password.";

  return (
    <CosmicBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                <AppIcon name="arrow-back" size={18} color={colors.textPrimary} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.brandTitle}>
                Trust<Text style={{ color: colors.primary }}>Trip</Text>
              </Text>
            </View>

            <SurfaceCard style={styles.card} variant="elevated">
              <View style={styles.iconCircle}>
                <AppIcon name={step === "done" ? "checkmark-circle" : "lock-closed-outline"} size={30} color={colors.primary} />
              </View>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSubtitle}>{subtitle}</Text>

              {step === "request" &&
                field("identifier", "Username or Phone Number", "person-outline", identifier, setIdentifier, {
                  placeholder: "e.g. asha or +919876543210",
                  returnKeyType: "send",
                  onSubmitEditing: requestCode,
                })}

              {step === "verify" && (
                <>
                  {field("code", "6-Digit Code", "chatbubble-ellipses-outline", code, (v) => setCode(v.replace(/\D/g, "").slice(0, 6)), {
                    placeholder: "123456",
                    keyboardType: "number-pad",
                    textContentType: "oneTimeCode",
                    autoComplete: "sms-otp",
                    maxLength: 6,
                  })}
                  {field("password", "New Password", "lock-closed-outline", password, setPassword, {
                    placeholder: "At least 8 characters, letters + numbers",
                    secureTextEntry: !showPassword,
                    textContentType: "newPassword",
                  })}
                  {field("confirm", "Confirm New Password", "lock-closed-outline", confirm, setConfirm, {
                    placeholder: "Repeat new password",
                    secureTextEntry: !showPassword,
                  })}
                  <TouchableOpacity onPress={() => setShowPassword((s) => !s)} style={styles.linkRow}>
                    <Text style={styles.linkText}>{showPassword ? "Hide passwords" : "Show passwords"}</Text>
                  </TouchableOpacity>
                </>
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {step !== "done" ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.btnDisabled]}
                  onPress={step === "request" ? requestCode : confirmReset}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <View style={styles.btnLoadingRow}>
                      <ActivityIndicator size="small" color={colors.white} />
                      <Text style={styles.primaryBtnText}>{step === "request" ? "Sending code..." : "Updating..."}</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryBtnText}>{step === "request" ? "Send Reset Code" : "Change Password"}</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate("Login")} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>Return to Sign In</Text>
                </TouchableOpacity>
              )}

              {step === "verify" && (
                <View style={styles.resendRow}>
                  <TouchableOpacity onPress={requestCode} disabled={cooldown > 0 || loading}>
                    <Text style={[styles.linkText, (cooldown > 0 || loading) && { color: colors.textMuted }]}>
                      {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setStep("request");
                      setCode("");
                      setError(null);
                    }}
                  >
                    <Text style={styles.linkText}>Change account</Text>
                  </TouchableOpacity>
                </View>
              )}
            </SurfaceCard>

            <View style={styles.safetyCard}>
              <AppIcon name="shield-checkmark-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.safetyTitle}>No SMS? Emergency access still works</Text>
                <Text style={styles.safetyBody}>
                  Codes go only to the phone number registered on the account. If you no longer have it, contact
                  support@trusttrip.com. The 112 helpline and SOS work without signing in.
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
  errorText: {
    ...typography.caption,
    color: colors.danger,
    alignSelf: "stretch",
    marginBottom: 12,
    lineHeight: 18,
  },
  linkRow: {
    alignSelf: "flex-end",
    marginTop: -10,
    marginBottom: 14,
  },
  linkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  resendRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
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
