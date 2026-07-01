from django.contrib.auth import get_user_model
from django.contrib.gis.geos import LineString, Point
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Building, Category, PointOfInterest, Track

User = get_user_model()


class ApiContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(
            matric_number="BU20CSC1001",
            full_name="John Doe",
            password="password123",
        )
        self.staff = User.objects.create_user(
            matric_number="STAFF001",
            full_name="Campus Admin",
            password="unused-password",
            is_staff_admin=True,
        )
        category = Category.objects.create(name="Academic", color="#1D4ED8", icon_identifier="school")
        building = Building.objects.create(
            name="Timothy Olagbenro Library",
            description="Main library",
            location=Point(4.18918, 7.62408, srid=4326),
        )
        PointOfInterest.objects.create(
            name="Timothy Olagbenro Library",
            category=category,
            building=building,
            description="Library and study space",
            operating_hours="Mon-Sat",
            icon_identifier="book-open",
            location=building.location,
        )
        Track.objects.create(
            name="Library Loop",
            geometry=LineString((4.18918, 7.62408), (4.18865, 7.6245), srid=4326),
            source="test",
        )

    def login(self, full_name="Taigbenu Efezino", matric_number="BU22CSC1136"):
        response = self.client.post(
            "/api/auth/login/",
            {"full_name": full_name, "matric_number": matric_number},
            format="json",
        )
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return response

    def test_login_returns_jwt_and_user_profile(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["matric_number"], "BU22CSC1136")

    def test_pois_are_returned_as_geojson(self):
        self.login()
        response = self.client.get("/api/pois/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["type"], "FeatureCollection")
        self.assertEqual(response.data["features"][0]["geometry"]["type"], "Point")

    def test_tracks_are_returned_as_geojson(self):
        self.login()
        response = self.client.get("/api/tracks/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["features"][0]["geometry"]["type"], "LineString")

    def test_directions_returns_fallback_without_google_key(self):
        self.login()
        response = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6218, "longitude": 4.18733},
                "destination": {"latitude": 7.62408, "longitude": 4.18918},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("overview_polyline", response.data)
