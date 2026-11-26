import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type MapView from "react-native-maps";

import { showAppAlert } from "@/components/AppAlertProvider";
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

const MILESTONE_METERS = [600, 300, 150, 60] as const;
const PERIODIC_VOICE_INTERVAL_MS = 18000;

function formatSpokenDistance(meters: number): string {
  const m = Math.max(5, Math.round(meters));
  if (m >= 1000) {
    const km = (m / 1000).toFixed(1);
    return `${km} kilometers`;
  }
  if (m >= 100) {
    return `${Math.round(m / 10) * 10} meters`;
  }
  return `${Math.max(5, Math.round(m / 5) * 5)} meters`;
}

function cleanInstructionText(text?: string): string {
  return (text || "").replace(/\.$/, "").trim();
}

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
  const [isCameraFollowing, setIsCameraFollowing] = useState<boolean>(true);

  const simulationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const simProgressRef = useRef<{ index: number; fraction: number }>({ index: 0, fraction: 0 });
  const offRouteCountRef = useRef<number>(0);
  const lastRerouteAtRef = useRef<number>(0);
  const hasArrivedRef = useRef<boolean>(false);
  const isCameraFollowingRef = useRef<boolean>(true);

  const currentStepIdxRef = useRef<number>(0);
  const lastAnnouncedStepRef = useRef<number>(-1);
  const lastSpokenAtRef = useRef<number>(0);
  const spokenMilestonesRef = useRef<Set<number>>(new Set());
  const stepInitialDistRef = useRef<number>(0);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const stopSpeech = useCallback(() => {
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    try {
      Speech.stop();
    } catch {
      // Ignore
    }
  }, []);

  const speakPrompt = useCallback((text: string, options?: { interrupt?: boolean }) => {
    if (isMutedRef.current || !text) return;
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    lastSpokenAtRef.current = Date.now();
    const interrupt = options?.interrupt ?? false;

    try {
      if (interrupt) {
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
        }
        Speech.stop();
        speechTimeoutRef.current = setTimeout(() => {
          speechTimeoutRef.current = null;
          if (!isMutedRef.current) {
            Speech.speak(cleaned, { language: "en-US", rate: 0.98, pitch: 1.0 });
          }
        }, 85);
      } else {
        Speech.isSpeakingAsync()
          .then((speaking) => {
            if (!speaking && !isMutedRef.current) {
              Speech.speak(cleaned, { language: "en-US", rate: 0.98, pitch: 1.0 });
            }
          })
          .catch(() => {
            if (!isMutedRef.current) {
              Speech.speak(cleaned, { language: "en-US", rate: 0.98, pitch: 1.0 });
            }
          });
      }
    } catch {
      // Ignore speech failures on unsupported simulators
    }
  }, []);

  const evaluateVoiceGuidance = useCallback(
    (
      nextStepIdx: number,
      segIndex: number,
      position: Coordinate,
      remTotalDist: number,
      activeCoords: Coordinate[],
      activeSteps: RouteStep[]
    ) => {
      if (isMutedRef.current || hasArrivedRef.current || activeSteps.length === 0) return;

      const currStep = activeSteps[nextStepIdx] || activeSteps[0];
      const upcomingStep = activeSteps[nextStepIdx + 1];
      const distToTurn = currStep?.end_location
        ? calculateDistanceAlongRouteToPoint(segIndex, position, currStep.end_location, activeCoords)
        : currStep?.distance_meters ?? remTotalDist;

      // 1. Step transition announcement (immediate interrupt)
      if (nextStepIdx !== lastAnnouncedStepRef.current) {
        lastAnnouncedStepRef.current = nextStepIdx;
        spokenMilestonesRef.current.clear();
        stepInitialDistRef.current = Math.max(distToTurn, currStep?.distance_meters ?? distToTurn);

        const baseInstruction = cleanInstructionText(currStep?.instruction);
        let prompt = `${baseInstruction}.`;
        if (upcomingStep && upcomingStep.maneuver !== "arrive" && distToTurn >= 45) {
          prompt = `${baseInstruction}. In ${formatSpokenDistance(distToTurn)}, ${cleanInstructionText(
            upcomingStep.instruction
          ).toLowerCase()}.`;
        } else if (upcomingStep?.maneuver === "arrive" && distToTurn >= 45) {
          prompt = `${baseInstruction}. Continue ${formatSpokenDistance(distToTurn)} to ${
            destinationNameRef.current || "your destination"
          }.`;
        }
        speakPrompt(prompt, { interrupt: true });
        return;
      }

      const now = Date.now();
      const elapsedSinceLastSpeech = now - lastSpokenAtRef.current;

      // 2. Distance-to-maneuver milestone callouts (600m, 300m, 150m, 60m)
      if (elapsedSinceLastSpeech >= 5500) {
        for (const threshold of MILESTONE_METERS) {
          if (
            stepInitialDistRef.current >= threshold + 35 &&
            distToTurn <= threshold &&
            distToTurn >= threshold - 35 &&
            !spokenMilestonesRef.current.has(threshold)
          ) {
            spokenMilestonesRef.current.add(threshold);
            const distWords = formatSpokenDistance(distToTurn);
            if (upcomingStep && upcomingStep.maneuver !== "arrive") {
              speakPrompt(`In ${distWords}, ${cleanInstructionText(upcomingStep.instruction).toLowerCase()}.`, {
                interrupt: false
              });
            } else {
              speakPrompt(
                `In ${distWords}, you will arrive at ${destinationNameRef.current || "your destination"}.`,
                { interrupt: false }
              );
            }
            return;
          }
        }
      }

      // 3. Periodic time-interval progress update on long segments (every 18s)
      if (elapsedSinceLastSpeech >= PERIODIC_VOICE_INTERVAL_MS && distToTurn > 45) {
        const roadLabel =
          currStep?.road_name && currStep.road_name !== "Campus Pathway"
            ? currStep.road_name
            : "the current pathway";
        const distWords = formatSpokenDistance(distToTurn);

        if (upcomingStep && upcomingStep.maneuver !== "arrive") {
          speakPrompt(
            `Continue on ${roadLabel} for ${distWords}, then ${cleanInstructionText(
              upcomingStep.instruction
            ).toLowerCase()}.`,
            { interrupt: false }
          );
        } else {
          speakPrompt(
            `Continue on ${roadLabel} for ${distWords} to reach ${
              destinationNameRef.current || "your destination"
            }.`,
            { interrupt: false }
          );
        }
      }
    },
    [speakPrompt]
  );

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
      isCameraFollowingRef.current = true;
      currentStepIdxRef.current = 0;
      lastAnnouncedStepRef.current = -1;
      spokenMilestonesRef.current.clear();

      setHasArrived(false);
      setIsRerouting(false);
      setIsCameraFollowing(true);
      setCurrentStepIdx(0);
      setNavSegIndex(0);

      const initialPoint = coords[0];
      const initialBearing = coords.length > 1 ? bearingDegrees(coords[0], coords[1]) : 0;
      setNavLocation(initialPoint);
      setNavBearing(initialBearing);
      setNavSpeedKmh(0);

      const totalDist =
        typeof distanceMeters === "number"
          ? distanceMeters
          : calculateRemainingRouteDistance(0, initialPoint, coords);
      setRemainingDistanceMeters(totalDist);

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

      if (steps.length > 0 && initialPoint) {
        evaluateVoiceGuidance(0, 0, initialPoint, totalDist, coords, steps);
      }
    },
    [evaluateVoiceGuidance, mapRef, stopAll]
  );

  const startSimulation = useCallback(() => {
    const coords = routeCoordsRef.current;
    if (coords.length < 2) return;

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    if (simProgressRef.current.index >= coords.length - 1 || hasArrivedRef.current) {
      simProgressRef.current = { index: 0, fraction: 0 };
      hasArrivedRef.current = false;
      currentStepIdxRef.current = 0;
      lastAnnouncedStepRef.current = -1;
      spokenMilestonesRef.current.clear();
      setHasArrived(false);
      setCurrentStepIdx(0);
      setNavSegIndex(0);
    }

    setIsSimulating(true);
    const isDriving = travelModeRef.current === "driving";
    setNavSpeedKmh(isDriving ? 26 : 5);
    const metersPerTick = isDriving ? 4.2 : 1.5;

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
        const lastIdx = Math.max(0, activeSteps.length - 1);
        currentStepIdxRef.current = lastIdx;
        setCurrentStepIdx(lastIdx);
        hasArrivedRef.current = true;
        setHasArrived(true);
        stopSimulation();
        const dest = destinationNameRef.current || "your destination";
        speakPrompt(`You have arrived at ${dest}.`, { interrupt: true });
        showAppAlert({
          title: "Arrived at Destination",
          message: `You have reached ${dest}.`,
          variant: "success"
        });
        return;
      }

      const remainingDist = calculateRemainingRouteDistance(stepRes.index, stepRes.position, activeCoords);
      const speedMps = drivingNow ? 7.2 : 1.38;
      const remainingSecs = Math.max(0, Math.round(remainingDist / speedMps));

      setRemainingDistanceMeters(remainingDist);
      setRemainingDurationSeconds(remainingSecs);

      let nextIdx = currentStepIdxRef.current;
      while (nextIdx < activeSteps.length - 1) {
        const stepEnd = activeSteps[nextIdx]?.end_location;
        if (!stepEnd) break;
        const distAlong = calculateDistanceAlongRouteToPoint(
          stepRes.index,
          stepRes.position,
          stepEnd,
          activeCoords
        );
        if (distAlong < 14 || haversineMeters(stepRes.position, stepEnd) < 14) {
          nextIdx += 1;
        } else {
          break;
        }
      }
      if (nextIdx !== currentStepIdxRef.current) {
        currentStepIdxRef.current = nextIdx;
        setCurrentStepIdx(nextIdx);
      }

      evaluateVoiceGuidance(
        nextIdx,
        stepRes.index,
        stepRes.position,
        remainingDist,
        activeCoords,
        activeSteps
      );

      if (isCameraFollowingRef.current) {
        mapRef.current?.animateCamera(
          {
            center: stepRes.position,
            heading: stepRes.bearing,
            pitch: 45,
            zoom: 18.5
          },
          { duration: 480 }
        );
      }
    }, 500);
  }, [evaluateVoiceGuidance, mapRef, speakPrompt, stopSimulation]);

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
      isMutedRef.current = next;
      if (next) {
        stopSpeech();
      } else {
        const activeSteps = routeStepsRef.current;
        const step = activeSteps[currentStepIdxRef.current];
        if (step?.instruction) {
          speakPrompt(step.instruction, { interrupt: true });
        }
      }
      return next;
    });
  }, [speakPrompt, stopSpeech]);

  const pauseCameraFollow = useCallback(() => {
    if (isCameraFollowingRef.current) {
      isCameraFollowingRef.current = false;
      setIsCameraFollowing(false);
    }
  }, []);

  const recenterCamera = useCallback(() => {
    isCameraFollowingRef.current = true;
    setIsCameraFollowing(true);
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

            if (snap.distanceFromRoute > 35 && !hasArrivedRef.current) {
              offRouteCountRef.current += 1;
              if (offRouteCountRef.current >= 2 && Date.now() - lastRerouteAtRef.current >= 8000) {
                offRouteCountRef.current = 0;
                lastRerouteAtRef.current = Date.now();
                setIsRerouting(true);
                speakPrompt("Off route. Recalculating directions.", { interrupt: true });
                onRerouteRef
                  .current(userCoord)
                  .then(() => {
                    if (!isMounted) return;
                    currentStepIdxRef.current = 0;
                    lastAnnouncedStepRef.current = -1;
                    spokenMilestonesRef.current.clear();
                    setCurrentStepIdx(0);
                    setNavSegIndex(0);
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
              const lastIdx = Math.max(0, activeSteps.length - 1);
              currentStepIdxRef.current = lastIdx;
              setCurrentStepIdx(lastIdx);
              const dest = destinationNameRef.current || "your destination";
              speakPrompt(`You have arrived at ${dest}.`, { interrupt: true });
              showAppAlert({
                title: "Arrived at Destination",
                message: `You have reached ${dest}.`,
                variant: "success"
              });
              return;
            }

            setRemainingDistanceMeters(remDist);
            setRemainingDurationSeconds(remSecs);

            let nextIdx = currentStepIdxRef.current;
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
            if (nextIdx !== currentStepIdxRef.current) {
              currentStepIdxRef.current = nextIdx;
              setCurrentStepIdx(nextIdx);
            }

            evaluateVoiceGuidance(
              nextIdx,
              snap.segIndex,
              snap.projected,
              remDist,
              activeCoords,
              activeSteps
            );

            if (isCameraFollowingRef.current) {
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
  }, [evaluateVoiceGuidance, isActive, isSimulating, mapRef, speakPrompt]);

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  const currentStep = routeSteps[currentStepIdx] || routeSteps[0];
  const nextStep = routeSteps[currentStepIdx + 1];
  const thenStep = routeSteps[currentStepIdx + 2];

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
    thenStep,
    currentStepIdx,
    distToNextManeuver,
    remainingDistanceMeters,
    remainingDurationSeconds,
    isSimulating,
    isMuted,
    hasArrived,
    isRerouting,
    isCameraFollowing,
    startSession,
    stopAll,
    toggleSimulation,
    toggleMute,
    pauseCameraFollow,
    recenterCamera
  };
}
