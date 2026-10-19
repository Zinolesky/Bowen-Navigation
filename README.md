# Bowen Navigation

A mobile campus navigation system for Bowen University, Iwo, Osun state, Nigeria.

It follows the project report architecture:

- Backend: Python 3, Django 4, Django REST Framework, JWT, GeoDjango, PostgreSQL, PostGIS, GDAL/ogr2ogr-ready KML ingestion, Google Directions and Places API proxying.
- Mobile app: React Native, Expo SDK 56, Expo Router, TypeScript, Axios, react-native-maps with Google Maps, Expo Location, EAS Build.

## Project Layout

```text
backend/      Django API, GeoDjango models, JWT auth, Google proxy endpoints
mobile/       Expo React Native application
data/         Seed campus data and sample KML track
docs/         Setup, API contract, test plan, Postman collection
scripts/      Spatial import helpers
```

## Prerequisites

To run the backend seamlessly, **you must have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running**. 

By using Docker, you completely avoid having to manually install Python, PostgreSQL, PostGIS, and complex geospatial libraries (GDAL/PROJ) on your local machine. The database and backend will run perfectly isolated in a pre-configured Linux container, eliminating "DLL Hell" and guaranteeing it works identically on Windows, Mac, and Linux.

## Fast Start

1. Copy `backend/.env.example` to `backend/.env` and add your Google API values.
2. Copy `mobile/.env.example` to `mobile/.env`, then set `EXPO_PUBLIC_API_URL`.
3. Run the automated setup script to build and launch the Dockerized backend (including PostGIS) and install mobile dependencies:

```powershell
.\setup.ps1
```

4. The backend is now running on `http://localhost:8000`. To start the mobile app:

```powershell
cd mobile
npx expo start  
```

The default seeded student login is:

```text
Full name: Taigbenu Efezino
Matric number: BU22CSC1136
```

The default seeded staff admin login is:

```text
Full name: Campus Admin
Matric number: ADMIN001
```

## Notes

- The app is centered on Bowen University's published campus coordinate, `7.6236297, 4.1889662`.
- Google Directions and Places calls are proxied through Django so server-side keys are not shipped in the mobile app bundle.
- If no Google server key is configured, `/api/directions/` returns a deterministic local walking-route fallback so the mobile UI can still be tested.
- Use `docs/SETUP.md` for the full setup sequence and `docs/API_CONTRACT.md` for endpoint details.
