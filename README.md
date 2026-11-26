# Bowen Navigation

A mobile campus navigation platform for Bowen University, Iwo, Osun State, Nigeria.

## Architecture Overview

- **Backend (`backend/`)**: Python 3, Django 4, Django REST Framework, JWT auth (student self-registration, password login, and staff CSV roster import), GeoDjango + PostgreSQL/PostGIS, Redis-backed multi-worker Gunicorn caching, DRF rate throttling, custom mode-aware campus routing (precompiled topological graph + admissible A\* search over 33 mapped pathways), GDAL/ogr2ogr KML ingestion, server-rendered marker sprites, WhiteNoise static serving, and authenticated Google Places Details & Photo proxying.
- **Mobile App (`mobile/`)**: React Native, Expo SDK 58, Expo Router, TypeScript, Axios, `react-native-maps` (Google Maps), adaptive Light & Dark mode, persistent offline disk bootstrap cache (`expo-file-system`), on-device TypeScript A\* offline router fallback, Expo Location, Expo Speech voice guidance, and EAS Build branding assets.
- **CI/CD (`.github/workflows/ci.yml`)**: Automated GitHub Actions verification against live PostGIS + Redis containers (`manage.py check`, `seed_campus`, `manage.py test`) and mobile `typecheck` + unit tests.

## Project Layout

```text
.github/      GitHub Actions CI workflow (PostGIS + Redis backend & mobile checks)
backend/      Django API, GeoDjango models, JWT auth, Redis cache, A* router, Places proxy
mobile/       Expo React Native application, offline A* router, Light/Dark themes & assets
data/         Seed campus data (38 POIs, 33 tracks, 6 categories) and sample KML track
docs/         Setup, API contract, test plan, Postman collection
scripts/      Spatial import helpers and mobile branding asset generator
```

## Prerequisites

To run the backend seamlessly, **install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/)** (runs PostGIS, Redis, pgAdmin, and multi-worker Gunicorn without requiring local GDAL installation).

## Fast Start

1. Copy `backend/.env.example` to `backend/.env` and add `GOOGLE_PLACES_API_KEY`.
2. Copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_API_URL` (for physical devices over LAN, `mobile/src/api.ts` also auto-detects your host IPv4 on port `8001` in Expo Go).
3. Launch Docker services (`db` on `5434`, `redis`, `pgadmin` on `5050`, `backend` on `8001`) and install mobile dependencies:

```powershell
.\setup.ps1
```

4. Start Expo (SDK 58):

```powershell
cd mobile
npx expo start
```

### Accounts & Access Modes

- **Guest / Visitor Mode**: Tap **Continue as Guest / Visitor** on the sign-in screen to browse campus locations, search, and route without an account.
- **Student Self-Registration**: Students can register directly inside the app via **Create Account** (`full_name`, `matric_number`, optional `email`, `password`).
- **Default Seeded Student Login**:
  ```text
  Matric number: BU22CSC1136
  Password:      BU22CSC1136
  ```
- **Default Seeded Staff Admin Login**:
  ```text
  Matric number: ADMIN001
  Password:      ADMIN001
  ```

## Notes

- Centered on Bowen University campus at `7.6215, 4.1990` (with Main Gate fallback at `7.621044, 4.190647`).
- Google Places Details (`/api/places/details/`) and Photos (`/api/places/photo/`) require JWT authentication and rate throttling so `GOOGLE_PLACES_API_KEY` stays strictly server-side.
- When cellular/Wi-Fi signal drops on campus, the mobile client automatically serves persisted bootstrap data from device storage and calculates pedestrian/driving turn-by-turn routes locally via `mobile/src/offlineRouter.ts`.
- See [`docs/SETUP.md`](docs/SETUP.md) and [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) for complete documentation.
