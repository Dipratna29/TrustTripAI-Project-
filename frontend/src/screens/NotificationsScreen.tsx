import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "../components/common/AppIcon";
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../config/api";
import CosmicBackground from "../components/common/CosmicBackground";
import SurfaceCard from "../components/common/SurfaceCard";
import ScreenHeader from "../components/common/ScreenHeader";
import { LoadingSkeleton, EmptyStateView } from "../components/common/StateViews";
import { colors, typography, radius, spacing } from "../theme";

interface NotificationItem {
  notification_id: number;
  user_id: number;
  notification_type: string;
  title: string;
  body: string;
  data?: {
    type?: string;
    screen?: string;
    deep_link?: string;
    priority?: string;
    status?: string;
    incident_id?: string | number;
    complaint_id?: string | number;
    order_id?: string | number;
    guide_id?: string | number;
    [key: string]: any;
  };
  is_read: boolean;
  expo_response_status?: string;
  created_at: string;
}

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "emergency", label: "Emergency" },
  { id: "safety", label: "Safety" },
  { id: "system", label: "System" },
  { id: "offers", label: "Offers" },
];

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [selectedNotif, setSelectedNotif] = useState<NotificationItem | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  // Open modal if notification passed in route params
  useEffect(() => {
    if (route.params?.selectedNotification) {
      setSelectedNotif(route.params.selectedNotification);
    }
  }, [route.params?.selectedNotification]);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchNotifications(false);
      }
    }, [userId, selectedCategory])
  );

  const loadUser = async () => {
    try {
      const userStr = await AsyncStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        const uid = user.id || user.user_id;
        if (uid) {
          setUserId(Number(uid));
          fetchNotificationsForUser(Number(uid), false);
        }
      }
    } catch {
      // Fallback
    }
  };

  const fetchNotifications = async (isPull = false) => {
    if (!userId) return;
    await fetchNotificationsForUser(userId, isPull);
  };

  const fetchNotificationsForUser = async (uid: number, isPull = false) => {
    if (isPull) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.get("/api/notifications", {
        params: {
          user_id: uid,
          unread_only: selectedCategory === "unread",
          notification_type:
            selectedCategory !== "all" && selectedCategory !== "unread"
              ? selectedCategory
              : undefined,
        },
      });

      if (res.data && res.data.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unread_count || 0);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleMarkAsRead = async (notif: NotificationItem) => {
    if (notif.is_read) return;

    try {
      await api.put(`/api/notifications/${notif.notification_id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notification_id === notif.notification_id ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Silent error
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId || unreadCount === 0) return;

    try {
      await api.put("/api/notifications/mark-all-read", null, {
        params: { user_id: userId },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      Alert.alert("Notice", "Could not mark all notifications as read.");
    }
  };

  const handleDelete = async (notifId: number) => {
    try {
      await api.delete(`/api/notifications/${notifId}`);
      setNotifications((prev) => prev.filter((n) => n.notification_id !== notifId));
    } catch {
      Alert.alert("Notice", "Could not delete notification.");
    }
  };

  const handleNotificationPress = async (notif: NotificationItem) => {
    await handleMarkAsRead(notif);
    setSelectedNotif(notif);
  };

  const handleNavigateFromModal = (notif: NotificationItem) => {
    setSelectedNotif(null);
    const screen = notif.data?.screen;
    if (screen) {
      navigation.navigate(screen);
      return;
    }

    const t = notif.notification_type || "";
    if (t.includes("emergency") || t.includes("sos")) {
      navigation.navigate("SOS");
    } else if (t.includes("payment") || t.includes("equipment") || t.includes("order")) {
      navigation.navigate("MyOrders");
    } else if (t.includes("complaint")) {
      navigation.navigate("MyComplaints");
    } else if (t.includes("guide")) {
      navigation.navigate("Guide");
    }
  };

  const formatTimestamp = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const formatFullDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case "emergency":
      case "sos_alert":
      case "sos_dispatched":
      case "sos_acknowledged":
      case "sos_resolved":
        return { name: "alert-circle" as const, color: colors.danger, bg: colors.dangerSurface, label: "Emergency Alert" };
      case "safety":
        return { name: "shield-checkmark" as const, color: colors.primary, bg: colors.primaryGlow, label: "Safety Notice" };
      case "payment_success":
      case "equipment_order":
        return { name: "card" as const, color: colors.primary, bg: colors.primaryGlow, label: "Order & Payment" };
      case "complaint_submitted":
      case "complaint_updated":
      case "complaint":
        return { name: "document-text" as const, color: "#a78bfa", bg: "rgba(167, 139, 250, 0.15)", label: "Complaint Update" };
      case "guide_requested":
      case "guide_cancelled":
      case "guide_request":
        return { name: "compass" as const, color: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)", label: "Guide Booking" };
      case "offers":
      case "offer":
        return { name: "pricetag" as const, color: colors.cream, bg: "rgba(251, 226, 180, 0.15)", label: "Special Offer" };
      default:
        return { name: "notifications" as const, color: colors.primary, bg: colors.primaryGlow, label: "Notification" };
    }
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const iconConfig = getIconForType(item.notification_type);

    return (
      <SurfaceCard
        style={[styles.card, !item.is_read && styles.unreadCard]}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={styles.cardRow}>
          <View style={[styles.iconCircle, { backgroundColor: iconConfig.bg }]}>
            <Ionicons name={iconConfig.name} size={20} color={iconConfig.color} />
          </View>

          <View style={styles.contentCol}>
            <View style={styles.headerRow}>
              <Text style={[styles.titleText, !item.is_read && styles.unreadTitle]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.timeText}>{formatTimestamp(item.created_at)}</Text>
            </View>

            <Text style={styles.bodyText} numberOfLines={2}>
              {item.body}
            </Text>
          </View>

          {!item.is_read && <View style={styles.unreadDot} />}
        </View>
      </SurfaceCard>
    );
  };

  return (
    <CosmicBackground>
      {/* HEADER */}
      <ScreenHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread alert(s)` : "All caught up"}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          unreadCount > 0 ? (
            <TouchableOpacity
              style={styles.markAllBtn}
              onPress={handleMarkAllRead}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* CATEGORIES SCROLL */}
      <View style={styles.categoriesWrap}>
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesList}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipSelected,
                ]}
                onPress={() => setSelectedCategory(item.id)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* CONTENT LIST */}
      <View style={styles.container}>
        {loading && !refreshing ? (
          <View style={styles.loaderWrap}>
            <LoadingSkeleton count={4} height={90} />
          </View>
        ) : notifications.length === 0 ? (
          <EmptyStateView
            title="No Notifications"
            description="You are completely up to date. Safety alerts and order updates will appear here."
            icon="notifications-outline"
          />
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.notification_id)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchNotifications(true)}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
          />
        )}
      </View>

      {/* FULL NOTIFICATION DETAIL MODAL */}
      <Modal
        visible={!!selectedNotif}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedNotif(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedNotif(null)}
        >
          <TouchableOpacity
            style={styles.modalCard}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedNotif && (() => {
              const iconCfg = getIconForType(selectedNotif.notification_type);
              const dataObj = selectedNotif.data || {};
              const hasScreenAction = Boolean(
                dataObj.screen ||
                selectedNotif.notification_type.includes("sos") ||
                selectedNotif.notification_type.includes("emergency") ||
                selectedNotif.notification_type.includes("complaint") ||
                selectedNotif.notification_type.includes("order") ||
                selectedNotif.notification_type.includes("payment") ||
                selectedNotif.notification_type.includes("guide")
              );

              return (
                <>
                  {/* MODAL HEADER */}
                  <View style={styles.modalHeader}>
                    <View style={styles.modalBadgeRow}>
                      <View style={[styles.modalIconWrap, { backgroundColor: iconCfg.bg }]}>
                        <Ionicons name={iconCfg.name} size={18} color={iconCfg.color} />
                      </View>
                      <View style={styles.modalTypePill}>
                        <Text style={[styles.modalTypePillText, { color: iconCfg.color }]}>
                          {iconCfg.label}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedNotif(null)}
                      style={styles.modalCloseBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* TITLE & TIME */}
                  <Text style={styles.modalTitleText}>{selectedNotif.title}</Text>
                  <View style={styles.modalMetaRow}>
                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.modalTimeText}>
                      {formatFullDateTime(selectedNotif.created_at)}
                    </Text>
                    {dataObj.status && (
                      <View style={styles.modalStatusChip}>
                        <Text style={styles.modalStatusText}>{String(dataObj.status).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.modalDivider} />

                  {/* FULL BODY SCROLL */}
                  <ScrollView style={styles.modalBodyScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.modalBodyText} selectable>
                      {selectedNotif.body}
                    </Text>

                    {/* EXTRA DETAILS CHIPS */}
                    {(dataObj.incident_id || dataObj.complaint_id || dataObj.order_id || dataObj.guide_id) && (
                      <View style={styles.refInfoBox}>
                        <Ionicons name="information-circle-outline" size={15} color={colors.primary} />
                        <Text style={styles.refInfoText}>
                          {dataObj.incident_id ? `SOS Incident Reference: #${dataObj.incident_id}  ` : ""}
                          {dataObj.complaint_id ? `Complaint Reference: #${dataObj.complaint_id}  ` : ""}
                          {dataObj.order_id ? `Order Reference: #${dataObj.order_id}  ` : ""}
                          {dataObj.guide_id ? `Guide Reference: #${dataObj.guide_id}` : ""}
                        </Text>
                      </View>
                    )}
                  </ScrollView>

                  {/* MODAL ACTIONS */}
                  <View style={styles.modalActionRow}>
                    {hasScreenAction && (
                      <TouchableOpacity
                        style={styles.modalPrimaryActionBtn}
                        onPress={() => handleNavigateFromModal(selectedNotif)}
                      >
                        <Text style={styles.modalPrimaryActionText}>
                          {selectedNotif.notification_type.includes("sos") || selectedNotif.notification_type.includes("emergency")
                            ? "Open SOS Center"
                            : selectedNotif.notification_type.includes("complaint")
                            ? "View Complaint"
                            : selectedNotif.notification_type.includes("order") || selectedNotif.notification_type.includes("payment")
                            ? "View Order"
                            : selectedNotif.notification_type.includes("guide")
                            ? "View Guide"
                            : "Open Related Screen"}
                        </Text>
                        <Ionicons name="arrow-forward" size={16} color={colors.white} />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.modalDismissBtn}
                      onPress={() => setSelectedNotif(null)}
                    >
                      <Text style={styles.modalDismissText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  markAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markAllText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  categoriesWrap: {
    marginBottom: 10,
  },
  categoriesList: {
    paddingHorizontal: spacing.screenPadding,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  categoryChipTextSelected: {
    color: colors.white,
    fontWeight: "800",
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  loaderWrap: {
    paddingTop: 10,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    marginBottom: 10,
    padding: 12,
  },
  unreadCard: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceElevated,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contentCol: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  titleText: {
    ...typography.label,
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  unreadTitle: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  timeText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  bodyText: {
    ...typography.bodySm,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.screenPadding,
  },
  modalCard: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTypePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  modalTypePillText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: "700",
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  modalTitleText: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  modalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  modalTimeText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  modalStatusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryGlow,
    marginLeft: 6,
  },
  modalStatusText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
  },
  modalDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  modalBodyScroll: {
    maxHeight: 260,
    marginBottom: 18,
  },
  modalBodyText: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textPrimary,
  },
  refInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  refInfoText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  modalActionRow: {
    flexDirection: "column",
    gap: 10,
  },
  modalPrimaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  modalPrimaryActionText: {
    ...typography.button,
    color: colors.white,
    fontWeight: "800",
  },
  modalDismissBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalDismissText: {
    ...typography.button,
    color: colors.textSecondary,
    fontSize: 13,
  },
});
