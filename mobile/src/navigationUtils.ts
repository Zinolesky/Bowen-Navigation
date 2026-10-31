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
  const R = 6371000; // Earth radius in meters
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

  const ax = 0;
  const ay = 0;
  const bx = (b.longitude - a.longitude) * metersPerLon;
  const by = (b.latitude - a.latitude) * metersPerLat;
  const px = (p.longitude - a.longitude) * metersPerLon;
  const py = (p.latitude - a.latitude) * metersPerLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 1e-9) {
    t = (px * dx + py * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projX = t * dx;
  const projY = t * dy;
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
  routeCoords: Coordinate[]
): {
  segIndex: number;
  projected: Coordinate;
  distanceFromRoute: number;
  bearing: number;
} | null {
  if (routeCoords.length < 2) return null;

  let minDistance = Infinity;
  let bestSegIndex = 0;
  let bestProjected = routeCoords[0];
  let bestBearing = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];
    const res = projectPointToSegment(userCoord, a, b);

    if (res.distanceMeters < minDistance) {
      minDistance = res.distanceMeters;
      bestSegIndex = i;
      bestProjected = res.projected;
      bestBearing = bearingDegrees(a, b);
    }
  }

  return {
    segIndex: bestSegIndex,
    projected: bestProjected,
    distanceFromRoute: minDistance,
    bearing: bestBearing
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

  // 1. Distance from snapped point to the end of the current segment
  let total = haversineMeters(projected, routeCoords[segIndex + 1]);

  // 2. Sum remaining segment lengths
  for (let i = segIndex + 1; i < routeCoords.length - 1; i++) {
    total += haversineMeters(routeCoords[i], routeCoords[i + 1]);
  }

  return Math.max(0, total);
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
