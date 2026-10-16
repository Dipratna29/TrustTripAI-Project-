"""
TrustTrip SMS delivery.

Providers (SMS_MODE env):
  * "twilio"   - real delivery via the Twilio REST API (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
                 TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID).
  * "simulate" - development only: nothing is sent, the result says status="simulated",
                 and the message body is never logged. Refused when ENVIRONMENT=production.
  * "auto"     - (default) Twilio when configured, otherwise status="not_configured".

A result is only `sent=True` when the provider accepted the message. Simulation is never
reported as sent. Failures raise a deduplicated SYSTEM alert in the admin notification center.

Indian DLT note: commercial SMS to Indian numbers requires a DLT-registered sender/template
on the Twilio account; unregistered traffic may be rejected by the carrier (error 30007/30034).
"""

import hashlib
import hmac
import logging
import os
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

E164 = re.compile(r"^\+[1-9]\d{7,14}$")
TWILIO_TIMEOUT_SECONDS = 10


@dataclass
class SmsResult:
    sent: bool
    status: str  # sent | simulated | not_configured | invalid_number | failed
    provider_id: Optional[str] = None
    error: Optional[str] = None

    def as_tuple(self) -> Tuple[bool, str]:
        return self.sent, self.status if not self.error else f"{self.status}: {self.error}"


def _cfg():
    return {
        "mode": os.environ.get("SMS_MODE", "auto").strip().lower(),
        "env": os.environ.get("ENVIRONMENT", "development").strip().lower(),
        "sid": os.environ.get("TWILIO_ACCOUNT_SID", "").strip(),
        "token": os.environ.get("TWILIO_AUTH_TOKEN", "").strip(),
        "from": os.environ.get("TWILIO_PHONE_NUMBER", "").strip(),
        "msid": os.environ.get("TWILIO_MESSAGING_SERVICE_SID", "").strip(),
    }


def twilio_configured() -> bool:
    c = _cfg()
    return bool(c["sid"] and c["token"] and (c["from"] or c["msid"]))


def validate_configuration() -> Optional[str]:
    """Return a human-readable configuration problem, or None when SMS can be delivered."""
    c = _cfg()
    if c["mode"] not in ("auto", "twilio", "simulate"):
        return "SMS_MODE must be auto, twilio or simulate"
    if c["mode"] == "simulate":
        return "SMS simulation is not allowed in production" if c["env"] == "production" else None
    if not twilio_configured():
        return "Twilio is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)"
    if c["from"] and not E164.match(c["from"]):
        return "TWILIO_PHONE_NUMBER must be in E.164 format, e.g. +14155550123"
    return None


def mask_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return f"+{digits[:2]}******{digits[-2:]}" if len(digits) >= 6 else "***"


def normalize_e164(phone: str) -> Optional[str]:
    if not phone:
        return None
    p = re.sub(r"[\s\-()]", "", str(phone).strip())
    if not p.startswith("+"):
        p = f"+{p}"
    return p if E164.match(p) else None


def _alert_failure(result: SmsResult, purpose: str) -> None:
    try:
        from services.admin_event_service import record_system_event
        hour = datetime.now(timezone.utc).strftime("%Y%m%d%H")
        record_system_event(
            "integration.sms_failed",
            "SMS delivery failing",
            f"{purpose} SMS could not be delivered ({result.status}). Check the Twilio configuration and account status.",
            dedup_key=f"sms_failed:{result.status}:{hour}",
            severity="WARNING",
            metadata={"channel": "sms", "provider": "twilio", "error_code": result.status, "component": purpose},
        )
    except Exception:
        logger.debug("SMS failure alert not recorded")


