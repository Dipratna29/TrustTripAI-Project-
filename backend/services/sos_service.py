"""
TrustTrip Mobile SOS Emergency Service
Handles:
1. Live distress signal dispatch with real GPS coordinates
2. Recording emergency incidents in Supabase public.sos_incidents table
3. Status polling and emergency resolution tracking
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from database import get_supabase

logger = logging.getLogger(__name__)


def trigger_sos_alert(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Records a live SOS distress alert from a traveler in Supabase sos_incidents.
    """
    if not data:
        raise ValueError("No emergency data received")

    username = data.get("username")
    user_id = data.get("user_id")
    emergency_type = data.get("emergency_type") or "General SOS"
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    location_name = data.get("location_name")
    phone = data.get("phone")

    supabase = get_supabase()

    # Look up user_id from username if needed
    if not user_id and username:
        try:
            u_res = supabase.table("users").select("user_id, mob").eq("username", username).limit(1).execute()
            if u_res.data:
                user_id = u_res.data[0].get("user_id")
                if not phone:
                    phone = u_res.data[0].get("mob")
        except Exception as e:
            logger.warning("User lookup notice for SOS: %s", e)

    created_at = datetime.now(timezone.utc).isoformat()

    location_source = data.get("location_source") or data.get("source") or ("MANUAL" if "manual" in (location_name or "").lower() else "GPS")
    if location_source == "MANUAL":
        location_label = f"{location_name or 'Manually Selected Location'} [MANUAL]"
        notes_text = f"Distress signal triggered with MANUALLY SELECTED LOCATION. Phone: {phone or 'N/A'}"
    else:
        location_label = location_name or "Live GPS Coordinates"
        notes_text = f"Distress signal triggered with LIVE GPS. Phone: {phone or 'N/A'}"

    insert_payload = {
        "user_id": int(user_id) if user_id else None,
        "username": username or (f"User #{user_id}" if user_id else "Anonymous Traveler"),
        "emergency_type": emergency_type,
        "latitude": float(latitude) if latitude is not None else None,
        "longitude": float(longitude) if longitude is not None else None,
        "location_name": location_label,
        "status": "ACTIVE",
        "notes": notes_text,
        "created_at": created_at,
        "updated_at": created_at
    }

    try:
        res = supabase.table("sos_incidents").insert(insert_payload).execute()
        if res.data:
            incident = res.data[0]
            logger.info("Live SOS emergency registered in Supabase: ID %s for user %s", incident.get("id"), username)

            # Notify user that their SOS distress signal was received by administration
            if user_id:
                try:
                    from services.notification_service import send_notification_to_user
                    loc_desc = location_label or "live GPS coordinates"
                    send_notification_to_user(
                        user_id=int(user_id),
                        notification_type="sos_dispatched",
                        notification_data={
                            "title": "🚨 SOS Emergency Dispatched",
                            "body": f"Your SOS distress alert (Incident #{incident.get('id')}) has been sent to TrustTrip Administration. Location: {loc_desc}. Stay safe, help is being coordinated.",
                            "data": {
                                "type": "emergency",
                                "screen": "SOS",
                                "incident_id": incident.get("id"),
                                "priority": "high"
                            }
                        }
                    )
                except Exception as n_err:
                    logger.warning("Could not dispatch SOS confirmation notification: %s", n_err)

            return incident
        raise RuntimeError("No data returned from SOS insert")
    except Exception as exc:
        logger.error("Supabase sos_incidents insert error: %s", exc)
        raise RuntimeError(f"Could not register SOS incident: {exc}")


