import type {
  DirectionsResponse,
  GeoFeatureCollection,
  ModeEstimate,
  PathwayType,
  RouteStep,
  TrackProperties,
  TravelMode
} from "./types";

const PRECISION = 7;
const ENDPOINT_SNAP_METERS = 5.0;
const JUNCTION_SNAP_METERS = 7.0;
const SAME_POINT_EPS_METERS = 0.25;

const WALKING_METERS_PER_MIN = 80.0;
const DRIVING_METERS_PER_MIN = 400.0;

const MAIN_GATE_LONLAT: Coord = [4.190647, 7.621044];
const CAMPUS_CENTER_LONLAT: Coord = [4.199, 7.6215];

const METERS_PER_LAT = 111132.92;
const METERS_PER_LON = 111412.84 * Math.cos((CAMPUS_CENTER_LONLAT[1] * Math.PI) / 180);

type Coord = [number, number]; // [lon, lat]

type EdgeNeighbor = {
  toKey: string;
  toCoord: Coord;
  cost: number;
  distM: number;
  name: string;
  trackType: string;
};

type EdgeXY = {
  uKey: string;
  vKey: string;
  u: Coord;
  v: Coord;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  cost: number;
  distM: number;
  mult: number;
  name: string;
  trackType: string;
};

type CompiledNetwork = {
  graph: Map<string, EdgeNeighbor[]>;
  edgesXY: EdgeXY[];
  baseEdgeMeta: Map<string, { name: string; trackType: string }>;
  nodeXY: Map<string, [number, number]>;
};

type TrackBundleCache = {
  verts: Coord[];
  closestGateVertex: Coord | null;
  networks: Partial<Record<"driving" | "walking_strict" | "walking_hybrid", CompiledNetwork>>;
};

const NETWORK_CACHE = new WeakMap<GeoFeatureCollection<TrackProperties>, TrackBundleCache>();

function roundCoord(lon: number, lat: number): Coord {
  const f = Math.pow(10, PRECISION);
  return [Math.round(lon * f) / f, Math.round(lat * f) / f];
}

function coordKey(c: Coord): string {
  return `${c[0].toFixed(PRECISION)},${c[1].toFixed(PRECISION)}`;
}

function directedEdgeKey(aKey: string, bKey: string): string {
  return `${aKey}->${bKey}`;
}

function toXY(lon: number, lat: number): [number, number] {
  return [(lon - CAMPUS_CENTER_LONLAT[0]) * METERS_PER_LON, (lat - CAMPUS_CENTER_LONLAT[1]) * METERS_PER_LAT];
}

function toLonLat(x: number, y: number): Coord {
  return roundCoord(CAMPUS_CENTER_LONLAT[0] + x / METERS_PER_LON, CAMPUS_CENTER_LONLAT[1] + y / METERS_PER_LAT);
}

function haversineFloat(lon1: number, lat1: number, lon2: number, lat2: number): number {
  if (lon1 === lon2 && lat1 === lat2) return 0;
  const radius = 6371000.0;
  const rlat1 = (lat1 * Math.PI) / 180;
  const rlat2 = (lat2 * Math.PI) / 180;
  const dlat = rlat2 - rlat1;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dlat / 2) * Math.sin(dlat / 2) +
    Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(dlon / 2) * Math.sin(dlon / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function projectPointToSegmentXY(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): [number, number, number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) {
    return [ax, ay, 0, Math.hypot(px - ax, py - ay)];
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return [projX, projY, t, Math.hypot(px - projX, py - projY)];
}

function segmentIntersectionXY(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): [number, number, number, number] | null {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-10) return null;

  const qpx = cx - ax;
  const qpy = cy - ay;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const eps = 1e-7;

  if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
    const tc = Math.max(0, Math.min(1, t));
    const uc = Math.max(0, Math.min(1, u));
    return [ax + tc * rx, ay + tc * ry, tc, uc];
  }
  return null;
}

function inferTrackTypeFromText(name = "", description = "", source = ""): PathwayType {
  const text = `${name} ${description} ${source}`.toLowerCase();
  const pedestrianKeywords = [
    "pedestrian",
    "walkway",
    "footpath",
    "foot path",
    "walking",
    "sidewalk",
    "shortcut",
    "trail",
    "steps",
    "stairs",
    "corridor",
    "alley"
  ];
  const vehicleKeywords = [
    "vehicle",
    "vehicular",
    "road",
    "drive",
    "driveway",
    "street",
    "avenue",
    "highway",
    "boulevard",
    "car",
    "motor",
    "tarred",
    "lane",
    "roundabout"
  ];
  const hasPed = pedestrianKeywords.some((k) => text.includes(k));
  const hasVeh = vehicleKeywords.some((k) => text.includes(k));
  if (text.includes("both") || text.includes("shared") || (hasPed && hasVeh)) return "both";
  if (hasVeh) return "vehicle";
  if (hasPed) return "pedestrian";
  return "pedestrian";
}

function resolveTrackType(props: TrackProperties): PathwayType {
  const explicit = props.track_type;
  const inferred = inferTrackTypeFromText(props.name, props.description, props.source);
  if (explicit === "vehicle" || explicit === "both") return explicit;
  if (inferred === "vehicle" || inferred === "both") return inferred;
  return explicit || "pedestrian";
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num << 1;
  if (num < 0) sgnNum = ~sgnNum;
  let out = "";
  while (sgnNum >= 0x20) {
    out += String.fromCharCode((0x20 | (sgnNum & 0x1f)) + 63);
    sgnNum >>>= 5;
  }
  out += String.fromCharCode(sgnNum + 63);
  return out;
}

export function encodePolyline(points: Array<[number, number]>): string {
  let lastLat = 0;
  let lastLon = 0;
  let result = "";
  for (const [lat, lon] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLon = Math.round(lon * 1e5);
    result += encodeSignedNumber(iLat - lastLat);
    result += encodeSignedNumber(iLon - lastLon);
    lastLat = iLat;
    lastLon = iLon;
  }
  return result;
}

