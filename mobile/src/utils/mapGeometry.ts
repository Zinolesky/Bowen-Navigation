import type { Coordinate } from "../navigationUtils";
import type { GeoFeatureCollection, PathwayType, Poi, TrackProperties } from "../types";

export const CAMPUS_REGION = {
  latitude: 7.6215,
  longitude: 4.199,
  latitudeDelta: 0.013,
  longitudeDelta: 0.016
};

export const MAIN_GATE_COORDS: Coordinate = {
  latitude: 7.621044,
  longitude: 4.190647
};

export const MAJOR_LANDMARK_NAMES = new Set([
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

export function getPoiPriority(poi: Poi): number {
  const lower = poi.name.toLowerCase().trim();
  if (MAJOR_LANDMARK_NAMES.has(lower)) return 100;
  const cat = poi.category?.slug?.toLowerCase() || "";
  if (cat === "academic" || cat === "administrative" || cat === "health" || cat === "transport") {
    return 70;
  }
  return 50;
}

export function isCoordinateOnCampus(lat: number, lon: number): boolean {
  return Math.abs(lat - CAMPUS_REGION.latitude) < 0.03 && Math.abs(lon - CAMPUS_REGION.longitude) < 0.03;
}

export type PlanarSegment = {
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

export function toCampusXY(coord: Coordinate): { x: number; y: number } {
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

/**
 * Filters a pedestrian walkway's coordinate chain so that any segment running
 * directly beside and parallel to a vehicle driveway is hidden, returning only
 * standalone off-road pedestrian walkway polylines.
 */
export function filterStandaloneWalkwayPolylines(
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

export function buildRoadAndWalkwayPolylines(tracks?: GeoFeatureCollection<TrackProperties>): {
  drivewayPolylines: { id: string; coords: Coordinate[] }[];
  standaloneWalkwayPolylines: { id: string; coords: Coordinate[] }[];
} {
  if (!tracks?.features) {
    return {
      drivewayPolylines: [],
      standaloneWalkwayPolylines: []
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

export function computeDeclutteredPois(options: {
  pois: Poi[];
  latitudeDelta: number;
  longitudeDelta: number;
  selectedPoiId?: number;
  originPoiId?: number | "gps";
  isNavActive: boolean;
}): { poi: Poi; displayMode: "full" | "compact" }[] {
  const { pois, latitudeDelta, longitudeDelta, selectedPoiId, originPoiId, isNavActive } = options;

  const latDelta = Math.max(0.0012, latitudeDelta || CAMPUS_REGION.latitudeDelta);
  const lngDelta = Math.max(0.0012, longitudeDelta || CAMPUS_REGION.longitudeDelta);

  const scaleFactor = isNavActive ? 1.35 : 1.0;

  const fullLeftLon = lngDelta * 0.042 * scaleFactor;
  const fullRightLon = lngDelta * 0.24 * scaleFactor;
  const fullHalfLat = latDelta * 0.033 * scaleFactor;

  const dotHalfLon = lngDelta * 0.036;
  const dotHalfLat = latDelta * 0.025;

  const sorted = [...pois].sort((a, b) => {
    const aForced = a.id === selectedPoiId || a.id === originPoiId ? 1 : 0;
    const bForced = b.id === selectedPoiId || b.id === originPoiId ? 1 : 0;
    if (aForced !== bForced) return bForced - aForced;
    const prioDiff = getPoiPriority(b) - getPoiPriority(a);
    if (prioDiff !== 0) return prioDiff;
    return a.id - b.id;
  });

  const placedBoxes: ScreenBox[] = [];
  const results: { poi: Poi; displayMode: "full" | "compact" }[] = [];

  for (const poi of sorted) {
    const isForced = poi.id === selectedPoiId || poi.id === originPoiId;

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
}
