# API Contract

Base URL (Docker Compose): `http://127.0.0.1:8001/api/`

- **Public / Guest Read-Only Endpoints**: `GET /api/health/`, `POST /api/auth/login/`, `POST /api/auth/register/`, `POST /api/auth/refresh/`, `GET /api/bootstrap/`, `GET /api/categories/`, `GET /api/buildings/`, `GET /api/pois/` (active POIs only unless authenticated Staff Admin), `GET /api/tracks/`, `POST /api/directions/`.
- **JWT Authenticated Endpoints**: `POST /api/places/details/`, `GET /api/places/photo/`.
- **Staff Admin (`is_staff_admin=true`) Only**: `POST`/`PUT`/`PATCH`/`DELETE /api/pois/`, `GET /api/pois/?include_inactive=true`, `POST /api/admin/import-students/`.

All authenticated calls require:

```text
Authorization: Bearer <access_token>
```

---

## Health & Authentication

### `GET /api/health/`

Verifies PostgreSQL/PostGIS and Redis cache readiness without throttling. Returns HTTP `200` when the database is healthy (`"ok"` or `"degraded"` if cache fails) and `503` if PostgreSQL is unreachable.

```json
{
  "status": "ok",
  "service": "Bowen Navigator API",
  "checks": {
    "database": "ok",
    "cache": "ok"
  },
  "latency_ms": 2.41
}
```

### `POST /api/auth/register/`

Rate-limited (`20/min` per IP). Creates a new student account (`is_staff_admin=false`) and returns JWT tokens.

Request:

```json
{
  "full_name": "Ada Lovelace",
  "matric_number": "BU23CSC1042",
  "email": "ada@bowen.edu.ng",
  "password": "securePassword"
}
```

Response (`201 Created`):

```json
{
  "access": "jwt-access-token",
  "refresh": "jwt-refresh-token",
  "user": {
    "id": 3,
    "full_name": "Ada Lovelace",
    "matric_number": "BU23CSC1042",
    "email": "ada@bowen.edu.ng",
    "is_staff_admin": false
  }
}
```

### `POST /api/auth/login/`

Rate-limited (`20/min` per IP). Requires `matric_number` and `password` (`full_name` is optional).

Request:

```json
{
  "matric_number": "BU22CSC1136",
  "password": "BU22CSC1136"
}
```

Response (`200 OK`): same `{ access, refresh, user }` payload.

### `POST /api/auth/refresh/`

Request: `{ "refresh": "<refresh_token>" }` -> Response: `{ "access": "<new_access_token>" }`.

### `POST /api/admin/import-students/`

Staff Admin only (`403` for students, `401` for guests). Accepts either `{"csv_text": "..."}` or multipart `file` upload (UTF-8 CSV with columns `matric_number,full_name,email,password`). Preserves protected staff/admin accounts.

Response (`200 OK`):

```json
{
  "created": 12,
  "updated": 4,
  "skipped": 1,
  "errors": []
}
```

---

## Campus Data

### `GET /api/bootstrap/`

Single-roundtrip campus payload used by the mobile client and persisted on disk for offline use. Supports `ETag` / `If-None-Match` (`304 Not Modified`).

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

- `include_sprites=true`: includes base64 marker sprites; omitted by default.
- `search`: case-insensitive POI, description, category, or building search.
- `category`: category slug filter.
- `include_inactive=true`: honored only for authenticated Staff Admin accounts.

### `POST /api/pois/`, `PUT /api/pois/{id}/`, `PATCH /api/pois/{id}/`, `DELETE /api/pois/{id}/`

Staff Admin only (`403 Forbidden` for students, `401 Unauthorized` for guests). Creating or updating a POI automatically keeps its associated `Building` record synchronized.

### `GET /api/tracks/`

Returns GeoJSON `FeatureCollection` of campus pathways as `LineString` features (`track_type=pedestrian|vehicle|both`, supports `ETag` / `304`).

---

## Campus Routing & Directions

### `POST /api/directions/`

Computes a mode-aware route over Bowen campus `Track` geometry using a Redis-synchronized topological graph cache and admissible A\* search (suppressing false-positive curve turns along continuously named roads). Off-campus origins (>3 km from campus tracks) originate from Bowen Main Gate (`7.621044, 4.190647`).

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

---

## Google Places Proxy

### `POST /api/places/details/` & `GET /api/places/photo/`

Authenticated (`IsAuthenticated`) and rate-limited (`60/min`). Proxies and caches Google Place Details (1h TTL) and Place Photos (24h TTL) via `/places/photo/?ref=...&maxwidth=...` without exposing `GOOGLE_PLACES_API_KEY`.
