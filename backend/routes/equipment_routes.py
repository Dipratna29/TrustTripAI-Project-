# equipment_routes.py
import logging
from flask import Blueprint, request, jsonify, g
from services.equipment_service import (
    fetch_prices,
    create_order,
    fetch_user_orders,
    fetch_all_equipment,
    fetch_equipment_by_id
)
from services.notification_service import send_notification_to_user
from services.auth_tokens import require_user, owns_user_id, forbidden_response

logger = logging.getLogger(__name__)

equipment_bp = Blueprint("equipment", __name__)


@equipment_bp.route("/prices", methods=["GET"])
def get_prices():
    """Fetch government-approved fair price benchmarks."""
    prices = fetch_prices()
    return jsonify(prices)


@equipment_bp.route("/place-order", methods=["POST"])
@equipment_bp.route("/orders/cod", methods=["POST"])
@require_user
def place_order():
    """Place a Cash-on-Delivery equipment order (price and stock verified server-side)."""
    data = request.get_json(silent=True) or {}

    if not data:
        return jsonify({"success": False, "error": "No data received", "message": "No data received"}), 400

    # The order always belongs to the signed-in user
    if "user_id" in data and not owns_user_id(data["user_id"]):
        return forbidden_response()
    data["user_id"] = g.user_id

    if "equipment_id" not in data:
        return jsonify({"success": False, "error": "equipment_id missing", "message": "Equipment identification required"}), 400

    try:
        order_info = create_order(data, payment_method="COD")
        order_id = order_info["order_id"]
        user_id = data.get("user_id")

        # Trigger notification to user
        if user_id:
            try:
                notification_data = {
                    "type": "equipment_order",
                    "order_id": order_id,
                    "screen": "Equipment"
                }
                send_notification_to_user(
                    user_id=user_id,
                    notification_type="equipment_order",
                    notification_data=notification_data
                )
            except Exception as notif_err:
                logger.warning("Notification send notice: %s", notif_err)

        return jsonify({
            "success": True,
            "message": "Order placed successfully. Pay in cash when your safety gear is delivered.",
            "order_id": order_id,
            "data": order_info
        }), 200

    except ValueError as ve:
        logger.warning("Order validation failed: %s", ve)
        return jsonify({
            "success": False,
            "error": str(ve),
            "message": str(ve)
        }), 400

    except Exception as e:
        logger.error("Order placement database error: %s", e)
        return jsonify({
            "success": False,
            "error": "Database error",
            "message": "Unable to process order. Please try again."
        }), 500


@equipment_bp.route("/user-orders/<int:user_id>", methods=["GET"])
@require_user
def get_user_orders(user_id):
    """Retrieve order history for a specific user."""
    if not owns_user_id(user_id):
        return forbidden_response()
    try:
        orders = fetch_user_orders(user_id)
        return jsonify(orders)
    except Exception as e:
        logger.error("Error fetching user orders: %s", e)
        return jsonify([]), 500


@equipment_bp.route("/equipment", methods=["GET"])
def get_all_equipment():
    """Retrieve all active safety equipment items."""
    search = request.args.get("search")
    category = request.args.get("category")
    try:
        data = fetch_all_equipment(search=search, category=category)
        return jsonify(data)
    except Exception as e:
        logger.error("Error listing equipment: %s", e)
        return jsonify([]), 500


@equipment_bp.route("/equipment/<int:id>", methods=["GET"])
def get_equipment_by_id(id):
    """Retrieve details for a single equipment item."""
    try:
        item = fetch_equipment_by_id(id)
        if item:
            return jsonify(item)
        return jsonify({
            "success": False,
            "error": "Not found",
            "message": "Safety equipment item not found"
        }), 404
    except Exception as e:
        logger.error("Error fetching equipment #%s: %s", id, e)
        return jsonify({
            "success": False,
            "error": "Server error",
            "message": "Failed to load equipment details"
        }), 500