import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import api from "../config/api";
import CosmicBackground from "../components/common/CosmicBackground";
import SurfaceCard from "../components/common/SurfaceCard";
import ScreenHeader from "../components/common/ScreenHeader";
import AppIcon from "../components/common/AppIcon";
import CustomBottomNav from "../components/common/CustomBottomNav";
import { colors, typography, radius, spacing } from "../theme";

const LANGUAGES = [
  { label: "English", value: "en", speech: "en-IN" },
  { label: "Hindi", value: "hi", speech: "hi-IN" },
  { label: "Marathi", value: "mr", speech: "mr-IN" },
  { label: "Bengali", value: "bn", speech: "bn-IN" },
  { label: "Tamil", value: "ta", speech: "ta-IN" },
  { label: "Telugu", value: "te", speech: "te-IN" },
  { label: "Kannada", value: "kn", speech: "kn-IN" },
  { label: "Gujarati", value: "gu", speech: "gu-IN" },
  { label: "French", value: "fr", speech: "fr-FR" },
  { label: "German", value: "de", speech: "de-DE" },
  { label: "Spanish", value: "es", speech: "es-ES" },
  { label: "Japanese", value: "ja", speech: "ja-JP" },
];

const SOURCE_LANGUAGES = [{ label: "Auto-detect", value: "auto", speech: "en-IN" }, ...LANGUAGES];

const labelFor = (code: string) => SOURCE_LANGUAGES.find((l) => l.value === code)?.label ?? code;
const speechLocaleFor = (code: string) => SOURCE_LANGUAGES.find((l) => l.value === code)?.speech ?? code;

const COMMON_PHRASES = [
  { category: "Emergency", phrase: "I need medical help" },
  { category: "Safety", phrase: "Call the police please" },
  { category: "Directions", phrase: "Where is the nearest safe zone?" },
  { category: "Transport", phrase: "How much is the taxi fare?" },
];

