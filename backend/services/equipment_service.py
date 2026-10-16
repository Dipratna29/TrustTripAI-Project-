# equipment_service.py
"""
TrustTrip Equipment & Inventory Service
Unified against remote Supabase PostgreSQL (public.inventory_items)
as the single source of truth.
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from database import get_supabase

logger = logging.getLogger(__name__)


def fetch_prices():
    """Fetch all price items for fair-price checking."""
    supabase = get_supabase()
    res = supabase.table("price_items").select("id, name, base_price").order("id").execute()
    return res.data or []


def fetch_all_equipment(search: Optional[str] = None, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Fetch all active safety equipment items from the primary inventory table.
    Filters out INACTIVE (soft-deleted) items.
    """
    supabase = get_supabase()
    try:
        query = supabase.table("inventory_items").select("*").neq("status", "INACTIVE")

        if category and category.upper() != "ALL":
            query = query.eq("category", category)

        if search and search.strip():
            s = "".join(ch for ch in search.strip() if ch.isalnum() or ch in " -_")[:60]
            query = query.or_(f"name.ilike.%{s}%,category.ilike.%{s}%,sku.ilike.%{s}%,description.ilike.%{s}%")

        res = query.order("id").execute()
        items = res.data or []
        
        # Calculate consistent stock status
        for item in items:
            c_stock = int(item.get("current_stock", 0))
            m_stock = int(item.get("minimum_stock", 5))
            if c_stock <= 0:
                item["status"] = "OUT_OF_STOCK"
            elif c_stock <= m_stock:
                item["status"] = "LOW_STOCK"
            else:
                item["status"] = "IN_STOCK"
                
        return items
    except Exception as exc:
        logger.error("Error loading equipment from inventory_items: %s", exc)
        return []


