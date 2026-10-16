import logging

from flask import Blueprint, request, jsonify
from services.translate_service import translate_text, MAX_TEXT_LENGTH

logger = logging.getLogger(__name__)

translate_bp = Blueprint("translate", __name__)


@translate_bp.route("/translate", methods=["POST"])
def translate():
    data = request.get_json(silent=True) or {}

    text = str(data.get("text") or "").strip()
    # Accept both the legacy keys (source/target) and the mobile app keys (source_language/target_language)
    source = data.get("source_language") or data.get("source") or "auto"
    target = data.get("target_language") or data.get("target")

    if not text:
        return jsonify({"success": False, "message": "Text is required"}), 400
    if not target:
        return jsonify({"success": False, "message": "Target language is required"}), 400
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({"success": False, "message": f"Text is too long (max {MAX_TEXT_LENGTH} characters)"}), 400

    try:
        translated = translate_text(text, source, target)
    except ValueError as err:
        return jsonify({"success": False, "message": str(err)}), 400
    except Exception as exc:
        logger.warning("Translation provider error: %s", exc)
        return jsonify({
            "success": False,
            "message": "Translation service is temporarily unavailable. Please try again."
        }), 502

    return jsonify({
        "success": True,
        "translation": translated,
        "translated_text": translated,
        "source_language": source,
        "target_language": target,
    })
