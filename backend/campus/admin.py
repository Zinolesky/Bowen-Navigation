from django.contrib import admin
from leaflet.admin import LeafletGeoAdmin
from .models import Building, Category, PointOfInterest, Track


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


def _sync_tracks_to_seed_file():
    """
    Persists all Track records from PostGIS back into data/campus_seed.json so that
    custom pathways drawn in Django Admin survive container restarts or re-seeding.
    """
    import json
    from pathlib import Path
    from django.conf import settings

    candidates = [
        Path(settings.BASE_DIR).parent / "data" / "campus_seed.json",
        Path("/data/campus_seed.json"),
        Path(settings.BASE_DIR) / "data" / "campus_seed.json",
    ]
    seed_path = next((p for p in candidates if p.exists()), None)
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
        pass


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


