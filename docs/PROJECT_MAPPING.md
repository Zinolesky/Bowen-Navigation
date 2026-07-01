# Project Mapping

This implementation follows the tools and architecture specified in the project report.

## Backend Tools

- Python 3: Django project source under `backend/`.
- Django 4.x: project package `bowen_navigator`.
- Django REST Framework: API viewsets and serializers in `backend/campus/`.
- JWT: `djangorestframework-simplejwt` login flow at `/api/auth/login/`.
- PostgreSQL and PostGIS: GeoDjango database engine and GIS fields.
- GeoDjango: `PointField` for POIs/buildings and `LineStringField` for campus tracks.
- rest_framework_gis: GeoJSON serializers for `/api/pois/` and `/api/tracks/`.
- GDAL/ogr2ogr: helper script at `scripts/import_kml_tracks.ps1`.
- Google Directions API: server-side proxy at `/api/directions/`.
- Google Places API: server-side proxy at `/api/places/details/`.
- pgAdmin: included in `docker-compose.yml`.
- Postman: collection at `docs/postman/Bowen_Navigator.postman_collection.json`.

## Mobile Tools

- React Native: Expo application under `mobile/`.
- Expo SDK 56: package target in `mobile/package.json`.
- Expo Router: file-based screens under `mobile/app/`.
- TypeScript: strict app source in `mobile/src/`.
- Axios: API client in `mobile/src/api.ts`.
- react-native-maps: Google map canvas in `mobile/app/(app)/map.tsx`.
- Expo Location: device GPS permission and current-location route origin.
- Google Maps SDK: configured through `mobile/app.config.ts`.
- @mapbox/polyline: decodes backend route polylines for map overlays.
- EAS Build: APK build profile in `mobile/eas.json`.

## Report Features Implemented

- Student login with full name and matric number.
- JWT-protected campus API.
- Categorised POI markers.
- POI search by name, description, and category.
- Campus walking tracks as GeoJSON.
- Turn-by-turn walking directions through backend proxy.
- Google API key protection on the backend.
- In-app staff administration for POI create, edit, and delete.
- Seeded Bowen campus dataset and demo accounts.

