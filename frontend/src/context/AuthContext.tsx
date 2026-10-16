import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../config/api";
import {
  initializePushNotifications,
  clearStoredPushToken,
} from "../services/pushNotificationService";
import { getFriendlyErrorMessage } from "../utils/apiError";
import { getAuthToken, setAuthToken, setUnauthorizedHandler } from "../services/authToken";

export interface UserProfile {
  id: number | string;
  username: string;
  name?: string;
  mob?: string;
  full_phone_number?: string;
  country?: string;
  country_code?: string;
  status?: string;
  address?: string;
  emergency_contact?: string;
  profile_photo_url?: string | null;
  [key: string]: any;
}

export interface RegistrationPayload {
  username: string;
  password: string;
  name: string;
  mob?: string;
  address?: string;
  nationality?: string;
  country?: string;
  emergency_contact?: string;
}

export interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  login: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; message?: string }>;
  register: (
    payload: RegistrationPayload
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  updateUser: (patch: Partial<UserProfile>) => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_USER_KEY = "user";

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  /**
   * Safe JSON parse helper
   */
  const safeParseUser = (jsonStr: string | null): UserProfile | null => {
    if (!jsonStr) return null;
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === "object" && (parsed.id || parsed.user_id || parsed.username)) {
        return {
          ...parsed,
          id: parsed.id ?? parsed.user_id,
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  /**
   * Check existing session on application launch
   */
  const checkInitialSession = useCallback(async () => {
    try {
      const storedUserStr = await AsyncStorage.getItem(STORAGE_USER_KEY);
      const parsedUser = safeParseUser(storedUserStr);
      const token = await getAuthToken();

      if (!parsedUser || !token) {
        // Sessions created before signed tokens existed must sign in again
        if (parsedUser && !token) {
          await AsyncStorage.removeItem(STORAGE_USER_KEY);
          setAuthError("For your security, please sign in again.");
        }
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Initial optimism: set parsed user immediately to avoid flicker
      setUser(parsedUser);

      // Verify and refresh profile from backend
      try {
        const res = await api.get(`/profile/${parsedUser.username}`, {
          timeout: 7000,
        });
        const liveProfile = res.data;

        if (liveProfile && typeof liveProfile === "object") {
          const status = (liveProfile.status || "ACTIVE").toUpperCase();
          if (["SUSPENDED", "INACTIVE", "DEACTIVATED", "DELETED"].includes(status)) {
            // Account is blocked by admin - terminate session
            await AsyncStorage.removeItem(STORAGE_USER_KEY);
            await clearStoredPushToken().catch(() => {});
            setUser(null);
            setAuthError("Your account has been suspended. Please contact support@trusttrip.com.");
            setIsLoading(false);
            return;
          }

          const updatedUser: UserProfile = {
            ...parsedUser,
            ...liveProfile,
            id: liveProfile.user_id ?? parsedUser.id,
            status,
          };
          await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updatedUser));
          setUser(updatedUser);
        }
      } catch (profileErr: any) {
        // Offline grace: keep the existing session intact if offline
        console.log("[AuthContext] Backend profile sync notice (offline/transient):", profileErr?.message || profileErr);
      }
    } catch (err) {
      console.log("[AuthContext] Session init error:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkInitialSession();
  }, [checkInitialSession]);

  /**
   * Login with username and password
   */
  const login = useCallback(
    async (
      usernameStr: string,
      passwordStr: string
    ): Promise<{ success: boolean; message?: string }> => {
      setAuthError(null);

      const cleanUsername = usernameStr.trim();
      if (!cleanUsername) {
        return { success: false, message: "Please enter your username." };
      }
      if (!passwordStr) {
        return { success: false, message: "Please enter your password." };
      }

      try {
        const res = await api.post("/login", {
          username: cleanUsername,
          password: passwordStr,
        });

        const data = res.data;
        if (data?.success && data?.user) {
          const authenticatedUser: UserProfile = {
            ...data.user,
            id: data.user.id ?? data.user.user_id,
          };

          // Check if account status is active
          const status = (authenticatedUser.status || "ACTIVE").toUpperCase();
          if (["SUSPENDED", "INACTIVE", "DEACTIVATED", "DELETED"].includes(status)) {
            const blockedMsg = `Your account has been ${status.toLowerCase()} by administrator.`;
            setAuthError(blockedMsg);
            return { success: false, message: blockedMsg };
          }

          if (!data.token) {
            const msg = "Server did not return a session. Please update the app/server.";
            setAuthError(msg);
            return { success: false, message: msg };
          }

          // Persist user session
          await setAuthToken(data.token);
          await AsyncStorage.setItem(
            STORAGE_USER_KEY,
            JSON.stringify(authenticatedUser)
          );

          // Register push token with backend asynchronously
          initializePushNotifications().catch((err: any) =>
            console.log("[AuthContext] Push token register notice:", err)
          );

          setUser(authenticatedUser);
          return { success: true };
        }

        const msg = data?.message || "Invalid username or password.";
        setAuthError(msg);
        return { success: false, message: msg };
      } catch (err: any) {
        const friendlyMsg = getFriendlyErrorMessage(
          err,
          "Incorrect username or password. Please try again."
        );
        setAuthError(friendlyMsg);
        return { success: false, message: friendlyMsg };
      }
    },
    []
  );

  /**
   * Register a new traveler
   */
  const register = useCallback(
    async (
      payload: RegistrationPayload
    ): Promise<{ success: boolean; message?: string }> => {
      setAuthError(null);

      try {
        const res = await api.post("/register", {
          username: payload.username.trim(),
          password: payload.password,
          name: payload.name.trim(),
          mob: (payload.mob || "").trim(),
          address: (payload.address || "").trim(),
          nationality: (payload.nationality || payload.country || "").trim(),
          emergency_contact: (payload.emergency_contact || "").trim(),
        });

        const data = res.data;
        if (data?.success) {
          return {
            success: true,
            message: data.message || "Account created successfully.",
          };
        }

        const msg = data?.message || "Registration failed. Please check your information.";
        setAuthError(msg);
        return { success: false, message: msg };
      } catch (err: any) {
        const friendlyMsg = getFriendlyErrorMessage(
          err,
          "Unable to create account. Please check your details and try again."
        );
        setAuthError(friendlyMsg);
        return { success: false, message: friendlyMsg };
      }
    },
    []
  );

  /**
   * Logout user and purge session state
   */
  const logout = useCallback(async () => {
    try {
      await clearStoredPushToken().catch(() => {});
      await AsyncStorage.removeItem(STORAGE_USER_KEY);
      await setAuthToken(null);
    } catch (e) {
      console.log("[AuthContext] Error clearing storage during logout:", e);
    } finally {
      setUser(null);
      setAuthError(null);
    }
  }, []);

  /**
   * Refresh current user profile
   */
  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!user?.username) return null;

    try {
      const res = await api.get(`/profile/${user.username}`);
      const updated = res.data;
      if (updated && typeof updated === "object") {
        const merged: UserProfile = {
          ...user,
          ...updated,
          id: updated.user_id ?? user.id,
        };
        await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(merged));
        setUser(merged);
        return merged;
      }
    } catch (err) {
      console.log("[AuthContext] Refresh profile error:", err);
    }
    return user;
  }, [user]);

  const updateUser = useCallback(async (patch: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(merged)).catch(() => {});
      return merged;
    });
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  // An invalid/expired token returned 401 from the API: end the session
  useEffect(() => {
    setUnauthorizedHandler(() => {
      Promise.all([AsyncStorage.removeItem(STORAGE_USER_KEY), setAuthToken(null)]).catch(() => {});
      setUser((prev) => {
        if (prev) setAuthError("Your session has expired. Please sign in again.");
        return null;
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      authError,
      login,
      register,
      logout,
      refreshProfile,
      updateUser,
      clearAuthError,
    }),
    [user, isLoading, authError, login, register, logout, refreshProfile, updateUser, clearAuthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
