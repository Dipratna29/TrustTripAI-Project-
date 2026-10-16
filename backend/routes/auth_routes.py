import logging

from flask import Blueprint, request, jsonify
from services.auth_service import register_user, login_user
from services.auth_tokens import issue_token
from services.password_reset_service import PasswordResetError, confirm_reset, request_reset

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    try:
        result = register_user(data)
        return jsonify({
            "success": True,
            "message": "Registration successful",
            "user": result,
            "token": issue_token(result.get("user_id"), result.get("username")) if result.get("user_id") else None,
            "sms_sent": result.get("sms_sent", False),
            "sms_status": result.get("sms_status")
        }), 201
    except ValueError as val_err:
        return jsonify({"success": False, "message": str(val_err)}), 400
    except Exception:
        logging.getLogger(__name__).exception("Registration failed")
        return jsonify({"success": False, "message": "Registration failed. Please try again later."}), 500


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    user, error_msg = login_user(data)

    if user:
        return jsonify({
            "success": True,
            "message": "Login successful",
            "token": issue_token(user.get("user_id"), user.get("username")),
            "user": {
                "id": user.get("user_id"),
                "username": user.get("username"),
                "name": user.get("name"),
                "mob": user.get("mob"),
                "full_phone_number": user.get("full_phone_number"),
                "country": user.get("country") or user.get("nationality"),
                "country_code": user.get("country_code"),
                "status": user.get("status", "ACTIVE"),
                "profile_photo_url": user.get("profile_photo_url"),
            }
        }), 200

    status_code = 403 if error_msg and ("suspended" in error_msg.lower() or "inactive" in error_msg.lower()) else 401
    return jsonify({
        "success": False,
        "message": error_msg or "Invalid username or password"
    }), status_code


def _client_ip():
    # ProxyFix (TRUST_PROXY=true) already rewrites remote_addr from the trusted proxy header
    return request.remote_addr or ""


@auth_bp.route("/auth/password-reset/request", methods=["POST"])
def password_reset_request():
    data = request.get_json(silent=True) or {}
    try:
        message = request_reset(str(data.get("identifier") or ""), _client_ip())
        return jsonify({"success": True, "message": message}), 200
    except PasswordResetError as err:
        return jsonify({"success": False, "message": str(err)}), err.status
    except Exception:
        logging.getLogger(__name__).exception("Password reset request failed")
        return jsonify({"success": False, "message": "Could not process the request. Please try again later."}), 500


@auth_bp.route("/auth/password-reset/confirm", methods=["POST"])
def password_reset_confirm():
    data = request.get_json(silent=True) or {}
    try:
        confirm_reset(
            str(data.get("identifier") or ""),
            str(data.get("code") or ""),
            data.get("new_password") or "",
            _client_ip(),
        )
        return jsonify({"success": True, "message": "Your password has been changed. Sign in with your new password."}), 200
    except PasswordResetError as err:
        return jsonify({"success": False, "message": str(err)}), err.status
    except Exception:
        logging.getLogger(__name__).exception("Password reset confirm failed")
        return jsonify({"success": False, "message": "Could not reset the password. Please try again later."}), 500
