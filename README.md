# Bowen Navigation

A mobile campus navigation system for Bowen University, Iwo, Osun State, Nigeria.

It follows and extends the project report architecture:

- Backend: Python 3, Django 4, Django REST Framework, JWT, GeoDjango, PostgreSQL + PostGIS, custom mode-aware campus routing (precompiled topological graph + admissible A\* search over pedestrian/vehicle pathways), GDAL/ogr2ogr-ready KML ingestion, server-side marker sprite rendering, Gunicorn + WhiteNoise, and authenticated Google Places Details & Photo proxying.
- Mobile app: React Native, Expo SDK 58, Expo Router, TypeScript, Axios, `react-native-maps` with Google Maps, Expo Location, Expo Speech, EAS Build.

## Project Layout

```text
backend/      Django API, GeoDjango models, JWT auth, A*/Dijkstra router, Google Places proxy
mobile/       Expo React Native application
data/         Seed campus data and sample KML track
docs/         Setup, API contract, test plan, Postman collection
scripts/      Spatial import helpers
```

## Prerequisites

To run the backend seamlessly, **you must have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running**.

By using Docker, you completely avoid having to manually install Python, PostgreSQL, PostGIS, and complex geospatial libraries (GDAL/PROJ) on your local machine. The database and backend will run isolated in a pre-configured Linux container on Windows, macOS, and Linux.

## Fast Start

1. Copy `backend/.env.example` to `backend/.env` and add your Google API key(s) (`GOOGLE_PLACES_API_KEY`).
2. Copy `mobile/.env.example` to `mobile/.env`, then set `EXPO_PUBLIC_API_URL` (for physical devices over LAN, `mobile/src/api.ts` also auto-detects your host IPv4 on port `8001` when running Expo Go).
3. Run the automated setup script to build and launch the Dockerized backend (PostGIS + pgAdmin + Gunicorn) and install mobile dependencies:

```powershell
.\setup.ps1
```

4. The backend API is now running on `http://localhost:8001` (with PostGIS exposed on host port `5434` and pgAdmin on `5050`). To start the mobile app:

```powershell
cd mobile
npx expo start
```

The default seeded student login is:

```text
Full name: Taigbenu Efezino
Matric number: BU22CSC1136
```

The default seeded staff admin login (password required) is:

```text
Full name: Campus Admin
Matric number: ADMIN001
Password: ADMIN001
```

## Notes

- The app is centered on Bowen University campus at `7.6215, 4.1990` (with Main Gate fallback at `7.621044, 4.190647`).
- Google Places Details and Photo calls are authenticated via JWT and proxied through Django (`/api/places/details/` and `/api/places/photo/`) so `GOOGLE_PLACES_API_KEY` is never exposed to the mobile bundle.
- `/api/directions/` computes mode-aware (`walking` vs `driving`) shortest paths across Bowen campus pathways using an in-memory cached topological graph with X-intersection splitting, T-junction snapping, perpendicular edge projection, and `alternate_modes` ETA summaries.
- Use [`docs/SETUP.md`](docs/SETUP.md) for the full setup sequence and [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) for endpoint details.
