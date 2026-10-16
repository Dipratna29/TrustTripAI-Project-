from flask import Blueprint, request, jsonify
from services.admin_service import admin_required
from services.crowd_service import (
    get_locations_with_counts,
    record_user_location,
    get_location_history,
)

crowd_bp = Blueprint("crowd", __name__)


@crowd_bp.route("/crowd/locations", methods=["GET"])
def list_locations():
    data = get_locations_with_counts()
    return jsonify(data)


@crowd_bp.route("/crowd/location-update", methods=["POST"])
def location_update():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    lat = data.get("latitude")
    lon = data.get("longitude")

    if not user_id or lat is None or lon is None:
        return jsonify({"success": False, "message": "user_id, latitude and longitude are required"}), 400

    try:
        record_user_location(user_id, float(lat), float(lon))
        return jsonify({"success": True, "message": "Location recorded"})
    except Exception:
        return jsonify({"success": False, "message": "Could not record location"}), 500


@crowd_bp.route("/crowd/history/<int:location_id>", methods=["GET"])
def history(location_id):
    try:
        data = get_location_history(location_id)
        return jsonify(data)
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500



@crowd_bp.route('/crowd/settings', methods=['GET'])
def crowd_settings():
    from services.crowd_service import get_update_interval_minutes
    return jsonify({'update_interval_minutes': get_update_interval_minutes()})


@crowd_bp.route('/crowd/settings', methods=['PUT'])
@admin_required()
def update_crowd_settings():
    # Admin-only: previously anyone could change crowd monitoring settings
    data = request.get_json(silent=True) or {}
    key = data.get('key')
    value = data.get('value')
    if not key or value is None:
        return jsonify({'success': False, 'message': 'key and value required'}), 400

    try:
        from services.crowd_service import set_crowd_setting
        set_crowd_setting(key, str(value))
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
