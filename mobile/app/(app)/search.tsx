import { router } from "expo-router";
import { Building2, ChevronRight, Clock, RefreshCw, Search, WifiOff, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useCampusData } from "@/campusStore";
import { showAppAlert } from "@/components/AppAlertProvider";
import { MarkerBadge } from "@/components/MarkerBadge";
import { AppColors, shadows, useAppTheme } from "@/theme";
import type { Category, Poi } from "@/types";

export default function SearchScreen() {
  const { categories, pois, loading, isOffline, refreshCampus } = useCampusData();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return pois.filter((poi) => {
      const matchesQuery =
        !normalized ||
        poi.name.toLowerCase().includes(normalized) ||
        poi.category.name.toLowerCase().includes(normalized) ||
        poi.description.toLowerCase().includes(normalized) ||
        (poi.building?.name && poi.building.name.toLowerCase().includes(normalized));
      const matchesCategory = !selectedCategory || poi.category.slug === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [pois, query, selectedCategory]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshCampus(true);
    } catch {
      showAppAlert(
        "Offline mode",
        "Showing saved campus locations while the server is unreachable.",
        undefined,
        "warning"
      );
    } finally {
      setRefreshing(false);
    }
  }

  function openPoi(poi: Poi) {
    router.push({ pathname: "/(app)/map", params: { poi: String(poi.id), t: String(Date.now()) } });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Bowen University Campus Directory</Text>
          <Text style={styles.title}>Explore Campus</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.countBadge}>
            <Text style={styles.count}>{results.length} places</Text>
          </View>
          <Pressable onPress={handleRefresh} style={styles.refreshBtn} hitSlop={8}>
            <RefreshCw size={17} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {isOffline && (
        <View style={styles.offlinePill}>
          <WifiOff size={13} color={colors.warning} />
          <Text style={styles.offlineText}>Offline mode • Searching saved campus map</Text>
        </View>
      )}

      <View style={[styles.searchBox, shadows.card]}>
        <Search size={19} color={colors.primary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search buildings, colleges, hostels, clinics…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} style={styles.clearButton}>
            <X size={17} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={[{ id: 0, name: `All (${pois.length})`, slug: "", color: colors.primary } as Category, ...categories]}
        style={styles.categoryList}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => {
          const active = selectedCategory === item.slug || (!selectedCategory && !item.slug);
          return (
            <Pressable
              onPress={() => setSelectedCategory(item.slug || undefined)}
              style={[
                styles.chip,
                active && { backgroundColor: item.color || colors.primary, borderColor: item.color || colors.primary }
              ]}
            >
              {item.slug ? (
                <View
                  style={[
                    styles.chipDot,
                    { backgroundColor: active ? "#FFFFFF" : item.color }
                  ]}
                />
              ) : null}
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
            </Pressable>
          );
        }}
      />

      {loading && pois.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={results}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openPoi(item)}
              style={({ pressed }) => [styles.row, shadows.card, pressed && styles.rowPressed]}
            >
              <MarkerBadge
                color={item.category.color}
                icon={
                  item.icon_identifier && item.icon_identifier !== "map-pin"
                    ? item.icon_identifier
                    : item.category.icon_identifier
                }
              />
              <View style={styles.rowText}>
                <View style={styles.rowHeaderLine}>
                  <Text numberOfLines={1} style={styles.poiName}>
                    {item.name}
                  </Text>
                </View>

                <View style={styles.metaChipRow}>
                  <View
                    style={[
                      styles.categoryPill,
                      {
                        backgroundColor: `${item.category.color}1C`,
                        borderColor: `${item.category.color}50`
                      }
                    ]}
                  >
                    <Text style={[styles.categoryPillText, { color: item.category.color }]}>
                      {item.category.name}
                    </Text>
                  </View>

                  {item.operating_hours ? (
                    <View style={styles.hoursPill}>
                      <Clock size={11} color={colors.muted} />
                      <Text numberOfLines={1} style={styles.hoursPillText}>
                        {item.operating_hours}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {item.building?.name && item.building.name !== item.name ? (
                  <View style={styles.buildingLine}>
                    <Building2 size={11.5} color={colors.primary} />
                    <Text numberOfLines={1} style={styles.buildingLineText}>
                      {item.building.name}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              </View>

              <View style={styles.chevronBox}>
                <ChevronRight size={18} color={colors.primary} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No matching campus places</Text>
              <Text style={styles.emptyText}>Try searching by building name, college, or category.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.canvas
    },
    header: {
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between"
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.6
    },
    title: {
      color: colors.ink,
      fontSize: 27,
      fontWeight: "900",
      letterSpacing: -0.4,
      marginTop: 2
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    countBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.line
    },
    count: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "900"
    },
    refreshBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center"
    },
    offlinePill: {
      marginHorizontal: 18,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: colors.warning,
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    offlineText: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "800"
    },
    searchBox: {
      marginHorizontal: 18,
      height: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      gap: 10
    },
    input: {
      flex: 1,
      fontSize: 15.5,
      color: colors.ink,
      fontWeight: "600"
    },
    clearButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceSubtle,
      alignItems: "center",
      justifyContent: "center"
    },
    chips: {
      paddingHorizontal: 18,
      paddingVertical: 13,
      gap: 8
    },
    categoryList: {
      maxHeight: 62
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      justifyContent: "center",
      paddingHorizontal: 13
    },
    chipDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5
    },
    chipText: {
      color: colors.ink,
      fontSize: 12.5,
      fontWeight: "800"
    },
    chipTextActive: {
      color: "#FFFFFF"
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    list: {
      paddingHorizontal: 18,
      paddingBottom: 24
    },
    separator: {
      height: 10
    },
    row: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14
    },
    rowPressed: {
      opacity: 0.85
    },
    rowText: {
      flex: 1
    },
    rowHeaderLine: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    poiName: {
      fontSize: 16.5,
      color: colors.ink,
      fontWeight: "900",
      letterSpacing: -0.2
    },
    metaChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      marginTop: 5,
      marginBottom: 6
    },
    categoryPill: {
      paddingHorizontal: 8,
      paddingVertical: 2.5,
      borderRadius: 7,
      borderWidth: 1
    },
    categoryPillText: {
      fontSize: 10.5,
      fontWeight: "800"
    },
    hoursPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2.5,
      borderRadius: 7,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line
    },
    hoursPillText: {
      color: colors.muted,
      fontSize: 10.5,
      fontWeight: "700"
    },
    buildingLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: 4
    },
    buildingLineText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800"
    },
    description: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18.5,
      fontWeight: "600"
    },
    chevronBox: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.primarySoft,
      alignItems: "center",
      justifyContent: "center"
    },
    empty: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80
    },
    emptyTitle: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "900"
    },
    emptyText: {
      color: colors.muted,
      marginTop: 6
    }
  });
