import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import type MapView from "react-native-maps";

import {
  advanceAlongRoute,
  bearingDegrees,
  calculateDistanceAlongRouteToPoint,
  calculateRemainingRouteDistance,
  Coordinate,
  findNearestPointOnRoute,
  haversineMeters
} from "@/navigationUtils";
import { isCoordinateOnCampus } from "@/utils/mapGeometry";
import type { RouteStep, TravelMode } from "@/types";

type UseLiveNavigationArgs = {
  isActive: boolean;
  routeCoords: Coordinate[];
  routeSteps: RouteStep[];
  travelMode: TravelMode;
  destinationName: string;
  mapRef: React.RefObject<MapView | null>;
  onReroute: (fromCoord: Coordinate) => Promise<void>;
};

export function useLiveNavigation({
  isActive,
  routeCoords,
  routeSteps,
  travelMode,
  destinationName,
  mapRef,
  onReroute
}: UseLiveNavigationArgs) {
  const [navLocation, setNavLocation] = useState<Coordinate | null>(null);
  const [navSegIndex, setNavSegIndex] = useState<number>(0);
  const [navBearing, setNavBearing] = useState<number>(0);
  const [navSpeedKmh, setNavSpeedKmh] = useState<number>(0);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [remainingDistanceMeters, setRemainingDistanceMeters] = useState<number>(0);
  const [remainingDurationSeconds, setRemainingDurationSeconds] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hasArrived, setHasArrived] = useState<boolean>(false);
  const [isRerouting, setIsRerouting] = useState<boolean>(false);

  const simulationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const simProgressRef = useRef<{ index: number; fraction: number }>({ index: 0, fraction: 0 });
  const offRouteCountRef = useRef<number>(0);
  const lastRerouteAtRef = useRef<number>(0);
  const hasArrivedRef = useRef<boolean>(false);
  const lastSpokenKeyRef = useRef<string>("");

  const routeCoordsRef = useRef(routeCoords);
  const routeStepsRef = useRef(routeSteps);
  const travelModeRef = useRef(travelMode);
  const isMutedRef = useRef(isMuted);
  const destinationNameRef = useRef(destinationName);
  const onRerouteRef = useRef(onReroute);

  routeCoordsRef.current = routeCoords;
  routeStepsRef.current = routeSteps;
  travelModeRef.current = travelMode;
  isMutedRef.current = isMuted;
  destinationNameRef.current = destinationName;
  onRerouteRef.current = onReroute;

  const speakPrompt = useCallback((text: string) => {
    if (isMutedRef.current || !text) return;
    try {
      Speech.stop();
      Speech.speak(text, { language: "en", rate: 1.0 });
    } catch {
      // Ignore speech failures on unsupported simulators
    }
  }, []);

  const stopSpeech = useCallback(() => {
    try {
      Speech.stop();
    } catch {
      // Ignore
    }
  }, []);

  const stopSimulation = useCallback(() => {
    setIsSimulating(false);
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setNavSpeedKmh(0);
  }, []);

  const stopAll = useCallback(() => {
    stopSimulation();
    stopSpeech();
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    offRouteCountRef.current = 0;
  }, [stopSimulation, stopSpeech]);

  const startSession = useCallback(
    (coords: Coordinate[], steps: RouteStep[], distanceMeters?: number, durationSeconds?: number) => {
      stopAll();
      simProgressRef.current = { index: 0, fraction: 0 };
      hasArrivedRef.current = false;
      lastSpokenKeyRef.current = "";
      setHasArrived(false);
      setIsRerouting(false);
      setCurrentStepIdx(0);
      setNavSegIndex(0);

      const initialPoint = coords[0];
      const initialBearing = coords.length > 1 ? bearingDegrees(coords[0], coords[1]) : 0;
      setNavLocation(initialPoint);
      setNavBearing(initialBearing);
      setNavSpeedKmh(0);

      if (typeof distanceMeters === "number") {
        setRemainingDistanceMeters(distanceMeters);
      }
      if (typeof durationSeconds === "number") {
        setRemainingDurationSeconds(durationSeconds);
      }

      mapRef.current?.animateCamera(
        {
          center: initialPoint,
          heading: initialBearing,
          pitch: 45,
          zoom: 18.5
        },
        { duration: 800 }
      );

      if (steps[0]?.instruction) {
        const key = `${coords[0]?.latitude}-${coords[0]?.longitude}-0`;
        lastSpokenKeyRef.current = key;
        speakPrompt(steps[0].instruction);
      }
    },
    [mapRef, speakPrompt, stopAll]
  );

  const startSimulation = useCallback(() => {
    const coords = routeCoordsRef.current;
    if (coords.length < 2) return;

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    // Resume from paused position unless finished
    if (simProgressRef.current.index >= coords.length - 1 || hasArrivedRef.current) {
      simProgressRef.current = { index: 0, fraction: 0 };
      hasArrivedRef.current = false;
      setHasArrived(false);
      setCurrentStepIdx(0);
      setNavSegIndex(0);
    }

    setIsSimulating(true);
    const isDriving = travelModeRef.current === "driving";
    setNavSpeedKmh(isDriving ? 26 : 5);
    const metersPerTick = isDriving ? 4.2 : 1.2;

    simulationTimerRef.current = setInterval(() => {
      const activeCoords = routeCoordsRef.current;
      const activeSteps = routeStepsRef.current;
      const drivingNow = travelModeRef.current === "driving";

      if (activeCoords.length < 2) {
        stopSimulation();
        return;
      }

      const stepRes = advanceAlongRoute(
        activeCoords,
        simProgressRef.current.index,
        simProgressRef.current.fraction,
        metersPerTick
      );

      simProgressRef.current = { index: stepRes.index, fraction: stepRes.fraction };

      setNavLocation(stepRes.position);
      setNavSegIndex(stepRes.index);
      setNavBearing(stepRes.bearing);

      if (stepRes.arrived) {
        setRemainingDistanceMeters(0);
        setRemainingDurationSeconds(0);
        setCurrentStepIdx(Math.max(0, activeSteps.length - 1));
        hasArrivedRef.current = true;
        setHasArrived(true);
        stopSimulation();
        const dest = destinationNameRef.current || "your destination";
        speakPrompt(`You have arrived at ${dest}.`);
        Alert.alert("Arrived!", `You have reached ${dest}.`);
        return;
      }

      const remainingDist = calculateRemainingRouteDistance(stepRes.index, stepRes.position, activeCoords);
      const speedMps = drivingNow ? 7.2 : 1.38;
      const remainingSecs = Math.max(0, Math.round(remainingDist / speedMps));

      setRemainingDistanceMeters(remainingDist);
      setRemainingDurationSeconds(remainingSecs);

      setCurrentStepIdx((prevIdx) => {
        let nextIdx = prevIdx;
        while (nextIdx < activeSteps.length - 1) {
          const stepEnd = activeSteps[nextIdx]?.end_location;
          if (!stepEnd) break;
          const distAlong = calculateDistanceAlongRouteToPoint(
            stepRes.index,
            stepRes.position,
            stepEnd,
            activeCoords
          );
          if (distAlong < 12 || haversineMeters(stepRes.position, stepEnd) < 12) {
            nextIdx += 1;
          } else {
            break;
          }
        }
        return nextIdx;
      });

      mapRef.current?.animateCamera(
        {
          center: stepRes.position,
          heading: stepRes.bearing,
          pitch: 45,
          zoom: 18.5
        },
        { duration: 480 }
      );
    }, 500);
  }, [mapRef, speakPrompt, stopSimulation]);

  const toggleSimulation = useCallback(() => {
    if (isSimulating) {
      stopSimulation();
    } else {
      startSimulation();
    }
  }, [isSimulating, startSimulation, stopSimulation]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) stopSpeech();
      return next;
    });
  }, [stopSpeech]);

  const recenterCamera = useCallback(() => {
    if (!navLocation) return;
    mapRef.current?.animateCamera(
      {
        center: navLocation,
        heading: navBearing,
        pitch: 45,
        zoom: 18.5
      },
      { duration: 500 }
    );
  }, [mapRef, navBearing, navLocation]);

  // Speak step change during active navigation
  useEffect(() => {
    if (!isActive || hasArrived || isMuted) return;
    const step = routeSteps[currentStepIdx];
    if (!step?.instruction) return;
    const key = `${routeCoords[0]?.latitude}-${routeCoords[0]?.longitude}-${currentStepIdx}`;
    if (lastSpokenKeyRef.current !== key) {
      lastSpokenKeyRef.current = key;
      speakPrompt(step.instruction);
    }
  }, [isActive, hasArrived, isMuted, currentStepIdx, routeSteps, routeCoords, speakPrompt]);

  // Real-time GPS tracking with off-route rerouting & arrival detection
  useEffect(() => {
    if (!isActive || isSimulating) {
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
            const activeCoords = routeCoordsRef.current;
            const activeSteps = routeStepsRef.current;
            if (activeCoords.length < 2) return;

            const userCoord: Coordinate = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude
            };
            if (!isCoordinateOnCampus(userCoord.latitude, userCoord.longitude)) {
              return;
            }

            const snap = findNearestPointOnRoute(userCoord, activeCoords);
            if (!snap) return;

            // Off-route rerouting (>35m away twice consecutively, throttled 8s)
            if (snap.distanceFromRoute > 35 && !hasArrivedRef.current) {
              offRouteCountRef.current += 1;
              if (offRouteCountRef.current >= 2 && Date.now() - lastRerouteAtRef.current >= 8000) {
                offRouteCountRef.current = 0;
                lastRerouteAtRef.current = Date.now();
                setIsRerouting(true);
                speakPrompt("Recalculating route.");
                onRerouteRef
                  .current(userCoord)
                  .then(() => {
                    if (!isMounted) return;
                    setCurrentStepIdx(0);
                    setNavSegIndex(0);
                    lastSpokenKeyRef.current = "";
                    simProgressRef.current = { index: 0, fraction: 0 };
                  })
                  .catch(() => {})
                  .finally(() => {
                    if (isMounted) setIsRerouting(false);
                  });
                return;
              }
            } else {
              offRouteCountRef.current = 0;
            }

            setNavLocation(snap.projected);
            setNavSegIndex(snap.segIndex);
            const speedKmh = Math.max(0, Math.round((loc.coords.speed || 0) * 3.6));
            setNavSpeedKmh(speedKmh);

            const brng =
              loc.coords.heading !== null && loc.coords.heading >= 0 ? loc.coords.heading : snap.bearing;
            setNavBearing(brng);

            const remDist = calculateRemainingRouteDistance(snap.segIndex, snap.projected, activeCoords);
            const isDriving = travelModeRef.current === "driving";
            const speedMps = speedKmh > 1 ? speedKmh / 3.6 : isDriving ? 7.2 : 1.38;
            const remSecs = Math.max(0, Math.round(remDist / speedMps));

            if (remDist <= 18 && !hasArrivedRef.current) {
              hasArrivedRef.current = true;
              setHasArrived(true);
              setRemainingDistanceMeters(0);
              setRemainingDurationSeconds(0);
              setCurrentStepIdx(Math.max(0, activeSteps.length - 1));
              const dest = destinationNameRef.current || "your destination";
              speakPrompt(`You have arrived at ${dest}.`);
              Alert.alert("Arrived!", `You have reached ${dest}.`);
              return;
            }

            setRemainingDistanceMeters(remDist);
            setRemainingDurationSeconds(remSecs);

            setCurrentStepIdx((prevIdx) => {
              let nextIdx = prevIdx;
              while (nextIdx < activeSteps.length - 1) {
                const stepEnd = activeSteps[nextIdx]?.end_location;
                if (!stepEnd) break;
                const distAlong = calculateDistanceAlongRouteToPoint(
                  snap.segIndex,
                  snap.projected,
                  stepEnd,
                  activeCoords
                );
                if (distAlong < 15 || haversineMeters(snap.projected, stepEnd) < 15) {
                  nextIdx += 1;
                } else {
                  break;
                }
              }
              return nextIdx;
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
        );
      } catch {
        // Fallback silently if location subscription fails
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
  }, [isActive, isSimulating, mapRef, speakPrompt]);

  // Cleanup all subscriptions, timers, and speech on unmount
  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  const currentStep = routeSteps[currentStepIdx] || routeSteps[0];
  const nextStep = routeSteps[currentStepIdx + 1];

  const distToNextManeuver = useMemo(() => {
    if (hasArrived) return 0;
    if (!navLocation || !currentStep?.end_location) {
      return currentStep?.distance_meters ?? 0;
    }
    return calculateDistanceAlongRouteToPoint(navSegIndex, navLocation, currentStep.end_location, routeCoords);
  }, [hasArrived, navLocation, navSegIndex, currentStep, routeCoords]);

  return {
    navLocation,
    navBearing,
    navSpeedKmh,
    currentStep,
    nextStep,
    currentStepIdx,
    distToNextManeuver,
    remainingDistanceMeters,
    remainingDurationSeconds,
    isSimulating,
    isMuted,
    hasArrived,
    isRerouting,
    startSession,
    stopAll,
    toggleSimulation,
    toggleMute,
    recenterCamera
  };
}
