# API Contract

Base URL: `/api/`

All endpoints except `health/` and `auth/login/` require:

```text
Authorization: Bearer <access_token>
```

## Authentication

`POST /api/auth/login/`

Request:

```json
{
  "full_name": "Taigbenu Efezino",
  "matric_number": "BU22CSC1136"
}
```

Response:

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

## Campus Data

`GET /api/categories/`

Returns POI categories with color and icon identifiers.

`GET /api/buildings/`

Returns building records with latitude and longitude.

`GET /api/pois/`

Returns GeoJSON `FeatureCollection` of active POIs.

Query parameters:

- `search`: case-insensitive POI or category search
- `category`: category slug filter
- `include_inactive=true`: includes inactive POIs

`POST /api/pois/`, `PUT /api/pois/{id}/`, `DELETE /api/pois/{id}/`

Requires a user whose JWT includes `is_staff_admin=true`.

Create/update request:

```json
{
  "name": "New Lecture Hall",
  "category_id": 1,
  "description": "Lecture venue near the academic core.",
  "operating_hours": "Mon-Fri, 8:00 AM - 5:00 PM",
  "icon_identifier": "school",
  "latitude": 7.62408,
  "longitude": 4.18918,
  "is_active": true
}
```

`GET /api/tracks/`

Returns GeoJSON `FeatureCollection` of campus walking tracks as `LineString` features.

## Directions

`POST /api/directions/`

Request:

```json
{
  "origin": { "latitude": 7.6218, "longitude": 4.18733 },
  "destination": { "latitude": 7.62408, "longitude": 4.18918 }
}
```

Response:

```json
{
  "provider": "google",
  "status": "OK",
  "distance_text": "650 m",
  "duration_text": "8 mins",
  "overview_polyline": "encoded-polyline",
  "steps": [
    {
      "instruction": "Head east",
      "distance_text": "120 m",
      "duration_text": "2 mins"
    }
  ]
}
```

When `GOOGLE_DIRECTIONS_API_KEY` is missing or Google is unreachable, the endpoint returns a `local-fallback` response with the same shape.

## Places

`POST /api/places/details/`

Request:

```json
{
  "place_id": "google-place-id"
}
```

Returns the Google Places Details response when `GOOGLE_PLACES_API_KEY` is configured.

