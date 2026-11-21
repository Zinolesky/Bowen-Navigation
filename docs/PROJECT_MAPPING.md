# Project Mapping

This implementation follows and extends the tools and architecture specified in the project report.

## Backend Tools

- Python 3: Django project source under `backend/`.
- Django 4.x: project package `bowen_navigator`, served via Gunicorn + WhiteNoise with GZip compression.
- Django REST Framework: JWT-protected viewsets and endpoints in `backend/campus/`.
- JWT: `djangorestframework-simplejwt` login and refresh flow at `/api/auth/login/` and `/api/auth/refresh/`.
- PostgreSQL and PostGIS: GeoDjango database engine (`django.contrib.gis.db.backends.postgis`) with persistent connection pooling (`CONN_MAX_AGE`).
- GeoDjango: `PointField` for buildings/POIs and `LineStringField` (`geography=True, srid=4326`) for campus pathways.
- `rest_framework_gis`: GeoJSON serializers for `/api/pois/`, `/api/tracks/`, and single-roundtrip `/api/bootstrap/`.
- Custom Campus Routing Engine (`backend/campus/routing.py`): precompiled, thread-safe cached topological graph with X-intersection splitting, T-junction snapping, perpendicular edge projection, mode separation (`walking` vs `driving`), admissible A\* shortest-path search, LRU route cache, and `alternate_modes` ETA computation.
- Server-Rendered Map Markers (`backend/campus/markers.py`): opt-in (`?include_sprites=true`) Pillow-rendered quantized PNG sprites and duration callouts cached via `@lru_cache`.
- GDAL/ogr2ogr: helper script at `scripts/import_kml_tracks.ps1`.
- Google Places API Proxy: authenticated `/api/places/details/` and `/api/places/photo/` endpoints with server-side caching (`GOOGLE_PLACES_API_KEY` stays strictly on the backend).
- `django-leaflet` & pgAdmin: interactive map geometry editing in Django Admin + pgAdmin in `docker-compose.yml`.
- Postman: collection at `docs/postman/Bowen_Navigator.postman_collection.json`.

## Mobile Tools

- React Native: Expo application under `mobile/`.
- Expo SDK 58: package target in `mobile/package.json`.
- Expo Router: file-based screens under `mobile/app/`.
- TypeScript: strict app source and pure geometry/navigation math helpers under `mobile/src/`.
- Axios: API client in `mobile/src/api.ts` with automatic JWT refresh persisted back to `SecureStore`.
- Shared Campus Store (`mobile/src/campusStore.tsx`): single-request `/api/bootstrap/` hydration with `ETag` / `304 Not Modified` validation and Place Details memory caching across Map, Search, and Admin tabs.
- `react-native-maps` (Google Maps SDK via `mobile/app.config.ts`) + `@mapbox/polyline`: custom campus map styling, zoom-aware POI decluttering, parallel walkway filtering, and route overlays.
- Expo Location & Expo Speech: 3-stage turn-by-turn navigation (`Place Details` -> `Route Overview` -> `Live Navigation` with spoken prompts, 3D tilted camera, off-route auto-rerouting, arrival detection, and off-campus Demo simulation).
- EAS Build: APK build profile in `mobile/eas.json`.

## Report Features Implemented

- Student login with full name and matric number, plus password-verified staff admin login.
- Strict JWT-protected campus API and role-based POI administration.
- Categorised POI markers with collision-free zoom decluttering.
- Campus-wide POI search by name, description, and category + searchable origin picker.
- Pedestrian walkways and vehicle driveways as GeoJSON `LineString` tracks.
- Custom mode-aware turn-by-turn walking & driving directions through the Django routing engine.
- Google Places Details & Photo proxy protecting the backend API key.
- In-app staff administration for POI create, edit, GPS autofill, and delete.
- Seeded Bowen campus dataset (38 buildings/POIs, 19 tracks, 6 categories) and demo accounts.
