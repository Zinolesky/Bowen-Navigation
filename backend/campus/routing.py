import heapq
import math
from typing import Dict, List, Tuple

from .google import encode_polyline, haversine_meters
from .models import Track

# Precision of 6 decimal places is ~11.1cm at the equator, perfect for walking paths.
# We round coordinates to this precision to ensure tracks snap together and form intersections.
PRECISION = 6


def _round_coord(coord: tuple) -> tuple:
    return (round(coord[0], PRECISION), round(coord[1], PRECISION))


def build_graph() -> Dict[Tuple[float, float], List[Tuple[Tuple[float, float], int]]]:
    """
    Constructs an adjacency list graph from all Track models in the database.
    Each node is a coordinate (lon, lat).
    Edges represent segments of the Track LineStrings, weighted by their haversine distance in meters.
    """
    graph = {}
    tracks = Track.objects.all()

    for track in tracks:
        # A LineString geometry is essentially a list of coordinates
        coords = track.geometry.coords
        for i in range(len(coords) - 1):
            p1 = _round_coord(coords[i])
            p2 = _round_coord(coords[i + 1])

            # Convert to dictionary format required by haversine_meters
            p1_dict = {"longitude": p1[0], "latitude": p1[1]}
            p2_dict = {"longitude": p2[0], "latitude": p2[1]}
            
            distance = haversine_meters(p1_dict, p2_dict)

            # Initialize node adjacency lists
            if p1 not in graph:
                graph[p1] = []
            if p2 not in graph:
                graph[p2] = []

            # It's an undirected graph (can walk both ways)
            graph[p1].append((p2, distance))
            graph[p2].append((p1, distance))

    return graph


def find_nearest_node(graph: Dict, target: dict) -> Tuple[float, float]:
    """
    Finds the node in the graph that is closest to the given target coordinate.
    target is a dict: {"longitude": float, "latitude": float}
    """
    min_dist = float("inf")
    nearest = None

    for node in graph.keys():
        node_dict = {"longitude": node[0], "latitude": node[1]}
        dist = haversine_meters(node_dict, target)
        if dist < min_dist:
            min_dist = dist
            nearest = node

    return nearest


def dijkstra_route(origin: dict, destination: dict) -> dict:
    """
    Calculates the shortest path using Dijkstra's algorithm.
    Falls back to a straight line if no route can be found.
    """
    graph = build_graph()

    # If there are no tracks, we can't route
    if not graph:
        return _fallback_route(origin, destination, "No walking tracks available on campus.")

    start_node = find_nearest_node(graph, origin)
    end_node = find_nearest_node(graph, destination)

    if not start_node or not end_node:
        return _fallback_route(origin, destination, "Destination is too far from campus walking tracks.")

    # Dijkstra's Algorithm
    queue = [(0, start_node)]
    distances = {node: float("inf") for node in graph}
    distances[start_node] = 0
    previous_nodes = {node: None for node in graph}

    while queue:
        current_distance, current_node = heapq.heappop(queue)

        if current_node == end_node:
            break

        if current_distance > distances[current_node]:
            continue

        for neighbor, weight in graph[current_node]:
            distance = current_distance + weight
            if distance < distances[neighbor]:
                distances[neighbor] = distance
                previous_nodes[neighbor] = current_node
                heapq.heappush(queue, (distance, neighbor))

    # Reconstruct path
    path = []
    current = end_node
    while current is not None:
        path.insert(0, current)
        current = previous_nodes[current]

    # If the start node is not the first item, a continuous path could not be found
    if path[0] != start_node:
        return _fallback_route(origin, destination, "No continuous path found to the destination.")

    # Convert the path (list of (lon, lat)) to the Google directions format
    # The frontend expects overview_polyline, distance, duration, etc.
    total_distance = distances[end_node]
    minutes = max(1, round(total_distance / 80))  # Assuming an average walking speed of 80m/min

    # encode_polyline expects (latitude, longitude) pairs
    lat_lng_path = [(lat, lon) for lon, lat in path]
    encoded_polyline = encode_polyline(lat_lng_path)

    return {
        "provider": "bowen-routing",
        "status": "OK",
        "summary": "Campus Walking Route",
        "distance_text": f"{total_distance / 1000:.1f} km" if total_distance >= 1000 else f"{total_distance} m",
        "duration_text": f"{minutes} min",
        "overview_polyline": encoded_polyline,
        "steps": [
            {
                "instruction": "Walk to the nearest path.",
                "distance_text": "Start",
                "duration_text": "Now",
                "polyline": "",
            },
            {
                "instruction": "Follow the campus walking tracks.",
                "distance_text": f"{total_distance} m",
                "duration_text": f"{minutes} min",
                "polyline": "",
            },
            {
                "instruction": "Arrive at your destination.",
                "distance_text": "Finish",
                "duration_text": "",
                "polyline": "",
            },
        ],
    }


def _fallback_route(origin: dict, destination: dict, reason: str) -> dict:
    from .google import fallback_directions
    res = fallback_directions(origin, destination)
    res["summary"] = reason
    return res
