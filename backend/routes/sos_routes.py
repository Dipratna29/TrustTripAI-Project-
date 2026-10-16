import logging

from flask import Blueprint, request, jsonify, g
from services.auth_tokens import require_user, decode_token
from services.sos_service import trigger_sos_alert, get_active_user_sos, cancel_user_sos

sos_bp = Blueprint("sos", __name__, url_prefix="/sos")


@sos_bp.route("/trigger", methods=["POST"])
def trigger_sos():
    """
    Handles distress beacon from Android mobile client.
    """
    data = request.get_json(silent=True) or {}
    # SOS stays available without a session (never block an emergency), but when the caller
    # is signed in the incident is attributed from the token, not from spoofable body fields.
    auth = request.headers.get("Authorization", "")
    claims = decode_token(auth[7:].strip()) if auth.lower().startswith("bearer ") else None
    if claims:
        data["user_id"] = int(claims["uid"])
        data["username"] = str(claims["un"])
    try:
        incident = trigger_sos_alert(data)
        return jsonify({
            "success": True,
            "message": "Emergency SOS broadcast dispatched. Authorities and local responders alerted.",
            "incident": incident
        }), 201
    except Exception:
        logging.getLogger(__name__).exception("SOS trigger failed")
        return jsonify({
            "success": False,
            "message": "Could not dispatch SOS. Call your local emergency number (112) immediately."
        }), 500


@sos_bp.route("/status/<identifier>", methods=["GET"])
@require_user
def get_sos_status(identifier):
    """
    Returns active SOS incident status for the signed-in user.
    """
    if identifier not in (str(g.user_id), g.username):
        return jsonify({"success": False, "message": "Not allowed"}), 403
    try:
        incident = get_active_user_sos(identifier)
    except RuntimeError:
        return jsonify({"success": False, "active_incident": None, "message": "SOS status unavailable"}), 503
    return jsonify({
        "success": True,
        "active_incident": incident
    })


@sos_bp.route("/cancel", methods=["POST"])
@require_user
def cancel_sos():
    """
    Cancels an active SOS alert.
    """
    data = request.get_json(silent=True) or {}
    incident_id = data.get("incident_id")
    username = g.username

    if not incident_id:
        return jsonify({"success": False, "message": "Incident ID is required"}), 400

    try:
        incident_id = int(incident_id)
    except (TypeError, ValueError):
        return jsonify({"success": False, "message": "Invalid incident ID"}), 400

    success = cancel_user_sos(incident_id, username, g.user_id)
    return jsonify({
        "success": success,
        "message": "SOS incident cancelled" if success else "Failed to cancel incident"
    })
