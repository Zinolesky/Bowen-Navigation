import {
  Compass,
  LocateFixed,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from "lucide-react-native";
import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ManeuverIcon } from "@/components/ManeuverIcon";
import { formatDistance, formatDuration, formatETA } from "@/navigationUtils";
import { AppColors, shadows, useAppTheme } from "@/theme";
import type { RouteStep } from "@/types";

export function LiveNavigationHud({
  currentStep,
  nextStep,
  thenStep,
  distToNextManeuver,
  remainingDistanceMeters,
  remainingDurationSeconds,
  navSpeedKmh,
  isSimulating,
  isMuted,
  hasArrived,
  isRerouting,
  isCameraFollowing = true,
  destinationName,
  onToggleSimulation,
  onToggleMute,
  onRecenter,
  onExit
}: {
  currentStep?: RouteStep;
  nextStep?: RouteStep;
  thenStep?: RouteStep;
  distToNextManeuver: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  navSpeedKmh: number;
  isSimulating: boolean;
  isMuted: boolean;
  hasArrived: boolean;
  isRerouting: boolean;
  isCameraFollowing?: boolean;
  destinationName: string;
  onToggleSimulation: () => void;
  onToggleMute: () => void;
  onRecenter: () => void;
  onExit: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const upcomingStep = nextStep || currentStep;
  let headlineRoad = currentStep?.road_name || currentStep?.instruction || "Continue on route";
  if (upcomingStep) {
    if (upcomingStep.maneuver === "arrive") {
      headlineRoad =
        currentStep?.road_name && currentStep.road_name !== "Campus Pathway"
          ? `${destinationName} • via ${currentStep.road_name}`
          : destinationName;
    } else {
      headlineRoad =
        upcomingStep.road_name && upcomingStep.road_name !== "Campus Pathway"
          ? upcomingStep.road_name
          : upcomingStep.instruction || headlineRoad;
    }
  }

  return (
    <>
      <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
        <View pointerEvents="box-none" style={styles.liveNavTopContainer}>
          {/* PRIMARY TURN-BY-TURN GREEN MANEUVER CARD */}
          <View style={[styles.liveNavBanner, shadows.card]}>
            <View style={styles.liveNavBannerMain}>
              <View style={styles.liveNavIconWrapper}>
                <ManeuverIcon
                  maneuver={hasArrived ? "arrive" : upcomingStep?.maneuver || "straight"}
                  size={34}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.liveNavInstructionsColumn}>
                {isRerouting ? (
                  <View style={styles.reroutingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.liveNavDistanceHeadline}>Rerouting...</Text>
                  </View>
                ) : hasArrived ? (
                  <>
                    <Text style={styles.liveNavDistanceHeadline}>Arrived</Text>
                    <Text numberOfLines={2} style={styles.liveNavRoadName}>
                      {destinationName}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.liveNavDistanceHeadline}>
                      {formatDistance(distToNextManeuver)}
                    </Text>
                    <Text numberOfLines={2} style={styles.liveNavRoadName}>
                      {headlineRoad}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {thenStep && !hasArrived && (
              <View style={styles.liveNavSubBanner}>
                <Text style={styles.liveNavThenLabel}>Then</Text>
                <ManeuverIcon maneuver={thenStep.maneuver || "straight"} size={17} color="#FFFFFF" />
                <Text numberOfLines={1} style={styles.liveNavThenRoad}>
                  {thenStep.maneuver === "arrive"
                    ? destinationName
                    : thenStep.road_name || thenStep.instruction}
                </Text>
              </View>
            )}
          </View>

          {/* ACTION CONTROLS BAR (Split left/right so controls never collide with map edges) */}
          <View pointerEvents="box-none" style={styles.liveNavControlsRow}>
            <Pressable
              onPress={onToggleSimulation}
              style={[
                styles.demoPill,
                isSimulating ? styles.demoPillActive : styles.demoPillIdle,
                shadows.card
              ]}
            >
              {isSimulating ? (
                <>
                  <Pause size={14} color="#FFFFFF" />
                  <Text style={styles.demoPillText}>Pause Demo</Text>
                </>
              ) : (
                <>
                  <Play size={14} color="#FFFFFF" />
                  <Text style={styles.demoPillText}>Simulate Walk</Text>
                </>
              )}
            </Pressable>

            <View style={styles.rightControlGroup}>
              <Pressable
                onPress={onToggleMute}
                style={[styles.voicePillBtn, isMuted && styles.voicePillBtnMuted, shadows.card]}
              >
                {isMuted ? (
                  <>
                    <VolumeX size={16} color={colors.danger} />
                    <Text style={[styles.voicePillText, { color: colors.danger }]}>Muted</Text>
                  </>
                ) : (
                  <>
                    <Volume2 size={16} color={colors.primary} />
                    <Text style={styles.voicePillText}>Voice On</Text>
                  </>
                )}
              </Pressable>

              <Pressable onPress={onRecenter} style={[styles.floatingCircleBtn, shadows.card]}>
                <Compass size={19} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* SPEEDOMETER */}
      <View style={[styles.speedometerContainer, shadows.card]}>
        <Text style={styles.speedometerValue}>{navSpeedKmh}</Text>
        <Text style={styles.speedometerUnit}>km/h</Text>
      </View>

      {/* FLOATING RE-CENTER PILL WHEN USER PANS THE MAP */}
      {!isCameraFollowing && !hasArrived && (
        <Pressable onPress={onRecenter} style={[styles.recenterFloatingPill, shadows.card]}>
          <LocateFixed size={16} color="#FFFFFF" />
          <Text style={styles.recenterFloatingText}>Re-center</Text>
        </Pressable>
      )}

      {/* BOTTOM LIVE METRICS CARD */}
      <View style={[styles.liveNavBottomBar, shadows.card]}>
        <Pressable onPress={onExit} style={styles.liveNavExitBtn} hitSlop={8}>
          <X size={20} color={colors.ink} />
        </Pressable>

        <View style={styles.liveNavBottomMetrics}>
          <View style={styles.liveNavDurationRow}>
            <Text style={styles.liveNavDurationHeadline}>
              {hasArrived ? "Arrived" : formatDuration(remainingDurationSeconds)}
            </Text>
            <Sparkles size={15} color={colors.successText} style={{ marginLeft: 6 }} />
          </View>
          <Text numberOfLines={1} style={styles.liveNavSubMetrics}>
            {hasArrived
              ? destinationName
              : `${formatDistance(remainingDistanceMeters)} • ETA ${formatETA(remainingDurationSeconds)}`}
          </Text>
        </View>

        <Pressable
          onPress={onRecenter}
          style={[
            styles.liveNavRecenterBtn,
            !isCameraFollowing && styles.liveNavRecenterBtnHighlighted
          ]}
        >
          <LocateFixed size={20} color={isCameraFollowing ? colors.primary : "#FFFFFF"} />
        </Pressable>
      </View>
    </>
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
    liveNavTopContainer: {
      marginHorizontal: 12,
      marginTop: 8
    },
    liveNavBanner: {
      borderRadius: 18,
      backgroundColor: "#064E3B",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.14)"
    },
    liveNavBannerMain: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14
    },
    liveNavIconWrapper: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      alignItems: "center",
      justifyContent: "center"
    },
    liveNavInstructionsColumn: {
      flex: 1
    },
    reroutingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    liveNavDistanceHeadline: {
      color: "#FFFFFF",
      fontSize: 27,
      fontWeight: "900",
      letterSpacing: -0.5
    },
    liveNavRoadName: {
      color: "#E2E8F0",
      fontSize: 15,
      fontWeight: "700",
      marginTop: 2,
      lineHeight: 20
    },
    liveNavSubBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: "#043C2E",
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.10)"
    },
    liveNavThenLabel: {
      color: "#94A3B8",
      fontSize: 12.5,
      fontWeight: "800",
      textTransform: "uppercase"
    },
    liveNavThenRoad: {
      flex: 1,
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700"
    },
    liveNavControlsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10
    },
    rightControlGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    demoPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 13,
      height: 38,
      borderRadius: 19
    },
    demoPillActive: {
      backgroundColor: "#DC2626"
    },
    demoPillIdle: {
      backgroundColor: "#0D9488"
    },
    demoPillText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "800"
    },
    voicePillBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 38,
      paddingHorizontal: 12,
      borderRadius: 19,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line
    },
    voicePillBtnMuted: {
      borderColor: colors.danger
    },
    voicePillText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "800"
    },
    floatingCircleBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center"
    },
    speedometerContainer: {
      position: "absolute",
      left: 14,
      bottom: 98,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center"
    },
    speedometerValue: {
      fontSize: 18,
      fontWeight: "900",
      color: colors.ink,
      lineHeight: 20
    },
    speedometerUnit: {
      fontSize: 9,
      fontWeight: "800",
      color: colors.muted
    },
    recenterFloatingPill: {
      position: "absolute",
      right: 14,
      bottom: 100,
      height: 42,
      paddingHorizontal: 15,
      borderRadius: 21,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 7
    },
    recenterFloatingText: {
      color: "#FFFFFF",
      fontSize: 13.5,
      fontWeight: "900"
    },
    liveNavBottomBar: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 14,
      height: 74,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      gap: 12
    },
    liveNavExitBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center"
    },
    liveNavBottomMetrics: {
      flex: 1,
      alignItems: "center"
    },
    liveNavDurationRow: {
      flexDirection: "row",
      alignItems: "center"
    },
    liveNavDurationHeadline: {
      color: colors.successText,
      fontSize: 22,
      fontWeight: "900"
    },
    liveNavSubMetrics: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 2
    },
    liveNavRecenterBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center"
    },
    liveNavRecenterBtnHighlighted: {
      backgroundColor: colors.primary,
      borderColor: colors.primary
    }
  });
