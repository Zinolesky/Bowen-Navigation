# Project Mapping

Enterprise campus navigation platform for Bowen University extending the capstone specification with offline resilience, multi-worker Redis coherence, adaptive theming, and CI automation.

## Backend Architecture

- **Django 4.2 + DRF**: Viewsets and endpoints in `backend/campus/`, served by multi-worker Gunicorn (`--workers 2 --threads 4`) + WhiteNoise with GZip compression.
- **PostgreSQL + PostGIS**: GeoDjango `PointField` for buildings/POIs and `LineStringField` (`geography=True, srid=4326`) for 33 mapped pathways, with persistent connection pooling (`CONN_MAX_AGE=60`).
- **Redis Multi-Worker Cache (`django.core.cache.backends.redis.RedisCache`)**: Shared API response caching, `ETag` versioning (`campus:data_version`), and cross-worker routing graph invalidation (`campus:routing_version`).
- **Auth & Roster Governance**: Password-verified JWT login (`/api/auth/login/`), self-service student registration (`/api/auth/register/`), guest read-only browsing, and staff-admin CSV bulk student import (`/api/admin/import-students/` & `manage.py import_students_csv`).
- **Security & Throttling**: DRF rate limiting (`anon`, `user`, `auth`, `places` in `backend/campus/throttles.py`), strict staff-only mutations (`IsStaffAdminOrReadOnly`, `IsStaffAdmin`), and server-only `GOOGLE_PLACES_API_KEY` proxy.
- **Observability**: Deep readiness probe at `GET /api/health/` validating PostgreSQL + Redis latency, plus structured console logging.
- **Topological Routing Engine (`backend/campus/routing.py`)**: Compiled X-intersection/T-junction graph, admissible A\* search, curve-bend turn suppression, short access-path merging, LRU route cache, and `alternate_modes`.
- **Admin Seed Sync (`backend/campus/admin.py`)**: Interactive `django-leaflet` map editing for Tracks and POIs auto-synced to `data/campus_seed.json`.

## Mobile Architecture

- **Expo SDK 58 + React Native + Expo Router**: Strict TypeScript codebase under `mobile/`.
- **Offline-First Bootstrap & On-Device A\* Router**:
  - `mobile/src/campusStorage.ts` persists `/api/bootstrap/` payloads on device storage via `expo-file-system` for instant startup and offline browsing/search.
  - `mobile/src/offlineRouter.ts` compiles the campus track network on-device and serves pedestrian/driving routes and turn-by-turn steps offline whenever the backend is unreachable.
- **Adaptive Light & Dark Theme (`mobile/src/theme.ts`, `mobile/src/mapStyle.ts`)**: System-aware UI palettes, Light/Dark Google Maps styling (`userInterfaceStyle`), contrast-tuned track layers, and generated `icon.png`, `adaptive-icon.png`, and `splash-icon.png` assets.
- **3-Stage Turn-by-Turn Navigation**: `Place Details` -> `Route Overview` -> `Live Navigation` with upcoming-maneuver HUD (`LiveNavigationHud.tsx`), `expo-speech` voice prompts, off-route auto-rerouting, arrival detection, and off-campus Demo simulation.

## Seeded Campus Coverage

- 38 POIs & Buildings across 6 Categories.
- 33 Pathways (`vehicle`, `pedestrian`, and `both`) covering main boulevards, courtyard walkways, and spur connectors to every campus building.
