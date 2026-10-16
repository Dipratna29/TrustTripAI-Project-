# profile_service.py

import base64
import binascii
import logging
import time
from datetime import datetime, timezone
from database import get_supabase

logger = logging.getLogger(__name__)

AVATAR_BUCKET = "avatars"
MAX_PHOTO_BYTES = 2 * 1024 * 1024  # 2 MB after base64 decoding
ALLOWED_PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


class ProfilePhotoError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def get_profile_data(username):
    """Fetch user profile details by username without returning password."""
    supabase = get_supabase()
    res = supabase.table("users").select("*").eq("username", username).limit(1).execute()
    users = res.data

    if not users:
        return None

    user = dict(users[0])
    user.pop("password", None)
    return user


def update_profile(username, data):
    """Update profile fields for a user and return the refreshed profile."""
    if not data:
        data = {}

    supabase = get_supabase()
    payload = {
        "name": data.get("name"),
        "mob": data.get("mob"),
        "phone_number": data.get("phone_number") or data.get("mob"),
        "country_code": data.get("country_code"),
        "full_phone_number": data.get("full_phone_number"),
        "country": data.get("country") or data.get("nationality"),
        "address": data.get("address"),
        "nationality": data.get("nationality") or data.get("country"),
        "emergency_contact": data.get("emergency_contact"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    clean_payload = {k: v for k, v in payload.items() if v is not None}
    if clean_payload:
        try:
            supabase.table("users").update(clean_payload).eq("username", username).execute()
        except Exception as e:
            logger.warning("Extended profile update notice (%s), falling back to standard fields", e)
            standard_payload = {
                "name": data.get("name"),
                "mob": data.get("mob"),
                "address": data.get("address"),
                "nationality": data.get("nationality"),
                "emergency_contact": data.get("emergency_contact"),
            }
            clean_std = {k: v for k, v in standard_payload.items() if v is not None}
            supabase.table("users").update(clean_std).eq("username", username).execute()

    return get_profile_data(username)

def _ensure_avatar_bucket(supabase):
    try:
        supabase.storage.get_bucket(AVATAR_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(AVATAR_BUCKET, options={"public": True})
        except Exception as exc:
            logger.info("Avatar bucket create notice: %s", exc)


def update_profile_photo(username, image_base64, mime_type):
    """Upload (or clear, when image_base64 is None) the user's profile photo and store its public URL."""
    supabase = get_supabase()
    user = get_profile_data(username)
    if not user:
        raise ProfilePhotoError("Profile not found", 404)

    photo_url = None
    if image_base64:
        mime_type = (mime_type or "image/jpeg").lower()
        if mime_type not in ALLOWED_PHOTO_TYPES:
            raise ProfilePhotoError("Only JPEG, PNG or WEBP images are allowed")
        if "," in image_base64 and image_base64.strip().startswith("data:"):
            image_base64 = image_base64.split(",", 1)[1]
        try:
            raw = base64.b64decode(image_base64, validate=True)
        except (binascii.Error, ValueError):
            raise ProfilePhotoError("Invalid image data")
        if len(raw) > MAX_PHOTO_BYTES:
            raise ProfilePhotoError("Image is too large (max 2 MB)", 413)

        path = f"{user['user_id']}/avatar_{int(time.time())}.{ALLOWED_PHOTO_TYPES[mime_type]}"
        _ensure_avatar_bucket(supabase)
        try:
            supabase.storage.from_(AVATAR_BUCKET).upload(
                path, raw, {"content-type": mime_type, "upsert": "true"}
            )
            photo_url = supabase.storage.from_(AVATAR_BUCKET).get_public_url(path)
            if isinstance(photo_url, str):
                photo_url = photo_url.rstrip("?")
        except Exception as exc:
            logger.error("Avatar upload failed for %s: %s", username, exc)
            raise ProfilePhotoError("Could not store the photo. Please try again.", 502)

    try:
        supabase.table("users").update({
            "profile_photo_url": photo_url,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("username", username).execute()
    except Exception as exc:
        logger.error("profile_photo_url update failed (run migration 003?): %s", exc)
        raise ProfilePhotoError("Profile photo storage is not configured on the server.", 500)

    return get_profile_data(username)
