# Bowen Navigator Setup

## Backend (Docker Recommended)

1. Ensure Docker Desktop is running, then create `backend/.env` from `backend/.env.example`.
2. Start the full stack (`db` on host port `5434`, `pgadmin` on `5050`, `backend` served by Gunicorn + WhiteNoise on host port `8001`):

```powershell
docker compose up --build -d
docker compose exec backend python manage.py seed_campus
```

3. Open the Django admin at `http://127.0.0.1:8001/admin/`.

### Optional Local Python Environment (Linux/macOS or Host GDAL Configured)

```powershell
docker compose up -d db pgadmin
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Match host port in docker-compose.yml
$env:POSTGRES_PORT="5434"
python manage.py migrate
python manage.py seed_campus
python manage.py runserver 0.0.0.0:8001
```

Create an extra superuser if needed:

```powershell
docker compose exec backend python manage.py createsuperuser
```

## Mobile App

1. Create `mobile/.env` from `mobile/.env.example`.
2. Set `EXPO_PUBLIC_API_URL`:
   - Physical device (LAN IP): `http://YOUR_COMPUTER_IP:8001/api` (auto-detected by `mobile/src/api.ts` in Expo Go LAN mode)
   - Android emulator: `http://10.0.2.2:8001/api`
   - iOS simulator: `http://127.0.0.1:8001/api`
   - Expo Tunnel (`--tunnel`): set `EXPO_PUBLIC_API_URL` to your HTTPS tunnel/public API URL
3. Add the mobile-restricted Google Maps SDK keys to `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`.
4. Start Expo (SDK 58):

```powershell
cd mobile
npm install
npx expo start -c
```

## Google API Security

Use separate keys:

- Mobile key: restricted to Android/iOS application bundle IDs and enabled only for Maps SDK.
- Backend key: stored strictly in `backend/.env`, enabled for Google Places API.

The mobile app never receives `GOOGLE_PLACES_API_KEY`. Both `/api/places/details/` and `/api/places/photo/` proxy Google requests through Django behind JWT authentication.

## KML Track Import

The report specifies GDAL/ogr2ogr for KML ingestion. With GDAL installed, run against the PostGIS host port (`5434`):

```powershell
.\scripts\import_kml_tracks.ps1 -KmlPath .\data\sample_tracks.kml -DbPort 5434
```

The script imports into `campus_track_import`. Review the imported geometry before copying production track data into the managed `campus_track` table.

## EAS APK Build

```powershell
cd mobile
npx eas login
npx eas build:configure
npx eas build -p android --profile preview
```
