"""
Admin notification center + order management API.
All routes require an authenticated admin (Supabase Auth JWT validated by admin_required);
events are additionally filtered by the admin's per-category permissions.
"""

import logging

from flask import Blueprint, jsonify, request

from services.admin_service import admin_required, has_permission, log_audit
from services.admin_event_service import (
    AdminEventError,
    allowed_categories,
    get_order,
    list_events,
    list_orders,
    mark_all_read,
    set_read,
    unread_count,
    update_order_status,
)

logger = logging.getLogger(__name__)

admin_events_bp = Blueprint("admin_events", __name__, url_prefix="/api/admin")


def _categories():
    return allowed_categories(request.admin_user.get("role", "MODERATOR"), has_permission)


def _admin_email():
    return request.admin_user.get("email") or str(request.admin_user.get("id"))


@admin_events_bp.errorhandler(AdminEventError)
def _handle(error):
    return jsonify({"success": False, "message": str(error)}), error.status


def _int_arg(name, default):
    try:
        return int(request.args.get(name, default))
    except (TypeError, ValueError):
        raise AdminEventError(f"{name} must be a number")


@admin_events_bp.route("/events", methods=["GET"])
@admin_required()
def get_events():
    res = list_events(
        _categories(),
        category=request.args.get("category"),
        status=request.args.get("status"),
        severity=request.args.get("severity"),
        since=request.args.get("since"),
        until=request.args.get("until"),
        page=_int_arg("page", 1),
        page_size=_int_arg("page_size", 20),
    )
    return jsonify({"success": True, **res})


@admin_events_bp.route("/events/unread-count", methods=["GET"])
@admin_required()
def get_unread_count():
    return jsonify({"success": True, **unread_count(_categories())})


@admin_events_bp.route("/events/<int:event_id>/read", methods=["PATCH"])
@admin_required()
def patch_event_read(event_id):
    data = request.get_json(silent=True) or {}
    read = data.get("read", True)
    if not isinstance(read, bool):
        raise AdminEventError("read must be true or false")
    event = set_read(event_id, read, _admin_email(), _categories())
    return jsonify({"success": True, "event": event})


@admin_events_bp.route("/events/read-all", methods=["POST"])
@admin_required()
def post_read_all():
    data = request.get_json(silent=True) or {}
    count = mark_all_read(_admin_email(), _categories(), category=data.get("category"))
    return jsonify({"success": True, "updated": count})


@admin_events_bp.route("/orders", methods=["GET"])
@admin_required(permission="payments:read")
def get_orders():
    res = list_orders(
        page=_int_arg("page", 1),
        page_size=_int_arg("page_size", 20),
        status=request.args.get("status"),
        payment_method=request.args.get("payment_method"),
    )
    return jsonify({"success": True, **res})


@admin_events_bp.route("/orders/<int:order_id>", methods=["GET"])
@admin_required(permission="payments:read")
def get_order_detail(order_id):
    return jsonify({"success": True, "order": get_order(order_id)})


@admin_events_bp.route("/orders/<int:order_id>/status", methods=["PATCH"])
@admin_required(permission="inventory:write")
def patch_order_status(order_id):
    data = request.get_json(silent=True) or {}
    status = str(data.get("status") or "").strip()
    order = update_order_status(order_id, status)
    try:
        log_audit(request.admin_user, "ORDER_STATUS_UPDATE", "order", str(order_id),
                  f"Order #{order_id} -> {status}", {"status": status})
    except Exception as exc:
        logger.warning("Audit log failed for order %s: %s", order_id, exc)
    return jsonify({"success": True, "order": order})


@admin_events_bp.route("/push/receipts/check", methods=["POST"])
@admin_required(permission="notifications:write")
def post_check_push_receipts():
    """Pull Expo delivery receipts for recent pushes and deactivate dead device tokens."""
    from services.notification_service import check_push_receipts
    return jsonify({"success": True, **check_push_receipts()})
