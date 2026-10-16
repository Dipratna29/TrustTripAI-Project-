"""
Guard + helpers for the standalone integration scripts (test_*.py in backend/).

Those scripts create users, orders, SOS incidents, complaints, admin accounts and inventory
changes in whatever Supabase project SUPABASE_URL points to. They therefore only run when
explicitly enabled, ideally against a separate TEST Supabase project:

    set TRUSTTRIP_LIVE_TESTS=1
    set TEST_ADMIN_EMAIL=...        (an existing admin in the TEST project)
    set TEST_ADMIN_PASSWORD=...
    set TEST_TRAVELER_USERNAME=...  (an existing traveler in the TEST project)
    set TEST_TRAVELER_PASSWORD=...

Credentials are never stored in the repository.
"""

import os
import unittest


def require_live(*env_names: str) -> None:
    if os.environ.get("TRUSTTRIP_LIVE_TESTS") != "1":
        raise unittest.SkipTest(
            "Live integration test writes to the Supabase database. Set TRUSTTRIP_LIVE_TESTS=1 "
            "(use a separate test project) to run it."
        )
    missing = [n for n in env_names if not os.environ.get(n)]
    if missing:
        raise unittest.SkipTest(f"Missing environment variables: {', '.join(missing)}")


def login_traveler(client, username: str, password: str):
    """Log in through the real /login endpoint and make the client send the issued session token."""
    res = client.post("/login", json={"username": username, "password": password})
    data = res.get_json() or {}
    if res.status_code != 200 or not data.get("token"):
        raise AssertionError(f"Test traveler login failed ({res.status_code}): {data.get('message')}")
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {data['token']}"
    return data["user"]
