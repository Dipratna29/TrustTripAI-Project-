from flask import Blueprint, g, request, jsonify
from services.auth_tokens import require_user
from services.guide_service import (
    fetch_guides,
    submit_guide_rating,
    create_guide_booking,
    cancel_guide_booking,
    get_user_id_by_username
)
from services.notification_service import send_notification_to_user

guide_bp = Blueprint("guide", __name__)


@guide_bp.route("/guides", methods=["GET"])
def get_guides():
    """
    Returns all guides. Pass ?username=<username> to include
    the booked_by_user flag and accurate average rating per guide.
    """
    username = request.args.get("username")
    guides = fetch_guides(username=username)
    return jsonify(guides)


@guide_bp.route("/rate-guide", methods=["POST"])
@require_user
def rate_guide():
    data = request.get_json(silent=True) or {}
    data["username"] = g.username  # ratings are always attributed to the signed-in user
    if "guide_id" not in data or "rating" not in data:
        return jsonify({"error": "Missing required fields: guide_id, rating"}), 400
    try:
        rating = float(data["rating"])
    except (TypeError, ValueError):
        return jsonify({"error": "Rating must be a number"}), 400
    if not 1 <= rating <= 5:
        return jsonify({"error": "Rating must be between 1 and 5"}), 400
    data["rating"] = rating

    submit_guide_rating(data)
    return jsonify({"message": "Rating submitted"})


@guide_bp.route("/select-guide", methods=["POST"])
@require_user
def select_guide():
    data = request.get_json(silent=True) or {}
    data["username"] = g.username
    if "guide_id" not in data:
        return jsonify({"error": "Missing guide_id"}), 400

    try:
        # Create booking and get ID
        booking_id = create_guide_booking(data)
        
        # Skip notification if already booked
        if booking_id is None:
            return jsonify({"success": True, "message": "Guide already booked"})
        
        # Get username from request
        username = data.get("username")
        guide_id = data.get("guide_id")
        
        # Trigger notification to user
        if username:
            user_id = get_user_id_by_username(username)
            if user_id:
                notification_data = {
                    "type": "guide_request",
                    "guide_id": guide_id,
                    "screen": "Guide"
                }
                send_notification_to_user(
                    user_id=user_id,
                    notification_type="guide_requested",
                    notification_data=notification_data
                )
        
        return jsonify({"success": True, "message": "Guide booked successfully"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        print("Booking Error:", e)
        return jsonify({"error": "Database error"}), 500


@guide_bp.route("/cancel-booking", methods=["POST"])
@require_user
def cancel_booking():
    """
    Cancel a user's active booking for a guide.
    Body: { "username": "...", "guide_id": 123 }
    """
    data = request.get_json(silent=True) or {}
    data["username"] = g.username
    if "guide_id" not in data:
        return jsonify({"error": "Missing guide_id"}), 400

    try:
        cancel_guide_booking(data)

        # Trigger notification to user
        username = data.get("username")
        guide_id = data.get("guide_id")
        if username:
            user_id = get_user_id_by_username(username)
            if user_id:
                send_notification_to_user(
                    user_id=user_id,
                    notification_type="guide_cancelled",
                    notification_data={
                        "title": "🧭 Guide Booking Cancelled",
                        "body": f"Your booking for Guide #{guide_id} has been cancelled successfully.",
                        "data": {
                            "type": "guide_request",
                            "guide_id": guide_id,
                            "screen": "Guide"
                        }
                    }
                )

        return jsonify({"success": True, "message": "Booking cancelled successfully"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        print("Cancel Error:", e)
        return jsonify({"error": "Database error"}), 500
