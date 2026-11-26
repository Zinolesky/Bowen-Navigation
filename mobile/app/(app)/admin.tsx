import * as Location from "expo-location";
import { ChevronDown, ChevronUp, LocateFixed, Plus, Save, Trash2, Users } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createPoi, deletePoi, featureToPoi, getPois, importStudentsCsv, updatePoi } from "@/api";
import { useAuth } from "@/auth";
import { useCampusData } from "@/campusStore";
import { showAppAlert } from "@/components/AppAlertProvider";
import { MarkerBadge } from "@/components/MarkerBadge";
import { AppColors, useAppTheme } from "@/theme";
import type { Poi, PoiProperties } from "@/types";

type FormState = {
  id?: number;
  name: string;
  description: string;
  operating_hours: string;
  latitude: string;
  longitude: string;
  category_id?: number;
  building_id?: number | null;
  google_place_id: string;
  icon_identifier: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  operating_hours: "",
  latitude: "7.621500",
  longitude: "4.199000",
  google_place_id: "",
  icon_identifier: "map-pin",
  is_active: true
};

export default function AdminScreen() {
  const { user, signOut } = useAuth();
  const { categories, pois, loading, refreshCampus } = useCampusData();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [adminPois, setAdminPois] = useState<Poi[]>([]);
  const [saving, setSaving] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [showRosterImport, setShowRosterImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);

  const loadAdminPois = useCallback(async () => {
    if (!user?.is_staff_admin) return;
    try {
      const collection = await getPois({ include_inactive: true });
      const mapped = (collection.features || []).map((feature) =>
        featureToPoi(feature as { id?: number; geometry: { coordinates: number[] }; properties: PoiProperties })
      );
      setAdminPois(mapped);
    } catch {
      // Fallback to campus store POIs when offline
    }
  }, [user?.is_staff_admin]);

  useEffect(() => {
    loadAdminPois();
  }, [loadAdminPois]);

  const displayedPois = adminPois.length > 0 ? adminPois : pois;
  const hiddenCount = useMemo(
    () => displayedPois.filter((p) => p.is_active === false).length,
    [displayedPois]
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === form.category_id),
    [categories, form.category_id]
  );

  useEffect(() => {
    if (categories.length > 0 && !form.category_id) {
      setForm((current) => ({
        ...current,
        category_id: current.category_id || categories[0]?.id,
        icon_identifier: current.icon_identifier || categories[0]?.icon_identifier || "map-pin"
      }));
    }
  }, [categories, form.category_id]);

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
      building_id: poi.building?.id ?? null,
      google_place_id: poi.google_place_id || "",
      icon_identifier: poi.icon_identifier || poi.category.icon_identifier,
      is_active: poi.is_active
    });
  }

  function resetForm() {
    setForm({
      ...emptyForm,
      category_id: categories[0]?.id,
      icon_identifier: categories[0]?.icon_identifier || "map-pin"
    });
  }

  async function fillCurrentGps() {
    setLocatingGps(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        showAppAlert(
          "Permission required",
          "Allow location permission to fill your GPS coordinates.",
          undefined,
          "warning"
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setForm((current) => ({
        ...current,
        latitude: pos.coords.latitude.toFixed(6),
        longitude: pos.coords.longitude.toFixed(6)
      }));
    } catch {
      showAppAlert("GPS unavailable", "Could not fetch current device coordinates.", undefined, "warning");
    } finally {
      setLocatingGps(false);
    }
  }

  async function savePoi() {
    const latitude = Number(form.latitude.trim());
    const longitude = Number(form.longitude.trim());

    if (
      !form.name.trim() ||
      !form.category_id ||
      !form.latitude.trim() ||
      !form.longitude.trim() ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      showAppAlert(
        "Invalid POI details",
        "Name, category, and valid latitude/longitude coordinates are required.",
        undefined,
        "warning"
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        operating_hours: form.operating_hours.trim(),
        category_id: form.category_id,
        building_id: form.building_id ?? null,
        latitude,
        longitude,
        icon_identifier: form.icon_identifier || selectedCategory?.icon_identifier || "map-pin",
        google_place_id: form.google_place_id.trim(),
        is_active: form.is_active
      };

      const isUpdate = Boolean(form.id);
      if (form.id) {
        await updatePoi(form.id, payload);
      } else {
        await createPoi(payload);
      }
      resetForm();
      await Promise.all([loadAdminPois(), refreshCampus(true).catch(() => {})]);
      showAppAlert(
        isUpdate ? "POI updated" : "POI created",
        `${payload.name} has been saved to the campus directory.`,
        undefined,
        "success"
      );
    } catch {
      showAppAlert("Save failed", "The POI could not be saved.", undefined, "danger");
    } finally {
      setSaving(false);
    }
  }

  async function removePoi(poi: Poi) {
    showAppAlert(
      "Delete POI",
      `Delete ${poi.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePoi(poi.id);
              if (form.id === poi.id) {
                resetForm();
              }
              await Promise.all([loadAdminPois(), refreshCampus(true).catch(() => {})]);
            } catch {
              showAppAlert("Delete failed", "The POI could not be deleted.", undefined, "danger");
            }
          }
        }
      ],
      "danger"
    );
  }

  async function handleImportRoster() {
    if (!csvText.trim()) {
      showAppAlert(
        "Missing CSV data",
        "Paste CSV lines with columns: matric_number,full_name,email,password",
        undefined,
        "warning"
      );
      return;
    }
    setImportingCsv(true);
    try {
      const summary = await importStudentsCsv(csvText);
      const errPreview = summary.errors?.length ? `\n\nNotes:\n${summary.errors.slice(0, 5).join("\n")}` : "";
      showAppAlert(
        "Roster import complete",
        `Created: ${summary.created}\nUpdated: ${summary.updated}\nSkipped: ${summary.skipped}${errPreview}`,
        undefined,
        "success"
      );
      if (summary.created > 0 || summary.updated > 0) {
        setCsvText("");
      }
    } catch (error: any) {
      showAppAlert(
        "Import failed",
        error?.response?.data?.detail || "Check the CSV format and backend connection.",
        undefined,
        "danger"
      );
    } finally {
      setImportingCsv(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Admin</Text>
            <Text style={styles.subtitle}>
              {displayedPois.length} POIs{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
            </Text>
          </View>
          <Pressable onPress={signOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <FlatList
          data={loading && displayedPois.length === 0 ? [] : displayedPois}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.poiList}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <View style={styles.formCard}>
                <Pressable
                  onPress={() => setShowRosterImport((prev) => !prev)}
                  style={styles.rosterHeader}
                >
                  <View style={styles.rosterHeaderLeft}>
                    <Users size={18} color={colors.primary} />
                    <Text style={styles.formTitle}>Bulk Import Students (CSV)</Text>
                  </View>
                  {showRosterImport ? (
                    <ChevronUp size={18} color={colors.muted} />
                  ) : (
                    <ChevronDown size={18} color={colors.muted} />
                  )}
                </Pressable>

                {showRosterImport && (
                  <View style={styles.rosterBody}>
                    <Text style={styles.rosterHint}>
                      Columns: matric_number,full_name,email,password (password defaults to matric number if blank)
                    </Text>
                    <TextInput
                      value={csvText}
                      onChangeText={setCsvText}
                      placeholder={
                        "matric_number,full_name,email,password\nBU23CSC1001,Ada Lovelace,ada@bowen.edu.ng,pass123"
                      }
                      placeholderTextColor={colors.muted}
                      style={[styles.input, styles.csvInput]}
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Pressable
                      onPress={handleImportRoster}
                      disabled={importingCsv}
                      style={styles.saveButton}
                    >
                      {importingCsv ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Users size={16} color="#FFFFFF" />
                      )}
                      <Text style={styles.saveText}>Import Student Roster</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={styles.formCard}>
                <View style={styles.formHeader}>
                  <Plus size={18} color={colors.primary} />
                  <Text style={styles.formTitle}>{form.id ? "Edit point of interest" : "New point of interest"}</Text>
                </View>

                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={form.name}
                  onChangeText={(name) => setForm((current) => ({ ...current, name }))}
                  style={styles.input}
                />

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
                  placeholderTextColor={colors.muted}
                />

                <Text style={styles.label}>Google Place ID (optional)</Text>
                <TextInput
                  value={form.google_place_id}
                  onChangeText={(google_place_id) => setForm((current) => ({ ...current, google_place_id }))}
                  style={styles.input}
                  placeholder="e.g. ChIJ..."
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
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
                        style={[
                          styles.categoryChip,
                          active && styles.categoryChipActive,
                          { borderColor: category.color }
                        ]}
                      >
                        <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{category.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.coordHeader}>
                  <Text style={styles.label}>Coordinates</Text>
                  <Pressable onPress={fillCurrentGps} disabled={locatingGps} style={styles.gpsFillBtn}>
                    {locatingGps ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <LocateFixed size={14} color={colors.primary} />
                        <Text style={styles.gpsFillText}>Use My GPS</Text>
                      </>
                    )}
                  </Pressable>
                </View>

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

                <View style={styles.activeRow}>
                  <Text style={styles.label}>Visible on campus map</Text>
                  <Switch
                    value={form.is_active}
                    onValueChange={(is_active) => setForm((current) => ({ ...current, is_active }))}
                    trackColor={{ false: colors.line, true: colors.primary }}
                  />
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

                {loading && displayedPois.length === 0 && (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => editPoi(item)} style={styles.poiRow}>
              <MarkerBadge color={item.category.color} icon={item.icon_identifier || item.category.icon_identifier} />
              <View style={styles.poiText}>
                <View style={styles.poiNameRow}>
                  <Text style={styles.poiName}>{item.name}</Text>
                  {item.is_active === false && (
                    <View style={styles.hiddenBadge}>
                      <Text style={styles.hiddenBadgeText}>Hidden</Text>
                    </View>
                  )}
                </View>
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
      backgroundColor: colors.surface,
      justifyContent: "center"
    },
    signOutText: {
      color: colors.primary,
      fontWeight: "900"
    },
    formCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      padding: 14,
      marginBottom: 4
    },
    rosterHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    rosterHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    rosterBody: {
      marginTop: 12
    },
    rosterHint: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 8
    },
    csvInput: {
      minHeight: 110,
      textAlignVertical: "top",
      fontSize: 13
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
      backgroundColor: colors.inputBg,
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
    coordHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6
    },
    gpsFillBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.primarySoft
    },
    gpsFillText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "800"
    },
    coordinateRow: {
      flexDirection: "row",
      gap: 10
    },
    coordinateInput: {
      flex: 1
    },
    activeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
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
      paddingVertical: 20,
      alignItems: "center",
      justifyContent: "center"
    },
    poiList: {
      paddingHorizontal: 18,
      paddingBottom: 24,
      gap: 10
    },
    poiRow: {
      borderRadius: 10,
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
    poiNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    },
    poiName: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: "900"
    },
    hiddenBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: colors.warning
    },
    hiddenBadgeText: {
      color: colors.warning,
      fontSize: 10.5,
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
      borderColor: colors.dangerSoft,
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