def get_active_user_sos(user_id_or_username: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves the most recent active or acknowledged SOS incident for a user from Supabase.
    """
    supabase = get_supabase()
    try:
        query = supabase.table("sos_incidents").select("*").order("created_at", desc=True).limit(5)
        if str(user_id_or_username).isdigit():
            query = query.eq("user_id", int(user_id_or_username))
        else:
            query = query.eq("username", str(user_id_or_username))

        res = query.execute()
        if res.data:
            # Check for active or acknowledged incident
            for inc in res.data:
                if str(inc.get("status", "")).upper() in ("ACTIVE", "ACKNOWLEDGED"):
                    return inc
            # Resolved/cancelled incidents are not "active"
            return None
    except Exception as exc:
        logger.error("Error fetching user SOS status from Supabase: %s", exc)
        raise RuntimeError(f"Could not load SOS status: {exc}")

    return None


def cancel_user_sos(incident_id: int, username: str, user_id: Optional[int] = None) -> bool:
    """
    Allows a traveler to cancel their own active SOS incident in Supabase.
    """
    supabase = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        owner = supabase.table("sos_incidents").select("user_id, username").eq("id", incident_id).limit(1).execute()
        if not owner.data:
            return False
        rec = owner.data[0]
        if not ((user_id is not None and rec.get("user_id") == user_id) or rec.get("username") == username):
            logger.warning("SOS cancel rejected: @%s does not own incident %s", username, incident_id)
            return False
        res = supabase.table("sos_incidents").update({
            "status": "CANCELLED",
            "notes": f"Cancelled by traveler @{username} (False Alarm)",
            "updated_at": now_iso
        }).eq("id", incident_id).execute()
        return bool(res.data)
    except Exception as exc:
        logger.error("Supabase SOS cancel error: %s", exc)
        raise RuntimeError(f"Could not cancel SOS incident: {exc}")


def get_all_sos_incidents(status: Optional[str] = None, emergency_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Returns all SOS incidents from Supabase with optional status and type filters.
    """
    supabase = get_supabase()
    try:
        query = supabase.table("sos_incidents").select("*").order("created_at", desc=True)
        if status and status.upper() != "ALL":
            query = query.eq("status", status.upper())
        if emergency_type and emergency_type.upper() != "ALL":
            query = query.eq("emergency_type", emergency_type)

        res = query.execute()
        return res.data or []
    except Exception as exc:
        logger.error("Supabase get_all_sos_incidents error: %s", exc)
        raise RuntimeError(f"Could not fetch SOS incidents: {exc}")


def update_sos_incident_admin(
    incident_id: int,
    status: str,
    notes: Optional[str],
    admin_user: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Updates SOS incident status (ACKNOWLEDGED / RESOLVED / CANCELLED) in Supabase.
    """
    supabase = get_supabase()
    status_upper = status.upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    admin_name = admin_user.get("name") or admin_user.get("email") or "Admin"
    admin_id = admin_user.get("id")

    payload: Dict[str, Any] = {
        "status": status_upper,
        "updated_at": now_iso
    }

    if notes:
        payload["notes"] = notes

    if status_upper == "ACKNOWLEDGED":
        payload["acknowledged_by"] = admin_id
        payload["acknowledged_admin_name"] = admin_name
        payload["acknowledged_at"] = now_iso
    elif status_upper == "RESOLVED":
        payload["resolved_by"] = admin_id
        payload["resolved_admin_name"] = admin_name
        payload["resolved_at"] = now_iso

    try:
        res = supabase.table("sos_incidents").update(payload).eq("id", incident_id).execute()
        if res.data:
            updated_inc = res.data[0]

            # Notify the traveler about admin response
            user_id = updated_inc.get("user_id")
            if not user_id and updated_inc.get("username"):
                try:
                    u_res = supabase.table("users").select("user_id").eq("username", updated_inc.get("username")).limit(1).execute()
                    if u_res.data:
                        user_id = u_res.data[0].get("user_id")
                except Exception:
                    pass

            if user_id:
                try:
                    from services.notification_service import send_notification_to_user
                    if status_upper == "ACKNOWLEDGED":
                        title = "🚨 SOS Acknowledged by Admin"
                        body = f"Administration ({admin_name}) has acknowledged your SOS emergency (Incident #{incident_id}). Responders are attending.{f' Note: {notes}' if notes else ''}"
                    elif status_upper == "RESOLVED":
                        title = "✅ SOS Emergency Resolved"
                        body = f"Your SOS emergency (Incident #{incident_id}) has been marked as RESOLVED by Administration.{f' Resolution note: {notes}' if notes else ''} Stay safe!"
                    else:
                        title = f"ℹ️ SOS Status: {status_upper}"
                        body = f"Your SOS incident #{incident_id} status updated to {status_upper}.{f' Note: {notes}' if notes else ''}"

                    send_notification_to_user(
                        user_id=int(user_id),
                        notification_type="sos_acknowledged" if status_upper == "ACKNOWLEDGED" else ("sos_resolved" if status_upper == "RESOLVED" else "emergency"),
                        notification_data={
                            "title": title,
                            "body": body,
                            "data": {
                                "type": "emergency",
                                "screen": "SOS",
                                "incident_id": incident_id,
                                "status": status_upper,
                                "priority": "high"
                            }
                        }
                    )
                except Exception as n_err:
                    logger.warning("Could not send SOS admin response notification: %s", n_err)

            return updated_inc
        return None
    except Exception as exc:
        logger.error("Supabase update_sos_incident_admin error: %s", exc)
        raise RuntimeError(f"Could not update SOS incident #{incident_id}: {exc}")

