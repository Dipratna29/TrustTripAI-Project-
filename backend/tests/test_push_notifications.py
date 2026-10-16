"""Expo push dispatch, receipts and device-token registration (Expo API mocked; no real pushes)."""

import os
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from services import notification_service as ns
from services.auth_tokens import issue_token
from tests.fake_supabase import FakeSupabase

TOKEN = "ExponentPushToken[abc123XYZ]"


def _resp(status, body):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = body
    return r


class ExpoDispatchTests(unittest.TestCase):
    def setUp(self):
        self.alert = patch.object(ns, "_alert_push_failure")
        self.alert_mock = self.alert.start()

    def tearDown(self):
        self.alert.stop()

    def test_token_validation(self):
        self.assertTrue(ns.is_valid_expo_token(TOKEN))
        self.assertTrue(ns.is_valid_expo_token("ExpoPushToken[x-y_z]"))
        for bad in ("", "abc", "ExponentPushToken[]", "fcm:token", None):
            self.assertFalse(ns.is_valid_expo_token(bad))

    def test_ok_ticket_is_success(self):
        with patch.object(ns.requests, "post", return_value=_resp(200, {"data": {"status": "ok", "id": "tkt-1"}})) as post:
            ok, info = ns._send_to_expo_api(TOKEN, "t", "b", {"screen": "SOS"})
        self.assertTrue(ok)
        self.assertEqual(info["ticket_id"], "tkt-1")
        self.assertEqual(post.call_args.kwargs["json"]["channelId"], "default")

    def test_error_ticket_with_http_200_is_failure(self):
        body = {"data": {"status": "error", "message": "not registered", "details": {"error": "DeviceNotRegistered"}}}
        with patch.object(ns.requests, "post", return_value=_resp(200, body)):
            ok, info = ns._send_to_expo_api(TOKEN, "t", "b")
        self.assertFalse(ok)
        self.assertEqual(info["error"], "DeviceNotRegistered")
        self.assertTrue(info["permanent"])

    def test_retry_on_server_error_then_success(self):
        responses = [_resp(503, {}), _resp(200, {"data": {"status": "ok", "id": "t2"}})]
        with patch.object(ns.requests, "post", side_effect=responses) as post:
            ok, _ = ns._send_to_expo_api(TOKEN, "t", "b")
        self.assertTrue(ok)
        self.assertEqual(post.call_count, 2)

    def test_network_failure_after_retry(self):
        with patch.object(ns.requests, "post", side_effect=requests.ConnectionError()) as post:
            ok, info = ns._send_to_expo_api(TOKEN, "t", "b")
        self.assertEqual((ok, info["error"], post.call_count), (False, "NetworkError", 2))

    def test_invalid_token_never_sent(self):
        with patch.object(ns.requests, "post") as post:
            ok, info = ns._send_to_expo_api("bad-token", "t", "b")
        self.assertFalse(ok)
        post.assert_not_called()

    def test_access_token_header_only_when_configured(self):
        with patch.object(ns.Config, "EXPO_ACCESS_TOKEN", ""):
            self.assertNotIn("Authorization", ns._expo_headers())
        with patch.object(ns.Config, "EXPO_ACCESS_TOKEN", "expo-secret"):
            self.assertEqual(ns._expo_headers()["Authorization"], "Bearer expo-secret")

    def test_send_to_user_deactivates_dead_token_and_alerts(self):
        db = FakeSupabase({"user_devices": [{"device_id": 3, "user_id": 9, "push_token": TOKEN, "is_active": True}],
                           "notifications": []})
        body = {"data": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}
        with patch.object(ns, "get_supabase", return_value=db), \
             patch.object(ns.requests, "post", return_value=_resp(200, body)):
            ok, info = ns.send_notification_to_user(9, "custom", {"title": "Hi", "body": "There"})
        self.assertTrue(info["database_saved"])
        self.assertFalse(info["push_sent"])
        self.assertFalse(db.tables["user_devices"][0]["is_active"])
        self.alert_mock.assert_called_with("DeviceNotRegistered")

    def test_receipts_mark_delivery_and_deactivate(self):
        now = datetime.now(timezone.utc).isoformat()
        db = FakeSupabase({
            "notifications": [
                {"notification_id": 1, "device_id": 3, "expo_ticket_id": "a", "expo_response_status": "PUSH_SENT", "created_at": now},
                {"notification_id": 2, "device_id": 4, "expo_ticket_id": "b", "expo_response_status": "PUSH_SENT", "created_at": now},
                {"notification_id": 3, "device_id": 4, "expo_ticket_id": "c", "expo_response_status": "PUSH_SENT", "created_at": now},
            ],
            "user_devices": [{"device_id": 3, "is_active": True}, {"device_id": 4, "is_active": True}],
        })
        receipts = {"data": {"a": {"status": "ok"}, "b": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}}
        with patch.object(ns, "get_supabase", return_value=db), \
             patch.object(ns.requests, "post", return_value=_resp(200, receipts)):
            summary = ns.check_push_receipts()
        self.assertEqual(summary, {"checked": 2, "delivered": 1, "failed": 1, "deactivated": 1})
        statuses = {n["notification_id"]: n["expo_response_status"] for n in db.tables["notifications"]}
        self.assertEqual(statuses, {1: "DELIVERED_TO_PROVIDER", 2: "FAILED_DeviceNotRegistered", 3: "PUSH_SENT"})
        self.assertEqual([d["is_active"] for d in db.tables["user_devices"]], [True, False])


class DeviceRegistrationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.headers = {"Authorization": f"Bearer {issue_token(9, 'asha')}"}

    def test_register_requires_session_and_ownership(self):
        self.assertEqual(self.client.post("/device", json={"user_id": 9, "push_token": TOKEN}).status_code, 401)
        self.assertEqual(self.client.post("/device", json={"user_id": 10, "push_token": TOKEN}, headers=self.headers).status_code, 403)

    def test_invalid_token_rejected_and_valid_token_stored_once(self):
        db = FakeSupabase({"user_devices": []})
        with patch.object(ns, "get_supabase", return_value=db):
            ok, msg, _ = ns.register_device(9, "not-a-token")
            self.assertFalse(ok)
            ns.register_device(9, TOKEN)
            ns.register_device(9, TOKEN)  # refresh/re-register is idempotent
        self.assertEqual(len([d for d in db.tables["user_devices"] if d["push_token"] == TOKEN]), 1)

    def test_token_moves_to_new_owner(self):
        db = FakeSupabase({"user_devices": [{"device_id": 1, "user_id": 5, "push_token": TOKEN, "is_active": True}]})
        with patch.object(ns, "get_supabase", return_value=db):
            ns.register_device(9, TOKEN)
        owners = {(d["user_id"], d["is_active"]) for d in db.tables["user_devices"]}
        self.assertEqual(owners, {(5, False), (9, True)})


if __name__ == "__main__":
    unittest.main()
