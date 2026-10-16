/**
 * ActiveLocationBar.tsx
 * Visual indicator banner displaying active location source and place name.
 * Clearly distinguishes:
 * • GPS Location
 * • Manual Location
 * Allows traveler to change, reset to GPS, or continue without location anytime.
 * Uses official TrustTrip AppIcons (no emojis).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AppIcon from './AppIcon';
import SurfaceCard from './SurfaceCard';
import { useLocationContext } from '../../context/LocationContext';
import { colors, typography, radius, spacing } from '../../theme';

interface ActiveLocationBarProps {
  style?: object;
  compact?: boolean;
}

export const ActiveLocationBar: React.FC<ActiveLocationBarProps> = ({ style, compact = false }) => {
  const {
    activeLocation,
    isManual,
    gpsStatus,
    isDetecting,
    clearManualLocation,
    detectGpsLocation,
    showFallback,
  } = useLocationContext();

  const navigation = useNavigation<any>();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleOpenMenu = () => {
    setMenuVisible(true);
  };

  const handleSelectManual = () => {
    setMenuVisible(false);
    try {
      navigation.navigate('SelectLocation');
    } catch {
      showFallback('unavailable');
    }
  };

  const handleUseGps = async () => {
    setMenuVisible(false);
    await clearManualLocation();
  };

  const handleDismissMenu = () => {
    setMenuVisible(false);
  };

  const isGpsActive = gpsStatus === 'ACTIVE';
  const isSearching = isDetecting || gpsStatus === 'SEARCHING';

  const renderLocationMenu = () => (
    <Modal
      visible={menuVisible}
      transparent
      animationType="fade"
      onRequestClose={handleDismissMenu}
    >
      <TouchableWithoutFeedback onPress={handleDismissMenu}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.modalContainer}>
              <SurfaceCard variant="elevated" style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconCircle}>
                    <AppIcon name="location" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={typography.h4}>Location Preferences</Text>
                    <Text style={styles.modalSubtitle}>
                      Manage how TrustTrip tracks your location
                    </Text>
                  </View>
                </View>

                <View style={styles.modalDivider} />

                {/* OPTION 1: USE GPS */}
                <TouchableOpacity
                  style={[styles.menuOptionBtn, !isManual && isGpsActive && styles.menuOptionActive]}
                  onPress={handleUseGps}
                  activeOpacity={0.8}
                >
                  <View style={[styles.menuOptionIcon, { backgroundColor: 'rgba(70, 240, 210, 0.15)' }]}>
                    <AppIcon name="navigate" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.menuOptionTitle, { color: colors.primary }]}>
                      Use Current GPS Location
                    </Text>
                    <Text style={styles.menuOptionDesc}>
                      Detect real-time GPS coordinates automatically
                    </Text>
                  </View>
                  {!isManual && isGpsActive && (
                    <AppIcon name="checkmark-circle" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>

                {/* OPTION 2: SELECT MANUALLY */}
                <TouchableOpacity
                  style={[styles.menuOptionBtn, isManual && styles.menuOptionActive]}
                  onPress={handleSelectManual}
                  activeOpacity={0.8}
                >
                  <View style={[styles.menuOptionIcon, { backgroundColor: 'rgba(251, 226, 180, 0.15)' }]}>
                    <AppIcon name="pencil" size={18} color={colors.cream} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.menuOptionTitle, { color: colors.cream }]}>
                      Change Location Manually
                    </Text>
                    <Text style={styles.menuOptionDesc}>
                      Search city, landmark, area, or address
                    </Text>
                  </View>
                  {isManual && (
                    <AppIcon name="checkmark-circle" size={18} color={colors.cream} />
                  )}
                </TouchableOpacity>

                {/* OPTION 3: CLOSE / CANCEL */}
                <TouchableOpacity
                  style={styles.cancelOptionBtn}
                  onPress={handleDismissMenu}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelOptionText}>Close</Text>
                </TouchableOpacity>
              </SurfaceCard>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  if (compact) {
    return (
      <>
        <TouchableOpacity
          style={[styles.compactContainer, style]}
          onPress={handleOpenMenu}
          activeOpacity={0.8}
        >
          <View style={styles.compactLeft}>
            <AppIcon
              name={isManual ? 'pencil' : 'location'}
              size={13}
              color={isManual ? colors.cream : colors.primary}
            />
            <Text style={[styles.compactSourceText, { color: isManual ? colors.cream : colors.primary }]}>
              {isManual ? 'Manual' : 'GPS'}:
            </Text>
            <Text style={styles.compactNameText} numberOfLines={1}>
              {activeLocation?.name || 'Location Not Set'}
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={13} color={colors.textMuted} />
        </TouchableOpacity>
        {renderLocationMenu()}
      </>
    );
  }

  return (
    <>
      <View style={[styles.container, isManual ? styles.manualContainer : styles.gpsContainer, style]}>
        {/* MAIN BAR */}
        <TouchableOpacity
          style={styles.contentWrap}
          onPress={() => navigation.navigate('SelectLocation')}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: isManual ? colors.warningSurface : colors.primaryGlow },
            ]}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <AppIcon
                name={isManual ? 'pencil' : 'location'}
                size={16}
                color={isManual ? colors.warning : colors.primary}
              />
            )}
          </View>

          {/* TEXT DETAILS */}
          <View style={styles.infoWrap}>
            <View style={styles.headerRow}>
              <Text
                style={[
                  styles.sourceLabel,
                  { color: isManual ? colors.warning : colors.primary },
                ]}
              >
                {isManual ? 'DESTINATION' : 'LIVE GPS'}
              </Text>
              {isGpsActive && !isManual && (
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>ACTIVE</Text>
                </View>
              )}
            </View>

            <Text style={styles.placeName} numberOfLines={1}>
              {activeLocation?.name || (isSearching ? 'Detecting location...' : 'Select location')}
            </Text>
          </View>

          {/* ACTION BUTTON */}
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={handleOpenMenu}
            activeOpacity={0.7}
          >
            <Text style={styles.changeBtnText}>Change</Text>
            <AppIcon name="chevron-forward" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
      {renderLocationMenu()}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 4,
    borderWidth: 1,
  },
  gpsContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  manualContainer: {
    backgroundColor: colors.surfaceElevated,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  contentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoWrap: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sourceLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryGlow,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
  placeName: {
    ...typography.label,
    fontSize: 13,
    color: colors.textPrimary,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  changeBtnText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 18, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.screenPadding,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
  },
  modalCard: {
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(70, 240, 210, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },
  menuOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  menuOptionActive: {
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  menuOptionDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  compactSourceText: {
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 4,
  },
  compactNameText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  cancelOptionBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  cancelOptionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ActiveLocationBar;
