import React from "react";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Navigation,
  RotateCcw
} from "lucide-react-native";

interface ManeuverIconProps {
  maneuver?: string;
  size?: number;
  color?: string;
}

export function ManeuverIcon({
  maneuver,
  size = 28,
  color = "#FFFFFF"
}: ManeuverIconProps) {
  const m = (maneuver || "").toLowerCase();

  if (m === "arrive") {
    return <Flag size={size} color={color} />;
  }
  if (m.includes("sharp-left") || m === "turn-sharp-left") {
    return <RotateCcw size={size} color={color} />;
  }
  if (m.includes("sharp-right") || m === "turn-sharp-right") {
    return <RotateCcw size={size} color={color} style={{ transform: [{ scaleX: -1 }] }} />;
  }
  if (m.includes("slight-left") || m === "turn-slight-left") {
    return <ArrowUpLeft size={size} color={color} />;
  }
  if (m.includes("slight-right") || m === "turn-slight-right") {
    return <ArrowUpRight size={size} color={color} />;
  }
  if (m.includes("left") || m === "turn-left") {
    return <CornerUpLeft size={size} color={color} />;
  }
  if (m.includes("right") || m === "turn-right") {
    return <CornerUpRight size={size} color={color} />;
  }
  if (m === "depart") {
    return <Navigation size={size} color={color} />;
  }
  return <ArrowUp size={size} color={color} />;
}
