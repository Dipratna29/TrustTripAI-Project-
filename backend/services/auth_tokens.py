"""
Signed session tokens for the TrustTrip mobile app.

Login/registration issue a token signed with SECRET_KEY. Protected routes use
@require_user and the ownership helpers so a client can only read or modify
its own data (previously any caller could pass an arbitrary user_id/username).
"""

import logging
from functools import wraps
from typing import Any, Dict, Optional

from flask import g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from config import Config

logger = logging.getLogger(__name__)

TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30  # 30 days
_SALT = "trusttrip-mobile-session"
_DEV_FALLBACK_SECRET = "trusttrip-dev-only-secret-change-me"


def _serializer() -> URLSafeTimedSerializer:
    secret = Config.SECRET_KEY or _DEV_FALLBACK_SECRET
    return URLSafeTimedSerializer(secret, salt=_SALT)


def issue_token(user_id: Any, username: str) -> str:
    return _serializer().dumps({"uid": int(user_id), "un": str(username)})


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        data = _serializer().loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
        if isinstance(data, dict) and "uid" in data and "un" in data:
            return data
    except SignatureExpired:
        logger.info("Expired session token presented")
    except BadSignature:
        logger.warning("Invalid session token presented")
    return None


def _token_from_request() -> Optional[str]:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def _unauthorized(message: str = "Please sign in again to continue."):
    return jsonify({"success": False, "error": "unauthorized", "message": message}), 401


def _forbidden():
    return jsonify({"success": False, "error": "forbidden", "message": "You are not allowed to access this resource."}), 403


def authenticate_request():
    """Validate the bearer token; sets g.user_id / g.username. Returns an error response or None."""
    if request.method == "OPTIONS":
        return None
    token = _token_from_request()
    claims = decode_token(token) if token else None
    if not claims:
        return _unauthorized()
    g.user_id = int(claims["uid"])
    g.username = str(claims["un"])
    return None


def require_user(fn):
    """Reject the request unless it carries a valid session token. Sets g.user_id / g.username."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        error = authenticate_request()
        if error:
            return error
        return fn(*args, **kwargs)

    return wrapper


def owns_user_id(user_id: Any) -> bool:
    try:
        return int(user_id) == int(g.user_id)
    except (TypeError, ValueError, AttributeError):
        return False


def owns_username(username: Any) -> bool:
    return bool(username) and str(username) == getattr(g, "username", None)


def forbidden_response():
    return _forbidden()
