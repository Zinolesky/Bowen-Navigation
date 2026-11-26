# Bowen Navigator Setup

## Backend (Docker Recommended)

1. Ensure Docker Desktop is running, then create `backend/.env` from `backend/.env.example`.
2. Start the full stack (`db` PostGIS on host port `5434`, `redis`, `pgadmin` on `5050`, multi-worker Gunicorn + WhiteNoise `backend` on host port `8001`):

```powershell
docker compose up --build -d
docker compose exec backend python manage.py seed_campus
```

3. Verify service health (`database: "ok"`, `cache: "ok"`):

```powershell
curl.exe -s http://127.0.0.1:8001/api/health/
```

4. Bulk import a student CSV roster anytime from the host or inside the In-App Admin screen:

```powershell
docker compose exec -T backend python manage.py import_students_csv /data/students.csv
```

5. Open the Django admin at `http://127.0.0.1:8001/admin/`.

### Optional Local Python Environment (Linux/macOS or Host GDAL Configured)

```powershell
docker compose up -d db redis pgadmin
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:POSTGRES_PORT="5434"
$env:REDIS_URL="redis://127.0.0.1:6379/1"
python manage.py migrate
python manage.py seed_campus
python manage.py runserver 0.0.0.0:8001
```

## Mobile App

1. Create `mobile/.env` from `mobile/.env.example`.
2. Set `EXPO_PUBLIC_API_URL`:
   - Physical device (LAN IP): `http://YOUR_COMPUTER_IP:8001/api` (auto-detected by `mobile/src/api.ts` in Expo Go LAN mode)
   - Android emulator: `http://10.0.2.2:8001/api`
   - iOS simulator: `http://127.0.0.1:8001/api`
   - Expo Tunnel (`--tunnel`): set `EXPO_PUBLIC_API_URL` to your public API URL
3. Add mobile-restricted Google Maps SDK keys to `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` and `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY`.
4. Start Expo (SDK 58):

```powershell
cd mobile
npm install
npx expo start -c
```

## Google API Security

Use separate keys:

- Mobile key: restricted to Android/iOS application bundle IDs (`ng.edu.bowen.navigator`) and enabled only for Maps SDK.
- Backend key: stored strictly in `backend/.env`, enabled for Google Places API.

## KML Track Import & Branding Assets

- Import KML tracks into PostGIS (`5434`):

```powershell
.\scripts\import_kml_tracks.ps1 -KmlPath .\data\sample_tracks.kml -DbPort 5434
```

- Regenerate app icon / adaptive icon / splash PNGs into `mobile/assets/` inside the backend container:

```powershell
python -c "import subprocess, json, base64; from pathlib import Path; src=Path('scripts/generate_mobile_assets.py').read_bytes(); p=subprocess.run(['docker','compose','exec','-T','backend','python','-','--stdout-json'], input=src, capture_output=True, check=True); out=Path('mobile/assets'); out.mkdir(parents=True, exist_ok=True); [(out/k).write_bytes(base64.b64decode(v)) for k,v in json.loads(p.stdout.decode('utf-8-sig')).items()]"
```

## EAS APK Build

```powershell
cd mobile
npx eas login
npx eas build:configure
npx eas build -p android --profile preview
```
