"""AeroStep backend API tests"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
TEST_DEVICE = "TEST_device_aerostep_001"
TODAY = "2026-01-15"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# Health check
class TestHealth:
    def test_api_root(self, client):
        r = client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        data = r.json()
        assert "message" in data


# Profile
class TestProfile:
    def test_create_profile(self, client):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "device_id": TEST_DEVICE,
            "name": "TEST_Alex Johnson",
            "age": 28,
            "gender": "male",
            "weight_kg": 72,
            "height_cm": 178,
            "activity_level": "moderate",
            "health_conditions": []
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Alex Johnson"
        assert "step_goal" in data
        assert "bmr" in data
        assert "calorie_goal" in data

    def test_get_profile(self, client):
        r = client.get(f"{BASE_URL}/api/profile/{TEST_DEVICE}")
        assert r.status_code == 200
        data = r.json()
        assert data["device_id"] == TEST_DEVICE

    def test_get_missing_profile(self, client):
        r = client.get(f"{BASE_URL}/api/profile/nonexistent_device_xyz")
        assert r.status_code == 404


# Steps
class TestSteps:
    def test_upsert_steps_set(self, client):
        r = client.post(f"{BASE_URL}/api/steps", json={
            "device_id": TEST_DEVICE,
            "date": TODAY,
            "steps": 5000,
            "mode": "set"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["steps"] == 5000
        assert "calories" in data
        assert "distance_km" in data

    def test_upsert_steps_increment(self, client):
        r = client.post(f"{BASE_URL}/api/steps", json={
            "device_id": TEST_DEVICE,
            "date": TODAY,
            "steps": 1000,
            "mode": "increment"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["steps"] == 6000

    def test_get_day_steps(self, client):
        r = client.get(f"{BASE_URL}/api/steps/{TEST_DEVICE}/day/{TODAY}")
        assert r.status_code == 200
        data = r.json()
        assert data["steps"] == 6000

    def test_get_history(self, client):
        r = client.get(f"{BASE_URL}/api/steps/{TEST_DEVICE}/history?days=7&end={TODAY}")
        assert r.status_code == 200
        data = r.json()
        assert "days" in data
        assert "summary" in data
        assert len(data["days"]) == 7
        assert "total_steps" in data["summary"]


# Achievements
class TestAchievements:
    def test_get_achievements(self, client):
        r = client.get(f"{BASE_URL}/api/achievements/{TEST_DEVICE}?date={TODAY}")
        assert r.status_code == 200
        data = r.json()
        assert "badges" in data
        assert len(data["badges"]) == 9
        assert "current_streak" in data
        assert "best_streak" in data

    def test_badge_structure(self, client):
        r = client.get(f"{BASE_URL}/api/achievements/{TEST_DEVICE}?date={TODAY}")
        data = r.json()
        badge = data["badges"][0]
        assert "id" in badge
        assert "name" in badge
        assert "unlocked" in badge
