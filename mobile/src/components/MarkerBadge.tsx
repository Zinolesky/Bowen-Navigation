import {
  BookOpen,
  BriefcaseBusiness,
  Dumbbell,
  HeartPulse,
  Home,
  Landmark,
  MapPin,
  Navigation,
  Scale,
  School,
  Trees,
  Utensils,
  GraduationCap,
  Building,
  Hospital,
  Church,
  Droplets
} from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

const icons = {
  "book-open": BookOpen,
  briefcase: BriefcaseBusiness,
  dumbbell: Dumbbell,
  "heart-pulse": HeartPulse,
  home: Home,
  landmark: Landmark,
  "map-pin": MapPin,
  navigation: Navigation,
  scale: Scale,
  school: School,
  trees: Trees,
  utensils: Utensils,
  "graduation-cap": GraduationCap,
  office: Building,
  bank: Landmark,
  restaurant: Utensils,
  hospital: Hospital,
  toilet: Droplets,
  house: Home,
  church: Church
};

type IconName = keyof typeof icons;

export function MarkerBadge({
  color,
  icon,
  selected,
  size = "md"
}: {
  color: string;
  icon: string;
  selected?: boolean;
  size?: "sm" | "md";
}) {
  const Icon = icons[(icon || "map-pin") as IconName] ?? MapPin;
  const isSm = size === "sm";

  return (
    <View style={[
      styles.wrap, 
      isSm && styles.wrapSm,
      selected && styles.selected, 
      { borderColor: color }
    ]}>
      <View style={[
        styles.inner, 
        isSm && styles.innerSm,
        { backgroundColor: color }
      ]}>
        <Icon size={isSm ? 12 : 16} color="#FFFFFF" strokeWidth={isSm ? 3 : 2.4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center"
  },
  wrapSm: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
  },
  selected: {
    // Intentionally empty, scaling removed per user request
  },
  inner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  innerSm: {
    width: 18,
    height: 18,
    borderRadius: 9,
  }
});

