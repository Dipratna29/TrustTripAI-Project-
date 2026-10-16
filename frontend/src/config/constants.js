import Constants from "expo-constants";

const expoExtra = Constants.expoConfig?.extra ?? {};
const runtimeProcessEnv = typeof process !== "undefined" ? process.env : {};

const getEnvValue = (key, fallback) => {
  const value = runtimeProcessEnv[key] ?? expoExtra[key] ?? fallback;
  return value ?? fallback;
};

const defaultApiBaseUrl = __DEV__ ? "http://10.170.240.190:5000" : "";
const configuredApiBaseUrl = getEnvValue("API_BASE_URL", defaultApiBaseUrl).replace(/\/$/, "");
if (!__DEV__ && !configuredApiBaseUrl.startsWith("https://")) {
  throw new Error("API_BASE_URL must use HTTPS outside development");
}

export const API_BASE_URL = configuredApiBaseUrl;
export const RAZORPAY_KEY_ID = getEnvValue("RAZORPAY_KEY_ID", "");
export const APP_NAME = getEnvValue("APP_NAME", "TrustTrip");
export const APP_VERSION = getEnvValue("APP_VERSION", "1.0.0");
export const REQUEST_TIMEOUT = Number(getEnvValue("REQUEST_TIMEOUT", "10000"));
