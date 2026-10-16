/**
 * Text recognition for visual translation.
 *
 * Primary: on-device Google ML Kit (@react-native-ml-kit/text-recognition) - free, offline,
 * and the photo never leaves the phone. Requires a native build (dev client / EAS APK);
 * it is not available in Expo Go or on web.
 *
 * Fallback: backend POST /ocr (cloud OCR, only if the server has OCR_SPACE_API_KEY). The UI
 * tells the user before a photo is uploaded.
 */
import { NativeModules, Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import api from "../config/api";

export type OcrBlock = {
  text: string;
  /** Bounding box in ORIGINAL image pixels (on-device OCR only) */
  frame?: { left: number; top: number; width: number; height: number };
};

export type OcrResult = {
  text: string;
  blocks: OcrBlock[];
  engine: "on-device" | "cloud";
  imageWidth: number;
  imageHeight: number;
};

export class OcrError extends Error {
  constructor(message: string, public code: "NO_TEXT" | "UNAVAILABLE" | "FAILED" | "TOO_LARGE" = "FAILED") {
    super(message);
  }
}

/** ML Kit script models. Each non-Latin model also reads Latin text. */
export type OcrScript = "Latin" | "Devanagari" | "Chinese" | "Japanese" | "Korean";

export const scriptForLanguage = (lang: string): OcrScript => {
  switch (lang) {
    case "hi":
    case "mr":
    case "ne":
    case "sa":
      return "Devanagari";
    case "zh":
    case "zh-CN":
      return "Chinese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "auto":
      // Most useful default for India: reads Devanagari AND Latin signs/menus
      return "Devanagari";
    default:
      return "Latin";
  }
};

export const SUPPORTED_OCR_SCRIPTS_NOTE =
  "Reads Latin-script languages (English, French, German, Spanish...), Hindi/Marathi (Devanagari), Chinese, Japanese and Korean. Other scripts such as Tamil, Telugu, Bengali or Gujarati are not supported by on-device OCR.";

export const isOnDeviceOcrAvailable = () => Platform.OS !== "web" && !!NativeModules.TextRecognition;

const MAX_DIMENSION = 1600;

/** Downscale/compress large photos: faster OCR, smaller uploads, no huge files kept around. */
export async function prepareImage(uri: string, width?: number, height?: number) {
  const longest = Math.max(width || 0, height || 0);
  const actions: ImageManipulator.Action[] =
    longest > MAX_DIMENSION
      ? [width && width >= (height || 0) ? { resize: { width: MAX_DIMENSION } } : { resize: { height: MAX_DIMENSION } }]
      : [];
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: !isOnDeviceOcrAvailable(),
  });
  return out; // { uri, width, height, base64? }
}

const cleanText = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

async function recognizeOnDevice(uri: string, script: OcrScript, width: number, height: number): Promise<OcrResult> {
  // Imported lazily so Expo Go / web do not crash at module load
  const TextRecognition = require("@react-native-ml-kit/text-recognition").default;
  const result = await TextRecognition.recognize(uri, script);
  const blocks: OcrBlock[] = (result?.blocks || [])
    .map((b: any) => ({ text: cleanText(b.text || ""), frame: b.frame }))
    .filter((b: OcrBlock) => b.text);
  return { text: cleanText(result?.text || ""), blocks, engine: "on-device", imageWidth: width, imageHeight: height };
}

async function recognizeInCloud(base64: string, language: string, width: number, height: number): Promise<OcrResult> {
  if (base64.length > 4 * 1024 * 1024) throw new OcrError("This image is too large. Try a closer, smaller photo.", "TOO_LARGE");
  try {
    const res = await api.post("/ocr", { image_base64: base64, mime_type: "image/jpeg", language }, { timeout: 45000 });
    const blocks: OcrBlock[] = (res.data?.blocks || []).map((b: any) => ({ text: cleanText(b.text || "") })).filter((b: OcrBlock) => b.text);
    return { text: cleanText(res.data?.text || ""), blocks, engine: "cloud", imageWidth: width, imageHeight: height };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 503) throw new OcrError("Text recognition is not available on this build. Install the latest TrustTrip app.", "UNAVAILABLE");
    if (status === 413) throw new OcrError("This image is too large. Try a closer, smaller photo.", "TOO_LARGE");
    throw new OcrError(err?.response?.data?.message || (err?.request ? "Can't reach the server. Check your internet connection." : "Text recognition failed."));
  }
}

export async function recognizeText(
  prepared: { uri: string; width: number; height: number; base64?: string },
  language: string
): Promise<OcrResult> {
  let result: OcrResult;
  if (isOnDeviceOcrAvailable()) {
    try {
      result = await recognizeOnDevice(prepared.uri, scriptForLanguage(language), prepared.width, prepared.height);
    } catch (err: any) {
      console.log("[OCR] on-device recognition error:", err?.message);
      throw new OcrError("Text recognition failed on this device. Please try another photo.");
    }
  } else if (prepared.base64) {
    result = await recognizeInCloud(prepared.base64, language, prepared.width, prepared.height);
  } else {
    throw new OcrError("Text recognition is not available on this device.", "UNAVAILABLE");
  }
  if (!result.text) {
    throw new OcrError("No readable text found. Try a sharper, well-lit photo with the text filling the frame.", "NO_TEXT");
  }
  return result;
}
