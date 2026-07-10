"""Tests for routing regression fix and core API endpoints."""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

DEVICE_ID = "TEST_routing_fix_device_001"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def cleanup(session):
    yield
    # cleanup
    session.delete(f"{BASE_URL}/api/profile/{DEVICE_ID}", timeout=5)


class TestHealth:
    def test_health_check(self, session):
        r = session.get(f"{BASE_URL}/api/health", timeout=5)
        assert r.status_code == 200

    def test_root(self, session):
        r = session.get(f"{BASE_URL}/api/", timeout=5)
        assert r.status_code == 200


class TestProfile:
    def test_create_profile(self, session):
        payload = {
            "device_id": DEVICE_ID,
            "name": "TEST User",
            "gender": "male",
            "age": 28,
            "weight_kg": 75.0,
            "height_cm": 175.0,
            "activity_level": "moderate",
            "health_conditions": []
        }
        r = session.post(f"{BASE_URL}/api/profile", json=payload, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST User"
        assert data["step_goal"] > 0
        assert data["bmr"] > 0

    def test_get_profile(self, session):
        r = session.get(f"{BASE_URL}/api/profile/{DEVICE_ID}", timeout=5)
        assert r.status_code == 200
        data = r.json()
        assert data["device_id"] == DEVICE_ID

    def test_update_profile(self, session):
        payload = {
            "device_id": DEVICE_ID,
            "name": "TEST User Updated",
            "gender": "male",
            "age": 29,
            "weight_kg": 73.0,
            "height_cm": 175.0,
            "activity_level": "active",
            "health_conditions": ["joint_pain"]
        }
        r = session.post(f"{BASE_URL}/api/profile", json=payload, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST User Updated"
        assert data["activity_level"] == "active"


class TestSteps:
    def test_sync_steps(self, session):
        payload = {
            "device_id": DEVICE_ID,
            "date": "2025-01-15",
            "steps": 5000,
            "mode": "set",
            "source": "phone"
        }
        r = session.post(f"{BASE_URL}/api/steps", json=payload, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["steps"] == 5000
        assert data["calories"] > 0
        assert data["distance_km"] > 0

    def test_get_day_steps(self, session):
        r = session.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/day/2025-01-15", timeout=5)
        assert r.status_code == 200
        data = r.json()
        assert data["steps"] == 5000

    def test_get_history(self, session):
        r = session.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/history?days=7", timeout=5)
        assert r.status_code == 200
        data = r.json()
        assert len(data["days"]) == 7
        assert "summary" in data


class TestAchievements:
    def test_get_achievements(self, session):
        r = session.get(f"{BASE_URL}/api/achievements/{DEVICE_ID}", timeout=5)
        assert r.status_code == 200
        data = r.json()
        assert "badges" in data
        assert "current_streak" in data
        assert len(data["badges"]) == 9
