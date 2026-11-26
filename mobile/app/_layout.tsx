import { Stack } from "expo-router";
import React from "react";
import { StatusBar } from "react-native";

import { AuthProvider } from "@/auth";
import { AppAlertProvider } from "@/components/AppAlertProvider";
import { useAppTheme } from "@/theme";

function ThemedStack() {
  const { isDark, colors } = useAppTheme();
  return (
    <AppAlertProvider>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </AppAlertProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemedStack />
    </AuthProvider>
  );
}
