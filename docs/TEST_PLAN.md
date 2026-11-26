# Bowen Navigator Test Plan

## Functional, Security & Resilience Testing

- `GET /api/health/` verifies both PostgreSQL (`SELECT 1`) and Redis cache connectivity (`status: "ok"`), returning `503` if PostgreSQL is unreachable.
- Guest (unauthenticated) sessions can read `/api/categories/`, `/api/buildings/`, `/api/pois/`, `/api/tracks/`, `/api/bootstrap/`, and `POST /api/directions/` (`200 OK`), while mutations (`POST`/`PATCH`/`DELETE /api/pois/`), `/api/admin/import-students/`, and Google Places proxy endpoints return `401 Unauthorized`.
- `GET /api/pois/?include_inactive=true` suppresses inactive (`is_active=false`) POIs for guests and students, and exposes them only to authenticated Staff Admins (`is_staff_admin=true`).
- `POST /api/auth/register/` validates matriculation number format and uniqueness (`201 Created` on new student, `400` on duplicate), and `POST /api/auth/login/` verifies passwords for both students and staff admins.
- `POST /api/admin/import-students/` creates/updates student accounts from CSV while skipping/protecting existing staff/admin accounts (`200` for Staff Admin, `403` for students).
- `AuthRateThrottle` returns `429 Too Many Requests` when login/registration exceeds the configured rate.
- `POST /api/directions/` separates `walking` vs `driving` pathways, splits X-intersections and T-junctions, suppresses false curve turns along continuously named roads, routes cleanly to newly added spur pathways (`Faculty of Agriculture`, `Bowen Guest House`), and invalidates graph caches across changes.
- `/api/places/details/` and `/api/places/photo/` mask `GOOGLE_PLACES_API_KEY` and serve cached responses.
- Mobile `offlineRouter.ts` matches backend topological splitting, curve suppression, mode separation, `alternate_modes`, and >3 km Main Gate snapping completely offline.

## Backend Commands

```powershell
docker compose exec backend python manage.py test
```

## Mobile Commands

```powershell
cd mobile
npm run typecheck
npm test
npm run lint
```

## CI Automation

GitHub Actions (`.github/workflows/ci.yml`) runs both the PostGIS + Redis Django test suite and the mobile TypeScript + unit test checks automatically on every push/PR to `main`.
