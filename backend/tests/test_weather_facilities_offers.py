"""Live weather proxy (provider mocked), distance-aware facilities and date-valid offers."""

import os
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from services import offer_service, weather_service
from tests.fake_supabase import FakeSupabase

OPEN_METEO = {"current": {"time": "2026-10-16T14:00", "temperature_2m": 35.04, "apparent_temperature": 36.5,
                          "relative_humidity_2m": 34, "weather_code": 61, "wind_speed_10m": 11.5, "is_day": 1}}


def _resp(body, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = body
    r.raise_for_status.return_value = None
    return r


class WeatherTests(unittest.TestCase):
    def setUp(self):
        weather_service.clear_cache()
        self.client = app.test_client()

    def test_success_maps_wmo_code_and_caches(self):
        with patch.object(weather_service.requests, "get", return_value=_resp(OPEN_METEO)) as get:
            a = self.client.get("/weather?lat=16.6912&lon=74.4605").get_json()
            b = self.client.get("/weather?lat=16.6899&lon=74.4611").get_json()  # same ~1 km cell
        self.assertEqual((a["temperature_c"], a["condition"], a["icon"]), (35.0, "Light rain", "rainy"))
        self.assertFalse(a["cached"])
        self.assertTrue(b["cached"])
        self.assertEqual(get.call_count, 1)

    def test_falls_back_to_met_norway_when_open_meteo_is_blocked(self):
        met = {"properties": {"timeseries": [{"time": "2026-10-16T09:00:00Z", "data": {
            "instant": {"details": {"air_temperature": 34.6, "relative_humidity": 35.7, "wind_speed": 3.9}},
            "next_1_hours": {"summary": {"symbol_code": "heavyrain"}}}}]}}
        responses = [_resp({"reason": "Daily API request limit exceeded"}, 429), _resp(met)]
        with patch.object(weather_service.requests, "get", side_effect=responses) as get:
            body = self.client.get("/weather?lat=16.69&lon=74.46").get_json()
        self.assertEqual((body["provider"], body["temperature_c"], body["condition"], body["icon"]),
                         ("MET Norway", 34.6, "Heavy rain", "rainy"))
        self.assertEqual(body["wind_kph"], 14.0)
        self.assertIn("TrustTrip", get.call_args.kwargs["headers"]["User-Agent"])  # required by MET Norway

    def test_validation(self):
        self.assertEqual(self.client.get("/weather").status_code, 400)
        self.assertEqual(self.client.get("/weather?lat=95&lon=10").status_code, 400)
        self.assertEqual(self.client.get("/weather?lat=abc&lon=10").status_code, 400)

    def test_provider_failures_never_return_fake_values(self):
        with patch.object(weather_service.requests, "get", side_effect=requests.Timeout()):
            self.assertEqual(self.client.get("/weather?lat=10&lon=10").status_code, 504)
        weather_service.clear_cache()
        with patch.object(weather_service.requests, "get", side_effect=requests.ConnectionError()):
            r = self.client.get("/weather?lat=10&lon=10")
        self.assertEqual(r.status_code, 502)
        self.assertNotIn("temperature_c", r.get_json())
        with patch.object(weather_service.requests, "get", return_value=_resp({"current": {}})):
            self.assertEqual(self.client.get("/weather?lat=11&lon=10").status_code, 502)


class FacilityTests(unittest.TestCase):
    def setUp(self):
        old = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
        fresh = datetime.now(timezone.utc).isoformat()
        self.db = FakeSupabase({"facilities": [
            {"id": 1, "name": "Ichalkaranji Police", "category": "Police", "status": "ACTIVE", "is_verified": True,
             "latitude": 16.70, "longitude": 74.46, "updated_at": fresh},
            {"id": 2, "name": "Kolhapur Hospital", "category": "Hospital", "status": "ACTIVE", "is_verified": False,
             "latitude": 16.70, "longitude": 74.24, "updated_at": old},
            {"id": 3, "name": "Closed Clinic", "category": "Hospital", "status": "INACTIVE", "is_verified": True,
             "latitude": 16.69, "longitude": 74.46, "updated_at": fresh},
            {"id": 4, "name": "Colaba Police", "category": "Police", "status": "ACTIVE", "is_verified": True,
             "latitude": 18.91, "longitude": 72.81, "updated_at": fresh},
        ]})

    def test_sorted_by_distance_with_radius_and_flags(self):
        out = offer_service.list_public_facilities(None, 16.69, 74.46, 30, supabase=self.db)
        self.assertEqual([f["id"] for f in out], [1, 2])  # inactive and far-away excluded
        self.assertLess(out[0]["distance_km"], 2)
        self.assertTrue(out[0]["is_verified"] and not out[0]["is_stale"])
        self.assertTrue(out[1]["is_stale"] and not out[1]["is_verified"])

    def test_route_validation(self):
        client = app.test_client()
        self.assertEqual(client.get("/facilities?lat=10").status_code, 400)
        self.assertEqual(client.get("/facilities?lat=10&lon=500").status_code, 400)
        with patch.object(offer_service, "get_supabase", return_value=self.db):
            ids = [f["id"] for f in client.get("/facilities?category=police").get_json()]
        self.assertEqual(sorted(ids), [1, 4])


class OfferTests(unittest.TestCase):
    def test_only_published_and_currently_valid(self):
        today = date(2026, 10, 16)
        db = FakeSupabase({"offers": [
            {"id": 1, "title": "Live", "status": "PUBLISHED", "start_date": "2026-10-01", "end_date": "2026-10-20", "created_at": "3"},
            {"id": 2, "title": "Expired", "status": "PUBLISHED", "start_date": "2026-09-01", "end_date": "2026-10-15", "created_at": "2"},
            {"id": 3, "title": "Upcoming", "status": "PUBLISHED", "start_date": "2026-10-17", "end_date": None, "created_at": "1"},
            {"id": 4, "title": "Draft", "status": "DRAFT", "start_date": None, "end_date": None, "created_at": "4"},
            {"id": 5, "title": "Open ended", "status": "PUBLISHED", "start_date": None, "end_date": None, "created_at": "0"},
        ]})
        out = offer_service.list_active_offers(supabase=db, today=today)
        self.assertEqual([o["id"] for o in out], [1, 5])
        self.assertEqual(out[0]["days_left"], 4)
        self.assertIsNone(out[1]["days_left"])

    def test_route_error_is_503_not_empty_success(self):
        with patch.object(offer_service, "get_supabase", side_effect=Exception("db down")):
            self.assertEqual(app.test_client().get("/offers").status_code, 503)


if __name__ == "__main__":
    unittest.main()
