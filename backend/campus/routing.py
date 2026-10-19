import heapq
import math
from typing import Dict, List, Optional, Tuple

from .google import encode_polyline, haversine_meters
from .models import Track, infer_track_type_from_text

# Precision of 7 decimal places (~1.1cm at the equator) for canonical node keys
PRECISION = 7

# Snapping tolerances in meters
ENDPOINT_SNAP_METERS = 5.0
JUNCTION_SNAP_METERS = 7.0
SAME_POINT_EPS_METERS = 0.25

# Walking speed (~4.8 km/h) vs Campus driving speed (~24 km/h)
WALKING_METERS_PER_MIN = 80.0
DRIVING_METERS_PER_MIN = 400.0

Coord = Tuple[float, float]  # (lon, lat)


def _round_coord(coord: Tuple[float, float]) -> Coord:
    return (round(float(coord[0]), PRECISION), round(float(coord[1]), PRECISION))


def _haversine_float(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Exact float haversine distance in meters between two (lon, lat) coordinates."""
    if lon1 == lon2 and lat1 == lat2:
        return 0.0
    radius = 6371000.0
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    dlat = rlat2 - rlat1
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2.0) ** 2
    return radius * 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


class _LocalProjection:
    """
    Fast, millimeter-accurate equirectangular projection around campus center
    for 2D vector operations (point-to-segment projection and segment-segment intersection).
    """

    def __init__(self, ref_lon: float = 4.1990, ref_lat: float = 7.6215):
        self.ref_lon = ref_lon
        self.ref_lat = ref_lat
        self.meters_per_lat = 111132.92
        self.meters_per_lon = 111412.84 * math.cos(math.radians(ref_lat))

    def to_xy(self, lon: float, lat: float) -> Tuple[float, float]:
        return (
            (lon - self.ref_lon) * self.meters_per_lon,
            (lat - self.ref_lat) * self.meters_per_lat,
        )

    def to_lonlat(self, x: float, y: float) -> Coord:
        return _round_coord(
            (
                self.ref_lon + (x / self.meters_per_lon),
                self.ref_lat + (y / self.meters_per_lat),
            )
        )


def _project_point_to_segment_xy(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> Tuple[float, float, float, float]:
    """
    Projects point P(px, py) onto segment AB((ax, ay) -> (bx, by)).
    Returns (proj_x, proj_y, t, dist_meters) where t in [0.0, 1.0].
    """
    dx = bx - ax
    dy = by - ay
    len_sq = dx * dx + dy * dy
    if len_sq <= 1e-12:
        dist = math.hypot(px - ax, py - ay)
        return ax, ay, 0.0, dist

    t = ((px - ax) * dx + (py - ay) * dy) / len_sq
    t = max(0.0, min(1.0, t))
    proj_x = ax + t * dx
    proj_y = ay + t * dy
    dist = math.hypot(px - proj_x, py - proj_y)
    return proj_x, proj_y, t, dist


def _segment_intersection_xy(
    ax: float,
    ay: float,
    bx: float,
    by: float,
    cx: float,
    cy: float,
    dx: float,
    dy: float,
) -> Optional[Tuple[float, float, float, float]]:
    """
    Computes the intersection between segments AB and CD in 2D XY space.
    Returns (ix, iy, t, u) if they intersect within [0, 1], else None.
    """
    r_x = bx - ax
    r_y = by - ay
    s_x = dx - cx
    s_y = dy - cy

    denom = r_x * s_y - r_y * s_x
    if abs(denom) < 1e-10:
        return None

    qp_x = cx - ax
    qp_y = cy - ay
    t = (qp_x * s_y - qp_y * s_x) / denom
    u = (qp_x * r_y - qp_y * r_x) / denom

    eps = 1e-7
    if -eps <= t <= 1.0 + eps and -eps <= u <= 1.0 + eps:
        t = max(0.0, min(1.0, t))
        u = max(0.0, min(1.0, u))
        ix = ax + t * r_x
        iy = ay + t * r_y
        return ix, iy, t, u
    return None


def resolve_track_type(track: Track) -> str:
    """
    Determines the effective pathway type ('pedestrian', 'vehicle', or 'both') for a Track.
    Uses explicit track_type if set to 'vehicle' or 'both', and also checks text keywords
    in case a vehicle road was saved with the default 'pedestrian' value.
    """
    explicit = getattr(track, "track_type", "") or ""
    inferred = infer_track_type_from_text(
        getattr(track, "name", ""),
        getattr(track, "description", ""),
        getattr(track, "source", ""),
    )
    if explicit in (Track.TRACK_TYPE_VEHICLE, Track.TRACK_TYPE_BOTH):
        return explicit
    if inferred in (Track.TRACK_TYPE_VEHICLE, Track.TRACK_TYPE_BOTH):
        return inferred
    return explicit or Track.TRACK_TYPE_PEDESTRIAN


def normalize_travel_mode(mode: Optional[str]) -> str:
    if not mode:
        return "walking"
    m = str(mode).strip().lower()
    if m in ("driving", "vehicle", "vehicular", "car", "motor", "road"):
        return "driving"
    return "walking"


def _build_topological_network(
    tracks_with_weights: List[Tuple[Track, str, float]],
    proj: _LocalProjection,
) -> Tuple[
    Dict[Coord, List[Tuple[Coord, float, float, str, str]]],
    List[Tuple[Coord, Coord, float, float, str, str]],
]:
    """
    Builds a topologically connected graph from the given tracks:
    1. Preserves intra-track geometry (never collapses consecutive vertices of the same curve).
    2. Snaps track endpoints / shared vertices within ENDPOINT_SNAP_METERS.
    3. Splits segments at all X-intersections (segment crossings) and T-junctions
       (where a track endpoint or junction vertex lies within JUNCTION_SNAP_METERS of a segment).
    Returns:
      - graph: { node: [(neighbor, cost_weight, true_dist_m, track_name, track_type), ...] }
      - edges: [(u, v, cost_weight, true_dist_m, track_name, track_type), ...]
    """
    # Collect cleaned coordinate sequences per track
    cleaned_tracks = []
    for track, eff_type, weight_mult in tracks_with_weights:
        raw_coords = list(track.geometry.coords) if track.geometry else []
        if len(raw_coords) < 2:
            continue
        pts: List[Coord] = []
        for c in raw_coords:
            pt = _round_coord((c[0], c[1]))
            if not pts or _haversine_float(pts[-1][0], pts[-1][1], pt[0], pt[1]) >= SAME_POINT_EPS_METERS:
                pts.append(pt)
        if len(pts) >= 2:
            cleaned_tracks.append((track.id, track.name or "Campus Path", eff_type, weight_mult, pts))

    if not cleaned_tracks:
        return {}, []

    # Step 1: Canonicalize close vertices across different tracks (especially endpoints)
    # Priority given to track endpoints so junctions converge cleanly.
    canonical_xy: List[Tuple[Coord, float, float, int, bool]] = []  # (coord, x, y, track_id, is_endpoint)

    def _get_canonical_point(pt: Coord, track_id: int, is_endpoint: bool) -> Coord:
        px, py = proj.to_xy(pt[0], pt[1])
        best_coord = None
        best_dist = float("inf")
        snap_radius = ENDPOINT_SNAP_METERS if is_endpoint else 2.5

        for c_coord, cx, cy, c_tid, c_is_ep in canonical_xy:
            # Never snap two vertices of the same track to each other unless it's a closed loop endpoint
            if c_tid == track_id and not is_endpoint:
                continue
            dist = math.hypot(px - cx, py - cy)
            if dist <= snap_radius and dist < best_dist:
                best_dist = dist
                best_coord = c_coord

        if best_coord is not None:
            return best_coord

        canonical_xy.append((pt, px, py, track_id, is_endpoint))
        return pt

    # Register all track endpoints first so they act as anchor nodes
    track_anchored_pts: List[Tuple[int, str, str, float, List[Coord]]] = []
    endpoint_coords_set = set()

    for track_id, name, eff_type, weight_mult, pts in cleaned_tracks:
        p_start = _get_canonical_point(pts[0], track_id, True)
        p_end = _get_canonical_point(pts[-1], track_id, True)
        endpoint_coords_set.add(p_start)
        endpoint_coords_set.add(p_end)
        anchored = [p_start]
        for mid_pt in pts[1:-1]:
            c_mid = _get_canonical_point(mid_pt, track_id, False)
            if _haversine_float(anchored[-1][0], anchored[-1][1], c_mid[0], c_mid[1]) >= SAME_POINT_EPS_METERS:
                anchored.append(c_mid)
        if _haversine_float(anchored[-1][0], anchored[-1][1], p_end[0], p_end[1]) >= SAME_POINT_EPS_METERS:
            anchored.append(p_end)
        elif len(anchored) == 1 and pts[0] != pts[-1]:
            anchored.append(p_end)

        if len(anchored) >= 2:
            track_anchored_pts.append((track_id, name, eff_type, weight_mult, anchored))

    # Build raw segments list
    # Each segment: (track_id, name, eff_type, weight_mult, p1, p2, ax, ay, bx, by)
    raw_segments = []
    for track_id, name, eff_type, weight_mult, pts in track_anchored_pts:
        for i in range(len(pts) - 1):
            p1, p2 = pts[i], pts[i + 1]
            if p1 == p2:
                continue
            ax, ay = proj.to_xy(p1[0], p1[1])
            bx, by = proj.to_xy(p2[0], p2[1])
            if math.hypot(bx - ax, by - ay) < SAME_POINT_EPS_METERS:
                continue
            raw_segments.append((track_id, name, eff_type, weight_mult, p1, p2, ax, ay, bx, by))

    num_segs = len(raw_segments)
    # Split points per segment index: list of (t, Coord)
    seg_splits: List[List[Tuple[float, Coord]]] = [
        [(0.0, seg[4]), (1.0, seg[5])] for seg in raw_segments
    ]
    # Additional short bridge edges for T-junctions where endpoint V is slightly off segment S
    bridge_edges: List[Tuple[Coord, Coord, float, float, str, str]] = []

    # Step 2: Detect all X-intersections between segments
    for i in range(num_segs):
        tid_i, name_i, type_i, mult_i, p1_i, p2_i, ax, ay, bx, by = raw_segments[i]
        min_x_i, max_x_i = (ax, bx) if ax <= bx else (bx, ax)
        min_y_i, max_y_i = (ay, by) if ay <= by else (by, ay)

        for j in range(i + 1, num_segs):
            tid_j, name_j, type_j, mult_j, p1_j, p2_j, cx, cy, dx, dy = raw_segments[j]
            # Share an exact endpoint already?
            if p1_i == p1_j or p1_i == p2_j or p2_i == p1_j or p2_i == p2_j:
                continue

            # Bounding box check
            min_x_j, max_x_j = (cx, dx) if cx <= dx else (dx, cx)
            min_y_j, max_y_j = (cy, dy) if cy <= dy else (dy, cy)
            if max_x_i + 1.0 < min_x_j or max_x_j + 1.0 < min_x_i:
                continue
            if max_y_i + 1.0 < min_y_j or max_y_j + 1.0 < min_y_i:
                continue

            inter = _segment_intersection_xy(ax, ay, bx, by, cx, cy, dx, dy)
            if inter is not None:
                ix, iy, t_i, u_j = inter
                inter_coord = proj.to_lonlat(ix, iy)
                seg_splits[i].append((t_i, inter_coord))
                seg_splits[j].append((u_j, inter_coord))

    # Step 3: Detect all T-junctions (vertex/endpoint of one track near interior of another segment)
    # Gather unique vertices with metadata: coord -> (vx, vy, set_of_track_ids, is_track_endpoint)
    vertex_info: Dict[Coord, Tuple[float, float, set, bool]] = {}
    for tid, name, eff_type, mult, p1, p2, ax, ay, bx, by in raw_segments:
        for pt, px, py in ((p1, ax, ay), (p2, bx, by)):
            if pt not in vertex_info:
                vertex_info[pt] = (px, py, {tid}, pt in endpoint_coords_set)
            else:
                vx, vy, tids, is_ep = vertex_info[pt]
                tids.add(tid)
                vertex_info[pt] = (vx, vy, tids, is_ep or (pt in endpoint_coords_set))

    for v_coord, (vx, vy, v_tids, is_ep) in vertex_info.items():
        # Track endpoints get a slightly more generous T-junction snap tolerance (7m)
        # than intermediate vertices (3.5m) so parallel sidewalks don't fuse mid-block,
        # while paths terminating on a road/walkway always connect.
        tol = JUNCTION_SNAP_METERS if is_ep else 3.5

        for j in range(num_segs):
            tid_j, name_j, type_j, mult_j, p1_j, p2_j, cx, cy, dx, dy = raw_segments[j]
            if tid_j in v_tids or v_coord == p1_j or v_coord == p2_j:
                continue

            min_x_j, max_x_j = (cx, dx) if cx <= dx else (dx, cx)
            min_y_j, max_y_j = (cy, dy) if cy <= dy else (dy, cy)
            if vx < min_x_j - tol or vx > max_x_j + tol or vy < min_y_j - tol or vy > max_y_j + tol:
                continue

            proj_x, proj_y, u_j, dist = _project_point_to_segment_xy(vx, vy, cx, cy, dx, dy)
            if dist <= tol:
                if u_j <= 0.02:
                    proj_coord = p1_j
                elif u_j >= 0.98:
                    proj_coord = p2_j
                else:
                    proj_coord = proj.to_lonlat(proj_x, proj_y)
                    seg_splits[j].append((u_j, proj_coord))

                if proj_coord != v_coord:
                    true_d = _haversine_float(v_coord[0], v_coord[1], proj_coord[0], proj_coord[1])
                    # Short virtual connector across the T-junction gap
                    bridge_edges.append((v_coord, proj_coord, true_d * mult_j, true_d, name_j, type_j))

    # Step 4: Assemble adjacency graph and split edges list
    graph: Dict[Coord, List[Tuple[Coord, float, float, str, str]]] = {}
    edge_map: Dict[Tuple[Coord, Coord], Tuple[float, float, str, str]] = {}

    def _register_undirected_edge(u: Coord, v: Coord, cost: float, dist_m: float, name: str, t_type: str):
        if u == v:
            return
        key = (u, v) if u < v else (v, u)
        existing = edge_map.get(key)
        if existing is None or cost < existing[0]:
            edge_map[key] = (cost, dist_m, name, t_type)

    for i in range(num_segs):
        tid_i, name_i, type_i, mult_i, p1_i, p2_i, ax, ay, bx, by = raw_segments[i]
        splits = sorted(seg_splits[i], key=lambda item: item[0])
        ordered_coords: List[Coord] = []
        for _, c in splits:
            if not ordered_coords or _haversine_float(
                ordered_coords[-1][0], ordered_coords[-1][1], c[0], c[1]
            ) >= SAME_POINT_EPS_METERS:
                ordered_coords.append(c)
        if len(ordered_coords) == 1 and p1_i != p2_i:
            ordered_coords.append(p2_i)

        for k in range(len(ordered_coords) - 1):
            u, v = ordered_coords[k], ordered_coords[k + 1]
            dist_m = _haversine_float(u[0], u[1], v[0], v[1])
            if dist_m < 0.05:
                continue
            cost = dist_m * mult_i
            _register_undirected_edge(u, v, cost, dist_m, name_i, type_i)

    for u, v, cost, dist_m, name, t_type in bridge_edges:
        _register_undirected_edge(u, v, max(0.05, cost), max(0.05, dist_m), name, t_type)

    edges_list: List[Tuple[Coord, Coord, float, float, str, str]] = []
    for (u, v), (cost, dist_m, name, t_type) in edge_map.items():
        graph.setdefault(u, []).append((v, cost, dist_m, name, t_type))
        graph.setdefault(v, []).append((u, cost, dist_m, name, t_type))
        edges_list.append((u, v, cost, dist_m, name, t_type))

    return graph, edges_list


def build_graph(mode: str = "walking") -> Dict[Coord, List[Tuple[Coord, float]]]:
    """
    Backward-compatible helper that constructs an adjacency list graph for the given mode.
    Each node is a coordinate (lon, lat), and edges are (neighbor, distance_in_meters).
    """
    norm_mode = normalize_travel_mode(mode)
    all_tracks = list(Track.objects.all())
    if not all_tracks:
        return {}

    classified = [(t, resolve_track_type(t)) for t in all_tracks]
    if norm_mode == "driving":
        selected = [(t, et, 1.0) for t, et in classified if et in (Track.TRACK_TYPE_VEHICLE, Track.TRACK_TYPE_BOTH)]
        if not selected:
            selected = [(t, et, 1.0) for t, et in classified]
    else:
        selected = [(t, et, 1.0) for t, et in classified if et in (Track.TRACK_TYPE_PEDESTRIAN, Track.TRACK_TYPE_BOTH)]
        if not selected:
            selected = [(t, et, 1.0) for t, et in classified]

    proj = _LocalProjection()
    full_graph, _ = _build_topological_network(selected, proj)
    return {
        node: [(nbr, dist_m) for nbr, _cost, dist_m, _name, _type in nbrs]
        for node, nbrs in full_graph.items()
    }


def find_nearest_node(graph: Dict, target: dict) -> Optional[Coord]:
    """
    Finds the node in the graph that is closest to the given target coordinate.
    target is a dict: {"longitude": float, "latitude": float}
    """
    min_dist = float("inf")
    nearest = None
    t_lon = float(target["longitude"])
    t_lat = float(target["latitude"])

    for node in graph.keys():
        dist = _haversine_float(node[0], node[1], t_lon, t_lat)
        if dist < min_dist:
            min_dist = dist
            nearest = node

    return nearest


def _clean_path(path: List[Coord]) -> List[Coord]:
    """
    Removes consecutive duplicate points, zero-area backtrack loops (A -> B -> A),
    and sharp acute-angle entry/exit spikes caused by off-track origin/destination projection.
    """
    if len(path) <= 2:
        return path

    # 1. Deduplicate near-identical consecutive points and collapse immediate A -> B -> A spikes
    deduped: List[Coord] = []
    for pt in path:
        if deduped and _haversine_float(deduped[-1][0], deduped[-1][1], pt[0], pt[1]) < 0.2:
            continue
        if len(deduped) >= 2 and _haversine_float(deduped[-2][0], deduped[-2][1], pt[0], pt[1]) < 0.4:
            # Collapsed A -> B -> A backtrack
            deduped.pop()
            continue
        deduped.append(pt)

    # 1b. Prune narrow U-shaped pocket detours (e.g. dipping into a building parking spur and back out
    # to the same road corridor within 18m when the detour is >= 2.8x longer than the direct gap)
    pocket_changed = True
    while pocket_changed and len(deduped) >= 5:
        pocket_changed = False
        n = len(deduped)
        for i in range(1, n - 3):
            max_j = min(n - 1, i + 8)
            pruned = False
            for j in range(max_j, i + 1, -1):
                direct_gap = _haversine_float(
                    deduped[i][0], deduped[i][1], deduped[j][0], deduped[j][1]
                )
                if direct_gap <= 18.0:
                    detour_len = 0.0
                    for k in range(i, j):
                        detour_len += _haversine_float(
                            deduped[k][0], deduped[k][1], deduped[k + 1][0], deduped[k + 1][1]
                        )
                    if detour_len >= max(direct_gap * 2.8, direct_gap + 25.0):
                        del deduped[i + 1 : j]
                        pocket_changed = True
                        pruned = True
                        break
            if pruned:
                break

    # 2. Check if the first intermediate point (deduped[1]) or last intermediate point (deduped[-2])
    # forms a sharp backtracking hook with origin/destination
    proj = _LocalProjection()
    changed = True
    while changed and len(deduped) >= 3:
        changed = False
        # Check start hook: deduped[0] -> deduped[1] -> deduped[2]
        ax, ay = proj.to_xy(*deduped[0])
        bx, by = proj.to_xy(*deduped[1])
        cx, cy = proj.to_xy(*deduped[2])
        v1x, v1y = ax - bx, ay - by
        v2x, v2y = cx - bx, cy - by
        len1 = math.hypot(v1x, v1y)
        len2 = math.hypot(v2x, v2y)
        if len1 > 0.1 and len2 > 0.1:
            cos_angle = (v1x * v2x + v1y * v2y) / (len1 * len2)
            # If the angle at B between BA and BC is < 35 degrees (cos > 0.82) and origin is close to segment BC
            if cos_angle > 0.82 and len1 < 25.0:
                deduped.pop(1)
                changed = True
                continue

        # Check end hook: deduped[-3] -> deduped[-2] -> deduped[-1]
        if len(deduped) >= 3:
            ax, ay = proj.to_xy(*deduped[-3])
            bx, by = proj.to_xy(*deduped[-2])
            cx, cy = proj.to_xy(*deduped[-1])
            v1x, v1y = ax - bx, ay - by
            v2x, v2y = cx - bx, cy - by
            len1 = math.hypot(v1x, v1y)
            len2 = math.hypot(v2x, v2y)
            if len1 > 0.1 and len2 > 0.1:
                cos_angle = (v1x * v2x + v1y * v2y) / (len1 * len2)
                if cos_angle > 0.82 and len2 < 25.0:
                    deduped.pop(-2)
                    changed = True

    return deduped


def _solve_route_on_network(
    origin_lonlat: Coord,
    dest_lonlat: Coord,
    base_graph: Dict[Coord, List[Tuple[Coord, float, float, str, str]]],
    edges_list: List[Tuple[Coord, Coord, float, float, str, str]],
    proj: _LocalProjection,
) -> Optional[Tuple[List[Coord], float, Dict[Tuple[Coord, Coord], Tuple[str, str]]]]:
    """
    Projects origin and destination onto the closest edges of the topological network,
    inserts virtual access nodes, and finds the globally optimal path via Dijkstra.
    Returns (cleaned_path, total_distance_meters, edge_meta_lookup) or None if unreachable.
    """
    if not base_graph or not edges_list:
        return None

    ox, oy = proj.to_xy(*origin_lonlat)
    dx, dy = proj.to_xy(*dest_lonlat)

    # Evaluate perpendicular projection of origin and destination onto every edge
    orig_candidates = []
    dest_candidates = []

    for idx, (u, v, cost, dist_m, name, t_type) in enumerate(edges_list):
        ux, uy = proj.to_xy(*u)
        vx, vy = proj.to_xy(*v)
        mult = (cost / dist_m) if dist_m > 0 else 1.0

        pox, poy, to, do = _project_point_to_segment_xy(ox, oy, ux, uy, vx, vy)
        orig_candidates.append((do, idx, to, proj.to_lonlat(pox, poy), mult))

        pdx, pdy, td, dd = _project_point_to_segment_xy(dx, dy, ux, uy, vx, vy)
        dest_candidates.append((dd, idx, td, proj.to_lonlat(pdx, pdy), mult))

    orig_candidates.sort(key=lambda item: item[0])
    dest_candidates.sort(key=lambda item: item[0])

    min_orig_d = orig_candidates[0][0]
    min_dest_d = dest_candidates[0][0]

    # Select nearby candidate edges (closest edge + any edge within min_dist + 25m, up to 6 edges)
    # This prevents snapping to a road on the wrong side of a building and looping around!
    selected_orig = [
        c for c in orig_candidates[:6] if c[0] <= max(min_orig_d + 25.0, 35.0)
    ] or [orig_candidates[0]]
    selected_dest = [
        c for c in dest_candidates[:6] if c[0] <= max(min_dest_d + 25.0, 35.0)
    ] or [dest_candidates[0]]

    # Clone adjacency graph so we can split the candidate edges at the exact projection points
    working_graph: Dict[Coord, List[Tuple[Coord, float, float, str, str]]] = {
        node: list(nbrs) for node, nbrs in base_graph.items()
    }
    edge_meta: Dict[Tuple[Coord, Coord], Tuple[str, str]] = {}
    for u, v, _cost, _dist_m, name, t_type in edges_list:
        edge_meta[(u, v)] = (name, t_type)
        edge_meta[(v, u)] = (name, t_type)

    # Group splits by edge index so if origin and destination project onto the SAME edge,
    # the edge is split into sub-segments [u -> proj1 -> proj2 -> v] allowing direct travel!
    edge_splits: Dict[int, List[Tuple[float, Coord]]] = {}
    for _d, idx, t_param, p_coord, _mult in selected_orig:
        edge_splits.setdefault(idx, []).append((t_param, p_coord))
    for _d, idx, t_param, p_coord, _mult in selected_dest:
        edge_splits.setdefault(idx, []).append((t_param, p_coord))

    for idx, splits in edge_splits.items():
        u, v, cost, dist_m, name, t_type = edges_list[idx]
        mult = (cost / dist_m) if dist_m > 0 else 1.0
        all_pts = [(0.0, u)] + sorted(splits, key=lambda s: s[0]) + [(1.0, v)]
        chain: List[Coord] = []
        for _, pt in all_pts:
            if not chain or _haversine_float(chain[-1][0], chain[-1][1], pt[0], pt[1]) >= 0.05:
                chain.append(pt)
        for k in range(len(chain) - 1):
            a, b = chain[k], chain[k + 1]
            seg_d = _haversine_float(a[0], a[1], b[0], b[1])
            seg_cost = seg_d * mult
            working_graph.setdefault(a, []).append((b, seg_cost, seg_d, name, t_type))
            working_graph.setdefault(b, []).append((a, seg_cost, seg_d, name, t_type))
            edge_meta[(a, b)] = (name, t_type)
            edge_meta[(b, a)] = (name, t_type)

    # Virtual sentinel coordinates for exact origin and destination
    start_sentinel: Coord = (round(origin_lonlat[0], 7) - 1000.0, round(origin_lonlat[1], 7))
    end_sentinel: Coord = (round(dest_lonlat[0], 7) + 1000.0, round(dest_lonlat[1], 7))
    working_graph[start_sentinel] = []
    working_graph.setdefault(end_sentinel, [])

    # Access penalty slightly > 1.0 prefers using pathways over off-path straight lines
    access_penalty = 1.25
    for d_m, _idx, _t, p_coord, mult in selected_orig:
        true_d = _haversine_float(origin_lonlat[0], origin_lonlat[1], p_coord[0], p_coord[1])
        # Penalize entering via a heavily weighted track (e.g. vehicle road in walking mode)
        working_graph[start_sentinel].append(
            (p_coord, true_d * access_penalty * mult, true_d, "Access Path", "access")
        )

    for d_m, _idx, _t, p_coord, mult in selected_dest:
        true_d = _haversine_float(dest_lonlat[0], dest_lonlat[1], p_coord[0], p_coord[1])
        working_graph.setdefault(p_coord, []).append(
            (end_sentinel, true_d * access_penalty * mult, true_d, "Access Path", "access")
        )

    # If origin and destination are very close to each other (< 25m) and tracks are further away,
    # allow direct connection
    direct_dist = _haversine_float(origin_lonlat[0], origin_lonlat[1], dest_lonlat[0], dest_lonlat[1])
    if direct_dist <= 25.0 or (min_orig_d + min_dest_d > direct_dist * 1.2 and direct_dist <= 60.0):
        working_graph[start_sentinel].append(
            (end_sentinel, direct_dist * 1.5, direct_dist, "Direct Path", "access")
        )

    # Dijkstra's Algorithm
    queue: List[Tuple[float, Coord]] = [(0.0, start_sentinel)]
    costs: Dict[Coord, float] = {start_sentinel: 0.0}
    true_dists: Dict[Coord, float] = {start_sentinel: 0.0}
    prev_node: Dict[Coord, Optional[Coord]] = {start_sentinel: None}

    while queue:
        curr_cost, curr = heapq.heappop(queue)
        if curr == end_sentinel:
            break
        if curr_cost > costs.get(curr, float("inf")):
            continue

        for nbr, edge_cost, edge_dist, _ename, _etype in working_graph.get(curr, []):
            new_cost = curr_cost + edge_cost
            if new_cost < costs.get(nbr, float("inf")):
                costs[nbr] = new_cost
                true_dists[nbr] = true_dists[curr] + edge_dist
                prev_node[nbr] = curr
                heapq.heappush(queue, (new_cost, nbr))

    if end_sentinel not in prev_node or prev_node[end_sentinel] is None:
        return None

    # Reconstruct node chain excluding sentinels
    chain_nodes: List[Coord] = []
    curr_ptr = prev_node[end_sentinel]
    while curr_ptr is not None and curr_ptr != start_sentinel:
        chain_nodes.append(curr_ptr)
        curr_ptr = prev_node.get(curr_ptr)
    chain_nodes.reverse()

    full_path: List[Coord] = [origin_lonlat] + chain_nodes + [dest_lonlat]
    cleaned = _clean_path(full_path)

    # Recalculate true physical distance along the cleaned path
    total_dist = 0.0
    for i in range(len(cleaned) - 1):
        total_dist += _haversine_float(cleaned[i][0], cleaned[i][1], cleaned[i + 1][0], cleaned[i + 1][1])

    return cleaned, total_dist, edge_meta


def _bearing_degrees(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    dlon = math.radians(lon2 - lon1)
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    y = math.sin(dlon) * math.cos(rlat2)
    x = math.cos(rlat1) * math.sin(rlat2) - math.sin(rlat1) * math.cos(rlat2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _compass_direction(bearing: float) -> str:
    directions = [
        "north",
        "northeast",
        "east",
        "southeast",
        "south",
        "southwest",
        "west",
        "northwest",
    ]
    idx = int(round(bearing / 45.0)) % 8
    return directions[idx]


def _turn_phrase(prev_bearing: float, new_bearing: float) -> Optional[str]:
    diff = (new_bearing - prev_bearing + 540.0) % 360.0 - 180.0
    abs_diff = abs(diff)
    if abs_diff < 28.0:
        return None
    if abs_diff < 55.0:
        return "Turn slight right" if diff > 0 else "Turn slight left"
    if abs_diff < 135.0:
        return "Turn right" if diff > 0 else "Turn left"
    return "Make a sharp right" if diff > 0 else "Make a sharp left"


def _format_distance(meters: float) -> str:
    m = max(1, round(meters))
    return f"{m / 1000:.1f} km" if m >= 1000 else f"{m} m"


def _format_duration(meters: float, speed_m_per_min: float) -> str:
    if meters < 15:
        return "< 1 min"
    mins = max(1, round(meters / speed_m_per_min))
    return f"{mins} min" if mins == 1 else f"{mins} mins"


def _build_turn_by_turn_steps(
    path: List[Coord],
    edge_meta: Dict[Tuple[Coord, Coord], Tuple[str, str]],
    mode: str,
    speed_m_per_min: float,
) -> List[dict]:
    if len(path) < 2:
        return []

    verb = "Drive" if mode == "driving" else "Walk"
    raw_segs = []
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        dist = _haversine_float(u[0], u[1], v[0], v[1])
        if dist < 0.2:
            continue
        bearing = _bearing_degrees(u[0], u[1], v[0], v[1])
        name, t_type = edge_meta.get((u, v), ("", ""))
        raw_segs.append((u, v, dist, bearing, name))

    if not raw_segs:
        return [
            {
                "instruction": "You have arrived at your destination.",
                "distance_text": "0 m",
                "duration_text": "Now",
                "polyline": "",
            }
        ]

    # Group consecutive segments into navigation steps based on significant turns or track name changes
    steps: List[dict] = []
    curr_coords: List[Coord] = [raw_segs[0][0], raw_segs[0][1]]
    curr_dist = raw_segs[0][2]
    curr_name = raw_segs[0][4]
    first_bearing = raw_segs[0][3]
    curr_instruction = (
        f"Head {_compass_direction(first_bearing)} on {curr_name}"
        if curr_name and curr_name not in ("Access Path", "Direct Path")
        else f"{verb} {_compass_direction(first_bearing)} toward the pathway"
    )
    prev_bearing = first_bearing

    for i in range(1, len(raw_segs)):
        u, v, dist, bearing, name = raw_segs[i]
        turn = _turn_phrase(prev_bearing, bearing)
        name_changed = bool(name and name != curr_name and name not in ("Access Path", "Direct Path"))

        if (turn and curr_dist >= 8.0) or (name_changed and curr_dist >= 15.0):
            # Flush current step
            lat_lng_pts = [(lat, lon) for lon, lat in curr_coords]
            steps.append(
                {
                    "instruction": f"{curr_instruction}.",
                    "distance_text": _format_distance(curr_dist),
                    "duration_text": _format_duration(curr_dist, speed_m_per_min),
                    "polyline": encode_polyline(lat_lng_pts),
                }
            )
            curr_coords = [u, v]
            curr_dist = dist
            curr_name = name or curr_name
            action = turn or "Continue straight"
            if name and name not in ("Access Path", "Direct Path"):
                curr_instruction = f"{action} onto {name}"
            else:
                curr_instruction = f"{action} ({_compass_direction(bearing)})"
        else:
            curr_coords.append(v)
            curr_dist += dist
            if not curr_name and name:
                curr_name = name
        if dist >= 2.0:
            prev_bearing = bearing

    # Flush final traversal step
    lat_lng_pts = [(lat, lon) for lon, lat in curr_coords]
    steps.append(
        {
            "instruction": f"{curr_instruction}.",
            "distance_text": _format_distance(curr_dist),
            "duration_text": _format_duration(curr_dist, speed_m_per_min),
            "polyline": encode_polyline(lat_lng_pts),
        }
    )

    steps.append(
        {
            "instruction": "Arrive at your destination.",
            "distance_text": "Finish",
            "duration_text": "",
            "polyline": "",
        }
    )
    return steps


def dijkstra_route(origin: dict, destination: dict, mode: str = "walking") -> dict:
    """
    Calculates an accurate, mode-aware shortest path using a topologically split graph
    (supporting X-intersections, T-junctions, and perpendicular edge projection).
    Separates pedestrian pathways from vehicle roads based on `mode` ('walking' vs 'driving').
    """
    norm_mode = normalize_travel_mode(mode)
    speed = DRIVING_METERS_PER_MIN if norm_mode == "driving" else WALKING_METERS_PER_MIN
    mode_label = "Campus Driving Route" if norm_mode == "driving" else "Campus Walking Route"

    all_tracks = list(Track.objects.all())
    if not all_tracks:
        return _fallback_route(origin, destination, f"No {norm_mode} tracks available on campus.", mode=norm_mode)

    origin_lonlat: Coord = _round_coord((float(origin["longitude"]), float(origin["latitude"])))
    dest_lonlat: Coord = _round_coord((float(destination["longitude"]), float(destination["latitude"])))

    # If the user's device GPS is off-campus (> 3 km from all campus tracks, e.g. testing from Lagos),
    # automatically start the campus route from Bowen University Main Gate (closest track node to 7.621044, 4.190647)
    # instead of drawing a 150+ km straight line across the map.
    main_gate_lonlat: Coord = (4.190647, 7.621044)
    min_dist_to_network = float("inf")
    closest_gate_vertex: Optional[Coord] = None
    min_gate_dist = float("inf")

    for t in all_tracks:
        if not t.geometry:
            continue
        for lon, lat in t.geometry.coords:
            d_orig = _haversine_float(origin_lonlat[0], origin_lonlat[1], lon, lat)
            if d_orig < min_dist_to_network:
                min_dist_to_network = d_orig
            d_gate = _haversine_float(main_gate_lonlat[0], main_gate_lonlat[1], lon, lat)
            if d_gate < min_gate_dist:
                min_gate_dist = d_gate
                closest_gate_vertex = _round_coord((lon, lat))

    if min_dist_to_network > 3000.0 and closest_gate_vertex is not None:
        origin_lonlat = closest_gate_vertex
        mode_label = f"From Main Gate • {mode_label}"

    proj = _LocalProjection(
        ref_lon=(origin_lonlat[0] + dest_lonlat[0]) / 2.0,
        ref_lat=(origin_lonlat[1] + dest_lonlat[1]) / 2.0,
    )

    classified: List[Tuple[Track, str]] = [(t, resolve_track_type(t)) for t in all_tracks]

    solution = None

    if norm_mode == "driving":
        # Vehicles strictly use vehicle or shared ('both') roads, NEVER pedestrian footpaths
        vehicle_tracks = [
            (t, et, 1.0)
            for t, et in classified
            if et in (Track.TRACK_TYPE_VEHICLE, Track.TRACK_TYPE_BOTH)
        ]
        # Fallback to all tracks only if no vehicle/both tracks exist in DB at all
        if not vehicle_tracks:
            vehicle_tracks = [(t, et, 1.0) for t, et in classified]

        graph, edges = _build_topological_network(vehicle_tracks, proj)
        solution = _solve_route_on_network(origin_lonlat, dest_lonlat, graph, edges, proj)
    else:
        # Walking (pedestrian) mode:
        # 1. First try strictly pedestrian + shared ('both') pathways so pedestrians aren't
        #    routed onto vehicle roads when pedestrian walkways exist.
        ped_tracks = [
            (t, et, 1.0)
            for t, et in classified
            if et in (Track.TRACK_TYPE_PEDESTRIAN, Track.TRACK_TYPE_BOTH)
        ]
        direct_dist = _haversine_float(origin_lonlat[0], origin_lonlat[1], dest_lonlat[0], dest_lonlat[1])

        if ped_tracks:
            ped_graph, ped_edges = _build_topological_network(ped_tracks, proj)
            ped_sol = _solve_route_on_network(origin_lonlat, dest_lonlat, ped_graph, ped_edges, proj)
            if ped_sol is not None:
                ped_path, ped_dist, _ = ped_sol
                # Check that origin and destination aren't stranded far from the pedestrian network
                start_gap = (
                    _haversine_float(origin_lonlat[0], origin_lonlat[1], ped_path[1][0], ped_path[1][1])
                    if len(ped_path) > 2
                    else 0.0
                )
                end_gap = (
                    _haversine_float(dest_lonlat[0], dest_lonlat[1], ped_path[-2][0], ped_path[-2][1])
                    if len(ped_path) > 2
                    else 0.0
                )
                # Accept strict pedestrian route if access gaps are reasonable and it's not an extreme detour
                if start_gap <= 120.0 and end_gap <= 120.0 and ped_dist <= max(direct_dist * 2.6, direct_dist + 250.0):
                    solution = ped_sol

        # 2. If strict pedestrian network couldn't connect origin & destination cleanly,
        #    build a combined network where pedestrian/shared tracks have 1.0x weight and
        #    vehicle roads have a 3.0x penalty (used only to bridge disconnected segments).
        if solution is None:
            hybrid_tracks = [
                (
                    t,
                    et,
                    1.0 if et in (Track.TRACK_TYPE_PEDESTRIAN, Track.TRACK_TYPE_BOTH) else 3.0,
                )
                for t, et in classified
            ]
            hyb_graph, hyb_edges = _build_topological_network(hybrid_tracks, proj)
            solution = _solve_route_on_network(origin_lonlat, dest_lonlat, hyb_graph, hyb_edges, proj)

    if solution is None:
        return _fallback_route(origin, destination, "No continuous path found to the destination.", mode=norm_mode)

    path, total_distance_m, edge_meta = solution
    rounded_distance = max(1, round(total_distance_m))
    minutes = max(1, round(total_distance_m / speed))

    lat_lng_path = [(lat, lon) for lon, lat in path]
    encoded_polyline = encode_polyline(lat_lng_path)
    steps = _build_turn_by_turn_steps(path, edge_meta, norm_mode, speed)

    return {
        "provider": "bowen-routing",
        "mode": norm_mode,
        "status": "OK",
        "summary": mode_label,
        "distance_text": _format_distance(rounded_distance),
        "duration_text": f"{minutes} min" if minutes == 1 else f"{minutes} mins",
        "overview_polyline": encoded_polyline,
        "steps": steps,
    }


def _fallback_route(origin: dict, destination: dict, reason: str, mode: str = "walking") -> dict:
    from .google import fallback_directions

    res = fallback_directions(origin, destination, mode=mode)
    res["summary"] = reason
    return res
