# Bowen Navigator Test Plan

## Functional Testing

- Login accepts the seeded student account and rejects wrong matriculation numbers.
- `/api/pois/` returns valid GeoJSON point features.
- `/api/tracks/` returns valid GeoJSON line features.
- The map screen renders category-colored markers.
- The search screen filters by name, description, and category.
- Selecting a search result opens that POI on the map.
- Directions request device location, call the backend proxy, decode the polyline, and display step instructions.
- Staff admin can create, update, and delete POIs.
- Non-admin users do not see the Admin tab.

## Integration Testing

- Verify the mobile app only calls the Django backend for Directions and Places data.
- Confirm Google server keys are present only in `backend/.env`.
- Inspect API responses in Postman using `docs/postman/Bowen_Navigator.postman_collection.json`.
- Confirm PostGIS stores POIs as `PointField` and tracks as `LineStringField`.

## User Acceptance Testing

Ask students to complete these tasks:

1. Log in with matric number credentials.
2. Locate the Timothy Olagbenro Library on the map.
3. Search for `288 Smart Hostel`.
4. Start walking directions to the selected destination.
5. Filter the map to show only Residential or Academic POIs.
6. Report whether marker labels, route display, and search results feel clear.

## Backend Commands

```powershell
cd backend
python manage.py test
```

## Mobile Commands

```powershell
cd mobile
npm run typecheck
npm run lint
```

