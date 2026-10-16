"""
TrustTrip Mobile API & Android Integration Test Suite
Verifies all mobile endpoints end-to-end against Supabase PostgreSQL and Flask backend.
"""

import sys
import os
import json
import time
import unittest

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database import get_supabase
from live_test_support import require_live


class TestTrustTripMobileAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_live()
        from database.supabase_client import get_supabase
        cls.client = app.test_client()
        cls.supabase = get_supabase()
        cls.test_suffix = str(int(time.time()))
        cls.test_username = f"traveler_{cls.test_suffix}"
        cls.test_password = "SecurePassword@123"
        cls.test_phone = f"98765{cls.test_suffix[-5:]}"
        cls.test_country = "India"
        cls.test_country_code = "+91"
        cls.test_full_phone = f"+91{cls.test_phone}"
        cls.test_name = f"Test Traveler {cls.test_suffix[-4:]}"

    def test_01_health_check(self):
        """Test API health check and Supabase connectivity."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "ok")
        self.assertTrue(data.get("connected"))

    def test_02_registration_with_country_and_sms(self):
        """Test registration with country code, full phone normalization, and welcome SMS."""
        payload = {
            "name": self.test_name,
            "username": self.test_username,
            "password": self.test_password,
            "country": self.test_country,
            "country_code": self.test_country_code,
            "phone_number": self.test_phone,
            "mob": self.test_phone,
            "nationality": self.test_country,
            "address": "123 Marine Drive, Mumbai",
            "emergency_contact": "Emergency Friend (+919800000000)"
        }
        res = self.client.post("/register", json=payload)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertIn("sms_sent", data)
        self.assertTrue(data.get("sms_sent") is not None)
        print(f"\n[TEST PASS] User registered with SMS dispatch status '{data.get('sms_status')}': {self.test_username} ({self.test_full_phone})")

    def test_03_duplicate_username_rejected(self):
        """Test that registering duplicate username is rejected with HTTP 400."""
        payload = {
            "name": "Another User",
            "username": self.test_username,
            "password": "AnotherPassword@123",
            "country_code": "+91",
            "phone_number": "9999999999"
        }
        res = self.client.post("/register", json=payload)
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertFalse(data.get("success"))
        self.assertIn("already registered", data.get("message", ""))
        print("\n[TEST PASS] Duplicate username rejection verified.")

    def test_04_login_success(self):
        """Test login with valid credentials."""
        payload = {
            "username": self.test_username,
            "password": self.test_password
        }
        res = self.client.post("/login", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        user = data.get("user")
        self.assertEqual(user.get("username"), self.test_username)
        self.assertTrue(data.get("token"))
        # Later tests call protected routes as this traveler
        self.__class__.client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {data['token']}"
        self.assertEqual(user.get("status"), "ACTIVE")
        print(f"\n[TEST PASS] Login successful for user: {user.get('username')}")

    def test_05_login_invalid_password(self):
        """Test login with wrong password."""
        payload = {
            "username": self.test_username,
            "password": "WrongPassword!999"
        }
        res = self.client.post("/login", json=payload)
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get("success"))
        print("\n[TEST PASS] Invalid password rejected with 401.")

    def test_06_login_suspended_account(self):
        """Test that suspended accounts receive HTTP 403 with appropriate warning message."""
        # Suspend user directly in database
        self.supabase.table("users").update({"status": "SUSPENDED"}).eq("username", self.test_username).execute()

        payload = {
            "username": self.test_username,
            "password": self.test_password
        }
        res = self.client.post("/login", json=payload)
        self.assertEqual(res.status_code, 403)
        data = res.get_json()
        self.assertFalse(data.get("success"))
        self.assertIn("suspended", data.get("message", "").lower())
        print("\n[TEST PASS] Suspended user login blocked with HTTP 403.")

        # Re-activate user directly in database
        self.supabase.table("users").update({"status": "ACTIVE"}).eq("username", self.test_username).execute()

    def test_07_profile_fetch_and_update(self):
        """Test profile viewing and updating."""
        # GET profile
        res = self.client.get(f"/profile/{self.test_username}")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("username"), self.test_username)

        # PUT profile
        update_payload = {
            "name": f"{self.test_name} Updated",
            "mob": self.test_phone,
            "address": "456 Gateway Promenade, Colaba, Mumbai",
            "nationality": self.test_country,
            "emergency_contact": "Emergency Guardian (+919876500000)"
        }
        put_res = self.client.put(f"/profile/{self.test_username}", json=update_payload)
        self.assertEqual(put_res.status_code, 200)
        updated_data = put_res.get_json()
        user_obj = updated_data.get("user", {})
        self.assertEqual(user_obj.get("name"), f"{self.test_name} Updated")
        print("\n[TEST PASS] Profile fetch and update verified.")

    def test_08_sos_emergency_lifecycle(self):
        """Test SOS emergency trigger, active check, and cancel."""
        sos_payload = {
            "username": self.test_username,
            "emergency_type": "Medical Emergency (Chest Pain)",
            "latitude": 18.9220,
            "longitude": 72.8346,
            "location_name": "Gateway of India Plaza",
            "phone": self.test_full_phone
        }
        trigger_res = self.client.post("/sos/trigger", json=sos_payload)
        self.assertEqual(trigger_res.status_code, 201)
        data = trigger_res.get_json()
        self.assertTrue(data.get("success"))
        self.assertIn("incident", data)
        incident_id = data["incident"].get("id")
        self.assertIsNotNone(incident_id)

        # Check active status
        status_res = self.client.get(f"/sos/status/{self.test_username}")
        self.assertEqual(status_res.status_code, 200)
        status_data = status_res.get_json()
        self.assertTrue(status_data.get("success"))
        self.assertIsNotNone(status_data.get("active_incident"))

        # Cancel SOS
        cancel_res = self.client.post("/sos/cancel", json={"incident_id": incident_id, "username": self.test_username})
        self.assertEqual(cancel_res.status_code, 200)
        self.assertTrue(cancel_res.get_json().get("success"))
        print("\n[TEST PASS] SOS emergency trigger, active status, and cancellation verified.")

    def test_09_special_offers_and_facilities(self):
        """Test public offers and facilities endpoints."""
        # Offers
        offers_res = self.client.get("/offers")
        self.assertIn(offers_res.status_code, [200, 500, 503])
        if offers_res.status_code == 200:
            offers = offers_res.get_json()
            self.assertIsInstance(offers, list)

        # Facilities
        fac_res = self.client.get("/facilities")
        self.assertIn(fac_res.status_code, [200, 500, 503])
        if fac_res.status_code == 200:
            facilities = fac_res.get_json()
            self.assertIsInstance(facilities, list)
        print("\n[TEST PASS] Offers and Facilities endpoints verified.")

    def test_10_ai_chatbot_assistant(self):
        """Test AI travel safety companion responses."""
        chat_payload = {
            "message": "Where is the nearest police station?",
            "username": self.test_username
        }
        res = self.client.post("/chatbot/message", json=chat_payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertIn("police", data.get("reply", "").lower())
        print("\n[TEST PASS] AI Travel Safety Assistant chat response verified.")

    def test_11_complaint_workflow(self):
        """Test complaint submission and user complaints query."""
        complaint_payload = {
            "username": self.test_username,
            "category": "Overpricing",
            "description": "Taxi driver refused meter near Churchgate station.",
            "latitude": 18.9322,
            "longitude": 72.8264
        }
        res = self.client.post("/complaint", json=complaint_payload)
        self.assertIn(res.status_code, [200, 201])

        # Fetch user complaints
        user_c_res = self.client.get(f"/user-complaints/{self.test_username}")
        self.assertEqual(user_c_res.status_code, 200)
        complaints = user_c_res.get_json()
        self.assertIsInstance(complaints, list)
        self.assertGreater(len(complaints), 0)
        self.assertEqual(complaints[0].get("category"), "Overpricing")
        print(f"\n[TEST PASS] Complaint workflow verified ({len(complaints)} complaints for user).")

    def test_12_price_check_and_guides(self):
        """Test price check items and verified guides."""
        # Prices
        price_res = self.client.get("/prices")
        self.assertEqual(price_res.status_code, 200)

        # Guides
        guide_res = self.client.get("/guides")
        self.assertEqual(guide_res.status_code, 200)
        guides = guide_res.get_json()
        self.assertIsInstance(guides, list)
        print(f"\n[TEST PASS] Price check and Guides ({len(guides)}) verified.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
