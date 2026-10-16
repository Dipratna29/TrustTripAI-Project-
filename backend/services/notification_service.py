"""
Notification Service for TrustTrip
Handles Expo push notification delivery and logging using Supabase.
"""

import requests
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from database import get_supabase
from config import Config

logger = logging.getLogger(__name__)

# Notification templates with default titles and bodies
NOTIFICATION_TEMPLATES = {
    "welcome": {
        "title": "🎉 Welcome to TrustTrip!",
        "body": "Your TrustTrip account has been created successfully. Stay safe and travel with confidence.",
        "data": {"type": "welcome", "screen": "Home"}
    },
    "sos_dispatched": {
        "title": "🚨 SOS Emergency Dispatched",
        "body": "Your SOS emergency distress signal has been sent to TrustTrip Administration and emergency response services.",
        "data": {"type": "emergency", "screen": "SOS", "priority": "high"}
    },
    "sos_acknowledged": {
        "title": "🚨 SOS Acknowledged by Admin",
        "body": "Administration has acknowledged your emergency. Responders have been alerted.",
        "data": {"type": "emergency", "screen": "SOS", "priority": "high"}
    },
    "sos_resolved": {
        "title": "✅ SOS Emergency Resolved",
        "body": "Your emergency incident has been marked as resolved by Administration. Stay safe!",
        "data": {"type": "emergency", "screen": "SOS"}
    },
    "equipment_order": {
        "title": "🛡️ Order Confirmed",
        "body": "Your safety equipment order has been successfully placed.",
        "data": {"type": "equipment_order", "screen": "Equipment"}
    },
    "complaint_submitted": {
        "title": "📝 Complaint Submitted",
        "body": "Your complaint has been submitted successfully. We will keep you updated.",
        "data": {"type": "complaint", "screen": "MyComplaints"}
    },
    "complaint_updated": {
        "title": "📋 Complaint Updated",
        "body": "Administration has reviewed and updated your complaint with an official response.",
        "data": {"type": "complaint", "screen": "MyComplaints"}
    },
    "guide_requested": {
        "title": "🧭 Guide Request Sent",
        "body": "Your local guide request has been submitted successfully.",
        "data": {"type": "guide_request", "screen": "Guide"}
    },
    "guide_cancelled": {
        "title": "🧭 Guide Booking Cancelled",
        "body": "Your guide booking has been cancelled.",
        "data": {"type": "guide_request", "screen": "Guide"}
    },
    "account_status_changed": {
        "title": "👤 Account Status Notice",
        "body": "Your TrustTrip account status has been updated by administration.",
        "data": {"type": "system", "screen": "Profile"}
    },
}


