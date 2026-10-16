"""
TrustTrip Mobile Authentication Service
Handles:
1. User registration with country code, normalized phone, and welcome SMS
2. Secure password hashing with Werkzeug
3. Supabase Auth account provisioning
4. Real database status verification and account suspension enforcement
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_supabase
from services.sms_service import send_welcome_sms

logger = logging.getLogger(__name__)


def _verify_password(stored_password: str, candidate_password: str) -> bool:
    """Verify a password, supporting both hashed and legacy plaintext values."""
    if not stored_password or not candidate_password:
        return False

    if stored_password.startswith("pbkdf2:sha256") or stored_password.startswith("scrypt"):
        try:
            return check_password_hash(stored_password, candidate_password)
        except ValueError:
            return False

    return stored_password == candidate_password


def normalize_phone(country_code: Optional[str], phone: Optional[str], fallback_mob: Optional[str] = None) -> Tuple[str, str, str]:
    """
    Normalizes country code, phone number, and full international phone number.
    Returns: (country_code, phone_number, full_phone_number)
    """
    raw_phone = str(phone or fallback_mob or "").strip()
    raw_code = str(country_code or "").strip()

    digits_only = "".join(c for c in raw_phone if c.isdigit())

    if not raw_code:
        if raw_phone.startswith("+"):
            if raw_phone.startswith("+91") and len(digits_only) >= 12:
                raw_code = "+91"
                digits_only = digits_only[2:]
            elif raw_phone.startswith("+1") and len(digits_only) >= 11:
                raw_code = "+1"
                digits_only = digits_only[1:]
            elif raw_phone.startswith("+44") and len(digits_only) >= 12:
                raw_code = "+44"
                digits_only = digits_only[2:]
            else:
                raw_code = "+91"
        else:
            raw_code = "+91"

    if not raw_code.startswith("+"):
        raw_code = f"+{raw_code}"

    full_num = f"{raw_code}{digits_only}" if digits_only else ""
    return raw_code, digits_only, full_num


def register_user(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Registers a new traveler in Supabase PostgreSQL:
    1. Validates required fields and uniqueness
    2. Hashes password securely
    3. Normalizes international phone number
    4. Creates Supabase Auth account
    5. Inserts into Supabase users table
    6. Dispatches Welcome SMS
    """
    if not data:
        raise ValueError("No registration data provided")

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    name = str(data.get("name", "")).strip()

    if not username:
        raise ValueError("Username is required")
    if not password:
        raise ValueError("Password is required")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")

    country_code, phone_number, full_phone = normalize_phone(
        data.get("country_code"),
        data.get("phone_number"),
        data.get("mob")
    )

    if phone_number and (len(phone_number) < 7 or len(phone_number) > 15):
        raise ValueError("Please provide a valid phone number (7 to 15 digits)")

    country = str(data.get("country") or data.get("nationality") or "India").strip()
    address = str(data.get("address") or "").strip()
    emergency_contact = str(data.get("emergency_contact") or "").strip()

    supabase = get_supabase()

    # 1. Check duplicate username
    try:
        existing_u = supabase.table("users").select("user_id").eq("username", username).limit(1).execute()
        if existing_u.data:
            raise ValueError(f"Username '@{username}' is already registered. Please choose another username.")
    except ValueError:
        raise
    except Exception as e:
        logger.warning("Username check notice: %s", e)

    # 2. Check duplicate phone if provided
    if full_phone or phone_number:
        try:
            p_check_val = full_phone or phone_number
            existing_p = supabase.table("users").select("user_id").or_(
                f"mob.eq.{p_check_val},mob.eq.{phone_number}"
            ).limit(1).execute()
            if existing_p.data:
                raise ValueError(f"Mobile number '{p_check_val}' is already associated with an account.")
        except ValueError:
            raise
        except Exception as e:
            logger.warning("Phone check notice: %s", e)

    # 3. Create or synchronize Supabase Auth user
    auth_email = str(data.get("email") or f"{username.lower()}@trusttrip.app").strip().lower()
    try:
        supabase.auth.admin.create_user({
            "email": auth_email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "username": username,
                "name": name or username,
                "phone": full_phone
            }
        })
        logger.info("Supabase Auth user created for %s (%s)", username, auth_email)
    except Exception as auth_exc:
        logger.info("Supabase Auth account sync notice for %s: %s", auth_email, auth_exc)

    # 4. Hash password for local database verification
    hashed_password = generate_password_hash(password)

    # 5. Insert user record into Supabase public.users table
    payload = {
        "username": username,
        "password": hashed_password,
        "name": name or username,
        "mob": full_phone or phone_number,
        "address": address,
        "nationality": country,
        "emergency_contact": emergency_contact,
        "status": "ACTIVE"
    }

    user_record = None
    try:
        extended_payload = {
            **payload,
            "country": country,
            "country_code": country_code,
            "phone_number": phone_number,
            "full_phone_number": full_phone,
            "phone_verified": False,
        }
        res = supabase.table("users").insert(extended_payload).execute()
        user_record = res.data[0] if res.data else None
    except Exception as ext_err:
        logger.warning("Extended users columns insert notice (%s), falling back to standard payload", ext_err)
        try:
            res = supabase.table("users").insert(payload).execute()
            user_record = res.data[0] if res.data else None
        except Exception as std_err:
            logger.error("Standard user insert error: %s", std_err)
            raise RuntimeError(f"Could not register user: {std_err}")

    if not user_record:
        raise RuntimeError("Failed to create user record in database")

    # 6. Dispatch Welcome SMS after successful database creation
    sms_sent = False
    sms_status = "No phone number provided"
    if full_phone:
        try:
            sms_sent, sms_status = send_welcome_sms(full_phone, name or username)
        except Exception as sms_err:
            logger.error("Welcome SMS error for %s: %s", full_phone, sms_err)
            sms_status = f"SMS notice: {sms_err}"

    return {
        "user_id": user_record.get("user_id"),
        "username": username,
        "name": name or username,
        "full_phone_number": full_phone or phone_number,
        "sms_sent": sms_sent,
        "sms_status": sms_status
    }