export default function LanguageScreen() {
  const navigation = useNavigation<any>();
  const [text, setText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("hi");
  const [translatedText, setTranslatedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"source" | "target">("target");

  const swapLanguages = () => {
    if (sourceLanguage === "auto") {
      Alert.alert("Choose a language", "Pick a specific source language before swapping.");
      return;
    }
    const temp = sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(temp);
    setText(translatedText);
    setTranslatedText(text);
  };

  // Languages are passed explicitly so a chip tap translates with the *new* selection
  // (reading state right after setState used the stale value).
  const handleTranslate = async (
    textToTranslate?: string,
    source: string = sourceLanguage,
    target: string = targetLanguage
  ) => {
    const query = (textToTranslate ?? text).trim();
    if (!query) return;

    setLoading(true);
    setError(null);
    try {
      const res = await api.post(
        "/translate",
        { text: query, source_language: source, target_language: target },
        { timeout: 20000 }
      );

      const result = res.data?.translated_text ?? res.data?.translation;
      if (res.data?.success && result) {
        setTranslatedText(result);
      } else {
        setTranslatedText("");
        setError(res.data?.message || "Translation failed. Please try again.");
      }
    } catch (err: any) {
      setTranslatedText("");
      setError(
        err?.response?.data?.message ||
          (err?.request
            ? "Can't reach the server. Check your internet connection."
            : "Translation failed. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  const selectLanguage = (code: string) => {
    if (pickerMode === "source") {
      setSourceLanguage(code);
      if (text.trim()) handleTranslate(undefined, code, targetLanguage);
    } else {
      setTargetLanguage(code);
      if (text.trim()) handleTranslate(undefined, sourceLanguage, code);
    }
  };

  const speakText = (content: string, lang: string) => {
    if (!content) return;
    Speech.stop();
    Speech.speak(content, { language: speechLocaleFor(lang) });
  };

  const copyToClipboard = async (content: string) => {
    if (!content) return;
    await Clipboard.setStringAsync(content);
    Alert.alert("Copied", "Text copied to clipboard.");
  };

  const chipOptions = pickerMode === "source" ? SOURCE_LANGUAGES : LANGUAGES;
  const selectedCode = pickerMode === "source" ? sourceLanguage : targetLanguage;

  return (
    <CosmicBackground>
      <ScreenHeader
        title="Travel Translator"
        subtitle="Real-time translation & voice pronouncer"
        showBack
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* LANGUAGE SELECTOR BAR */}
        <SurfaceCard style={styles.selectorCard} variant="elevated">
          <View style={styles.langSelectorRow}>
            <TouchableOpacity
              style={[styles.langPickerCol, pickerMode === "source" && styles.langPickerColActive]}
              onPress={() => setPickerMode("source")}
              activeOpacity={0.75}
            >
              <Text style={styles.pickerLabel}>FROM</Text>
              <Text style={styles.pickerVal} numberOfLines={1}>
                {labelFor(sourceLanguage)}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.swapBtn} onPress={swapLanguages} activeOpacity={0.7}>
              <AppIcon name="refresh" size={18} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.langPickerCol,
                { alignItems: "flex-end" },
                pickerMode === "target" && styles.langPickerColActive,
              ]}
              onPress={() => setPickerMode("target")}
              activeOpacity={0.75}
            >
              <Text style={styles.pickerLabel}>TO</Text>
              <Text style={[styles.pickerVal, { color: colors.primary }]} numberOfLines={1}>
                {labelFor(targetLanguage)}
              </Text>
            </TouchableOpacity>
          </View>

          {/* LANGUAGE CHIPS (apply to the highlighted FROM / TO side) */}
          <Text style={styles.chipsHint}>
            Tap FROM or TO, then choose the {pickerMode === "source" ? "source" : "target"} language
          </Text>
          <View style={styles.chipsRow}>
            {chipOptions.map((l) => {
              const isSel = selectedCode === l.value;
              return (
                <TouchableOpacity
                  key={l.value}
                  style={[styles.chip, isSel && styles.chipActive]}
                  onPress={() => selectLanguage(l.value)}
                >
                  <Text style={[styles.chipText, isSel && styles.chipTextActive]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SurfaceCard>

        {/* INPUT CARD */}
        <SurfaceCard style={styles.ioCard}>
          <TextInput
            style={styles.textInput}
            multiline
            numberOfLines={4}
            placeholder="Type phrases or conversation to translate..."
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            maxLength={4500}
          />

          <View style={styles.ioCardFooter}>
            {text ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setText("");
                  setTranslatedText("");
                  setError(null);
                }}
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.translateBtn, (loading || !text.trim()) && styles.btnDisabled]}
              onPress={() => handleTranslate()}
              disabled={loading || !text.trim()}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <AppIcon name="language" size={16} color={colors.white} />
                  <Text style={styles.translateBtnText}>Translate</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SurfaceCard>

        {error ? (
          <SurfaceCard style={[styles.ioCard, styles.errorCard]}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => handleTranslate()} style={{ marginTop: 8 }}>
              <Text style={styles.actionBtnText}>Try again</Text>
            </TouchableOpacity>
          </SurfaceCard>
        ) : null}

        {/* OUTPUT CARD */}
        {translatedText ? (
          <SurfaceCard style={[styles.ioCard, styles.outputCard]} variant="elevated">
            <Text style={styles.outputLabel}>TRANSLATION · {labelFor(targetLanguage).toUpperCase()}</Text>
            <Text style={styles.outputText} selectable>
              {translatedText}
            </Text>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={() => speakText(translatedText, targetLanguage)}
              >
                <AppIcon name="volume-high" size={18} color={colors.primary} />
                <Text style={styles.actionBtnText}>Listen</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionIconBtn} onPress={() => copyToClipboard(translatedText)}>
                <AppIcon name="copy" size={18} color={colors.textSecondary} />
                <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Copy</Text>
              </TouchableOpacity>
            </View>
          </SurfaceCard>
        ) : null}

        {/* COMMON TRAVEL PHRASES */}
        <View style={styles.sectionHeader}>
          <Text style={typography.h3}>Common Safety Phrases</Text>
        </View>

        {COMMON_PHRASES.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.phraseItem}
            onPress={() => {
              setText(item.phrase);
              // Phrases are English, so translate from English regardless of the FROM selection
              setSourceLanguage("en");
              handleTranslate(item.phrase, "en", targetLanguage);
            }}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.phraseCategory}>{item.category}</Text>
              <Text style={styles.phraseText}>"{item.phrase}"</Text>
            </View>
            <AppIcon name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* BOTTOM NAV */}
      <CustomBottomNav activeTab="Home" navigation={navigation} />
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: 12,
    paddingBottom: 110,
  },
  selectorCard: {
    padding: 16,
    marginBottom: 16,
    borderColor: colors.primaryBorder,
  },
  langSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  langPickerCol: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "transparent",
  },
  langPickerColActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: `${colors.primary}10`,
  },
  pickerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  pickerVal: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 4,
  },
  swapBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}18`,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  chipsHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: "800",
  },
  ioCard: {
    padding: 16,
    marginBottom: 14,
  },
  textInput: {
    color: colors.textPrimary,
    fontSize: 15,
    textAlignVertical: "top",
    minHeight: 80,
  },
  ioCardFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearBtnText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  translateBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 18,
    gap: 6,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  translateBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    fontWeight: "800",
    color: colors.white,
  },
  errorCard: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.danger,
  },
  outputCard: {
    borderColor: colors.primaryBorder,
  },
  outputLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  outputText: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
    lineHeight: 28,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionIconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
  sectionHeader: {
    marginTop: 12,
    marginBottom: 12,
  },
  phraseItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phraseCategory: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.primary,
    textTransform: "uppercase",
  },
  phraseText: {
    ...typography.bodySm,
    color: colors.textPrimary,
    marginTop: 2,
  },
});
