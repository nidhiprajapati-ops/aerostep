"""FitPace backend API tests - iteration 7"""
import pytest
import requests
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path('/app/frontend/.env'))
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
DEVICE_ID = "TEST_fitpace_iter6_device"


@pytest.fixture(scope="module")
def api():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module", autouse=True)
def cleanup(api):
    yield
    # cleanup test data
    try:
        api.delete(f"{BASE_URL}/api/profile/{DEVICE_ID}")
    except Exception:
        pass


# Health check
def test_health(api):
    r = api.get(f"{BASE_URL}/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"


# Root
def test_root(api):
    r = api.get(f"{BASE_URL}/api/")
    assert r.status_code == 200


# Profile create
def test_create_profile(api):
    r = api.post(f"{BASE_URL}/api/profile", json={
        "device_id": DEVICE_ID,
        "name": "TEST_User",
        "age": 30,
        "gender": "male",
        "weight_kg": 75.0,
        "height_cm": 175.0,
        "activity_level": "moderate",
        "health_conditions": []
    })
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "TEST_User"
    assert data["device_id"] == DEVICE_ID
    assert "step_goal" in data
    assert "calorie_goal" in data
    assert "bmr" in data


# Profile get
def test_get_profile(api):
    r = api.get(f"{BASE_URL}/api/profile/{DEVICE_ID}")
    assert r.status_code == 200
    data = r.json()
    assert data["device_id"] == DEVICE_ID


# Profile not found
def test_profile_not_found(api):
    r = api.get(f"{BASE_URL}/api/profile/nonexistent_device_xyz")
    assert r.status_code == 404


# Steps upsert
def test_post_steps(api):
    r = api.post(f"{BASE_URL}/api/steps", json={
        "device_id": DEVICE_ID,
        "date": "2025-01-15",
        "steps": 5000,
        "mode": "set",
        "source": "phone"
    })
    assert r.status_code == 200
    data = r.json()
    assert data["steps"] == 5000
    assert "calories" in data
    assert "distance_km" in data


# Get day steps
def test_get_day_steps(api):
    r = api.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/day/2025-01-15")
    assert r.status_code == 200
    data = r.json()
    assert data["steps"] == 5000


# History
def test_get_history(api):
    r = api.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/history?days=7")
    assert r.status_code == 200
    data = r.json()
    assert "days" in data
    assert "summary" in data
    assert len(data["days"]) == 7


# Achievements
def test_get_achievements(api):
    r = api.get(f"{BASE_URL}/api/achievements/{DEVICE_ID}")
    assert r.status_code == 200
    data = r.json()
    assert "current_streak" in data
    assert "badges" in data
    assert len(data["badges"]) == 9