type PreparedTrack = {
  id: number;
  name: string;
  effType: PathwayType;
  weightMult: number;
  pts: Coord[];
};

function buildTopologicalNetwork(tracksWithWeights: PreparedTrack[]): CompiledNetwork {
  const cleanedTracks: PreparedTrack[] = [];
  for (const t of tracksWithWeights) {
    if (t.pts.length < 2) continue;
    const dedup: Coord[] = [];
    for (const c of t.pts) {
      const pt = roundCoord(c[0], c[1]);
      if (dedup.length === 0 || haversineFloat(dedup[dedup.length - 1][0], dedup[dedup.length - 1][1], pt[0], pt[1]) >= SAME_POINT_EPS_METERS) {
        dedup.push(pt);
      }
    }
    if (dedup.length >= 2) {
      cleanedTracks.push({ ...t, pts: dedup });
    }
  }

  if (cleanedTracks.length === 0) {
    return {
      graph: new Map(),
      edgesXY: [],
      baseEdgeMeta: new Map(),
      nodeXY: new Map()
    };
  }

  const canonicalXY: Array<{ coord: Coord; x: number; y: number; tid: number }> = [];
  function getCanonicalPoint(pt: Coord, trackId: number, isEndpoint: boolean): Coord {
    const [px, py] = toXY(pt[0], pt[1]);
    let best: Coord | null = null;
    let bestDist = Infinity;
    const snapRadius = isEndpoint ? ENDPOINT_SNAP_METERS : 2.5;

    for (const entry of canonicalXY) {
      if (entry.tid === trackId && !isEndpoint) continue;
      const dist = Math.hypot(px - entry.x, py - entry.y);
      if (dist <= snapRadius && dist < bestDist) {
        bestDist = dist;
        best = entry.coord;
      }
    }
    if (best !== null) return best;
    canonicalXY.push({ coord: pt, x: px, y: py, tid: trackId });
    return pt;
  }

  const endpointKeys = new Set<string>();
  const trackAnchored: PreparedTrack[] = [];
  for (const t of cleanedTracks) {
    const pStart = getCanonicalPoint(t.pts[0], t.id, true);
    const pEnd = getCanonicalPoint(t.pts[t.pts.length - 1], t.id, true);
    endpointKeys.add(coordKey(pStart));
    endpointKeys.add(coordKey(pEnd));
    const anchored: Coord[] = [pStart];
    for (let i = 1; i < t.pts.length - 1; i += 1) {
      const mid = getCanonicalPoint(t.pts[i], t.id, false);
      const last = anchored[anchored.length - 1];
      if (haversineFloat(last[0], last[1], mid[0], mid[1]) >= SAME_POINT_EPS_METERS) {
        anchored.push(mid);
      }
    }
    const tail = anchored[anchored.length - 1];
    if (
      haversineFloat(tail[0], tail[1], pEnd[0], pEnd[1]) >= SAME_POINT_EPS_METERS ||
      (anchored.length === 1 && coordKey(t.pts[0]) !== coordKey(t.pts[t.pts.length - 1]))
    ) {
      anchored.push(pEnd);
    }
    if (anchored.length >= 2) {
      trackAnchored.push({ ...t, pts: anchored });
    }
  }

  type RawSeg = {
    tid: number;
    name: string;
    effType: PathwayType;
    mult: number;
    p1: Coord;
    p2: Coord;
    p1Key: string;
    p2Key: string;
    ax: number;
    ay: number;
    bx: number;
    by: number;
  };
  const rawSegments: RawSeg[] = [];
  for (const t of trackAnchored) {
    for (let i = 0; i < t.pts.length - 1; i += 1) {
      const p1 = t.pts[i];
      const p2 = t.pts[i + 1];
      const p1Key = coordKey(p1);
      const p2Key = coordKey(p2);
      if (p1Key === p2Key) continue;
      const [ax, ay] = toXY(p1[0], p1[1]);
      const [bx, by] = toXY(p2[0], p2[1]);
      if (Math.hypot(bx - ax, by - ay) < SAME_POINT_EPS_METERS) continue;
      rawSegments.push({
        tid: t.id,
        name: t.name,
        effType: t.effType,
        mult: t.weightMult,
        p1,
        p2,
        p1Key,
        p2Key,
        ax,
        ay,
        bx,
        by
      });
    }
  }

  const numSegs = rawSegments.length;
  const segSplits: Array<Array<[number, Coord]>> = rawSegments.map((s) => [
    [0, s.p1],
    [1, s.p2]
  ]);
  const bridgeEdges: Array<{
    u: Coord;
    v: Coord;
    cost: number;
    distM: number;
    name: string;
    tType: PathwayType;
  }> = [];

  for (let i = 0; i < numSegs; i += 1) {
    const si = rawSegments[i];
    const minXi = Math.min(si.ax, si.bx);
    const maxXi = Math.max(si.ax, si.bx);
    const minYi = Math.min(si.ay, si.by);
    const maxYi = Math.max(si.ay, si.by);

    for (let j = i + 1; j < numSegs; j += 1) {
      const sj = rawSegments[j];
      if (si.p1Key === sj.p1Key || si.p1Key === sj.p2Key || si.p2Key === sj.p1Key || si.p2Key === sj.p2Key) {
        continue;
      }
      const minXj = Math.min(sj.ax, sj.bx);
      const maxXj = Math.max(sj.ax, sj.bx);
      const minYj = Math.min(sj.ay, sj.by);
      const maxYj = Math.max(sj.ay, sj.by);
      if (maxXi + 1 < minXj || maxXj + 1 < minXi || maxYi + 1 < minYj || maxYj + 1 < minYi) {
        continue;
      }

      const inter = segmentIntersectionXY(si.ax, si.ay, si.bx, si.by, sj.ax, sj.ay, sj.bx, sj.by);
      if (inter) {
        const interCoord = toLonLat(inter[0], inter[1]);
        segSplits[i].push([inter[2], interCoord]);
        segSplits[j].push([inter[3], interCoord]);
      }
    }
  }

  const vertexInfo = new Map<string, { coord: Coord; x: number; y: number; tids: Set<number>; isEp: boolean }>();
  for (const s of rawSegments) {
    for (const [pt, key, x, y] of [
      [s.p1, s.p1Key, s.ax, s.ay] as const,
      [s.p2, s.p2Key, s.bx, s.by] as const
    ]) {
      const existing = vertexInfo.get(key);
      if (!existing) {
        vertexInfo.set(key, { coord: pt, x, y, tids: new Set([s.tid]), isEp: endpointKeys.has(key) });
      } else {
        existing.tids.add(s.tid);
        existing.isEp = existing.isEp || endpointKeys.has(key);
      }
    }
  }

  for (const [vKey, vInfo] of vertexInfo.entries()) {
    const tol = vInfo.isEp ? JUNCTION_SNAP_METERS : 3.5;
    for (let j = 0; j < numSegs; j += 1) {
      const sj = rawSegments[j];
      if (vInfo.tids.has(sj.tid) || vKey === sj.p1Key || vKey === sj.p2Key) continue;
      const minXj = Math.min(sj.ax, sj.bx);
      const maxXj = Math.max(sj.ax, sj.bx);
      const minYj = Math.min(sj.ay, sj.by);
      const maxYj = Math.max(sj.ay, sj.by);
      if (vInfo.x < minXj - tol || vInfo.x > maxXj + tol || vInfo.y < minYj - tol || vInfo.y > maxYj + tol) {
        continue;
      }

      const [projX, projY, uJ, dist] = projectPointToSegmentXY(vInfo.x, vInfo.y, sj.ax, sj.ay, sj.bx, sj.by);
      if (dist <= tol) {
        let projCoord: Coord;
        if (uJ <= 0.02) {
          projCoord = sj.p1;
        } else if (uJ >= 0.98) {
          projCoord = sj.p2;
        } else {
          projCoord = toLonLat(projX, projY);
          segSplits[j].push([uJ, projCoord]);
        }

        if (coordKey(projCoord) !== vKey) {
          const trueD = haversineFloat(vInfo.coord[0], vInfo.coord[1], projCoord[0], projCoord[1]);
          bridgeEdges.push({
            u: vInfo.coord,
            v: projCoord,
            cost: trueD * sj.mult,
            distM: trueD,
            name: sj.name,
            tType: sj.effType
          });
        }
      }
    }
  }

  const edgeMap = new Map<
    string,
    { u: Coord; v: Coord; uKey: string; vKey: string; cost: number; distM: number; name: string; tType: string }
  >();

  function registerEdge(u: Coord, v: Coord, cost: number, distM: number, name: string, tType: string) {
    const uk = coordKey(u);
    const vk = coordKey(v);
    if (uk === vk) return;
    const canonKey = uk < vk ? `${uk}|${vk}` : `${vk}|${uk}`;
    const existing = edgeMap.get(canonKey);
    if (!existing || cost < existing.cost) {
      edgeMap.set(canonKey, uk < vk ? { u, v, uKey: uk, vKey: vk, cost, distM, name, tType } : { u: v, v: u, uKey: vk, vKey: uk, cost, distM, name, tType });
    }
  }

  for (let i = 0; i < numSegs; i += 1) {
    const si = rawSegments[i];
    const splits = [...segSplits[i]].sort((a, b) => a[0] - b[0]);
    const ordered: Coord[] = [];
    for (const [, c] of splits) {
      if (
        ordered.length === 0 ||
        haversineFloat(ordered[ordered.length - 1][0], ordered[ordered.length - 1][1], c[0], c[1]) >= SAME_POINT_EPS_METERS
      ) {
        ordered.push(c);
      }
    }
    if (ordered.length === 1 && si.p1Key !== si.p2Key) {
      ordered.push(si.p2);
    }
    for (let k = 0; k < ordered.length - 1; k += 1) {
      const u = ordered[k];
      const v = ordered[k + 1];
      const distM = haversineFloat(u[0], u[1], v[0], v[1]);
      if (distM < 0.05) continue;
      registerEdge(u, v, distM * si.mult, distM, si.name, si.effType);
    }
  }

  for (const b of bridgeEdges) {
    registerEdge(b.u, b.v, Math.max(0.05, b.cost), Math.max(0.05, b.distM), b.name, b.tType);
  }

  const graph = new Map<string, EdgeNeighbor[]>();
  const edgesXY: EdgeXY[] = [];
  const baseEdgeMeta = new Map<string, { name: string; trackType: string }>();
  const nodeXY = new Map<string, [number, number]>();

  for (const e of edgeMap.values()) {
    if (!nodeXY.has(e.uKey)) nodeXY.set(e.uKey, toXY(e.u[0], e.u[1]));
    if (!nodeXY.has(e.vKey)) nodeXY.set(e.vKey, toXY(e.v[0], e.v[1]));
    const [ux, uy] = nodeXY.get(e.uKey)!;
    const [vx, vy] = nodeXY.get(e.vKey)!;
    const mult = Math.max(1.0, e.distM > 0 ? e.cost / e.distM : 1.0);

    const listU = graph.get(e.uKey) || [];
    listU.push({ toKey: e.vKey, toCoord: e.v, cost: e.cost, distM: e.distM, name: e.name, trackType: e.tType });
    graph.set(e.uKey, listU);

    const listV = graph.get(e.vKey) || [];
    listV.push({ toKey: e.uKey, toCoord: e.u, cost: e.cost, distM: e.distM, name: e.name, trackType: e.tType });
    graph.set(e.vKey, listV);

    baseEdgeMeta.set(directedEdgeKey(e.uKey, e.vKey), { name: e.name, trackType: e.tType });
    baseEdgeMeta.set(directedEdgeKey(e.vKey, e.uKey), { name: e.name, trackType: e.tType });

    edgesXY.push({
      uKey: e.uKey,
      vKey: e.vKey,
      u: e.u,
      v: e.v,
      ux,
      uy,
      vx,
      vy,
      cost: e.cost,
      distM: e.distM,
      mult,
      name: e.name,
      trackType: e.tType
    });
  }

  return { graph, edgesXY, baseEdgeMeta, nodeXY };
}

