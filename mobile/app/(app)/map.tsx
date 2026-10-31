import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import {
  Car,
  ChevronDown,
  ChevronUp,
  Compass,
  CornerUpRight,
  Footprints,
  ListOrdered,
  LocateFixed,
  LogOut,
  Navigation,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from "lucide-react-native";
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
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { featureToPoi, getCategories, getPlaceDetails, getPois, getTracks, requestDirections } from "@/api";
import { useAuth } from "@/auth";
import { ManeuverIcon } from "@/components/ManeuverIcon";
import { MarkerBadge } from "@/components/MarkerBadge";
import { NavigationVehiclePuck } from "@/components/NavigationVehiclePuck";
import { customMapStyle } from "@/mapStyle";
import {
  bearingDegrees,
  calculateRemainingRouteDistance,
  Coordinate,
  findNearestPointOnRoute,
  formatDistance,
  formatDuration,
  formatETA,
  haversineMeters
} from "@/navigationUtils";
import { colors, shadows } from "@/theme";
import type {
  Category,
  GeoFeatureCollection,
  PathwayType,
  Poi,
  PoiProperties,
  RouteStep,
  TrackProperties,
  TravelMode
} from "@/types";

const CAMPUS_REGION: Region = {
  latitude: 7.6215,
  longitude: 4.199,
  latitudeDelta: 0.013,
  longitudeDelta: 0.016
};

const MAIN_GATE_COORDS = {
  latitude: 7.621044,
  longitude: 4.190647
};

const MAJOR_LANDMARK_NAMES = new Set([
  "main gate",
  "tito gate",
  "senate building",
  "timothy olagbenro library",
  "bowen worship centre",
  "bowen university hospital",
  "new horizon",
  "college of computing and communication studies",
  "college of law",
  "college of health sciences",
  "bowen university digital center",
  "gamaliel onosode hall",
  "sports complex",
  "christoy cafe",
  "blessed cafe"
]);

function getPoiPriority(poi: Poi): number {
  const lower = poi.name.toLowerCase().trim();
  if (MAJOR_LANDMARK_NAMES.has(lower)) return 100;
  const cat = poi.category?.slug?.toLowerCase() || "";
  if (cat === "academic" || cat === "administrative" || cat === "health" || cat === "transport") {
    return 70;
  }
  return 50;
}

function isCoordinateOnCampus(lat: number, lon: number): boolean {
  return Math.abs(lat - CAMPUS_REGION.latitude) < 0.03 && Math.abs(lon - CAMPUS_REGION.longitude) < 0.03;
}

type PlanarSegment = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  dx: number;
  dy: number;
  len: number;
};

const METERS_PER_LAT = 111132.92;
const METERS_PER_LON = 110430.0;

function toCampusXY(coord: Coordinate): { x: number; y: number } {
  return {
    x: (coord.longitude - CAMPUS_REGION.longitude) * METERS_PER_LON,
    y: (coord.latitude - CAMPUS_REGION.latitude) * METERS_PER_LAT
  };
}

