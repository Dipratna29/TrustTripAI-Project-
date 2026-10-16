"""
Admin notification center (business events) and admin order management.

Business events (orders, registrations, SOS, stock, complaints, payments, guides, offers)
are written by database triggers (migration 004) in the same transaction as the business
row, so they cannot be lost or duplicated. This module:
  * reads/filters/paginates the shared admin inbox with per-category permission checks,
  * manages read state,
  * records SYSTEM events raised by the backend itself (e.g. SMS/push delivery failures)
    through the same idempotent `record_admin_event` database function.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from database import get_supabase

logger = logging.getLogger(__name__)

CATEGORIES = ("ORDER", "USER", "INVENTORY", "SOS", "COMPLAINT", "PAYMENT", "GUIDE", "OFFER", "SYSTEM")
SEVERITIES = ("INFO", "WARNING", "CRITICAL")

# Which admin permission is needed to see each event category
CATEGORY_PERMISSION = {
    "ORDER": "payments:read",
    "PAYMENT": "payments:read",
    "USER": "users:read",
    "INVENTORY": "inventory:read",
    "SOS": "sos:read",
    "COMPLAINT": "complaints:read",
    "GUIDE": "guides:read",
    "OFFER": "offers:read",
    "SYSTEM": "settings:read",
}

# Only these metadata keys are ever returned to the admin UI
METADATA_ALLOWLIST = {
    "order_id", "status", "quantity", "item", "equipment_id", "total", "currency", "payment_method",
    "from", "to", "username", "created_at", "item_id", "previous_stock", "current_stock", "minimum_stock",
    "new_stock", "type", "transaction_id", "complaint_id", "category", "priority", "incident_id",
    "emergency_type", "has_location", "payment_id", "razorpay_order_id", "amount", "booking_id",
    "guide_id", "guide", "offer_id", "title", "channel", "provider", "error_code", "component",
}

ORDER_STATUSES = ("Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled")
ORDER_TRANSITIONS = {
    "pending": {"Confirmed", "Cancelled"},
    "confirmed": {"Processing", "Shipped", "Cancelled"},
    "processing": {"Shipped", "Cancelled"},
    "shipped": {"Delivered"},
    "delivered": set(),
    "cancelled": set(),
}


class AdminEventError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def allowed_categories(role: str, has_permission) -> List[str]:
    return [c for c in CATEGORIES if has_permission(role, CATEGORY_PERMISSION[c])]


def _clean(event: Dict[str, Any]) -> Dict[str, Any]:
    meta = event.get("metadata") or {}
    event = dict(event)
    event["metadata"] = {k: v for k, v in meta.items() if k in METADATA_ALLOWLIST}
    event["is_read"] = event.get("read_at") is not None
    event.pop("dedup_key", None)
    return event


def _parse_iso(value: Optional[str], name: str) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except ValueError:
        raise AdminEventError(f"Invalid {name} date")


def list_events(
    categories: Iterable[str],
    category: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    supabase=None,
) -> Dict[str, Any]:
    allowed = list(categories)
    if category and category.upper() != "ALL":
        category = category.upper()
        if category not in CATEGORIES:
            raise AdminEventError("Unknown category")
        if category not in allowed:
            raise AdminEventError("You do not have access to this category", 403)
        allowed = [category]
    if not allowed:
        return {"events": [], "total": 0, "page": 1, "page_size": page_size, "total_pages": 1}

    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 100)
    offset = (page - 1) * page_size

    sb = supabase or get_supabase()
    query = sb.table("admin_events").select("*", count="exact").in_("category", allowed)
    if status == "unread":
        query = query.is_("read_at", "null")
    elif status == "read":
        query = query.not_.is_("read_at", "null")
    elif status not in (None, "", "all"):
        raise AdminEventError("status must be all, read or unread")
    if severity and severity.upper() != "ALL":
        if severity.upper() not in SEVERITIES:
            raise AdminEventError("Unknown severity")
        query = query.eq("severity", severity.upper())
    since_iso, until_iso = _parse_iso(since, "since"), _parse_iso(until, "until")
    if since_iso:
        query = query.gte("created_at", since_iso)
    if until_iso:
        query = query.lte("created_at", until_iso)

    res = query.order("created_at", desc=True).order("id", desc=True).range(offset, offset + page_size - 1).execute()
    data = [_clean(e) for e in (res.data or [])]
    total = res.count if res.count is not None else len(data)
    return {
        "events": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


def unread_count(categories: Iterable[str], supabase=None) -> Dict[str, Any]:
    allowed = list(categories)
    if not allowed:
        return {"unread": 0, "critical_unread": 0}
    sb = supabase or get_supabase()
    total = sb.table("admin_events").select("id", count="exact").in_("category", allowed).is_("read_at", "null").limit(1).execute()
    critical = (
        sb.table("admin_events").select("id", count="exact").in_("category", allowed)
        .is_("read_at", "null").eq("severity", "CRITICAL").limit(1).execute()
    )
    return {"unread": total.count or 0, "critical_unread": critical.count or 0}


def set_read(event_id: int, read: bool, admin_email: str, categories: Iterable[str], supabase=None) -> Dict[str, Any]:
    sb = supabase or get_supabase()
    found = sb.table("admin_events").select("id, category").eq("id", int(event_id)).limit(1).execute()
    if not found.data:
        raise AdminEventError("Notification not found", 404)
    if found.data[0]["category"] not in set(categories):
        raise AdminEventError("You do not have access to this notification", 403)
    payload = (
        {"read_at": datetime.now(timezone.utc).isoformat(), "read_by": admin_email}
        if read else {"read_at": None, "read_by": None}
    )
    res = sb.table("admin_events").update(payload).eq("id", int(event_id)).execute()
    return _clean((res.data or [found.data[0]])[0])


def mark_all_read(admin_email: str, categories: Iterable[str], category: Optional[str] = None, supabase=None) -> int:
    allowed = list(categories)
    if category and category.upper() != "ALL":
        if category.upper() not in allowed:
            raise AdminEventError("You do not have access to this category", 403)
        allowed = [category.upper()]
    if not allowed:
        return 0
    sb = supabase or get_supabase()
    res = (
        sb.table("admin_events")
        .update({"read_at": datetime.now(timezone.utc).isoformat(), "read_by": admin_email})
        .in_("category", allowed).is_("read_at", "null").execute()
    )
    return len(res.data or [])


def record_system_event(
    event_type: str,
    title: str,
    message: str,
    dedup_key: str,
    severity: str = "WARNING",
    category: str = "SYSTEM",
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    supabase=None,
) -> bool:
    """Record a backend-originated event (idempotent). Never raises: alerts must not break the caller."""
    if category not in CATEGORIES or severity not in SEVERITIES:
        logger.error("Invalid admin event %s/%s", category, severity)
        return False
    safe_meta = {k: v for k, v in (metadata or {}).items() if k in METADATA_ALLOWLIST}
    try:
        sb = supabase or get_supabase()
        sb.rpc("record_admin_event", {
            "p_event_type": event_type, "p_category": category, "p_severity": severity,
            "p_title": title[:200], "p_message": message[:1000],
            "p_entity_type": entity_type, "p_entity_id": str(entity_id) if entity_id is not None else None,
            "p_actor_user_id": None, "p_metadata": safe_meta, "p_dedup_key": dedup_key[:200],
        }).execute()
        return True
    except Exception as exc:
        logger.warning("Could not record admin event %s: %s", event_type, exc)
        return False


# ---------------------------------------------------------------------------
# Admin order management (target of "open order" from a notification)
# ---------------------------------------------------------------------------

def _attach_items(sb, orders: List[Dict[str, Any]]) -> None:
    ids = list({o["equipment_id"] for o in orders if o.get("equipment_id")})
    names: Dict[Any, Dict[str, Any]] = {}
    if ids:
        try:
            res = sb.table("inventory_items").select("id, name, sku, price").in_("id", ids).execute()
            names = {r["id"]: r for r in (res.data or [])}
        except Exception as exc:
            logger.warning("Order item join failed: %s", exc)
    for o in orders:
        info = names.get(o.get("equipment_id"), {})
        o["item_name"] = info.get("name", f"Equipment #{o.get('equipment_id')}")
        o["item_sku"] = info.get("sku")


def list_orders(page: int = 1, page_size: int = 20, status: Optional[str] = None,
                payment_method: Optional[str] = None, supabase=None) -> Dict[str, Any]:
    sb = supabase or get_supabase()
    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 100)
    offset = (page - 1) * page_size
    query = sb.table("equipment_orders").select("*", count="exact")
    if status and status.upper() != "ALL":
        query = query.ilike("status", f"{status}%")
    if payment_method and payment_method.upper() != "ALL":
        query = query.eq("payment_method", payment_method.upper())
    res = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    orders = res.data or []
    _attach_items(sb, orders)
    total = res.count if res.count is not None else len(orders)
    return {"orders": orders, "total": total, "page": page, "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size)}


def get_order(order_id: int, supabase=None) -> Dict[str, Any]:
    sb = supabase or get_supabase()
    res = sb.table("equipment_orders").select("*").eq("id", int(order_id)).limit(1).execute()
    if not res.data:
        raise AdminEventError("Order not found", 404)
    order = res.data[0]
    _attach_items(sb, [order])
    try:
        u = sb.table("users").select("user_id, username, name").eq("user_id", order["user_id"]).limit(1).execute()
        order["customer"] = u.data[0] if u.data else None
    except Exception:
        order["customer"] = None
    return order


def update_order_status(order_id: int, new_status: str, supabase=None) -> Dict[str, Any]:
    if new_status not in ORDER_STATUSES:
        raise AdminEventError(f"Status must be one of: {', '.join(ORDER_STATUSES)}")
    sb = supabase or get_supabase()
    current = get_order(order_id, supabase=sb)
    raw = str(current.get("status") or "Pending")
    key = raw.lower().split(" ")[0]  # "Confirmed (COD)" -> "confirmed"
    allowed = ORDER_TRANSITIONS.get(key)
    if allowed is not None and new_status not in allowed:
        raise AdminEventError(f"Cannot change an order from {raw} to {new_status}", 409)
    payload: Dict[str, Any] = {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if new_status == "Delivered" and str(current.get("payment_method") or "").upper() == "COD":
        payload["payment_status"] = "COD_COLLECTED"
    # Guard on the old status so two admins cannot apply conflicting transitions
    res = sb.table("equipment_orders").update(payload).eq("id", int(order_id)).eq("status", raw).execute()
    if not res.data:
        raise AdminEventError("The order was changed by someone else. Refresh and try again.", 409)
    if new_status == "Cancelled":
        _restock_cancelled_order(sb, current)
    return get_order(order_id, supabase=sb)


def _restock_cancelled_order(sb, order: Dict[str, Any]) -> None:
    """Return a cancelled order's units to inventory (optimistic-concurrency retry)."""
    qty = int(order.get("quantity") or 0)
    item_id = order.get("equipment_id")
    if qty <= 0 or not item_id:
        return
    for _ in range(3):
        inv = sb.table("inventory_items").select("current_stock, minimum_stock").eq("id", item_id).limit(1).execute()
        if not inv.data:
            return
        prev = int(inv.data[0].get("current_stock") or 0)
        new = prev + qty
        upd = (
            sb.table("inventory_items")
            .update({"current_stock": new, "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", item_id).eq("current_stock", prev).execute()
        )
        if upd.data:
            try:
                sb.table("inventory_transactions").insert({
                    "item_id": item_id, "type": "ORDER_CANCEL_RESTOCK", "quantity": qty,
                    "previous_stock": prev, "new_stock": new,
                    "reason": f"Order #{order['id']} cancelled by admin",
                }).execute()
            except Exception as exc:
                logger.warning("Restock transaction log failed: %s", exc)
            return
    logger.error("Could not restock cancelled order #%s after retries", order.get("id"))