def login_user(data: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Authenticates user and verifies account status directly from Supabase:
    Returns (user_dict, error_message)
    """
    if not data:
        return None, "No login credentials provided"

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return None, "Username and password are required"

    supabase = get_supabase()

    try:
        res = supabase.table("users").select("*").eq("username", username).limit(1).execute()
        users = res.data or []
    except Exception as e:
        logger.error("Error querying user for login: %s", e)
        return None, "Authentication service currently unavailable"

    if not users:
        return None, "Invalid username or password"

    user = users[0]

    # Verify password
    if not _verify_password(user.get("password", ""), password):
        return None, "Invalid username or password"

    # Verify account status directly from database
    status = str(user.get("status") or "ACTIVE").upper()
    if status in ("SUSPENDED", "INACTIVE", "DEACTIVATED", "DELETED"):
        logger.warning("User %s attempted login but account status is %s", username, status)
        return None, f"Your account has been {status.lower()} by the administrator. Please contact support@trusttrip.com"

    # Update last_login_at timestamp; upgrade any legacy plaintext password to a hash
    try:
        login_update = {"last_login_at": datetime.now(timezone.utc).isoformat()}
        stored = str(user.get("password") or "")
        if stored and not (stored.startswith("pbkdf2:sha256") or stored.startswith("scrypt")):
            login_update["password"] = generate_password_hash(password)
        supabase.table("users").update(login_update).eq("user_id", user.get("user_id")).execute()
    except Exception:
        pass

    # Clean password from response
    user_clean = dict(user)
    user_clean.pop("password", None)
    user_clean["status"] = status
    return user_clean, None