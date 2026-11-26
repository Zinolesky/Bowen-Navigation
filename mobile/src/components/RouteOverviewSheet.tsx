import { Car, ChevronDown, ChevronUp, Footprints, ListOrdered, Navigation, X } from "lucide-react-native";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Animated,
  GestureResponderHandlers,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ManeuverIcon } from "@/components/ManeuverIcon";
import { AppColors, shadows, useAppTheme } from "@/theme";
import type { ModeEstimate, Poi, RouteStep, TravelMode } from "@/types";

export function RouteOverviewHeader({
  selectedPoi,
  originLabel,
  onOpenOriginPicker,
  onClearRoute
}: {
  selectedPoi: Poi;
  originLabel: string;
  onOpenOriginPicker: () => void;
  onClearRoute: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
      <View style={[styles.navTopCard, shadows.card]}>
        <View style={styles.navTopRow}>
          <View style={styles.navEndpointsColumn}>
            <Pressable onPress={onOpenOriginPicker} style={styles.navEndpointRow}>
              <View style={styles.originDotOuter}>
                <View style={styles.originDotInner} />
              </View>
              <Text numberOfLines={1} style={styles.navOriginSelectText}>
                {originLabel}
              </Text>
              <ChevronDown size={15} color={colors.primary} />
            </Pressable>

            <View style={styles.navDivider} />

            <View style={styles.navEndpointRow}>
              <View style={styles.destPinDot} />
              <Text numberOfLines={1} style={styles.navDestText}>
                {selectedPoi.name}
              </Text>
            </View>
          </View>

          <Pressable onPress={onClearRoute} style={styles.navCloseBtn} hitSlop={8}>
            <X size={18} color={colors.ink} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function RouteOverviewSheet({
  travelMode,
  routing,
  routeDurationText,
  routeDistanceText,
  routeSummary,
  originLabel,
  alternateModes,
  routeSteps,
  showSteps,
  panY,
  panHandlers,
  onLayoutHeight,
  onSelectTravelMode,
  onToggleSteps,
  onStartLiveNavigation,
  onClearRoute
}: {
  travelMode: TravelMode;
  routing: boolean;
  routeDurationText?: string;
  routeDistanceText?: string;
  routeSummary?: string;
  originLabel?: string;
  alternateModes?: Partial<Record<TravelMode, ModeEstimate>>;
  routeSteps: RouteStep[];
  showSteps: boolean;
  panY: Animated.Value;
  panHandlers: GestureResponderHandlers;
  onLayoutHeight: (height: number) => void;
  onSelectTravelMode: (mode: TravelMode) => void;
  onToggleSteps: () => void;
  onStartLiveNavigation: () => void;
  onClearRoute: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const walkDur =
    alternateModes?.walking?.duration_text || (travelMode === "walking" ? routeDurationText : undefined);
  const driveDur =
    alternateModes?.driving?.duration_text || (travelMode === "driving" ? routeDurationText : undefined);
  const isOfflineRoute = Boolean(routeSummary?.includes("Offline"));

  return (
    <Animated.View
      style={[styles.sheet, styles.sheetOverview, shadows.card, { transform: [{ translateY: panY }] }]}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
    >
      <View {...panHandlers}>
        <View style={styles.sheetHandle} />

        <View style={styles.gmModeTabRow}>
          <Pressable
            onPress={() => onSelectTravelMode("walking")}
            style={[styles.gmModeTab, travelMode === "walking" && styles.gmModeTabActiveWalk]}
          >
            <Footprints size={17} color={travelMode === "walking" ? colors.accent : colors.muted} />
            <Text style={[styles.gmModeTabText, travelMode === "walking" && styles.gmModeTabTextActiveWalk]}>
              Walk {walkDur ? `• ${walkDur}` : ""}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onSelectTravelMode("driving")}
            style={[styles.gmModeTab, travelMode === "driving" && styles.gmModeTabActiveDrive]}
          >
            <Car size={17} color={travelMode === "driving" ? colors.warning : colors.muted} />
            <Text style={[styles.gmModeTabText, travelMode === "driving" && styles.gmModeTabTextActiveDrive]}>
              Drive {driveDur ? `• ${driveDur}` : ""}
            </Text>
          </Pressable>

          {routing && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />}
        </View>

        <View style={styles.gmSummaryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.gmDurationHeadline}>
              {routeDurationText || "Route"}
              {routeDistanceText ? <Text style={styles.gmDistanceInline}> ({routeDistanceText})</Text> : null}
            </Text>
            <Text numberOfLines={1} style={styles.gmViaSubtext}>
              {isOfflineRoute
                ? `Offline on-device route`
                : travelMode === "driving"
                  ? "Fastest campus vehicle route"
                  : "Campus walking route • Pedestrian pathways"}
              {originLabel ? ` • From ${originLabel}` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.gmActionPillRow}>
          <Pressable onPress={onStartLiveNavigation} style={styles.startNavPill}>
            <Navigation size={17} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.startNavPillText}>Start Live Nav</Text>
          </Pressable>

          <Pressable onPress={onToggleSteps} style={styles.gmSecondaryPill}>
            <ListOrdered size={16} color={colors.ink} />
            <Text style={styles.gmSecondaryPillText}>{showSteps ? "Hide" : `Steps (${routeSteps.length})`}</Text>
            {showSteps ? <ChevronDown size={14} color={colors.ink} /> : <ChevronUp size={14} color={colors.ink} />}
          </Pressable>

          <Pressable onPress={onClearRoute} style={styles.gmSecondaryPill}>
            <X size={15} color={colors.muted} />
            <Text style={styles.gmSecondaryPillText}>Exit</Text>
          </Pressable>
        </View>
      </View>

      {showSteps && routeSteps.length > 0 && (
        <ScrollView style={styles.stepsDrawer} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {routeSteps.map((step, index) => (
            <View key={`${step.instruction}-${index}`} style={styles.step}>
              <View style={styles.stepManeuverBadge}>
                <ManeuverIcon maneuver={step.maneuver || "straight"} size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>{step.instruction}</Text>
                <Text style={styles.stepMeta}>
                  {[step.distance_text, step.duration_text].filter(Boolean).join(" • ")}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    topOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0
    },
    navTopCard: {
      marginHorizontal: 12,
      marginTop: 8,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    navTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10
    },
    navEndpointsColumn: {
      flex: 1,
      gap: 8
    },
    navEndpointRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    originDotOuter: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center"
    },
    originDotInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent
    },
    navOriginSelectText: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: "800",
      color: colors.accent
    },
    destPinDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: "#DC2626",
      borderWidth: 2,
      borderColor: "#FEE2E2",
      marginHorizontal: 1
    },
    navDivider: {
      height: 1,
      backgroundColor: colors.line,
      marginLeft: 24
    },
    navDestText: {
      flex: 1,
      fontSize: 14,
      fontWeight: "800",
      color: colors.ink
    },
    navCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center"
    },
    sheet: {
      position: "absolute",
      left: 10,
      right: 10,
      bottom: 10,
      borderRadius: 22,
      backgroundColor: colors.surface,
      paddingHorizontal: 15,
      paddingTop: 10,
      paddingBottom: 14,
      borderWidth: 1,
      borderColor: colors.line
    },
    sheetOverview: {
      maxHeight: 330
    },
    sheetHandle: {
      alignSelf: "center",
      width: 36,
      height: 4.5,
      borderRadius: 2.5,
      backgroundColor: colors.line,
      marginBottom: 8
    },
    gmModeTabRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8
    },
    gmModeTab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line
    },
    gmModeTabActiveWalk: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent
    },
    gmModeTabActiveDrive: {
      backgroundColor: colors.warningSoft,
      borderColor: colors.warning
    },
    gmModeTabText: {
      fontSize: 12.5,
      fontWeight: "800",
      color: colors.muted
    },
    gmModeTabTextActiveWalk: {
      color: colors.accent
    },
    gmModeTabTextActiveDrive: {
      color: colors.warning
    },
    gmSummaryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    },
    gmDurationHeadline: {
      fontSize: 22,
      fontWeight: "900",
      color: colors.successText
    },
    gmDistanceInline: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.ink
    },
    gmViaSubtext: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.muted,
      marginTop: 2
    },
    gmActionPillRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    startNavPill: {
      flex: 1.5,
      height: 44,
      borderRadius: 22,
      backgroundColor: "#0D9488",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 16
    },
    startNavPillText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 14.5
    },
    gmSecondaryPill: {
      height: 42,
      borderRadius: 21,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surfaceSubtle,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5
    },
    gmSecondaryPillText: {
      color: colors.ink,
      fontWeight: "800",
      fontSize: 12.5
    },
    stepsDrawer: {
      marginTop: 10,
      maxHeight: 175
    },
    step: {
      flexDirection: "row",
      gap: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      alignItems: "center"
    },
    stepManeuverBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.primarySoft,
      alignItems: "center",
      justifyContent: "center"
    },
    stepText: {
      color: colors.ink,
      fontWeight: "700",
      fontSize: 13,
      lineHeight: 18
    },
    stepMeta: {
      color: colors.muted,
      marginTop: 2,
      fontSize: 11.5,
      fontWeight: "600"
    }
  });
