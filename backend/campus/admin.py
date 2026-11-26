from django.contrib import admin
from leaflet.admin import LeafletGeoAdmin
import logging

from .models import Building, Category, PointOfInterest, Track

logger = logging.getLogger(__name__)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "color", "icon_identifier")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Building)
class BuildingAdmin(LeafletGeoAdmin):
    list_display = ("name", "latitude", "longitude", "updated_at")
    search_fields = ("name", "description")
    prepopulated_fields = {"slug": ("name",)}

    @admin.display(description="Latitude")
    def latitude(self, obj):
        return round(obj.location.y, 7) if obj.location else None

    @admin.display(description="Longitude")
    def longitude(self, obj):
        return round(obj.location.x, 7) if obj.location else None


@admin.register(PointOfInterest)
class PointOfInterestAdmin(LeafletGeoAdmin):
    list_display = ("name", "category", "building", "latitude", "longitude", "is_active", "updated_at")
    list_filter = ("category", "is_active")
    search_fields = ("name", "description", "google_place_id")
    prepopulated_fields = {"slug": ("name",)}

    @admin.display(description="Latitude")
    def latitude(self, obj):
        return round(obj.location.y, 7) if obj.location else None

    @admin.display(description="Longitude")
    def longitude(self, obj):
        return round(obj.location.x, 7) if obj.location else None

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _sync_pois_to_seed_file()

    def delete_model(self, request, obj):
        super().delete_model(request, obj)
        _sync_pois_to_seed_file()

    def delete_queryset(self, request, queryset):
        super().delete_queryset(request, queryset)
        _sync_pois_to_seed_file()


def _resolve_seed_path():
    from pathlib import Path
    from django.conf import settings

    candidates = [
        Path(settings.BASE_DIR).parent / "data" / "campus_seed.json",
        Path("/data/campus_seed.json"),
        Path(settings.BASE_DIR) / "data" / "campus_seed.json",
    ]
    return next((p for p in candidates if p.exists()), None)


def _sync_pois_to_seed_file():
    """
    Persists Building and active PointOfInterest records back into data/campus_seed.json
    whenever changed from Django Admin.
    """
    import json

    seed_path = _resolve_seed_path()
    if not seed_path:
        return

    try:
        payload = json.loads(seed_path.read_text(encoding="utf-8"))
        buildings_out = []
        for building in Building.objects.all().order_by("id"):
            if not building.location:
                continue
            buildings_out.append(
                {
                    "name": building.name,
                    "description": building.description or "",
                    "latitude": round(building.location.y, 6),
                    "longitude": round(building.location.x, 6),
                }
            )
        seen_buildings = {b["name"] for b in buildings_out}

        pois_out = []
        for poi in PointOfInterest.objects.select_related("category", "building").filter(is_active=True).order_by("id"):
            if not poi.location:
                continue
            b_name = poi.building.name if poi.building else poi.name
            if b_name not in seen_buildings:
                seen_buildings.add(b_name)
                buildings_out.append(
                    {
                        "name": b_name,
                        "description": poi.description or "",
                        "latitude": round(poi.location.y, 6),
                        "longitude": round(poi.location.x, 6),
                    }
                )
            pois_out.append(
                {
                    "name": poi.name,
                    "category": poi.category.name if poi.category else "Academic",
                    "building": b_name,
                    "description": poi.description or "",
                    "operating_hours": poi.operating_hours or "",
                    "icon_identifier": poi.icon_identifier or "map-pin",
                    "google_place_id": poi.google_place_id or "",
                }
            )

        payload["buildings"] = buildings_out
        payload["pois"] = pois_out
        seed_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    except Exception:
        logger.warning("Failed to sync POIs back to campus_seed.json", exc_info=True)


def _sync_tracks_to_seed_file():
    """
    Persists all Track records from PostGIS back into data/campus_seed.json so that
    custom pathways drawn in Django Admin survive container restarts or re-seeding.
    """
    import json

    seed_path = _resolve_seed_path()
    if not seed_path:
        return

    try:
        payload = json.loads(seed_path.read_text(encoding="utf-8"))
        tracks_out = []
        for track in Track.objects.all().order_by("id"):
            if not track.geometry or len(track.geometry.coords) < 2:
                continue
            coords = [[round(lat, 6), round(lon, 6)] for lon, lat in track.geometry.coords]
            tracks_out.append(
                {
                    "name": track.name,
                    "description": track.description or "",
                    "track_type": track.track_type,
                    "source": track.source or "manual",
                    "coordinates": coords,
                }
            )
        payload["tracks"] = tracks_out
        seed_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    except Exception:
        logger.warning("Failed to sync tracks back to campus_seed.json", exc_info=True)


@admin.register(Track)
class TrackAdmin(LeafletGeoAdmin):
    list_display = ("name", "track_type", "source", "updated_at")
    list_filter = ("track_type", "source")
    list_editable = ("track_type",)
    search_fields = ("name", "description", "source")

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        _sync_tracks_to_seed_file()

    def delete_model(self, request, obj):
        super().delete_model(request, obj)
        _sync_tracks_to_seed_file()

    def delete_queryset(self, request, queryset):
        super().delete_queryset(request, queryset)
        _sync_tracks_to_seed_file()


admin.site.site_header = "Bowen Navigator Administration"
admin.site.site_title = "Bowen Navigator"
admin.site.index_title = "Campus data management"


