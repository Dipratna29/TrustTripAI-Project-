/**
 * LocationFallbackModal.tsx
 * Friendly, non-blocking fallback dialog when automatic GPS cannot be detected.
 * Adheres strictly to TrustTrip's production theme:
 * - Title: "Couldn't detect your location"
 * - Subtitle: "You can try again or select your location manually."
 * - Option 1: "Try Again"
 * - Option 2: "Enter Location Manually"
 * - Option 3: "Continue Without Location" (never blocks the app)
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppIcon from './AppIcon';
import SurfaceCard from './SurfaceCard';
import GlowButton from './GlowButton';
import { useLocationContext, FallbackReason } from '../../context/LocationContext';
import { colors, typography, radius, spacing } from '../../theme';

interface LocationFallbackModalProps {
  onEnterManualLocation?: () => void;
}

export const LocationFallbackModal: React.FC<LocationFallbackModalProps> = ({
  onEnterManualLocation,
}) => {
  const {
    fallbackVisible,
    fallbackReason,
    dismissFallback,
    detectGpsLocation,
    openSettings,
    isDetecting,
  } = useLocationContext();

  const navigation = useNavigation<any>();
  const [retrying, setRetrying] = useState(false);

  if (!fallbackVisible) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await detectGpsLocation(true, true);
    } finally {
      setRetrying(false);
    }
  };

  const handleEnterManual = () => {
    dismissFallback();
    if (onEnterManualLocation) {
      onEnterManualLocation();
    } else {
      try {
        navigation.navigate('SelectLocation');
      } catch (e) {
        console.log('[LocationFallbackModal] Navigation error:', e);
      }
    }
  };

  const getReasonDetails = (reason: FallbackReason) => {
    switch (reason) {
      case 'gps_disabled':
        return {
          title: "Couldn't detect your location",
          subtitle: 'Location services (GPS) are turned off on your device.',
          hint: 'Turn on GPS or select your location manually to continue.',
          canOpenSettings: true,
        };
      case 'permission_denied':
        return {
          title: "Couldn't detect your location",
          subtitle: 'Location permission was not granted for TrustTrip.',
          hint: 'Allow location in device settings or select your location manually.',
          canOpenSettings: true,
        };
      case 'network_failure':
        return {
          title: "Couldn't detect your location",
          subtitle: 'Network connection is slow or unavailable right now.',
          hint: 'You can choose a city or landmark manually.',
          canOpenSettings: false,
        };
      case 'unavailable':
      default:
        return {
          title: "Couldn't detect your location",
          subtitle: 'Location services are unavailable. You can try again or select your location manually.',
          hint: 'We will use your chosen location across safety features and crowd radar.',
          canOpenSettings: false,
        };
    }
  };

  const details = getReasonDetails(fallbackReason);

  return (
    <Modal
      visible={fallbackVisible}
      transparent
      animationType="fade"
      onRequestClose={dismissFallback}
    >
      <TouchableWithoutFeedback onPress={dismissFallback}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.container}>
              <SurfaceCard variant="elevated" style={styles.card}>
                {/* HEADER ICON */}
                <View style={styles.iconCircle}>
                  <AppIcon name="location-outline" size={32} color={colors.primary} />
                </View>

                {/* TITLE & DESCRIPTION */}
                <Text style={styles.title}>{details.title}</Text>
                <Text style={styles.subtitle}>{details.subtitle}</Text>
                {details.hint ? <Text style={styles.hint}>{details.hint}</Text> : null}

                {/* BUTTONS STACK */}
                <View style={styles.buttonStack}>
                  {/* OPTION 1: RETRY */}
                  <TouchableOpacity
                    style={[styles.primaryActionBtn, (retrying || isDetecting) && styles.disabledBtn]}
                    onPress={handleRetry}
                    disabled={retrying || isDetecting}
                    activeOpacity={0.8}
                  >
                    {retrying || isDetecting ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <>
                        <AppIcon name="refresh" size={18} color={colors.background} />
                        <Text style={styles.primaryActionBtnText}>Try Again</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* OPTION 2: ENTER LOCATION MANUALLY */}
                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={handleEnterManual}
                    activeOpacity={0.8}
                  >
                    <AppIcon name="locate" size={18} color={colors.primary} />
                    <Text style={styles.secondaryActionBtnText}>Enter Location Manually</Text>
                  </TouchableOpacity>

                  {/* SETTINGS IF GPS DISABLED OR PERMISSION DENIED */}
                  {details.canOpenSettings && (
                    <TouchableOpacity
                      style={styles.settingsBtn}
                      onPress={openSettings}
                      activeOpacity={0.8}
                    >
                      <AppIcon name="settings-outline" size={16} color={colors.cream} />
                      <Text style={styles.settingsBtnText}>Open Location Settings</Text>
                    </TouchableOpacity>
                  )}

                  {/* OPTION 3: CONTINUE WITHOUT LOCATION */}
                  <TouchableOpacity
                    style={styles.dismissBtn}
                    onPress={dismissFallback}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dismissBtnText}>Continue Without Location</Text>
                  </TouchableOpacity>
                </View>
              </SurfaceCard>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 18, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.screenPadding,
  },
  container: {
    width: '100%',
    maxWidth: 380,
  },
  card: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(70, 240, 210, 0.20)',
    backgroundColor: colors.surface,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(70, 240, 210, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(70, 240, 210, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonStack: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: radius.lg,
    gap: 8,
  },
  primaryActionBtnText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(70, 240, 210, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(70, 240, 210, 0.35)',
    paddingVertical: 13,
    borderRadius: radius.lg,
    gap: 8,
  },
  secondaryActionBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 226, 180, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(251, 226, 180, 0.25)',
    paddingVertical: 11,
    borderRadius: radius.lg,
    gap: 6,
  },
  settingsBtnText: {
    color: colors.cream,
    fontSize: 13,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  dismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  dismissBtnText: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});

export default LocationFallbackModal;
