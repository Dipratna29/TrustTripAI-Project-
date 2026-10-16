"""
Cloud OCR fallback for visual translation (used only when on-device ML Kit is unavailable).
Provider: OCR.space (set OCR_SPACE_API_KEY). The image is validated, size-limited, sent to
the provider and never stored. Requires a signed-in traveler.
"""

import base64
import binascii
import logging

import requests
from flask import Blueprint, g, jsonify, request

from config import Config
from services.auth_tokens import require_user
from services.rate_limit import RateLimiter

logger = logging.getLogger(__name__)

ocr_bp = Blueprint("ocr", __name__)

MAX_IMAGE_BYTES = 3 * 1024 * 1024
OCR_LIMITER = RateLimiter(max_calls=20, window_seconds=600)
OCR_SPACE_URL = "https://api.ocr.space/parse/image"

# OCR.space engine-2 language codes for the languages the app offers
LANGUAGE_MAP = {
    "auto": "auto", "en": "eng", "hi": "hin", "mr": "mar", "fr": "fre", "de": "ger", "es": "spa",
    "ja": "jpn", "ko": "kor", "zh": "chs", "zh-CN": "chs", "ta": "tam", "te": "tel", "bn": "ben",
    "kn": "kan", "gu": "guj",
}

_MAGIC = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG\r\n\x1a\n": "image/png", b"RIFF": "image/webp"}


def _sniff(raw: bytes):
    for magic, mime in _MAGIC.items():
        if raw.startswith(magic):
            if mime == "image/webp" and raw[8:12] != b"WEBP":
                continue
            return mime
    return None


@ocr_bp.route("/ocr", methods=["POST"])
@require_user
def ocr():
    if not Config.OCR_SPACE_API_KEY:
        return jsonify({"success": False, "message": "Cloud text recognition is not configured on the server."}), 503

    if not OCR_LIMITER.allow(f"user:{g.user_id}"):
        return jsonify({"success": False, "message": "Too many photos in a short time. Please wait a few minutes."}), 429

    data = request.get_json(silent=True) or {}
    b64 = str(data.get("image_base64") or "")
    if b64.startswith("data:") and "," in b64:
        b64 = b64.split(",", 1)[1]
    if not b64:
        return jsonify({"success": False, "message": "No image provided."}), 400
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        return jsonify({"success": False, "message": "Invalid image data."}), 400
    if len(raw) > MAX_IMAGE_BYTES:
        return jsonify({"success": False, "message": "Image is too large (max 3 MB)."}), 413
    mime = _sniff(raw)
    if not mime:
        return jsonify({"success": False, "message": "Unsupported image type. Use JPG, PNG or WEBP."}), 400

    language = LANGUAGE_MAP.get(str(data.get("language") or "auto"), "auto")
    try:
        resp = requests.post(
            OCR_SPACE_URL,
            data={
                "apikey": Config.OCR_SPACE_API_KEY,
                "language": language,
                "OCREngine": "2",
                "scale": "true",
                "detectOrientation": "true",
                "base64Image": f"data:{mime};base64,{b64}",
            },
            timeout=40,
        )
        resp.raise_for_status()
        payload = resp.json()
    except requests.Timeout:
        return jsonify({"success": False, "message": "Text recognition timed out. Please try again."}), 504
    except Exception as exc:
        logger.warning("OCR provider error: %s", type(exc).__name__)
        return jsonify({"success": False, "message": "Text recognition service is unavailable right now."}), 502

    if payload.get("IsErroredOnProcessing"):
        logger.warning("OCR provider rejected image: %s", str(payload.get("ErrorMessage"))[:200])
        return jsonify({"success": False, "message": "The text recognition service could not read this image."}), 422

    blocks = []
    for result in payload.get("ParsedResults") or []:
        text = (result.get("ParsedText") or "").replace("\r\n", "\n").strip()
        if text:
            blocks.append({"text": text})
    full_text = "\n".join(b["text"] for b in blocks)
    return jsonify({"success": True, "text": full_text, "blocks": blocks, "engine": "ocr.space"})
