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


@admin.register(Track)
class TrackAdmin(LeafletGeoAdmin):
    list_display = ("name", "source", "updated_at")
    search_fields = ("name", "description", "source")


admin.site.site_header = "Bowen Navigator Administration"
admin.site.site_title = "Bowen Navigator"
admin.site.index_title = "Campus data management"

