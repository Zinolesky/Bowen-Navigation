import { ChevronDown, CornerUpRight, Navigation, X } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Animated,
  GestureResponderHandlers,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { buildPlacePhotoUrl } from "@/api";
import { MarkerBadge } from "@/components/MarkerBadge";
import { colors, shadows } from "@/theme";
import type { PlacePhoto, Poi } from "@/types";

export function PlaceDetailsSheet({
  selectedPoi,
  placeDetails,
  fetchingDetails,
  routing,
  originLabel,
  originChoices,
  originPoiId,
  accessToken,
  panY,
  panHandlers,
  onLayoutHeight,
  onSelectOrigin,
  onOpenAllOrigins,
  onOpenDirections,
  onStartLiveNavigation,
  onClose
}: {
  selectedPoi: Poi;
  placeDetails: any | null;
  fetchingDetails: boolean;
  routing: boolean;
  originLabel: string;
  originChoices: Poi[];
  originPoiId: number | "gps";
  accessToken?: string;
  panY: Animated.Value;
  panHandlers: GestureResponderHandlers;
  onLayoutHeight: (height: number) => void;
  onSelectOrigin: (id: number | "gps") => void;
  onOpenAllOrigins: () => void;
  onOpenDirections: () => void;
  onStartLiveNavigation: () => void;
  onClose: () => void;
}) {
  const photos: PlacePhoto[] = Array.isArray(placeDetails?.photos) ? placeDetails.photos : [];

  return (
    <Animated.View
      style={[styles.sheet, shadows.card, { transform: [{ translateY: panY }] }]}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
    >
      <View {...panHandlers}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <MarkerBadge
            color={selectedPoi.category.color}
            icon={
              selectedPoi.icon_identifier !== "map-pin"
                ? selectedPoi.icon_identifier
                : selectedPoi.category.icon_identifier
            }
          />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.poiName}>
              {selectedPoi.name}
            </Text>
            <Text numberOfLines={1} style={styles.poiMeta}>
              {selectedPoi.category.name}
              {fetchingDetails ? (
                <Text> • Loading...</Text>
              ) : placeDetails?.rating ? (
                <Text>
                  {" "}
                  • ⭐ {placeDetails.rating} ({placeDetails.user_ratings_total || 0})
                </Text>
              ) : null}
              {selectedPoi.operating_hours ? ` • ${selectedPoi.operating_hours}` : ""}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <X size={18} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      {placeDetails?.formatted_address ? (
        <Text numberOfLines={1} style={styles.addressLine}>
          {placeDetails.formatted_address}
        </Text>
      ) : null}

      <Text numberOfLines={2} style={styles.descriptionCompact}>
        {selectedPoi.description || "Bowen University Campus Location."}
      </Text>

      <View style={styles.originInlineRow}>
        <Text style={styles.originInlineLabel}>From:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.originChipRow}>
          <Pressable
            onPress={() => onSelectOrigin("gps")}
            style={[styles.originChip, originPoiId === "gps" && styles.originChipActive]}
          >
            <Text style={[styles.originChipText, originPoiId === "gps" && styles.originChipTextActive]}>
              My GPS / Main Gate
            </Text>
          </Pressable>
          {originChoices.slice(0, 4).map((item) => {
            const active = originPoiId === item.id;
            return (
              <Pressable
                key={`origin-${item.id}`}
                onPress={() => onSelectOrigin(item.id)}
                style={[styles.originChip, active && styles.originChipActive]}
              >
                <Text style={[styles.originChipText, active && styles.originChipTextActive]}>
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={onOpenAllOrigins} style={styles.originMoreChip}>
            <Text style={styles.originMoreText}>
              {originPoiId !== "gps" && !originChoices.slice(0, 4).some((o) => o.id === originPoiId)
                ? originLabel
                : "All places"}
            </Text>
            <ChevronDown size={13} color={colors.primary} />
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.gmPreviewPillRow}>
        <Pressable disabled={routing} onPress={onOpenDirections} style={styles.gmDirectionsMainPill}>
          {routing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <CornerUpRight size={17} color="#FFFFFF" />}
          <Text style={styles.gmDirectionsPillText}>Directions</Text>
        </Pressable>

        <Pressable disabled={routing} onPress={onStartLiveNavigation} style={styles.gmStartQuickPill}>
          <Navigation size={16} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={styles.gmStartQuickPillText}>Start</Text>
        </Pressable>
      </View>

      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoCarousel}>
          {photos.map((photo, index) => {
            if (!photo.photo_reference) return null;
            return (
              <Image
                key={`${photo.photo_reference}-${index}`}
                source={{
                  uri: buildPlacePhotoUrl(photo.photo_reference, 800),
                  headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
                }}
                style={styles.photo}
              />
            );
          })}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    maxHeight: "56%",
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: colors.line
  },
  sheetHandle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 8
  },
  sheetHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F3",
    alignItems: "center",
    justifyContent: "center"
  },
  poiName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  poiMeta: {
    color: colors.muted,
    marginTop: 2,
    fontWeight: "700",
    fontSize: 12
  },
  addressLine: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: "700",
    marginTop: 6
  },
  descriptionCompact: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  originInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10
  },
  originInlineLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  originChipRow: {
    gap: 6,
    paddingRight: 8
  },
  originChip: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#F6FAF8",
    justifyContent: "center"
  },
  originChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  originChipText: {
    color: colors.ink,
    fontSize: 11.5,
    fontWeight: "700"
  },
  originChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "800"
  },
  originMoreChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#F0FDF9"
  },
  originMoreText: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: "800"
  },
  gmPreviewPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14
  },
  gmDirectionsMainPill: {
    flex: 1.4,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D9488",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16
  },
  gmDirectionsPillText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },
  gmStartQuickPill: {
    flex: 1.1,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#064E3B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16
  },
  gmStartQuickPillText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  },
  photoCarousel: {
    flexDirection: "row",
    marginTop: 12,
    marginHorizontal: -14,
    paddingHorizontal: 14
  },
  photo: {
    width: 180,
    height: 110,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: colors.line
  }
});
