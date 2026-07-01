from django.contrib.gis.db import models as gis_models
from django.contrib.gis.geos import Point
from django.db import models
from django.utils.text import slugify
from colorfield.fields import ColorField


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
            self.slug = slugify(self.name)
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
            self.slug = slugify(self.name)
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
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class Track(models.Model):
    name = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    geometry = gis_models.LineStringField(geography=True, srid=4326)
    source = models.CharField(max_length=120, default="manual")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

