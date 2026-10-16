import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AppIcon from "../common/AppIcon";
import { colors, radius, typography } from "../../theme";

/**
 * Speech-to-text for the translator (expo-speech-recognition).
 * The native module only exists in a native build (EAS APK / dev client), not Expo Go,
 * so it is required lazily and the button explains when voice input is unavailable.
 */
let speech: any = null;
try {
  speech = require("expo-speech-recognition");
} catch {
  speech = null;
}

const LOCALES: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", mr: "mr-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", kn: "kn-IN",
  gu: "gu-IN", fr: "fr-FR", de: "de-DE", es: "es-ES", ja: "ja-JP", auto: "en-IN",
};

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone or speech permission was denied. Enable it in Settings.",
  "language-not-supported": "Voice input isn't supported for this language on your phone.",
  "service-not-allowed": "Speech recognition isn't available. Install or enable the Google app's voice typing.",
  "no-speech": "Didn't catch that. Tap the mic and speak again.",
  "speech-timeout": "Didn't catch that. Tap the mic and speak again.",
  network: "Voice input needs an internet connection on this phone.",
  "audio-capture": "Couldn't access the microphone.",
  busy: "Speech recognition is busy. Try again in a moment.",
};

type Props = {
  language: string;
  /** Called with partial (live) and final text */
  onTranscript: (text: string, isFinal: boolean) => void;
  disabled?: boolean;
};

export default function VoiceInputButton({ language, onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const subs = useRef<{ remove: () => void }[]>([]);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const available = !!speech?.ExpoSpeechRecognitionModule;

  const cleanup = () => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
  };

  // Never keep the microphone open after leaving the screen
  useEffect(
    () => () => {
      cleanup();
      try {
        speech?.ExpoSpeechRecognitionModule?.abort();
      } catch {
        // already stopped
      }
    },
    []
  );

  const start = async () => {
    if (!available) {
      Alert.alert("Voice input unavailable", "Voice input needs the installed TrustTrip app (not Expo Go). Please update the app.");
      return;
    }
    const mod = speech.ExpoSpeechRecognitionModule;
    setStarting(true);
    try {
      const perm = await mod.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", ERROR_MESSAGES["not-allowed"]);
        return;
      }
      if (typeof mod.isRecognitionAvailable === "function" && !mod.isRecognitionAvailable()) {
        Alert.alert("Voice input unavailable", ERROR_MESSAGES["service-not-allowed"]);
        return;
      }
      cleanup();
      subs.current = [
        speech.addSpeechRecognitionListener("start", () => setListening(true)),
        speech.addSpeechRecognitionListener("result", (ev: any) => {
          const text = ev?.results?.[0]?.transcript || "";
          if (text) onTranscriptRef.current(text, !!ev?.isFinal);
        }),
        speech.addSpeechRecognitionListener("error", (ev: any) => {
          setListening(false);
          if (ev?.error && ev.error !== "aborted") {
            Alert.alert("Voice input", ERROR_MESSAGES[ev.error] || ev?.message || "Speech recognition failed.");
          }
        }),
        speech.addSpeechRecognitionListener("end", () => {
          setListening(false);
          cleanup();
        }),
      ];
      mod.start({
        lang: LOCALES[language] || "en-IN",
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
      });
    } catch (err: any) {
      cleanup();
      setListening(false);
      Alert.alert("Voice input", err?.message || "Could not start speech recognition.");
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    try {
      speech?.ExpoSpeechRecognitionModule?.stop();
    } catch {
      // ignore
    }
  };

  const cancel = () => {
    try {
      speech?.ExpoSpeechRecognitionModule?.abort();
    } catch {
      // ignore
    }
    setListening(false);
    cleanup();
  };

  if (listening) {
    return (
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.btnActive]} onPress={stop} accessibilityLabel="Stop voice input">
          <AppIcon name="mic" size={16} color={colors.white} />
          <Text style={styles.activeText}>Listening… tap to stop</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={cancel} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.btn, (disabled || !available) && { opacity: 0.5 }]}
      onPress={start}
      disabled={disabled || starting}
      accessibilityLabel="Speak to type"
    >
      {starting ? <ActivityIndicator size="small" color={colors.primary} /> : <AppIcon name="mic" size={16} color={colors.primary} />}
      <Text style={styles.text}>Speak</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.accentSubtle,
  },
  btnActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  text: { ...typography.caption, color: colors.primary, fontWeight: "800" },
  activeText: { ...typography.caption, color: colors.white, fontWeight: "800" },
  cancel: { paddingHorizontal: 6, paddingVertical: 8 },
  cancelText: { ...typography.caption, color: colors.textSecondary, fontWeight: "700" },
});
