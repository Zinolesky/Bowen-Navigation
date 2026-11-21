import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { LocateFixed, LogOut, RefreshCw, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { requestDirections } from "@/api";
import { useAuth } from "@/auth";
import { useCampusData } from "@/campusStore";
import { CampusPoisLayer, CampusTracksLayer } from "@/components/CampusMapLayers";
import { LiveNavigationHud } from "@/components/LiveNavigationHud";
import { NavigationVehiclePuck } from "@/components/NavigationVehiclePuck";
import { OriginPickerModal } from "@/components/OriginPickerModal";
import { PlaceDetailsSheet } from "@/components/PlaceDetailsSheet";
import { RouteOverviewHeader, RouteOverviewSheet } from "@/components/RouteOverviewSheet";
import { useLiveNavigation } from "@/hooks/useLiveNavigation";
import { customMapStyle } from "@/mapStyle";
import type { Coordinate } from "@/navigationUtils";
import { colors, shadows } from "@/theme";
import type { ModeEstimate, Poi, RouteStep, TravelMode } from "@/types";
import {
  buildRoadAndWalkwayPolylines,
  CAMPUS_REGION,
  computeDeclutteredPois,
  isCoordinateOnCampus,
  MAIN_GATE_COORDS
} from "@/utils/mapGeometry";

type RouteMeta = {
  distanceMeters?: number;
  durationSeconds?: number;
  distanceText?: string;
  durationText?: string;
  durationBadgeUri?: string;
  summary?: string;
  mode: TravelMode;
  originLabel?: string;
  originCoords?: Coordinate;
  alternateModes?: Partial<Record<TravelMode, ModeEstimate>>;
};

type NavStage = "browse" | "place_details" | "route_overview" | "live_navigation";

function decodeOverviewPolyline(raw: unknown): Coordinate[] {
  if (typeof raw === "string" && raw.length > 0) {
    return polyline.decode(raw).map(([latitude, longitude]) => ({ latitude, longitude }));
  }
  if (Array.isArray(raw)) {
    return raw as Coordinate[];
  }
  if (raw && typeof raw === "object" && typeof (raw as any).points === "string") {
    return polyline.decode((raw as any).points).map(([latitude, longitude]) => ({ latitude, longitude }));
  }
  return [];
}

export default function MapScreen() {
  const params = useLocalSearchParams<{ poi?: string; t?: string }>();
  const { signOut, accessToken } = useAuth();
  const { categories, pois, tracks, loading, error, refreshCampus, getCachedPlaceDetails } = useCampusData();

  const mapRef = useRef<MapView>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedPoi, setSelectedPoi] = useState<Poi | undefined>();
  const [originPoiId, setOriginPoiId] = useState<number | "gps">("gps");
  const [originPickerVisible, setOriginPickerVisible] = useState<boolean>(false);
  const [travelMode, setTravelMode] = useState<TravelMode>("walking");

  const [routeCoords, setRouteCoords] = useState<Coordinate[]>([]);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [routeMeta, setRouteMeta] = useState<RouteMeta | null>(null);
  const [routing, setRouting] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const [placeDetails, setPlaceDetails] = useState<any | null>(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(CAMPUS_REGION);
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const [navStage, setNavStage] = useState<NavStage>("browse");

  const lastKnownGpsRef = useRef<{ coord: Coordinate; ts: number } | null>(null);
  const selectedPoiIdRef = useRef<number | undefined>(undefined);
  const routeRequestGenRef = useRef<number>(0);
  const routeCacheEntryRef = useRef<{
    key: string;
    coords: Coordinate[];
    steps: RouteStep[];
    meta: RouteMeta;
  } | null>(null);
  const lastOpenedParamKeyRef = useRef<string | null>(null);
  const inflightRouteRef = useRef<{
    key: string;
    promise: Promise<{ coords: Coordinate[]; steps: RouteStep[]; meta: RouteMeta } | null>;
  } | null>(null);
  const shownErrorRef = useRef<boolean>(false);

  const panY = useRef(new Animated.Value(0)).current;
  const panValue = useRef(0);
  const sheetHeight = useRef(0);
  const isMinimized = useRef(false);

  useEffect(() => {
    if (error && pois.length === 0 && !shownErrorRef.current) {
      shownErrorRef.current = true;
      Alert.alert("Campus data unavailable", error);
    }
    if (!error) {
      shownErrorRef.current = false;
    }
  }, [error, pois.length]);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, 650);
    return () => clearTimeout(timer);
  }, [pois, selectedCategory, selectedPoi?.id, navStage]);

  useEffect(() => {
    const id = panY.addListener((state) => {
      panValue.current = state.value;
    });
    return () => panY.removeListener(id);
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
        const minimizeTarget = Math.max(0, sheetHeight.current - 88);
        const nextVal = panValue.current + gestureState.dy;
        if (nextVal >= 0 && nextVal <= minimizeTarget + 24) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        panY.flattenOffset();
        const minimizeTarget = Math.max(0, sheetHeight.current - 88);

        if (gestureState.vy > 0.8 || (gestureState.dy > 40 && !isMinimized.current)) {
          isMinimized.current = true;
          Animated.spring(panY, {
            toValue: minimizeTarget,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        } else if (gestureState.vy < -0.8 || (gestureState.dy < -40 && isMinimized.current)) {
          isMinimized.current = false;
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        } else {
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
    if (selectedCategory) {
      return pois.filter((poi) => poi.category.slug === selectedCategory);
    }
    return pois;
  }, [pois, selectedCategory]);

  const isNavActive = navStage === "route_overview" || navStage === "live_navigation";

  const declutteredPois = useMemo(
    () =>
      computeDeclutteredPois({
        pois: filteredPois,
        latitudeDelta: mapRegion.latitudeDelta,
        longitudeDelta: mapRegion.longitudeDelta,
        selectedPoiId: selectedPoi?.id,
        originPoiId,
        isNavActive
      }),
    [filteredPois, mapRegion.latitudeDelta, mapRegion.longitudeDelta, selectedPoi?.id, originPoiId, isNavActive]
  );

  const originChoices = useMemo(() => {
    if (!selectedPoi) return [];
    const others = pois.filter((p) => p.id !== selectedPoi.id);
    return [...others].sort((a, b) => {
      const aGate = a.name.toLowerCase().includes("gate") ? -1 : 0;
      const bGate = b.name.toLowerCase().includes("gate") ? -1 : 0;
      return aGate - bGate;
    });
  }, [pois, selectedPoi]);

  const currentOriginLabel = useMemo(() => {
    if (originPoiId !== "gps") {
      const found = pois.find((p) => p.id === originPoiId);
      if (found) return found.name;
    }
    return routeMeta?.originLabel || "My GPS / Main Gate";
  }, [originPoiId, pois, routeMeta?.originLabel]);

  const { drivewayPolylines, standaloneWalkwayPolylines } = useMemo(
    () => buildRoadAndWalkwayPolylines(tracks),
    [tracks]
  );

  const routeMidpoint = useMemo<Coordinate | null>(() => {
    if (routeCoords.length < 2) return null;
    return routeCoords[Math.floor(routeCoords.length / 2)];
  }, [routeCoords]);

  const fitActiveRoute = useCallback((coords: Coordinate[]) => {
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 148, right: 52, bottom: 240, left: 52 },
        animated: true
      });
    }
  }, []);

  const resolveOriginPoint = useCallback(
    async (poi: Poi, customOriginId: number | "gps"): Promise<{ coords: Coordinate; label: string }> => {
      const chosenOriginPoi =
        customOriginId !== "gps" ? pois.find((item) => item.id === customOriginId) : undefined;

      if (chosenOriginPoi && chosenOriginPoi.id !== poi.id) {
        return {
          coords: { latitude: chosenOriginPoi.latitude, longitude: chosenOriginPoi.longitude },
          label: chosenOriginPoi.name
        };
      }

      // Fast path: reuse cached campus GPS coordinate (<60s old) for instant route startup
      const cachedGps = lastKnownGpsRef.current;
      if (cachedGps && Date.now() - cachedGps.ts < 60000) {
        if (isCoordinateOnCampus(cachedGps.coord.latitude, cachedGps.coord.longitude)) {
          return { coords: cachedGps.coord, label: "Your location" };
        }
      } else {
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.status === "granted") {
            const last = await Location.getLastKnownPositionAsync();
            if (last) {
              const coord = { latitude: last.coords.latitude, longitude: last.coords.longitude };
              lastKnownGpsRef.current = { coord, ts: Date.now() };
              if (isCoordinateOnCampus(coord.latitude, coord.longitude)) {
                return { coords: coord, label: "Your location" };
              }
            }
          }
        } catch {
          // Fall back gracefully
        }
      }

      const gatePoi = pois.find((p) => p.name.toLowerCase().includes("gate") && p.id !== poi.id);
      if (gatePoi) {
        return { coords: { latitude: gatePoi.latitude, longitude: gatePoi.longitude }, label: gatePoi.name };
      }
      return { coords: MAIN_GATE_COORDS, label: "Main Gate" };
    },
    [pois]
  );

  const fetchRouteForMode = useCallback(
    async (
      poi: Poi,
      modeToUse: TravelMode,
      customOriginId: number | "gps" = originPoiId,
      options?: { silent?: boolean; explicitOrigin?: Coordinate; explicitOriginLabel?: string }
    ): Promise<{ coords: Coordinate[]; steps: RouteStep[]; meta: RouteMeta } | null> => {
      const key = `${poi.id}:${modeToUse}:${customOriginId}:${options?.explicitOrigin?.latitude ?? ""}:${options?.explicitOrigin?.longitude ?? ""}`;

      if (!options?.explicitOrigin && routeCacheEntryRef.current?.key === key) {
        const entry = routeCacheEntryRef.current;
        return { coords: entry.coords, steps: entry.steps, meta: entry.meta };
      }

      if (inflightRouteRef.current && inflightRouteRef.current.key === key) {
        return inflightRouteRef.current.promise;
      }

      const gen = ++routeRequestGenRef.current;
      if (!options?.silent) {
        setRouting(true);
      }

      const promise = (async () => {
        try {
          const resolvedOrigin = options?.explicitOrigin
            ? {
                coords: options.explicitOrigin,
                label: options.explicitOriginLabel || "Your location"
              }
            : await resolveOriginPoint(poi, customOriginId);

          const result = await requestDirections({
            origin: resolvedOrigin.coords,
            destination: {
              latitude: poi.latitude,
              longitude: poi.longitude
            },
            mode: modeToUse,
            include_alternate: true
          });

          if (gen !== routeRequestGenRef.current || selectedPoiIdRef.current !== poi.id) {
            return null;
          }

          const decoded = decodeOverviewPolyline(result.overview_polyline);
          const meta: RouteMeta = {
            distanceMeters: result.distance_meters ?? 0,
            durationSeconds: result.duration_seconds ?? 0,
            distanceText: result.distance_text,
            durationText: result.duration_text,
            durationBadgeUri: result.duration_badge_uri,
            summary: result.summary,
            mode: result.mode || modeToUse,
            originLabel: resolvedOrigin.label,
            originCoords: resolvedOrigin.coords,
            alternateModes: result.alternate_modes
          };

          const steps = result.steps || [];
          routeCacheEntryRef.current = { key, coords: decoded, steps, meta };
          setRouteCoords(decoded);
          setRouteSteps(steps);
          setRouteMeta(meta);
          setShowSteps(false);
          panY.setValue(0);
          panValue.current = 0;
          isMinimized.current = false;

          return { coords: decoded, steps, meta };
        } catch {
          if (!options?.silent) {
            Alert.alert("Directions unavailable", "The route could not be generated right now.");
          }
          return null;
        } finally {
          if (inflightRouteRef.current?.key === key) {
            inflightRouteRef.current = null;
          }
          if (!options?.silent) {
            setRouting(false);
          }
        }
      })();

      inflightRouteRef.current = { key, promise };
      return promise;
    },
    [originPoiId, panY, resolveOriginPoint]
  );

  const handleReroute = useCallback(
    async (fromCoord: Coordinate) => {
      if (!selectedPoi) return;
      routeCacheEntryRef.current = null;
      await fetchRouteForMode(selectedPoi, travelMode, "gps", {
        silent: true,
        explicitOrigin: fromCoord,
        explicitOriginLabel: "Your location"
      });
    },
    [fetchRouteForMode, selectedPoi, travelMode]
  );

  const liveNav = useLiveNavigation({
    isActive: navStage === "live_navigation",
    routeCoords,
    routeSteps,
    travelMode,
    destinationName: selectedPoi?.name || "Destination",
    mapRef,
    onReroute: handleReroute
  });
  const stopLiveNav = liveNav.stopAll;

  const openPoi = useCallback(
    async (poi: Poi) => {
      stopLiveNav();
      selectedPoiIdRef.current = poi.id;
      routeCacheEntryRef.current = null;
      setSelectedPoi(poi);
      setNavStage("place_details");
      setPlaceDetails(null);
      setRouteCoords([]);
      setRouteSteps([]);
      setRouteMeta(null);
      setShowSteps(false);
      panY.setValue(0);
      panValue.current = 0;
      isMinimized.current = false;

      const nextRegion: Region = {
        latitude: poi.latitude,
        longitude: poi.longitude,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004
      };
      setMapRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 450);

      // Speculatively prefetch route in background so clicking Directions/Start is instant
      fetchRouteForMode(poi, travelMode, originPoiId, { silent: true }).catch(() => {});

      if (poi.google_place_id) {
        setFetchingDetails(true);
        try {
          const details = await getCachedPlaceDetails(poi.google_place_id);
          if (selectedPoiIdRef.current === poi.id && details) {
            setPlaceDetails(details);
          }
        } finally {
          if (selectedPoiIdRef.current === poi.id) {
            setFetchingDetails(false);
          }
        }
      }
    },
    [fetchRouteForMode, getCachedPlaceDetails, originPoiId, panY, stopLiveNav, travelMode]
  );

  const closePoiSheet = useCallback(() => {
    stopLiveNav();
    selectedPoiIdRef.current = undefined;
    routeCacheEntryRef.current = null;
    setSelectedPoi(undefined);
    setNavStage("browse");
    setPlaceDetails(null);
    setRouteCoords([]);
    setRouteSteps([]);
    setRouteMeta(null);
    setShowSteps(false);
    panY.setValue(0);
    panValue.current = 0;
    isMinimized.current = false;
  }, [panY, stopLiveNav]);

  const clearRoute = useCallback(() => {
    stopLiveNav();
    setShowSteps(false);
    setNavStage(selectedPoi ? "place_details" : "browse");
    panY.setValue(0);
    panValue.current = 0;
    isMinimized.current = false;
    mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: 300 });
  }, [panY, selectedPoi, stopLiveNav]);

  useEffect(() => {
    if (params.poi && pois.length > 0) {
      const paramKey = `${params.poi}:${params.t ?? ""}`;
      if (lastOpenedParamKeyRef.current === paramKey) return;
      const match = pois.find((item) => String(item.id) === String(params.poi));
      if (match) {
        lastOpenedParamKeyRef.current = paramKey;
        openPoi(match);
      }
    }
  }, [params.poi, params.t, pois, openPoi]);

  const hasInitializedLocation = useRef(false);

  async function initializeLocation() {
    if (hasInitializedLocation.current) return;
    hasInitializedLocation.current = true;

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;

      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        lastKnownGpsRef.current = {
          coord: { latitude: last.coords.latitude, longitude: last.coords.longitude },
          ts: Date.now()
        };
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      lastKnownGpsRef.current = {
        coord: { latitude: current.coords.latitude, longitude: current.coords.longitude },
        ts: Date.now()
      };

      if (
        !params.poi &&
        current.coords.accuracy &&
        current.coords.accuracy <= 500 &&
        isCoordinateOnCampus(current.coords.latitude, current.coords.longitude)
      ) {
        const nextRegion: Region = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004
        };
        setMapRegion(nextRegion);
        mapRef.current?.animateToRegion(nextRegion, 800);
      }
    } catch {
      // Naturally falls back to CAMPUS_REGION
    }
  }

  async function showMyLocation() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setMapRegion(CAMPUS_REGION);
        mapRef.current?.animateToRegion(CAMPUS_REGION, 450);
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      lastKnownGpsRef.current = {
        coord: { latitude: current.coords.latitude, longitude: current.coords.longitude },
        ts: Date.now()
      };
      if (isCoordinateOnCampus(current.coords.latitude, current.coords.longitude)) {
        const nextRegion: Region = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004
        };
        setMapRegion(nextRegion);
        mapRef.current?.animateToRegion(nextRegion, 450);
      } else {
        setMapRegion(CAMPUS_REGION);
        mapRef.current?.animateToRegion(CAMPUS_REGION, 450);
      }
    } catch {
      setMapRegion(CAMPUS_REGION);
      mapRef.current?.animateToRegion(CAMPUS_REGION, 450);
    }
  }

  async function handleOpenDirections() {
    if (!selectedPoi) return;
    const res = await fetchRouteForMode(selectedPoi, travelMode, originPoiId);
    if (res && res.coords.length > 0) {
      setNavStage("route_overview");
      fitActiveRoute(res.coords);
    }
  }

  async function handleStartLiveNavigation() {
    if (!selectedPoi) return;

    let active =
      routeCoords.length >= 2 && routeMeta
        ? { coords: routeCoords, steps: routeSteps, meta: routeMeta }
        : null;

    if (!active) {
      active = await fetchRouteForMode(selectedPoi, travelMode, originPoiId);
    }
    if (!active || active.coords.length < 2) return;

    setNavStage("live_navigation");
    liveNav.startSession(
      active.coords,
      active.steps,
      active.meta.distanceMeters,
      active.meta.durationSeconds
    );
  }

  function handleSelectTravelMode(nextMode: TravelMode) {
    if (nextMode === travelMode && routeCoords.length > 0) return;
    setTravelMode(nextMode);
    if (selectedPoi) {
      fetchRouteForMode(selectedPoi, nextMode, originPoiId).then((res) => {
        if (res && res.coords.length > 0 && navStage === "route_overview") {
          fitActiveRoute(res.coords);
        }
      });
    }
  }

  function handleSelectOrigin(nextOriginId: number | "gps") {
    setOriginPoiId(nextOriginId);
    routeCacheEntryRef.current = null;
    if (selectedPoi) {
      fetchRouteForMode(selectedPoi, travelMode, nextOriginId, {
        silent: navStage === "place_details"
      }).then((res) => {
        if (res && res.coords.length > 0 && navStage === "route_overview") {
          fitActiveRoute(res.coords);
        }
      });
    }
  }

  function handleExitLiveNav() {
    liveNav.stopAll();
    setNavStage("route_overview");
    mapRef.current?.animateCamera({ pitch: 0, heading: 0 }, { duration: 400 });
    fitActiveRoute(routeCoords);
  }

  async function handleManualRefresh() {
    try {
      await refreshCampus(true);
    } catch {
      Alert.alert("Refresh failed", "Check the API connection and try again.");
    }
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "Sign out of Bowen Navigator?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() }
    ]);
  }

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={CAMPUS_REGION}
        showsUserLocation={navStage !== "live_navigation"}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        customMapStyle={customMapStyle}
        onMapReady={initializeLocation}
        onRegionChangeComplete={(region) => setMapRegion(region)}
      >
        <CampusTracksLayer
          drivewayPolylines={drivewayPolylines}
          standaloneWalkwayPolylines={standaloneWalkwayPolylines}
        />

        {(navStage === "route_overview" || navStage === "live_navigation") && routeCoords.length > 1 && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeColor={travelMode === "driving" ? "rgba(154, 52, 18, 0.85)" : "rgba(30, 58, 138, 0.85)"}
              strokeWidth={9}
              lineCap="round"
              lineJoin="round"
              zIndex={10}
            />
            <Polyline
              coordinates={routeCoords}
              strokeColor={travelMode === "driving" ? colors.warning : "#2563EB"}
              strokeWidth={5.5}
              lineDashPattern={travelMode === "walking" && navStage !== "live_navigation" ? [2, 8] : undefined}
              lineCap="round"
              lineJoin="round"
              zIndex={11}
            />
          </>
        )}

        {navStage === "route_overview" && routeMidpoint && routeMeta?.durationBadgeUri && (
          <Marker
            key={`route-callout-${routeMeta.mode}-${routeMeta.durationText}`}
            coordinate={routeMidpoint}
            anchor={{ x: 0.5, y: 0.5 }}
            image={{ uri: routeMeta.durationBadgeUri }}
            tracksViewChanges={false}
            zIndex={30}
            onPress={() => fitActiveRoute(routeCoords)}
          />
        )}

        {navStage === "live_navigation" && liveNav.navLocation && (
          <Marker
            key={`live-nav-puck-${travelMode}`}
            coordinate={liveNav.navLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={liveNav.navBearing}
            flat
            zIndex={40}
          >
            {/* Dynamic import avoided for perf */}
            <NavPuckWrapper mode={travelMode} />
          </Marker>
        )}

        <CampusPoisLayer
          declutteredPois={declutteredPois}
          selectedPoiId={selectedPoi?.id}
          isDestinationActive={isNavActive}
          tracksViewChanges={tracksViewChanges}
          onSelectPoi={openPoi}
        />
      </MapView>

      {/* STAGE 1 & BROWSE TOP SEARCH + CATEGORIES */}
      {(navStage === "browse" || navStage === "place_details") && (
        <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
          <View style={[styles.topBar, shadows.card]}>
            <Pressable style={styles.searchButton} onPress={() => router.push("/(app)/search")}>
              <Search size={20} color={colors.muted} />
              <Text style={styles.searchText}>Search Bowen campus</Text>
            </Pressable>
            <Pressable style={styles.iconButton} onPress={handleManualRefresh}>
              <RefreshCw size={18} color={colors.primary} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={showMyLocation}>
              <LocateFixed size={18} color={colors.primary} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={confirmSignOut}>
              <LogOut size={18} color={colors.muted} />
            </Pressable>
          </View>

          {navStage === "browse" && (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
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
                    style={[
                      styles.chip,
                      selectedCategory === category.slug && styles.chipActive,
                      { borderColor: category.color }
                    ]}
                  >
                    <Text style={[styles.chipText, selectedCategory === category.slug && styles.chipTextActive]}>
                      {category.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View pointerEvents="none" style={styles.legendRow}>
                <View style={[styles.legendBadge, shadows.card]}>
                  <View style={styles.legendItem}>
                    <View style={styles.legendDrivewaySample}>
                      <View style={styles.legendDrivewayInner} />
                    </View>
                    <Text style={styles.legendText}>Driveway</Text>
                  </View>
                  <View style={styles.legendDivider} />
                  <View style={styles.legendItem}>
                    <View style={styles.legendWalkwaySample}>
                      <View style={styles.legendWalkwayDash} />
                      <View style={styles.legendWalkwayDash} />
                      <View style={styles.legendWalkwayDash} />
                    </View>
                    <Text style={styles.legendText}>Walkway (Off-road)</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </SafeAreaView>
      )}

      {/* STAGE 2 TOP CARD */}
      {navStage === "route_overview" && selectedPoi && (
        <RouteOverviewHeader
          selectedPoi={selectedPoi}
          originLabel={currentOriginLabel}
          onOpenOriginPicker={() => setOriginPickerVisible(true)}
          onClearRoute={clearRoute}
        />
      )}

      {/* STAGE 3 LIVE HUD */}
      {navStage === "live_navigation" && selectedPoi && (
        <LiveNavigationHud
          currentStep={liveNav.currentStep}
          nextStep={liveNav.nextStep}
          distToNextManeuver={liveNav.distToNextManeuver}
          remainingDistanceMeters={liveNav.remainingDistanceMeters}
          remainingDurationSeconds={liveNav.remainingDurationSeconds}
          navSpeedKmh={liveNav.navSpeedKmh}
          isSimulating={liveNav.isSimulating}
          isMuted={liveNav.isMuted}
          hasArrived={liveNav.hasArrived}
          isRerouting={liveNav.isRerouting}
          destinationName={selectedPoi.name}
          onToggleSimulation={liveNav.toggleSimulation}
          onToggleMute={liveNav.toggleMute}
          onRecenter={liveNav.recenterCamera}
          onExit={handleExitLiveNav}
        />
      )}

      {loading && pois.length === 0 && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* STAGE 2 BOTTOM SHEET */}
      {navStage === "route_overview" && selectedPoi && (
        <RouteOverviewSheet
          travelMode={travelMode}
          routing={routing}
          routeDurationText={routeMeta?.durationText}
          routeDistanceText={routeMeta?.distanceText}
          originLabel={routeMeta?.originLabel || currentOriginLabel}
          alternateModes={routeMeta?.alternateModes}
          routeSteps={routeSteps}
          showSteps={showSteps}
          panY={panY}
          panHandlers={panResponder.panHandlers}
          onLayoutHeight={(h) => {
            sheetHeight.current = h;
          }}
          onSelectTravelMode={handleSelectTravelMode}
          onToggleSteps={() => setShowSteps((prev) => !prev)}
          onStartLiveNavigation={handleStartLiveNavigation}
          onClearRoute={clearRoute}
        />
      )}

      {/* STAGE 1 PLACE DETAILS SHEET */}
      {navStage === "place_details" && selectedPoi && (
        <PlaceDetailsSheet
          selectedPoi={selectedPoi}
          placeDetails={placeDetails}
          fetchingDetails={fetchingDetails}
          routing={routing}
          originLabel={currentOriginLabel}
          originChoices={originChoices}
          originPoiId={originPoiId}
          accessToken={accessToken}
          panY={panY}
          panHandlers={panResponder.panHandlers}
          onLayoutHeight={(h) => {
            sheetHeight.current = h;
          }}
          onSelectOrigin={handleSelectOrigin}
          onOpenAllOrigins={() => setOriginPickerVisible(true)}
          onOpenDirections={handleOpenDirections}
          onStartLiveNavigation={handleStartLiveNavigation}
          onClose={closePoiSheet}
        />
      )}

      <OriginPickerModal
        visible={originPickerVisible}
        originChoices={originChoices}
        selectedOriginId={originPoiId}
        onSelectOrigin={handleSelectOrigin}
        onClose={() => setOriginPickerVisible(false)}
      />
    </View>
  );
}

const NavPuckWrapper = React.memo(function NavPuckWrapper({ mode }: { mode: TravelMode }) {
  return <NavigationVehiclePuck mode={mode} />;
});

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
    gap: 8,
    marginHorizontal: 14,
    marginTop: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  searchButton: {
    flex: 1,
    height: 42,
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
    width: 40,
    height: 42,
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
    height: 34,
    justifyContent: "center"
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 13
  },
  chipTextActive: {
    color: "#FFFFFF"
  },
  legendRow: {
    paddingHorizontal: 14,
    paddingTop: 8,
    alignItems: "flex-start"
  },
  legendBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  legendDrivewaySample: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#64748B",
    alignItems: "center",
    justifyContent: "center"
  },
  legendDrivewayInner: {
    width: 18,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: "#E2E8F0"
  },
  legendDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.line
  },
  legendWalkwaySample: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5
  },
  legendWalkwayDash: {
    width: 5,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#0D9488"
  },
  legendText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800"
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
  }
});
