"""
End-to-End API and Supabase Integration Verification Script for TrustTrip.
Tests all endpoints using Flask test client against remote Supabase PostgreSQL.
"""

import os
import sys
import unittest
from app import app
from database.supabase_client import get_supabase, check_supabase_connection
from live_test_support import login_traveler, require_live


class TrustTripIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_live("TEST_TRAVELER_USERNAME", "TEST_TRAVELER_PASSWORD")
        cls.client = app.test_client()
        cls.supabase = get_supabase()
        cls.username = os.environ["TEST_TRAVELER_USERNAME"]
        cls.password = os.environ["TEST_TRAVELER_PASSWORD"]
        # Protected routes need the signed session token issued by /login
        cls.user = login_traveler(cls.client, cls.username, cls.password)
        cls.user_id = cls.user["id"]

    def test_01_health_check(self):
        """GET /health - Verifies backend health and Supabase connection."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("database"), "supabase")
        self.assertTrue(data.get("connected"))

    def test_02_index(self):
        """GET / - Welcome route."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "online")

    def test_03_login_existing_migrated_user(self):
        """POST /login - Verifies login with migrated user."""
        res = self.client.post("/login", json={"username": self.username, "password": self.password})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("user", {}).get("username"), self.username)
        self.assertTrue(data.get("token"))
        self.assertIsNotNone(data.get("user", {}).get("id"))

    def test_04_login_invalid_password(self):
        """POST /login - Rejects wrong password."""
        res = self.client.post("/login", json={"username": self.username, "password": "WrongPassword999"})
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get("success"))

    def test_05_registration_and_login_new_user(self):
        """POST /register & POST /login - Register and authenticate new user."""
        import random
        rand_id = random.randint(10000, 99999)
        new_username = f"e2e_user_{rand_id}"
        reg_payload = {
            "username": new_username,
            "password": "securepassword123",
            "name": f"E2E Tester {rand_id}",
            "mob": f"98765{rand_id}",
            "phone_number": f"98765{rand_id}",
            "country_code": "+91",
            "address": "Delhi, India",
            "nationality": "Indian",
            "emergency_contact": "+919876500001"
        }
        res_reg = self.client.post("/register", json=reg_payload)
        self.assertIn(res_reg.status_code, [200, 201])
        self.assertTrue(res_reg.get_json().get("success"))

        # Verify login with new user
        res_login = self.client.post("/login", json={"username": new_username, "password": "securepassword123"})
        self.assertEqual(res_login.status_code, 200)
        user_data = res_login.get_json().get("user", {})
        self.assertEqual(user_data.get("username"), new_username)

    def test_06_profile_retrieval_and_update(self):
        """GET & PUT /profile/<username> - Fetch and update profile."""
        res_get = self.client.get(f"/profile/{self.username}")
        self.assertEqual(res_get.status_code, 200)
        profile = res_get.get_json()
        self.assertEqual(profile.get("username"), self.username)
        self.assertNotIn("password", profile)

        # Update profile
        update_payload = {
            "name": "Test User Updated",
            "mob": "+919876543210",
            "address": "Mumbai Central, India",
            "nationality": "Indian",
            "emergency_contact": "+919876543211"
        }
        res_put = self.client.put(f"/profile/{self.username}", json=update_payload)
        self.assertEqual(res_put.status_code, 200)

        # Verify updated data
        res_get_updated = self.client.get(f"/profile/{self.username}")
        self.assertEqual(res_get_updated.get_json().get("address"), "Mumbai Central, India")

    def test_07_guides_and_ratings(self):
        """GET /guides, POST /rate-guide, POST /select-guide, POST /cancel-booking."""
        res_guides = self.client.get(f"/guides?username={self.username}")
        self.assertEqual(res_guides.status_code, 200)
        guides = res_guides.get_json()
        self.assertIsInstance(guides, list)
        self.assertGreater(len(guides), 0)

        guide_id = guides[0]["g_id"]

        # Rate guide
        res_rate = self.client.post("/rate-guide", json={
            "guide_id": guide_id,
            "username": "testuser",
            "rating": 5.0
        })
        self.assertEqual(res_rate.status_code, 200)

        # Select guide
        res_select = self.client.post("/select-guide", json={
            "guide_id": guide_id,
            "username": "testuser"
        })
        self.assertIn(res_select.status_code, [200, 409])

        # Cancel guide booking
        res_cancel = self.client.post("/cancel-booking", json={
            "guide_id": guide_id,
            "username": "testuser"
        })
        self.assertIn(res_cancel.status_code, [200, 404])

    def test_08_equipment_and_prices(self):
        """GET /prices, GET /equipment, GET /equipment/<id>, POST /place-order, GET /user-orders/<id>."""
        # Prices
        res_prices = self.client.get("/prices")
        self.assertEqual(res_prices.status_code, 200)
        prices = res_prices.get_json()
        self.assertIsInstance(prices, list)
        self.assertGreater(len(prices), 0)

        # Equipment
        res_eq = self.client.get("/equipment")
        self.assertEqual(res_eq.status_code, 200)
        equipment = res_eq.get_json()
        self.assertIsInstance(equipment, list)
        self.assertGreater(len(equipment), 0)

        eq_id = equipment[0]["id"]
        res_single_eq = self.client.get(f"/equipment/{eq_id}")
        self.assertEqual(res_single_eq.status_code, 200)
        self.assertEqual(res_single_eq.get_json().get("id"), eq_id)

        # Place order
        # Cash on Delivery order; the server prices it (client total is ignored)
        res_order = self.client.post("/orders/cod", json={
            "equipment_id": eq_id,
            "quantity": 1,
            "latitude": 18.922,
            "longitude": 72.834,
            "delivery_address": "Integration test address, Mumbai",
            "contact_phone": "+919876543210",
        })
        self.assertEqual(res_order.status_code, 200)
        order_data = res_order.get_json()
        self.assertIn("order_id", order_data)

        # Fetch user orders
        res_user_orders = self.client.get(f"/user-orders/{self.user_id}")
        self.assertEqual(res_user_orders.status_code, 200)
        user_orders = res_user_orders.get_json()
        self.assertIsInstance(user_orders, list)
        self.assertGreater(len(user_orders), 0)

    def test_08b_authorization_enforced(self):
        """Protected routes reject missing or foreign identities."""
        anon = app.test_client()
        self.assertEqual(anon.get(f"/profile/{self.username}").status_code, 401)
        self.assertEqual(anon.get(f"/user-orders/{self.user_id}").status_code, 401)
        self.assertEqual(self.client.get(f"/user-orders/{int(self.user_id) + 1}").status_code, 403)
        self.assertEqual(self.client.get("/profile/some_other_user").status_code, 403)

    def test_09_crowd_locations_and_tracking(self):
        """GET /crowd/locations, POST /crowd/location-update, GET /crowd/history/<id>, GET /crowd/settings."""
        res_locs = self.client.get("/crowd/locations")
        self.assertEqual(res_locs.status_code, 200)
        locations = res_locs.get_json()
        self.assertIsInstance(locations, list)
        self.assertGreater(len(locations), 0)

        loc_id = locations[0]["location_id"]

        # Record user location
        res_ping = self.client.post("/crowd/location-update", json={
            "user_id": 1,
            "latitude": 18.9220,
            "longitude": 72.8347
        })
        self.assertEqual(res_ping.status_code, 200)
        self.assertTrue(res_ping.get_json().get("success"))

        # Crowd history
        res_history = self.client.get(f"/crowd/history/{loc_id}")
        self.assertEqual(res_history.status_code, 200)

        # Crowd settings
        res_settings = self.client.get("/crowd/settings")
        self.assertEqual(res_settings.status_code, 200)
        self.assertIn("update_interval_minutes", res_settings.get_json())

    def test_10_complaints(self):
        """POST /complaint, GET /user-complaints/<username>."""
        res_add = self.client.post("/complaint", json={
            "username": "testuser",
            "category": "Safety",
            "description": "Streetlight malfunction near Gateway of India",
            "latitude": 18.9220,
            "longitude": 72.8347
        })
        self.assertIn(res_add.status_code, [200, 201])
        self.assertIn("complaint_id", res_add.get_json())

        res_get = self.client.get("/user-complaints/testuser")
        self.assertEqual(res_get.status_code, 200)
        complaints = res_get.get_json()
        self.assertIsInstance(complaints, list)
        self.assertGreater(len(complaints), 0)

    def test_11_device_push_token_lifecycle(self):
        """POST /device, GET /devices/<user_id>, DELETE /device/<device_id>."""
        import random
        token = f"ExponentPushToken[test_{random.randint(100000, 999999)}]"

        res_reg = self.client.post("/device", json={
            "user_id": 1,
            "push_token": token,
            "device_type": "android",
            "device_name": "Pixel 8 Emulator"
        })
        self.assertEqual(res_reg.status_code, 200)
        device_id = res_reg.get_json().get("device_id")
        self.assertIsNotNone(device_id)

        # Get devices
        res_get = self.client.get("/devices/1")
        self.assertEqual(res_get.status_code, 200)
        devices = res_get.get_json().get("devices", [])
        self.assertTrue(any(d["device_id"] == device_id for d in devices))

        # Delete device
        res_del = self.client.delete(f"/device/{device_id}", json={"user_id": 1})
        self.assertEqual(res_del.status_code, 200)

    def test_12_translation(self):
        """POST /translate - Deep translator test."""
        res = self.client.post("/translate", json={
            "text": "Hello, welcome to Mumbai!",
            "source": "en",
            "target": "hi"
        })
        self.assertIn(res.status_code, [200, 500, 503])
        if res.status_code == 200:
            data = res.get_json()
            self.assertTrue(data.get("success"))
            self.assertIn("translation", data)


if __name__ == "__main__":
    unittest.main()
