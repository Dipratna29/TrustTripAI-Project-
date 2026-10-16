import logging

from flask import Blueprint, jsonify, request

from services.offer_service import list_active_offers, list_public_facilities
from services.weather_service import WeatherError, get_current_weather

logger = logging.getLogger(__name__)

offer_bp = Blueprint("public_offers", __name__)


def _float_arg(name, low, high):
    raw = request.args.get(name)
    if raw in (None, ""):
        return None
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{name} must be a number")
    if not low <= value <= high:
        raise ValueError(f"{name} is out of range")
    return value


@offer_bp.route("/offers", methods=["GET"])
def get_offers():
    """Currently valid promotional offers (published and within their validity dates)."""
    try:
        return jsonify(list_active_offers())
    except RuntimeError:
        return jsonify({"success": False, "message": "Could not load offers"}), 503


@offer_bp.route("/facilities", methods=["GET"])
def get_facilities():
    """Active safety facilities; pass lat, lon (and radius_km) to sort/filter by distance."""
    try:
        lat = _float_arg("lat", -90, 90)
        lon = _float_arg("lon", -180, 180)
        radius = _float_arg("radius_km", 0.1, 100)
    except ValueError as err:
        return jsonify({"success": False, "message": str(err)}), 400
    if (lat is None) != (lon is None):
        return jsonify({"success": False, "message": "lat and lon must be provided together"}), 400
    try:
        return jsonify(list_public_facilities(request.args.get("category"), lat, lon, radius))
    except RuntimeError:
        return jsonify({"success": False, "message": "Could not load facilities"}), 503


@offer_bp.route("/weather", methods=["GET"])
def get_weather():
    """Current weather for the traveler's coordinates (Open-Meteo, cached)."""
    try:
        lat = _float_arg("lat", -90, 90)
        lon = _float_arg("lon", -180, 180)
    except ValueError as err:
        return jsonify({"success": False, "message": str(err)}), 400
    if lat is None or lon is None:
        return jsonify({"success": False, "message": "lat and lon are required"}), 400
    try:
        return jsonify({"success": True, **get_current_weather(lat, lon)})
    except WeatherError as err:
        return jsonify({"success": False, "message": str(err)}), err.status
