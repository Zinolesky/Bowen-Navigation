import * as SecureStore from "expo-secure-store";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { login as apiLogin, setAccessToken } from "./api";
import type { User } from "./types";

type AuthContextValue = {
  isLoading: boolean;
  user?: User;
  accessToken?: string;
  signIn: (fullName: string, matricNumber: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCESS_KEY = "bowen_navigator_access";
const REFRESH_KEY = "bowen_navigator_refresh";
const USER_KEY = "bowen_navigator_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | undefined>();
  const [accessToken, setAccessTokenState] = useState<string | undefined>();

  useEffect(() => {
    async function hydrate() {
      const [storedAccess, storedUser] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_KEY),
        SecureStore.getItemAsync(USER_KEY)
      ]);
      if (storedAccess && storedUser) {
        setAccessToken(storedAccess);
        setAccessTokenState(storedAccess);
        setUser(JSON.parse(storedUser));
      }
      setIsLoading(false);
    }

    hydrate();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      user,
      accessToken,
      async signIn(fullName, matricNumber) {
        const result = await apiLogin(fullName, matricNumber);
        setAccessToken(result.access);
        setAccessTokenState(result.access);
        setUser(result.user);
        await Promise.all([
          SecureStore.setItemAsync(ACCESS_KEY, result.access),
          SecureStore.setItemAsync(REFRESH_KEY, result.refresh),
          SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user))
        ]);
      },
      async signOut() {
        setAccessToken(undefined);
        setAccessTokenState(undefined);
        setUser(undefined);
        await Promise.all([
          SecureStore.deleteItemAsync(ACCESS_KEY),
          SecureStore.deleteItemAsync(REFRESH_KEY),
          SecureStore.deleteItemAsync(USER_KEY)
        ]);
      }
    }),
    [accessToken, isLoading, user]
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

