/**
 * SelectLocationScreen.tsx
 * Clean, production-ready screen to search and select a manual location.
 * Allows searching by City, Area, Landmark, or Address with real geocoding.
 * Resolves real coordinates, allows instant selection from verified destinations,
 * and confirms selection before setting globally across all TrustTrip features.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import CosmicBackground from '../components/common/CosmicBackground';
import ScreenHeader from '../components/common/ScreenHeader';
import SurfaceCard from '../components/common/SurfaceCard';
import AppIcon from '../components/common/AppIcon';
import { PrimaryButton } from '../components/common/Buttons';
import { useLocationContext } from '../context/LocationContext';
import locationService, { LocationSearchResult } from '../services/locationService';
import { POPULAR_TRAVEL_LOCATIONS, CuratedLocation } from '../services/locationConstants';
import { colors, typography, radius, spacing } from '../theme';

export default function SelectLocationScreen() {
  const navigation = useNavigation<any>();
  const {
    activeLocation,
    isManual,
    setManualLocation,
    clearManualLocation,
    detectGpsLocation,
    isDetecting,
  } = useLocationContext();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<LocationSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load curated popular destinations initially
  useEffect(() => {
    loadInitialPopular();
  }, []);

  const loadInitialPopular = () => {
    const popular: LocationSearchResult[] = POPULAR_TRAVEL_LOCATIONS.map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: `${loc.area}, ${loc.city}, ${loc.state}`,
      city: loc.city,
      state: loc.state,
      latitude: loc.latitude,
      longitude: loc.longitude,
      isCurated: true,
    }));
    setResults(popular);
  };

  // Perform debounced geocoding search
  const handleQueryChange = (text: string) => {
    setQuery(text);
    setSearchError(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text.trim()) {
      setSearching(false);
      loadInitialPopular();
      return;
    }

    setSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const searchRes = await locationService.searchLocations(text.trim());
        if (searchRes.length === 0) {
          setSearchError('No locations found. Try searching for a major city, landmark, or area name.');
          setResults([]);
        } else {
          setSearchError(null);
          setResults(searchRes);
        }
      } catch (err) {
        console.log('[SelectLocationScreen] Search error:', err);
        setSearchError('Network search unavailable. Please select from popular locations below.');
        loadInitialPopular();
      } finally {
        setSearching(false);
      }
    }, 450);
  };

  const handleClearQuery = () => {
    setQuery('');
    setSearchError(null);
    setSelectedPreview(null);
    Keyboard.dismiss();
    loadInitialPopular();
  };

  // User taps a search item -> preview with real coordinates
  const handleSelectItem = (item: LocationSearchResult) => {
    Keyboard.dismiss();
    setSelectedPreview(item);
  };

  // Confirm manual selection -> update global state and go back
  const handleConfirmSelection = async () => {
    if (!selectedPreview) return;

    await setManualLocation({
      latitude: selectedPreview.latitude,
      longitude: selectedPreview.longitude,
      name: selectedPreview.name,
      address: selectedPreview.address,
    });

    navigation.goBack();
  };

  // Switch back to GPS
  const handleUseGps = async () => {
    Keyboard.dismiss();
    await clearManualLocation();
    navigation.goBack();
  };

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Select Location"
        subtitle="Search city, area, landmark, or address"
        showBack
        onBack={() => navigation.goBack()}
      />

      <View style={styles.container}>
        {/* TOP SEARCH BAR */}
        <View style={styles.searchBarWrap}>
          <AppIcon name="search" size={18} color={colors.primary} style={{ marginLeft: 12 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="E.g. Jaipur, Connaught Place, Goa, Fort..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={handleQueryChange}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 12 }} />
          ) : query.length > 0 ? (
            <TouchableOpacity onPress={handleClearQuery} style={{ padding: 10 }}>
              <AppIcon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* USE GPS BUTTON */}
        <TouchableOpacity
          style={styles.useGpsBtn}
          onPress={handleUseGps}
          disabled={isDetecting}
          activeOpacity={0.8}
        >
          <View style={styles.useGpsIconCircle}>
            {isDetecting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <AppIcon name="locate" size={16} color={colors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.useGpsTitle}>Use Automatic GPS Location</Text>
            <Text style={styles.useGpsSub}>
              {isManual ? 'Switch from manual to live GPS' : 'Currently active if available'}
            </Text>
          </View>
          <AppIcon name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* PREVIEW SELECTION CARD (WHEN USER TAPS A LOCATION) */}
        {selectedPreview && (
          <SurfaceCard variant="elevated" style={styles.previewCard}>
            <View style={styles.previewHeaderRow}>
              <View style={styles.previewBadge}>
                <AppIcon name="checkmark-circle" size={14} color={colors.primary} />
                <Text style={styles.previewBadgeText}>Selected Destination</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedPreview(null)}>
                <AppIcon name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.previewName}>{selectedPreview.name}</Text>
            <Text style={styles.previewAddress}>{selectedPreview.address}</Text>

            <View style={styles.coordsRow}>
              <Text style={styles.coordsText}>
                Lat: {selectedPreview.latitude.toFixed(4)} • Lng: {selectedPreview.longitude.toFixed(4)}
              </Text>
            </View>

            <PrimaryButton
              title="Confirm Location"
              icon="checkmark-circle"
              size="md"
              onPress={handleConfirmSelection}
              style={{ marginTop: 12 }}
            />
          </SurfaceCard>
        )}

        {/* SECTION TITLE */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {query.trim().length > 0 ? 'Search Results' : 'Popular Indian Destinations'}
          </Text>
          {query.trim().length === 0 && (
            <Text style={styles.sectionSubtitle}>Verified Real Coordinates</Text>
          )}
        </View>

        {/* ERROR MESSAGE IF ANY */}
        {searchError && (
          <View style={styles.errorBox}>
            <AppIcon name="alert-circle-outline" size={16} color={colors.cream} />
            <Text style={styles.errorText}>{searchError}</Text>
          </View>
        )}

        {/* RESULTS LIST */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selectedPreview?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.resultItem, isSelected && styles.resultItemSelected]}
                onPress={() => handleSelectItem(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.resultIconWrap, item.isCurated && styles.curatedIconWrap]}>
                  <AppIcon
                    name={item.isCurated ? 'ribbon-outline' : 'location-outline'}
                    size={16}
                    color={item.isCurated ? colors.cream : colors.primary}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.resultItemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.resultItemAddress} numberOfLines={1}>
                    {item.address}
                  </Text>
                </View>

                <AppIcon name="chevron-forward" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            !searching && !searchError ? (
              <View style={styles.emptyWrap}>
                <AppIcon name="search-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyText}>Type a city, area, or landmark to search</Text>
              </View>
            ) : null
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
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  useGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(70, 240, 210, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(70, 240, 210, 0.25)',
    padding: 12,
    borderRadius: radius.lg,
    marginBottom: 12,
    gap: 12,
  },
  useGpsIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(70, 240, 210, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  useGpsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  useGpsSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  previewCard: {
    padding: 16,
    marginBottom: 14,
    borderColor: 'rgba(70, 240, 210, 0.35)',
    backgroundColor: 'rgba(32, 32, 50, 0.96)',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(70, 240, 210, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  previewName: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  previewAddress: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  coordsRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  coordsText: {
    fontSize: 11,
    color: colors.cream,
    fontFamily: 'monospace',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 226, 180, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(251, 226, 180, 0.25)',
    padding: 10,
    borderRadius: radius.md,
    marginBottom: 10,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: colors.cream,
  },
  listContent: {
    paddingBottom: 40,
    gap: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 10,
  },
  resultItemSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(70, 240, 210, 0.08)',
  },
  resultIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(70, 240, 210, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  curatedIconWrap: {
    backgroundColor: 'rgba(251, 226, 180, 0.12)',
  },
  resultItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  resultItemAddress: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
