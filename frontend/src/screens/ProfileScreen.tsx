import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import api from "../config/api";
import CosmicBackground from "../components/common/CosmicBackground";
import { useAuth } from "../context/AuthContext";
import AppIcon from "../components/common/AppIcon";
import CustomBottomNav from "../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../theme";

export default function ProfileScreen({ logoutUser, navigation }: any) {
  const { user, logout: authLogout, refreshProfile: authRefreshProfile, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(user?.profile_photo_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [mob, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [nationality, setNationality] = useState("");
  const [emergency_contact, setEmergency] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const user = await AsyncStorage.getItem("user");
      if (!user) return;

      const parsedUser = JSON.parse(user);
      const uname = parsedUser.username;
      setUsername(uname);

      const response = await api.get(`/profile/${uname}`);
      const data = response.data;

      setName(data.name || "");
      setMobile(data.mob || "");
      setAddress(data.address || "");
      setNationality(data.nationality || "");
      setEmergency(data.emergency_contact || "");
      setPhotoUrl(data.profile_photo_url || null);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await api.put(`/profile/${username}`, {
        name,
        mob,
        address,
        nationality,
        emergency_contact,
      });

      if (response.status >= 200 && response.status < 300) {
        Alert.alert("Success", "Your profile details have been saved.");
        setEditModalVisible(false);
        setEmergencyModalVisible(false);
        authRefreshProfile().catch(() => {});
      } else {
        Alert.alert("Notice", "Profile update could not be saved. Please try again.");
      }
    } catch {
      Alert.alert("Notice", "Unable to update profile. Please check your network.");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      Alert.alert("Photo", "Could not read the selected image. Please try another photo.");
      return;
    }
    // ~2 MB server limit; base64 is ~4/3 of the binary size
    if (asset.base64.length > 2.6 * 1024 * 1024) {
      Alert.alert("Photo too large", "Please choose a smaller photo (under 2 MB).");
      return;
    }
    setUploadingPhoto(true);
    try {
      const mime = asset.mimeType && asset.mimeType.startsWith("image/") ? asset.mimeType : "image/jpeg";
      const res = await api.post(
        `/profile/${username || user?.username}/photo`,
        { image_base64: asset.base64, mime_type: mime },
        { timeout: 30000 }
      );
      const url = res.data?.profile_photo_url;
      if (url) {
        setPhotoUrl(url);
        await updateUser({ profile_photo_url: url });
      }
    } catch (err: any) {
      Alert.alert("Upload failed", err?.response?.data?.message || "Could not upload your photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const pickPhoto = async (source: "camera" | "library") => {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", `Please allow ${source === "camera" ? "camera" : "photo library"} access in Settings.`);
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets?.[0]) {
        await uploadPhoto(result.assets[0]);
      }
    } catch (err) {
      console.log("[ProfileScreen] pickPhoto error:", err);
      Alert.alert("Photo", "Could not open the camera or gallery on this device.");
    }
  };

  const removePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await api.delete(`/profile/${username || user?.username}/photo`);
      setPhotoUrl(null);
      await updateUser({ profile_photo_url: null });
    } catch {
      Alert.alert("Photo", "Could not remove the photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openPhotoOptions = () => {
    const buttons: any[] = [
      { text: "Take Photo", onPress: () => pickPhoto("camera") },
      { text: "Choose from Gallery", onPress: () => pickPhoto("library") },
    ];
    if (photoUrl) buttons.push({ text: "Remove Photo", style: "destructive", onPress: removePhoto });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile Photo", "Update your profile picture", buttons);
  };

  const handleLogout = async () => {
    Alert.alert(
      "Confirm Sign Out",
      "Are you sure you want to end your active TrustTrip security session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await authLogout();
              if (logoutUser) logoutUser();
            } catch (err) {
              console.log("[ProfileScreen] Logout error:", err);
            }
          },
        },
      ]
    );
  };

  return (
    <CosmicBackground variant="dark">
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Traveler Profile</Text>
          <Text style={styles.headerSubtitle}>Manage your account</Text>
        </View>
        <TouchableOpacity
          style={styles.headerActionBtn}
          onPress={fetchProfile}
          activeOpacity={0.8}
        >
          <AppIcon name="refresh-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* AVATAR & USER INFO */}
        <View style={styles.profileHero}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity style={styles.avatarCircle} onPress={openPhotoOptions} activeOpacity={0.85}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
              ) : (
                <AppIcon name="person" size={42} color={colors.textSecondary} />
              )}
              {uploadingPhoto && (
                <View style={styles.avatarLoading}>
                  <ActivityIndicator color={colors.white} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={openPhotoOptions}
              disabled={uploadingPhoto}
              activeOpacity={0.8}
            >
              <AppIcon name="camera" size={13} color={colors.white} />
            </TouchableOpacity>
          </View>

          <Text style={styles.displayName}>{name || username || user?.name || "Traveler"}</Text>
          <Text style={styles.displayHandle}>@{username || user?.username || ""}</Text>

          <View style={styles.verifiedPill}>
            <AppIcon name="checkmark-circle" size={14} color={colors.primary} />
            <Text style={styles.verifiedText}>Verified Traveler</Text>
          </View>
        </View>

        {/* WHITE CARD MENU CONTAINER */}
        <View style={styles.menuCard}>
          {/* Personal Information */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => setEditModalVisible(true)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <AppIcon name="person-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.menuTitle}>Personal Information</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Emergency Contacts */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => setEmergencyModalVisible(true)}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <AppIcon name="call-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.menuTitle}>Emergency Contacts</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Safety Preferences */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert("Safety Preferences", "High security alerts & live GPS tracking are active.")}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <AppIcon name="shield-checkmark-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.menuTitle}>Safety Preferences</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Payment Methods */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("MyOrders")}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <AppIcon name="card-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.menuTitle}>Payment Methods</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Notifications */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("Notifications")}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <AppIcon name="notifications-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.menuTitle}>Notifications</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Privacy & Security */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => Alert.alert("Privacy & Security", "End-to-end encrypted telemetry and secure auth token enabled.")}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <AppIcon name="lock-closed-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.menuTitle}>Privacy & Security</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Help & Support */}
          <TouchableOpacity
            style={styles.menuItem}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("ChatBot")}
          >
            <View style={styles.menuLeft}>
              <View style={styles.menuIconBox}>
                <AppIcon name="help-circle-outline" size={18} color="#64748B" />
              </View>
              <Text style={styles.menuTitle}>Help & Support</Text>
            </View>
            <AppIcon name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* SIGN OUT BUTTON */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <AppIcon name="power-outline" size={18} color={colors.white} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* PERSONAL INFO EDIT MODAL */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Personal Information</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <AppIcon name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <TextInput
                style={styles.modalInput}
                value={name}
                onChangeText={setName}
                placeholder="Enter full name"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>NATIONALITY</Text>
              <TextInput
                style={styles.modalInput}
                value={nationality}
                onChangeText={setNationality}
                placeholder="Country of origin"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
              <TextInput
                style={styles.modalInput}
                value={mob}
                onChangeText={setMobile}
                placeholder="Mobile number"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>ADDRESS</Text>
              <TextInput
                style={styles.modalInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Hotel or residential address"
                placeholderTextColor="#94A3B8"
              />

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* EMERGENCY CONTACTS MODAL */}
      <Modal visible={emergencyModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Emergency Contact</Text>
              <TouchableOpacity onPress={() => setEmergencyModalVisible(false)}>
                <AppIcon name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>EMERGENCY PHONE NUMBER</Text>
            <TextInput
              style={styles.modalInput}
              value={emergency_contact}
              onChangeText={setEmergency}
              placeholder="e.g. +91 9876543210"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />
            <Text style={styles.fieldNote}>
              This number is automatically messaged and phoned when SOS triggers.
            </Text>

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>Save Emergency Contact</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="Profile" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 194, 146, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(0, 194, 146, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  profileHero: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 10,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  displayName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  displayHandle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 194, 146, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 6,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuIconBox: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#0F172A",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E2E8F0",
    marginLeft: 56,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.danger,
    borderRadius: 14,
    paddingVertical: 15,
    marginHorizontal: 4,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 6,
    marginTop: 10,
    letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  fieldNote: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 8,
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },
});
