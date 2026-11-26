import React from "react";
import { StyleSheet, View } from "react-native";
import { Marker, Polyline } from "react-native-maps";

import { MarkerBadge } from "@/components/MarkerBadge";
import type { Coordinate } from "@/navigationUtils";
import type { Poi } from "@/types";

type PolylineItem = {
  id: string;
  coords: Coordinate[];
};

export const CampusTracksLayer = React.memo(function CampusTracksLayer({
  drivewayPolylines,
  standaloneWalkwayPolylines,
  isDark = false
}: {
  drivewayPolylines: PolylineItem[];
  standaloneWalkwayPolylines: PolylineItem[];
  isDark?: boolean;
}) {
  const driveOuter = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(71, 85, 105, 0.65)";
  const driveInner = isDark ? "rgba(100, 116, 139, 0.92)" : "rgba(226, 232, 240, 0.92)";
  const walkwayColor = isDark ? "#2DD4BF" : "#0D9488";

  return (
    <>
      {drivewayPolylines.map((drive) => (
        <React.Fragment key={drive.id}>
          <Polyline
            coordinates={drive.coords}
            strokeColor={driveOuter}
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
            zIndex={1}
          />
          <Polyline
            coordinates={drive.coords}
            strokeColor={driveInner}
            strokeWidth={3.2}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        </React.Fragment>
      ))}

      {standaloneWalkwayPolylines.map((walk) => (
        <Polyline
          key={walk.id}
          coordinates={walk.coords}
          strokeColor={walkwayColor}
          strokeWidth={3}
          lineDashPattern={[5, 5]}
          lineCap="round"
          lineJoin="round"
          zIndex={3}
        />
      ))}
    </>
  );
});

export const CampusPoisLayer = React.memo(function CampusPoisLayer({
  declutteredPois,
  selectedPoiId,
  isDestinationActive,
  tracksViewChanges,
  onSelectPoi
}: {
  declutteredPois: { poi: Poi; displayMode: "full" | "compact" }[];
  selectedPoiId?: number;
  isDestinationActive: boolean;
  tracksViewChanges: boolean;
  onSelectPoi: (poi: Poi) => void;
}) {
  return (
    <>
      {declutteredPois.map(({ poi, displayMode }) => {
        const isSelected = selectedPoiId === poi.id;
        const isDestination = isSelected && isDestinationActive;

        const markerIconUri = isDestination
          ? poi.marker_icon_destination || poi.marker_icon_selected || poi.marker_icon_default
          : isSelected
            ? poi.marker_icon_selected || poi.marker_icon_default
            : displayMode === "compact"
              ? poi.marker_icon_compact || poi.marker_icon_default
              : poi.marker_icon_default;

        const anchorX =
          displayMode === "compact" && !isSelected && !isDestination ? 0.5 : (poi.marker_anchor_x ?? 0.12);

        if (markerIconUri) {
          return (
            <Marker
              key={`poi-${poi.id}-${displayMode}-${isSelected ? "sel" : "def"}-${isDestination ? "dest" : "no"}`}
              coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
              anchor={{ x: anchorX, y: 0.5 }}
              image={{ uri: markerIconUri }}
              tracksViewChanges={false}
              zIndex={isSelected || isDestination ? 25 : displayMode === "full" ? 8 : 4}
              onPress={() => onSelectPoi(poi)}
            />
          );
        }

        let markerColor = poi.category?.color || "#6B7280";
        if (isDestination) {
          markerColor = "#EF4444";
        } else if (isSelected) {
          markerColor = "#2563EB";
        }

        return (
          <Marker
            key={`poi-${poi.id}-${isSelected ? "sel" : "def"}`}
            coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
            anchor={{ x: 0.08, y: 0.5 }}
            tracksViewChanges={tracksViewChanges}
            zIndex={isSelected || isDestination ? 25 : 5}
            onPress={() => onSelectPoi(poi)}
          >
            <View collapsable={false} style={styles.markerCanvas}>
              <MarkerBadge
                color={markerColor}
                icon={poi.icon_identifier !== "map-pin" ? poi.icon_identifier : poi.category.icon_identifier}
                selected={isSelected || isDestination}
                size="sm"
              />
            </View>
          </Marker>
        );
      })}
    </>
  );
});

const styles = StyleSheet.create({
  markerCanvas: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  }
});