def _get_active_devices(user_id):
    """
    Fetch all active push notification tokens for a user.
    """
    try:
        supabase = get_supabase()
        res = (
            supabase.table("user_devices")
            .select("device_id, push_token, device_type")
            .eq("user_id", int(user_id))
            .eq("is_active", True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error("Error fetching active devices: %s", e)
        return []


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
EXPO_TOKEN_RE = re.compile(r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-]+\]$")
# Ticket/receipt errors that mean the token is permanently unusable
PERMANENT_TOKEN_ERRORS = {"DeviceNotRegistered", "InvalidCredentials"}


def is_valid_expo_token(token) -> bool:
    return bool(token) and bool(EXPO_TOKEN_RE.match(str(token).strip()))


def _expo_headers():
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    # Only needed when "enhanced push security" is enabled for the Expo project
    if Config.EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {Config.EXPO_ACCESS_TOKEN}"
    return headers


def _alert_push_failure(error_code):
    try:
        from services.admin_event_service import record_system_event
        hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
        record_system_event(
            "integration.push_failed",
            "Push notifications failing",
            f"Expo push delivery returned {error_code}. Check FCM credentials in EAS and the Expo project.",
            dedup_key=f"push_failed:{error_code}:{hour}",
            severity="WARNING",
            metadata={"channel": "push", "provider": "expo", "error_code": error_code},
        )
    except Exception:
        logger.debug("Push failure alert not recorded")


def _send_to_expo_api(push_token, title, body, data=None):
    """
    Send one message to the Expo Push Service.
    Returns (accepted, info). Expo answers HTTP 200 even for rejected messages, so the
    per-message ticket status ("ok"/"error") is what decides success.
    """
    if not is_valid_expo_token(push_token):
        return False, {"error": "InvalidPushToken", "permanent": True}

    payload = {"to": push_token, "sound": "default", "title": title, "body": body,
               "priority": "high", "channelId": "default"}
    if data:
        payload["data"] = data

    for attempt in range(2):  # one retry for transient network/5xx errors
        try:
            response = requests.post(EXPO_PUSH_URL, headers=_expo_headers(), json=payload, timeout=10)
        except requests.exceptions.RequestException as e:
            logger.warning("Expo push network error (attempt %s): %s", attempt + 1, type(e).__name__)
            if attempt == 0:
                continue
            return False, {"error": "NetworkError"}
        if response.status_code >= 500 and attempt == 0:
            continue
        try:
            body_json = response.json()
        except ValueError:
            return False, {"error": f"HTTP{response.status_code}"}
        if response.status_code != 200:
            err = ((body_json.get("errors") or [{}])[0]).get("code") or f"HTTP{response.status_code}"
            return False, {"error": err}
        ticket = body_json.get("data") or {}
        if isinstance(ticket, list):
            ticket = ticket[0] if ticket else {}
        if ticket.get("status") == "ok":
            return True, {"ticket_id": ticket.get("id"), "status": "queued"}
        err = (ticket.get("details") or {}).get("error") or "TicketError"
        return False, {"error": err, "permanent": err in PERMANENT_TOKEN_ERRORS, "message": ticket.get("message")}
    return False, {"error": "Unknown"}


def check_push_receipts(hours: int = 24, limit: int = 300):
    """
    Fetch Expo receipts for recently sent tickets: marks DELIVERED/FAILED and deactivates
    tokens Expo reports as DeviceNotRegistered. Safe to call repeatedly.
    """
    supabase = get_supabase()
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    res = (
        supabase.table("notifications").select("notification_id, device_id, expo_ticket_id")
        .eq("expo_response_status", "PUSH_SENT").gte("created_at", since).limit(limit).execute()
    )
    rows = [r for r in (res.data or []) if r.get("expo_ticket_id")]
    summary = {"checked": 0, "delivered": 0, "failed": 0, "deactivated": 0}
    for i in range(0, len(rows), 100):
        chunk = rows[i:i + 100]
        try:
            resp = requests.post(EXPO_RECEIPTS_URL, headers=_expo_headers(),
                                 json={"ids": [r["expo_ticket_id"] for r in chunk]}, timeout=15)
            receipts = (resp.json() or {}).get("data") or {}
        except Exception as exc:
            logger.warning("Expo receipts fetch failed: %s", type(exc).__name__)
            continue
        for row in chunk:
            receipt = receipts.get(row["expo_ticket_id"])
            if not receipt:
                continue  # not ready yet
            summary["checked"] += 1
            if receipt.get("status") == "ok":
                status = "DELIVERED_TO_PROVIDER"
                summary["delivered"] += 1
            else:
                err = (receipt.get("details") or {}).get("error") or "ReceiptError"
                status = f"FAILED_{err}"[:50]
                summary["failed"] += 1
                if err in PERMANENT_TOKEN_ERRORS and row.get("device_id"):
                    _mark_device_inactive(row["device_id"])
                    summary["deactivated"] += 1
                _alert_push_failure(err)
            supabase.table("notifications").update({"expo_response_status": status}).eq(
                "notification_id", row["notification_id"]).execute()
    return summary


def _log_notification(user_id, device_id, notification_type, title, body, data, expo_status, expo_ticket_id):
    """
    Log notification attempt to database for history/troubleshooting.
    """
    try:
        supabase = get_supabase()
        payload = {
            "user_id": int(user_id),
            "device_id": device_id,
            "notification_type": notification_type,
            "title": title,
            "body": body,
            "data": data,
            "expo_response_status": expo_status,
            "expo_ticket_id": expo_ticket_id
        }
        supabase.table("notifications").insert(payload).execute()
    except Exception as e:
        logger.error("Error logging notification: %s", e)


def _mark_device_inactive(device_id):
    """
    Mark a device as inactive when token is invalid/expired.
    """
    try:
        supabase = get_supabase()
        supabase.table("user_devices").update({
            "is_active": False,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("device_id", int(device_id)).execute()
    except Exception as e:
        logger.error("Error marking device inactive: %s", e)


def _update_device_last_used(device_id):
    """
    Update the last_used_at timestamp for a device.
    """
    try:
        supabase = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        supabase.table("user_devices").update({
            "last_used_at": now_iso,
            "updated_at": now_iso
        }).eq("device_id", int(device_id)).execute()
    except Exception as e:
        logger.error("Error updating device last_used_at: %s", e)


def send_notification_to_user(user_id, notification_type, notification_data=None):
    """
    Send a notification to a user.
    Always records the notification in public.notifications regardless of push device registration.
    Attempts Expo push delivery if active devices exist.
    """
    if notification_type in NOTIFICATION_TEMPLATES:
        template = NOTIFICATION_TEMPLATES[notification_type]
        title = (notification_data and notification_data.get("title")) or template.get("title", "")
        body = (notification_data and notification_data.get("body")) or template.get("body", "")
        data = dict(template.get("data", {}))
        if notification_data and "data" in notification_data and isinstance(notification_data["data"], dict):
            data.update(notification_data["data"])
    else:
        if not notification_data:
            return False, f"Unknown notification type '{notification_type}' and no data provided"

        title = notification_data.get("title", "TrustTrip")
        body = notification_data.get("body", "")
        data = dict(notification_data.get("data", {}))

    if notification_data and "priority" in notification_data:
        data["priority"] = notification_data["priority"]
    if notification_data and "deep_link" in notification_data:
        data["deep_link"] = notification_data["deep_link"]

    supabase = get_supabase()
    user_id = int(user_id)

    # 1. ALWAYS create the persistent in-app notification in Supabase first
    notif_payload = {
        "user_id": user_id,
        "notification_type": notification_type,
        "title": title,
        "body": body,
        "data": data,
        "is_read": False,
        "expo_response_status": "NO_DEVICE_TOKEN"
    }

    notification_id = None
    try:
        res = supabase.table("notifications").insert(notif_payload).execute()
        if res.data and len(res.data) > 0:
            notification_id = res.data[0].get("notification_id")
    except Exception as exc:
        logger.error("Error creating database notification for user %s: %s", user_id, exc)

    # 2. Attempt push delivery if active devices are registered
    devices = _get_active_devices(user_id)
    if not devices:
        logger.info("Notification saved to DB for user %s (no active push devices registered)", user_id)
        return True, {
            "database_saved": True,
            "push_sent": False,
            "notification_id": notification_id,
            "status": "NO_DEVICE_TOKEN",
            "message": "Notification saved to database (no device push token registered)"
        }

    sent_count = 0
    failed_count = 0
    last_ticket_id = None

    for device in devices:
        device_id = device.get("device_id")
        push_token = device.get("push_token")

        success, response = _send_to_expo_api(push_token, title, body, data)
        expo_status = "PUSH_SENT" if success else "PUSH_FAILED"
        expo_ticket_id = response.get("ticket_id") if success else None

        if success:
            last_ticket_id = expo_ticket_id
            sent_count += 1
            _update_device_last_used(device_id)
        else:
            failed_count += 1
            if response.get("permanent"):
                _mark_device_inactive(device_id)
            _alert_push_failure(response.get("error", "Unknown"))

        # Update the created notification row with delivery detail
        if notification_id:
            try:
                supabase.table("notifications").update({
                    "device_id": device_id,
                    "expo_response_status": expo_status,
                    "expo_ticket_id": expo_ticket_id
                }).eq("notification_id", notification_id).execute()
            except Exception as update_err:
                logger.warning("Could not update notification delivery status: %s", update_err)

    status_code = "PUSH_SENT" if sent_count > 0 else "PUSH_FAILED"
    return True, {
        "database_saved": True,
        "push_sent": sent_count > 0,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "ticket_id": last_ticket_id,
        "notification_id": notification_id,
        "status": status_code,
        "message": f"Notification saved to DB and push dispatched to {sent_count} device(s)"
    }


def get_user_notifications(user_id: int, category: str = "all", page: int = 1, page_size: int = 20):
    """
    Fetch paginated notifications for a specific user from public.notifications.
    Supports filtering by category (all, unread, emergency, safety, system, offers).
    """
    supabase = get_supabase()
    user_id = int(user_id)
    page = max(1, int(page))
    page_size = max(1, min(100, int(page_size)))
    offset = (page - 1) * page_size

    try:
        query = supabase.table("notifications").select("*", count="exact").eq("user_id", user_id)

        cat = (category or "all").strip().lower()
        if cat == "unread":
            query = query.eq("is_read", False)
        elif cat == "emergency":
            query = query.in_("notification_type", ["emergency", "sos", "emergency_alert", "sos_update"])
        elif cat == "safety":
            query = query.in_("notification_type", ["safety", "safety_alert", "crowd_alert", "hazard"])
        elif cat == "system":
            query = query.in_("notification_type", ["system", "system_update", "general", "general_announcement", "welcome", "complaint_submitted", "guide_requested"])
        elif cat == "offers":
            query = query.in_("notification_type", ["offer", "offers", "discount", "equipment_order"])

        query = query.order("created_at", desc=True).range(offset, offset + page_size - 1)
        res = query.execute()
        notifications = res.data or []
        total_count = res.count if res.count is not None else len(notifications)

        unread_count = get_unread_notification_count(user_id)

        return {
            "success": True,
            "notifications": notifications,
            "total": total_count,
            "unread_count": unread_count,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (total_count + page_size - 1) // page_size)
        }
    except Exception as e:
        logger.error("Error fetching user notifications for %s: %s", user_id, e)
        return {
            "success": False,
            "notifications": [],
            "total": 0,
            "unread_count": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 1,
            "error": str(e)
        }


def get_unread_notification_count(user_id: int) -> int:
    """
    Get unread notification count for a user.
    """
    supabase = get_supabase()
    try:
        res = (
            supabase.table("notifications")
            .select("notification_id", count="exact")
            .eq("user_id", int(user_id))
            .eq("is_read", False)
            .execute()
        )
        return res.count if res.count is not None else len(res.data or [])
    except Exception as e:
        logger.warning("Error fetching unread notification count for user %s: %s", user_id, e)
        return 0


def mark_notification_as_read(notification_id: int, user_id: int = None) -> bool:
    """
    Mark a single notification as read.
    """
    supabase = get_supabase()
    try:
        query = supabase.table("notifications").update({
            "is_read": True
        }).eq("notification_id", int(notification_id))
        if user_id is not None:
            query = query.eq("user_id", int(user_id))
        res = query.execute()
        return bool(res.data)
    except Exception as e:
        logger.error("Error marking notification %s as read: %s", notification_id, e)
        return False


def mark_all_notifications_as_read(user_id: int) -> int:
    """
    Mark all unread notifications for a user as read.
    """
    supabase = get_supabase()
    try:
        res = (
            supabase.table("notifications")
            .update({"is_read": True})
            .eq("user_id", int(user_id))
            .eq("is_read", False)
            .execute()
        )
        return len(res.data or [])
    except Exception as e:
        logger.error("Error marking all notifications as read for user %s: %s", user_id, e)
        return 0


def delete_notification(notification_id: int, user_id: int = None) -> bool:
    """
    Delete a notification by ID.
    """
    supabase = get_supabase()
    try:
        query = supabase.table("notifications").delete().eq("notification_id", int(notification_id))
        if user_id is not None:
            query = query.eq("user_id", int(user_id))
        res = query.execute()
        return bool(res.data)
    except Exception as e:
        logger.error("Error deleting notification %s: %s", notification_id, e)
        return False


def register_device(user_id, push_token, device_type="android", device_name=None):
    """
    Register a device push token for a user.
    """
    user_id = int(user_id)
    push_token = str(push_token).strip()
    if not is_valid_expo_token(push_token):
        return False, "Invalid Expo push token", None

    supabase = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Check if token already exists for this user
    existing_res = (
        supabase.table("user_devices")
        .select("device_id")
        .eq("user_id", user_id)
        .eq("push_token", push_token)
        .limit(1)
        .execute()
    )

    if existing_res.data:
        device_id = existing_res.data[0]["device_id"]
        supabase.table("user_devices").update({
            "is_active": True,
            "updated_at": now_iso,
            "device_type": device_type,
            "device_name": device_name
        }).eq("device_id", device_id).execute()
        return True, "Device token updated (already registered)", device_id

    # Deactivate token if it belongs to another user
    supabase.table("user_devices").update({
        "is_active": False,
        "updated_at": now_iso
    }).eq("push_token", push_token).execute()

    # Insert new device
    insert_res = supabase.table("user_devices").insert({
        "user_id": user_id,
        "push_token": push_token,
        "device_type": device_type,
        "device_name": device_name,
        "is_active": True
    }).execute()

    if not insert_res.data:
        return False, "Failed to register device", None

    device_id = insert_res.data[0]["device_id"]
    return True, "Device registered successfully", device_id


def deactivate_device(device_id, user_id):
    """
    Deactivate a device (soft delete).
    """
    user_id = int(user_id)
    device_id = int(device_id)

    supabase = get_supabase()
    existing_res = (
        supabase.table("user_devices")
        .select("device_id")
        .eq("device_id", device_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not existing_res.data:
        return False, "Device not found or access denied"

    now_iso = datetime.now(timezone.utc).isoformat()
    supabase.table("user_devices").update({
        "is_active": False,
        "updated_at": now_iso
    }).eq("device_id", device_id).execute()

    return True, "Device deactivated successfully"


def get_user_devices(user_id):
    """
    Get all devices for a user.
    """
    supabase = get_supabase()
    res = (
        supabase.table("user_devices")
        .select("device_id, push_token, device_type, device_name, is_active, created_at, updated_at, last_used_at")
        .eq("user_id", int(user_id))
        .order("updated_at", desc=True)
        .execute()
    )
    return res.data or []
