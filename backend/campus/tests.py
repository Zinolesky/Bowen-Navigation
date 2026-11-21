import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import LineString, Point
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Building, Category, PointOfInterest, Track
from .routing import clear_routing_cache

User = get_user_model()


class ApiContractTests(TestCase):
    def setUp(self):
        clear_routing_cache()
        cache.clear()
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
            location=Point(4.1990, 7.6215, srid=4326),
        )
        self.poi = PointOfInterest.objects.create(
            name="Timothy Olagbenro Library",
            category=self.category,
            building=self.building,
            description="Library and study space",
            operating_hours="Mon-Sat",
            icon_identifier="book-open",
            google_place_id="ChIJTestPlaceId123",
            location=self.building.location,
        )
        Track.objects.create(
            name="Library Pedestrian Walkway",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1970, 7.6210), (4.1980, 7.6212), (4.1990, 7.6215), srid=4326),
            source="test",
        )

    def login(self, full_name="Taigbenu Efezino", matric_number="BU22CSC1136", password=None):
        payload = {"full_name": full_name, "matric_number": matric_number}
        if password is not None:
            payload["password"] = password
        response = self.client.post("/api/auth/login/", payload, format="json")
        if response.status_code == 200 and "access" in response.data:
            token = response.data["access"]
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return response

    def test_unauthenticated_requests_return_401(self):
        endpoints = [
            ("GET", "/api/categories/", None),
            ("GET", "/api/buildings/", None),
            ("GET", "/api/pois/", None),
            ("GET", "/api/tracks/", None),
            ("GET", "/api/bootstrap/", None),
            (
                "POST",
                "/api/directions/",
                {
                    "origin": {"latitude": 7.6210, "longitude": 4.1970},
                    "destination": {"latitude": 7.6215, "longitude": 4.1990},
                },
            ),
            ("POST", "/api/places/details/", {"place_id": "ChIJTest"}),
            ("GET", "/api/places/photo/?ref=abc", None),
        ]
        for method, url, data in endpoints:
            if method == "GET":
                res = self.client.get(url)
            else:
                res = self.client.post(url, data, format="json")
            self.assertEqual(res.status_code, 401, f"Expected 401 for {method} {url}, got {res.status_code}")

    def test_login_returns_jwt_and_user_profile(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["matric_number"], "BU22CSC1136")

    def test_login_rejects_invalid_credentials_and_requires_staff_password(self):
        bad_matric = self.login(full_name="Taigbenu Efezino", matric_number="BU99XXX0000")
        self.assertEqual(bad_matric.status_code, 400)

        bad_name = self.login(full_name="Wrong Person", matric_number="BU22CSC1136")
        self.assertEqual(bad_name.status_code, 400)

        staff_no_pw = self.login(full_name="Campus Admin", matric_number="ADMIN001")
        self.assertEqual(staff_no_pw.status_code, 400)

        staff_bad_pw = self.login(full_name="Campus Admin", matric_number="ADMIN001", password="WRONG")
        self.assertEqual(staff_bad_pw.status_code, 400)

        staff_ok = self.login(full_name="Campus Admin", matric_number="ADMIN001", password="ADMIN001")
        self.assertEqual(staff_ok.status_code, 200)
        self.assertTrue(staff_ok.data["user"]["is_staff_admin"])

    def test_student_cannot_create_update_or_delete_poi(self):
        self.login()
        create_res = self.client.post(
            "/api/pois/",
            {
                "name": "Unauthorized Hall",
                "category_id": self.category.id,
                "latitude": 7.6215,
                "longitude": 4.1991,
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 403)

        patch_res = self.client.patch(
            f"/api/pois/{self.poi.id}/",
            {"name": "Hacked"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 403)

        del_res = self.client.delete(f"/api/pois/{self.poi.id}/")
        self.assertEqual(del_res.status_code, 403)

    def test_pois_opt_in_sprites_and_bootstrap_etag(self):
        self.login()
        plain_res = self.client.get("/api/pois/")
        self.assertEqual(plain_res.status_code, 200)
        self.assertEqual(plain_res.data["type"], "FeatureCollection")
        self.assertEqual(plain_res.data["features"][0]["geometry"]["type"], "Point")
        self.assertNotIn("marker_icon_default", plain_res.data["features"][0]["properties"])

        sprites_res = self.client.get("/api/pois/?include_sprites=true")
        self.assertEqual(sprites_res.status_code, 200)
        self.assertIn("marker_icon_default", sprites_res.data["features"][0]["properties"])
        self.assertTrue(
            sprites_res.data["features"][0]["properties"]["marker_icon_default"].startswith("data:image/png;base64,")
        )

        boot_res = self.client.get("/api/bootstrap/?include_sprites=false")
        self.assertEqual(boot_res.status_code, 200)
        self.assertIn("version", boot_res.data)
        self.assertIn("categories", boot_res.data)
        self.assertIn("pois", boot_res.data)
        self.assertIn("tracks", boot_res.data)
        etag = boot_res["ETag"]

        not_mod_res = self.client.get("/api/bootstrap/?include_sprites=false", HTTP_IF_NONE_MATCH=etag)
        self.assertEqual(not_mod_res.status_code, 304)

    def test_tracks_are_returned_as_geojson_with_track_type(self):
        self.login()
        response = self.client.get("/api/tracks/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["type"], "FeatureCollection")
        feature = response.data["features"][0]
        self.assertEqual(feature["geometry"]["type"], "LineString")
        self.assertEqual(feature["properties"]["track_type"], "pedestrian")

    def test_staff_admin_can_create_and_update_poi_with_jwt(self):
        self.login(full_name="Campus Admin", matric_number="ADMIN001", password="ADMIN001")
        create_res = self.client.post(
            "/api/pois/",
            {
                "name": "New Lecture Hall",
                "category_id": self.category.id,
                "description": "Lecture venue",
                "operating_hours": "8am - 5pm",
                "icon_identifier": "school",
                "latitude": 7.6245,
                "longitude": 4.19865,
                "google_place_id": "",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)

    @override_settings(GOOGLE_PLACES_API_KEY="SECRET_GOOGLE_PLACES_KEY_TEST")
    @patch("campus.views._google_session.get")
    def test_place_details_and_photo_proxy_never_expose_api_key(self, mock_get):
        details_resp = MagicMock()
        details_resp.raise_for_status.return_value = None
        details_resp.json.return_value = {
            "status": "OK",
            "result": {
                "name": "Timothy Olagbenro Library",
                "rating": 4.8,
                "photos": [{"photo_reference": "PHOTO_REF_123", "width": 800, "height": 600}],
            },
        }
        photo_resp = MagicMock()
        photo_resp.raise_for_status.return_value = None
        photo_resp.headers = {"Content-Type": "image/jpeg"}
        photo_resp.content = b"\xff\xd8\xff\xe0FAKE_JPEG_BYTES"
        mock_get.side_effect = [details_resp, photo_resp]

        self.login()
        res = self.client.post("/api/places/details/", {"place_id": "ChIJTestPlaceId123"}, format="json")
        self.assertEqual(res.status_code, 200)
        serialized = json.dumps(res.data)
        self.assertNotIn("SECRET_GOOGLE_PLACES_KEY_TEST", serialized)
        photo_item = res.data["result"]["photos"][0]
        self.assertNotIn("url", photo_item)
        self.assertEqual(photo_item["photo_reference"], "PHOTO_REF_123")
        self.assertIn("/places/photo/", photo_item["proxy_path"])

        # First photo fetch calls upstream Google session once and caches result
        img_res_1 = self.client.get("/api/places/photo/?ref=PHOTO_REF_123&maxwidth=800")
        self.assertEqual(img_res_1.status_code, 200)
        self.assertEqual(img_res_1.content, b"\xff\xd8\xff\xe0FAKE_JPEG_BYTES")
        self.assertEqual(mock_get.call_count, 2)

        # Second photo fetch serves from server cache without calling upstream Google API
        img_res_2 = self.client.get("/api/places/photo/?ref=PHOTO_REF_123&maxwidth=800")
        self.assertEqual(img_res_2.status_code, 200)
        self.assertEqual(mock_get.call_count, 2)

    def test_directions_separates_pedestrian_and_vehicle_pathways_and_returns_alternate_modes(self):
        Track.objects.all().delete()
        Track.objects.create(
            name="Pedestrian Shortcut",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1970, 7.6220), (4.1980, 7.6220), (4.1990, 7.6220), srid=4326),
            source="test",
        )
        Track.objects.create(
            name="Southern Vehicle Road",
            track_type=Track.TRACK_TYPE_VEHICLE,
            geometry=LineString(
                (4.1970, 7.6220),
                (4.1970, 7.6205),
                (4.1990, 7.6205),
                (4.1990, 7.6220),
                srid=4326,
            ),
            source="test",
        )

        self.login()
        walk_res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6220, "longitude": 4.1970},
                "destination": {"latitude": 7.6220, "longitude": 4.1990},
                "mode": "walking",
            },
            format="json",
        )
        drive_res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6220, "longitude": 4.1970},
                "destination": {"latitude": 7.6220, "longitude": 4.1990},
                "mode": "driving",
            },
            format="json",
        )
        self.assertEqual(walk_res.status_code, 200)
        self.assertEqual(drive_res.status_code, 200)
        self.assertEqual(walk_res.data["mode"], "walking")
        self.assertEqual(drive_res.data["mode"], "driving")
        self.assertNotEqual(walk_res.data["overview_polyline"], drive_res.data["overview_polyline"])
        self.assertTrue(any("Pedestrian Shortcut" in s["instruction"] for s in walk_res.data["steps"]))
        self.assertTrue(any("Southern Vehicle Road" in s["instruction"] for s in drive_res.data["steps"]))
        self.assertIn("alternate_modes", walk_res.data)
        self.assertIn("walking", walk_res.data["alternate_modes"])
        self.assertIn("driving", walk_res.data["alternate_modes"])

    def test_directions_handles_x_intersections_and_invalidates_cache_on_track_change(self):
        Track.objects.all().delete()
        Track.objects.create(
            name="East-West Walk",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1960, 7.6230), (4.2000, 7.6230), srid=4326),
            source="test",
        )
        Track.objects.create(
            name="North-South Walk",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1980, 7.6210), (4.1980, 7.6250), srid=4326),
            source="test",
        )

        self.login()
        res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6230, "longitude": 4.1975},
                "destination": {"latitude": 7.6235, "longitude": 4.1980},
                "mode": "walking",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["provider"], "bowen-routing")
        self.assertLess(res.data["distance_meters"], 140)

        # Adding a closer diagonal path invalidates the graph cache via Django signals automatically
        Track.objects.create(
            name="Diagonal Campus Plaza",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1975, 7.6230), (4.1980, 7.6235), srid=4326),
            source="test",
        )
        diag_res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6230, "longitude": 4.1975},
                "destination": {"latitude": 7.6235, "longitude": 4.1980},
                "mode": "walking",
            },
            format="json",
        )
        self.assertEqual(diag_res.status_code, 200)
        self.assertLess(diag_res.data["distance_meters"], res.data["distance_meters"])