def send_sms(to_phone: str, message: str, purpose: str = "general") -> SmsResult:
    to = normalize_e164(to_phone)
    if not to:
        return SmsResult(False, "invalid_number", error="Phone number must be in international format, e.g. +919876543210")

    c = _cfg()
    if c["mode"] == "simulate":
        if c["env"] == "production":
            result = SmsResult(False, "not_configured", error="Simulation disabled in production")
            _alert_failure(result, purpose)
            return result
        logger.info("[SMS SIMULATED] %s message to %s (not delivered)", purpose, mask_phone(to))
        return SmsResult(False, "simulated")

    if not twilio_configured():
        logger.error("SMS not sent (%s): Twilio is not configured", purpose)
        result = SmsResult(False, "not_configured", error="SMS provider is not configured")
        _alert_failure(result, purpose)
        return result

    payload = {"To": to, "Body": message}
    if c["msid"]:
        payload["MessagingServiceSid"] = c["msid"]
    else:
        payload["From"] = c["from"]
    try:
        resp = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{c['sid']}/Messages.json",
            data=payload,
            auth=(c["sid"], c["token"]),
            timeout=TWILIO_TIMEOUT_SECONDS,
        )
    except requests.Timeout:
        result = SmsResult(False, "failed", error="timeout")
        logger.warning("Twilio timeout sending %s SMS to %s", purpose, mask_phone(to))
        _alert_failure(result, purpose)
        return result
    except requests.RequestException as exc:
        result = SmsResult(False, "failed", error=type(exc).__name__)
        logger.warning("Twilio network error sending %s SMS: %s", purpose, type(exc).__name__)
        _alert_failure(result, purpose)
        return result

    if resp.status_code in (200, 201):
        sid = (resp.json() or {}).get("sid")
        logger.info("Twilio accepted %s SMS to %s (sid %s)", purpose, mask_phone(to), sid)
        return SmsResult(True, "sent", provider_id=sid)

    try:
        err = resp.json() or {}
    except ValueError:
        err = {}
    code = str(err.get("code") or resp.status_code)
    logger.warning("Twilio rejected %s SMS to %s: code=%s", purpose, mask_phone(to), code)
    result = SmsResult(False, "failed", error=f"provider_error_{code}")
    _alert_failure(result, purpose)
    return result


def send_welcome_sms(to_phone: str, user_name: str) -> Tuple[bool, str]:
    first_name = (user_name or "Traveler").split()[0]
    message = (
        f"Welcome to TrustTrip, {first_name}! Your account has been created. "
        "Stay safe and travel smart with TrustTrip."
    )
    return send_sms(to_phone, message, purpose="welcome").as_tuple()


# ---------------------------------------------------------------------------
# One-time codes
# ---------------------------------------------------------------------------

def generate_otp(length: int = 6) -> str:
    """Cryptographically secure numeric code."""
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def _pepper() -> bytes:
    return (os.environ.get("SECRET_KEY") or "trusttrip-dev-only-secret-change-me").encode("utf-8")


def hash_otp(otp_code: str, context: str = "") -> str:
    """Keyed hash (HMAC-SHA256 with SECRET_KEY) so a leaked table cannot be brute-forced offline."""
    return hmac.new(_pepper(), f"{context}:{otp_code.strip()}".encode("utf-8"), hashlib.sha256).hexdigest()


def otp_matches(candidate: str, stored_hash: str, context: str = "") -> bool:
    if not candidate or not stored_hash:
        return False
    return hmac.compare_digest(hash_otp(candidate, context), stored_hash)


def send_otp_sms(to_phone: str, user_name: Optional[str] = None, purpose: str = "verification",
                 minutes: int = 10, context: str = "") -> Tuple[SmsResult, str, datetime]:
    """Generate, hash and send a code. Returns (result, code_hash, expires_at). The code itself is never returned or logged."""
    otp = generate_otp(6)
    hashed = hash_otp(otp, context)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    greeting = f"Hi {user_name.split()[0]}, " if user_name else ""
    message = f"{greeting}your TrustTrip {purpose} code is {otp}. It expires in {minutes} minutes. Never share this code."
    return send_sms(to_phone, message, purpose=purpose), hashed, expires_at


def verify_otp_hash(candidate_otp: str, stored_hash: str, expires_at: Optional[Any], context: str = "") -> Tuple[bool, str]:
    if not candidate_otp or not stored_hash:
        return False, "Code is required"
    if expires_at:
        exp = expires_at
        if isinstance(exp, str):
            exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > exp:
            return False, "Code has expired. Please request a new one."
    if otp_matches(candidate_otp, stored_hash, context):
        return True, "Code verified"
    return False, "Invalid code"
