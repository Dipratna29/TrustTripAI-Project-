"""
Password recovery for TrustTrip's custom authentication (users.password is a Werkzeug hash;
the mobile app does not log in through Supabase Auth).

Flow: request (username or registered phone) -> 6-digit SMS code (stored only as an HMAC,
10-minute expiry, max 5 attempts, single use) -> confirm with code + new password.
Responses never reveal whether an account exists.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from werkzeug.security import generate_password_hash

from database import get_supabase
from services.rate_limit import RateLimiter
from services.sms_service import mask_phone, normalize_e164, otp_matches, send_otp_sms

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5
MAX_CODES_PER_HOUR = 3
GENERIC_REQUEST_MESSAGE = (
    "If an account matches, a 6-digit reset code has been sent by SMS to its registered phone number."
)
INVALID_CODE_MESSAGE = "The code is invalid or has expired. Request a new code and try again."

REQUEST_LIMITER = RateLimiter(max_calls=5, window_seconds=900)   # per identifier / per IP
CONFIRM_LIMITER = RateLimiter(max_calls=10, window_seconds=900)


class PasswordResetError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def validate_new_password(password: str, username: str = "") -> Optional[str]:
    if not isinstance(password, str) or len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password must be at most 128 characters."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Password must contain at least one letter and one number."
    if username and username.lower() in password.lower():
        return "Password must not contain your username."
    return None


def _find_user(sb, identifier: str) -> Optional[Dict[str, Any]]:
    ident = (identifier or "").strip()
    if not ident:
        return None
    res = sb.table("users").select("user_id, username, name, mob, full_phone_number, status").eq("username", ident).limit(1).execute()
    if res.data:
        return res.data[0]
    phone = normalize_e164(ident)
    if phone:
        for col in ("full_phone_number", "mob"):
            res = sb.table("users").select("user_id, username, name, mob, full_phone_number, status").eq(col, phone).limit(1).execute()
            if res.data:
                return res.data[0]
    return None


def request_reset(identifier: str, client_ip: str = "", supabase=None) -> str:
    """Always returns the same generic message (no account enumeration)."""
    key = (identifier or "").strip().lower()
    if not key:
        raise PasswordResetError("Enter your username or registered phone number.")
    if not REQUEST_LIMITER.allow(f"id:{key}") or not REQUEST_LIMITER.allow(f"ip:{client_ip}"):
        raise PasswordResetError("Too many reset requests. Please wait 15 minutes and try again.", 429)

    sb = supabase or get_supabase()
    user = _find_user(sb, identifier)
    if not user or str(user.get("status") or "ACTIVE").upper() != "ACTIVE":
        return GENERIC_REQUEST_MESSAGE
    phone = normalize_e164(user.get("full_phone_number") or user.get("mob") or "")
    if not phone:
        logger.info("Password reset requested for user %s without a valid phone", user["user_id"])
        return GENERIC_REQUEST_MESSAGE

    now = datetime.now(timezone.utc)
    recent = (
        sb.table("password_reset_codes").select("id", count="exact")
        .eq("user_id", user["user_id"]).gte("created_at", (now - timedelta(hours=1)).isoformat()).execute()
    )
    if (recent.count or 0) >= MAX_CODES_PER_HOUR:
        logger.warning("Password reset hourly limit reached for user %s", user["user_id"])
        return GENERIC_REQUEST_MESSAGE

    result, code_hash, expires_at = send_otp_sms(
        phone, user.get("name"), purpose="password reset", minutes=CODE_TTL_MINUTES, context=f"reset:{user['user_id']}"
    )
    if not result.sent:
        # Do not store a code the user never received; the admin center gets an SMS failure alert
        logger.error("Password reset SMS not delivered to %s (%s)", mask_phone(phone), result.status)
        return GENERIC_REQUEST_MESSAGE

    # Only the newest code is valid
    sb.table("password_reset_codes").update({"consumed_at": now.isoformat()}).eq("user_id", user["user_id"]).is_("consumed_at", "null").execute()
    sb.table("password_reset_codes").insert({
        "user_id": user["user_id"],
        "code_hash": code_hash,
        "expires_at": expires_at.isoformat(),
        "attempts": 0,
        "created_at": now.isoformat(),
    }).execute()
    return GENERIC_REQUEST_MESSAGE


def confirm_reset(identifier: str, code: str, new_password: str, client_ip: str = "", supabase=None) -> None:
    if not CONFIRM_LIMITER.allow(f"ip:{client_ip}") or not CONFIRM_LIMITER.allow(f"id:{(identifier or '').strip().lower()}"):
        raise PasswordResetError("Too many attempts. Please wait 15 minutes and try again.", 429)
    code = (code or "").strip()
    if not re.fullmatch(r"\d{6}", code):
        raise PasswordResetError("Enter the 6-digit code from the SMS.")

    sb = supabase or get_supabase()
    user = _find_user(sb, identifier)
    if not user:
        raise PasswordResetError(INVALID_CODE_MESSAGE)
    problem = validate_new_password(new_password, user.get("username", ""))
    if problem:
        raise PasswordResetError(problem)

    now = datetime.now(timezone.utc)
    res = (
        sb.table("password_reset_codes").select("*").eq("user_id", user["user_id"]).is_("consumed_at", "null")
        .order("created_at", desc=True).limit(1).execute()
    )
    row = res.data[0] if res.data else None
    if not row:
        raise PasswordResetError(INVALID_CODE_MESSAGE)
    expires = datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00"))
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires or int(row.get("attempts") or 0) >= MAX_ATTEMPTS:
        sb.table("password_reset_codes").update({"consumed_at": now.isoformat()}).eq("id", row["id"]).execute()
        raise PasswordResetError(INVALID_CODE_MESSAGE)

    if not otp_matches(code, row["code_hash"], context=f"reset:{user['user_id']}"):
        attempts = int(row.get("attempts") or 0) + 1
        update = {"attempts": attempts}
        if attempts >= MAX_ATTEMPTS:
            update["consumed_at"] = now.isoformat()
        sb.table("password_reset_codes").update(update).eq("id", row["id"]).execute()
        raise PasswordResetError(INVALID_CODE_MESSAGE)

    # Single use: consume first (guarded on consumed_at IS NULL) so a replay cannot win a race
    consumed = (
        sb.table("password_reset_codes").update({"consumed_at": now.isoformat()})
        .eq("id", row["id"]).is_("consumed_at", "null").execute()
    )
    if not consumed.data:
        raise PasswordResetError(INVALID_CODE_MESSAGE)

    sb.table("users").update({
        "password": generate_password_hash(new_password),
        "updated_at": now.isoformat(),
    }).eq("user_id", user["user_id"]).execute()
    logger.info("Password reset completed for user %s", user["user_id"])
