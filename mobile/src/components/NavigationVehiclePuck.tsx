import React from "react";
import { StyleSheet, View } from "react-native";
import { Navigation } from "lucide-react-native";
import type { TravelMode } from "@/types";

interface NavigationVehiclePuckProps {
  mode: TravelMode;
}

export function NavigationVehiclePuck({ mode }: NavigationVehiclePuckProps) {
  if (mode === "driving") {
    return (
      <View style={styles.carContainer}>
        {/* Car shadow */}
        <View style={styles.carShadow} />
        {/* Car body */}
        <View style={styles.carBody}>
          {/* Headlights */}
          <View style={styles.carHeadlights}>
            <View style={styles.headlight} />
            <View style={styles.headlight} />
          </View>
          {/* Front windshield */}
          <View style={styles.windshieldFront} />
          {/* Roof */}
          <View style={styles.carRoof} />
          {/* Rear windshield */}
          <View style={styles.windshieldRear} />
          {/* Taillights */}
          <View style={styles.carTaillights}>
            <View style={styles.taillight} />
            <View style={styles.taillight} />
          </View>
        </View>
      </View>
    );
  }

  // Pedestrian puck (glowing blue beacon with directional arrow)
  return (
    <View style={styles.puckContainer}>
      <View style={styles.puckHalo} />
      <View style={styles.puckCircle}>
        <Navigation size={18} color="#FFFFFF" fill="#FFFFFF" style={styles.arrowOffset} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  puckContainer: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  puckHalo: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.22)",
  },
  puckCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  arrowOffset: {
    transform: [{ translateY: -1 }],
  },
  carContainer: {
    width: 38,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  carShadow: {
    position: "absolute",
    bottom: 4,
    width: 28,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  carBody: {
    width: 26,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  carHeadlights: {
    width: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headlight: {
    width: 4,
    height: 3,
    borderRadius: 1,
    backgroundColor: "#FDE047",
  },
  windshieldFront: {
    width: 18,
    height: 7,
    borderRadius: 2,
    backgroundColor: "#334155",
  },
  carRoof: {
    width: 17,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#1E293B",
  },
  windshieldRear: {
    width: 17,
    height: 5,
    borderRadius: 1.5,
    backgroundColor: "#334155",
  },
  carTaillights: {
    width: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  taillight: {
    width: 4,
    height: 2.5,
    borderRadius: 1,
    backgroundColor: "#EF4444",
  },
});
