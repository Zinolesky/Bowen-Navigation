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
            matric_number="BU22CSC1136",
            full_name="Taigbenu Efezino",
            password="BU22CSC1136",
        )
        self.staff = User.objects.create_user(
            matric_number="ADMIN001",
            full_name="Campus Admin",
            password="ADMIN001",
            is_staff_admin=True,
            is_staff=True,
        )
        self.category = Category.objects.create(name="Academic", color="#1D4ED8", icon_identifier="school")
        self.building = Building.objects.create(
            name="Timothy Olagbenro Library",
            description="Main library",
            location=Point(4.18918, 7.62408, srid=4326),
        )
        self.poi = PointOfInterest.objects.create(
            name="Timothy Olagbenro Library",
            category=self.category,
            building=self.building,
            description="Library and study space",
            operating_hours="Mon-Sat",
            icon_identifier="book-open",
            location=self.building.location,
        )
        Track.objects.create(
            name="Library Pedestrian Walkway",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.18733, 7.6218), (4.1884, 7.6229), (4.18918, 7.62408), srid=4326),
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

    def test_tracks_are_returned_as_geojson_with_track_type(self):
        self.login()
        response = self.client.get("/api/tracks/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["type"], "FeatureCollection")
        feature = response.data["features"][0]
        self.assertEqual(feature["geometry"]["type"], "LineString")
        self.assertEqual(feature["properties"]["track_type"], "pedestrian")

    def test_staff_admin_can_create_and_update_poi_with_jwt(self):
        self.login(full_name="Campus Admin", matric_number="ADMIN001")
        create_res = self.client.post(
            "/api/pois/",
            {
                "name": "New Lecture Hall",
                "category_id": self.category.id,
                "description": "Lecture venue",
                "operating_hours": "8am - 5pm",
                "icon_identifier": "school",
                "latitude": 7.6245,
                "longitude": 4.18865,
                "google_place_id": "",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)

    def test_directions_separates_pedestrian_and_vehicle_pathways(self):
        Track.objects.all().delete()
        # Direct northern pedestrian walkway
        Track.objects.create(
            name="Pedestrian Shortcut",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1870, 7.6220), (4.1880, 7.6220), (4.1890, 7.6220), srid=4326),
            source="test",
        )
        # Southern vehicle road
        Track.objects.create(
            name="Southern Vehicle Road",
            track_type=Track.TRACK_TYPE_VEHICLE,
            geometry=LineString(
                (4.1870, 7.6220),
                (4.1870, 7.6205),
                (4.1890, 7.6205),
                (4.1890, 7.6220),
                srid=4326,
            ),
            source="test",
        )

        self.login()
        walk_res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6220, "longitude": 4.1870},
                "destination": {"latitude": 7.6220, "longitude": 4.1890},
                "mode": "walking",
            },
            format="json",
        )
        drive_res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6220, "longitude": 4.1870},
                "destination": {"latitude": 7.6220, "longitude": 4.1890},
                "mode": "driving",
            },
            format="json",
        )
        self.assertEqual(walk_res.status_code, 200)
        self.assertEqual(drive_res.status_code, 200)
        self.assertEqual(walk_res.data["mode"], "walking")
        self.assertEqual(drive_res.data["mode"], "driving")
        # Walking uses the direct ~220m pedestrian path, whereas driving uses the ~550m vehicle road
        self.assertNotEqual(walk_res.data["overview_polyline"], drive_res.data["overview_polyline"])
        self.assertTrue(any("Pedestrian Shortcut" in s["instruction"] for s in walk_res.data["steps"]))
        self.assertTrue(any("Southern Vehicle Road" in s["instruction"] for s in drive_res.data["steps"]))

    def test_directions_handles_x_intersections_and_mid_segment_projection_without_backtracking(self):
        Track.objects.all().delete()
        # Horizontal track with only 2 endpoints (west to east)
        Track.objects.create(
            name="East-West Walk",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1860, 7.6230), (4.1900, 7.6230), srid=4326),
            source="test",
        )
        # Vertical track crossing East-West Walk at (4.1880, 7.6230) with NO vertex at the intersection
        Track.objects.create(
            name="North-South Walk",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1880, 7.6210), (4.1880, 7.6250), srid=4326),
            source="test",
        )

        # Start mid-segment at (4.1875, 7.6230) and go to (4.1880, 7.6235):
        # Distance should be ~55m east + ~55m north = ~110m (NOT backtracking to 4.1860 or 4.1900!)
        res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6230, "longitude": 4.1875},
                "destination": {"latitude": 7.6235, "longitude": 4.1880},
                "mode": "walking",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["provider"], "bowen-routing")
        dist_m = int(res.data["distance_text"].split()[0])
        self.assertLess(dist_m, 140)
