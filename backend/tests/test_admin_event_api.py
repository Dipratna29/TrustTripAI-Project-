"""
Admin notification center + admin orders API: authentication, per-category
authorization, filters, pagination, read state, and order status transitions.
"""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from services.auth_tokens import issue_token
from tests.fake_supabase import FakeSupabase


def _event(i, category, severity="INFO", read=False, created="2026-10-16T10:00:00+00:00"):
    return {
        "id": i, "event_type": f"{category.lower()}.x", "category": category, "severity": severity,
        "title": f"Event {i}", "message": "m", "entity_type": "order", "entity_id": str(i),
        "metadata": {"order_id": i, "total": 400, "secret_token": "should-not-leak"},
        "dedup_key": f"k{i}", "read_at": "2026-10-16T11:00:00+00:00" if read else None,
        "read_by": None, "created_at": created,
    }


SEED = {
    "admin_events": [
        _event(1, "ORDER", created="2026-10-16T09:00:00+00:00"),
        _event(2, "SOS", "CRITICAL", created="2026-10-16T09:30:00+00:00"),
        _event(3, "INVENTORY", "WARNING", read=True, created="2026-10-15T09:00:00+00:00"),
        _event(4, "USER", created="2026-10-16T10:00:00+00:00"),
    ],
    "equipment_orders": [
        {"id": 50, "user_id": 7, "equipment_id": 3, "quantity": 2, "total_price": 400.0,
         "status": "Confirmed", "payment_method": "COD", "created_at": "2026-10-16T09:00:00+00:00"},
    ],
    "inventory_items": [{"id": 3, "name": "Pepper Spray", "sku": "EQ-3", "price": 200, "current_stock": 5, "minimum_stock": 2}],
    "users": [{"user_id": 7, "username": "asha", "name": "Asha"}],
}

ADMIN = ({"id": 1, "email": "admin@tt.test", "role": "ADMIN", "status": "ACTIVE"}, {"id": "u", "email": "admin@tt.test"})
INVENTORY_MANAGER = ({"id": 2, "email": "inv@tt.test", "role": "INVENTORY_MANAGER", "status": "ACTIVE"}, {"id": "v", "email": "inv@tt.test"})
AUTH = {"Authorization": "Bearer admin-token"}


class AdminEventApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.fake = FakeSupabase(SEED)
        self.patches = [
            patch("services.admin_event_service.get_supabase", return_value=self.fake),
            patch("routes.admin_event_routes.log_audit"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def as_admin(self, who=ADMIN):
        return patch("services.admin_service.validate_admin_token", return_value=who)

    # -- authentication / authorization ---------------------------------------
    def test_requires_admin_token(self):
        self.assertEqual(self.client.get("/api/admin/events").status_code, 401)

    def test_traveler_session_token_is_rejected(self):
        traveler = {"Authorization": f"Bearer {issue_token(7, 'asha')}"}
        with patch("services.admin_service.validate_admin_token", return_value=(None, None)):
            self.assertEqual(self.client.get("/api/admin/events", headers=traveler).status_code, 401)

    def test_category_permissions_filter_events(self):
        with self.as_admin(INVENTORY_MANAGER):
            res = self.client.get("/api/admin/events", headers=AUTH).get_json()
            self.assertEqual({e["category"] for e in res["events"]}, {"INVENTORY"})
            denied = self.client.get("/api/admin/events?category=SOS", headers=AUTH)
            self.assertEqual(denied.status_code, 403)

    # -- listing ---------------------------------------------------------------
    def test_list_sorted_paginated_and_metadata_allowlisted(self):
        with self.as_admin():
            res = self.client.get("/api/admin/events?page_size=2", headers=AUTH).get_json()
        self.assertEqual(res["total"], 4)
        self.assertEqual(res["total_pages"], 2)
        self.assertEqual([e["id"] for e in res["events"]], [4, 2])
        self.assertNotIn("secret_token", res["events"][0]["metadata"])
        self.assertNotIn("dedup_key", res["events"][0])

    def test_filters_status_category_severity_and_dates(self):
        with self.as_admin():
            unread = self.client.get("/api/admin/events?status=unread", headers=AUTH).get_json()
            self.assertEqual(sorted(e["id"] for e in unread["events"]), [1, 2, 4])
            crit = self.client.get("/api/admin/events?severity=CRITICAL", headers=AUTH).get_json()
            self.assertEqual([e["id"] for e in crit["events"]], [2])
            dated = self.client.get("/api/admin/events?since=2026-10-16T00:00:00Z", headers=AUTH).get_json()
            self.assertEqual(len(dated["events"]), 3)
            bad = self.client.get("/api/admin/events?status=maybe", headers=AUTH)
            self.assertEqual(bad.status_code, 400)
            bad_date = self.client.get("/api/admin/events?since=yesterday", headers=AUTH)
            self.assertEqual(bad_date.status_code, 400)

    # -- read state ------------------------------------------------------------
    def test_mark_read_unread_and_unread_count(self):
        with self.as_admin():
            self.assertEqual(self.client.get("/api/admin/events/unread-count", headers=AUTH).get_json()["unread"], 3)
            r = self.client.patch("/api/admin/events/1/read", json={"read": True}, headers=AUTH)
            self.assertTrue(r.get_json()["event"]["is_read"])
            counts = self.client.get("/api/admin/events/unread-count", headers=AUTH).get_json()
            self.assertEqual((counts["unread"], counts["critical_unread"]), (2, 1))
            self.client.patch("/api/admin/events/1/read", json={"read": False}, headers=AUTH)
            self.assertEqual(self.client.get("/api/admin/events/unread-count", headers=AUTH).get_json()["unread"], 3)
            self.assertEqual(self.client.patch("/api/admin/events/1/read", json={"read": "yes"}, headers=AUTH).status_code, 400)
            self.assertEqual(self.client.patch("/api/admin/events/999/read", json={}, headers=AUTH).status_code, 404)

    def test_mark_all_read_respects_permissions(self):
        with self.as_admin(INVENTORY_MANAGER):
            self.client.post("/api/admin/events/read-all", json={}, headers=AUTH)
        with self.as_admin():
            self.assertEqual(self.client.get("/api/admin/events/unread-count", headers=AUTH).get_json()["unread"], 3)
            self.assertEqual(self.client.post("/api/admin/events/read-all", json={}, headers=AUTH).get_json()["updated"], 3)
            self.assertEqual(self.client.get("/api/admin/events/unread-count", headers=AUTH).get_json()["unread"], 0)

    def test_cannot_mark_event_outside_permissions(self):
        with self.as_admin(INVENTORY_MANAGER):
            self.assertEqual(self.client.patch("/api/admin/events/2/read", json={"read": True}, headers=AUTH).status_code, 403)

    # -- orders ----------------------------------------------------------------
    def test_order_detail_from_notification(self):
        with self.as_admin():
            event = self.client.get("/api/admin/events?category=ORDER", headers=AUTH).get_json()["events"][0]
            order = self.client.get(f"/api/admin/orders/{SEED['equipment_orders'][0]['id']}", headers=AUTH).get_json()["order"]
        self.assertEqual(order["item_name"], "Pepper Spray")
        self.assertEqual(order["customer"]["username"], "asha")
        self.assertEqual(event["entity_type"], "order")

    def test_order_status_transitions(self):
        with self.as_admin():
            bad = self.client.patch("/api/admin/orders/50/status", json={"status": "Delivered"}, headers=AUTH)
            self.assertEqual(bad.status_code, 409)
            ok = self.client.patch("/api/admin/orders/50/status", json={"status": "Shipped"}, headers=AUTH)
            self.assertEqual(ok.get_json()["order"]["status"], "Shipped")
            done = self.client.patch("/api/admin/orders/50/status", json={"status": "Delivered"}, headers=AUTH).get_json()["order"]
            self.assertEqual(done["payment_status"], "COD_COLLECTED")
            unknown = self.client.patch("/api/admin/orders/50/status", json={"status": "Teleported"}, headers=AUTH)
            self.assertEqual(unknown.status_code, 400)

    def test_cancel_restocks_inventory(self):
        with self.as_admin():
            self.client.patch("/api/admin/orders/50/status", json={"status": "Cancelled"}, headers=AUTH)
        self.assertEqual(self.fake.tables["inventory_items"][0]["current_stock"], 7)
        tx = self.fake.tables["inventory_transactions"][0]
        self.assertEqual((tx["type"], tx["previous_stock"], tx["new_stock"]), ("ORDER_CANCEL_RESTOCK", 5, 7))

    def test_inventory_manager_cannot_read_orders(self):
        with self.as_admin(INVENTORY_MANAGER):
            self.assertEqual(self.client.get("/api/admin/orders", headers=AUTH).status_code, 403)


class AdminTokenValidationTests(unittest.TestCase):
    """Regression tests for the admin auth bypass fixed in this change."""

    def test_rejected_token_is_not_decoded_without_verification(self):
        from services import admin_service
        fake = FakeSupabase({"admin_users": []})
        fake.auth = type("A", (), {"get_user": staticmethod(lambda t: (_ for _ in ()).throw(Exception("bad jwt")))})()
        with patch.object(admin_service, "get_supabase", return_value=fake):
            self.assertEqual(admin_service.validate_admin_token("Bearer forged.token.x"), (None, None))

    def test_valid_supabase_user_without_admin_record_is_rejected(self):
        from services import admin_service
        user = type("U", (), {"id": "uuid-traveler", "email": "asha@trusttrip.app"})()
        fake = FakeSupabase({"admin_users": []})
        fake.auth = type("A", (), {"get_user": staticmethod(lambda t: type("R", (), {"user": user})())})()
        # PostgREST or_ filter is not part of the fake; emulate "no admin row"
        with patch.object(admin_service, "get_supabase", return_value=fake), \
             patch.object(type(fake.table("admin_users")), "or_", lambda self, *_: self._add(lambda r: False), create=True):
            self.assertEqual(admin_service.validate_admin_token("Bearer real-traveler-jwt"), (None, None))


if __name__ == "__main__":
    unittest.main()
