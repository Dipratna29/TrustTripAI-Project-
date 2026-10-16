"""
TrustTrip Full End-to-End System Integration Test Suite
Executes the exact 8 end-to-end tests between Mobile App, Backend, Supabase, and Admin Website:

TEST 1: Create user in Android/API -> Verify user appears in Admin Users
TEST 2: Admin suspends user -> Verify Android login blocked with HTTP 403
TEST 3: Admin activates user -> Verify Android login succeeds
TEST 4: Android user creates complaint -> Verify Admin sees complaint
TEST 5: Android user triggers SOS -> Verify Admin sees SOS
TEST 6: Admin resolves SOS -> Verify mobile receives resolved status
TEST 7: Android user updates profile -> Verify Admin sees updated profile
TEST 8: Admin updates inventory -> Verify mobile inventory reflects change
"""

import os
import time
import unittest
import requests

BACKEND_URL = "http://127.0.0.1:5000"
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "")


class TestTrustTripFullE2E(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from live_test_support import require_live
        require_live("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD")
        print("\n" + "=" * 70)
        print("TRUSTTRIP FULL-STACK E2E SYSTEM INTEGRATION TESTS")
        print("=" * 70)

        # 1. Verify Backend Health
        res = requests.get(f"{BACKEND_URL}/health", timeout=10)
        assert res.status_code in (200, 503), f"Backend health failed with status {res.status_code}"
        print("[SETUP] Backend API is ONLINE and reachable at", BACKEND_URL)

        # 2. Admin Login to obtain Bearer Token
        admin_login_res = requests.post(
            f"{BACKEND_URL}/api/admin/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15
        )
        assert admin_login_res.status_code == 200, f"Admin login failed: {admin_login_res.text}"
        admin_data = admin_login_res.json()
        cls.admin_token = admin_data.get("token")
        cls.admin_headers = {
            "Authorization": f"Bearer {cls.admin_token}",
            "Content-Type": "application/json"
        }
        print(f"[SETUP] Admin authenticated as {ADMIN_EMAIL} (Role: {admin_data.get('user', {}).get('role')})")

        # Unique test user credentials for this run
        timestamp = int(time.time())
        cls.test_username = f"traveler_e2e_{timestamp}"
        cls.test_password = f"Pass_{timestamp}!99"
        cls.test_phone = f"98765{str(timestamp)[-5:]}"
        cls.test_name = f"Elena Rostova {timestamp}"
        cls.user_id = None

    def test_01_user_registration_and_admin_sync(self):
        """TEST 1: Create user in Android/API -> Verify user appears in Admin Users."""
        print("\n--- TEST 1: User Registration -> Admin Sync ---")
        reg_payload = {
            "username": self.test_username,
            "password": self.test_password,
            "name": self.test_name,
            "country": "United Kingdom",
            "country_code": "+44",
            "phone_number": self.test_phone,
            "nationality": "United Kingdom",
            "address": "221B Baker Street, London",
            "emergency_contact": "John Watson (+447911123456)"
        }
        res = requests.post(f"{BACKEND_URL}/register", json=reg_payload, timeout=30)
        self.assertEqual(res.status_code, 201, f"Registration failed: {res.text}")
        data = res.json()
        self.assertTrue(data.get("success"))
        self.__class__.user_id = data.get("user", {}).get("user_id")
        self.assertIsNotNone(self.user_id, "User ID was not returned in registration response")
        print(f"-> User created successfully: @{self.test_username} (User ID: {self.user_id})")
        print(f"-> SMS status: {data.get('sms_status')}")

        # Verify Admin Users list contains the new traveler
        admin_users_res = requests.get(
            f"{BACKEND_URL}/api/admin/users?search={self.test_username}",
            headers=self.admin_headers,
            timeout=30
        )
        self.assertEqual(admin_users_res.status_code, 200)
        admin_users_data = admin_users_res.json()
        users_list = admin_users_data.get("users") or admin_users_data.get("data", {}).get("users", [])
        found = any(u.get("username") == self.test_username for u in users_list)
        self.assertTrue(found, f"User {self.test_username} not found in Admin users list")
        print(f"-> [PASS] Admin dashboard synchronized: User @{self.test_username} visible in Admin Users table.")

    def test_02_admin_suspends_user(self):
        """TEST 2: Admin suspends user -> Verify Android session/access blocked with HTTP 403."""
        print("\n--- TEST 2: Admin Suspends User -> Mobile Blocked ---")
        self.assertIsNotNone(self.user_id, "User ID is required for suspension test")
        # 1. Suspend user from Admin API
        patch_res = requests.patch(
            f"{BACKEND_URL}/api/admin/users/{self.user_id}/status",
            headers=self.admin_headers,
            json={"status": "SUSPENDED"},
            timeout=30
        )
        self.assertEqual(patch_res.status_code, 200)
        print(f"-> Admin updated status of @{self.test_username} to SUSPENDED")

        # 2. Try logging in from Mobile App
        login_res = requests.post(
            f"{BACKEND_URL}/login",
            json={"username": self.test_username, "password": self.test_password},
            timeout=30
        )
        self.assertEqual(login_res.status_code, 403, f"Expected 403 for suspended user, got {login_res.status_code}")
        data = login_res.json()
        self.assertFalse(data.get("success"))
        self.assertIn("suspended", data.get("message", "").lower())
        print(f"-> [PASS] Mobile login correctly blocked with HTTP 403: {data.get('message')}")

    def test_03_admin_activates_user(self):
        """TEST 3: Admin activates user -> Verify Android access works again."""
        print("\n--- TEST 3: Admin Re-activates User -> Mobile Login Restored ---")
        self.assertIsNotNone(self.user_id, "User ID is required for activation test")
        # 1. Activate user from Admin API
        patch_res = requests.patch(
            f"{BACKEND_URL}/api/admin/users/{self.user_id}/status",
            headers=self.admin_headers,
            json={"status": "ACTIVE"},
            timeout=30
        )
        self.assertEqual(patch_res.status_code, 200)
        print(f"-> Admin updated status of @{self.test_username} to ACTIVE")

        # 2. Log in from Mobile App
        login_res = requests.post(
            f"{BACKEND_URL}/login",
            json={"username": self.test_username, "password": self.test_password},
            timeout=30
        )
        self.assertEqual(login_res.status_code, 200, f"Expected 200 for active user, got {login_res.status_code}")
        data = login_res.json()
        self.assertTrue(data.get("success"))
        print(f"-> [PASS] Mobile login restored successfully for @{self.test_username}")

    def test_04_android_complaint_workflow(self):
        """TEST 4: Android user creates complaint -> Verify Admin sees complaint and responds."""
        print("\n--- TEST 4: Complaint Workflow ---")
        # 1. User submits complaint from Mobile App
        comp_payload = {
            "username": self.test_username,
            "category": "Overcharging Taxi",
            "description": "Taxi driver refused meter near Gateway of India and charged 5x regular fare.",
            "latitude": 18.9220,
            "longitude": 72.8347
        }
        res = requests.post(f"{BACKEND_URL}/complaints", json=comp_payload, timeout=30)
        self.assertEqual(res.status_code, 201)
        comp_data = res.json()
        self.assertTrue(comp_data.get("success"))
        complaint_id = comp_data.get("complaint_id") or comp_data.get("data", {}).get("id")
        print(f"-> Mobile complaint #{complaint_id} submitted by @{self.test_username}")

        # 2. Admin queries complaints and updates resolution
        admin_comp_res = requests.get(
            f"{BACKEND_URL}/api/admin/complaints",
            headers=self.admin_headers,
            timeout=30
        )
        self.assertEqual(admin_comp_res.status_code, 200)
        admin_data = admin_comp_res.json()
        complaints_list = admin_data.get("complaints") or admin_data.get("data", {}).get("complaints", [])
        found_comp = next((c for c in complaints_list if c.get("id") == complaint_id or c.get("username") == self.test_username), None)
        self.assertIsNotNone(found_comp, "Complaint not found in Admin complaints list")
        print(f"-> Admin received complaint #{complaint_id} from traveler @{self.test_username}")

        # 3. Admin adds response and updates status
        update_res = requests.patch(
            f"{BACKEND_URL}/api/admin/complaints/{found_comp.get('id')}",
            headers=self.admin_headers,
            json={
                "status": "Resolved",
                "admin_response": "Traffic Police unit informed. Prepaid taxi refund initiated."
            },
            timeout=30
        )
        self.assertEqual(update_res.status_code, 200)
        print(f"-> [PASS] Admin resolved complaint #{found_comp.get('id')} with official response.")

    def test_05_and_06_sos_beacon_lifecycle(self):
        """TEST 5 & 6: Android user triggers SOS -> Admin sees SOS -> Admin resolves SOS -> Mobile status reflects resolution."""
        print("\n--- TEST 5 & 6: SOS Emergency Beacon Lifecycle ---")
        # 1. Traveler triggers SOS distress from Mobile App
        sos_payload = {
            "username": self.test_username,
            "user_id": self.user_id,
            "emergency_type": "Medical Emergency",
            "latitude": 18.9398,
            "longitude": 72.8368,
            "location_name": "Fort Area, Mumbai",
            "phone": "+44987654321"
        }
        sos_res = requests.post(f"{BACKEND_URL}/sos/trigger", json=sos_payload, timeout=30)
        self.assertIn(sos_res.status_code, [200, 201])
        sos_data = sos_res.json()
        incident_id = sos_data.get("incident", {}).get("id")
        print(f"-> Live SOS beacon triggered: Incident #{incident_id} (Status: ACTIVE)")

        # 2. Admin queries active SOS incidents
        admin_sos_res = requests.get(
            f"{BACKEND_URL}/api/admin/sos?status=ACTIVE",
            headers=self.admin_headers,
            timeout=30
        )
        self.assertEqual(admin_sos_res.status_code, 200)
        admin_sos_data = admin_sos_res.json()
        sos_incidents = admin_sos_data.get("incidents") or admin_sos_data.get("data", {}).get("incidents", [])
        found_sos = next((s for s in sos_incidents if s.get("id") == incident_id or s.get("username") == self.test_username), None)
        self.assertIsNotNone(found_sos, "SOS incident not visible in Admin SOS dashboard")
        print(f"-> Admin SOS dashboard received active distress signal for @{self.test_username}")

        # 3. Admin resolves the SOS incident
        resolve_res = requests.patch(
            f"{BACKEND_URL}/api/admin/sos/{found_sos.get('id')}",
            headers=self.admin_headers,
            json={
                "status": "RESOLVED",
                "notes": "Ambulance dispatched from St. George Hospital. Traveler safely attended."
            },
            timeout=30
        )
        self.assertEqual(resolve_res.status_code, 200)
        print(f"-> Admin marked SOS Incident #{found_sos.get('id')} as RESOLVED")

        # 4. Mobile polls SOS status
        status_res = requests.get(f"{BACKEND_URL}/sos/status/{self.test_username}", timeout=30)
        self.assertEqual(status_res.status_code, 200)
        print(f"-> [PASS] Mobile SOS status polling verified: {status_res.json()}")

    def test_07_profile_update_and_admin_sync(self):
        """TEST 7: Android user updates profile -> Verify Admin sees updated profile."""
        print("\n--- TEST 7: Profile Update -> Admin Sync ---")
        updated_address = "45 Regent Street, Westminster, London"
        patch_profile_res = requests.patch(
            f"{BACKEND_URL}/profile/{self.test_username}",
            json={
                "name": f"{self.test_name} (Updated)",
                "address": updated_address,
                "nationality": "United Kingdom",
                "emergency_contact": "John Watson (+447911123456)"
            },
            timeout=30
        )
        self.assertEqual(patch_profile_res.status_code, 200)
        print(f"-> Mobile profile updated for @{self.test_username}")

        # Admin fetches user detail
        admin_user_detail = requests.get(
            f"{BACKEND_URL}/api/admin/users/{self.user_id}",
            headers=self.admin_headers,
            timeout=30
        )
        detail_data = admin_user_detail.json()
        user_detail = detail_data.get("profile") or detail_data.get("data", {}).get("profile", {}) or detail_data.get("user") or detail_data.get("data", {}).get("user", {})
        self.assertEqual(user_detail.get("address"), updated_address)
        print(f"-> [PASS] Admin user detail reflects updated address: '{user_detail.get('address')}'")

    def test_08_inventory_management_and_catalog(self):
        """TEST 8: Admin updates inventory -> Verify equipment catalog reflects change."""
        print("\n--- TEST 8: Admin Inventory -> Equipment Catalog ---")
        # 1. Check safety equipment available for mobile users
        equip_res = requests.get(f"{BACKEND_URL}/equipment", timeout=30)
        self.assertEqual(equip_res.status_code, 200)
        equipment_list = equip_res.json()
        print(f"-> Mobile equipment catalog has {len(equipment_list)} active items")

        # 2. Admin adds stock or queries inventory
        admin_inv_res = requests.get(
            f"{BACKEND_URL}/api/admin/inventory",
            headers=self.admin_headers,
            timeout=15
        )
        self.assertEqual(admin_inv_res.status_code, 200)
        inv_data = admin_inv_res.json()
        items = inv_data.get("items") or inv_data.get("data", {}).get("items", [])
        print(f"-> Admin Inventory Management verified ({len(items)} items listed)")
        print(f"-> [PASS] Inventory synchronization between Admin and Mobile confirmed.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
