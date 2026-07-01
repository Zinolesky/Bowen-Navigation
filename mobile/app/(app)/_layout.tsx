import { MaterialIcons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";

import { useAuth } from "@/auth";
import { colors } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AppTabs() {
  const { isLoading, user } = useAuth();
  const insets = useSafeAreaInsets();

  if (!isLoading && !user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          borderTopColor: colors.line,
          height: 64 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700"
        }
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="map" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => <MaterialIcons name="search" color={color} size={size} />
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: user?.is_staff_admin ? "/(app)/admin" : null,
          tabBarIcon: ({ color, size }) => <MaterialIcons name="admin-panel-settings" color={color} size={size} />
        }}
      />
    </Tabs>
  );
}

