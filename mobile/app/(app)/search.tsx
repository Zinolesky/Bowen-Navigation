import { router } from "expo-router";
import { Search, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { featureToPoi, getCategories, getPois } from "@/api";
import { MarkerBadge } from "@/components/MarkerBadge";
import { colors } from "@/theme";
import type { Category, Poi, PoiProperties } from "@/types";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [pois, setPois] = useState<Poi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [categoryData, poiData] = await Promise.all([getCategories(), getPois()]);
        setCategories(categoryData);
        setPois(
          poiData.features.map((feature) =>
            featureToPoi(feature as { geometry: { coordinates: number[] }; properties: PoiProperties })
          )
        );
      } catch (error) {
        Alert.alert("Search unavailable", "Check the API connection and try again.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return pois.filter((poi) => {
      const matchesQuery =
        !normalized ||
        poi.name.toLowerCase().includes(normalized) ||
        poi.category.name.toLowerCase().includes(normalized) ||
        poi.description.toLowerCase().includes(normalized);
      const matchesCategory = !selectedCategory || poi.category.slug === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [pois, query, selectedCategory]);

  function openPoi(poi: Poi) {
    router.push({ pathname: "/(app)/map", params: { poi: String(poi.id) } });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Search campus</Text>
        <Text style={styles.count}>{results.length} places</Text>
      </View>

      <View style={styles.searchBox}>
        <Search size={20} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Library, hostel, health centre..."
          placeholderTextColor="#87938E"
          style={styles.input}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} style={styles.clearButton}>
            <X size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        data={[{ id: 0, name: "All", slug: "", color: colors.primary } as Category, ...categories]}
        style={styles.categoryList}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => {
          const active = selectedCategory === item.slug || (!selectedCategory && !item.slug);
          return (
            <Pressable
              onPress={() => setSelectedCategory(item.slug || undefined)}
              style={[styles.chip, active && styles.chipActive, item.slug ? { borderColor: item.color } : undefined]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.name}</Text>
            </Pressable>
          );
        }}
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => openPoi(item)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <MarkerBadge color={item.category.color} icon={item.icon_identifier || item.category.icon_identifier} />
              <View style={styles.rowText}>
                <Text style={styles.poiName}>{item.name}</Text>
                <Text style={styles.poiMeta}>
                  {item.category.name}
                  {item.operating_hours ? ` - ${item.operating_hours}` : ""}
                </Text>
                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No matching places</Text>
              <Text style={styles.emptyText}>Try another name or category.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between"
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0
  },
  count: {
    color: colors.muted,
    fontWeight: "800",
    paddingBottom: 4
  },
  searchBox: {
    marginHorizontal: 18,
    height: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.ink
  },
  clearButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  chips: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 8
  },
  categoryList: {
    maxHeight: 64
  },
  chip: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.muted,
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
    minHeight: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  rowPressed: {
    opacity: 0.82
  },
  rowText: {
    flex: 1
  },
  poiName: {
    fontSize: 17,
    color: colors.ink,
    fontWeight: "900"
  },
  poiMeta: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: 3,
    marginBottom: 6
  },
  description: {
    color: colors.ink,
    lineHeight: 19
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
