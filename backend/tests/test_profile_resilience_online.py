"""Backend checks for profile create/upsert persistence used by onboarding."""

import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv


load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    """Shared API client for profile endpoint checks."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def device_id():
    return f"TEST_resilience_{int(time.time())}"


def profile_payload(device_id: str, name: str):
    return {
        "device_id": device_id,
        "name": name,
        "age": 34,
        "gender": "female",
        "weight_kg": 65.0,
        "height_cm": 168.0,
        "activity_level": "light",
        "health_conditions": ["asthma"],
    }


# health endpoint for baseline API availability
def test_health_ok(api_client):
    response = api_client.get(f"{BASE_URL}/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# profile create then read verifies persistence
def test_profile_create_then_get(api_client, device_id):
    create_response = api_client.post(
        f"{BASE_URL}/api/profile", json=profile_payload(device_id, "TEST_Online Create")
    )
    assert create_response.status_code == 200

    created = create_response.json()
    assert created["device_id"] == device_id
    assert created["name"] == "TEST_Online Create"
    assert created["step_goal"] > 0

    get_response = api_client.get(f"{BASE_URL}/api/profile/{device_id}")
    assert get_response.status_code == 200
    saved = get_response.json()
    assert saved["name"] == "TEST_Online Create"
    assert saved["health_conditions"] == ["asthma"]


# profile upsert update then read verifies update persistence
def test_profile_upsert_then_get(api_client, device_id):
    update_response = api_client.post(
        f"{BASE_URL}/api/profile", json=profile_payload(device_id, "TEST_Online Updated")
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "TEST_Online Updated"

    verify_response = api_client.get(f"{BASE_URL}/api/profile/{device_id}")
    assert verify_response.status_code == 200
    verify = verify_response.json()
    assert verify["name"] == "TEST_Online Updated"
