import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  login as apiLogin,
  registerStudent as apiRegisterStudent,
  setAccessToken,
  setOnTokenRefreshed,
  setOnUnauthorized,
  setRefreshToken
} from "./api";
import type { User } from "./types";

type AuthContextValue = {
  isLoading: boolean;
  user?: User;
  accessToken?: string;
  isGuest: boolean;
  signIn: (matricNumber: string, password: string, fullName?: string) => Promise<void>;
  register: (input: {
    full_name: string;
    matric_number: string;
    email?: string;
    password: string;
  }) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_KEY = "bowen_navigator_access";
const REFRESH_KEY = "bowen_navigator_refresh";
const USER_KEY = "bowen_navigator_user";
const GUEST_KEY = "bowen_navigator_guest";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | undefined>();
  const [accessToken, setAccessTokenState] = useState<string | undefined>();
  const [isGuest, setIsGuest] = useState(false);

  const signOut = useCallback(async () => {
    setAccessToken(undefined);
    setRefreshToken(undefined);
    setAccessTokenState(undefined);
    setUser(undefined);
    setIsGuest(false);
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      SecureStore.deleteItemAsync(GUEST_KEY)
    ]);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      signOut();
    });
    setOnTokenRefreshed((newAccessToken: string) => {
      setAccessTokenState(newAccessToken);
      SecureStore.setItemAsync(ACCESS_KEY, newAccessToken).catch(() => {});
    });
    return () => {
      setOnUnauthorized(undefined);
      setOnTokenRefreshed(undefined);
    };
  }, [signOut]);

  useEffect(() => {
    async function hydrate() {
      try {
        const [storedAccess, storedRefresh, storedUser, storedGuest] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_KEY),
          SecureStore.getItemAsync(REFRESH_KEY),
          SecureStore.getItemAsync(USER_KEY),
          SecureStore.getItemAsync(GUEST_KEY)
        ]);
        if (storedAccess && storedUser) {
          setAccessToken(storedAccess);
          setRefreshToken(storedRefresh || undefined);
          setAccessTokenState(storedAccess);
          setUser(JSON.parse(storedUser));
          setIsGuest(false);
        } else if (storedGuest === "1") {
          setAccessToken(undefined);
          setRefreshToken(undefined);
          setAccessTokenState(undefined);
          setUser(undefined);
          setIsGuest(true);
        }
      } catch {
        await signOut();
      } finally {
        setIsLoading(false);
      }
    }

    hydrate();
  }, [signOut]);

  const persistSession = useCallback(async (result: { access: string; refresh: string; user: User }) => {
    setAccessToken(result.access);
    setRefreshToken(result.refresh);
    setAccessTokenState(result.access);
    setUser(result.user);
    setIsGuest(false);
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, result.access),
      SecureStore.setItemAsync(REFRESH_KEY, result.refresh),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user)),
      SecureStore.deleteItemAsync(GUEST_KEY)
    ]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      user,
      accessToken,
      isGuest,
      async signIn(matricNumber, password, fullName) {
        const result = await apiLogin(matricNumber, password, fullName);
        await persistSession(result);
      },
      async register(input) {
        const result = await apiRegisterStudent(input);
        await persistSession(result);
      },
      async continueAsGuest() {
        setAccessToken(undefined);
        setRefreshToken(undefined);
        setAccessTokenState(undefined);
        setUser(undefined);
        setIsGuest(true);
        await Promise.all([
          SecureStore.deleteItemAsync(ACCESS_KEY),
          SecureStore.deleteItemAsync(REFRESH_KEY),
          SecureStore.deleteItemAsync(USER_KEY),
          SecureStore.setItemAsync(GUEST_KEY, "1")
        ]);
      },
      signOut
    }),
    [accessToken, isGuest, isLoading, persistSession, signOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
