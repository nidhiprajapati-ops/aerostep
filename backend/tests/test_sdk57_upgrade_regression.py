"""SDK 57 regression tests for core backend APIs used by upgraded Expo app."""
import os
from pathlib import Path
from uuid import uuid4

import pytest
import requests
from dotenv import load_dotenv

# Use public URL from frontend env for real ingress-path testing.
load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

if not BASE_URL:
    pytest.skip("EXPO_PUBLIC_BACKEND_URL missing", allow_module_level=True)

DEVICE_ID = f"TEST_sdk57_{uuid4().hex[:10]}"


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# Health and routing feature coverage.
def test_health_and_root(api_client):
    health = api_client.get(f"{BASE_URL}/api/health", timeout=10)
    assert health.status_code == 200
    assert health.json().get("status") == "ok"

    root = api_client.get(f"{BASE_URL}/api/", timeout=10)
    assert root.status_code == 200
    assert root.json().get("message") == "AeroStep API"


# Profile create->get->update persistence coverage.
def test_profile_create_get_update_flow(api_client):
    create_payload = {
        "device_id": DEVICE_ID,
        "name": "TEST SDK57 User",
        "age": 34,
        "gender": "female",
        "weight_kg": 64.0,
        "height_cm": 168.0,
        "activity_level": "moderate",
        "health_conditions": ["asthma"],
    }

    create_res = api_client.post(f"{BASE_URL}/api/profile", json=create_payload, timeout=15)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["device_id"] == DEVICE_ID
    assert created["name"] == "TEST SDK57 User"
    assert created["step_goal"] >= 3000

    get_res = api_client.get(f"{BASE_URL}/api/profile/{DEVICE_ID}", timeout=10)
    assert get_res.status_code == 200
    fetched = get_res.json()
    assert fetched["name"] == "TEST SDK57 User"
    assert fetched["activity_level"] == "moderate"

    update_payload = {
        **create_payload,
        "name": "TEST SDK57 User Updated",
        "activity_level": "active",
        "health_conditions": ["asthma", "joint_pain"],
    }
    update_res = api_client.post(f"{BASE_URL}/api/profile", json=update_payload, timeout=15)
    assert update_res.status_code == 200

    verify_res = api_client.get(f"{BASE_URL}/api/profile/{DEVICE_ID}", timeout=10)
    assert verify_res.status_code == 200
    verified = verify_res.json()
    assert verified["name"] == "TEST SDK57 User Updated"
    assert verified["activity_level"] == "active"


# Steps and achievements flow coverage.
def test_steps_and_achievements_flow(api_client):
    day = "2026-01-10"

    set_res = api_client.post(
        f"{BASE_URL}/api/steps",
        json={
            "device_id": DEVICE_ID,
            "date": day,
            "steps": 3200,
            "mode": "set",
            "source": "phone",
        },
        timeout=15,
    )
    assert set_res.status_code == 200
    assert set_res.json()["steps"] == 3200

    inc_res = api_client.post(
        f"{BASE_URL}/api/steps",
        json={
            "device_id": DEVICE_ID,
            "date": day,
            "steps": 800,
            "mode": "increment",
            "source": "phone",
        },
        timeout=15,
    )
    assert inc_res.status_code == 200

    day_res = api_client.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/day/{day}", timeout=10)
    assert day_res.status_code == 200
    assert day_res.json()["steps"] == 4000

    history_res = api_client.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/history?days=7&end={day}", timeout=10)
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history["days"]) == 7
    assert "summary" in history

    achievements_res = api_client.get(f"{BASE_URL}/api/achievements/{DEVICE_ID}?date={day}", timeout=10)
    assert achievements_res.status_code == 200
    achievements = achievements_res.json()
    assert isinstance(achievements.get("badges"), list)
    assert "current_streak" in achievements
