import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { getFriendlyErrorMessage } from "../utils/apiError";
import CosmicBackground from "../components/common/CosmicBackground";
import AppIcon from "../components/common/AppIcon";
import { radius } from "../theme";

export default function RegisterScreen({ navigation }: any) {
  const { register: authRegister } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState("Indian");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mob, setMobile] = useState("");
  const [emergency_contact, setEmergencyContact] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleNextOrSubmit = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert("Required Field", "Please enter your full name.");
        return;
      }
      if (!username.trim()) {
        Alert.alert("Required Field", "Please choose a username.");
        return;
      }
      if (!password) {
        Alert.alert("Required Field", "Please enter a password.");
        return;
      }
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        Alert.alert("Security Requirement", "Password must be at least 8 characters and include a letter and a number.");
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert("Password Mismatch", "Passwords do not match. Please verify your password confirmation.");
        return;
      }
      // Proceed to Step 2 (Phone & Emergency Contact) or register directly
      submitRegistration();
    }
  };

  const submitRegistration = async () => {
    setLoading(true);
    try {
      const result = await authRegister({
        username: username.trim(),
        password,
        name: name.trim(),
        mob: mob.trim() || "N/A",
        address: "N/A",
        nationality: nationality.trim() || "Indian",
        emergency_contact: emergency_contact.trim() || "112",
      });

      if (result.success) {
        Alert.alert(
          "Account Created",
          "Your TrustTrip traveler account has been created successfully. Welcome to TrustTrip!",
          [
            {
              text: "Sign In",
              onPress: () => navigation.replace("Login"),
            },
          ]
        );
      } else {
        Alert.alert("Registration Notice", result.message || "Unable to create account.");
      }
    } catch (err: any) {
      const friendly = getFriendlyErrorMessage(
        err,
        "Registration failed. Please check your network and try again."
      );
      Alert.alert("Registration Notice", friendly);
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
            {/* TOP HEADER WITH BACK BUTTON */}
            <View style={styles.topHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
              >
                <AppIcon name="arrow-back" size={20} color="#0F172A" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Create Account</Text>
            </View>

            <Text style={styles.headerSubtitle}>
              Join TrustTrip and travel with confidence
            </Text>

            {/* STEP PROGRESS INDICATOR (1 - 2 - 3) */}
            <View style={styles.stepContainer}>
              <View style={[styles.stepCircle, styles.stepCircleActive]}>
                <Text style={styles.stepTextActive}>1</Text>
              </View>
              <View style={styles.stepLine} />
              <View style={styles.stepCircle}>
                <Text style={styles.stepText}>2</Text>
              </View>
              <View style={styles.stepLine} />
              <View style={styles.stepCircle}>
                <Text style={styles.stepText}>3</Text>
              </View>
            </View>

            {/* FORM CONTAINER */}
            <View style={styles.formCard}>
              {/* FULL NAME */}
              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "name" && styles.inputWrapperFocused,
                  ]}
                >
                  <AppIcon
                    name="person-outline"
                    size={18}
                    color={focusedField === "name" ? "#00C292" : "#94A3B8"}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor="#94A3B8"
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* NATIONALITY */}
              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "nationality" && styles.inputWrapperFocused,
                  ]}
                >
                  <AppIcon
                    name="globe-outline"
                    size={18}
                    color={focusedField === "nationality" ? "#00C292" : "#94A3B8"}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Nationality (e.g. Indian)"
                    placeholderTextColor="#94A3B8"
                    value={nationality}
                    onChangeText={setNationality}
                    onFocus={() => setFocusedField("nationality")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* USERNAME */}
              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "username" && styles.inputWrapperFocused,
                  ]}
                >
                  <AppIcon
                    name="at-outline"
                    size={18}
                    color={focusedField === "username" ? "#00C292" : "#94A3B8"}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Username"
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

              {/* PASSWORD */}
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
                  >
                    <AppIcon
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* CONFIRM PASSWORD */}
              <View style={styles.inputGroup}>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === "confirmPassword" && styles.inputWrapperFocused,
                  ]}
                >
                  <AppIcon
                    name="lock-closed-outline"
                    size={18}
                    color={focusedField === "confirmPassword" ? "#00C292" : "#94A3B8"}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm Password"
                    placeholderTextColor="#94A3B8"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedField("confirmPassword")}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeBtn}
                  >
                    <AppIcon
                      name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color="#94A3B8"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* NEXT / CREATE ACCOUNT BUTTON */}
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
                onPress={handleNextOrSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Next</Text>
                )}
              </TouchableOpacity>

              {/* SIGN IN FOOTER */}
              <View style={styles.footerRow}>
                <Text style={styles.footerPrompt}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate("Login")}>
                  <Text style={styles.footerLink}>Sign In</Text>
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
    paddingTop: 16,
    paddingBottom: 32,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginLeft: 48,
    marginBottom: 20,
  },
  stepContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  stepCircleActive: {
    backgroundColor: "#00C292",
    borderColor: "#00C292",
  },
  stepText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },
  stepTextActive: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 8,
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: radius.card,
    paddingHorizontal: 14,
    height: 50,
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
  primaryBtn: {
    backgroundColor: "#00C292",
    borderRadius: radius.button,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
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
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },
  footerPrompt: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  footerLink: {
    fontSize: 13,
    fontWeight: "800",
    color: "#00C292",
  },
});
