import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { send_notification_to_user_welcome } from "../services/pushNotificationService";
import { useAuth } from "../context/AuthContext";
import CosmicBackground from "../components/common/CosmicBackground";
import AppIcon from "../components/common/AppIcon";
import { radius } from "../theme";

interface Props {
  navigation: {
    navigate: (screen: string) => void;
  };
  loginUser?: (user: any) => void;
}

export default function LoginScreen({ navigation, loginUser }: Props) {
  const { login: authLogin } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"username" | "password" | null>(null);

  const validate = (): string | null => {
    if (!username.trim()) return "Please enter your username.";
    if (!password) return "Please enter your password.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  };

  const login = async () => {
    if (loading) return;

    const error = validate();
    if (error) {
      Alert.alert("Required Information", error);
      return;
    }

    setLoading(true);
    try {
      const result = await authLogin(username, password);

      if (result.success) {
        try {
          const userRaw = await AsyncStorage.getItem("user");
          if (userRaw) {
            const parsed = JSON.parse(userRaw);
            const uid = parsed.id || parsed.user_id;
            if (uid) {
              const storageKey = `firstLogin_${uid}`;
              const hasLoggedIn = await AsyncStorage.getItem(storageKey);
              if (!hasLoggedIn) {
                await AsyncStorage.setItem(storageKey, "true");
                send_notification_to_user_welcome(uid).catch(() => {});
              }
            }
            if (loginUser) {
              loginUser(parsed);
            }
          }
        } catch {
          // Non-critical background task
        }
      } else {
        Alert.alert(
          "Sign In Failed",
          result.message || "Invalid username or password. Please verify your credentials."
        );
      }
    } catch {
      Alert.alert(
        "Connection Notice",
        "Unable to reach TrustTrip services. Please verify your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <CosmicBackground variant="light">
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
            {/* BRAND HEADER */}
            <View style={styles.brandContainer}>
              <View style={styles.brandIconWrap}>
                <AppIcon name="shield-checkmark" size={32} color="#00C292" />
              </View>
              <Text style={styles.brandTitle}>
                Trust<Text style={{ color: "#00C292" }}>Trip</Text>
              </Text>
              <Text style={styles.brandSubtitle}>Travel Safe, Travel Smart.</Text>
            </View>

            {/* WHITE FORM CARD */}
            <View style={styles.card}>
              <Text style={styles.welcomeTitle}>Welcome back</Text>
              <Text style={styles.welcomeSubtitle}>Sign in to your account</Text>

              {/* USERNAME INPUT */}
              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "username" && styles.inputWrapperFocused,
                  ]}
                >
                  <AppIcon
                    name="mail-outline"
                    size={18}
                    color={focusedField === "username" ? "#00C292" : "#94A3B8"}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email or Username"
                    placeholderTextColor="#94A3B8"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedField("username")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* PASSWORD INPUT */}
              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "password" && styles.inputWrapperFocused,
                  ]}
                >
                  <AppIcon
                    name="lock-closed-outline"
                    size={18}
                    color={focusedField === "password" ? "#00C292" : "#94A3B8"}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    accessibilityLabel="Toggle password visibility"
                  >
                    <AppIcon
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => navigation.navigate("ForgotPassword")}
                  activeOpacity={0.7}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>

              {/* PRIMARY SIGN IN BUTTON */}
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={login}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Sign In</Text>
                )}
              </TouchableOpacity>

              {/* SOCIAL DIVIDER */}
              <View style={styles.socialDividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.socialDividerText}>Or continue with</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* SOCIAL BUTTONS */}
              <View style={styles.socialButtonsRow}>
                <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
                  <AppIcon name="logo-google" size={18} color="#EA4335" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialBtn} activeOpacity={0.8}>
                  <AppIcon name="logo-apple" size={20} color="#0F172A" />
                </TouchableOpacity>
              </View>

              {/* REGISTER PROMPT */}
              <View style={styles.registerRow}>
                <Text style={styles.registerPrompt}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate("Register")}>
                  <Text style={styles.registerLink}>Sign Up</Text>
                </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 28,
  },
  brandContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  brandIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.card,
    paddingHorizontal: 14,
    height: 52,
  },
  inputWrapperFocused: {
    borderColor: "#00C292",
    backgroundColor: "#FFFFFF",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "500",
  },
  eyeBtn: {
    padding: 6,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    marginTop: 8,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#00C292",
  },
  primaryBtn: {
    backgroundColor: "#00C292",
    borderRadius: radius.button,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    shadowColor: "#00C292",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  socialDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  socialDividerText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
    marginHorizontal: 12,
  },
  socialButtonsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 20,
  },
  socialBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerPrompt: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  registerLink: {
    fontSize: 13,
    fontWeight: "800",
    color: "#00C292",
  },
});
