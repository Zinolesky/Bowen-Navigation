import { Check, Navigation, Search, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MarkerBadge } from "@/components/MarkerBadge";
import { colors } from "@/theme";
import type { Poi } from "@/types";

export function OriginPickerModal({
  visible,
  originChoices,
  selectedOriginId,
  onSelectOrigin,
  onClose
}: {
  visible: boolean;
  originChoices: Poi[];
  selectedOriginId: number | "gps";
  onSelectOrigin: (id: number | "gps") => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return originChoices;
    return originChoices.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [originChoices, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose starting point</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <X size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Search size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter campus locations..."
            placeholderTextColor="#8A9691"
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <X size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Pressable
              onPress={() => {
                onSelectOrigin("gps");
                onClose();
              }}
              style={[styles.row, selectedOriginId === "gps" && styles.rowActive]}
            >
              <View style={styles.gpsBadge}>
                <Navigation size={18} color="#FFFFFF" />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>My GPS / Main Gate</Text>
                <Text style={styles.rowSub}>Uses live campus GPS or Main Gate when off-campus</Text>
              </View>
              {selectedOriginId === "gps" && <Check size={18} color={colors.primary} />}
            </Pressable>
          }
          renderItem={({ item }) => {
            const active = selectedOriginId === item.id;
            return (
              <Pressable
                onPress={() => {
                  onSelectOrigin(item.id);
                  onClose();
                }}
                style={[styles.row, active && styles.rowActive]}
              >
                <MarkerBadge
                  color={item.category.color}
                  icon={item.icon_identifier !== "map-pin" ? item.icon_identifier : item.category.icon_identifier}
                />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.category.name}
                    {item.operating_hours ? ` • ${item.operating_hours}` : ""}
                  </Text>
                </View>
                {active && <Check size={18} color={colors.primary} />}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.ink
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F3",
    alignItems: "center",
    justifyContent: "center"
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 14,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.ink
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 24,
    gap: 8
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: "#F0FDF9"
  },
  gpsBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  rowBody: {
    flex: 1
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink
  },
  rowSub: {
    fontSize: 12.5,
    color: colors.muted,
    marginTop: 2
  }
});
