"""
TrustTrip Mobile Offers & Facilities Public Service
Fetches published promotional deals and verified public emergency facilities directly from Supabase.
"""

import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from database import get_supabase

logger = logging.getLogger(__name__)

STALE_AFTER_DAYS = 180


def _to_date(value) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            return None


def is_offer_valid(offer: Dict[str, Any], today: Optional[date] = None) -> bool:
    today = today or datetime.now(timezone.utc).date()
    if str(offer.get("status") or "").upper() != "PUBLISHED":
        return False
    start, end = _to_date(offer.get("start_date")), _to_date(offer.get("end_date"))
    if start and today < start:
        return False
    if end and today > end:
        return False
    return True


def list_active_offers(supabase=None, today: Optional[date] = None) -> List[Dict[str, Any]]:
    """Published offers whose validity window includes today (expired/upcoming ones are excluded)."""
    try:
        sb = supabase or get_supabase()
        res = sb.table("offers").select("*").eq("status", "PUBLISHED").order("created_at", desc=True).execute()
    except Exception as e:
        logger.error("Error fetching active offers from Supabase: %s", e)
        raise RuntimeError("Could not load offers") from e
    today = today or datetime.now(timezone.utc).date()
    out = []
    for o in res.data or []:
        if not is_offer_valid(o, today):
            continue
        end = _to_date(o.get("end_date"))
        o = dict(o)
        o["days_left"] = (end - today).days if end else None
        out.append(o)
    return out


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def list_public_facilities(
    category: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    radius_km: Optional[float] = None,
    supabase=None,
) -> List[Dict[str, Any]]:
    """
    Active facilities, optionally sorted by distance from (lat, lon) and limited to radius_km.
    Each item carries `is_verified` and `is_stale` so the app can label unverified/old data.
    """
    try:
        sb = supabase or get_supabase()
        query = sb.table("facilities").select("*").eq("status", "ACTIVE")
        if category and category.lower() != "all":
            query = query.ilike("category", f"%{category}%")
        res = query.order("id", desc=False).execute()
    except Exception as e:
        logger.error("Error fetching facilities from Supabase: %s", e)
        raise RuntimeError("Could not load facilities") from e

    stale_before = datetime.now(timezone.utc) - timedelta(days=STALE_AFTER_DAYS)
    items = []
    for f in res.data or []:
        f = dict(f)
        updated = f.get("updated_at") or f.get("created_at")
        try:
            updated_dt = datetime.fromisoformat(str(updated).replace("Z", "+00:00")) if updated else None
            if updated_dt and updated_dt.tzinfo is None:
                updated_dt = updated_dt.replace(tzinfo=timezone.utc)
        except ValueError:
            updated_dt = None
        f["is_verified"] = bool(f.get("is_verified"))
        f["is_stale"] = updated_dt is None or updated_dt < stale_before
        if lat is not None and lon is not None and f.get("latitude") is not None and f.get("longitude") is not None:
            f["distance_km"] = round(_haversine_km(lat, lon, float(f["latitude"]), float(f["longitude"])), 2)
        else:
            f["distance_km"] = None
        items.append(f)

    if lat is not None and lon is not None:
        if radius_km:
            items = [f for f in items if f["distance_km"] is not None and f["distance_km"] <= radius_km]
        items.sort(key=lambda f: (f["distance_km"] is None, f["distance_km"] or 0))
    return items
