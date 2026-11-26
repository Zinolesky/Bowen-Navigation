import { AlertTriangle, CheckCircle2, Compass, ShieldAlert } from "lucide-react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { AppColors, shadows, useAppTheme } from "@/theme";

export type AppAlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export type AppAlertVariant = "info" | "success" | "warning" | "danger";

export type AppAlertOptions = {
  title: string;
  message?: string;
  variant?: AppAlertVariant;
  buttons?: AppAlertButton[];
};

type AlertContextValue = {
  showAlert: (options: AppAlertOptions) => void;
};

const AppAlertContext = createContext<AlertContextValue | undefined>(undefined);

let globalAlertListener: ((options: AppAlertOptions) => void) | undefined;

function inferVariant(title: string, buttons?: AppAlertButton[]): AppAlertVariant {
  const lower = title.toLowerCase();
  if (buttons?.some((b) => b.style === "destructive")) return "danger";
  if (
    lower.includes("failed") ||
    lower.includes("error") ||
    lower.includes("delete") ||
    lower.includes("invalid") ||
    lower.includes("mismatch") ||
    lower.includes("weak")
  ) {
    return "danger";
  }
  if (
    lower.includes("unavailable") ||
    lower.includes("offline") ||
    lower.includes("missing") ||
    lower.includes("required") ||
    lower.includes("permission")
  ) {
    return "warning";
  }
  if (lower.includes("arrived") || lower.includes("complete") || lower.includes("saved")) {
    return "success";
  }
  return "info";
}

export function showAppAlert(
  titleOrOptions: string | AppAlertOptions,
  message?: string,
  buttons?: AppAlertButton[],
  variant?: AppAlertVariant
) {
  const normalized: AppAlertOptions =
    typeof titleOrOptions === "string"
      ? {
          title: titleOrOptions,
          message,
          buttons,
          variant: variant || inferVariant(titleOrOptions, buttons)
        }
      : {
          ...titleOrOptions,
          variant: titleOrOptions.variant || inferVariant(titleOrOptions.title, titleOrOptions.buttons)
        };

  if (globalAlertListener) {
    globalAlertListener(normalized);
  } else {
    Alert.alert(normalized.title, normalized.message, normalized.buttons);
  }
}

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [current, setCurrent] = useState<AppAlertOptions | null>(null);
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback(
    (options: AppAlertOptions) => {
      const resolvedVariant = options.variant || inferVariant(options.title, options.buttons);
      setCurrent({ ...options, variant: resolvedVariant });
      scaleAnim.setValue(0.92);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 6,
          speed: 20
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true
        })
      ]).start();
    },
    [opacityAnim, scaleAnim]
  );

  useEffect(() => {
    globalAlertListener = showAlert;
    return () => {
      if (globalAlertListener === showAlert) {
        globalAlertListener = undefined;
      }
    };
  }, [showAlert]);

  function handleDismiss(btn?: AppAlertButton) {
    setCurrent(null);
    if (btn?.onPress) {
      setTimeout(() => btn.onPress?.(), 40);
    }
  }

  const buttons: AppAlertButton[] =
    current?.buttons && current.buttons.length > 0 ? current.buttons : [{ text: "OK", style: "default" }];

  const variant = current?.variant || "info";
  const accentColor =
    variant === "danger"
      ? colors.danger
      : variant === "warning"
        ? colors.warning
        : variant === "success"
          ? colors.successText
          : colors.primary;

  const badgeBg =
    variant === "danger"
      ? colors.dangerSoft
      : variant === "warning"
        ? colors.warningSoft
        : colors.primarySoft;

  return (
    <AppAlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal
        visible={Boolean(current)}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => handleDismiss()}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => handleDismiss()} />
          {current && (
            <Animated.View
              style={[
                styles.card,
                shadows.card,
                {
                  opacity: opacityAnim,
                  transform: [{ scale: scaleAnim }]
                }
              ]}
            >
              <View style={[styles.topAccentBar, { backgroundColor: accentColor }]} />

              <View style={styles.body}>
                <View style={[styles.iconBadge, { backgroundColor: badgeBg, borderColor: accentColor }]}>
                  {variant === "danger" ? (
                    <ShieldAlert size={24} color={accentColor} />
                  ) : variant === "warning" ? (
                    <AlertTriangle size={24} color={accentColor} />
                  ) : variant === "success" ? (
                    <CheckCircle2 size={24} color={accentColor} />
                  ) : (
                    <Compass size={24} color={accentColor} />
                  )}
                </View>

                <Text style={styles.title}>{current.title}</Text>
                {current.message ? <Text style={styles.message}>{current.message}</Text> : null}

                <View style={[styles.buttonRow, buttons.length > 2 && styles.buttonColumn]}>
                  {buttons.map((btn, idx) => {
                    const isCancel = btn.style === "cancel";
                    const isDestructive = btn.style === "destructive";
                    return (
                      <Pressable
                        key={`${btn.text}-${idx}`}
                        onPress={() => handleDismiss(btn)}
                        style={({ pressed }) => [
                          styles.button,
                          buttons.length <= 2 && { flex: 1 },
                          isCancel
                            ? styles.buttonCancel
                            : isDestructive
                              ? styles.buttonDestructive
                              : styles.buttonPrimary,
                          pressed && { opacity: 0.86 }
                        ]}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            isCancel ? styles.buttonTextCancel : styles.buttonTextSolid
                          ]}
                        >
                          {btn.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          )}
        </View>
      </Modal>
    </AppAlertContext.Provider>
  );
}

export function useAppAlert() {
  const ctx = useContext(AppAlertContext);
  if (!ctx) {
    return {
      showAlert: (options: AppAlertOptions) => showAppAlert(options)
    };
  }
  return ctx;
}

const createStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: isDark ? "rgba(4, 10, 8, 0.74)" : "rgba(11, 31, 26, 0.54)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24
    },
    card: {
      width: "100%",
      maxWidth: 380,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: "hidden"
    },
    topAccentBar: {
      height: 5,
      width: "100%"
    },
    body: {
      paddingHorizontal: 22,
      paddingTop: 20,
      paddingBottom: 20,
      alignItems: "center"
    },
    iconBadge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14
    },
    title: {
      color: colors.ink,
      fontSize: 19,
      fontWeight: "900",
      textAlign: "center",
      letterSpacing: -0.2
    },
    message: {
      color: colors.muted,
      fontSize: 14.5,
      lineHeight: 21,
      fontWeight: "600",
      textAlign: "center",
      marginTop: 8
    },
    buttonRow: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
      marginTop: 20
    },
    buttonColumn: {
      flexDirection: "column"
    },
    button: {
      height: 46,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16
    },
    buttonPrimary: {
      backgroundColor: colors.primary
    },
    buttonDestructive: {
      backgroundColor: colors.danger
    },
    buttonCancel: {
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line
    },
    buttonText: {
      fontSize: 15,
      fontWeight: "800"
    },
    buttonTextSolid: {
      color: "#FFFFFF"
    },
    buttonTextCancel: {
      color: colors.ink
    }
  });
