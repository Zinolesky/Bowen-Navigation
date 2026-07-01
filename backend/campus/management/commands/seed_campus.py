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
        for item in payload["buildings"]:
            building, _ = Building.objects.update_or_create(
                name=item["name"],
                defaults={
                    "slug": slugify(item["name"]),
                    "description": item["description"],
                    "location": Point(item["longitude"], item["latitude"], srid=4326),
                },
            )
            buildings[item["name"]] = building

        for item in payload["pois"]:
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
                    "location": building.location,
                    "is_active": True,
                },
            )

        for item in payload["tracks"]:
            line = LineString(*[(lon, lat) for lat, lon in item["coordinates"]], srid=4326)
            Track.objects.update_or_create(
                name=item["name"],
                defaults={
                    "description": item["description"],
                    "source": item["source"],
                    "geometry": line,
                },
            )

        users_data = payload.get("users", [])
        for user_data in users_data:
            user, _ = User.objects.update_or_create(
                username=user_data["matric_number"],
                defaults={
                    "full_name": user_data["full_name"],
                    "is_staff_admin": user_data.get("is_staff_admin", False),
                    "is_superuser": user_data.get("is_staff_admin", False),
                    "is_staff": user_data.get("is_staff_admin", False),
                },
            )
            # Make sure password matches matric number for test users
            user.set_password(user_data["matric_number"])
            user.save()

        self.stdout.write(self.style.SUCCESS("Bowen Navigator seed data loaded."))
