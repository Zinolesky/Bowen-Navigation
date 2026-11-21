# API Contract

Base URL (Docker Compose): `http://127.0.0.1:8001/api/`

All endpoints except `health/`, `auth/login/`, and `auth/refresh/` require:

```text
Authorization: Bearer <access_token>
```

---

## Authentication

### `POST /api/auth/login/`

Student login requires `full_name` and `matric_number`. Staff admin accounts (`is_staff_admin=true` or `is_staff=true`) additionally require `password`.

Request (Student):

```json
{
  "full_name": "Taigbenu Efezino",
  "matric_number": "BU22CSC1136"
}
```

Request (Staff Admin):

```json
{
  "full_name": "Campus Admin",
  "matric_number": "ADMIN001",
  "password": "ADMIN001"
}
```

Response (`200 OK`):

```json
{
  "access": "jwt-access-token",
  "refresh": "jwt-refresh-token",
  "user": {
    "id": 1,
    "full_name": "Taigbenu Efezino",
    "matric_number": "BU22CSC1136",
    "is_staff_admin": false
  }
}
```

### `POST /api/auth/refresh/`

Request: `{ "refresh": "<refresh_token>" }` -> Response: `{ "access": "<new_access_token>" }`.

---

## Campus Data

### `GET /api/bootstrap/`

Single-roundtrip campus payload used by the mobile client. Supports `ETag` / `If-None-Match` conditional requests (`304 Not Modified`).

Query parameters:

- `include_sprites=true`: embeds base64 PNG marker sprites on POI features (`false` by default).

Response (`200 OK`):

```json
{
  "version": 1,
  "categories": [...],
  "pois": { "type": "FeatureCollection", "features": [...] },
  "tracks": { "type": "FeatureCollection", "features": [...] }
}
```

### `GET /api/categories/`

Returns POI categories with color and icon identifiers (supports `ETag` / `304`).

### `GET /api/buildings/`

Returns building records with latitude and longitude.

### `GET /api/pois/`

Returns GeoJSON `FeatureCollection` of active POIs (supports `ETag` / `304` when unfiltered).

Query parameters:

- `include_sprites=true`: includes base64 marker sprites (`marker_icon_default`, `marker_icon_compact`, `marker_icon_selected`, `marker_icon_destination`, `marker_anchor_x`); omitted by default for compact payloads.
- `search`: case-insensitive POI, description, category, or building search
- `category`: category slug filter
- `include_inactive=true`: includes inactive POIs

### `POST /api/pois/`, `PUT /api/pois/{id}/`, `PATCH /api/pois/{id}/`, `DELETE /api/pois/{id}/`

Requires a JWT user with `is_staff_admin=true` (students receive `403 Forbidden`).

Create/update request:

```json
{
  "name": "New Lecture Hall",
  "category_id": 1,
  "description": "Lecture venue near the academic core.",
  "operating_hours": "Mon-Fri, 8:00 AM - 5:00 PM",
  "icon_identifier": "school",
  "google_place_id": "",
  "latitude": 7.6215,
  "longitude": 4.199,
  "is_active": true
}
```

### `GET /api/tracks/`

Returns GeoJSON `FeatureCollection` of campus pathways as `LineString` features (supports optional `track_type=pedestrian|vehicle|both` filter and `ETag` / `304`).

---

## Campus Routing & Directions

### `POST /api/directions/`

Computes a mode-aware route over Bowen campus `Track` geometry using a cached topological graph and admissible A\* search. Off-campus origins (>3 km from campus tracks) automatically originate from Bowen Main Gate (`7.621044, 4.190647`).

Request:

```json
{
  "origin": { "latitude": 7.62105, "longitude": 4.19066 },
  "destination": { "latitude": 7.62154, "longitude": 4.19172 },
  "mode": "walking",
  "include_alternate": true
}
```

Response (`200 OK`):

```json
{
  "provider": "bowen-routing",
  "mode": "walking",
  "status": "OK",
  "summary": "Campus Walking Route",
  "distance_text": "131 m",
  "duration_text": "2 mins",
  "distance_meters": 131,
  "duration_seconds": 98,
  "duration_badge_uri": "data:image/png;base64,...",
  "overview_polyline": "encoded-polyline",
  "steps": [
    {
      "instruction": "Head northeast on Bowen Campus Main Road.",
      "distance_text": "131 m",
      "duration_text": "2 mins",
      "distance_meters": 131.0,
      "duration_seconds": 98,
      "maneuver": "depart",
      "road_name": "Bowen Campus Main Road",
      "start_location": { "latitude": 7.62105, "longitude": 4.19066 },
      "end_location": { "latitude": 7.62154, "longitude": 4.19172 },
      "polyline": "encoded-step-polyline"
    }
  ],
  "alternate_modes": {
    "walking": {
      "distance_text": "131 m",
      "duration_text": "2 mins",
      "distance_meters": 131,
      "duration_seconds": 98
    },
    "driving": {
      "distance_text": "131 m",
      "duration_text": "1 min",
      "distance_meters": 131,
      "duration_seconds": 20
    }
  }
}
```

If no tracks are present in PostGIS, `/api/directions/` returns a `local-fallback` direct route preview.

---

## Google Places Proxy

### `POST /api/places/details/`

Request:

```json
{
  "place_id": "google-place-id"
}
```

Proxies and caches Google Place Details (1h TTL). Photo items include `photo_reference` and `proxy_path` (`/places/photo/?ref=...`) rather than raw Google URLs containing `GOOGLE_PLACES_API_KEY`.

### `GET /api/places/photo/?ref=<photo_reference>&maxwidth=800`

Requires `Authorization: Bearer <access_token>`. Streams the cached place image (`image/jpeg`, 24h server cache + `Cache-Control: private, max-age=86400`) without exposing the server API key.
