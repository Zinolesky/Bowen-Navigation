import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import LineString, Point
from django.core.cache import cache
from django.core.management import call_command
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
            is_active=True,
        )
        self.inactive_poi = PointOfInterest.objects.create(
            name="Hidden Maintenance Shed",
            category=self.category,
            description="Temporarily closed maintenance annex",
            location=Point(4.1982, 7.6211, srid=4326),
            is_active=False,
        )
        Track.objects.create(
            name="Library Pedestrian Walkway",
            track_type=Track.TRACK_TYPE_PEDESTRIAN,
            geometry=LineString((4.1970, 7.6210), (4.1980, 7.6212), (4.1990, 7.6215), srid=4326),
            source="test",
        )

    def login(self, matric_number="BU22CSC1136", password="BU22CSC1136", full_name=None):
        payload = {"matric_number": matric_number, "password": password}
        if full_name is not None:
            payload["full_name"] = full_name
        response = self.client.post("/api/auth/login/", payload, format="json")
        if response.status_code == 200 and "access" in response.data:
            token = response.data["access"]
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return response

    def test_health_check_reports_db_and_cache_readiness(self):
        res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "ok")
        self.assertEqual(res.data["checks"]["database"], "ok")
        self.assertEqual(res.data["checks"]["cache"], "ok")
        self.assertIsInstance(res.data["latency_ms"], float)

    def test_guest_can_browse_and_route_but_cannot_mutate_or_proxy_places(self):
        guest_ok = [
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
        ]
        for method, url, data in guest_ok:
            res = self.client.get(url) if method == "GET" else self.client.post(url, data, format="json")
            self.assertEqual(res.status_code, 200, f"Expected 200 for guest {method} {url}, got {res.status_code}")

        protected = [
            (
                "POST",
                "/api/pois/",
                {
                    "name": "Unauthorized POI",
                    "category_id": self.category.id,
                    "latitude": 7.6215,
                    "longitude": 4.1991,
                },
            ),
            ("PATCH", f"/api/pois/{self.poi.id}/", {"name": "Tampered"}),
            ("DELETE", f"/api/pois/{self.poi.id}/", None),
            ("POST", "/api/admin/import-students/", {"csv_text": "BU23CSC9999,Test Student"}),
        ]
        for method, url, data in protected:
            if method == "GET":
                res = self.client.get(url)
            elif method == "POST":
                res = self.client.post(url, data, format="json")
            elif method == "PATCH":
                res = self.client.patch(url, data, format="json")
            else:
                res = self.client.delete(url)
            self.assertEqual(res.status_code, 401, f"Expected 401 for guest {method} {url}, got {res.status_code}")

    def test_inactive_pois_hidden_from_guests_and_students_but_visible_to_staff_admin(self):
        # Guest passing include_inactive=true still sees only active POIs
        guest_res = self.client.get("/api/pois/?include_inactive=true")
        self.assertEqual(guest_res.status_code, 200)
        guest_names = [f["properties"]["name"] for f in guest_res.data["features"]]
        self.assertNotIn("Hidden Maintenance Shed", guest_names)

        # Student passing include_inactive=true still sees only active POIs
        self.login()
        student_res = self.client.get("/api/pois/?include_inactive=true")
        self.assertEqual(student_res.status_code, 200)
        student_names = [f["properties"]["name"] for f in student_res.data["features"]]
        self.assertNotIn("Hidden Maintenance Shed", student_names)

        # Staff admin passing include_inactive=true receives both active and hidden POIs
        self.login(matric_number="ADMIN001", password="ADMIN001")
        admin_res = self.client.get("/api/pois/?include_inactive=true")
        self.assertEqual(admin_res.status_code, 200)
        admin_names = [f["properties"]["name"] for f in admin_res.data["features"]]
        self.assertIn("Hidden Maintenance Shed", admin_names)

    def test_student_registration_and_password_login(self):
        reg_res = self.client.post(
            "/api/auth/register/",
            {
                "full_name": "Ada Lovelace",
                "matric_number": "bu23csc1042",
                "email": "Ada@bowen.edu.ng",
                "password": "securePass42",
            },
            format="json",
        )
        self.assertEqual(reg_res.status_code, 201)
        self.assertIn("access", reg_res.data)
        self.assertEqual(reg_res.data["user"]["matric_number"], "BU23CSC1042")
        self.assertEqual(reg_res.data["user"]["email"], "ada@bowen.edu.ng")
        self.assertFalse(reg_res.data["user"]["is_staff_admin"])

        # Duplicate matric number rejected
        dup_res = self.client.post(
            "/api/auth/register/",
            {
                "full_name": "Another Student",
                "matric_number": "BU23CSC1042",
                "password": "password99",
            },
            format="json",
        )
        self.assertEqual(dup_res.status_code, 400)

        # Registered student signs in with matric_number + password
        bad_pw = self.login(matric_number="BU23CSC1042", password="wrongPassword")
        self.assertEqual(bad_pw.status_code, 400)

        good_login = self.login(matric_number="BU23CSC1042", password="securePass42")
        self.assertEqual(good_login.status_code, 200)
        self.assertEqual(good_login.data["user"]["full_name"], "Ada Lovelace")

    def test_login_validates_passwords_for_students_and_staff(self):
        bad_matric = self.login(matric_number="BU99XXX0000", password="BU99XXX0000")
        self.assertEqual(bad_matric.status_code, 400)

        student_bad_pw = self.login(matric_number="BU22CSC1136", password="WRONG_PASSWORD")
        self.assertEqual(student_bad_pw.status_code, 400)

        student_ok = self.login(matric_number="BU22CSC1136", password="BU22CSC1136")
        self.assertEqual(student_ok.status_code, 200)
        self.assertFalse(student_ok.data["user"]["is_staff_admin"])

        staff_bad_pw = self.login(matric_number="ADMIN001", password="WRONG")
        self.assertEqual(staff_bad_pw.status_code, 400)

        staff_ok = self.login(matric_number="ADMIN001", password="ADMIN001")
        self.assertEqual(staff_ok.status_code, 200)
        self.assertTrue(staff_ok.data["user"]["is_staff_admin"])

    def test_student_cannot_create_update_or_delete_poi_or_import_roster(self):
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

        import_res = self.client.post(
            "/api/admin/import-students/",
            {"csv_text": "BU23CSC8888,Student Hacker"},
            format="json",
        )
        self.assertEqual(import_res.status_code, 403)

    def test_staff_admin_can_bulk_import_students_and_protects_staff_accounts(self):
        self.login(matric_number="ADMIN001", password="ADMIN001")
        csv_payload = "\n".join(
            [
                "matric_number,full_name,email,password",
                "BU23CSC2001,Grace Hopper,grace@bowen.edu.ng,hopper123",
                "BU22CSC1136,Taigbenu Efezino Updated,efezino@bowen.edu.ng,",
                "ADMIN001,Overwritten Admin,evil@bowen.edu.ng,hacked",
            ]
        )
        res = self.client.post("/api/admin/import-students/", {"csv_text": csv_payload}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["created"], 1)
        self.assertEqual(res.data["updated"], 1)
        self.assertEqual(res.data["skipped"], 1)

        admin_user = User.objects.get(matric_number="ADMIN001")
        self.assertTrue(admin_user.is_staff_admin)
        self.assertTrue(admin_user.check_password("ADMIN001"))

        new_student_login = self.client.post(
            "/api/auth/login/",
            {"matric_number": "BU23CSC2001", "password": "hopper123"},
            format="json",
        )
        self.assertEqual(new_student_login.status_code, 200)

    @override_settings(
        REST_FRAMEWORK={
            "DEFAULT_AUTHENTICATION_CLASSES": (
                "rest_framework_simplejwt.authentication.JWTAuthentication",
                "rest_framework.authentication.SessionAuthentication",
            ),
            "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
            "DEFAULT_THROTTLE_CLASSES": (
                "rest_framework.throttling.AnonRateThrottle",
                "rest_framework.throttling.UserRateThrottle",
            ),
            "DEFAULT_THROTTLE_RATES": {
                "anon": "120/min",
                "user": "600/min",
                "auth": "2/min",
                "places": "60/min",
            },
        }
    )
    def test_auth_endpoint_rate_limiting_returns_429(self):
        for _ in range(2):
            res = self.client.post(
                "/api/auth/login/",
                {"matric_number": "BU22CSC1136", "password": "WRONG"},
                format="json",
            )
            self.assertEqual(res.status_code, 400)

        throttled = self.client.post(
            "/api/auth/login/",
            {"matric_number": "BU22CSC1136", "password": "WRONG"},
            format="json",
        )
        self.assertEqual(throttled.status_code, 429)

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
        response = self.client.get("/api/tracks/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["type"], "FeatureCollection")
        feature = response.data["features"][0]
        self.assertEqual(feature["geometry"]["type"], "LineString")
        self.assertEqual(feature["properties"]["track_type"], "pedestrian")

    def test_staff_admin_can_create_and_update_poi_with_jwt(self):
        self.login(matric_number="ADMIN001", password="ADMIN001")
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

        img_res_1 = self.client.get("/api/places/photo/?ref=PHOTO_REF_123&maxwidth=800")
        self.assertEqual(img_res_1.status_code, 200)
        self.assertEqual(img_res_1.content, b"\xff\xd8\xff\xe0FAKE_JPEG_BYTES")
        self.assertEqual(mock_get.call_count, 2)

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

    def test_directions_suppresses_false_turns_on_same_curved_road(self):
        Track.objects.all().delete()
        Track.objects.create(
            name="Curving Bowen Avenue",
            track_type=Track.TRACK_TYPE_VEHICLE,
            geometry=LineString(
                (4.1910, 7.6210),
                (4.1920, 7.6212),
                (4.1930, 7.6219),
                (4.1938, 7.6228),
                srid=4326,
            ),
            source="test",
        )

        res = self.client.post(
            "/api/directions/",
            {
                "origin": {"latitude": 7.6210, "longitude": 4.1910},
                "destination": {"latitude": 7.6228, "longitude": 4.1938},
                "mode": "driving",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        road_steps = [s for s in res.data["steps"] if s["maneuver"] != "arrive"]
        self.assertEqual(len(road_steps), 1)
        self.assertEqual(road_steps[0]["maneuver"], "depart")
        self.assertEqual(road_steps[0]["road_name"], "Curving Bowen Avenue")

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

    def test_seeded_campus_routes_reach_newly_connected_spurs(self):
        call_command("seed_campus")
        gate = PointOfInterest.objects.get(name="Main Gate")
        for target_name in ("Faculty of Agriculture", "Bowen Guest House"):
            target = PointOfInterest.objects.get(name=target_name)
            res = self.client.post(
                "/api/directions/",
                {
                    "origin": {"latitude": gate.location.y, "longitude": gate.location.x},
                    "destination": {"latitude": target.location.y, "longitude": target.location.x},
                    "mode": "walking",
                },
                format="json",
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.data["provider"], "bowen-routing")
            self.assertGreater(len(res.data["steps"]), 1)
