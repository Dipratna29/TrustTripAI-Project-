"""
Device Management Routes for Push Notifications
Handles device registration, updates, and deactivation.
"""

from flask import Blueprint, g, request, jsonify
from services.auth_tokens import authenticate_request
from services.notification_service import (
    register_device,
    deactivate_device,
    get_user_devices
)

device_bp = Blueprint("device", __name__)


@device_bp.before_request
def _require_session():
    # Device tokens are bound to the signed-in user so nobody can hijack another user's pushes
    error = authenticate_request()
    if error:
        return error
    data = request.get_json(silent=True)
    if isinstance(data, dict) and "user_id" in data:
        try:
            if int(data["user_id"]) != g.user_id:
                return jsonify({"success": False, "error": "forbidden", "message": "Not allowed"}), 403
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "Invalid user_id"}), 400
    view_user = (request.view_args or {}).get("user_id")
    if view_user is not None and int(view_user) != g.user_id:
        return jsonify({"success": False, "error": "forbidden", "message": "Not allowed"}), 403
    return None


@device_bp.route("/device", methods=["POST"])
def register_push_token():
    """
    Register or update a push notification token for a device.
    
    Expected request body:
    {
        "user_id": <int>,
        "push_token": "<expo_token>",
        "device_type": "android" or "ios",  # optional, defaults to android
        "device_name": "<device_name>"       # optional
    }
    
    Response:
    {
        "success": true/false,
        "message": "<status_message>",
        "device_id": <int> or null
    }
    
    Security Note: In production, validate that the requesting user matches the user_id
    via JWT/session token. Currently this endpoint assumes authenticated user_id.
    """
    data = request.get_json(silent=True) or {}
    
    # Validate required fields
    if "user_id" not in data:
        return jsonify({
            "success": False,
            "message": "Missing required field: user_id"
        }), 400
    
    if "push_token" not in data:
        return jsonify({
            "success": False,
            "message": "Missing required field: push_token"
        }), 400
    
    try:
        user_id = int(data["user_id"])
        push_token = str(data["push_token"]).strip()
        device_type = str(data.get("device_type", "android")).lower()
        device_name = data.get("device_name")
        
        # Validate device_type
        if device_type not in ("android", "ios"):
            device_type = "android"
        
        # Register device
        success, message, device_id = register_device(
            user_id=user_id,
            push_token=push_token,
            device_type=device_type,
            device_name=device_name
        )
        
        return jsonify({
            "success": success,
            "message": message,
            "device_id": device_id
        }), (200 if success else 400)
    
    except ValueError as e:
        return jsonify({
            "success": False,
            "message": f"Invalid data: {str(e)}"
        }), 400
    except Exception as e:
        print(f"Error in register_push_token: {e}")
        return jsonify({
            "success": False,
            "message": "Server error"
        }), 500


@device_bp.route("/devices/<int:user_id>", methods=["GET"])
def get_devices(user_id):
    """
    Get all registered devices for a user.
    
    URL: GET /devices/<user_id>
    
    Response:
    {
        "success": true,
        "devices": [
            {
                "device_id": <int>,
                "push_token": "<token>",
                "device_type": "android/ios",
                "device_name": "<name>",
                "is_active": 1/0,
                "created_at": "<datetime>",
                "updated_at": "<datetime>",
                "last_used_at": "<datetime or null>"
            },
            ...
        ]
    }
    
    Security Note: In production, verify that requesting user_id matches parameter user_id.
    """
    try:
        devices = get_user_devices(user_id)
        
        return jsonify({
            "success": True,
            "devices": devices
        }), 200
    
    except Exception as e:
        print(f"Error in get_devices: {e}")
        return jsonify({
            "success": False,
            "message": "Server error"
        }), 500


@device_bp.route("/device/<int:device_id>", methods=["DELETE"])
def delete_device(device_id):
    """
    Deactivate a push notification device.
    
    Expected request body:
    {
        "user_id": <int>
    }
    
    Response:
    {
        "success": true/false,
        "message": "<status_message>"
    }
    
    Security Note: Validates that user_id owns the device before deactivating.
    """
    data = request.get_json(silent=True) or {}
    
    if "user_id" not in data:
        return jsonify({
            "success": False,
            "message": "Missing required field: user_id"
        }), 400
    
    try:
        user_id = int(data["user_id"])
        
        success, message = deactivate_device(device_id, user_id)
        
        return jsonify({
            "success": success,
            "message": message
        }), (200 if success else 400)
    
    except ValueError as e:
        return jsonify({
            "success": False,
            "message": f"Invalid data: {str(e)}"
        }), 400
    except Exception as e:
        print(f"Error in delete_device: {e}")
        return jsonify({
            "success": False,
            "message": "Server error"
        }), 500