function getBundleCache(tracksCollection: GeoFeatureCollection<TrackProperties>): TrackBundleCache {
  const existing = NETWORK_CACHE.get(tracksCollection);
  if (existing) return existing;

  const verts: Coord[] = [];
  let closestGateVertex: Coord | null = null;
  let minGateDist = Infinity;

  for (const f of tracksCollection.features || []) {
    if (f.geometry?.type !== "LineString") continue;
    const coords = f.geometry.coordinates as number[][];
    for (const pair of coords) {
      if (pair.length < 2) continue;
      const c = roundCoord(pair[0], pair[1]);
      verts.push(c);
      const dg = haversineFloat(MAIN_GATE_LONLAT[0], MAIN_GATE_LONLAT[1], c[0], c[1]);
      if (dg < minGateDist) {
        minGateDist = dg;
        closestGateVertex = c;
      }
    }
  }

  const created: TrackBundleCache = {
    verts,
    closestGateVertex,
    networks: {}
  };
  NETWORK_CACHE.set(tracksCollection, created);
  return created;
}

function getCompiledNetwork(
  tracksCollection: GeoFeatureCollection<TrackProperties>,
  networkKey: "driving" | "walking_strict" | "walking_hybrid"
): CompiledNetwork {
  const bundle = getBundleCache(tracksCollection);
  const cached = bundle.networks[networkKey];
  if (cached) return cached;

  const classified: Array<{ id: number; name: string; effType: PathwayType; pts: Coord[] }> = [];
  (tracksCollection.features || []).forEach((f, idx) => {
    if (f.geometry?.type !== "LineString") return;
    const raw = (f.geometry.coordinates as number[][]).filter((c) => c.length >= 2);
    if (raw.length < 2) return;
    const props = f.properties || ({} as TrackProperties);
    classified.push({
      id: Number(f.id ?? props.id ?? idx + 1),
      name: props.name || "Campus Path",
      effType: resolveTrackType(props),
      pts: raw.map((c) => [c[0], c[1]])
    });
  });

  let selected: PreparedTrack[] = [];
  if (networkKey === "driving") {
    selected = classified
      .filter((t) => t.effType === "vehicle" || t.effType === "both")
      .map((t) => ({ ...t, weightMult: 1.0 }));
    if (selected.length === 0) {
      selected = classified.map((t) => ({ ...t, weightMult: 1.0 }));
    }
  } else if (networkKey === "walking_strict") {
    selected = classified
      .filter((t) => t.effType === "pedestrian" || t.effType === "both")
      .map((t) => ({ ...t, weightMult: 1.0 }));
  } else {
    selected = classified.map((t) => ({
      ...t,
      weightMult: t.effType === "pedestrian" || t.effType === "both" ? 1.0 : 3.0
    }));
  }

  const net = buildTopologicalNetwork(selected);
  bundle.networks[networkKey] = net;
  return net;
}

