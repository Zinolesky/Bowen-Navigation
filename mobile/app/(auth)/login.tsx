import { router } from "expo-router";
import { Compass, Eye, EyeOff, LockKeyhole, Navigation, ShieldCheck, UserPlus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth";
import { showAppAlert } from "@/components/AppAlertProvider";
import { AppColors, shadows, useAppTheme } from "@/theme";

type AuthTab = "signin" | "register";

function formatApiError(error: any): string {
  if (error?.response?.data) {
    const data = error.response.data;
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.join("\n");
    if (typeof data === "object") {
      return Object.entries(data)
        .map(([field, err]) => {
          const text = Array.isArray(err) ? err.join(" ") : String(err);
          return field === "non_field_errors" || field === "detail" ? text : `${field}: ${text}`;
        })
        .join("\n");
    }
  }
  return error?.message || "Check your details and make sure the backend is reachable.";
}

export default function LoginScreen() {
  const { signIn, register, continueAsGuest } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState<AuthTab>("signin");
  const [fullName, setFullName] = useState("");
  const [matricNumber, setMatricNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!matricNumber.trim()) {
      showAppAlert("Missing ID", "Enter your matriculation number or staff ID.", undefined, "warning");
      return;
    }
    if (!password) {
      showAppAlert("Password required", "Enter your account password.", undefined, "warning");
      return;
    }

    if (tab === "register") {
      if (fullName.trim().length < 2) {
        showAppAlert(
          "Missing full name",
          "Enter your full name to create your student account.",
          undefined,
          "warning"
        );
        return;
      }
      if (password.length < 6) {
        showAppAlert(
          "Weak password",
          "Password must be at least 6 characters long.",
          undefined,
          "warning"
        );
        return;
      }
      if (password !== confirmPassword) {
        showAppAlert(
          "Password mismatch",
          "Password and confirm password do not match.",
          undefined,
          "warning"
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      if (tab === "signin") {
        await signIn(matricNumber, password);
      } else {
        await register({
          full_name: fullName,
          matric_number: matricNumber,
          email: email || undefined,
          password
        });
      }
      router.replace("/(app)/map");
    } catch (error: any) {
      showAppAlert(
        tab === "signin" ? "Sign in failed" : "Registration failed",
        formatApiError(error),
        undefined,
        "danger"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGuestAccess() {
    await continueAsGuest();
    router.replace("/(app)/map");
  }

  function fillDemoStudent() {
    setTab("signin");
    setMatricNumber("BU22CSC1136");
    setPassword("BU22CSC1136");
  }

  function fillDemoAdmin() {
    setTab("signin");
    setMatricNumber("ADMIN001");
    setPassword("ADMIN001");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <View style={[styles.logo, shadows.card]}>
              <Navigation size={34} color="#FFFFFF" />
            </View>
            <View style={styles.uniBadge}>
              <ShieldCheck size={12} color={colors.primary} />
              <Text style={styles.uniBadgeText}>Bowen University • Iwo</Text>
            </View>
            <Text style={styles.title}>Bowen Navigator</Text>
            <Text style={styles.subtitle}>
              Enterprise campus wayfinding, real-time turn-by-turn voice guidance & directory
            </Text>
          </View>

          <View style={[styles.form, shadows.card]}>
            <View style={styles.roleSwitch}>
              <Pressable
                onPress={() => {
                  setTab("signin");
                  setConfirmPassword("");
                }}
                style={[styles.roleTab, tab === "signin" && styles.roleTabActive]}
              >
                <LockKeyhole size={15} color={tab === "signin" ? "#FFFFFF" : colors.muted} />
                <Text style={[styles.roleTabText, tab === "signin" && styles.roleTabTextActive]}>
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTab("register");
                  setPassword("");
                  setConfirmPassword("");
                }}
                style={[styles.roleTab, tab === "register" && styles.roleTabActive]}
              >
                <UserPlus size={15} color={tab === "register" ? "#FFFFFF" : colors.muted} />
                <Text style={[styles.roleTabText, tab === "register" && styles.roleTabTextActive]}>
                  Create Account
                </Text>
              </Pressable>
            </View>

            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>
                {tab === "signin" ? "Student & Staff Sign In" : "Student Registration"}
              </Text>
            </View>

            {tab === "register" && (
              <>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  placeholder="e.g. Taigbenu Efezino"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </>
            )}

            <Text style={styles.label}>
              {tab === "signin" ? "Matric number / Staff ID" : "Matric number"}
            </Text>
            <TextInput
              value={matricNumber}
              onChangeText={(value) => setMatricNumber(value.toUpperCase())}
              autoCapitalize="characters"
              placeholder={tab === "signin" ? "e.g. BU22CSC1136 or ADMIN001" : "e.g. BU23CSC1001"}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            {tab === "register" && (
              <>
                <Text style={styles.label}>Email (optional)</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="name@bowen.edu.ng"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </>
            )}

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholder={tab === "register" ? "At least 6 characters" : "Enter your password"}
                placeholderTextColor={colors.muted}
                style={styles.passwordInput}
              />
              <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={8}>
                {showPassword ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
              </Pressable>
            </View>

            {tab === "register" && (
              <>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  placeholder="Re-enter password"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </>
            )}

            <Pressable
              disabled={submitting}
              onPress={handleSubmit}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {tab === "signin" ? "Sign In" : "Create Student Account"}
                </Text>
              )}
            </Pressable>

            {__DEV__ && tab === "signin" && (
              <View style={styles.devDemoRow}>
                <Text style={styles.devDemoLabel}>Quick demo access:</Text>
                <Pressable onPress={fillDemoStudent} style={styles.devDemoChip}>
                  <Text style={styles.devDemoChipText}>Student</Text>
                </Pressable>
                <Pressable onPress={fillDemoAdmin} style={styles.devDemoChip}>
                  <Text style={styles.devDemoChipText}>Admin</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Pressable
            onPress={handleGuestAccess}
            style={({ pressed }) => [styles.guestBtn, shadows.card, pressed && styles.pressed]}
          >
            <Compass size={18} color={colors.primary} />
            <Text style={styles.guestBtnText}>Continue as Guest / Visitor</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.canvas
    },
    keyboard: {
      flex: 1
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 22,
      gap: 18
    },
    brandBlock: {
      alignItems: "center",
      gap: 8
    },
    logo: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 2
    },
    uniBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.line
    },
    uniBadgeText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.4
    },
    title: {
      fontSize: 30,
      fontWeight: "900",
      color: colors.ink,
      letterSpacing: -0.5
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      textAlign: "center",
      paddingHorizontal: 10,
      fontWeight: "600"
    },
    form: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.line
    },
    roleSwitch: {
      flexDirection: "row",
      backgroundColor: colors.surfaceSubtle,
      borderRadius: 12,
      padding: 4,
      marginBottom: 16,
      gap: 4
    },
    roleTab: {
      flex: 1,
      height: 40,
      borderRadius: 9,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6
    },
    roleTabActive: {
      backgroundColor: colors.primary
    },
    roleTabText: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.muted
    },
    roleTabTextActive: {
      color: "#FFFFFF"
    },
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 14
    },
    formTitle: {
      fontSize: 18,
      fontWeight: "900",
      color: colors.ink
    },
    label: {
      fontSize: 12.5,
      fontWeight: "800",
      color: colors.muted,
      marginBottom: 7
    },
    input: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 14,
      marginBottom: 14,
      color: colors.ink,
      backgroundColor: colors.inputBg,
      fontSize: 15.5,
      fontWeight: "600"
    },
    passwordWrap: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 14,
      marginBottom: 14,
      backgroundColor: colors.inputBg,
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    passwordInput: {
      flex: 1,
      color: colors.ink,
      fontSize: 15.5,
      fontWeight: "600"
    },
    button: {
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4
    },
    pressed: {
      opacity: 0.85
    },
    buttonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900"
    },
    devDemoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.line
    },
    devDemoLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.muted
    },
    devDemoChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.line
    },
    devDemoChipText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.accent
    },
    guestBtn: {
      height: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8
    },
    guestBtnText: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.primary
    }
  });
