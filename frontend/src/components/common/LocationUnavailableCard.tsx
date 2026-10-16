import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppIcon from './AppIcon';
import SurfaceCard from './SurfaceCard';
import GlowButton from './GlowButton';
import { colors, typography, radius, spacing } from '../../theme';
import locationService from '../../services/locationService';

interface LocationUnavailableCardProps {
  title?: string;
  description?: string;
  onRetry?: () => void | Promise<void>;
  onEnterManualLocation?: () => void;
  onContinueWithoutLocation?: () => void;
  continueButtonText?: string;
  style?: object;
  compact?: boolean;
  isEmergency?: boolean;
}

export default function LocationUnavailableCard({
  title = "Couldn't detect your location",
  description = 'You can try again or select your location manually to use live maps, crowd density radar, and safety tools.',
  onRetry,
  onEnterManualLocation,
  onContinueWithoutLocation,
  continueButtonText = 'Continue Without Location',
  style,
  compact = false,
  isEmergency = false,
}: LocationUnavailableCardProps) {
  const navigation = useNavigation<any>();
  const [retrying, setRetrying] = useState(false);

  const handleOpenSettings = async () => {
    await locationService.openLocationSettings();
  };

  const handleRetry = async () => {
    if (!onRetry) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const handleEnterManual = () => {
    if (onEnterManualLocation) {
      onEnterManualLocation();
    } else {
      try {
        navigation.navigate('SelectLocation');
      } catch {
        // Navigation fallback
      }
    }
  };

  if (compact) {
    return (
      <SurfaceCard style={[styles.compactContainer, style]} variant="highlight">
        <View style={styles.compactRow}>
          <View style={styles.iconCircleSmall}>
            <AppIcon name="location-outline" size={20} color={colors.warning} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.compactTitle}>{title}</Text>
            <Text style={styles.compactDesc}>{description}</Text>
          </View>
        </View>

        <View style={styles.compactActionsRow}>
          <TouchableOpacity style={styles.manualLinkBtn} onPress={handleEnterManual}>
            <AppIcon name="locate" size={13} color={colors.cream} />
            <Text style={styles.manualLinkText}>Enter Manually</Text>
          </TouchableOpacity>

          {onRetry && (
            <TouchableOpacity style={styles.retryLinkBtn} onPress={handleRetry} disabled={retrying}>
              {retrying ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <AppIcon name="refresh" size={13} color={colors.background} />
                  <Text style={styles.retryLinkText}>Try Again</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard style={[styles.card, style]} variant="highlight">
      {/* ICON HEADER */}
      <View style={styles.iconHeader}>
        <View style={styles.iconCircle}>
          <AppIcon
            name="location-outline"
            size={32}
            color={isEmergency ? colors.danger : colors.primary}
          />
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {/* ACTION BUTTONS */}
      <View style={styles.actionsContainer}>
        {onRetry && (
          <GlowButton
            title="Try Again"
            onPress={handleRetry}
            loading={retrying}
            variant="primary"
            size="md"
            icon="refresh"
            style={styles.actionBtn}
          />
        )}

        <TouchableOpacity
          style={styles.manualActionBtn}
          onPress={handleEnterManual}
          activeOpacity={0.8}
        >
          <AppIcon name="locate" size={16} color={colors.primary} />
          <Text style={styles.manualActionBtnText}>Enter Location Manually</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsLink}
          onPress={handleOpenSettings}
          activeOpacity={0.7}
        >
          <AppIcon name="settings-outline" size={14} color={colors.cream} />
          <Text style={styles.settingsLinkText}>Open Device Location Settings</Text>
        </TouchableOpacity>

        {onContinueWithoutLocation && (
          <TouchableOpacity
            style={styles.continueWithoutBtn}
            onPress={onContinueWithoutLocation}
          >
            <Text style={styles.continueWithoutText}>{continueButtonText}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    alignItems: 'center',
    marginVertical: 12,
  },
  iconHeader: {
    marginBottom: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(70, 240, 210, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(70, 240, 210, 0.35)',
  },
  title: {
    ...typography.h3,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 6,
    color: colors.textPrimary,
  },
  description: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  actionsContainer: {
    width: '100%',
    gap: 10,
  },
  actionBtn: {
    width: '100%',
  },
  manualActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(70, 240, 210, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(70, 240, 210, 0.35)',
    paddingVertical: 12,
    borderRadius: radius.lg,
    gap: 8,
  },
  manualActionBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  settingsLinkText: {
    fontSize: 12,
    color: colors.cream,
    fontWeight: '600',
  },
  continueWithoutBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueWithoutText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  compactContainer: {
    padding: 14,
    marginVertical: 8,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircleSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(251, 226, 180, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251, 226, 180, 0.3)',
  },
  compactTitle: {
    ...typography.label,
    fontSize: 14,
    color: colors.textPrimary,
  },
  compactDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  compactActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  manualLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(251, 226, 180, 0.15)',
    gap: 4,
  },
  manualLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.cream,
  },
  retryLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    gap: 4,
  },
  retryLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.background,
  },
});
