import { router } from "expo-router";
import { LockKeyhole, Navigation, ShieldCheck, User as UserIcon } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { colors, shadows } from "@/theme";

type RoleMode = "student" | "staff";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [roleMode, setRoleMode] = useState<RoleMode>("student");
  const [fullName, setFullName] = useState("");
  const [matricNumber, setMatricNumber] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!fullName.trim() || !matricNumber.trim()) {
      Alert.alert("Missing details", "Enter your full name and matriculation / staff ID.");
      return;
    }
    if (roleMode === "staff" && !password) {
      Alert.alert("Password required", "Staff admin accounts must enter a password.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(fullName, matricNumber, roleMode === "staff" ? password : password || undefined);
      router.replace("/(app)/map");
    } catch (error: any) {
      let message = "Check your details and make sure the backend is reachable.";
      if (error?.response?.data) {
        const data = error.response.data;
        if (typeof data === "string") {
          message = data;
        } else if (Array.isArray(data)) {
          message = data.join("\n");
        } else if (typeof data === "object") {
          message = Object.entries(data)
            .map(([field, err]) => (Array.isArray(err) ? err.join(" ") : `${field}: ${err}`))
            .join("\n");
        }
      } else if (error?.message) {
        message = error.message;
      }
      Alert.alert("Login failed", message);
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemoStudent() {
    setRoleMode("student");
    setFullName("Taigbenu Efezino");
    setMatricNumber("BU22CSC1136");
    setPassword("");
  }

  function fillDemoAdmin() {
    setRoleMode("staff");
    setFullName("Campus Admin");
    setMatricNumber("ADMIN001");
    setPassword("ADMIN001");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <View style={styles.logo}>
              <Navigation size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Bowen Navigator</Text>
            <Text style={styles.subtitle}>Campus wayfinding for Bowen University, Iwo</Text>
          </View>

          <View style={[styles.form, shadows.card]}>
            <View style={styles.roleSwitch}>
              <Pressable
                onPress={() => {
                  setRoleMode("student");
                  setPassword("");
                }}
                style={[styles.roleTab, roleMode === "student" && styles.roleTabActive]}
              >
                <UserIcon size={15} color={roleMode === "student" ? "#FFFFFF" : colors.muted} />
                <Text style={[styles.roleTabText, roleMode === "student" && styles.roleTabTextActive]}>
                  Student
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRoleMode("staff")}
                style={[styles.roleTab, roleMode === "staff" && styles.roleTabActive]}
              >
                <ShieldCheck size={15} color={roleMode === "staff" ? "#FFFFFF" : colors.muted} />
                <Text style={[styles.roleTabText, roleMode === "staff" && styles.roleTabTextActive]}>
                  Staff Admin
                </Text>
              </Pressable>
            </View>

            <View style={styles.formHeader}>
              <LockKeyhole size={20} color={colors.primary} />
              <Text style={styles.formTitle}>
                {roleMode === "staff" ? "Staff admin sign in" : "Student sign in"}
              </Text>
            </View>

            <Text style={styles.label}>Full name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              placeholder="e.g. Taigbenu Efezino"
              placeholderTextColor="#8A9691"
              style={styles.input}
            />

            <Text style={styles.label}>
              {roleMode === "staff" ? "Staff ID / Matric number" : "Matric number"}
            </Text>
            <TextInput
              value={matricNumber}
              onChangeText={(value) => setMatricNumber(value.toUpperCase())}
              autoCapitalize="characters"
              placeholder={roleMode === "staff" ? "e.g. ADMIN001" : "e.g. BU22CSC1136"}
              placeholderTextColor="#8A9691"
              style={styles.input}
            />

            {roleMode === "staff" && (
              <>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="Enter staff password"
                  placeholderTextColor="#8A9691"
                  style={styles.input}
                />
              </>
            )}

            <Pressable
              disabled={submitting}
              onPress={handleLogin}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </Pressable>

            {__DEV__ && (
              <View style={styles.devDemoRow}>
                <Text style={styles.devDemoLabel}>Dev quick-fill:</Text>
                <Pressable onPress={fillDemoStudent} style={styles.devDemoChip}>
                  <Text style={styles.devDemoChipText}>Student</Text>
                </Pressable>
                <Pressable onPress={fillDemoAdmin} style={styles.devDemoChip}>
                  <Text style={styles.devDemoChipText}>Admin</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    gap: 24
  },
  brandBlock: {
    alignItems: "center",
    gap: 10
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: 0
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center"
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line
  },
  roleSwitch: {
    flexDirection: "row",
    backgroundColor: "#EEF4F1",
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
    gap: 4
  },
  roleTab: {
    flex: 1,
    height: 36,
    borderRadius: 6,
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
    marginBottom: 16
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 7
  },
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    marginBottom: 14,
    color: colors.ink,
    backgroundColor: "#FBFDFC",
    fontSize: 16
  },
  button: {
    height: 50,
    borderRadius: 8,
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
    fontWeight: "800"
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
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE"
  },
  devDemoChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.accent
  }
});