function cleanPath(path: Coord[]): Coord[] {
  if (path.length <= 2) return path;

  const deduped: Coord[] = [];
  for (const pt of path) {
    if (
      deduped.length > 0 &&
      haversineFloat(deduped[deduped.length - 1][0], deduped[deduped.length - 1][1], pt[0], pt[1]) < 0.2
    ) {
      continue;
    }
    if (
      deduped.length >= 2 &&
      haversineFloat(deduped[deduped.length - 2][0], deduped[deduped.length - 2][1], pt[0], pt[1]) < 0.4
    ) {
      deduped.pop();
      continue;
    }
    deduped.push(pt);
  }

  let pocketChanged = true;
  while (pocketChanged && deduped.length >= 5) {
    pocketChanged = false;
    const n = deduped.length;
    for (let i = 1; i < n - 3; i += 1) {
      const maxJ = Math.min(n - 1, i + 8);
      let pruned = false;
      for (let j = maxJ; j > i + 1; j -= 1) {
        const directGap = haversineFloat(deduped[i][0], deduped[i][1], deduped[j][0], deduped[j][1]);
        if (directGap <= 18.0) {
          let detourLen = 0;
          for (let k = i; k < j; k += 1) {
            detourLen += haversineFloat(deduped[k][0], deduped[k][1], deduped[k + 1][0], deduped[k + 1][1]);
          }
          if (detourLen >= Math.max(directGap * 2.8, directGap + 25.0)) {
            deduped.splice(i + 1, j - (i + 1));
            pocketChanged = true;
            pruned = true;
            break;
          }
        }
      }
      if (pruned) break;
    }
  }

  let changed = true;
  while (changed && deduped.length >= 3) {
    changed = false;
    {
      const [ax, ay] = toXY(deduped[0][0], deduped[0][1]);
      const [bx, by] = toXY(deduped[1][0], deduped[1][1]);
      const [cx, cy] = toXY(deduped[2][0], deduped[2][1]);
      const v1x = ax - bx;
      const v1y = ay - by;
      const v2x = cx - bx;
      const v2y = cy - by;
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 > 0.1 && l2 > 0.1 && (v1x * v2x + v1y * v2y) / (l1 * l2) > 0.82 && l1 < 25.0) {
        deduped.splice(1, 1);
        changed = true;
        continue;
      }
    }
    if (deduped.length >= 3) {
      const len = deduped.length;
      const [ax, ay] = toXY(deduped[len - 3][0], deduped[len - 3][1]);
      const [bx, by] = toXY(deduped[len - 2][0], deduped[len - 2][1]);
      const [cx, cy] = toXY(deduped[len - 1][0], deduped[len - 1][1]);
      const v1x = ax - bx;
      const v1y = ay - by;
      const v2x = cx - bx;
      const v2y = cy - by;
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 > 0.1 && l2 > 0.1 && (v1x * v2x + v1y * v2y) / (l1 * l2) > 0.82 && l2 < 25.0) {
        deduped.splice(len - 2, 1);
        changed = true;
      }
    }
  }

  return deduped;
}

