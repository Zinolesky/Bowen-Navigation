from __future__ import annotations

import html
import math
import re
from typing import Iterable


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", "", value or "")
    return html.unescape(text).strip()


def haversine_meters(origin: dict, destination: dict) -> int:
    radius = 6371000
    lat1 = math.radians(float(origin["latitude"]))
    lat2 = math.radians(float(destination["latitude"]))
    dlat = lat2 - lat1
    dlon = math.radians(float(destination["longitude"]) - float(origin["longitude"]))
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return round(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def encode_polyline(points: Iterable[tuple[float, float]]) -> str:
    previous_lat = 0
    previous_lng = 0
    result = []

    for latitude, longitude in points:
        lat = int(round(latitude * 1e5))
        lng = int(round(longitude * 1e5))
        for value in (lat - previous_lat, lng - previous_lng):
            value = ~(value << 1) if value < 0 else value << 1
            while value >= 0x20:
                result.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            result.append(chr(value + 63))
        previous_lat = lat
        previous_lng = lng

    return "".join(result)


def normalize_google_directions(payload: dict) -> dict:
    routes = payload.get("routes", [])
    if not routes:
        return {
            "provider": "google",
            "status": payload.get("status", "ZERO_RESULTS"),
            "overview_polyline": "",
            "steps": [],
            "raw": payload,
        }

    route = routes[0]
    leg = (route.get("legs") or [{}])[0]
    steps = []
    for step in leg.get("steps", []):
        steps.append(
            {
                "instruction": strip_html(step.get("html_instructions", "")),
                "distance_text": step.get("distance", {}).get("text", ""),
                "duration_text": step.get("duration", {}).get("text", ""),
                "polyline": step.get("polyline", {}).get("points", ""),
            }
        )

    return {
        "provider": "google",
        "status": payload.get("status", "OK"),
        "summary": route.get("summary", ""),
        "distance_text": leg.get("distance", {}).get("text", ""),
        "duration_text": leg.get("duration", {}).get("text", ""),
        "overview_polyline": route.get("overview_polyline", {}).get("points", ""),
        "steps": steps,
        "raw": payload,
    }


def fallback_directions(origin: dict, destination: dict) -> dict:
    mid_lat = (float(origin["latitude"]) + float(destination["latitude"])) / 2
    mid_lng = (float(origin["longitude"]) + float(destination["longitude"])) / 2
    points = [
        (float(origin["latitude"]), float(origin["longitude"])),
        (mid_lat, float(origin["longitude"])),
        (mid_lat, mid_lng),
        (float(destination["latitude"]), float(destination["longitude"])),
    ]
    distance = haversine_meters(origin, destination)
    minutes = max(2, round(distance / 80))

    return {
        "provider": "local-fallback",
        "status": "OK",
        "summary": "Development route preview",
        "distance_text": f"{distance / 1000:.1f} km" if distance >= 1000 else f"{distance} m",
        "duration_text": f"{minutes} min",
        "overview_polyline": encode_polyline(points),
        "steps": [
            {
                "instruction": "Start from your current campus position.",
                "distance_text": "Start",
                "duration_text": "Now",
                "polyline": "",
            },
            {
                "instruction": "Follow the highlighted walking path toward the selected point of interest.",
                "distance_text": f"{distance} m",
                "duration_text": f"{minutes} min",
                "polyline": "",
            },
            {
                "instruction": "Arrive at the selected destination.",
                "distance_text": "Finish",
                "duration_text": "",
                "polyline": "",
            },
        ],
    }

