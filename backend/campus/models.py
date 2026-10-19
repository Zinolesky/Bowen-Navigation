from django.contrib.gis.db import models as gis_models
from django.contrib.gis.geos import Point
from django.db import models
from django.utils.text import slugify
from colorfield.fields import ColorField


def _generate_unique_slug(model_cls, name: str, instance_pk=None, max_length: int = 160) -> str:
    base_slug = slugify(name)[: max_length - 10] or "item"
    slug = base_slug
    counter = 2
    qs = model_cls.objects.all()
    if instance_pk is not None:
        qs = qs.exclude(pk=instance_pk)
    while qs.filter(slug=slug).exists():
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


def infer_track_type_from_text(name: str = "", description: str = "", source: str = "") -> str:
    text = f"{name or ''} {description or ''} {source or ''}".lower()
    pedestrian_keywords = (
        "pedestrian",
        "walkway",
        "footpath",
        "foot path",
        "walking",
        "sidewalk",
        "shortcut",
        "trail",
        "steps",
        "stairs",
        "corridor",
        "alley",
    )
    vehicle_keywords = (
        "vehicle",
        "vehicular",
        "road",
        "drive",
        "driveway",
        "street",
        "avenue",
        "highway",
        "boulevard",
        "car",
        "motor",
        "tarred",
        "lane",
        "roundabout",
    )
    has_ped = any(k in text for k in pedestrian_keywords)
    has_veh = any(k in text for k in vehicle_keywords)
    if "both" in text or "shared" in text or (has_ped and has_veh):
        return "both"
    if has_veh:
        return "vehicle"
    if has_ped:
        return "pedestrian"
    return "pedestrian"


class Category(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=90, unique=True, blank=True)
    color = ColorField(default="#2563EB")
    icon_identifier = models.CharField(max_length=40, default="map-pin")
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _generate_unique_slug(Category, self.name, self.pk, max_length=90)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class Building(models.Model):
    name = models.CharField(max_length=140, unique=True)
    slug = models.SlugField(max_length=160, unique=True, blank=True)
    description = models.TextField(blank=True)
    location = gis_models.PointField(geography=True, srid=4326, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _generate_unique_slug(Building, self.name, self.pk, max_length=160)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class PointOfInterest(models.Model):
    name = models.CharField(max_length=140)
    slug = models.SlugField(max_length=160, unique=True, blank=True)
    category = models.ForeignKey(Category, related_name="pois", on_delete=models.PROTECT)
    building = models.ForeignKey(Building, related_name="pois", on_delete=models.SET_NULL, null=True, blank=True)
    description = models.TextField(blank=True)
    operating_hours = models.CharField(max_length=120, blank=True)
    google_place_id = models.CharField(max_length=220, blank=True)
    icon_identifier = models.CharField(max_length=40, default="map-pin")
    location = gis_models.PointField(geography=True, srid=4326)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category__name", "name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["is_active"]),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _generate_unique_slug(PointOfInterest, self.name, self.pk, max_length=160)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class Track(models.Model):
    TRACK_TYPE_PEDESTRIAN = "pedestrian"
    TRACK_TYPE_VEHICLE = "vehicle"
    TRACK_TYPE_BOTH = "both"
    TRACK_TYPE_CHOICES = [
        (TRACK_TYPE_PEDESTRIAN, "Pedestrian Pathway"),
        (TRACK_TYPE_VEHICLE, "Vehicle Road"),
        (TRACK_TYPE_BOTH, "Shared (Vehicle & Pedestrian)"),
    ]

    name = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    track_type = models.CharField(
        max_length=20,
        choices=TRACK_TYPE_CHOICES,
        default=TRACK_TYPE_PEDESTRIAN,
    )
    geometry = gis_models.LineStringField(geography=True, srid=4326)
    source = models.CharField(max_length=120, default="manual")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.track_type:
            self.track_type = infer_track_type_from_text(self.name, self.description, self.source)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.name} ({self.track_type})"


