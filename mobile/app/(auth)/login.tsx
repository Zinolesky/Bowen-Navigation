import { router } from "expo-router";
import { LockKeyhole, Navigation } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth";
import { colors, shadows } from "@/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [fullName, setFullName] = useState("Taigbenu Efezino");
  const [matricNumber, setMatricNumber] = useState("BU22CSC1136");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!fullName.trim() || !matricNumber.trim()) {
      Alert.alert("Missing details", "Enter your full name and matriculation number.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(fullName, matricNumber);
      router.replace("/(app)/map");
    } catch (error) {
      Alert.alert("Login failed", "Check the details and make sure the backend is running.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.brandBlock}>
          <View style={styles.logo}>
            <Navigation size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Bowen Navigator</Text>
          <Text style={styles.subtitle}>Campus wayfinding for Bowen University, Iwo</Text>
        </View>

        <View style={[styles.form, shadows.card]}>
          <View style={styles.formHeader}>
            <LockKeyhole size={20} color={colors.primary} />
            <Text style={styles.formTitle}>Student sign in</Text>
          </View>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            placeholder="Enter full name"
            placeholderTextColor="#8A9691"
            style={styles.input}
          />

          <Text style={styles.label}>Matric number</Text>
          <TextInput
            value={matricNumber}
            onChangeText={(value) => setMatricNumber(value.toUpperCase())}
            autoCapitalize="characters"
            placeholder="BU22CSC1136"
            placeholderTextColor="#8A9691"
            style={styles.input}
          />

          <Pressable disabled={submitting} onPress={handleLogin} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Continue</Text>}
          </Pressable>
        </View>
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
    flex: 1,
    justifyContent: "center",
    padding: 22,
    gap: 28
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
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18
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
  }
});

