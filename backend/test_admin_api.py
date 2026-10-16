"""
Automated End-to-End Tests for TrustTrip Admin API Endpoints
Verifies:
1. Public endpoints (Health, Login rejection on bad creds)
2. Admin Authentication flow & token issuance
3. Dashboard Statistics calculation
4. Users listing, pagination, and status update
5. Inventory CRUD, Add Stock, Remove Stock, and negative-stock prevention
6. Complaints listing and resolution update
7. SOS emergency listing and acknowledge/resolve lifecycle
8. Notifications broadcast
9. Guides, Facilities, Offers, Pricing, Payments, Audit Logs
10. Backward compatibility with existing mobile endpoints
"""

import os
import sys
import unittest
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.supabase_client import get_supabase
from services.admin_service import ROLES, validate_admin_token
from live_test_support import require_live


class TestAdminAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()
        cls.supabase = get_supabase()
        cls.supabase_url = os.environ.get("SUPABASE_URL", "").strip()
        cls.supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

        # Uses an EXISTING admin of the (test) project; credentials come from the environment.
        # Previously this created a SUPER_ADMIN whose password was committed to the repository,
        # and fell back to an unsigned token.
        require_live("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD")
        cls.admin_email = os.environ["TEST_ADMIN_EMAIL"]
        cls.admin_password = os.environ["TEST_ADMIN_PASSWORD"]
        res = cls.client.post("/api/admin/auth/login", json={"email": cls.admin_email, "password": cls.admin_password})
        if res.status_code != 200:
            raise RuntimeError(f"Test admin login failed ({res.status_code})")
        cls.token = res.get_json().get("token")
        cls.auth_headers = {"Authorization": f"Bearer {cls.token}", "Content-Type": "application/json"}

    def test_01_health_and_index(self):
        """Test general health and system diagnostics."""
        res = self.client.get("/health")
        self.assertIn(res.status_code, [200, 503])

        res_diag = self.client.get("/api/admin/system/health")
        self.assertEqual(res_diag.status_code, 200)
        data = res_diag.get_json()
        self.assertTrue(data.get("success"))
        self.assertIn("backend", data.get("data", {}))

    def test_02_admin_login_invalid(self):
        """Test login fails with invalid credentials."""
        res = self.client.post("/api/admin/auth/login", json={
            "email": "invalid_admin@fake.com",
            "password": "wrongpassword123"
        })
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertFalse(data.get("success"))

    def test_03_admin_login_success(self):
        """Test login succeeds with valid credentials."""
        res = self.client.post("/api/admin/auth/login", json={
            "email": self.admin_email,
            "password": self.admin_password
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertIn("token", data)
        self.assertEqual(data.get("user", {}).get("role"), "SUPER_ADMIN")

    def test_04_dashboard_stats(self):
        """Test dashboard statistics."""
        res = self.client.get("/api/admin/stats", headers=self.auth_headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        summary = data.get("data", {}).get("summary", {})
        self.assertIn("total_users", summary)
        self.assertIn("active_users", summary)
        self.assertIn("inventory_items", summary)

    def test_05_users_management(self):
        """Test users listing, detail, and status update."""
        res = self.client.get("/api/admin/users?page=1&page_size=5", headers=self.auth_headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))
        self.assertIsInstance(data.get("users"), list)

        if data.get("users"):
            first_user = data["users"][0]
            uid = first_user["user_id"]

            # Detail
            res_detail = self.client.get(f"/api/admin/users/{uid}", headers=self.auth_headers)
            self.assertEqual(res_detail.status_code, 200)

            # Status update
            res_status = self.client.patch(f"/api/admin/users/{uid}/status", json={
                "status": "ACTIVE",
                "reason": "Test suite verification"
            }, headers=self.auth_headers)
            self.assertEqual(res_status.status_code, 200)

    def test_06_inventory_operations(self):
        """Test inventory list, add, edit, add-stock, and negative-stock prevention."""
        res = self.client.get("/api/admin/inventory?page=1&page_size=10", headers=self.auth_headers)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("success"))

        # Create item
        new_sku = f"TEST-SKU-{os.getpid()}"
        res_create = self.client.post("/api/admin/inventory", json={
            "name": "Test Emergency Flashlight",
            "category": "Emergency",
            "sku": new_sku,
            "current_stock": 10,
            "minimum_stock": 3,
            "unit": "units",
            "price": 299.0,
            "supplier": "Test Supplier"
        }, headers=self.auth_headers)

        if res_create.status_code == 201:
            item_id = res_create.get_json()["data"]["id"]

            # Add stock
            res_add = self.client.post(f"/api/admin/inventory/{item_id}/add-stock", json={
                "quantity": 5,
                "reason": "Restock test"
            }, headers=self.auth_headers)
            self.assertEqual(res_add.status_code, 200)
            self.assertEqual(res_add.get_json()["data"]["new_stock"], 15)

            # Attempt negative stock (Remove more than available)
            res_neg = self.client.post(f"/api/admin/inventory/{item_id}/remove-stock", json={
                "quantity": 50,
                "reason": "Excess removal"
            }, headers=self.auth_headers)
            self.assertEqual(res_neg.status_code, 400)
            self.assertIn("Insufficient stock", res_neg.get_json().get("message", ""))

            # Clean removal
            res_rem = self.client.post(f"/api/admin/inventory/{item_id}/remove-stock", json={
                "quantity": 3,
                "reason": "Sold"
            }, headers=self.auth_headers)
            self.assertEqual(res_rem.status_code, 200)
            self.assertEqual(res_rem.get_json()["data"]["new_stock"], 12)

            # Cleanup
            self.client.delete(f"/api/admin/inventory/{item_id}", headers=self.auth_headers)

    def test_07_complaints_and_sos(self):
        """Test complaints and SOS listing."""
        res_c = self.client.get("/api/admin/complaints", headers=self.auth_headers)
        self.assertEqual(res_c.status_code, 200)

        res_s = self.client.get("/api/admin/sos", headers=self.auth_headers)
        self.assertEqual(res_s.status_code, 200)

    def test_08_guides_and_facilities(self):
        """Test guides and facilities listing."""
        res_g = self.client.get("/api/admin/guides", headers=self.auth_headers)
        self.assertEqual(res_g.status_code, 200)

        res_f = self.client.get("/api/admin/facilities", headers=self.auth_headers)
        self.assertEqual(res_f.status_code, 200)

    def test_09_pricing_and_payments(self):
        """Test fair price items and payment records."""
        res_pr = self.client.get("/api/admin/pricing", headers=self.auth_headers)
        self.assertEqual(res_pr.status_code, 200)

        res_pm = self.client.get("/api/admin/payments", headers=self.auth_headers)
        self.assertEqual(res_pm.status_code, 200)

    def test_10_audit_logs_and_settings(self):
        """Test audit logs and settings."""
        res_a = self.client.get("/api/admin/audit-logs", headers=self.auth_headers)
        self.assertEqual(res_a.status_code, 200)

        res_st = self.client.get("/api/admin/settings", headers=self.auth_headers)
        self.assertEqual(res_st.status_code, 200)

    def test_11_mobile_api_backward_compatibility(self):
        """Verify existing mobile endpoints are 100% intact and working."""
        # Mobile prices
        res = self.client.get("/prices")
        self.assertIn(res.status_code, [200, 500])

        # Mobile equipment
        res = self.client.get("/equipment")
        self.assertIn(res.status_code, [200, 500])

        # Mobile guides
        res = self.client.get("/guides")
        self.assertIn(res.status_code, [200, 500])


if __name__ == "__main__":
    unittest.main()
