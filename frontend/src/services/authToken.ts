import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Session token storage shared by the axios client and AuthContext.
 * Cached in memory so every request does not hit AsyncStorage.
 */
export const STORAGE_TOKEN_KEY = "auth_token";

let cachedToken: string | null | undefined;
let unauthorizedHandler: (() => void) | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await AsyncStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(STORAGE_TOKEN_KEY, token);
  else await AsyncStorage.removeItem(STORAGE_TOKEN_KEY);
}

/** AuthContext registers a callback so an expired/invalid token signs the user out. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized() {
  unauthorizedHandler?.();
}
