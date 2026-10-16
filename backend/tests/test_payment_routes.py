"""
test_payment_routes.py
Tests for payment API route endpoints and admin payment monitoring.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from services.auth_tokens import issue_token


class _AuthedClient:
    """Test client that sends a session token for user #1 on every request."""

    def __init__(self, client, token):
        self._client = client
        self._headers = {"Authorization": f"Bearer {token}"}

    def get(self, *args, **kwargs):
        return self._client.get(*args, headers=self._headers, **kwargs)

    def post(self, *args, **kwargs):
        return self._client.post(*args, headers=self._headers, **kwargs)


class TestPaymentRoutes(unittest.TestCase):
    def setUp(self):
        self.anon_client = app.test_client()
        self.client = _AuthedClient(app.test_client(), issue_token(1, "tester"))

    @patch("routes.payment_routes.create_payment_order")
    def test_01_create_order_dual_routes(self, mock_create):
        """Verify both route conventions: /payments/razorpay/order and /api/payments/create-order."""
        mock_create.return_value = {
            "key_id": "rzp_test_key",
            "order_id": "order_123",
            "amount": 50000,
            "currency": "INR",
            "equipment_name": "First Aid Kit"
        }

        # 1. First path convention
        res1 = self.client.post("/payments/razorpay/order", json={"user_id": 1, "equipment_id": 1, "quantity": 1})
        self.assertEqual(res1.status_code, 201)
        self.assertEqual(res1.get_json()["order_id"], "order_123")

        # 2. Second path convention
        res2 = self.client.post("/api/payments/create-order", json={"user_id": 1, "equipment_id": 1, "quantity": 1})
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(res2.get_json()["order_id"], "order_123")

    @patch("routes.payment_routes.verify_payment")
    def test_02_verify_order_dual_routes(self, mock_verify):
        """Verify both route conventions for payment verification."""
        mock_verify.return_value = {
            "success": True,
            "message": "Payment verified successfully",
            "payment_id": "pay_123",
            "order_id": "order_123",
            "status": "PAID"
        }

        payload = {
            "user_id": 1,
            "razorpay_order_id": "order_123",
            "razorpay_payment_id": "pay_123",
            "razorpay_signature": "sig_123"
        }

        res1 = self.client.post("/payments/razorpay/verify", json=payload)
        self.assertEqual(res1.status_code, 200)
        self.assertTrue(res1.get_json()["success"])

        res2 = self.client.post("/api/payments/verify", json=payload)
        self.assertEqual(res2.status_code, 200)
        self.assertTrue(res2.get_json()["success"])

    @patch("routes.payment_routes.mark_payment_failed")
    def test_03_failure_dual_routes(self, mock_failed):
        """Verify failure recording endpoints."""
        mock_failed.return_value = {"success": True, "message": "Payment recorded as failed"}

        res = self.client.post("/payments/razorpay/failure", json={"user_id": 1, "razorpay_order_id": "order_123"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["success"])

    @patch("routes.payment_routes.get_payment_status")
    def test_04_status_endpoint(self, mock_status):
        """Verify payment status query."""
        mock_status.return_value = {
            "success": True,
            "order_id": "order_123",
            "status": "PAID",
            "amount": 50000
        }

        res = self.client.get("/payments/status/order_123?user_id=1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["status"], "PAID")

    @patch("routes.payment_routes.get_user_payments")
    def test_05_user_payments_history(self, mock_history):
        """Verify user payments history endpoint."""
        mock_history.return_value = [
            {"id": 1, "razorpay_order_id": "order_1", "status": "PAID", "amount_paise": 50000}
        ]

        res = self.client.get("/payments/my-orders/1")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(len(data["payments"]), 1)

    def test_06_requires_session_and_ownership(self):
        """Payment endpoints reject anonymous callers and other users' ids."""
        res = self.anon_client.get("/payments/my-orders/1")
        self.assertEqual(res.status_code, 401)

        res = self.client.get("/payments/my-orders/2")
        self.assertEqual(res.status_code, 403)

        res = self.client.post("/payments/razorpay/order", json={"user_id": 2, "equipment_id": 1})
        self.assertEqual(res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