def fetch_equipment_by_id(equipment_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single equipment item by its primary ID."""
    supabase = get_supabase()
    try:
        res = supabase.table("inventory_items").select("*").eq("id", int(equipment_id)).limit(1).execute()
        if res.data:
            item = res.data[0]
            c_stock = int(item.get("current_stock", 0))
            m_stock = int(item.get("minimum_stock", 5))
            if c_stock <= 0:
                item["status"] = "OUT_OF_STOCK"
            elif c_stock <= m_stock:
                item["status"] = "LOW_STOCK"
            else:
                item["status"] = "IN_STOCK"
            return item
        return None
    except Exception as exc:
        logger.error("Error fetching equipment #%s: %s", equipment_id, exc)
        return None


COD_MAX_QUANTITY = 10
COD_MAX_ORDER_VALUE = 10000.0  # INR; larger orders must be prepaid


def _stock_status(stock: int, min_stock: int) -> str:
    if stock <= 0:
        return "OUT_OF_STOCK"
    if stock <= min_stock:
        return "LOW_STOCK"
    return "IN_STOCK"


def create_order(data: Dict[str, Any], payment_method: str = "COD") -> Dict[str, Any]:
    """
    Create a Cash-on-Delivery equipment order.
    Price is always computed server-side from inventory_items (client totals are ignored),
    and stock is deducted with an optimistic-concurrency guard so two buyers cannot
    oversell the last units. Prepaid orders go through payment_service instead.
    """
    supabase = get_supabase()
    user_id = int(data["user_id"])
    equipment_id = int(data["equipment_id"])
    try:
        quantity = int(data.get("quantity", 1))
    except (TypeError, ValueError):
        raise ValueError("Invalid quantity")
    if quantity <= 0:
        raise ValueError("Order quantity must be at least 1")
    if quantity > COD_MAX_QUANTITY:
        raise ValueError(f"Cash on Delivery is limited to {COD_MAX_QUANTITY} units per order")

    lat, lon = data.get("latitude"), data.get("longitude")
    try:
        lat = float(lat) if lat is not None else None
        lon = float(lon) if lon is not None else None
    except (TypeError, ValueError):
        raise ValueError("Invalid delivery coordinates")
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("A valid delivery location is required")

    delivery_address = str(data.get("delivery_address") or "").strip()[:500]
    contact_phone = str(data.get("contact_phone") or "").strip()[:30]

    for _attempt in range(3):
        inv_res = supabase.table("inventory_items").select("*").eq("id", equipment_id).limit(1).execute()
        if not inv_res.data:
            raise ValueError(f"Equipment item #{equipment_id} not found in inventory")

        inv_item = inv_res.data[0]
        if str(inv_item.get("status") or "").upper() == "INACTIVE":
            raise ValueError("This equipment item is currently unavailable")

        item_id = inv_item["id"]
        item_name = inv_item.get("name", "Safety Gear")
        current_stock = int(inv_item.get("current_stock") or 0)
        min_stock = int(inv_item.get("minimum_stock") or 5)

        if current_stock < quantity:
            raise ValueError(f"Insufficient stock: Requested {quantity} unit(s), but only {current_stock} available.")

        unit_price = float(inv_item.get("price") or 0.0)
        if unit_price <= 0:
            raise ValueError("This item has no valid price configured")
        total_price = round(unit_price * quantity, 2)
        if total_price > COD_MAX_ORDER_VALUE:
            raise ValueError(f"Cash on Delivery is available for orders up to INR {COD_MAX_ORDER_VALUE:,.0f}. Please pay online.")

        new_stock = current_stock - quantity
        upd = (
            supabase.table("inventory_items")
            .update({
                "current_stock": new_stock,
                "status": _stock_status(new_stock, min_stock),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", item_id)
            .eq("current_stock", current_stock)
            .execute()
        )
        if upd.data:
            break
    else:
        raise ValueError("This item is in high demand right now. Please try again.")

    try:
        supabase.table("inventory_transactions").insert({
            "item_id": item_id,
            "type": "ORDER_DEDUCT",
            "quantity": quantity,
            "previous_stock": current_stock,
            "new_stock": new_stock,
            "reason": f"Mobile {payment_method} Order by User #{user_id}",
            "notes": f"Order for {quantity}x {item_name} (Total: INR {total_price})",
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as tx_err:
        logger.warning("Could not record inventory transaction: %s", tx_err)

    base_payload = {
        "user_id": user_id,
        "equipment_id": item_id,
        "quantity": quantity,
        "total_price": total_price,
        "latitude": lat,
        "longitude": lon,
        "status": "Confirmed",
    }
    extended_payload = {
        **base_payload,
        "payment_method": payment_method,
        "payment_status": "COD_PENDING" if payment_method == "COD" else "PENDING",
        "delivery_address": delivery_address or None,
        "contact_phone": contact_phone or None,
    }

    try:
        res = supabase.table("equipment_orders").insert(extended_payload).execute()
    except Exception as ext_err:
        # Columns from migration 003 missing: keep the order but flag it in the status text
        logger.warning("Extended order insert failed (%s); run migration 003. Falling back.", ext_err)
        res = supabase.table("equipment_orders").insert({**base_payload, "status": "Confirmed (COD)"}).execute()

    if not res.data:
        # Roll back the stock deduction so inventory stays consistent
        try:
            supabase.table("inventory_items").update({
                "current_stock": current_stock,
                "status": _stock_status(current_stock, min_stock),
            }).eq("id", item_id).execute()
        except Exception:
            logger.error("Stock rollback failed for item #%s", item_id)
        raise RuntimeError("Failed to insert equipment order into database")

    order_record = res.data[0]
    return {
        "order_id": order_record["id"],
        "equipment_id": item_id,
        "name": item_name,
        "quantity": quantity,
        "unit_price": unit_price,
        "total_price": total_price,
        "remaining_stock": new_stock,
        "payment_method": payment_method,
        "payment_status": order_record.get("payment_status", "COD_PENDING"),
        "status": order_record.get("status", "Confirmed"),
        "created_at": order_record.get("created_at"),
    }


def fetch_user_orders(user_id: int) -> List[Dict[str, Any]]:
    """Fetch all equipment orders for a specific user with joined item metadata."""
    supabase = get_supabase()

    column_sets = [
        "id, quantity, total_price, status, created_at, equipment_id, razorpay_order_id, razorpay_payment_id, payment_status, payment_method, delivery_address",
        "id, quantity, total_price, status, created_at, equipment_id, razorpay_order_id, razorpay_payment_id, payment_status",
        "id, quantity, total_price, status, created_at, equipment_id",
    ]
    orders_res = None
    for idx, columns in enumerate(column_sets):
        try:
            orders_res = (
                supabase.table("equipment_orders")
                .select(columns)
                .eq("user_id", int(user_id))
                .order("created_at", desc=True)
                .execute()
            )
            break
        except Exception:
            if idx == len(column_sets) - 1:
                raise
    orders = orders_res.data or []

    if orders:
        equipment_ids = list({o["equipment_id"] for o in orders if o.get("equipment_id")})
        if equipment_ids:
            try:
                eq_res = supabase.table("inventory_items").select("id, name, sku, image_url, price, category").in_("id", equipment_ids).execute()
                eq_map = {e["id"]: e for e in (eq_res.data or [])}

                # Fallback for any legacy IDs
                missing = [eid for eid in equipment_ids if eid not in eq_map]
                if missing:
                    legacy_res = supabase.table("safety_equipment").select("id, name, image_url, price, category").in_("id", missing).execute()
                    for le in (legacy_res.data or []):
                        eq_map[le["id"]] = le

                for o in orders:
                    item_info = eq_map.get(o.get("equipment_id"), {})
                    o["name"] = item_info.get("name", "Safety Equipment")
                    o["sku"] = item_info.get("sku", "")
                    o["image_url"] = item_info.get("image_url", "")
                    o["category"] = item_info.get("category", "General")
            except Exception as e:
                logger.warning("Order details join notice: %s", e)

    return orders