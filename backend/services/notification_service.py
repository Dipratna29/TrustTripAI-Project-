"""
Notification Service for TrustTrip
Handles Expo push notification delivery and logging using Supabase.
"""

import requests
import json
import logging
from datetime import datetime, timezone
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


def _send_to_expo_api(push_token, title, body, data=None):
    """
    Send a notification to Expo Push Service.
    """
    if not Config.EXPO_ACCESS_TOKEN:
        logger.warning("EXPO_ACCESS_TOKEN not configured. Notification not sent.")
        return False, {"error": "EXPO_ACCESS_TOKEN not configured"}

    expo_url = "https://exp.host/--/api/v2/push/send"

    headers = {
        "Host": "exp.host",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
    }

    payload = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "priority": "high",
    }

    if data:
        payload["data"] = data

    try:
        response = requests.post(
            expo_url,
            headers=headers,
            json=payload,
            timeout=10
        )
        response_data = response.json()

        if response.status_code == 200 and response_data.get("data"):
            ticket_id = response_data["data"].get("id")
            return True, {"ticket_id": ticket_id, "status": "queued"}
        else:
            return False, response_data

    except requests.exceptions.RequestException as e:
        logger.error("Expo API error: %s", e)
        return False, {"error": str(e)}


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
            error_str = str(response)
            if "invalid" in error_str.lower() or "expired" in error_str.lower():
                _mark_device_inactive(device_id)

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
