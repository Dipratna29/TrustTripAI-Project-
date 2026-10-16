"""
SMS provider (Twilio REST, mocked) and the full password-reset flow against an in-memory
database: generic responses, hashed single-use codes, expiry, attempt limits, rate limits,
and that the new password really works for login. No real SMS is sent.
"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import requests
from werkzeug.security import generate_password_hash

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from services import password_reset_service as prs
from services import sms_service
from services.auth_service import login_user
from tests.fake_supabase import FakeSupabase

TWILIO_ENV = {
    "SMS_MODE": "auto", "ENVIRONMENT": "development",
    "TWILIO_ACCOUNT_SID": "ACtest", "TWILIO_AUTH_TOKEN": "secret", "TWILIO_PHONE_NUMBER": "+15005550006",
}


def _resp(status, body):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = body
    return r


class SmsServiceTests(unittest.TestCase):
    def setUp(self):
        self.alert = patch("services.admin_event_service.record_system_event", return_value=True)
        self.alert_mock = self.alert.start()

    def tearDown(self):
        self.alert.stop()

    def test_missing_credentials_is_not_reported_as_sent(self):
        with patch.dict(os.environ, {"SMS_MODE": "auto", "TWILIO_ACCOUNT_SID": "", "TWILIO_AUTH_TOKEN": "", "TWILIO_PHONE_NUMBER": ""}):
            r = sms_service.send_sms("+919876543210", "hi")
            self.assertEqual((r.sent, r.status), (False, "not_configured"))
            self.assertIsNotNone(sms_service.validate_configuration())
        self.alert_mock.assert_called_once()

    def test_valid_configuration_and_success(self):
        with patch.dict(os.environ, TWILIO_ENV), patch.object(sms_service.requests, "post", return_value=_resp(201, {"sid": "SM123"})) as post:
            self.assertIsNone(sms_service.validate_configuration())
            r = sms_service.send_sms("+91 98765-43210", "hello")
        self.assertEqual((r.sent, r.status, r.provider_id), (True, "sent", "SM123"))
        sent = post.call_args.kwargs
        self.assertEqual(sent["data"]["To"], "+919876543210")
        self.assertEqual(sent["auth"], ("ACtest", "secret"))
        self.alert_mock.assert_not_called()

    def test_provider_rejection_timeout_and_network_errors(self):
        with patch.dict(os.environ, TWILIO_ENV):
            with patch.object(sms_service.requests, "post", return_value=_resp(400, {"code": 21608, "message": "unverified"})):
                r = sms_service.send_sms("+919876543210", "x")
                self.assertEqual((r.sent, r.error), (False, "provider_error_21608"))
            with patch.object(sms_service.requests, "post", side_effect=requests.Timeout()):
                self.assertEqual(sms_service.send_sms("+919876543210", "x").error, "timeout")
            with patch.object(sms_service.requests, "post", side_effect=requests.ConnectionError()):
                self.assertEqual(sms_service.send_sms("+919876543210", "x").status, "failed")
        self.assertEqual(self.alert_mock.call_count, 3)

    def test_invalid_numbers_rejected_without_provider_call(self):
        with patch.dict(os.environ, TWILIO_ENV), patch.object(sms_service.requests, "post") as post:
            for bad in ("", "12", "+0123456789", "not-a-number", "+1234567890123456"):
                self.assertEqual(sms_service.send_sms(bad, "x").status, "invalid_number")
            post.assert_not_called()

    def test_simulation_is_explicit_and_blocked_in_production(self):
        with patch.dict(os.environ, {"SMS_MODE": "simulate", "ENVIRONMENT": "development"}), \
             self.assertLogs("services.sms_service", level="INFO") as logs:
            r = sms_service.send_sms("+919876543210", "your code is 123456")
        self.assertEqual((r.sent, r.status), (False, "simulated"))
        self.assertFalse(any("123456" in line for line in logs.output))  # message body never logged
        with patch.dict(os.environ, {"SMS_MODE": "simulate", "ENVIRONMENT": "production"}):
            self.assertEqual(sms_service.send_sms("+919876543210", "x").status, "not_configured")
            self.assertIsNotNone(sms_service.validate_configuration())

    def test_otp_is_random_keyed_and_verified_in_constant_time(self):
        codes = {sms_service.generate_otp() for _ in range(50)}
        self.assertGreater(len(codes), 40)
        h = sms_service.hash_otp("123456", "reset:1")
        self.assertNotIn("123456", h)
        self.assertTrue(sms_service.otp_matches("123456", h, "reset:1"))
        self.assertFalse(sms_service.otp_matches("123456", h, "reset:2"))
        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.assertEqual(sms_service.verify_otp_hash("123456", h, past, "reset:1")[0], False)


class PasswordResetFlowTests(unittest.TestCase):
    def setUp(self):
        prs.REQUEST_LIMITER.reset()
        prs.CONFIRM_LIMITER.reset()
        self.db = FakeSupabase({
            "users": [{"user_id": 1, "username": "asha", "name": "Asha K", "mob": "+919876543210",
                       "full_phone_number": "+919876543210", "status": "ACTIVE",
                       "password": generate_password_hash("OldPass123")}],
            "password_reset_codes": [],
        })
        self.sent_codes = []

        def fake_send(phone, name, purpose, minutes, context):
            code = "482913" if not self.sent_codes else f"{len(self.sent_codes):06d}"
            self.sent_codes.append(code)
            return (sms_service.SmsResult(True, "sent", "SMx"), sms_service.hash_otp(code, context),
                    datetime.now(timezone.utc) + timedelta(minutes=minutes))

        self.patches = [
            patch.object(prs, "get_supabase", return_value=self.db),
            patch.object(prs, "send_otp_sms", side_effect=fake_send),
            patch("services.auth_service.get_supabase", return_value=self.db),
        ]
        for p in self.patches:
            p.start()
        self.client = app.test_client()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def req(self, identifier):
        return self.client.post("/auth/password-reset/request", json={"identifier": identifier})

    def confirm(self, code, password="NewPass456", identifier="asha"):
        return self.client.post("/auth/password-reset/confirm", json={"identifier": identifier, "code": code, "new_password": password})

    def test_generic_response_for_unknown_and_known_accounts(self):
        a, b = self.req("nobody"), self.req("asha")
        self.assertEqual(a.status_code, 200)
        self.assertEqual(a.get_json()["message"], b.get_json()["message"])
        self.assertEqual(len(self.sent_codes), 1)  # only the real account got an SMS

    def test_code_stored_hashed_with_expiry(self):
        self.req("+91 98765 43210")  # lookup by phone works too
        row = self.db.tables["password_reset_codes"][0]
        self.assertNotIn("482913", str(row))
        self.assertIsNone(row["consumed_at"] if "consumed_at" in row else None)

    def test_full_flow_changes_real_credential_and_code_is_single_use(self):
        self.req("asha")
        self.assertEqual(self.confirm("482913").status_code, 200)
        self.assertIsNotNone(login_user({"username": "asha", "password": "NewPass456"})[0])
        self.assertIsNone(login_user({"username": "asha", "password": "OldPass123"})[0])
        self.assertEqual(self.confirm("482913", "Another789").status_code, 400)  # reuse rejected

    def test_wrong_code_attempt_limit(self):
        self.req("asha")
        for _ in range(prs.MAX_ATTEMPTS):
            self.assertEqual(self.confirm("000000").status_code, 400)
        # Correct code no longer accepted after too many attempts
        self.assertEqual(self.confirm("482913").status_code, 400)

    def test_expired_code_rejected(self):
        self.req("asha")
        self.db.tables["password_reset_codes"][0]["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        self.assertEqual(self.confirm("482913").status_code, 400)

    def test_new_code_invalidates_previous(self):
        self.req("asha")
        self.req("asha")
        self.assertEqual(self.confirm("482913").status_code, 400)
        self.assertEqual(self.confirm(self.sent_codes[-1]).status_code, 200)

    def test_password_policy(self):
        self.req("asha")
        for bad in ("short1", "lettersonly", "12345678", "asha12345"):
            res = self.confirm("482913", bad)
            self.assertEqual(res.status_code, 400, bad)
        self.assertEqual(self.confirm("482913", "Valid1234").status_code, 200)

    def test_malformed_code_and_rate_limits(self):
        self.assertEqual(self.confirm("12ab").status_code, 400)
        codes = [self.req("asha").status_code for _ in range(6)]
        self.assertEqual(codes[-1], 429)
        self.assertLessEqual(len(self.sent_codes), prs.MAX_CODES_PER_HOUR)  # DB hourly cap

    def test_sms_failure_stores_no_code(self):
        with patch.object(prs, "send_otp_sms", return_value=(sms_service.SmsResult(False, "not_configured"), "h",
                                                             datetime.now(timezone.utc))):
            self.assertEqual(self.req("asha").status_code, 200)
        self.assertEqual(self.db.tables["password_reset_codes"], [])


if __name__ == "__main__":
    unittest.main()
