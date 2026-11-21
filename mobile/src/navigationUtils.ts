export type Coordinate = {
  latitude: number;
  longitude: number;
};

/**
 * Calculates haversine distance in meters between two coordinates.
 */
export function haversineMeters(a: Coordinate, b: Coordinate): number {
  if (a.latitude === b.latitude && a.longitude === b.longitude) {
    return 0;
  }
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLon2 = Math.sin(dLon / 2);

  const h = sinDLat2 * sinDLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDLon2 * sinDLon2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/**
 * Computes bearing in degrees from point A to point B (0 = North, 90 = East).
 */
export function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Projects a point P onto a segment AB in local equirectangular space.
 */
export function projectPointToSegment(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate
): { projected: Coordinate; distanceMeters: number; t: number } {
  const refLat = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const metersPerLat = 111132.92;
  const metersPerLon = 111412.84 * Math.cos(refLat);

  const bx = (b.longitude - a.longitude) * metersPerLon;
  const by = (b.latitude - a.latitude) * metersPerLat;
  const px = (p.longitude - a.longitude) * metersPerLon;
  const py = (p.latitude - a.latitude) * metersPerLat;

  const lenSq = bx * bx + by * by;

  let t = 0;
  if (lenSq > 1e-9) {
    t = (px * bx + py * by) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projX = t * bx;
  const projY = t * by;
  const dist = Math.hypot(px - projX, py - projY);

  const projCoord: Coordinate = {
    latitude: a.latitude + projY / metersPerLat,
    longitude: a.longitude + projX / metersPerLon
  };

  return { projected: projCoord, distanceMeters: dist, t };
}

/**
 * Finds the nearest point along the route polyline to the given user coordinate.
 */
export function findNearestPointOnRoute(
  userCoord: Coordinate,
  routeCoords: Coordinate[],
  startSegIndex: number = 0
): {
  segIndex: number;
  projected: Coordinate;
  distanceFromRoute: number;
  bearing: number;
  t: number;
} | null {
  if (routeCoords.length < 2) return null;

  const startIdx = Math.max(0, Math.min(routeCoords.length - 2, startSegIndex));
  let minDistance = Infinity;
  let bestSegIndex = startIdx;
  let bestProjected = routeCoords[startIdx];
  let bestBearing = 0;
  let bestT = 0;

  for (let i = startIdx; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];
    const res = projectPointToSegment(userCoord, a, b);

    if (res.distanceMeters < minDistance) {
      minDistance = res.distanceMeters;
      bestSegIndex = i;
      bestProjected = res.projected;
      bestBearing = bearingDegrees(a, b);
      bestT = res.t;
    }
  }

  return {
    segIndex: bestSegIndex,
    projected: bestProjected,
    distanceFromRoute: minDistance,
    bearing: bestBearing,
    t: bestT
  };
}

/**
 * Calculates remaining distance along the route polyline from the snapped user position.
 */
export function calculateRemainingRouteDistance(
  segIndex: number,
  projected: Coordinate,
  routeCoords: Coordinate[]
): number {
  if (routeCoords.length < 2 || segIndex >= routeCoords.length - 1) return 0;

  let total = haversineMeters(projected, routeCoords[segIndex + 1]);
  for (let i = segIndex + 1; i < routeCoords.length - 1; i++) {
    total += haversineMeters(routeCoords[i], routeCoords[i + 1]);
  }

  return Math.max(0, total);
}

/**
 * Calculates distance measured ALONG the route polyline from the snapped user position
 * to a target maneuver end point ahead on the route.
 */
export function calculateDistanceAlongRouteToPoint(
  segIndex: number,
  projected: Coordinate,
  target: Coordinate,
  routeCoords: Coordinate[]
): number {
  if (routeCoords.length < 2 || segIndex >= routeCoords.length - 1) {
    return haversineMeters(projected, target);
  }

  const userProjOnSeg = projectPointToSegment(projected, routeCoords[segIndex], routeCoords[segIndex + 1]);
  const targetSnap = findNearestPointOnRoute(target, routeCoords, segIndex);
  if (!targetSnap) {
    return haversineMeters(projected, target);
  }

  if (targetSnap.segIndex === segIndex) {
    if (targetSnap.t <= userProjOnSeg.t) {
      return 0;
    }
    return Math.max(0, haversineMeters(projected, targetSnap.projected));
  }

  let total = haversineMeters(projected, routeCoords[segIndex + 1]);
  for (let i = segIndex + 1; i < targetSnap.segIndex; i++) {
    total += haversineMeters(routeCoords[i], routeCoords[i + 1]);
  }
  total += haversineMeters(routeCoords[targetSnap.segIndex], targetSnap.projected);
  return Math.max(0, total);
}

/**
 * Advances smoothly along a polyline by an exact distance in meters (no short-segment overshoot).
 */
export function advanceAlongRoute(
  routeCoords: Coordinate[],
  startIndex: number,
  startFraction: number,
  metersToAdvance: number
): {
  index: number;
  fraction: number;
  position: Coordinate;
  bearing: number;
  arrived: boolean;
} {
  if (routeCoords.length < 2) {
    const pos = routeCoords[0] || { latitude: 0, longitude: 0 };
    return { index: 0, fraction: 0, position: pos, bearing: 0, arrived: true };
  }

  let index = Math.max(0, Math.min(routeCoords.length - 2, startIndex));
  let fraction = Math.max(0, Math.min(1, startFraction));
  let remainingAdvance = Math.max(0, metersToAdvance);

  while (index < routeCoords.length - 1) {
    const p1 = routeCoords[index];
    const p2 = routeCoords[index + 1];
    const segLen = haversineMeters(p1, p2);

    if (segLen < 0.05) {
      index += 1;
      fraction = 0;
      continue;
    }

    const remInSeg = (1 - fraction) * segLen;
    if (remainingAdvance < remInSeg) {
      fraction += remainingAdvance / segLen;
      const position: Coordinate = {
        latitude: p1.latitude + (p2.latitude - p1.latitude) * fraction,
        longitude: p1.longitude + (p2.longitude - p1.longitude) * fraction
      };
      return {
        index,
        fraction,
        position,
        bearing: bearingDegrees(p1, p2),
        arrived: false
      };
    }

    remainingAdvance -= remInSeg;
    index += 1;
    fraction = 0;
  }

  const last = routeCoords[routeCoords.length - 1];
  const prev = routeCoords[routeCoords.length - 2];
  return {
    index: routeCoords.length - 1,
    fraction: 0,
    position: last,
    bearing: bearingDegrees(prev, last),
    arrived: true
  };
}

/**
 * Formats distance in meters into Google Maps style text ("110 m", "1.9 km").
 */
export function formatDistance(meters: number): string {
  if (meters < 15) {
    return "< 10 m";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Formats duration in seconds into Google Maps style text ("9 min", "24 min").
 */
export function formatDuration(seconds: number): string {
  if (seconds < 45) {
    return "< 1 min";
  }
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins === 1 ? "1 min" : `${mins} min`;
}

/**
 * Calculates estimated time of arrival (ETA) string based on remaining seconds.
 */
export function formatETA(remainingSeconds: number): string {
  const arrival = new Date(Date.now() + remainingSeconds * 1000);
  const hours = arrival.getHours().toString().padStart(2, "0");
  const minutes = arrival.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
