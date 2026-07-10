"""Regression tests for onboarding profile submit latency and persistence."""
import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv


load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    """Shared API session for profile submit flow checks."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def test_device_id():
    return f"TEST_profile_submit_{int(time.time())}"


def _profile_payload(device_id: str, name: str = "TEST Profile Submit"):
    return {
        "device_id": device_id,
        "name": name,
        "gender": "male",
        "age": 31,
        "weight_kg": 78.0,
        "height_cm": 178.0,
        "activity_level": "moderate",
        "health_conditions": ["asthma"],
    }


# Health + profile submit performance
def test_health_endpoint_ready(api_client):
    start = time.time()
    response = api_client.get(f"{BASE_URL}/api/health")
    elapsed = time.time() - start

    assert response.status_code == 200
    assert response.json().get("status") == "ok"
    assert elapsed < 1.5


# Profile create and persistence verification
def test_profile_create_fast_and_persisted(api_client, test_device_id):
    start = time.time()
    create_response = api_client.post(
        f"{BASE_URL}/api/profile",
        json=_profile_payload(test_device_id),
    )
    elapsed = time.time() - start

    assert create_response.status_code == 200
    create_data = create_response.json()
    assert create_data["device_id"] == test_device_id
    assert create_data["name"] == "TEST Profile Submit"
    assert "_id" not in create_data
    assert create_data["step_goal"] > 0
    assert create_data["calorie_goal"] > 0
    assert elapsed < 2.5

    get_response = api_client.get(f"{BASE_URL}/api/profile/{test_device_id}")
    assert get_response.status_code == 200
    get_data = get_response.json()
    assert get_data["name"] == "TEST Profile Submit"
    assert get_data["health_conditions"] == ["asthma"]


# Single-round-trip upsert correctness
def test_profile_upsert_updates_existing_doc(api_client, test_device_id):
    update_response = api_client.post(
        f"{BASE_URL}/api/profile",
        json=_profile_payload(test_device_id, name="TEST Profile Updated"),
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "TEST Profile Updated"

    verify_response = api_client.get(f"{BASE_URL}/api/profile/{test_device_id}")
    assert verify_response.status_code == 200
    verify_data = verify_response.json()
    assert verify_data["name"] == "TEST Profile Updated"
    assert verify_data["device_id"] == test_device_id
