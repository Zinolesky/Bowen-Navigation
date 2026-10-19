import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import LineString, Point
from django.core.management.base import BaseCommand
from django.utils.text import slugify

from campus.models import Building, Category, PointOfInterest, Track

User = get_user_model()


class Command(BaseCommand):
    help = "Seed Bowen Navigator with demo campus data and users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            default=str(Path(settings.BASE_DIR).parent / "data" / "campus_seed.json"),
            help="Path to the JSON seed data file.",
        )

    def handle(self, *args, **options):
        seed_path = Path(options["path"])
        if not seed_path.exists():
            candidates = [
                Path(settings.BASE_DIR) / "data" / "campus_seed.json",
                Path(settings.BASE_DIR).parent / "data" / "campus_seed.json",
                Path("/data/campus_seed.json"),
                Path("/app/data/campus_seed.json"),
            ]
            for candidate in candidates:
                if candidate.exists():
                    seed_path = candidate
                    break

        if not seed_path.exists():
            raise FileNotFoundError(
                f"Could not find campus_seed.json at '{options['path']}' or candidate paths."
            )

        payload = json.loads(seed_path.read_text(encoding="utf-8"))

        categories = {}
        for item in payload["categories"]:
            category, _ = Category.objects.update_or_create(
                name=item["name"],
                defaults={
                    "slug": slugify(item["name"]),
                    "color": item["color"],
                    "icon_identifier": item["icon_identifier"],
                    "description": item["description"],
                },
            )
            categories[item["name"]] = category

        buildings = {}
        seed_building_names = set()
        for item in payload["buildings"]:
            seed_building_names.add(item["name"])
            building, _ = Building.objects.update_or_create(
                name=item["name"],
                defaults={
                    "slug": slugify(item["name"]),
                    "description": item["description"],
                    "location": Point(item["longitude"], item["latitude"], srid=4326),
                },
            )
            buildings[item["name"]] = building

        seed_poi_names = set()
        for item in payload["pois"]:
            seed_poi_names.add(item["name"])
            building = buildings[item["building"]]
            PointOfInterest.objects.update_or_create(
                name=item["name"],
                defaults={
                    "slug": slugify(item["name"]),
                    "category": categories[item["category"]],
                    "building": building,
                    "description": item["description"],
                    "operating_hours": item["operating_hours"],
                    "icon_identifier": item["icon_identifier"],
                    "google_place_id": item.get("google_place_id", ""),
                    "location": building.location,
                    "is_active": True,
                },
            )

        # Remove obsolete POIs/Buildings from the old west-of-gate placeholder seed
        for old_poi in PointOfInterest.objects.exclude(name__in=seed_poi_names):
            if old_poi.location and old_poi.location.x < 4.1900:
                old_poi.delete()
        for old_bldg in Building.objects.exclude(name__in=seed_building_names):
            if old_bldg.location and old_bldg.location.x < 4.1900:
                old_bldg.delete()

        seed_track_names = set()
        for item in payload["tracks"]:
            seed_track_names.add(item["name"])
            line = LineString(*[(lon, lat) for lat, lon in item["coordinates"]], srid=4326)
            track_type = item.get("track_type") or "pedestrian"
            Track.objects.update_or_create(
                name=item["name"],
                defaults={
                    "description": item["description"],
                    "track_type": track_type,
                    "source": item["source"],
                    "geometry": line,
                },
            )

        # Remove obsolete seed tracks while preserving any user-drawn ('manual') tracks
        Track.objects.filter(source__in=["seed", "campus-walkway"]).exclude(
            name__in=seed_track_names
        ).delete()

        users_data = payload.get("students") or payload.get("users", [])
        for user_data in users_data:
            matric = user_data["matric_number"].upper().strip()
            user, _ = User.objects.update_or_create(
                matric_number=matric,
                defaults={
                    "username": matric,
                    "full_name": user_data["full_name"],
                    "is_staff_admin": user_data.get("is_staff_admin", False),
                    "is_superuser": user_data.get("is_staff_admin", False),
                    "is_staff": user_data.get("is_staff_admin", False),
                    "is_active": True,
                },
            )
            # Make sure password matches matric number for test users
            user.set_password(matric)
            user.save()

        self.stdout.write(self.style.SUCCESS("Bowen Navigator seed data loaded."))

