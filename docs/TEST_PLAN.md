# Bowen Navigator Test Plan

## Functional & Security Testing

- Unauthenticated requests return `401 Unauthorized` across `/api/categories/`, `/api/buildings/`, `/api/pois/`, `/api/tracks/`, `/api/bootstrap/`, `/api/directions/`, `/api/places/details/`, and `/api/places/photo/`.
- Student login accepts the seeded student account (`full_name` + `matric_number`) and rejects wrong matriculation numbers or mismatched names (`400 Bad Request`).
- Staff admin login requires a valid `password` (`400` if missing/incorrect, `200` with `is_staff_admin=true` when valid).
- Non-admin student JWT attempting `POST`, `PATCH`, or `DELETE` on `/api/pois/` returns `403 Forbidden`.
- `/api/pois/` omits marker sprites by default and embeds them when `?include_sprites=true`; `/api/bootstrap/` returns `categories`, `pois`, `tracks`, `version` and honors `If-None-Match` (`304 Not Modified`).
- `/api/tracks/` returns valid GeoJSON `LineString` features tagged with `track_type`.
- `/api/directions/` separates `walking` vs `driving` pathways, resolves X-intersections & T-junctions accurately, returns `alternate_modes`, and invalidates its cached graph when a `Track` changes.
- `/api/places/details/` returns `proxy_path` without exposing `GOOGLE_PLACES_API_KEY`, and `/api/places/photo/` streams cached image bytes.
- Non-admin users do not see the Admin tab on mobile.

## Integration Testing

- Verify the mobile app talks exclusively to the Django backend (`:8001/api`) for directions, campus data, and Places details/photos.
- Confirm Google server keys exist only in `backend/.env`.
- Inspect API responses in Postman using `docs/postman/Bowen_Navigator.postman_collection.json`.
- Confirm PostGIS stores POIs as `PointField` and tracks as `LineStringField`.

## User Acceptance Testing

Ask students to complete these tasks:

1. Log in with student credentials (`full_name` + `matric_number`) — without pre-filled personal defaults.
2. Browse the map, toggle categories, and tap any POI (e.g., Timothy Olagbenro Library) to inspect Place Details (Stage 1).
3. Search for a hostel or faculty building on the Search tab and select it to focus the map.
4. Tap `Directions` to inspect the Route Overview (Stage 2), switch Walk/Drive modes, and open `All places` to pick an alternate origin.
5. Tap `Start` to launch Live Turn-by-Turn Navigation (Stage 3), test the `▶ Demo` / `Pause` simulator and voice mute toggle, and verify live remaining distance/ETA updates and exit back to overview.
6. Log in as Staff Admin (with password), create/edit a POI using `Use My GPS`, and verify it appears immediately on Map and Search tabs.

## Backend Commands

```powershell
docker compose exec backend python manage.py test
```

## Mobile Commands

```powershell
cd mobile
npm run typecheck
npm test
npm run lint
```
