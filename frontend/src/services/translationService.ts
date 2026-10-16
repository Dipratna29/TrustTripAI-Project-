import api from "../config/api";

export class TranslationError extends Error {}

/** Friendly message for a failed request (no stack traces or provider details). */
export const translationErrorMessage = (err: any, fallback = "Translation failed. Please try again.") =>
  err instanceof TranslationError
    ? err.message
    : err?.response?.data?.message ||
      (err?.request ? "Can't reach the server. Check your internet connection." : fallback);

/**
 * Translate through the backend fallback chain (Google -> MyMemory -> Groq).
 * Throws TranslationError on a provider failure instead of echoing the input back.
 */
export async function translateText(text: string, source: string, target: string): Promise<string> {
  const query = text.trim();
  if (!query) throw new TranslationError("Nothing to translate.");
  const res = await api.post(
    "/translate",
    { text: query, source_language: source, target_language: target },
    { timeout: 20000 }
  );
  const result = res.data?.translated_text ?? res.data?.translation;
  if (!res.data?.success || !result) {
    throw new TranslationError(res.data?.message || "Translation failed. Please try again.");
  }
  return result;
}
