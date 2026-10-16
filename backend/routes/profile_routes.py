from flask import Blueprint, request, jsonify
from services.auth_tokens import require_user, owns_username, forbidden_response
from services.profile_service import get_profile_data, update_profile, update_profile_photo, ProfilePhotoError

profile_bp = Blueprint("profile", __name__)


@profile_bp.route("/profile/<username>", methods=["GET"])
@require_user
def get_profile(username):
    if not owns_username(username):
        return forbidden_response()
    user = get_profile_data(username)
    if not user:
        return jsonify({"success": False, "message": "Profile not found"}), 404
    return jsonify(user)


@profile_bp.route("/profile/<username>", methods=["PUT", "PATCH"])
@require_user
def update_user_profile(username):
    if not owns_username(username):
        return forbidden_response()
    data = request.get_json(silent=True) or {}
    updated = update_profile(username, data)
    return jsonify({
        "success": True,
        "message": "Profile updated successfully",
        "user": updated
    })


@profile_bp.route("/profile/<username>/photo", methods=["POST", "DELETE"])
@require_user
def profile_photo(username):
    if not owns_username(username):
        return forbidden_response()

    if request.method == "DELETE":
        updated = update_profile_photo(username, None, None)
        return jsonify({"success": True, "message": "Profile photo removed", "user": updated})

    data = request.get_json(silent=True) or {}
    try:
        updated = update_profile_photo(username, data.get("image_base64"), data.get("mime_type"))
    except ProfilePhotoError as err:
        return jsonify({"success": False, "message": str(err)}), err.status
    return jsonify({
        "success": True,
        "message": "Profile photo updated",
        "profile_photo_url": (updated or {}).get("profile_photo_url"),
        "user": updated,
    })
