import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import SurfaceCard from "../common/SurfaceCard";
import AppIcon from "../common/AppIcon";
import { colors, radius, typography } from "../../theme";
import {
  isOnDeviceOcrAvailable,
  OcrError,
  OcrResult,
  prepareImage,
  recognizeText,
  SUPPORTED_OCR_SCRIPTS_NOTE,
} from "../../services/ocrService";
import { translateText, translationErrorMessage } from "../../services/translationService";

type Props = {
  sourceLanguage: string;
  targetLanguage: string;
  targetLabel: string;
  onSpeak: (text: string, lang: string) => void;
  onCopy: (text: string) => void;
};

type Phase = "idle" | "preparing" | "recognizing" | "translating" | "done" | "error";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/**
 * Lens-style visual translation: photo -> on-device OCR -> editable text -> translation.
 * Recognized text blocks are highlighted on the photo; tapping one translates only that block.
 */
export default function VisualTranslator({ sourceLanguage, targetLanguage, targetLabel, onSpeak, onCopy }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [recognized, setRecognized] = useState("");
  const [translated, setTranslated] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState({ width: 0, height: 0 });
  const [blockTranslations, setBlockTranslations] = useState<Record<number, string>>({});
  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const requestId = useRef(0);
  const cloud = !isOnDeviceOcrAvailable();

  const reset = () => {
    requestId.current += 1;
    setImageUri(null);
    setOcr(null);
    setRecognized("");
    setTranslated("");
    setBlockTranslations({});
    setActiveBlock(null);
    setError(null);
    setPhase("idle");
  };

  const runTranslation = async (text: string) => {
    const id = requestId.current;
    setPhase("translating");
    setError(null);
    try {
      const out = await translateText(text, sourceLanguage, targetLanguage);
      if (id !== requestId.current) return; // a newer photo/request replaced this one
      setTranslated(out);
      setPhase("done");
    } catch (err) {
      if (id !== requestId.current) return;
      setTranslated("");
      setError(translationErrorMessage(err));
      setPhase("error");
    }
  };

  const recognize = async (asset: ImagePicker.ImagePickerAsset) => {
    const id = ++requestId.current;
    setError(null);
    setTranslated("");
    setBlockTranslations({});
    setActiveBlock(null);
    setOcr(null);
    setRecognized("");
    try {
      if (asset.fileSize && asset.fileSize > MAX_INPUT_BYTES) {
        throw new OcrError("This image is larger than 15 MB. Please choose a smaller photo.", "TOO_LARGE");
      }
      if (asset.mimeType && !/^image\/(jpe?g|png|webp|heic|heif)$/i.test(asset.mimeType)) {
        throw new OcrError("Unsupported file type. Use a JPG, PNG or WEBP photo.");
      }
      setPhase("preparing");
      const prepared = await prepareImage(asset.uri, asset.width, asset.height);
      if (id !== requestId.current) return;
      setImageUri(prepared.uri);
      setPhase("recognizing");
      const result = await recognizeText(prepared, sourceLanguage);
      if (id !== requestId.current) return;
      setOcr(result);
      setRecognized(result.text);
      await runTranslation(result.text);
    } catch (err: any) {
      if (id !== requestId.current) return;
      setError(err instanceof OcrError ? err.message : "Could not process this photo. Please try again.");
      setPhase("error");
    }
  };

  const pick = async (source: "camera" | "library") => {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          `${source === "camera" ? "Camera" : "Photo library"} permission is needed for visual translation. Enable it in Settings.`
        );
        setPhase("error");
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false };
      const result =
        source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return; // user cancelled: keep current state
      await recognize(result.assets[0]);
    } catch (err) {
      console.log("[VisualTranslator] picker error:", err);
      setError("Could not open the camera or gallery on this device.");
      setPhase("error");
    }
  };

  const translateBlock = async (index: number) => {
    if (!ocr) return;
    setActiveBlock(index);
    if (blockTranslations[index]) return;
    try {
      const out = await translateText(ocr.blocks[index].text, sourceLanguage, targetLanguage);
      setBlockTranslations((m) => ({ ...m, [index]: out }));
    } catch (err) {
      Alert.alert("Translation failed", translationErrorMessage(err));
    }
  };

  const onPreviewLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPreview({ width, height });
  };

  // Map ML Kit frames (image pixels) onto the preview, which uses resizeMode="contain"
  const overlayBoxes = () => {
    if (!ocr || !ocr.imageWidth || !preview.width) return [];
    const scale = Math.min(preview.width / ocr.imageWidth, preview.height / ocr.imageHeight);
    const offX = (preview.width - ocr.imageWidth * scale) / 2;
    const offY = (preview.height - ocr.imageHeight * scale) / 2;
    return ocr.blocks.map((b, i) =>
      b.frame
        ? {
            i,
            left: offX + b.frame.left * scale,
            top: offY + b.frame.top * scale,
            width: b.frame.width * scale,
            height: b.frame.height * scale,
          }
        : null
    );
  };

  const busy = phase === "preparing" || phase === "recognizing" || phase === "translating";
  const statusText =
    phase === "preparing" ? "Preparing photo..." : phase === "recognizing" ? "Reading text..." : phase === "translating" ? `Translating to ${targetLabel}...` : "";

  return (
    <SurfaceCard style={styles.card} variant="elevated">
      <View style={styles.headerRow}>
        <AppIcon name="camera" size={18} color={colors.primary} />
        <Text style={styles.title}>Visual Translate</Text>
      </View>
      <Text style={styles.subtitle}>
        Photograph a sign, menu or notice to read and translate its text.
        {cloud
          ? " On this build the photo is sent securely to TrustTrip's server for text recognition."
          : " Text is recognized on your phone; only the recognized text is sent for translation."}
      </Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.pickBtn} onPress={() => pick("camera")} disabled={busy} activeOpacity={0.8}>
          <AppIcon name="camera" size={16} color={colors.white} />
          <Text style={styles.pickBtnText}>{imageUri ? "Retake" : "Take Photo"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pickBtn, styles.pickBtnAlt]} onPress={() => pick("library")} disabled={busy} activeOpacity={0.8}>
          <AppIcon name="image" size={16} color={colors.primary} />
          <Text style={[styles.pickBtnText, { color: colors.primary }]}>{imageUri ? "Replace" : "Gallery"}</Text>
        </TouchableOpacity>
        {(imageUri || error) && !busy ? (
          <TouchableOpacity style={styles.clearBtn} onPress={reset}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {imageUri ? (
        <View style={styles.previewWrap} onLayout={onPreviewLayout}>
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          {overlayBoxes().map((box) =>
            box ? (
              <TouchableOpacity
                key={box.i}
                onPress={() => translateBlock(box.i)}
                style={[
                  styles.blockBox,
                  { left: box.left, top: box.top, width: box.width, height: box.height },
                  activeBlock === box.i && styles.blockBoxActive,
                ]}
                accessibilityLabel={`Text block ${box.i + 1}`}
              />
            ) : null
          )}
          {busy && (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color={colors.white} />
              <Text style={styles.busyText}>{statusText}</Text>
            </View>
          )}
        </View>
      ) : busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.busyRowText}>{statusText}</Text>
        </View>
      ) : null}

      {ocr && ocr.blocks.some((b) => b.frame) ? (
        <Text style={styles.hint}>Tap a highlighted area to translate just that part.</Text>
      ) : null}

      {activeBlock !== null && ocr ? (
        <View style={styles.blockResult}>
          <Text style={styles.blockOriginal} numberOfLines={3}>{ocr.blocks[activeBlock]?.text}</Text>
          {blockTranslations[activeBlock] ? (
            <View style={styles.blockTranslatedRow}>
              <Text style={styles.blockTranslated} selectable>{blockTranslations[activeBlock]}</Text>
              <TouchableOpacity onPress={() => onCopy(blockTranslations[activeBlock])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <AppIcon name="copy" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 6 }} />
          )}
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {recognized ? (
            <TouchableOpacity onPress={() => runTranslation(recognized)}>
              <Text style={styles.linkText}>Retry translation</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {ocr ? (
        <>
          <Text style={styles.label}>DETECTED TEXT (edit if needed)</Text>
          <TextInput
            style={styles.recognizedInput}
            value={recognized}
            onChangeText={setRecognized}
            multiline
            maxLength={4500}
            placeholder="No text"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.translateBtn, (busy || !recognized.trim()) && { opacity: 0.4 }]}
            disabled={busy || !recognized.trim()}
            onPress={() => runTranslation(recognized)}
          >
            {phase === "translating" ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.translateBtnText}>Translate to {targetLabel}</Text>
            )}
          </TouchableOpacity>
        </>
      ) : null}

      {translated ? (
        <View style={styles.resultBox}>
          <Text style={styles.label}>TRANSLATION · {targetLabel.toUpperCase()}</Text>
          <Text style={styles.resultText} selectable>{translated}</Text>
          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.resultAction} onPress={() => onSpeak(translated, targetLanguage)}>
              <AppIcon name="volume-high" size={16} color={colors.primary} />
              <Text style={styles.linkText}>Listen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resultAction} onPress={() => onCopy(translated)}>
              <AppIcon name="copy" size={16} color={colors.textSecondary} />
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={styles.footnote}>{SUPPORTED_OCR_SCRIPTS_NOTE}</Text>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  pickBtnAlt: { backgroundColor: colors.accentSubtle, borderWidth: 1, borderColor: colors.primaryBorder },
  pickBtnText: { ...typography.caption, color: colors.white, fontWeight: "800" },
  clearBtn: { paddingVertical: 9, paddingHorizontal: 8 },
  clearBtnText: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
  previewWrap: {
    marginTop: 14,
    height: 260,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  blockBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(0, 194, 146, 0.9)",
    backgroundColor: "rgba(0, 194, 146, 0.12)",
    borderRadius: 4,
  },
  blockBoxActive: { borderColor: colors.warning, backgroundColor: "rgba(245, 158, 11, 0.25)" },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  busyText: { ...typography.caption, color: colors.white, fontWeight: "700" },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  busyRowText: { ...typography.caption, color: colors.textSecondary },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: 8 },
  blockResult: {
    marginTop: 10,
    padding: 12,
    borderRadius: radius.card,
    backgroundColor: colors.lightBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockOriginal: { ...typography.caption, color: colors.textSecondary },
  blockTranslatedRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 6 },
  blockTranslated: { ...typography.bodySm, color: colors.textPrimary, fontWeight: "700", flex: 1 },
  errorBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: radius.card,
    backgroundColor: colors.dangerSurface,
  },
  errorText: { ...typography.caption, color: colors.danger, lineHeight: 18 },
  label: { fontSize: 10, fontWeight: "800", color: colors.textMuted, letterSpacing: 0.8, marginTop: 14, marginBottom: 6 },
  recognizedInput: {
    minHeight: 70,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 10,
    color: colors.textPrimary,
    backgroundColor: colors.lightBackground,
    textAlignVertical: "top",
    fontSize: 14,
  },
  translateBtn: {
    marginTop: 10,
    alignSelf: "flex-end",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  translateBtnText: { ...typography.caption, color: colors.white, fontWeight: "800" },
  resultBox: { marginTop: 4 },
  resultText: { ...typography.h3, fontSize: 17, color: colors.textPrimary, lineHeight: 26 },
  resultActions: { flexDirection: "row", gap: 18, marginTop: 10 },
  resultAction: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkText: { ...typography.caption, color: colors.primary, fontWeight: "700", marginTop: 4 },
  footnote: { fontSize: 10, color: colors.textMuted, marginTop: 14, lineHeight: 14 },
});
