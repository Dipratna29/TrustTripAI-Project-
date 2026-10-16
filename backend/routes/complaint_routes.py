from flask import Blueprint, request, jsonify
from services.complaint_service import (
    create_complaint,
    get_complaints,
    get_user_id_by_username
)
from services.notification_service import send_notification_to_user
from services.auth_tokens import require_user, owns_username, forbidden_response

complaint_bp = Blueprint("complaint", __name__)


@complaint_bp.route("/complaint", methods=["POST"])
@complaint_bp.route("/complaints", methods=["POST"])
def add_complaint():
    data = request.get_json(silent=True) or {}

    try:
        # Create complaint and get ID
        complaint_id = create_complaint(data)
        
        # Get username from request
        username = data.get("username")
        
        # Trigger notification to user
        if username:
            user_id = get_user_id_by_username(username)
            if user_id:
                notification_data = {
                    "type": "complaint",
                    "complaint_id": complaint_id,
                    "screen": "MyComplaints"
                }
                send_notification_to_user(
                    user_id=user_id,
                    notification_type="complaint_submitted",
                    notification_data=notification_data
                )
        
        return jsonify({
            "success": True,
            "message": "Complaint stored successfully",
            "complaint_id": complaint_id,
            "data": {"id": complaint_id}
        }), 201
    
    except Exception as e:
        print(f"Error creating complaint: {e}")
        return jsonify({
            "success": False,
            "message": "Error storing complaint"
        }), 500


@complaint_bp.route("/user-complaints/<username>", methods=["GET"])
@complaint_bp.route("/complaints/user/<username>", methods=["GET"])
@complaint_bp.route("/complaints", methods=["GET"])
@require_user
def get_user_complaints_route(username=None):
    if not username:
        username = request.args.get("username")
    
    if not username:
        return jsonify({"success": False, "message": "Username is required"}), 400
    if not owns_username(username):
        return forbidden_response()

    complaints = get_complaints(username)
    return jsonify(complaints)