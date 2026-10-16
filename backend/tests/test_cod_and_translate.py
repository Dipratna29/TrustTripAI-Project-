"""
Tests for Cash-on-Delivery ordering and the translation API contract.
"""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from services.auth_tokens import issue_token


class TestCashOnDelivery(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.headers = {"Authorization": f"Bearer {issue_token(7, 'traveler')}"}

    def test_cod_requires_session(self):
        res = self.client.post("/orders/cod", json={"equipment_id": 1})
        self.assertEqual(res.status_code, 401)

    @patch("routes.equipment_routes.send_notification_to_user")
    @patch("routes.equipment_routes.create_order")
    def test_cod_order_bound_to_token_user(self, mock_create, _mock_notify):
        mock_create.return_value = {"order_id": 55, "total_price": 400.0, "payment_method": "COD"}
        res = self.client.post(
            "/orders/cod",
            json={"equipment_id": 3, "quantity": 2, "latitude": 19.07, "longitude": 72.87, "total_price": 1},
            headers=self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["order_id"], 55)
        sent, kwargs = mock_create.call_args
        self.assertEqual(sent[0]["user_id"], 7)
        self.assertEqual(kwargs["payment_method"], "COD")

    def test_cod_rejects_other_user_id(self):
        res = self.client.post("/orders/cod", json={"user_id": 8, "equipment_id": 3}, headers=self.headers)
        self.assertEqual(res.status_code, 403)

    @patch("routes.equipment_routes.create_order", side_effect=ValueError("Insufficient stock"))
    def test_cod_validation_error_is_400(self, _mock_create):
        res = self.client.post("/orders/cod", json={"equipment_id": 3}, headers=self.headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Insufficient stock", res.get_json()["message"])


class TestTranslateRoute(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    @patch("routes.translate.translate_text", return_value="नमस्ते")
    def test_accepts_mobile_keys_and_returns_both_fields(self, mock_translate):
        res = self.client.post("/translate", json={"text": "Hello", "source_language": "en", "target_language": "hi"})
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["translated_text"], "नमस्ते")
        self.assertEqual(body["translation"], "नमस्ते")
        mock_translate.assert_called_with("Hello", "en", "hi")

    @patch("routes.translate.translate_text", return_value="Bonjour")
    def test_accepts_legacy_keys(self, mock_translate):
        res = self.client.post("/translate", json={"text": "Hello", "source": "en", "target": "fr"})
        self.assertEqual(res.status_code, 200)
        mock_translate.assert_called_with("Hello", "en", "fr")

    def test_missing_target_is_400(self):
        res = self.client.post("/translate", json={"text": "Hello"})
        self.assertEqual(res.status_code, 400)

    @patch("routes.translate.translate_text", side_effect=RuntimeError("all providers down"))
    def test_provider_failure_is_502_not_echo(self, _mock_translate):
        res = self.client.post("/translate", json={"text": "Hello", "target_language": "hi"})
        self.assertEqual(res.status_code, 502)
        self.assertFalse(res.get_json()["success"])


if __name__ == "__main__":
    unittest.main()