class MinHeap<T extends { f: number }> {
  private items: T[] = [];

  get size() {
    return this.items.length;
  }

  push(item: T) {
    this.items.push(item);
    let idx = this.items.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.items[parent].f <= this.items[idx].f) break;
      const tmp = this.items[parent];
      this.items[parent] = this.items[idx];
      this.items[idx] = tmp;
      idx = parent;
    }
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let idx = 0;
      const len = this.items.length;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < len && this.items[left].f < this.items[smallest].f) smallest = left;
        if (right < len && this.items[right].f < this.items[smallest].f) smallest = right;
        if (smallest === idx) break;
        const tmp = this.items[idx];
        this.items[idx] = this.items[smallest];
        this.items[smallest] = tmp;
        idx = smallest;
      }
    }
    return top;
  }
}

function solveRouteOnNetwork(
  originLonLat: Coord,
  destLonLat: Coord,
  net: CompiledNetwork
): {
  path: Coord[];
  totalDistM: number;
  edgeMeta: Map<string, { name: string; trackType: string }>;
} | null {
  if (net.graph.size === 0 || net.edgesXY.length === 0) return null;

  const [ox, oy] = toXY(originLonLat[0], originLonLat[1]);
  const [dx, dy] = toXY(destLonLat[0], destLonLat[1]);

  type ProjCandidate = {
    dist: number;
    idx: number;
    t: number;
    pCoord: Coord;
    px: number;
    py: number;
    mult: number;
  };
  const origCandidates: ProjCandidate[] = [];
  const destCandidates: ProjCandidate[] = [];

  for (let idx = 0; idx < net.edgesXY.length; idx += 1) {
    const e = net.edgesXY[idx];
    const [pox, poy, to, do_] = projectPointToSegmentXY(ox, oy, e.ux, e.uy, e.vx, e.vy);
    origCandidates.push({ dist: do_, idx, t: to, pCoord: toLonLat(pox, poy), px: pox, py: poy, mult: e.mult });

    const [pdx, pdy, td, dd] = projectPointToSegmentXY(dx, dy, e.ux, e.uy, e.vx, e.vy);
    destCandidates.push({ dist: dd, idx, t: td, pCoord: toLonLat(pdx, pdy), px: pdx, py: pdy, mult: e.mult });
  }

  origCandidates.sort((a, b) => a.dist - b.dist);
  destCandidates.sort((a, b) => a.dist - b.dist);

  const minOrigD = origCandidates[0].dist;
  const minDestD = destCandidates[0].dist;

  let selectedOrig = origCandidates.slice(0, 6).filter((c) => c.dist <= Math.max(minOrigD + 25.0, 35.0));
  if (selectedOrig.length === 0) selectedOrig = [origCandidates[0]];

  let selectedDest = destCandidates.slice(0, 6).filter((c) => c.dist <= Math.max(minDestD + 25.0, 35.0));
  if (selectedDest.length === 0) selectedDest = [destCandidates[0]];

  const overlayGraph = new Map<string, EdgeNeighbor[]>();
  const overlayMeta = new Map<string, { name: string; trackType: string }>();
  const localNodeXY = new Map<string, [number, number]>();

  function addOverlayEdge(aKey: string, bKey: string, bCoord: Coord, segCost: number, segD: number, name: string, trackType: string) {
    let list = overlayGraph.get(aKey);
    if (!list) {
      list = [...(net.graph.get(aKey) || [])];
      overlayGraph.set(aKey, list);
    }
    list.push({ toKey: bKey, toCoord: bCoord, cost: segCost, distM: segD, name, trackType });
  }

  const edgeSplits = new Map<number, Array<{ t: number; pCoord: Coord; px: number; py: number }>>();
  for (const c of selectedOrig) {
    const arr = edgeSplits.get(c.idx) || [];
    arr.push({ t: c.t, pCoord: c.pCoord, px: c.px, py: c.py });
    edgeSplits.set(c.idx, arr);
  }
  for (const c of selectedDest) {
    const arr = edgeSplits.get(c.idx) || [];
    arr.push({ t: c.t, pCoord: c.pCoord, px: c.px, py: c.py });
    edgeSplits.set(c.idx, arr);
  }

  for (const [idx, splits] of edgeSplits.entries()) {
    const e = net.edgesXY[idx];
    const allPts = [
      { t: 0, coord: e.u, px: e.ux, py: e.uy },
      ...splits.map((s) => ({ t: s.t, coord: s.pCoord, px: s.px, py: s.py })).sort((a, b) => a.t - b.t),
      { t: 1, coord: e.v, px: e.vx, py: e.vy }
    ];
    const chain: typeof allPts = [];
    for (const item of allPts) {
      if (
        chain.length === 0 ||
        haversineFloat(chain[chain.length - 1].coord[0], chain[chain.length - 1].coord[1], item.coord[0], item.coord[1]) >= 0.05
      ) {
        chain.push(item);
      }
    }
    for (let k = 0; k < chain.length - 1; k += 1) {
      const a = chain[k];
      const b = chain[k + 1];
      const aKey = coordKey(a.coord);
      const bKey = coordKey(b.coord);
      if (!localNodeXY.has(aKey)) localNodeXY.set(aKey, [a.px, a.py]);
      if (!localNodeXY.has(bKey)) localNodeXY.set(bKey, [b.px, b.py]);
      const segD = haversineFloat(a.coord[0], a.coord[1], b.coord[0], b.coord[1]);
      const segCost = segD * e.mult;
      addOverlayEdge(aKey, bKey, b.coord, segCost, segD, e.name, e.trackType);
      addOverlayEdge(bKey, aKey, a.coord, segCost, segD, e.name, e.trackType);
      overlayMeta.set(directedEdgeKey(aKey, bKey), { name: e.name, trackType: e.trackType });
      overlayMeta.set(directedEdgeKey(bKey, aKey), { name: e.name, trackType: e.trackType });
    }
  }

  const startKey = "__START__";
  const endKey = "__END__";
  overlayGraph.set(startKey, []);
  overlayGraph.set(endKey, []);
  localNodeXY.set(startKey, [ox, oy]);
  localNodeXY.set(endKey, [dx, dy]);

  const accessPenalty = 1.25;
  for (const c of selectedOrig) {
    const pKey = coordKey(c.pCoord);
    const trueD = haversineFloat(originLonLat[0], originLonLat[1], c.pCoord[0], c.pCoord[1]);
    if (!localNodeXY.has(pKey)) localNodeXY.set(pKey, [c.px, c.py]);
    overlayGraph.get(startKey)!.push({
      toKey: pKey,
      toCoord: c.pCoord,
      cost: trueD * accessPenalty * c.mult,
      distM: trueD,
      name: "Access Path",
      trackType: "access"
    });
  }

  for (const c of selectedDest) {
    const pKey = coordKey(c.pCoord);
    const trueD = haversineFloat(destLonLat[0], destLonLat[1], c.pCoord[0], c.pCoord[1]);
    if (!localNodeXY.has(pKey)) localNodeXY.set(pKey, [c.px, c.py]);
    addOverlayEdge(pKey, endKey, destLonLat, trueD * accessPenalty * c.mult, trueD, "Access Path", "access");
  }

  const directDist = haversineFloat(originLonLat[0], originLonLat[1], destLonLat[0], destLonLat[1]);
  if (directDist <= 25.0 || (minOrigD + minDestD > directDist * 1.2 && directDist <= 60.0)) {
    overlayGraph.get(startKey)!.push({
      toKey: endKey,
      toCoord: destLonLat,
      cost: directDist * 1.5,
      distM: directDist,
      name: "Direct Path",
      trackType: "access"
    });
  }

  function heuristic(key: string): number {
    if (key === endKey) return 0;
    const xy = net.nodeXY.get(key) || localNodeXY.get(key);
    if (!xy) return 0;
    return 0.95 * Math.hypot(xy[0] - dx, xy[1] - dy);
  }

  const queue = new MinHeap<{ f: number; g: number; key: string }>();
  const gCosts = new Map<string, number>([[startKey, 0]]);
  const prevKey = new Map<string, string | null>([[startKey, null]]);
  const nodeCoordMap = new Map<string, Coord>();

  queue.push({ f: heuristic(startKey), g: 0, key: startKey });

  while (queue.size > 0) {
    const curr = queue.pop()!;
    if (curr.key === endKey) break;
    if (curr.g > (gCosts.get(curr.key) ?? Infinity)) continue;

    const nbrs = overlayGraph.get(curr.key) || net.graph.get(curr.key) || [];
    for (const nbr of nbrs) {
      const newG = curr.g + nbr.cost;
      if (newG < (gCosts.get(nbr.toKey) ?? Infinity)) {
        gCosts.set(nbr.toKey, newG);
        prevKey.set(nbr.toKey, curr.key);
        if (nbr.toKey !== endKey) {
          nodeCoordMap.set(nbr.toKey, nbr.toCoord);
        }
        queue.push({ f: newG + heuristic(nbr.toKey), g: newG, key: nbr.toKey });
      }
    }
  }

  const beforeEnd = prevKey.get(endKey);
  if (!beforeEnd) return null;

  const chain: Coord[] = [];
  let ptr: string | null | undefined = beforeEnd;
  while (ptr && ptr !== startKey) {
    const coord = nodeCoordMap.get(ptr);
    if (coord) chain.push(coord);
    ptr = prevKey.get(ptr);
  }
  chain.reverse();

  const cleaned = cleanPath([originLonLat, ...chain, destLonLat]);
  let totalDistM = 0;
  const combinedMeta = new Map<string, { name: string; trackType: string }>();
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    const u = cleaned[i];
    const v = cleaned[i + 1];
    totalDistM += haversineFloat(u[0], u[1], v[0], v[1]);
    const key = directedEdgeKey(coordKey(u), coordKey(v));
    const meta = overlayMeta.get(key) || net.baseEdgeMeta.get(key);
    if (meta) combinedMeta.set(key, meta);
  }

  return { path: cleaned, totalDistM, edgeMeta: combinedMeta };
}

