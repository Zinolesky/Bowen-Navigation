# Bowen Navigator

Bowen Navigator is a two-tier mobile campus navigation system for Bowen University, Iwo.
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

## Fast Start

1. Copy `backend/.env.example` to `backend/.env`.
2. Add your PostgreSQL/PostGIS and Google API values.
3. Start PostGIS with `docker compose up -d db pgadmin`.
4. Install backend dependencies from `backend/requirements.txt`.
5. Run migrations and seed the demo campus data:

```powershell
cd backend
python manage.py migrate
python manage.py seed_campus
python manage.py runserver
```

6. Copy `mobile/.env.example` to `mobile/.env`, then set `EXPO_PUBLIC_API_URL`.
7. Install mobile dependencies and run Expo:

```powershell
cd mobile
npm install
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

