import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AxiosErrorLogger from "../utils/axiosErrorLogger";
import CosmicBackground from "../components/common/CosmicBackground";
import ScreenHeader from "../components/common/ScreenHeader";
import SurfaceCard from "../components/common/SurfaceCard";
import AppIcon from "../components/common/AppIcon";
import { colors, typography, radius, spacing } from "../theme";

interface AxiosLogEntry {
  ts: string;
  type?: string;
  status?: number;
  message?: string;
  data?: unknown;
  config?: {
    method?: string;
    url?: string;
    params?: unknown;
    data?: unknown;
  };
}

export default function DebugAxiosErrorsScreen() {
  const navigation = useNavigation<any>();
  const [errors, setErrors] = useState<AxiosLogEntry[]>(AxiosErrorLogger.getErrors());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = AxiosErrorLogger.subscribe((logs: AxiosLogEntry[]) => setErrors(logs.slice().reverse()));
    setErrors(AxiosErrorLogger.getErrors());
    return unsub;
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setErrors(AxiosErrorLogger.getErrors());
    setRefreshing(false);
  };

  const clear = () => {
    AxiosErrorLogger.clearErrors();
  };

  const renderItem = ({ item }: { item: AxiosLogEntry }) => (
    <SurfaceCard style={styles.card} variant="elevated">
      <View style={styles.cardHeader}>
        <Text style={styles.ts}>{item.ts}</Text>
        <Text style={[styles.type, item.status && item.status >= 400 ? { color: colors.danger } : {}]}>
          {item.type || "unknown"}
        </Text>
      </View>
      {item.status ? <Text style={styles.status}>HTTP Status: {item.status}</Text> : null}
      {item.message ? <Text style={styles.message}>Message: {String(item.message)}</Text> : null}
      {item.data ? <Text style={styles.codeText} numberOfLines={6}>Payload: {JSON.stringify(item.data)}</Text> : null}
      {item.config ? (
        <Text style={styles.urlText} numberOfLines={3}>
          {item.config.method?.toUpperCase()} {item.config.url}
        </Text>
      ) : null}
    </SurfaceCard>
  );

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Network Diagnostics"
        subtitle="Telemetry & Axios HTTP logs"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity onPress={clear} style={styles.clearBtn} activeOpacity={0.8}>
            <AppIcon name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        <FlatList
          data={errors}
          keyExtractor={(item, idx) => item.ts + idx}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <SurfaceCard style={styles.emptyCard}>
              <AppIcon name="checkmark-circle-outline" size={32} color={colors.primary} />
              <Text style={styles.emptyTitle}>Zero Errors Logged</Text>
              <Text style={styles.emptyDesc}>All network and telemetry requests are responding normally.</Text>
            </SurfaceCard>
          }
        />
      </View>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.borderDanger,
  },
  clearText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "800",
  },
  card: {
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  ts: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  type: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase",
  },
  status: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    marginBottom: 2,
  },
  message: {
    ...typography.bodySm,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.lightBackground,
    padding: 8,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  urlText: {
    fontFamily: "monospace",
    fontSize: 11,
    color: colors.primary,
    marginTop: 6,
  },
  emptyCard: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
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
