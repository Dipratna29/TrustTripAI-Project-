"""
Admin API Routes Blueprint for TrustTrip Admin Control Website.
Provides RESTful endpoints for all administrative operations with RBAC authorization.
"""

import os
import logging
import requests
from flask import Blueprint, request, jsonify
from database.supabase_client import get_supabase
from services.admin_service import (
    admin_required,
    log_audit,
    get_dashboard_stats,
    list_users,
    get_user_detail,
    update_user_status,
    list_inventory,
    add_inventory_item,
    update_inventory_item,
    delete_inventory_item,
    add_stock,
    remove_stock,
    list_inventory_transactions,
    list_complaints,
    update_complaint,
    list_sos_incidents,
    update_sos_status,
    list_notifications,
    send_broadcast_notification,
    list_guides_admin,
    create_guide_admin,
    update_guide_admin,
    delete_guide_admin,
    list_facilities_admin,
    create_facility_admin,
    update_facility_admin,
    delete_facility_admin,
    list_offers_admin,
    create_offer_admin,
    update_offer_admin,
    delete_offer_admin,
    list_pricing_items,
    create_pricing_item,
    update_pricing_item,
    list_payments_admin,
    get_payment_detail_admin,
    reconcile_payment_admin,
    list_admins,
    create_admin_user,
    update_admin_role_or_status,
    list_audit_logs_admin,
    get_admin_settings,
    update_admin_settings,
    get_system_health,
    ROLES
)
from services.payment_service import process_refund, PaymentError

logger = logging.getLogger(__name__)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ============================================================================
# 1. AUTHENTICATION ENDPOINTS
# ============================================================================

@admin_bp.route("/auth/login", methods=["POST"])
def admin_login():
    """
    Authenticates an administrator through Supabase Auth, verifies role & active status,
    and returns the Supabase JWT session with role & permissions.
    """
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({"success": False, "message": "Email and password are required"}), 400

    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    try:
        # Authenticate statelessly with Supabase Auth API
        auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
        auth_headers = {"apikey": supabase_key, "Content-Type": "application/json"}
        auth_res = requests.post(auth_url, json={"email": email, "password": password}, headers=auth_headers, timeout=12)
        
        if auth_res.status_code != 200:
            return jsonify({"success": False, "message": "Invalid email or password"}), 401
        
        auth_data = auth_res.json()
        user_uuid = auth_data.get("user", {}).get("id")
        access_token = auth_data.get("access_token")

        if not user_uuid or not access_token:
            return jsonify({"success": False, "message": "Invalid credentials"}), 401

        supabase = get_supabase()

        # Query admin_users table
        admin_record = None
        try:
            admin_res = supabase.table("admin_users").select("*").or_(
                f"user_id.eq.{user_uuid},email.eq.{email}"
            ).limit(1).execute()
            if admin_res.data:
                admin_record = admin_res.data[0]
        except Exception as err:
            logger.warning("admin_users lookup: %s", err)

        if not admin_record:
            # Check if this is the first admin bootstrapping or table is being set up
            try:
                admin_count_res = supabase.table("admin_users").select("id", count="exact").execute()
                count = admin_count_res.count if admin_count_res.count is not None else len(admin_count_res.data or [])
                if count == 0:
                    # Bootstrap as SUPER_ADMIN
                    try:
                        ins = supabase.table("admin_users").insert({
                            "user_id": user_uuid,
                            "email": email,
                            "name": email.split("@")[0].capitalize(),
                            "role": "SUPER_ADMIN",
                            "status": "ACTIVE"
                        }).execute()
                        admin_record = ins.data[0] if ins.data else None
                    except Exception:
                        pass
                else:
                    return jsonify({"success": False, "message": "Unauthorized: Not an administrator account"}), 403
            except Exception as cnt_err:
                logger.error("admin_users table not accessible: %s", cnt_err)

            if not admin_record:
                # Never grant an admin session without a persisted admin_users record
                return jsonify({"success": False, "message": "Unauthorized: Not an administrator account"}), 403

        if admin_record.get("status") != "ACTIVE":
            return jsonify({"success": False, "message": f"Account is {admin_record.get('status')}. Contact administrator."}), 403

        role = admin_record.get("role", "ADMIN")
        permissions = ROLES.get(role, [])

        # Log audit entry
        log_audit(
            admin_user=admin_record,
            action="LOGIN",
            entity_type="admins",
            entity_id=str(admin_record.get("id")),
            description=f"Administrator '{email}' logged in successfully"
        )

        return jsonify({
            "success": True,
            "message": "Login successful",
            "token": access_token,
            "user": {
                "id": admin_record.get("id"),
                "user_id": user_uuid,
                "email": email,
                "name": admin_record.get("name"),
                "role": role,
                "status": admin_record.get("status")
            },
            "permissions": permissions
        })

    except Exception as exc:
        logger.error("Admin login error for %s: %s", email, exc)
        return jsonify({"success": False, "message": f"Authentication failed: {str(exc)}"}), 401


