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
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ManeuverIcon } from "@/components/ManeuverIcon";
import { formatDistance, formatDuration, formatETA } from "@/navigationUtils";
import { colors, shadows } from "@/theme";
import type { RouteStep } from "@/types";

export function LiveNavigationHud({
  currentStep,
  nextStep,
  distToNextManeuver,
  remainingDistanceMeters,
  remainingDurationSeconds,
  navSpeedKmh,
  isSimulating,
  isMuted,
  hasArrived,
  isRerouting,
  destinationName,
  onToggleSimulation,
  onToggleMute,
  onRecenter,
  onExit
}: {
  currentStep?: RouteStep;
  nextStep?: RouteStep;
  distToNextManeuver: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  navSpeedKmh: number;
  isSimulating: boolean;
  isMuted: boolean;
  hasArrived: boolean;
  isRerouting: boolean;
  destinationName: string;
  onToggleSimulation: () => void;
  onToggleMute: () => void;
  onRecenter: () => void;
  onExit: () => void;
}) {
  return (
    <>
      <SafeAreaView pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.liveNavTopContainer}>
          <View style={[styles.liveNavBanner, shadows.card]}>
            <View style={styles.liveNavBannerMain}>
              <View style={styles.liveNavIconWrapper}>
                <ManeuverIcon
                  maneuver={hasArrived ? "arrive" : currentStep?.maneuver || "straight"}
                  size={36}
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
                      {currentStep?.road_name || currentStep?.instruction || "Continue on route"}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {nextStep && !hasArrived && (
              <View style={styles.liveNavSubBanner}>
                <Text style={styles.liveNavThenLabel}>Then</Text>
                <ManeuverIcon maneuver={nextStep.maneuver || "straight"} size={18} color="#FFFFFF" />
                <Text numberOfLines={1} style={styles.liveNavThenRoad}>
                  {nextStep.road_name || nextStep.instruction}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.liveNavControlsRow}>
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
                  <Text style={styles.demoPillText}>Pause</Text>
                </>
              ) : (
                <>
                  <Play size={14} color="#FFFFFF" />
                  <Text style={styles.demoPillText}>▶ Demo</Text>
                </>
              )}
            </Pressable>

            <Pressable onPress={onToggleMute} style={[styles.floatingCircleBtn, shadows.card]}>
              {isMuted ? <VolumeX size={18} color={colors.ink} /> : <Volume2 size={18} color={colors.ink} />}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.liveNavRightFloating}>
        <Pressable onPress={onRecenter} style={[styles.floatingCircleBtn, shadows.card]}>
          <Compass size={22} color={colors.primary} />
        </Pressable>
      </View>

      <View style={[styles.speedometerContainer, shadows.card]}>
        <Text style={styles.speedometerValue}>{navSpeedKmh}</Text>
        <Text style={styles.speedometerUnit}>km/h</Text>
      </View>

      <View style={[styles.liveNavBottomBar, shadows.card]}>
        <Pressable onPress={onExit} style={styles.liveNavExitBtn} hitSlop={8}>
          <X size={20} color={colors.ink} />
        </Pressable>

        <View style={styles.liveNavBottomMetrics}>
          <View style={styles.liveNavDurationRow}>
            <Text style={styles.liveNavDurationHeadline}>
              {hasArrived ? "Arrived" : formatDuration(remainingDurationSeconds)}
            </Text>
            <Sparkles size={16} color="#15803D" style={{ marginLeft: 6 }} />
          </View>
          <Text style={styles.liveNavSubMetrics}>
            {hasArrived
              ? destinationName
              : `${formatDistance(remainingDistanceMeters)} • ${formatETA(remainingDurationSeconds)}`}
          </Text>
        </View>

        <Pressable onPress={onRecenter} style={styles.liveNavRecenterBtn}>
          <LocateFixed size={20} color={colors.primary} />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 16,
    backgroundColor: "#064E3B",
    overflow: "hidden"
  },
  liveNavBannerMain: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14
  },
  liveNavIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
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
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5
  },
  liveNavRoadName: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2
  },
  liveNavSubBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#043C2E",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)"
  },
  liveNavThenLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800"
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
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10
  },
  demoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17
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
  liveNavRightFloating: {
    position: "absolute",
    right: 14,
    top: 240
  },
  speedometerContainer: {
    position: "absolute",
    left: 14,
    bottom: 96,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surface,
    borderWidth: 2.5,
    borderColor: "#E2E8F0",
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
  liveNavBottomBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    height: 72,
    borderRadius: 20,
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
    backgroundColor: "#F1F5F9",
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
    color: "#15803D",
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
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
    justifyContent: "center"
  }
});
