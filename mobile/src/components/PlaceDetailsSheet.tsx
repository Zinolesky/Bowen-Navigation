import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  CornerUpRight,
  ExternalLink,
  Globe,
  Images,
  MapPin,
  MessageSquareQuote,
  Navigation,
  Phone,
  Sparkles,
  Star,
  X
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  GestureResponderHandlers,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { buildPlacePhotoUrl } from "@/api";
import { MarkerBadge } from "@/components/MarkerBadge";
import { AppColors, shadows, useAppTheme } from "@/theme";
import type { PlacePhoto, Poi } from "@/types";

type GoogleReview = {
  author_name?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
};

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
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [showAllHours, setShowAllHours] = useState(false);

  const photos: PlacePhoto[] = useMemo(
    () =>
      Array.isArray(placeDetails?.photos)
        ? placeDetails.photos.filter((p: PlacePhoto) => Boolean(p?.photo_reference))
        : [],
    [placeDetails?.photos]
  );

  const reviews: GoogleReview[] = useMemo(
    () =>
      Array.isArray(placeDetails?.reviews)
        ? placeDetails.reviews.filter((r: GoogleReview) => Boolean(r?.text || r?.rating)).slice(0, 4)
        : [],
    [placeDetails?.reviews]
  );

  const weekdayText: string[] = useMemo(
    () =>
      Array.isArray(placeDetails?.opening_hours?.weekday_text)
        ? placeDetails.opening_hours.weekday_text
        : [],
    [placeDetails?.opening_hours?.weekday_text]
  );

  const openNow: boolean | undefined = placeDetails?.opening_hours?.open_now;
  const rating: number | undefined =
    typeof placeDetails?.rating === "number" ? placeDetails.rating : undefined;
  const ratingsTotal: number = placeDetails?.user_ratings_total || 0;
  const editorialOverview: string | undefined = placeDetails?.editorial_summary?.overview;

  const coordLabel = `${selectedPoi.latitude.toFixed(4)}° N, ${selectedPoi.longitude.toFixed(4)}° E`;

  function handleOpenPhone(phone: string) {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  }

  function handleOpenWebsite(url: string) {
    const target = url.startsWith("http") ? url : `https://${url}`;
    Linking.openURL(target).catch(() => {});
  }

  return (
    <Animated.View
      style={[styles.sheet, shadows.card, { transform: [{ translateY: panY }] }]}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
    >
      {/* DRAG HANDLE & HEADER (PanHandlers isolated here so scrolling never collapses the sheet) */}
      <View {...panHandlers} style={styles.dragHeaderZone}>
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
          <View style={styles.headerTextCol}>
            <Text numberOfLines={2} style={styles.poiName}>
              {selectedPoi.name}
            </Text>
            <View style={styles.badgeStrip}>
              <View
                style={[
                  styles.categoryBadge,
                  {
                    backgroundColor: `${selectedPoi.category.color}1C`,
                    borderColor: `${selectedPoi.category.color}55`
                  }
                ]}
              >
                <View style={[styles.categoryDot, { backgroundColor: selectedPoi.category.color }]} />
                <Text style={[styles.categoryBadgeText, { color: selectedPoi.category.color }]}>
                  {selectedPoi.category.name}
                </Text>
              </View>

              {fetchingDetails ? (
                <View style={styles.statusChipNeutral}>
                  <ActivityIndicator size={11} color={colors.primary} />
                  <Text style={styles.statusChipNeutralText}>Syncing Google Places…</Text>
                </View>
              ) : rating !== undefined ? (
                <View style={styles.ratingChip}>
                  <Star size={12} color="#F59E0B" fill="#F59E0B" />
                  <Text style={styles.ratingChipScore}>{rating.toFixed(1)}</Text>
                  <Text style={styles.ratingChipCount}>({ratingsTotal})</Text>
                </View>
              ) : null}

              {openNow !== undefined && (
                <View
                  style={[
                    styles.openStatusChip,
                    openNow ? styles.openStatusChipOpen : styles.openStatusChipClosed
                  ]}
                >
                  <View
                    style={[
                      styles.openStatusDot,
                      { backgroundColor: openNow ? colors.successText : colors.danger }
                    ]}
                  />
                  <Text
                    style={[
                      styles.openStatusText,
                      { color: openNow ? colors.successText : colors.danger }
                    ]}
                  >
                    {openNow ? "Open now" : "Closed"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={10}>
            <X size={18} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      {/* PRIMARY ACTION ROW & ORIGIN SELECTOR */}
      <View style={styles.actionSection}>
        <View style={styles.gmPreviewPillRow}>
          <Pressable
            disabled={routing}
            onPress={onOpenDirections}
            style={({ pressed }) => [styles.gmDirectionsMainPill, pressed && styles.pillPressed]}
          >
            {routing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <CornerUpRight size={17} color="#FFFFFF" />
            )}
            <Text style={styles.gmDirectionsPillText}>Directions</Text>
          </Pressable>

          <Pressable
            disabled={routing}
            onPress={onStartLiveNavigation}
            style={({ pressed }) => [styles.gmStartQuickPill, pressed && styles.pillPressed]}
          >
            <Navigation size={16} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.gmStartQuickPillText}>Start Nav</Text>
          </Pressable>
        </View>

        <View style={styles.originInlineRow}>
          <Text style={styles.originInlineLabel}>From:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.originChipRow}
          >
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
      </View>

      {/* SCROLLABLE RICH DETAILS: PHOTOS, OVERVIEW, METADATA & GOOGLE REVIEWS */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetScrollBody}
        nestedScrollEnabled
      >
        {/* 1. HERO PHOTO GALLERY OR CAMPUS LANDMARK BANNER */}
        {photos.length > 0 ? (
          <View style={styles.galleryContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <Images size={14} color={colors.primary} />
                <Text style={styles.sectionTitle}>Campus Photos</Text>
              </View>
              <Text style={styles.photoCountBadge}>{photos.length} photos</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoCarouselContent}
              nestedScrollEnabled
            >
              {photos.map((photo, index) => (
                <View key={`${photo.photo_reference}-${index}`} style={styles.photoCard}>
                  <Image
                    source={{
                      uri: buildPlacePhotoUrl(photo.photo_reference!, 800),
                      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
                    }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                  <View style={styles.photoIndexPill}>
                    <Text style={styles.photoIndexText}>
                      {index + 1} / {photos.length}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : fetchingDetails ? (
          <View style={styles.photoLoadingBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.photoLoadingText}>Loading verified campus photos & details…</Text>
          </View>
        ) : (
          <View
            style={[
              styles.landmarkBanner,
              {
                borderColor: `${selectedPoi.category.color}40`,
                backgroundColor: isDark ? "rgba(13, 148, 136, 0.10)" : colors.primarySoft
              }
            ]}
          >
            <View style={styles.landmarkBannerTop}>
              <Sparkles size={15} color={colors.primary} />
              <Text style={styles.landmarkBannerLabel}>Verified Bowen University Landmark</Text>
            </View>
            <Text style={styles.landmarkBannerCoords}>{coordLabel} • Iwo Campus, Osun State</Text>
          </View>
        )}

        {/* 2. OVERVIEW & DESCRIPTION CARD */}
        <View style={styles.infoCard}>
          <Text style={styles.cardSectionHeading}>About this location</Text>
          <Text style={styles.descriptionText}>
            {selectedPoi.description || "Verified Bowen University campus destination."}
          </Text>
          {editorialOverview && editorialOverview !== selectedPoi.description ? (
            <Text style={styles.editorialText}>{editorialOverview}</Text>
          ) : null}

          <View style={styles.divider} />

          {/* STRUCTURED METADATA ROWS */}
          {selectedPoi.operating_hours ? (
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <Clock size={14} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Text style={styles.metaLabel}>Campus Hours</Text>
                <Text style={styles.metaValue}>{selectedPoi.operating_hours}</Text>
              </View>
            </View>
          ) : null}

          {weekdayText.length > 0 && (
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <CalendarClock size={14} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Pressable
                  onPress={() => setShowAllHours((prev) => !prev)}
                  style={styles.hoursToggleHeader}
                >
                  <Text style={styles.metaLabel}>Google Places Weekly Schedule</Text>
                  {showAllHours ? (
                    <ChevronUp size={14} color={colors.primary} />
                  ) : (
                    <ChevronDown size={14} color={colors.primary} />
                  )}
                </Pressable>
                {showAllHours ? (
                  <View style={styles.weekdayList}>
                    {weekdayText.map((line, idx) => (
                      <Text key={`wk-${idx}`} style={styles.weekdayLine}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.metaValue}>{weekdayText[0]}</Text>
                )}
              </View>
            </View>
          )}

          {selectedPoi.building?.name && selectedPoi.building.name !== selectedPoi.name ? (
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <Building2 size={14} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Text style={styles.metaLabel}>Building / Complex</Text>
                <Text style={styles.metaValue}>{selectedPoi.building.name}</Text>
              </View>
            </View>
          ) : null}

          {placeDetails?.formatted_address ? (
            <View style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <MapPin size={14} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Text style={styles.metaLabel}>Address</Text>
                <Text style={styles.metaValue}>{placeDetails.formatted_address}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaIconWrap}>
              <Compass size={14} color={colors.primary} />
            </View>
            <View style={styles.metaTextCol}>
              <Text style={styles.metaLabel}>GPS Coordinates</Text>
              <Text style={styles.metaValue}>{coordLabel}</Text>
            </View>
          </View>

          {placeDetails?.formatted_phone_number ? (
            <Pressable
              onPress={() => handleOpenPhone(placeDetails.formatted_phone_number)}
              style={styles.metaRow}
            >
              <View style={styles.metaIconWrap}>
                <Phone size={14} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Text style={styles.metaLabel}>Contact Phone</Text>
                <Text style={[styles.metaValue, styles.linkValue]}>
                  {placeDetails.formatted_phone_number}
                </Text>
              </View>
              <ExternalLink size={13} color={colors.primary} />
            </Pressable>
          ) : null}

          {placeDetails?.website ? (
            <Pressable onPress={() => handleOpenWebsite(placeDetails.website)} style={styles.metaRow}>
              <View style={styles.metaIconWrap}>
                <Globe size={14} color={colors.primary} />
              </View>
              <View style={styles.metaTextCol}>
                <Text style={styles.metaLabel}>Official Website</Text>
                <Text numberOfLines={1} style={[styles.metaValue, styles.linkValue]}>
                  {placeDetails.website}
                </Text>
              </View>
              <ExternalLink size={13} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>

        {/* 3. STUDENT & VISITOR GOOGLE REVIEWS */}
        {reviews.length > 0 && (
          <View style={styles.reviewsSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <MessageSquareQuote size={14} color={colors.primary} />
                <Text style={styles.sectionTitle}>Campus Reviews</Text>
              </View>
              {rating !== undefined && (
                <Text style={styles.reviewSummaryBadge}>
                  ★ {rating.toFixed(1)} ({ratingsTotal})
                </Text>
              )}
            </View>

            {reviews.map((rev, idx) => (
              <View key={`rev-${idx}`} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewAuthor}>{rev.author_name || "Campus Visitor"}</Text>
                  <View style={styles.reviewRatingPill}>
                    <Star size={11} color="#F59E0B" fill="#F59E0B" />
                    <Text style={styles.reviewRatingText}>{rev.rating ?? 5}</Text>
                  </View>
                </View>
                {rev.relative_time_description ? (
                  <Text style={styles.reviewTime}>{rev.relative_time_description}</Text>
                ) : null}
                {rev.text ? (
                  <Text numberOfLines={4} style={styles.reviewBody}>
                    {rev.text}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const createStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    sheet: {
      position: "absolute",
      left: 10,
      right: 10,
      bottom: 10,
      maxHeight: "74%",
      borderRadius: 22,
      backgroundColor: colors.surface,
      paddingHorizontal: 15,
      paddingTop: 8,
      paddingBottom: 14,
      borderWidth: 1,
      borderColor: colors.line
    },
    dragHeaderZone: {
      paddingTop: 2,
      paddingBottom: 6
    },
    sheetHandle: {
      alignSelf: "center",
      width: 38,
      height: 4.5,
      borderRadius: 2.5,
      backgroundColor: colors.line,
      marginBottom: 10
    },
    sheetHeader: {
      flexDirection: "row",
      gap: 11,
      alignItems: "flex-start"
    },
    headerTextCol: {
      flex: 1
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center"
    },
    poiName: {
      color: colors.ink,
      fontSize: 18.5,
      fontWeight: "900",
      letterSpacing: -0.3
    },
    badgeStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      marginTop: 6
    },
    categoryBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1
    },
    categoryDot: {
      width: 6,
      height: 6,
      borderRadius: 3
    },
    categoryBadgeText: {
      fontSize: 11,
      fontWeight: "800"
    },
    statusChipNeutral: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line
    },
    statusChipNeutralText: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "700"
    },
    ratingChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3.5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: isDark ? "rgba(245, 158, 11, 0.16)" : "#FEF3C7",
      borderWidth: 1,
      borderColor: isDark ? "rgba(245, 158, 11, 0.35)" : "#FDE68A"
    },
    ratingChipScore: {
      color: isDark ? "#FBBF24" : "#B45309",
      fontSize: 11.5,
      fontWeight: "900"
    },
    ratingChipCount: {
      color: isDark ? "#FCD34D" : "#92400E",
      fontSize: 11,
      fontWeight: "700"
    },
    openStatusChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1
    },
    openStatusChipOpen: {
      backgroundColor: isDark ? "rgba(16, 185, 129, 0.14)" : "#ECFDF5",
      borderColor: isDark ? "rgba(16, 185, 129, 0.32)" : "#A7F3D0"
    },
    openStatusChipClosed: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger
    },
    openStatusDot: {
      width: 6,
      height: 6,
      borderRadius: 3
    },
    openStatusText: {
      fontSize: 11,
      fontWeight: "800"
    },
    actionSection: {
      paddingTop: 6,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line
    },
    gmPreviewPillRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    pillPressed: {
      opacity: 0.88
    },
    gmDirectionsMainPill: {
      flex: 1.35,
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
      fontSize: 14.5,
      fontWeight: "900"
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
      fontSize: 14.5,
      fontWeight: "900"
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
      backgroundColor: colors.surfaceSubtle,
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
      backgroundColor: colors.primarySoft
    },
    originMoreText: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800"
    },
    sheetScrollBody: {
      paddingTop: 12,
      paddingBottom: 10,
      gap: 12
    },
    galleryContainer: {
      gap: 8
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    sectionHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    sectionTitle: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.4
    },
    photoCountBadge: {
      color: colors.primary,
      fontSize: 11.5,
      fontWeight: "800"
    },
    photoCarouselContent: {
      gap: 10,
      paddingRight: 6
    },
    photoCard: {
      width: 228,
      height: 142,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line
    },
    photo: {
      width: "100%",
      height: "100%"
    },
    photoIndexPill: {
      position: "absolute",
      right: 8,
      bottom: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: "rgba(15, 23, 42, 0.72)"
    },
    photoIndexText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "800"
    },
    photoLoadingBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      height: 68,
      borderRadius: 14,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line
    },
    photoLoadingText: {
      color: colors.muted,
      fontSize: 12.5,
      fontWeight: "700"
    },
    landmarkBanner: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      gap: 3
    },
    landmarkBannerTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    landmarkBannerLabel: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: "900"
    },
    landmarkBannerCoords: {
      color: colors.muted,
      fontSize: 11.5,
      fontWeight: "700"
    },
    infoCard: {
      padding: 13,
      borderRadius: 14,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8
    },
    cardSectionHeading: {
      color: colors.muted,
      fontSize: 11.5,
      fontWeight: "900",
      textTransform: "uppercase",
      letterSpacing: 0.5
    },
    descriptionText: {
      color: colors.ink,
      fontSize: 13.5,
      lineHeight: 20,
      fontWeight: "600"
    },
    editorialText: {
      color: colors.muted,
      fontSize: 12.5,
      lineHeight: 18,
      fontStyle: "italic"
    },
    divider: {
      height: 1,
      backgroundColor: colors.line,
      marginVertical: 2
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 3
    },
    metaIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1
    },
    metaTextCol: {
      flex: 1
    },
    metaLabel: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "800"
    },
    metaValue: {
      color: colors.ink,
      fontSize: 12.5,
      fontWeight: "700",
      marginTop: 1,
      lineHeight: 17
    },
    linkValue: {
      color: colors.primary
    },
    hoursToggleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    weekdayList: {
      marginTop: 4,
      gap: 2
    },
    weekdayLine: {
      color: colors.ink,
      fontSize: 11.5,
      fontWeight: "600",
      lineHeight: 16
    },
    reviewsSection: {
      gap: 8
    },
    reviewSummaryBadge: {
      color: isDark ? "#FBBF24" : "#B45309",
      fontSize: 12,
      fontWeight: "900"
    },
    reviewCard: {
      padding: 12,
      borderRadius: 13,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 4
    },
    reviewHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    reviewAuthor: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: "800"
    },
    reviewRatingPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? "rgba(245, 158, 11, 0.16)" : "#FEF3C7"
    },
    reviewRatingText: {
      color: isDark ? "#FBBF24" : "#B45309",
      fontSize: 11,
      fontWeight: "900"
    },
    reviewTime: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: "600"
    },
    reviewBody: {
      color: colors.ink,
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 2
    }
  });