function bearingDegrees(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const rlat1 = (lat1 * Math.PI) / 180;
  const rlat2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dlon) * Math.cos(rlat2);
  const x = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dlon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function compassDirection(bearing: number): string {
  const dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  return dirs[Math.round(bearing / 45) % 8];
}

function turnPhrase(prevBearing: number, newBearing: number): string | null {
  const diff = ((newBearing - prevBearing + 540) % 360) - 180;
  const absDiff = Math.abs(diff);
  if (absDiff < 28) return null;
  if (absDiff < 55) return diff > 0 ? "Turn slight right" : "Turn slight left";
  if (absDiff < 135) return diff > 0 ? "Turn right" : "Turn left";
  return diff > 0 ? "Make a sharp right" : "Make a sharp left";
}

function maneuverCode(turn: string | null): string {
  if (!turn) return "straight";
  const t = turn.toLowerCase();
  if (t.includes("sharp right")) return "turn-sharp-right";
  if (t.includes("sharp left")) return "turn-sharp-left";
  if (t.includes("slight right")) return "turn-slight-right";
  if (t.includes("slight left")) return "turn-slight-left";
  if (t.includes("right")) return "turn-right";
  if (t.includes("left")) return "turn-left";
  return "straight";
}

function formatDistanceText(meters: number): string {
  const m = Math.max(1, Math.round(meters));
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function formatDurationText(meters: number, speedMPerMin: number): string {
  if (meters < 15) return "< 1 min";
  const mins = Math.max(1, Math.round(meters / speedMPerMin));
  return mins === 1 ? "1 min" : `${mins} mins`;
}

function buildTurnByTurnSteps(
  path: Coord[],
  edgeMeta: Map<string, { name: string; trackType: string }>,
  mode: TravelMode,
  speedMPerMin: number
): RouteStep[] {
  if (path.length < 2) return [];

  const verb = mode === "driving" ? "Drive" : "Walk";
  type Seg = { u: Coord; v: Coord; dist: number; bearing: number; name: string };
  const rawSegs: Seg[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const u = path[i];
    const v = path[i + 1];
    const dist = haversineFloat(u[0], u[1], v[0], v[1]);
    if (dist < 0.2) continue;
    const bearing = bearingDegrees(u[0], u[1], v[0], v[1]);
    const meta = edgeMeta.get(directedEdgeKey(coordKey(u), coordKey(v)));
    rawSegs.push({ u, v, dist, bearing, name: meta?.name || "" });
  }

  if (rawSegs.length === 0) {
    const end = path[path.length - 1];
    return [
      {
        instruction: "You have arrived at your destination.",
        distance_text: "0 m",
        duration_text: "Now",
        distance_meters: 0,
        duration_seconds: 0,
        maneuver: "arrive",
        road_name: "Destination",
        start_location: { latitude: end[1], longitude: end[0] },
        end_location: { latitude: end[1], longitude: end[0] },
        polyline: ""
      }
    ];
  }

  let startIdx = 0;
  let firstNamedIdx: number | null = null;
  let leadingAccessDist = 0;
  for (let i = 0; i < rawSegs.length; i += 1) {
    const segName = rawSegs[i].name;
    if (segName && segName !== "Access Path" && segName !== "Direct Path") {
      firstNamedIdx = i;
      break;
    }
    leadingAccessDist += rawSegs[i].dist;
  }

  let currCoords: Coord[];
  let currDist: number;
  let currName: string;
  let firstBearing: number;

  if (firstNamedIdx !== null && firstNamedIdx > 0 && leadingAccessDist < 30.0) {
    currCoords = [rawSegs[0].u, ...rawSegs.slice(0, firstNamedIdx + 1).map((s) => s.v)];
    currDist = leadingAccessDist + rawSegs[firstNamedIdx].dist;
    currName = rawSegs[firstNamedIdx].name;
    firstBearing = rawSegs[firstNamedIdx].bearing;
    startIdx = firstNamedIdx;
  } else {
    currCoords = [rawSegs[0].u, rawSegs[0].v];
    currDist = rawSegs[0].dist;
    currName = rawSegs[0].name;
    firstBearing = rawSegs[0].bearing;
  }

  let currManeuver = "depart";
  let currInstruction =
    currName && currName !== "Access Path" && currName !== "Direct Path"
      ? `Head ${compassDirection(firstBearing)} on ${currName}`
      : `${verb} ${compassDirection(firstBearing)} toward the pathway`;
  let prevBearing = firstBearing;
  const steps: RouteStep[] = [];

  for (let i = startIdx + 1; i < rawSegs.length; i += 1) {
    const seg = rawSegs[i];
    const diff = ((seg.bearing - prevBearing + 540) % 360) - 180;
    const absDiff = Math.abs(diff);
    const sameNamedRoad = Boolean(
      currName &&
        seg.name &&
        currName === seg.name &&
        seg.name !== "Access Path" &&
        seg.name !== "Direct Path"
    );
    const turn = turnPhrase(prevBearing, seg.bearing);
    const nameChanged = Boolean(
      seg.name && seg.name !== currName && seg.name !== "Access Path" && seg.name !== "Direct Path"
    );

    const shouldSplit = sameNamedRoad
      ? absDiff >= 115.0 && currDist >= 8.0
      : (turn !== null && currDist >= 8.0) || (nameChanged && currDist >= 15.0);

    if (shouldSplit) {
      const latLngPts: Array<[number, number]> = currCoords.map((c) => [c[1], c[0]]);
      steps.push({
        instruction: `${currInstruction}.`,
        distance_text: formatDistanceText(currDist),
        duration_text: formatDurationText(currDist, speedMPerMin),
        distance_meters: Math.round(currDist * 10) / 10,
        duration_seconds: Math.max(1, Math.round((currDist / speedMPerMin) * 60)),
        maneuver: currManeuver,
        road_name: currName || "Campus Pathway",
        start_location: { latitude: currCoords[0][1], longitude: currCoords[0][0] },
        end_location: {
          latitude: currCoords[currCoords.length - 1][1],
          longitude: currCoords[currCoords.length - 1][0]
        },
        polyline: encodePolyline(latLngPts)
      });
      currCoords = [seg.u, seg.v];
      currDist = seg.dist;
      currName = seg.name || currName;
      currManeuver = maneuverCode(turn);
      const action = turn || "Continue straight";
      currInstruction =
        seg.name && seg.name !== "Access Path" && seg.name !== "Direct Path"
          ? `${action} onto ${seg.name}`
          : `${action} (${compassDirection(seg.bearing)})`;
    } else {
      currCoords.push(seg.v);
      currDist += seg.dist;
      if (
        (currName === "" || currName === "Access Path" || currName === "Direct Path") &&
        seg.name &&
        seg.name !== "Access Path" &&
        seg.name !== "Direct Path"
      ) {
        currName = seg.name;
      }
    }

    if (seg.dist >= 2.0) {
      prevBearing = seg.bearing;
    }
  }

  const tailLatLng: Array<[number, number]> = currCoords.map((c) => [c[1], c[0]]);
  steps.push({
    instruction: `${currInstruction}.`,
    distance_text: formatDistanceText(currDist),
    duration_text: formatDurationText(currDist, speedMPerMin),
    distance_meters: Math.round(currDist * 10) / 10,
    duration_seconds: Math.max(1, Math.round((currDist / speedMPerMin) * 60)),
    maneuver: currManeuver,
    road_name: currName || "Campus Pathway",
    start_location: { latitude: currCoords[0][1], longitude: currCoords[0][0] },
    end_location: {
      latitude: currCoords[currCoords.length - 1][1],
      longitude: currCoords[currCoords.length - 1][0]
    },
    polyline: encodePolyline(tailLatLng)
  });

  const end = path[path.length - 1];
  steps.push({
    instruction: "Arrive at your destination.",
    distance_text: "Finish",
    duration_text: "",
    distance_meters: 0,
    duration_seconds: 0,
    maneuver: "arrive",
    road_name: "Destination",
    start_location: { latitude: end[1], longitude: end[0] },
    end_location: { latitude: end[1], longitude: end[0] },
    polyline: ""
  });

  return steps;
}

function solveMode(
  tracksCollection: GeoFeatureCollection<TrackProperties>,
  originLonLat: Coord,
  destLonLat: Coord,
  mode: TravelMode
) {
  if (mode === "driving") {
    const net = getCompiledNetwork(tracksCollection, "driving");
    return solveRouteOnNetwork(originLonLat, destLonLat, net);
  }

  const directDist = haversineFloat(originLonLat[0], originLonLat[1], destLonLat[0], destLonLat[1]);
  const pedNet = getCompiledNetwork(tracksCollection, "walking_strict");
  if (pedNet.graph.size > 0) {
    const pedSol = solveRouteOnNetwork(originLonLat, destLonLat, pedNet);
    if (pedSol) {
      const startGap =
        pedSol.path.length > 2
          ? haversineFloat(originLonLat[0], originLonLat[1], pedSol.path[1][0], pedSol.path[1][1])
          : 0;
      const endGap =
        pedSol.path.length > 2
          ? haversineFloat(
              destLonLat[0],
              destLonLat[1],
              pedSol.path[pedSol.path.length - 2][0],
              pedSol.path[pedSol.path.length - 2][1]
            )
          : 0;
      if (startGap <= 120.0 && endGap <= 120.0 && pedSol.totalDistM <= Math.max(directDist * 2.6, directDist + 250.0)) {
        return pedSol;
      }
    }
  }

  const hybNet = getCompiledNetwork(tracksCollection, "walking_hybrid");
  return solveRouteOnNetwork(originLonLat, destLonLat, hybNet);
}

export function computeOfflineDirections(options: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  mode?: TravelMode;
  tracks: GeoFeatureCollection<TrackProperties>;
  includeAlternate?: boolean;
}): DirectionsResponse | null {
  const { origin, destination, tracks, includeAlternate = true } = options;
  const normMode: TravelMode = options.mode === "driving" ? "driving" : "walking";
  const speed = normMode === "driving" ? DRIVING_METERS_PER_MIN : WALKING_METERS_PER_MIN;
  let modeLabel = normMode === "driving" ? "Offline • Campus Driving Route" : "Offline • Campus Walking Route";

  const bundle = getBundleCache(tracks);
  if (bundle.verts.length === 0) return null;

  let originLonLat = roundCoord(origin.longitude, origin.latitude);
  const destLonLat = roundCoord(destination.longitude, destination.latitude);

  const distFromCenter = haversineFloat(
    originLonLat[0],
    originLonLat[1],
    CAMPUS_CENTER_LONLAT[0],
    CAMPUS_CENTER_LONLAT[1]
  );
  let minDistToNet = distFromCenter;
  if (distFromCenter <= 8000.0) {
    minDistToNet = Infinity;
    for (const v of bundle.verts) {
      const d = haversineFloat(originLonLat[0], originLonLat[1], v[0], v[1]);
      if (d < minDistToNet) minDistToNet = d;
    }
  }

  if (minDistToNet > 3000.0 && bundle.closestGateVertex) {
    originLonLat = bundle.closestGateVertex;
    modeLabel = `From Main Gate • ${modeLabel}`;
  }

  const solution = solveMode(tracks, originLonLat, destLonLat, normMode);
  if (!solution) return null;

  const roundedDist = Math.max(1, Math.round(solution.totalDistM));
  const mins = Math.max(1, Math.round(solution.totalDistM / speed));
  const durationText = mins === 1 ? "1 min" : `${mins} mins`;
  const distanceText = formatDistanceText(roundedDist);
  const durationSeconds = Math.round((solution.totalDistM / speed) * 60);
  const encodedPolyline = encodePolyline(solution.path.map((c) => [c[1], c[0]]));
  const steps = buildTurnByTurnSteps(solution.path, solution.edgeMeta, normMode, speed);

  const result: DirectionsResponse = {
    provider: "local-fallback",
    mode: normMode,
    status: "OK",
    summary: modeLabel,
    distance_text: distanceText,
    duration_text: durationText,
    distance_meters: roundedDist,
    duration_seconds: durationSeconds,
    overview_polyline: encodedPolyline,
    steps
  };

  if (includeAlternate) {
    const otherMode: TravelMode = normMode === "walking" ? "driving" : "walking";
    const otherSpeed = otherMode === "driving" ? DRIVING_METERS_PER_MIN : WALKING_METERS_PER_MIN;
    const alternates: Partial<Record<TravelMode, ModeEstimate>> = {
      [normMode]: {
        distance_text: distanceText,
        duration_text: durationText,
        distance_meters: roundedDist,
        duration_seconds: durationSeconds
      }
    };
    const otherSol = solveMode(tracks, originLonLat, destLonLat, otherMode);
    if (otherSol) {
      const otherRounded = Math.max(1, Math.round(otherSol.totalDistM));
      const otherMins = Math.max(1, Math.round(otherSol.totalDistM / otherSpeed));
      alternates[otherMode] = {
        distance_text: formatDistanceText(otherRounded),
        duration_text: otherMins === 1 ? "1 min" : `${otherMins} mins`,
        distance_meters: otherRounded,
        duration_seconds: Math.round((otherSol.totalDistM / otherSpeed) * 60)
      };
    }
    result.alternate_modes = alternates;
  }

  return result;
}
