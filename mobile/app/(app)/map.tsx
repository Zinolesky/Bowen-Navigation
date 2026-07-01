import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, LocateFixed, RefreshCw, Route, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import MapView, { Callout, Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { featureToPoi, getCategories, getPlaceDetails, getPois, getTracks, requestDirections } from "@/api";
import { MarkerBadge } from "@/components/MarkerBadge";
import { customMapStyle } from "@/mapStyle";
import { colors, shadows } from "@/theme";
import type { Category, GeoFeatureCollection, Poi, PoiProperties, RouteStep, TrackProperties } from "@/types";

const CAMPUS_REGION: Region = {
  latitude: 7.6236297,
  longitude: 4.1889662,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008
};

type Coordinate = { latitude: number; longitude: number };

export default function MapScreen() {
  const params = useLocalSearchParams<{ poi?: string }>();
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [tracks, setTracks] = useState<GeoFeatureCollection<TrackProperties> | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedPoi, setSelectedPoi] = useState<Poi | undefined>();
  const [routeCoords, setRouteCoords] = useState<Coordinate[]>([]);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [routing, setRouting] = useState(false);
  const [placeDetails, setPlaceDetails] = useState<any | null>(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);

  const panY = useRef(new Animated.Value(0)).current;
  const panValue = useRef(0);
  const sheetHeight = useRef(0);
  const isMinimized = useRef(false);

  useEffect(() => {
    panY.addListener((state) => {
      panValue.current = state.value;
    });
    return () => panY.removeAllListeners();
  }, [panY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        panY.setOffset(panValue.current);
        panY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        panY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        panY.flattenOffset();
        const minimizeTarget = Math.max(0, sheetHeight.current - 80);

        if (gestureState.vy > 1 || (gestureState.dy > 50 && !isMinimized.current)) {
          isMinimized.current = true;
          Animated.spring(panY, {
            toValue: minimizeTarget,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        } else if (gestureState.vy < -1 || (gestureState.dy < -50 && isMinimized.current)) {
          isMinimized.current = false;
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        } else {
          // Snap back
          Animated.spring(panY, {
            toValue: isMinimized.current ? minimizeTarget : 0,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        }
      }
    })
  ).current;

  const filteredPois = useMemo(() => {
    if (!selectedCategory) {
      return pois;
    }
    return pois.filter((poi) => poi.category.slug === selectedCategory);
  }, [pois, selectedCategory]);

  const loadCampus = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryData, poiData, trackData] = await Promise.all([getCategories(), getPois(), getTracks()]);
      const mappedPois = poiData.features.map((feature) =>
        featureToPoi(feature as { geometry: { coordinates: number[] }; properties: PoiProperties })
      );
      setCategories(categoryData);
      setPois(mappedPois);
      setTracks(trackData);

      if (params.poi) {
        const match = mappedPois.find((item) => String(item.id) === String(params.poi));
        if (match) {
          openPoi(match);
        }
      }
    } catch (error) {
      Alert.alert("Campus data unavailable", "Check the API connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [params.poi]);

  useEffect(() => {
    loadCampus();
  }, [loadCampus]);

  const hasInitializedLocation = useRef(false);

  async function initializeLocation() {
    if (hasInitializedLocation.current) return;
    hasInitializedLocation.current = true;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === "granted") {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

        // If accuracy is good (less than 500 meters inaccuracy), start at user location
        if (current.coords.accuracy && current.coords.accuracy <= 500) {
          mapRef.current?.animateToRegion(
            {
              latitude: current.coords.latitude,
              longitude: current.coords.longitude,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003
            },
            1000 // Smooth transition
          );
        }
      }
    } catch (error) {
      // If it fails or GPS accuracy is poor, it naturally falls back to the default CAMPUS_REGION
    }
  }

  async function openPoi(poi: Poi) {
    setSelectedPoi(poi);
    setPlaceDetails(null);
    setRouteCoords([]);
    setRouteSteps([]);
    panY.setValue(0);
    panValue.current = 0;
    isMinimized.current = false;
    mapRef.current?.animateToRegion(
      {
        latitude: poi.latitude,
        longitude: poi.longitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003
      },
      450
    );

    if (poi.google_place_id) {
      setFetchingDetails(true);
      try {
        const details = await getPlaceDetails(poi.google_place_id);
        if (details.result) {
          setPlaceDetails(details.result);
        }
      } catch (error) {
        // Silently fail or log if needed, but don't show an alert every time
      } finally {
        setFetchingDetails(false);
      }
    }
  }

  async function showMyLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Location unavailable", "Location permission is needed for campus walking directions.");
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion(
      {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003
      },
      450
    );
  }

  async function startDirections() {
    if (!selectedPoi) {
      return;
    }
    setRouting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location unavailable", "Location permission is needed for campus walking directions.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const result = await requestDirections({
        origin: {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude
        },
        destination: {
          latitude: selectedPoi.latitude,
          longitude: selectedPoi.longitude
        }
      });

      let decoded: Coordinate[] = [];
      if (typeof result.overview_polyline === "string") {
        decoded = polyline.decode(result.overview_polyline).map(([latitude, longitude]) => ({ latitude, longitude }));
      } else if (Array.isArray(result.overview_polyline)) {
        // In case the backend sends an array of coordinates directly
        decoded = result.overview_polyline;
      } else if ((result.overview_polyline as any)?.points) {
        decoded = polyline.decode((result.overview_polyline as any).points).map(([latitude, longitude]) => ({ latitude, longitude }));
      }

      setRouteCoords(decoded);
      setRouteSteps(result.steps || []);
      if (decoded.length > 1) {
        mapRef.current?.fitToCoordinates(decoded, {
          edgePadding: { top: 120, right: 40, bottom: 300, left: 40 },
          animated: true
        });

        // Automatically minimize the card to show the full route
        const minimizeTarget = Math.max(0, sheetHeight.current - 80);
        isMinimized.current = true;
        Animated.spring(panY, {
          toValue: minimizeTarget,
          useNativeDriver: true,
          bounciness: 0
        }).start();
      }
    } catch (error) {
      Alert.alert("Directions unavailable", "The route could not be generated right now.");
    } finally {
      setRouting(false);
    }
  }



  const trackLines =
    tracks?.features.map((feature) =>
      (feature.geometry.coordinates as number[][]).map(([longitude, latitude]) => ({
        latitude,
        longitude
      }))
    ) || [];

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        key={pois.length > 0 ? "maps-populated" : "maps-loading"}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={CAMPUS_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        customMapStyle={customMapStyle}
        onMapReady={initializeLocation}
      >
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={6} lineCap="round" lineJoin="round" />
        )}

        {filteredPois.map((poi) => {
          const isSelected = selectedPoi?.id === poi.id;
          const isDestination = isSelected && routeCoords.length > 0;

          let markerColor = "#6B7280"; // Grey default

          if (isDestination) {
            markerColor = "#EF4444"; // Red for routing
          } else if (isSelected) {
            markerColor = "#3B82F6"; // Blue when clicked
          }

          return (
            <Marker
              key={poi.id.toString()}
              coordinate={{ latitude: poi.latitude, longitude: poi.longitude }}
              title={poi.name}
              description={poi.category.name}
              onPress={() => openPoi(poi)}
            >
              <MarkerBadge
                color={markerColor}
                icon={poi.icon_identifier !== "map-pin" ? poi.icon_identifier : poi.category.icon_identifier}
                selected={isSelected || isDestination}
                size="sm"
              />
            </Marker>
          );
        })}
      </MapView>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={[styles.topBar, shadows.card]}>
          <Pressable style={styles.searchButton} onPress={() => router.push("/(app)/search")}>
            <Search size={20} color={colors.muted} />
            <Text style={styles.searchText}>Search Bowen campus</Text>
          </Pressable>
          <Pressable style={styles.iconButton} onPress={loadCampus}>
            <RefreshCw size={18} color={colors.primary} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={showMyLocation}>
            <LocateFixed size={18} color={colors.primary} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() => setSelectedCategory(undefined)}
            style={[styles.chip, !selectedCategory && styles.chipActive]}
          >
            <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>All</Text>
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setSelectedCategory(category.slug)}
              style={[styles.chip, selectedCategory === category.slug && styles.chipActive, { borderColor: category.color }]}
            >
              <Text style={[styles.chipText, selectedCategory === category.slug && styles.chipTextActive]}>{category.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {selectedPoi && (
        <Animated.View
          style={[styles.sheet, shadows.card, { transform: [{ translateY: panY }] }]}
          onLayout={(e) => { sheetHeight.current = e.nativeEvent.layout.height; }}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.poiName}>{selectedPoi.name}</Text>
                <Text style={styles.poiMeta}>
                  {selectedPoi.category.name}
                  {fetchingDetails ? (
                    <Text> • Loading details...</Text>
                  ) : placeDetails?.rating ? (
                    <Text> • ⭐ {placeDetails.rating} ({placeDetails.user_ratings_total || 0})</Text>
                  ) : null}
                  {selectedPoi.operating_hours ? ` • ${selectedPoi.operating_hours}` : ""}
                </Text>
              </View>
              <MarkerBadge color={selectedPoi.category.color} icon={selectedPoi.icon_identifier !== "map-pin" ? selectedPoi.icon_identifier : selectedPoi.category.icon_identifier} />
            </View>
          </View>

          <ScrollView style={{ flex: 1, marginTop: 12 }} showsVerticalScrollIndicator={false}>
            {placeDetails?.formatted_address && (
              <Text style={styles.poiAddress} numberOfLines={2}>{placeDetails.formatted_address}</Text>
            )}

            {placeDetails?.photos && placeDetails.photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoCarousel}>
                {placeDetails.photos.map((photo: any, index: number) => (
                  <Image key={index} source={{ uri: photo.url }} style={styles.photo} />
                ))}
              </ScrollView>
            )}

            <Text style={styles.description}>{selectedPoi.description}</Text>

            <View style={styles.actions}>
              <Pressable disabled={routing} onPress={startDirections} style={styles.primaryAction}>
                {routing ? <ActivityIndicator color="#FFFFFF" /> : <Route size={18} color="#FFFFFF" />}
                <Text style={styles.primaryActionText}>Directions</Text>
              </Pressable>
            </View>

            {routeSteps.length > 0 && (
              <View style={styles.steps}>
                {routeSteps.map((step, index) => (
                  <View key={`${step.instruction}-${index}`} style={styles.step}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepText}>{step.instruction}</Text>
                      <Text style={styles.stepMeta}>
                        {[step.distance_text, step.duration_text].filter(Boolean).join(" - ")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 14,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  searchButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#F6FAF8",
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 8
  },
  searchText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700"
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center"
  },
  chipRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    height: 36,
    justifyContent: "center"
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.muted,
    fontWeight: "800"
  },
  chipTextActive: {
    color: "#FFFFFF"
  },
  loading: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: "65%",
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12
  },
  sheetHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center"
  },
  poiName: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0
  },
  poiMeta: {
    color: colors.muted,
    marginTop: 3,
    fontWeight: "700"
  },
  description: {
    color: colors.ink,
    lineHeight: 21,
    marginTop: 12
  },
  poiAddress: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16
  },
  photoCarousel: {
    flexDirection: "row",
    marginVertical: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16
  },
  photo: {
    width: 240,
    height: 160,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: colors.line
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  primaryAction: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15
  },
  secondaryAction: {
    width: 96,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryActionText: {
    color: colors.primary,
    fontWeight: "900",
    fontSize: 15
  },
  steps: {
    marginTop: 12
  },
  step: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E3F3F0",
    alignItems: "center",
    justifyContent: "center"
  },
  stepNumberText: {
    color: colors.primary,
    fontWeight: "900",
    fontSize: 12
  },
  stepText: {
    color: colors.ink,
    fontWeight: "700",
    lineHeight: 19
  },
  stepMeta: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 12
  }
});