function pointToSegmentDistAndCos(
  px: number,
  py: number,
  wx: number,
  wy: number,
  wLen: number,
  seg: PlanarSegment
): { dist: number; absCos: number } {
  const lenSq = seg.len * seg.len;
  let t = 0;
  if (lenSq > 1e-9) {
    t = ((px - seg.ax) * seg.dx + (py - seg.ay) * seg.dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const projX = seg.ax + t * seg.dx;
  const projY = seg.ay + t * seg.dy;
  const dist = Math.hypot(px - projX, py - projY);
  const absCos =
    wLen > 0.1 && seg.len > 0.1 ? Math.abs((wx * seg.dx + wy * seg.dy) / (wLen * seg.len)) : 1.0;
  return { dist, absCos };
}

function filterStandaloneWalkwayPolylines(
  coords: Coordinate[],
  drivewaySegments: PlanarSegment[]
): Coordinate[][] {
  if (coords.length < 2) return [];
  if (drivewaySegments.length === 0) return [coords];

  const standaloneChains: Coordinate[][] = [];
  let currentChain: Coordinate[] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const a = toCampusXY(p1);
    const b = toCampusXY(p2);
    const wx = b.x - a.x;
    const wy = b.y - a.y;
    const wLen = Math.hypot(wx, wy);
    if (wLen < 0.2) continue;

    const q20x = a.x + 0.2 * wx;
    const q20y = a.y + 0.2 * wy;
    const midX = a.x + 0.5 * wx;
    const midY = a.y + 0.5 * wy;
    const q80x = a.x + 0.8 * wx;
    const q80y = a.y + 0.8 * wy;

    let minMidDist = Infinity;
    let bestMidCos = 0;
    let min20Dist = Infinity;
    let min80Dist = Infinity;

    for (let j = 0; j < drivewaySegments.length; j++) {
      const dSeg = drivewaySegments[j];
      const midCheck = pointToSegmentDistAndCos(midX, midY, wx, wy, wLen, dSeg);
      if (midCheck.dist < minMidDist) {
        minMidDist = midCheck.dist;
        bestMidCos = midCheck.absCos;
      }
      const d20 = pointToSegmentDistAndCos(q20x, q20y, wx, wy, wLen, dSeg).dist;
      if (d20 < min20Dist) min20Dist = d20;
      const d80 = pointToSegmentDistAndCos(q80x, q80y, wx, wy, wLen, dSeg).dist;
      if (d80 < min80Dist) min80Dist = d80;
    }

    const isParallelSidewalk =
      (minMidDist <= 15.0 && bestMidCos >= 0.82) ||
      (minMidDist <= 12.0 && min20Dist <= 12.0 && min80Dist <= 12.0);

    if (!isParallelSidewalk) {
      if (currentChain.length === 0) {
        currentChain.push(p1, p2);
      } else {
        currentChain.push(p2);
      }
    } else if (currentChain.length >= 2) {
      standaloneChains.push(currentChain);
      currentChain = [];
    } else {
      currentChain = [];
    }
  }

  if (currentChain.length >= 2) {
    standaloneChains.push(currentChain);
  }

  return standaloneChains;
}

type ScreenBox = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

function boxesOverlap(a: ScreenBox, b: ScreenBox): boolean {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

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
};

type NavStage = "browse" | "place_details" | "route_overview" | "live_navigation";

export default function MapScreen() {
  const params = useLocalSearchParams<{ poi?: string; t?: string }>();
  const { signOut } = useAuth();
  const mapRef = useRef<MapView>(null);

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pois, setPois] = useState<Poi[]>([]);
  const [tracks, setTracks] = useState<GeoFeatureCollection<TrackProperties> | undefined>();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedPoi, setSelectedPoi] = useState<Poi | undefined>();
  const [originPoiId, setOriginPoiId] = useState<number | "gps">("gps");
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

  // 3-Stage Navigation State Machine
  const [navStage, setNavStage] = useState<NavStage>("browse");

  // Live Navigation State
  const [navLocation, setNavLocation] = useState<Coordinate | null>(null);
  const [navBearing, setNavBearing] = useState<number>(0);
  const [navSpeedKmh, setNavSpeedKmh] = useState<number>(0);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [remainingDistanceMeters, setRemainingDistanceMeters] = useState<number>(0);
  const [remainingDurationSeconds, setRemainingDurationSeconds] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const simulationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  const panY = useRef(new Animated.Value(0)).current;
  const panValue = useRef(0);
  const sheetHeight = useRef(0);
  const isMinimized = useRef(false);

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

  const declutteredPois = useMemo(() => {
    const latDelta = Math.max(0.0012, mapRegion.latitudeDelta || CAMPUS_REGION.latitudeDelta);
    const lngDelta = Math.max(0.0012, mapRegion.longitudeDelta || CAMPUS_REGION.longitudeDelta);

    const isNavActive = navStage === "route_overview" || navStage === "live_navigation";
    const scaleFactor = isNavActive ? 1.35 : 1.0;

    const fullLeftLon = lngDelta * 0.042 * scaleFactor;
    const fullRightLon = lngDelta * 0.24 * scaleFactor;
    const fullHalfLat = latDelta * 0.033 * scaleFactor;

    const dotHalfLon = lngDelta * 0.036;
    const dotHalfLat = latDelta * 0.025;

    const sorted = [...filteredPois].sort((a, b) => {
      const aForced = a.id === selectedPoi?.id || a.id === originPoiId ? 1 : 0;
      const bForced = b.id === selectedPoi?.id || b.id === originPoiId ? 1 : 0;
      if (aForced !== bForced) return bForced - aForced;
      const prioDiff = getPoiPriority(b) - getPoiPriority(a);
      if (prioDiff !== 0) return prioDiff;
      return a.id - b.id;
    });

    const placedBoxes: ScreenBox[] = [];
    const results: { poi: Poi; displayMode: "full" | "compact" }[] = [];

    for (const poi of sorted) {
      const isForced = poi.id === selectedPoi?.id || poi.id === originPoiId;

      const fullBox: ScreenBox = {
        minLon: poi.longitude - fullLeftLon,
        maxLon: poi.longitude + fullRightLon,
        minLat: poi.latitude - fullHalfLat,
        maxLat: poi.latitude + fullHalfLat
      };

      const dotBox: ScreenBox = {
        minLon: poi.longitude - dotHalfLon,
        maxLon: poi.longitude + dotHalfLon,
        minLat: poi.latitude - dotHalfLat,
        maxLat: poi.latitude + dotHalfLat
      };

      if (isForced) {
        placedBoxes.push(fullBox);
        results.push({ poi, displayMode: "full" });
        continue;
      }

      const allowFullLabel = !isNavActive || getPoiPriority(poi) >= 100;
      const overlapsFull = placedBoxes.some((box) => boxesOverlap(fullBox, box));

      if (allowFullLabel && !overlapsFull) {
        placedBoxes.push(fullBox);
        results.push({ poi, displayMode: "full" });
        continue;
      }

      const overlapsDot = placedBoxes.some((box) => boxesOverlap(dotBox, box));
      if (!overlapsDot && latDelta <= 0.014) {
        placedBoxes.push(dotBox);
        results.push({ poi, displayMode: "compact" });
      }
    }

    return results;
  }, [
    filteredPois,
    mapRegion.latitudeDelta,
    mapRegion.longitudeDelta,
    selectedPoi?.id,
    originPoiId,
    navStage
  ]);

  const originChoices = useMemo(() => {
    if (!selectedPoi) return [];
    const others = pois.filter((p) => p.id !== selectedPoi.id);
    return [...others].sort((a, b) => {
      const aGate = a.name.toLowerCase().includes("gate") ? -1 : 0;
      const bGate = b.name.toLowerCase().includes("gate") ? -1 : 0;
      return aGate - bGate;
    });
  }, [pois, selectedPoi]);

  const routeMidpoint = useMemo<Coordinate | null>(() => {
    if (routeCoords.length < 2) return null;
    const midIdx = Math.floor(routeCoords.length / 2);
    return routeCoords[midIdx];
  }, [routeCoords]);

  const fitActiveRoute = useCallback((coords: Coordinate[]) => {
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 148, right: 52, bottom: 220, left: 52 },
        animated: true
      });
    }
  }, []);

  const openPoi = useCallback(
    async (poi: Poi) => {
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

      if (poi.google_place_id) {
        setFetchingDetails(true);
        try {
          const details = await getPlaceDetails(poi.google_place_id);
          if (details.result) {
            setPlaceDetails(details.result);
          }
        } catch {
          // Optional place details fallback
        } finally {
          setFetchingDetails(false);
        }
      }
    },
    [panY]
  );

  const closePoiSheet = useCallback(() => {
    setSelectedPoi(undefined);
    setNavStage("browse");
    setPlaceDetails(null);
    setRouteCoords([]);
    setRouteSteps([]);
    setRouteMeta(null);
    setShowSteps(false);
    setIsSimulating(false);
    if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    if (locationSubRef.current) locationSubRef.current.remove();
    panY.setValue(0);
    panValue.current = 0;
    isMinimized.current = false;
  }, [panY]);

  const clearRoute = useCallback(() => {
    setRouteCoords([]);
    setRouteSteps([]);
    setRouteMeta(null);
    setShowSteps(false);
    setIsSimulating(false);
    if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    if (locationSubRef.current) locationSubRef.current.remove();
    setNavStage(selectedPoi ? "place_details" : "browse");
    panY.setValue(0);
    panValue.current = 0;
    isMinimized.current = false;
  }, [panY, selectedPoi]);

  const loadCampus = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryData, poiData, trackData] = await Promise.all([getCategories(), getPois(), getTracks()]);
      const mappedPois = (poiData?.features || []).map((feature) =>
        featureToPoi(feature as { id?: number; geometry: { coordinates: number[] }; properties: PoiProperties })
      );
      setCategories(categoryData || []);
      setPois(mappedPois);
      setTracks(trackData);
    } catch {
      Alert.alert("Campus data unavailable", "Check the API connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampus();
  }, [loadCampus]);

  useEffect(() => {
    if (params.poi && pois.length > 0) {
      const match = pois.find((item) => String(item.id) === String(params.poi));
      if (match) {
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
      if (permission.status === "granted") {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

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
          mapRef.current?.animateToRegion(nextRegion, 1000);
        }
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

  const fetchRouteForMode = useCallback(
    async (poi: Poi, modeToUse: TravelMode, customOriginId: number | "gps" = originPoiId) => {
      setRouting(true);
      try {
        let originCoords: Coordinate = MAIN_GATE_COORDS;
        let originLabel = "Main Gate";

        const chosenOriginPoi =
          customOriginId !== "gps" ? pois.find((item) => item.id === customOriginId) : undefined;

        if (chosenOriginPoi && chosenOriginPoi.id !== poi.id) {
          originCoords = {
            latitude: chosenOriginPoi.latitude,
            longitude: chosenOriginPoi.longitude
          };
          originLabel = chosenOriginPoi.name;
        } else {
          try {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status === "granted") {
              const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              if (isCoordinateOnCampus(current.coords.latitude, current.coords.longitude)) {
                originCoords = {
                  latitude: current.coords.latitude,
                  longitude: current.coords.longitude
                };
                originLabel = "Your location";
              } else {
                const gatePoi = pois.find((p) => p.name.toLowerCase().includes("gate") && p.id !== poi.id);
                if (gatePoi) {
                  originCoords = { latitude: gatePoi.latitude, longitude: gatePoi.longitude };
                  originLabel = gatePoi.name;
                } else {
                  const fallbackOrigin = pois.find((p) => p.id !== poi.id);
                  if (fallbackOrigin) {
                    originCoords = { latitude: fallbackOrigin.latitude, longitude: fallbackOrigin.longitude };
                    originLabel = fallbackOrigin.name;
                  }
                }
              }
            }
          } catch {
            // Keep Main Gate fallback if GPS fails
          }
        }

        const result = await requestDirections({
          origin: originCoords,
          destination: {
            latitude: poi.latitude,
            longitude: poi.longitude
          },
          mode: modeToUse
        });

        let decoded: Coordinate[] = [];
        if (typeof result.overview_polyline === "string" && result.overview_polyline.length > 0) {
          decoded = polyline
            .decode(result.overview_polyline)
            .map(([latitude, longitude]) => ({ latitude, longitude }));
        } else if (Array.isArray(result.overview_polyline)) {
          decoded = result.overview_polyline;
        } else if ((result.overview_polyline as any)?.points) {
          decoded = polyline
            .decode((result.overview_polyline as any).points)
            .map(([latitude, longitude]) => ({ latitude, longitude }));
        }

        const distMeters = result.distance_meters ?? 0;
        const durSecs = result.duration_seconds ?? 0;

        setRouteCoords(decoded);
        setRouteSteps(result.steps || []);
        setShowSteps(false);
        setRemainingDistanceMeters(distMeters);
        setRemainingDurationSeconds(durSecs);

        panY.setValue(0);
        panValue.current = 0;
        isMinimized.current = false;

        const meta: RouteMeta = {
          distanceMeters: distMeters,
          durationSeconds: durSecs,
          distanceText: result.distance_text,
          durationText: result.duration_text,
          durationBadgeUri: result.duration_badge_uri,
          summary: result.summary,
          mode: result.mode || modeToUse,
          originLabel,
          originCoords
        };
        setRouteMeta(meta);

        return { decoded, steps: result.steps || [], meta };
      } catch {
        Alert.alert("Directions unavailable", "The route could not be generated right now.");
        return null;
      } finally {
        setRouting(false);
      }
    },
    [originPoiId, pois, panY]
  );

  // Stage 1 -> Stage 2: Tapping "Directions" in Place Details
  async function handleOpenDirections() {
    if (!selectedPoi) return;
    const res = await fetchRouteForMode(selectedPoi, travelMode, originPoiId);
    if (res && res.decoded.length > 0) {
      setNavStage("route_overview");
      fitActiveRoute(res.decoded);
    }
  }

  // Stage 1 or Stage 2 -> Stage 3: Tapping "Start"
  async function handleStartLiveNavigation() {
    if (!selectedPoi) return;

    let coords = routeCoords;
    let steps = routeSteps;
    let meta = routeMeta;

    if (coords.length < 2) {
      const res = await fetchRouteForMode(selectedPoi, travelMode, originPoiId);
      if (!res || res.decoded.length < 2) return;
      coords = res.decoded;
      steps = res.steps;
      meta = res.meta;
    }

    setNavStage("live_navigation");
    setCurrentStepIdx(0);

    const initialPoint = coords[0];
    const initialBearing = coords.length > 1 ? bearingDegrees(coords[0], coords[1]) : 0;
    setNavLocation(initialPoint);
    setNavBearing(initialBearing);
    setNavSpeedKmh(0);

    if (meta?.distanceMeters) {
      setRemainingDistanceMeters(meta.distanceMeters);
    }
    if (meta?.durationSeconds) {
      setRemainingDurationSeconds(meta.durationSeconds);
    }

    // Tilt camera to 3D perspective pitch (45°) and zoom into user puck
    mapRef.current?.animateCamera(
      {
        center: initialPoint,
        heading: initialBearing,
        pitch: 45,
        zoom: 18.5
      },
      { duration: 800 }
    );
  }

  function handleSelectTravelMode(nextMode: TravelMode) {
    if (nextMode === travelMode && routeCoords.length > 0) return;
    setTravelMode(nextMode);
    if (selectedPoi) {
      fetchRouteForMode(selectedPoi, nextMode, originPoiId).then((res) => {
        if (res && res.decoded.length > 0) {
          fitActiveRoute(res.decoded);
        }
      });
    }
  }

  function handleSelectOrigin(nextOriginId: number | "gps") {
    setOriginPoiId(nextOriginId);
    if (selectedPoi && (navStage === "route_overview" || routeCoords.length > 0)) {
      fetchRouteForMode(selectedPoi, travelMode, nextOriginId).then((res) => {
        if (res && res.decoded.length > 0) {
          fitActiveRoute(res.decoded);
        }
      });
    }
  }

  // -------------------------------------------------------------
  // Real-time GPS & Off-Campus Demo Simulation Engine
  // -------------------------------------------------------------
  const simStepProgressRef = useRef<{ index: number; fraction: number }>({ index: 0, fraction: 0 });

  function stopSimulation() {
    setIsSimulating(false);
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setNavSpeedKmh(0);
  }

  function toggleSimulation() {
    if (isSimulating) {
      stopSimulation();
    } else {
      startSimulation();
    }
  }

  function startSimulation() {
    if (routeCoords.length < 2) return;
    setIsSimulating(true);

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
    }

    simStepProgressRef.current = { index: 0, fraction: 0 };
    const isDriving = travelMode === "driving";
    const speedKmh = isDriving ? 26 : 5;
    setNavSpeedKmh(speedKmh);

    // Meters to advance per tick (tick = 500ms)
    // Driving: 26 km/h ~ 7.2 m/s -> 3.6m per tick
    // Walking: 5 km/h ~ 1.4 m/s -> 0.7m per tick
    const metersPerTick = isDriving ? 4.2 : 1.2;

    simulationTimerRef.current = setInterval(() => {
      let { index, fraction } = simStepProgressRef.current;

      if (index >= routeCoords.length - 1) {
        stopSimulation();
        Alert.alert("Arrived!", `You have reached ${selectedPoi?.name || "your destination"}.`);
        return;
      }

      const p1 = routeCoords[index];
      const p2 = routeCoords[index + 1];
      const segLen = haversineMeters(p1, p2);

      fraction += segLen > 0.1 ? metersPerTick / segLen : 1;

      while (fraction >= 1 && index < routeCoords.length - 1) {
        fraction -= 1;
        index += 1;
      }

      if (index >= routeCoords.length - 1) {
        stopSimulation();
        Alert.alert("Arrived!", `You have reached ${selectedPoi?.name || "your destination"}.`);
        return;
      }

      simStepProgressRef.current = { index, fraction };

      const curP1 = routeCoords[index];
      const curP2 = routeCoords[index + 1];
      const curLat = curP1.latitude + (curP2.latitude - curP1.latitude) * fraction;
      const curLon = curP1.longitude + (curP2.longitude - curP1.longitude) * fraction;
      const currentPos: Coordinate = { latitude: curLat, longitude: curLon };
      const currentBrng = bearingDegrees(curP1, curP2);

      setNavLocation(currentPos);
      setNavBearing(currentBrng);

      // Recalculate remaining distance and duration
      const remainingDist = calculateRemainingRouteDistance(index, currentPos, routeCoords);
      const speedMps = isDriving ? 7.2 : 1.38;
      const remainingSecs = Math.max(0, Math.round(remainingDist / speedMps));

      setRemainingDistanceMeters(remainingDist);
      setRemainingDurationSeconds(remainingSecs);

      // Advance route steps if close to current step's end location
      setCurrentStepIdx((prevIdx) => {
        if (prevIdx < routeSteps.length - 1) {
          const stepEnd = routeSteps[prevIdx]?.end_location;
          if (stepEnd) {
            const distToEnd = haversineMeters(currentPos, stepEnd);
            if (distToEnd < 20) {
              return prevIdx + 1;
            }
          }
        }
        return prevIdx;
      });

      // Smoothly update camera
      mapRef.current?.animateCamera(
        {
          center: currentPos,
          heading: currentBrng,
          pitch: 45,
          zoom: 18.5
        },
        { duration: 480 }
      );
    }, 500);
  }

  // Live GPS Tracking when on campus
  useEffect(() => {
    if (navStage !== "live_navigation" || isSimulating) {
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
      return;
    }

    let isMounted = true;

    async function subscribeGps() {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") return;

        locationSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 1.5
          },
          (loc) => {
            if (!isMounted) return;
            const userCoord: Coordinate = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude
            };

            if (isCoordinateOnCampus(userCoord.latitude, userCoord.longitude) && routeCoords.length > 1) {
              const snap = findNearestPointOnRoute(userCoord, routeCoords);
              if (snap) {
                setNavLocation(snap.projected);
                const speedKmh = Math.max(0, Math.round((loc.coords.speed || 0) * 3.6));
                setNavSpeedKmh(speedKmh);

                const brng =
                  loc.coords.heading && loc.coords.heading >= 0
                    ? loc.coords.heading
                    : snap.bearing;
                setNavBearing(brng);

                const remDist = calculateRemainingRouteDistance(snap.segIndex, snap.projected, routeCoords);
                const isDriving = travelMode === "driving";
                const speedMps = speedKmh > 1 ? speedKmh / 3.6 : isDriving ? 7.2 : 1.38;
                const remSecs = Math.max(0, Math.round(remDist / speedMps));

                setRemainingDistanceMeters(remDist);
                setRemainingDurationSeconds(remSecs);

                // Advance step if close
                setCurrentStepIdx((prevIdx) => {
                  if (prevIdx < routeSteps.length - 1) {
                    const stepEnd = routeSteps[prevIdx]?.end_location;
                    if (stepEnd && haversineMeters(snap.projected, stepEnd) < 20) {
                      return prevIdx + 1;
                    }
                  }
                  return prevIdx;
                });

                mapRef.current?.animateCamera(
                  {
                    center: snap.projected,
                    heading: brng,
                    pitch: 45,
                    zoom: 18.5
                  },
                  { duration: 800 }
                );
              }
            }
          }
        );
      } catch {
        // Location tracking error fallback
      }
    }

    subscribeGps();

    return () => {
      isMounted = false;
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
    };
  }, [navStage, isSimulating, routeCoords, routeSteps, travelMode]);

  // Recenter Camera in Live Navigation
  function handleRecenterLiveNav() {
    if (navLocation) {
      mapRef.current?.animateCamera(
        {
          center: navLocation,
          heading: navBearing,
          pitch: 45,
          zoom: 18.5
        },
        { duration: 500 }
      );
    }
  }

  // Exit Live Navigation -> returns to route overview
  function handleExitLiveNav() {
    stopSimulation();
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    setNavStage("route_overview");
    mapRef.current?.animateCamera(
      {
        pitch: 0,
        heading: 0
      },
      { duration: 400 }
    );
    fitActiveRoute(routeCoords);
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "Sign out of Bowen Navigator?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() }
    ]);
  }

  const { drivewayPolylines, standaloneWalkwayPolylines } = useMemo(() => {
    if (!tracks?.features) {
      return {
        drivewayPolylines: [] as { id: string; coords: Coordinate[] }[],
        standaloneWalkwayPolylines: [] as { id: string; coords: Coordinate[] }[]
      };
    }

    const driveways: { id: string; coords: Coordinate[] }[] = [];
    const rawWalkways: { id: string; coords: Coordinate[] }[] = [];
    const drivewaySegments: PlanarSegment[] = [];

    tracks.features.forEach((feature, idx) => {
      const coords = (feature.geometry.coordinates as number[][]).map(([longitude, latitude]) => ({
        latitude,
        longitude
      }));
      if (coords.length < 2) return;

      const trackType: PathwayType = feature.properties?.track_type || "pedestrian";
      const trackId = String(feature.id ?? feature.properties?.id ?? idx);

      if (trackType === "vehicle" || trackType === "both") {
        driveways.push({ id: `drive-${trackId}`, coords });
        for (let i = 0; i < coords.length - 1; i++) {
          const a = toCampusXY(coords[i]);
          const b = toCampusXY(coords[i + 1]);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy);
          if (len > 0.2) {
            drivewaySegments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, dx, dy, len });
          }
        }
      } else {
        rawWalkways.push({ id: `walk-${trackId}`, coords });
      }
    });

    const standaloneWalkways: { id: string; coords: Coordinate[] }[] = [];
    rawWalkways.forEach((walkway) => {
      const subChains = filterStandaloneWalkwayPolylines(walkway.coords, drivewaySegments);
      subChains.forEach((chain, subIdx) => {
        if (chain.length >= 2) {
          standaloneWalkways.push({
            id: `${walkway.id}-seg-${subIdx}`,
            coords: chain
          });
        }
      });
    });

    return {
      drivewayPolylines: driveways,
      standaloneWalkwayPolylines: standaloneWalkways
    };
  }, [tracks]);

  // Current and Next Maneuver Steps for Live Navigation Banner
  const currentStep = routeSteps[currentStepIdx] || routeSteps[0];
  const nextStep = routeSteps[currentStepIdx + 1];

  const distToNextManeuver = useMemo(() => {
    if (!navLocation || !currentStep?.end_location) {
      return currentStep?.distance_meters ?? 0;
    }
    return Math.max(0, haversineMeters(navLocation, currentStep.end_location));
  }, [navLocation, currentStep]);

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
        {/* Driveways */}
        {drivewayPolylines.map((drive) => (
          <React.Fragment key={drive.id}>
            <Polyline
              coordinates={drive.coords}
              strokeColor="rgba(71, 85, 105, 0.65)"
              strokeWidth={6}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
            <Polyline
              coordinates={drive.coords}
              strokeColor="rgba(226, 232, 240, 0.92)"
              strokeWidth={3.2}
              lineCap="round"
              lineJoin="round"
              zIndex={2}
            />
          </React.Fragment>
        ))}

        {/* Standalone Walkways */}
        {standaloneWalkwayPolylines.map((walk) => (
          <Polyline
            key={walk.id}
            coordinates={walk.coords}
            strokeColor="#0D9488"
            strokeWidth={3}
            lineDashPattern={[5, 5]}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
          />
        ))}

        {/* Route Polyline (Halo + Solid Core Line) */}
        {routeCoords.length > 1 && (
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
              strokeColor={travelMode === "driving" ? colors.accent : "#2563EB"}
              strokeWidth={5.5}
              lineDashPattern={travelMode === "walking" && navStage !== "live_navigation" ? [2, 8] : undefined}
              lineCap="round"
              lineJoin="round"
              zIndex={11}
            />
          </>
        )}

        {/* Duration Callout Pill on Route Midpoint in Route Overview */}
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

        {/* Live Navigation Directional Puck (Vehicle / Walking Beacon) */}
        {navStage === "live_navigation" && navLocation && (
          <Marker
            key="live-nav-puck"
            coordinate={navLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={navBearing}
            flat
            zIndex={40}
          >
            <NavigationVehiclePuck mode={travelMode} />
          </Marker>
        )}

        {/* Campus POIs with Zoom-aware Decluttering */}
        {declutteredPois.map(({ poi, displayMode }) => {
          const isSelected = selectedPoi?.id === poi.id;
          const isDestination = isSelected && (navStage === "route_overview" || navStage === "live_navigation");

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
                onPress={() => openPoi(poi)}
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
              onPress={() => openPoi(poi)}
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
      </MapView>

      {/* ======================================================== */}
      {/* TOP HEADER OVERLAYS                                       */}
      {/* ======================================================== */}
      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        {/* STAGE 3: LIVE TURN-BY-TURN TOP GREEN MANEUVER BANNER */}
        {navStage === "live_navigation" ? (
          <View style={styles.liveNavTopContainer}>
            {/* Main Dark Green Banner */}
            <View style={[styles.liveNavBanner, shadows.card]}>
              <View style={styles.liveNavBannerMain}>
                <View style={styles.liveNavIconWrapper}>
                  <ManeuverIcon maneuver={currentStep?.maneuver || "straight"} size={36} color="#FFFFFF" />
                </View>
                <View style={styles.liveNavInstructionsColumn}>
                  <Text style={styles.liveNavDistanceHeadline}>
                    {formatDistance(distToNextManeuver)}
                  </Text>
                  <Text numberOfLines={2} style={styles.liveNavRoadName}>
                    {currentStep?.road_name || currentStep?.instruction || "Continue on route"}
                  </Text>
                </View>
              </View>

              {/* Sub-banner: "Then [icon] [next road]" */}
              {nextStep && (
                <View style={styles.liveNavSubBanner}>
                  <Text style={styles.liveNavThenLabel}>Then</Text>
                  <ManeuverIcon maneuver={nextStep.maneuver || "straight"} size={18} color="#FFFFFF" />
                  <Text numberOfLines={1} style={styles.liveNavThenRoad}>
                    {nextStep.road_name || nextStep.instruction}
                  </Text>
                </View>
              )}
            </View>

            {/* Floating Top-Right Controls: Demo Toggle & Mute */}
            <View style={styles.liveNavControlsRow}>
              <Pressable
                onPress={toggleSimulation}
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

              <Pressable
                onPress={() => setIsMuted((prev) => !prev)}
                style={[styles.floatingCircleBtn, shadows.card]}
              >
                {isMuted ? <VolumeX size={18} color={colors.ink} /> : <Volume2 size={18} color={colors.ink} />}
              </Pressable>
            </View>
          </View>
        ) : navStage === "route_overview" && selectedPoi ? (
          /* STAGE 2: ROUTE OVERVIEW TOP ORIGIN -> DESTINATION CARD */
          <View style={[styles.navTopCard, shadows.card]}>
            <View style={styles.navTopRow}>
              <View style={styles.navEndpointsColumn}>
                <View style={styles.navEndpointRow}>
                  <View style={styles.originDotOuter}>
                    <View style={styles.originDotInner} />
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.navOriginScroll}
                  >
                    <Pressable
                      onPress={() => handleSelectOrigin("gps")}
                      style={[styles.navOriginChip, originPoiId === "gps" && styles.navOriginChipActive]}
                    >
                      <Text
                        style={[styles.navOriginChipText, originPoiId === "gps" && styles.navOriginChipTextActive]}
                      >
                        {routeMeta?.originLabel && originPoiId === "gps" ? routeMeta.originLabel : "Your location"}
                      </Text>
                    </Pressable>
                    {originChoices.slice(0, 8).map((item) => {
                      const active = originPoiId === item.id;
                      return (
                        <Pressable
                          key={`nav-orig-${item.id}`}
                          onPress={() => handleSelectOrigin(item.id)}
                          style={[styles.navOriginChip, active && styles.navOriginChipActive]}
                        >
                          <Text style={[styles.navOriginChipText, active && styles.navOriginChipTextActive]}>
                            {item.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.navDivider} />

                <View style={styles.navEndpointRow}>
                  <View style={styles.destPinDot} />
                  <Text numberOfLines={1} style={styles.navDestText}>
                    {selectedPoi.name}
                  </Text>
                </View>
              </View>

              <Pressable onPress={clearRoute} style={styles.navCloseBtn} hitSlop={8}>
                <X size={18} color={colors.ink} />
              </Pressable>
            </View>
          </View>
        ) : (
          /* STAGE 1 & BROWSE: TOP SEARCH BAR + CATEGORIES */
          <>
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
          </>
        )}
      </SafeAreaView>

      {/* Floating Center-Right Compass / Recenter Button in Live Navigation */}
      {navStage === "live_navigation" && (
        <View style={styles.liveNavRightFloating}>
          <Pressable
            onPress={handleRecenterLiveNav}
            style={[styles.floatingCircleBtn, shadows.card]}
          >
            <Compass size={22} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {/* Speedometer Badge in Live Navigation */}
      {navStage === "live_navigation" && (
        <View style={[styles.speedometerContainer, shadows.card]}>
          <Text style={styles.speedometerValue}>{navSpeedKmh}</Text>
          <Text style={styles.speedometerUnit}>km/h</Text>
        </View>
      )}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* ======================================================== */}
      {/* BOTTOM SHEETS                                             */}
      {/* ======================================================== */}

      {/* STAGE 3: LIVE NAVIGATION BOTTOM BAR */}
      {navStage === "live_navigation" && (
        <View style={[styles.liveNavBottomBar, shadows.card]}>
          <Pressable onPress={handleExitLiveNav} style={styles.liveNavExitBtn} hitSlop={8}>
            <X size={20} color={colors.ink} />
          </Pressable>

          <View style={styles.liveNavBottomMetrics}>
            <View style={styles.liveNavDurationRow}>
              <Text style={styles.liveNavDurationHeadline}>
                {formatDuration(remainingDurationSeconds)}
              </Text>
              <Sparkles size={16} color="#15803D" style={{ marginLeft: 6 }} />
            </View>
            <Text style={styles.liveNavSubMetrics}>
              {formatDistance(remainingDistanceMeters)} • {formatETA(remainingDurationSeconds)}
            </Text>
          </View>

          <Pressable onPress={handleRecenterLiveNav} style={styles.liveNavRecenterBtn}>
            <LocateFixed size={20} color={colors.primary} />
          </Pressable>
        </View>
      )}

      {/* STAGE 2: ROUTE OVERVIEW BOTTOM SHEET */}
      {navStage === "route_overview" && selectedPoi && (
        <Animated.View
          style={[styles.sheet, styles.sheetOverview, shadows.card, { transform: [{ translateY: panY }] }]}
          onLayout={(e) => {
            sheetHeight.current = e.nativeEvent.layout.height;
          }}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.sheetHandle} />

            {/* Travel Mode Switcher Tabs (Drive vs Walk) */}
            <View style={styles.gmModeTabRow}>
              <Pressable
                onPress={() => handleSelectTravelMode("walking")}
                style={[styles.gmModeTab, travelMode === "walking" && styles.gmModeTabActiveWalk]}
              >
                <Footprints size={17} color={travelMode === "walking" ? "#1D4ED8" : colors.muted} />
                <Text style={[styles.gmModeTabText, travelMode === "walking" && styles.gmModeTabTextActiveWalk]}>
                  Walk {travelMode === "walking" && routeMeta?.durationText ? `• ${routeMeta.durationText}` : ""}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleSelectTravelMode("driving")}
                style={[styles.gmModeTab, travelMode === "driving" && styles.gmModeTabActiveDrive]}
              >
                <Car size={17} color={travelMode === "driving" ? colors.accent : colors.muted} />
                <Text style={[styles.gmModeTabText, travelMode === "driving" && styles.gmModeTabTextActiveDrive]}>
                  Drive {travelMode === "driving" && routeMeta?.durationText ? `• ${routeMeta.durationText}` : ""}
                </Text>
              </Pressable>

              {routing && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />}
            </View>

            {/* Time + Distance Headline */}
            <View style={styles.gmSummaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gmDurationHeadline}>
                  {routeMeta?.durationText || "Route"}
                  {routeMeta?.distanceText ? (
                    <Text style={styles.gmDistanceInline}> ({routeMeta.distanceText})</Text>
                  ) : null}
                </Text>
                <Text numberOfLines={1} style={styles.gmViaSubtext}>
                  {travelMode === "driving" ? "Fastest route" : "Campus walking route • Mostly flat"}
                  {routeMeta?.originLabel ? ` • From ${routeMeta.originLabel}` : ""}
                </Text>
              </View>
            </View>

            {/* Prominent Action Button Row: [Start] (Primary), [Steps], [Exit] */}
            <View style={styles.gmActionPillRow}>
              <Pressable onPress={handleStartLiveNavigation} style={styles.startNavPill}>
                <Navigation size={17} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={styles.startNavPillText}>Start</Text>
              </Pressable>

              <Pressable onPress={() => setShowSteps((prev) => !prev)} style={styles.gmSecondaryPill}>
                <ListOrdered size={16} color={colors.ink} />
                <Text style={styles.gmSecondaryPillText}>
                  {showSteps ? "Hide" : `Steps (${routeSteps.length})`}
                </Text>
                {showSteps ? <ChevronDown size={14} color={colors.ink} /> : <ChevronUp size={14} color={colors.ink} />}
              </Pressable>

              <Pressable onPress={clearRoute} style={styles.gmSecondaryPill}>
                <X size={15} color={colors.muted} />
                <Text style={styles.gmSecondaryPillText}>Exit</Text>
              </Pressable>
            </View>
          </View>

          {showSteps && routeSteps.length > 0 && (
            <ScrollView style={styles.stepsDrawer} showsVerticalScrollIndicator={false}>
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
      )}

      {/* STAGE 1: PLACE DETAILS BOTTOM SHEET */}
      {navStage === "place_details" && selectedPoi && (
        <Animated.View
          style={[styles.sheet, shadows.card, { transform: [{ translateY: panY }] }]}
          onLayout={(e) => {
            sheetHeight.current = e.nativeEvent.layout.height;
          }}
        >
          <View {...panResponder.panHandlers}>
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
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.poiName}>
                  {selectedPoi.name}
                </Text>
                <Text numberOfLines={1} style={styles.poiMeta}>
                  {selectedPoi.category.name}
                  {fetchingDetails ? (
                    <Text> • Loading...</Text>
                  ) : placeDetails?.rating ? (
                    <Text>
                      {" "}
                      • ⭐ {placeDetails.rating} ({placeDetails.user_ratings_total || 0})
                    </Text>
                  ) : null}
                  {selectedPoi.operating_hours ? ` • ${selectedPoi.operating_hours}` : ""}
                </Text>
              </View>
              <Pressable onPress={closePoiSheet} style={styles.closeButton} hitSlop={8}>
                <X size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>

          <Text numberOfLines={2} style={styles.descriptionCompact}>
            {selectedPoi.description || "Bowen University Campus Location."}
          </Text>

          {/* Start-From Selector */}
          <View style={styles.originInlineRow}>
            <Text style={styles.originInlineLabel}>Start from:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.originChipRow}
            >
              <Pressable
                onPress={() => handleSelectOrigin("gps")}
                style={[styles.originChip, originPoiId === "gps" && styles.originChipActive]}
              >
                <Text style={[styles.originChipText, originPoiId === "gps" && styles.originChipTextActive]}>
                  My GPS / Main Gate
                </Text>
              </Pressable>
              {originChoices.slice(0, 6).map((item) => {
                const active = originPoiId === item.id;
                return (
                  <Pressable
                    key={`origin-${item.id}`}
                    onPress={() => handleSelectOrigin(item.id)}
                    style={[styles.originChip, active && styles.originChipActive]}
                  >
                    <Text style={[styles.originChipText, active && styles.originChipTextActive]}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Action Row matching Google Maps (Directions & Start) */}
          <View style={styles.gmPreviewPillRow}>
            <Pressable
              disabled={routing}
              onPress={handleOpenDirections}
              style={styles.gmDirectionsMainPill}
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
              onPress={handleStartLiveNavigation}
              style={styles.gmStartQuickPill}
            >
              <Navigation size={16} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.gmStartQuickPillText}>Start</Text>
            </Pressable>
          </View>

          {/* Photos Carousel */}
          {placeDetails?.photos && placeDetails.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoCarousel}>
              {placeDetails.photos.map((photo: any, index: number) => (
                <Image key={index} source={{ uri: photo.url }} style={styles.photo} />
              ))}
            </ScrollView>
          )}
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
  markerCanvas: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
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

  /* ------------------------------------------------------------- */
  /* Stage 2: Route Overview Styles                                */
  /* ------------------------------------------------------------- */
  navTopCard: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
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
    gap: 6
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
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center"
  },
  originDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563EB"
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
  navOriginScroll: {
    gap: 6,
    paddingRight: 8
  },
  navOriginChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  navOriginChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB"
  },
  navOriginChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted
  },
  navOriginChipTextActive: {
    color: "#1D4ED8",
    fontWeight: "800"
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
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center"
  },
  sheetOverview: {
    maxHeight: 250
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
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9"
  },
  gmModeTabActiveWalk: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#93C5FD"
  },
  gmModeTabActiveDrive: {
    backgroundColor: "#FFEDD5",
    borderWidth: 1,
    borderColor: "#FDBA74"
  },
  gmModeTabText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: colors.muted
  },
  gmModeTabTextActiveWalk: {
    color: "#1D4ED8"
  },
  gmModeTabTextActiveDrive: {
    color: "#C2410C"
  },
  gmSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  gmDurationHeadline: {
    fontSize: 21,
    fontWeight: "900",
    color: "#15803D"
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
    height: 42,
    borderRadius: 21,
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
    fontSize: 15
  },
  gmSecondaryPill: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#F8FAFC",
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
    maxHeight: 180
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E3F3F0",
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
    fontSize: 11.5
  },

  /* ------------------------------------------------------------- */
  /* Stage 1: Place Details Styles                                 */
  /* ------------------------------------------------------------- */
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    maxHeight: "52%",
    borderRadius: 18,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: colors.line
  },
  sheetHandle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 8
  },
  sheetHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center"
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F3",
    alignItems: "center",
    justifyContent: "center"
  },
  poiName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  poiMeta: {
    color: colors.muted,
    marginTop: 2,
    fontWeight: "700",
    fontSize: 12
  },
  descriptionCompact: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8
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
    backgroundColor: "#F6FAF8",
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
  gmPreviewPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14
  },
  gmDirectionsMainPill: {
    flex: 1.4,
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
    fontSize: 15,
    fontWeight: "800"
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
    fontSize: 15,
    fontWeight: "800"
  },
  photoCarousel: {
    flexDirection: "row",
    marginTop: 12,
    marginHorizontal: -14,
    paddingHorizontal: 14
  },
  photo: {
    width: 180,
    height: 110,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: colors.line
  },

  /* ------------------------------------------------------------- */
  /* Stage 3: Live Turn-by-Turn Navigation Styles                  */
  /* ------------------------------------------------------------- */
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
