import axios from "axios";
import { API_BASE_URL, REQUEST_TIMEOUT } from "./constants";
import AxiosErrorLogger from "../utils/axiosErrorLogger";
import { getAuthToken, notifyUnauthorized } from "../services/authToken";

// initialize logger (loads persisted logs)
AxiosErrorLogger.initAxiosErrorLogger().catch(() => {});

// Resolve a development-friendly base URL for the current platform.
// Production builds always use the configured HTTPS URL untouched.
let resolvedBase = API_BASE_URL;
if (__DEV__) {
  if (!API_BASE_URL || API_BASE_URL.includes("your-backend-domain.com")) {
    resolvedBase = "http://127.0.0.1:5000";
  } else if (API_BASE_URL.includes("localhost")) {
    resolvedBase = API_BASE_URL.replace("localhost", "127.0.0.1");
  }
  console.log("[TrustTrip] Active API Base URL:", resolvedBase);
}

const api = axios.create({
  baseURL: resolvedBase,
  timeout: REQUEST_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the signed session token to every request
api.interceptors.request.use(async (config) => {
  const token = await getAuthToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      if (error.response) {
        if (error.response.status === 401 && error.response.data?.error === "unauthorized") {
          notifyUnauthorized();
        }
        AxiosErrorLogger.logError({
          type: 'response',
          status: error.response.status,
          data: error.response.data,
          config: {
            method: error.config?.method,
            url: error.config?.url,
            params: error.config?.params,
          },
        });
      } else if (error.request) {
        AxiosErrorLogger.logError({ type: 'network', message: error.message, config: { url: error.config?.url, method: error.config?.method } });
      } else {
        AxiosErrorLogger.logError({ type: 'request', message: error.message });
      }
    } catch (e) {
      // ignore logging failures
    }

    return Promise.reject(error);
  }
);

export default api;
export { API_BASE_URL };