@admin_bp.route("/auth/me", methods=["GET"])
@admin_required()
def admin_me():
    """Returns current admin user details and permissions."""
    admin_user = request.admin_user
    role = admin_user.get("role", "ADMIN")
    permissions = ROLES.get(role, [])
    return jsonify({
        "success": True,
        "user": admin_user,
        "permissions": permissions
    })


@admin_bp.route("/auth/setup-initial", methods=["POST"])
def setup_initial_admin():
    """
    Bootstraps the first administrator account if no admins exist.
    """
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    name = str(data.get("name", "Administrator")).strip()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({"success": False, "message": "Email and password are required"}), 400

    supabase = get_supabase()
    try:
        # Check if any admin exists
        existing_admins = supabase.table("admin_users").select("id").limit(1).execute()
        if existing_admins.data:
            return jsonify({"success": False, "message": "Initial admin setup already completed"}), 400

        # Create user in Supabase Auth
        created_user = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })
        user_uuid = created_user.user.id

        # Insert in admin_users as SUPER_ADMIN
        ins_res = supabase.table("admin_users").insert({
            "user_id": user_uuid,
            "email": email,
            "name": name,
            "role": "SUPER_ADMIN",
            "status": "ACTIVE"
        }).execute()

        return jsonify({
            "success": True,
            "message": "Initial Super Admin created successfully",
            "admin": ins_res.data[0] if ins_res.data else {}
        })
    except Exception as e:
        logger.error("Setup initial admin error: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 2. DASHBOARD STATISTICS
# ============================================================================

@admin_bp.route("/stats", methods=["GET"])
@admin_required()
def dashboard_stats():
    """Fetches real dashboard statistics and charts."""
    try:
        stats = get_dashboard_stats()
        return jsonify({"success": True, "data": stats})
    except Exception as e:
        logger.error("Error fetching stats: %s", e)
        return jsonify({"success": False, "message": "Failed to fetch dashboard stats"}), 500


# ============================================================================
# 3. USERS MANAGEMENT
# ============================================================================

@admin_bp.route("/users", methods=["GET"])
@admin_required(permission="users:read")
def get_users():
    """Paginated list of users with search and filter."""
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    search = request.args.get("search")
    status = request.args.get("status")
    sort_by = request.args.get("sort_by", "created_at")
    sort_order = request.args.get("sort_order", "desc")

    try:
        result = list_users(page, page_size, search, status, sort_by, sort_order)
        return jsonify({"success": True, **result})
    except Exception as e:
        logger.error("Error listing users: %s", e)
        return jsonify({"success": False, "message": "Failed to load users"}), 500


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@admin_required(permission="users:read")
def get_user_by_id(user_id):
    """Detailed profile, bookings, complaints, and activity timeline for a user."""
    try:
        detail = get_user_detail(user_id)
        if not detail:
            return jsonify({"success": False, "message": "User not found"}), 404
        return jsonify({"success": True, "data": detail})
    except Exception as e:
        logger.error("Error fetching user detail: %s", e)
        return jsonify({"success": False, "message": "Failed to load user details"}), 500


@admin_bp.route("/users/<int:user_id>/status", methods=["PATCH"])
@admin_required(permission="users:write")
def set_user_status(user_id):
    """Updates user status (ACTIVE, SUSPENDED, DEACTIVATED, DELETED)."""
    data = request.get_json(silent=True) or {}
    status = data.get("status", "ACTIVE")
    reason = data.get("reason", "")

    try:
        update_user_status(user_id, status, reason, request.admin_user)
        return jsonify({"success": True, "message": f"User status updated to {status}"})
    except Exception as e:
        logger.error("Error updating user status: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 4. INVENTORY MANAGEMENT
# ============================================================================

@admin_bp.route("/inventory", methods=["GET"])
@admin_required(permission="inventory:read")
def get_inventory():
    """Lists inventory items with pagination."""
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    search = request.args.get("search")
    category = request.args.get("category")
    status = request.args.get("status")
    low_stock = request.args.get("low_stock_only", "false").lower() == "true"

    try:
        res = list_inventory(page, page_size, search, category, status, low_stock)
        return jsonify({"success": True, **res})
    except Exception as e:
        logger.error("Error fetching inventory: %s", e)
        return jsonify({"success": False, "message": "Failed to load inventory"}), 500


@admin_bp.route("/inventory", methods=["POST"])
@admin_required(permission="inventory:write")
def create_inventory():
    """Creates a new inventory item."""
    data = request.get_json(silent=True) or {}
    try:
        item = add_inventory_item(data, request.admin_user)
        return jsonify({"success": True, "message": "Item added successfully", "data": item}), 201
    except Exception as e:
        logger.error("Error adding inventory: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/inventory/<int:item_id>", methods=["PUT"])
@admin_required(permission="inventory:write")
def edit_inventory(item_id):
    """Updates an inventory item."""
    data = request.get_json(silent=True) or {}
    try:
        item = update_inventory_item(item_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Item updated successfully", "data": item})
    except Exception as e:
        logger.error("Error editing inventory: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/inventory/<int:item_id>", methods=["DELETE"])
@admin_required(permission="inventory:write")
def remove_inventory(item_id):
    """Deletes an inventory item."""
    try:
        delete_inventory_item(item_id, request.admin_user)
        return jsonify({"success": True, "message": "Item deleted successfully"})
    except Exception as e:
        logger.error("Error deleting inventory: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/inventory/<int:item_id>/add-stock", methods=["POST"])
@admin_required(permission="inventory:write")
def stock_add(item_id):
    """Adds stock to an inventory item."""
    data = request.get_json(silent=True) or {}
    try:
        result = add_stock(item_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Stock added successfully", "data": result})
    except Exception as e:
        logger.error("Error adding stock: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/inventory/<int:item_id>/remove-stock", methods=["POST"])
@admin_required(permission="inventory:write")
def stock_remove(item_id):
    """Removes stock from an inventory item. Prevents negative stock."""
    data = request.get_json(silent=True) or {}
    try:
        result = remove_stock(item_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Stock removed successfully", "data": result})
    except Exception as e:
        logger.error("Error removing stock: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/inventory/transactions", methods=["GET"])
@admin_required(permission="inventory:read")
def inventory_transactions():
    """Stock movement ledger."""
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    item_id = request.args.get("item_id", type=int)
    trans_type = request.args.get("type")

    try:
        res = list_inventory_transactions(page, page_size, item_id, trans_type)
        return jsonify({"success": True, **res})
    except Exception as e:
        logger.error("Error loading transactions: %s", e)
        return jsonify({"success": False, "message": "Failed to load transactions"}), 500


@admin_bp.route("/inventory/low-stock", methods=["GET"])
@admin_required(permission="inventory:read")
def low_stock_items():
    """List of all low-stock items."""
    try:
        res = list_inventory(page=1, page_size=100, low_stock_only=True)
        return jsonify({"success": True, "items": res.get("items", []), "total": res.get("total", 0)})
    except Exception as e:
        logger.error("Error fetching low-stock items: %s", e)
        return jsonify({"success": False, "message": "Failed to load low-stock items"}), 500


# ============================================================================
# 5. COMPLAINTS MANAGEMENT
# ============================================================================

@admin_bp.route("/complaints", methods=["GET"])
@admin_required(permission="complaints:read")
def get_complaints_admin():
    """Lists complaints."""
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    status = request.args.get("status")
    category = request.args.get("category")
    priority = request.args.get("priority")
    search = request.args.get("search")

    try:
        res = list_complaints(page, page_size, status, category, priority, search)
        return jsonify({"success": True, **res})
    except Exception as e:
        logger.error("Error loading complaints: %s", e)
        return jsonify({"success": False, "message": "Failed to load complaints"}), 500


@admin_bp.route("/complaints/<int:complaint_id>", methods=["PATCH"])
@admin_required(permission="complaints:write")
def patch_complaint(complaint_id):
    """Updates complaint status, priority, assignment, notes, and response."""
    data = request.get_json(silent=True) or {}
    try:
        updated = update_complaint(complaint_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Complaint updated successfully", "data": updated})
    except Exception as e:
        logger.error("Error updating complaint: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 6. SOS EMERGENCY MANAGEMENT
# ============================================================================

@admin_bp.route("/sos", methods=["GET"])
@admin_required(permission="sos:read")
def get_sos():
    """Lists SOS emergency incidents."""
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    status = request.args.get("status")
    emergency_type = request.args.get("emergency_type")

    try:
        res = list_sos_incidents(page, page_size, status, emergency_type, request.admin_user)
        return jsonify({"success": True, **res})
    except Exception as e:
        logger.error("Error loading SOS: %s", e)
        return jsonify({"success": False, "message": "Failed to load SOS incidents"}), 500


@admin_bp.route("/sos/<int:incident_id>", methods=["PATCH"])
@admin_required(permission="sos:write")
def patch_sos(incident_id):
    """Updates SOS incident status (ACKNOWLEDGED, RESOLVED, CANCELLED)."""
    data = request.get_json(silent=True) or {}
    status = data.get("status", "ACKNOWLEDGED")
    notes = data.get("notes")

    try:
        updated = update_sos_status(incident_id, status, notes, request.admin_user)
        return jsonify({"success": True, "message": f"SOS incident marked as {status}", "data": updated})
    except Exception as e:
        logger.error("Error updating SOS: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 7. NOTIFICATIONS MANAGEMENT
# ============================================================================

@admin_bp.route("/notifications", methods=["GET"])
@admin_required(permission="notifications:read")
def get_notifications_admin():
    """Lists sent notifications with search and filtering."""
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    filter_type = request.args.get("type")
    filter_status = request.args.get("status")
    search = request.args.get("search")
    try:
        res = list_notifications(
            page=page,
            page_size=page_size,
            filter_type=filter_type,
            filter_status=filter_status,
            search=search
        )
        return jsonify({"success": True, **res})
    except Exception as e:
        logger.error("Error listing notifications: %s", e)
        return jsonify({"success": False, "message": "Failed to load notifications"}), 500


@admin_bp.route("/notifications/send", methods=["POST"])
@admin_required(permission="notifications:write")
def send_notification():
    """Dispatches in-app and push notifications to all active, specific, or selected users."""
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    message = str(data.get("message", "")).strip()
    target = data.get("target_audience") or data.get("target_type") or "all"
    priority = data.get("priority", "NORMAL")
    target_user_id = data.get("target_user_id")
    target_user_ids = data.get("target_user_ids")
    notification_type = data.get("notification_type", "general_announcement")
    deep_link = data.get("deep_link")

    if not title or not message:
        return jsonify({"success": False, "message": "Title and message are required"}), 400

    try:
        result = send_broadcast_notification(
            title=title,
            message=message,
            target_audience=target,
            priority=priority,
            admin_user=request.admin_user,
            target_user_id=target_user_id,
            target_user_ids=target_user_ids,
            notification_type=notification_type,
            deep_link=deep_link
        )
        return jsonify(result), 200
    except Exception as e:
        logger.error("Error sending notification: %s", e)
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 8. GUIDES MANAGEMENT
# ============================================================================

@admin_bp.route("/guides", methods=["GET"])
@admin_required(permission="guides:read")
def get_guides_route():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    search = request.args.get("search")
    try:
        res = list_guides_admin(page, page_size, search)
        return jsonify({"success": True, **res})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/guides", methods=["POST"])
@admin_required(permission="guides:write")
def create_guide_route():
    data = request.get_json(silent=True) or {}
    try:
        item = create_guide_admin(data, request.admin_user)
        return jsonify({"success": True, "message": "Guide created successfully", "data": item}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/guides/<int:g_id>", methods=["PUT"])
@admin_required(permission="guides:write")
def update_guide_route(g_id):
    data = request.get_json(silent=True) or {}
    try:
        item = update_guide_admin(g_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Guide updated successfully", "data": item})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/guides/<int:g_id>", methods=["DELETE"])
@admin_required(permission="guides:write")
def delete_guide_route(g_id):
    try:
        delete_guide_admin(g_id, request.admin_user)
        return jsonify({"success": True, "message": "Guide deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 9. FACILITIES MANAGEMENT
# ============================================================================

@admin_bp.route("/facilities", methods=["GET"])
@admin_required(permission="facilities:read")
def get_facilities_route():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    search = request.args.get("search")
    category = request.args.get("category")
    try:
        res = list_facilities_admin(page, page_size, search, category)
        return jsonify({"success": True, **res})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/facilities", methods=["POST"])
@admin_required(permission="facilities:write")
def create_facility_route():
    data = request.get_json(silent=True) or {}
    try:
        item = create_facility_admin(data, request.admin_user)
        return jsonify({"success": True, "message": "Facility created successfully", "data": item}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/facilities/<int:facility_id>", methods=["PUT"])
@admin_required(permission="facilities:write")
def update_facility_route(facility_id):
    data = request.get_json(silent=True) or {}
    try:
        item = update_facility_admin(facility_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Facility updated successfully", "data": item})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/facilities/<int:facility_id>", methods=["DELETE"])
@admin_required(permission="facilities:write")
def delete_facility_route(facility_id):
    try:
        delete_facility_admin(facility_id, request.admin_user)
        return jsonify({"success": True, "message": "Facility deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 10. OFFERS MANAGEMENT
# ============================================================================

@admin_bp.route("/offers", methods=["GET"])
@admin_required(permission="offers:read")
def get_offers_route():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    search = request.args.get("search")
    try:
        res = list_offers_admin(page, page_size, search)
        return jsonify({"success": True, **res})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/offers", methods=["POST"])
@admin_required(permission="offers:write")
def create_offer_route():
    data = request.get_json(silent=True) or {}
    try:
        item = create_offer_admin(data, request.admin_user)
        return jsonify({"success": True, "message": "Offer created successfully", "data": item}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/offers/<int:offer_id>", methods=["PUT"])
@admin_required(permission="offers:write")
def update_offer_route(offer_id):
    data = request.get_json(silent=True) or {}
    try:
        item = update_offer_admin(offer_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Offer updated successfully", "data": item})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/offers/<int:offer_id>", methods=["DELETE"])
@admin_required(permission="offers:write")
def delete_offer_route(offer_id):
    try:
        delete_offer_admin(offer_id, request.admin_user)
        return jsonify({"success": True, "message": "Offer deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 11. PRICING MANAGEMENT
# ============================================================================

@admin_bp.route("/pricing", methods=["GET"])
@admin_required(permission="pricing:read")
def get_pricing():
    try:
        items = list_pricing_items()
        return jsonify({"success": True, "items": items})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/pricing", methods=["POST"])
@admin_required(permission="pricing:write")
def post_pricing():
    data = request.get_json(silent=True) or {}
    try:
        item = create_pricing_item(data, request.admin_user)
        return jsonify({"success": True, "message": "Price item created", "data": item}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/pricing/<int:item_id>", methods=["PUT"])
@admin_required(permission="pricing:write")
def put_pricing(item_id):
    data = request.get_json(silent=True) or {}
    try:
        item = update_pricing_item(item_id, data, request.admin_user)
        return jsonify({"success": True, "message": "Price item updated", "data": item})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 12. PAYMENTS MONITORING
# ============================================================================

@admin_bp.route("/payments", methods=["GET"])
@admin_required(permission="payments:read")
def get_payments():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 15))
    status = request.args.get("status")
    search = request.args.get("search")

    try:
        res = list_payments_admin(page, page_size, status, search)
        return jsonify({"success": True, **res})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/payments/<int:payment_id>", methods=["GET"])
@admin_required(permission="payments:read")
def get_payment_detail(payment_id):
    try:
        payment = get_payment_detail_admin(payment_id)
        return jsonify({"success": True, "payment": payment})
    except ValueError as ve:
        return jsonify({"success": False, "message": str(ve)}), 404
    except Exception as e:
        logger.error("Error retrieving payment detail #%s: %s", payment_id, e)
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/payments/<int:payment_id>/refund", methods=["POST"])
@admin_required(permission="payments:refund")
def post_payment_refund(payment_id):
    data = request.get_json(silent=True) or {}
    reason = str(data.get("reason", "Admin requested refund")).strip()

    try:
        res = process_refund(payment_id, request.admin_user, reason)
        return jsonify({"success": True, **res}), 200
    except PaymentError as pe:
        return jsonify({"success": False, "message": str(pe)}), pe.status
    except Exception as e:
        logger.error("Refund error for payment #%s: %s", payment_id, e)
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/payments/<int:payment_id>/reconcile", methods=["POST"])
@admin_required(permission="payments:read")
def post_payment_reconcile(payment_id):
    try:
        res = reconcile_payment_admin(payment_id, request.admin_user)
        return jsonify({"success": True, "message": "Payment verified and reconciled with Razorpay API", "payment": res}), 200
    except PaymentError as pe:
        return jsonify({"success": False, "message": str(pe)}), pe.status
    except Exception as e:
        logger.error("Reconciliation error for payment #%s: %s", payment_id, e)
        return jsonify({"success": False, "message": str(e)}), 500


# ============================================================================
# 13. ADMIN MANAGEMENT (SUPER_ADMIN ONLY)
# ============================================================================

@admin_bp.route("/admins", methods=["GET"])
@admin_required(roles=["SUPER_ADMIN"])
def get_admins_list():
    try:
        admins = list_admins()
        return jsonify({"success": True, "admins": admins})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/admins", methods=["POST"])
@admin_required(roles=["SUPER_ADMIN"])
def post_admin_user():
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    name = data.get("name")
    role = data.get("role", "ADMIN")
    password = data.get("password")

    if not email or not name or not password:
        return jsonify({"success": False, "message": "Email, name, and password are required"}), 400

    try:
        admin_rec = create_admin_user(email, name, role, password, request.admin_user)
        return jsonify({"success": True, "message": "Admin account created", "data": admin_rec}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/admins/<int:admin_id>", methods=["PATCH"])
@admin_required(roles=["SUPER_ADMIN"])
def patch_admin_user(admin_id):
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    status = data.get("status")
    try:
        updated = update_admin_role_or_status(admin_id, role, status, request.admin_user)
        return jsonify({"success": True, "message": "Admin updated successfully", "data": updated})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


# ============================================================================
# 14. AUDIT LOGS
# ============================================================================

@admin_bp.route("/audit-logs", methods=["GET"])
@admin_required(permission="audit:read")
def get_audit_logs():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 25))
    entity_type = request.args.get("entity_type")
    action = request.args.get("action")
    search = request.args.get("search")

    try:
        res = list_audit_logs_admin(page, page_size, entity_type, action, search)
        return jsonify({"success": True, **res})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# ============================================================================
# 15. SETTINGS & HEALTH
# ============================================================================

@admin_bp.route("/settings", methods=["GET"])
@admin_required(permission="settings:read")
def get_settings_route():
    try:
        configs = get_admin_settings()
        return jsonify({"success": True, "settings": configs})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@admin_bp.route("/settings", methods=["POST"])
@admin_required(permission="settings:write")
def post_settings_route():
    data = request.get_json(silent=True) or {}
    try:
        updated = update_admin_settings(data, request.admin_user)
        return jsonify({"success": True, "message": "Settings updated", "settings": updated})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@admin_bp.route("/system/health", methods=["GET"])
def system_health_route():
    """Public system health diagnostics."""
    try:
        health = get_system_health()
        return jsonify({"success": True, "data": health})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
