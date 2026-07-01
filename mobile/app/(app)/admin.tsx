import { Plus, Save, Trash2 } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

import { createPoi, deletePoi, featureToPoi, getCategories, getPois, updatePoi } from "@/api";
import { useAuth } from "@/auth";
import { MarkerBadge } from "@/components/MarkerBadge";
import { colors } from "@/theme";
import type { Category, Poi, PoiProperties } from "@/types";

type FormState = {
  id?: number;
  name: string;
  description: string;
  operating_hours: string;
  latitude: string;
  longitude: string;
  category_id?: number;
  icon_identifier: string;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  operating_hours: "",
  latitude: "7.6236297",
  longitude: "4.1889662",
  icon_identifier: "map-pin"
};

export default function AdminScreen() {
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.category_id),
    [categories, form.category_id]
  );

  async function load() {
    setLoading(true);
    try {
      const [categoryData, poiData] = await Promise.all([getCategories(), getPois()]);
      setCategories(categoryData);
      setPois(
        poiData.features.map((feature) =>
          featureToPoi(feature as { geometry: { coordinates: number[] }; properties: PoiProperties })
        )
      );
      setForm((current) => ({
        ...current,
        category_id: current.category_id || categoryData[0]?.id,
        icon_identifier: current.icon_identifier || categoryData[0]?.icon_identifier || "map-pin"
      }));
    } catch (error) {
      Alert.alert("Admin unavailable", "Check the API connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!user?.is_staff_admin) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.locked}>
          <Text style={styles.title}>Admin</Text>
          <Text style={styles.lockedText}>This area is available to authorised campus staff accounts.</Text>
        </View>
      </SafeAreaView>
    );
  }

  function editPoi(poi: Poi) {
    setForm({
      id: poi.id,
      name: poi.name,
      description: poi.description,
      operating_hours: poi.operating_hours,
      latitude: String(poi.latitude),
      longitude: String(poi.longitude),
      category_id: poi.category.id,
      icon_identifier: poi.icon_identifier || poi.category.icon_identifier
    });
  }

  function resetForm() {
    setForm({
      ...emptyForm,
      category_id: categories[0]?.id,
      icon_identifier: categories[0]?.icon_identifier || "map-pin"
    });
  }

  async function savePoi() {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    if (!form.name.trim() || !form.category_id || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      Alert.alert("Missing POI details", "Name, category, latitude, and longitude are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        operating_hours: form.operating_hours.trim(),
        category_id: form.category_id,
        latitude,
        longitude,
        icon_identifier: form.icon_identifier || selectedCategory?.icon_identifier || "map-pin",
        google_place_id: "",
        is_active: true
      };

      if (form.id) {
        await updatePoi(form.id, payload);
      } else {
        await createPoi(payload);
      }
      resetForm();
      await load();
    } catch (error) {
      Alert.alert("Save failed", "The POI could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removePoi(poi: Poi) {
    Alert.alert("Delete POI", `Delete ${poi.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePoi(poi.id);
            await load();
          } catch (error) {
            Alert.alert("Delete failed", "The POI could not be deleted.");
          }
        }
      }
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Admin</Text>
            <Text style={styles.subtitle}>{pois.length} active POIs</Text>
          </View>
          <Pressable onPress={signOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.formCard} contentContainerStyle={styles.formContent}>
          <View style={styles.formHeader}>
            <Plus size={18} color={colors.primary} />
            <Text style={styles.formTitle}>{form.id ? "Edit point of interest" : "New point of interest"}</Text>
          </View>

          <Text style={styles.label}>Name</Text>
          <TextInput value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} style={styles.input} />

          <Text style={styles.label}>Description</Text>
          <TextInput
            value={form.description}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
            style={[styles.input, styles.multiInput]}
            multiline
          />

          <Text style={styles.label}>Operating hours</Text>
          <TextInput
            value={form.operating_hours}
            onChangeText={(operating_hours) => setForm((current) => ({ ...current, operating_hours }))}
            style={styles.input}
            placeholder="Mon-Fri, 8:00 AM - 5:00 PM"
            placeholderTextColor="#8A9691"
          />

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {categories.map((category) => {
              const active = category.id === form.category_id;
              return (
                <Pressable
                  key={category.id}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      category_id: category.id,
                      icon_identifier: category.icon_identifier
                    }))
                  }
                  style={[styles.categoryChip, active && styles.categoryChipActive, { borderColor: category.color }]}
                >
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{category.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.coordinateRow}>
            <View style={styles.coordinateInput}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput
                value={form.latitude}
                onChangeText={(latitude) => setForm((current) => ({ ...current, latitude }))}
                style={styles.input}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.coordinateInput}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput
                value={form.longitude}
                onChangeText={(longitude) => setForm((current) => ({ ...current, longitude }))}
                style={styles.input}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={styles.formActions}>
            <Pressable onPress={savePoi} disabled={saving} style={styles.saveButton}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Save size={17} color="#FFFFFF" />}
              <Text style={styles.saveText}>{form.id ? "Update POI" : "Create POI"}</Text>
            </Pressable>
            <Pressable onPress={resetForm} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Clear</Text>
            </Pressable>
          </View>
        </ScrollView>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={pois}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.poiList}
            renderItem={({ item }) => (
              <Pressable onPress={() => editPoi(item)} style={styles.poiRow}>
                <MarkerBadge color={item.category.color} icon={item.icon_identifier || item.category.icon_identifier} />
                <View style={styles.poiText}>
                  <Text style={styles.poiName}>{item.name}</Text>
                  <Text style={styles.poiMeta}>
                    {item.category.name} - {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                  </Text>
                </View>
                <Pressable onPress={() => removePoi(item)} style={styles.deleteButton}>
                  <Trash2 size={18} color={colors.danger} />
                </Pressable>
              </Pressable>
            )}
          />
        )}
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
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontWeight: "800",
    marginTop: 2
  },
  signOutButton: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center"
  },
  signOutText: {
    color: colors.primary,
    fontWeight: "900"
  },
  formCard: {
    marginHorizontal: 18,
    maxHeight: 360,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  formContent: {
    padding: 14
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14
  },
  formTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#FBFDFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 15,
    marginBottom: 12
  },
  multiInput: {
    minHeight: 82,
    textAlignVertical: "top"
  },
  categoryRow: {
    gap: 8,
    paddingBottom: 12
  },
  categoryChip: {
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  categoryText: {
    color: colors.muted,
    fontWeight: "800"
  },
  categoryTextActive: {
    color: "#FFFFFF"
  },
  coordinateRow: {
    flexDirection: "row",
    gap: 10
  },
  coordinateInput: {
    flex: 1
  },
  formActions: {
    flexDirection: "row",
    gap: 10
  },
  saveButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  saveText: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  cancelButton: {
    width: 86,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center"
  },
  cancelText: {
    color: colors.primary,
    fontWeight: "900"
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  poiList: {
    padding: 18,
    gap: 10
  },
  poiRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  poiText: {
    flex: 1
  },
  poiName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  poiMeta: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: 3
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F5C2C2",
    alignItems: "center",
    justifyContent: "center"
  },
  locked: {
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  lockedText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8
  }
});

