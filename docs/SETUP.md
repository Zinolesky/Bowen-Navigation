# Bowen Navigator Setup

## Backend

1. Install PostgreSQL with PostGIS, or start the included container:

```powershell
docker compose up -d db pgadmin
```

2. Create `backend/.env` from `backend/.env.example`.

3. Install Python dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

4. Apply migrations and seed data:

```powershell
python manage.py migrate
python manage.py seed_campus
python manage.py runserver
```

5. Open the Django admin at `http://127.0.0.1:8000/admin/`.

Create a superuser if needed:

```powershell
python manage.py createsuperuser
```

## Mobile App

1. Create `mobile/.env` from `mobile/.env.example`.
2. Set `EXPO_PUBLIC_API_URL`.
   - Android emulator: `http://10.0.2.2:8000/api`
   - Physical device: `http://YOUR_COMPUTER_IP:8000/api`
   - iOS simulator: `http://127.0.0.1:8000/api`
3. Add the mobile-restricted Google Maps SDK keys to `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`.
4. Start Expo:

```powershell
cd mobile
npm install
npx expo start
```

## Google API Security

Use separate keys:

- Mobile key: restricted to Android/iOS application bundle IDs and enabled only for Maps SDK.
- Backend key: stored in `backend/.env`, IP-restricted, enabled for Directions API and Places API.

The mobile app sends route requests only to `/api/directions/`; it never receives the backend Google API key.

## KML Track Import

The report specifies GDAL/ogr2ogr for KML ingestion. With GDAL installed, run:

```powershell
.\scripts\import_kml_tracks.ps1 -KmlPath .\data\sample_tracks.kml
```

The script imports into `campus_track_import`. Review the imported geometry before copying production track data into the managed `campus_track` table.

## EAS APK Build

```powershell
cd mobile
npx eas login
npx eas build:configure
npx eas build -p android --profile preview
```

