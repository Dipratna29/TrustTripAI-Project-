import logging
from flask import Blueprint, g, jsonify, request

from config import Config
from services.auth_tokens import require_user, owns_user_id, forbidden_response
from services.payment_service import (
    PaymentError,
    create_payment_order,
    verify_payment,
    mark_payment_failed,
    verify_webhook_signature,
    process_webhook,
    get_payment_status,
    get_user_payments,
)

logger = logging.getLogger(__name__)

payment_bp = Blueprint("payments", __name__)


def _json():
    return request.get_json(silent=True) or {}


def _owned_json():
    """Request body bound to the signed-in user; returns (data, error_response)."""
    data = _json()
    if "user_id" in data and not owns_user_id(data["user_id"]):
        return None, forbidden_response()
    data["user_id"] = g.user_id
    return data, None


@payment_bp.errorhandler(PaymentError)
def handle_payment_error(error):
    logger.warning("Payment error [%d]: %s", error.status, str(error))
    return jsonify({"success": False, "error": str(error), "message": str(error)}), error.status


def _require_https():
    if Config.REQUIRE_HTTPS_PAYMENTS and not request.is_secure and not Config.TRUST_PROXY:
        return jsonify({"success": False, "error": "Secure connection required"}), 400
    return None


# 1. CREATE PAYMENT ORDER (supports both /payments/razorpay/order and /api/payments/create-order)
@payment_bp.route("/payments/razorpay/order", methods=["POST"])
@payment_bp.route("/api/payments/create-order", methods=["POST"])
@require_user
def create_order():
    secure_error = _require_https()
    if secure_error:
        return secure_error
    try:
        data, err = _owned_json()
        if err:
            return err
        result = create_payment_order(data)
        return jsonify(result), 201
    except PaymentError as error:
        return handle_payment_error(error)
    except Exception as exc:
        logger.error("Unexpected error in create_order: %s", exc)
        return jsonify({"success": False, "error": "Internal server error creating payment order"}), 500


# 2. VERIFY PAYMENT (supports both /payments/razorpay/verify and /api/payments/verify)
@payment_bp.route("/payments/razorpay/verify", methods=["POST"])
@payment_bp.route("/api/payments/verify", methods=["POST"])
@require_user
def verify_order():
    secure_error = _require_https()
    if secure_error:
        return secure_error
    try:
        data, err = _owned_json()
        if err:
            return err
        result = verify_payment(data)
        return jsonify(result), 200
    except PaymentError as error:
        return handle_payment_error(error)
    except Exception as exc:
        logger.error("Unexpected error in verify_order: %s", exc)
        return jsonify({"success": False, "error": "Internal server error verifying payment"}), 500


# 3. PAYMENT FAILURE REPORTING
@payment_bp.route("/payments/razorpay/failure", methods=["POST"])
@payment_bp.route("/api/payments/failure", methods=["POST"])
@require_user
def failure():
    try:
        data, err = _owned_json()
        if err:
            return err
        result = mark_payment_failed(data)
        return jsonify(result), 200
    except PaymentError as error:
        return handle_payment_error(error)
    except Exception as exc:
        logger.error("Unexpected error in failure callback: %s", exc)
        return jsonify({"success": False, "error": "Internal server error recording failure"}), 500


# 4. WEBHOOK HANDLER
@payment_bp.route("/payments/razorpay/webhook", methods=["POST"])
@payment_bp.route("/api/payments/razorpay/webhook", methods=["POST"])
def webhook():
    raw_body = request.get_data()
    signature = request.headers.get("X-Razorpay-Signature", "")
    try:
        verify_webhook_signature(raw_body, signature)
        payload = request.get_json(silent=True) or {}
        result = process_webhook(payload)
        return jsonify(result), 200
    except PaymentError as error:
        return handle_payment_error(error)
    except Exception as exc:
        logger.error("Unexpected error processing webhook: %s", exc)
        return jsonify({"success": False, "error": "Webhook processing error"}), 500


# 5. STATUS INQUIRY (for network interruption or pending states)
@payment_bp.route("/payments/status/<order_id>", methods=["GET"])
@payment_bp.route("/api/payments/status/<order_id>", methods=["GET"])
@require_user
def check_status(order_id):
    try:
        result = get_payment_status(order_id, user_id=g.user_id)
        return jsonify(result), 200
    except PaymentError as error:
        return handle_payment_error(error)
    except Exception as exc:
        logger.error("Error retrieving payment status: %s", exc)
        return jsonify({"success": False, "error": "Failed to fetch payment status"}), 500


# 6. USER PAYMENT HISTORY
@payment_bp.route("/payments/my-orders/<int:user_id>", methods=["GET"])
@payment_bp.route("/api/payments/my-orders/<int:user_id>", methods=["GET"])
@require_user
def user_payments(user_id):
    if not owns_user_id(user_id):
        return forbidden_response()
    try:
        payments = get_user_payments(user_id)
        return jsonify({"success": True, "payments": payments}), 200
    except Exception as exc:
        logger.error("Error retrieving user payments for user #%s: %s", user_id, exc)
        return jsonify({"success": False, "payments": [], "error": "Failed to load payment history"}), 500
