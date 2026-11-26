import { useMemo } from "react";
import { useColorScheme } from "react-native";

export type AppColors = {
  ink: string;
  muted: string;
  canvas: string;
  surface: string;
  surfaceSubtle: string;
  inputBg: string;
  line: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  successText: string;
};

export const lightColors: AppColors = {
  ink: "#10201C",
  muted: "#5B6B66",
  canvas: "#F5F8F6",
  surface: "#FFFFFF",
  surfaceSubtle: "#F1F5F3",
  inputBg: "#FBFDFC",
  line: "#DCE6E1",
  primary: "#0F766E",
  primaryDark: "#0B4F4A",
  primarySoft: "#F0FDF9",
  accent: "#2563EB",
  accentSoft: "#DBEAFE",
  warning: "#EA580C",
  warningSoft: "#FFEDD5",
  danger: "#DC2626",
  dangerSoft: "#F5C2C2",
  successText: "#15803D"
};

export const darkColors: AppColors = {
  ink: "#F1F5F9",
  muted: "#94A3B8",
  canvas: "#0B1210",
  surface: "#141F1C",
  surfaceSubtle: "#1D2C28",
  inputBg: "#101916",
  line: "#283A35",
  primary: "#14B8A6",
  primaryDark: "#064E3B",
  primarySoft: "#122D27",
  accent: "#60A5FA",
  accentSoft: "#1E3A5F",
  warning: "#FB923C",
  warningSoft: "#432414",
  danger: "#F87171",
  dangerSoft: "#451A1A",
  successText: "#4ADE80"
};

// Static export kept for default Light styles / non-hook callers
export const colors = lightColors;

export const shadows = {
  card: {
    shadowColor: "#0B1F1A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 6
  }
};

export function useAppTheme(): {
  colors: AppColors;
  isDark: boolean;
  scheme: "light" | "dark";
} {
  const raw = useColorScheme();
  const isDark = raw === "dark";
  return useMemo(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      scheme: isDark ? "dark" : "light"
    }),
    [isDark]
  );
}
