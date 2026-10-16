"""
TrustTrip Mobile Notification Routes
Provides endpoints for retrieving user in-app notifications,
counting unread notifications, and updating read statuses.
"""

import logging
from flask import Blueprint, g, request, jsonify
from services.notification_service import (
    get_user_notifications,
    get_unread_notification_count,
    mark_notification_as_read,
    mark_all_notifications_as_read,
    delete_notification
)

logger = logging.getLogger(__name__)

from services.auth_tokens import authenticate_request

notification_bp = Blueprint("notifications", __name__)


@notification_bp.before_request
def _require_session():
    # Every notification endpoint is per-user: identity comes from the session token,
    # never from a client-supplied user_id (which allowed reading others' notifications).
    return authenticate_request()


def _extract_user_id():
    """The signed-in user's id (set by the session token)."""
    return g.user_id


@notification_bp.route("/notifications", methods=["GET"])
@notification_bp.route("/api/notifications", methods=["GET"])
def list_user_notifications():
    """
    Get paginated notifications for the requesting user.
    Query parameters:
      - user_id (required)
      - category (optional: all, unread, emergency, safety, system, offers)
      - page (default: 1)
      - page_size (default: 20)
    """
    user_id = _extract_user_id()
    if not user_id:
        return jsonify({"success": False, "message": "user_id is required"}), 400

    category = request.args.get("category", "all")
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))

    result = get_user_notifications(user_id=user_id, category=category, page=page, page_size=page_size)
    return jsonify(result), (200 if result.get("success") else 500)


@notification_bp.route("/notifications/unread-count", methods=["GET"])
@notification_bp.route("/api/notifications/unread-count", methods=["GET"])
def get_unread_count():
    """
    Get unread notification count for a user (powers mobile notification bell badge).
    Query parameter:
      - user_id (required)
    """
    user_id = _extract_user_id()
    if not user_id:
        return jsonify({"success": False, "message": "user_id is required", "unread_count": 0}), 400

    count = get_unread_notification_count(user_id)
    return jsonify({"success": True, "user_id": user_id, "unread_count": count}), 200


@notification_bp.route("/notifications/<int:notification_id>/read", methods=["PATCH", "POST", "PUT"])
@notification_bp.route("/api/notifications/<int:notification_id>/read", methods=["PATCH", "POST", "PUT"])
def mark_read(notification_id: int):
    """
    Mark a specific notification as read.
    """
    user_id = _extract_user_id()
    success = mark_notification_as_read(notification_id=notification_id, user_id=user_id)
    if success:
        return jsonify({"success": True, "message": "Notification marked as read"}), 200
    return jsonify({"success": False, "message": "Notification not found or already read"}), 404


@notification_bp.route("/notifications/read-all", methods=["PATCH", "POST", "PUT"])
@notification_bp.route("/api/notifications/read-all", methods=["PATCH", "POST", "PUT"])
@notification_bp.route("/notifications/mark-all-read", methods=["PATCH", "POST", "PUT"])
@notification_bp.route("/api/notifications/mark-all-read", methods=["PATCH", "POST", "PUT"])
def mark_all_read():
    """
    Mark all notifications for the given user as read.
    """
    user_id = _extract_user_id()
    if not user_id:
        return jsonify({"success": False, "message": "user_id is required"}), 400

    updated_count = mark_all_notifications_as_read(user_id)
    return jsonify({
        "success": True,
        "message": f"All notifications marked as read ({updated_count} updated)",
        "updated_count": updated_count
    }), 200


@notification_bp.route("/notifications/<int:notification_id>", methods=["DELETE"])
@notification_bp.route("/api/notifications/<int:notification_id>", methods=["DELETE"])
def delete_single_notification(notification_id: int):
    """
    Delete a specific notification for the user.
    """
    user_id = _extract_user_id()
    success = delete_notification(notification_id=notification_id, user_id=user_id)
    if success:
        return jsonify({"success": True, "message": "Notification deleted successfully"}), 200
    return jsonify({"success": False, "message": "Notification not found or access denied"}), 404
