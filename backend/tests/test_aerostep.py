"""AeroStep backend API tests"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
DEVICE_ID = "TEST_device_aerostep_001"
TODAY = datetime.utcnow().strftime("%Y-%m-%d")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def setup_profile(session):
    """Create profile before tests"""
    resp = session.post(f"{BASE_URL}/api/profile", json={
        "device_id": DEVICE_ID,
        "name": "TEST_TestUser",
        "age": 30,
        "gender": "male",
        "weight_kg": 75,
        "height_cm": 175,
        "activity_level": "moderate",
        "health_conditions": []
    })
    assert resp.status_code == 200, f"Profile setup failed: {resp.text}"
    yield


# ─── Health ────────────────────────────────────────────────────────────────────
class TestHealth:
    def test_root(self, session):
        resp = session.get(f"{BASE_URL}/api/")
        assert resp.status_code == 200
        assert "AeroStep" in resp.json().get("message", "")


# ─── Profile ───────────────────────────────────────────────────────────────────
class TestProfile:
    def test_get_profile(self, session):
        resp = session.get(f"{BASE_URL}/api/profile/{DEVICE_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "TEST_TestUser"
        assert data["age"] == 30
        assert data["step_goal"] > 0
        assert data["bmr"] > 0
        assert data["calorie_goal"] > 0

    def test_profile_404(self, session):
        resp = session.get(f"{BASE_URL}/api/profile/nonexistent_device_xyz")
        assert resp.status_code == 404


# ─── Steps ─────────────────────────────────────────────────────────────────────
class TestSteps:
    def test_post_steps_increment(self, session):
        resp = session.post(f"{BASE_URL}/api/steps", json={
            "device_id": DEVICE_ID,
            "date": TODAY,
            "steps": 500,
            "mode": "increment"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["steps"] >= 500
        assert "goal" in data
        assert "calories" in data
        assert "distance_km" in data
        assert "active_minutes" in data
        assert "progress" in data

    def test_post_steps_set(self, session):
        resp = session.post(f"{BASE_URL}/api/steps", json={
            "device_id": DEVICE_ID,
            "date": TODAY,
            "steps": 1000,
            "mode": "set"
        })
        assert resp.status_code == 200
        assert resp.json()["steps"] == 1000

    def test_get_history_7d(self, session):
        resp = session.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/history?days=7")
        assert resp.status_code == 200
        data = resp.json()
        assert "days" in data
        assert len(data["days"]) == 7
        for day in data["days"]:
            assert "met_goal" in day
            assert "steps" in day
            assert "date" in day

    def test_get_history_30d(self, session):
        resp = session.get(f"{BASE_URL}/api/steps/{DEVICE_ID}/history?days=30")
        assert resp.status_code == 200
        assert len(resp.json()["days"]) == 30


# ─── Achievements ──────────────────────────────────────────────────────────────
class TestAchievements:
    def test_get_achievements(self, session):
        resp = session.get(f"{BASE_URL}/api/achievements/{DEVICE_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert "badges" in data
        assert "current_streak" in data
        assert "best_streak" in data
        badges = data["badges"]
        assert len(badges) > 0
        for badge in badges:
            assert "id" in badge
            assert "name" in badge
            assert "desc" in badge
            assert "icon" in badge
            assert "unlocked" in badge
            assert isinstance(badge["unlocked"], bool)


# ─── AI Coach ──────────────────────────────────────────────────────────────────
class TestAICoach:
    def test_ai_coach_returns_tip(self, session):
        resp = session.post(f"{BASE_URL}/api/ai/coach", json={
            "device_id": DEVICE_ID,
            "date": TODAY,
            "refresh": False
        })
        assert resp.status_code in (200, 502), f"Unexpected status: {resp.status_code}"
        if resp.status_code == 200:
            data = resp.json()
            assert "tip" in data
            assert isinstance(data["tip"], str)
            assert len(data["tip"]) > 10

    def test_ai_coach_no_profile(self, session):
        resp = session.post(f"{BASE_URL}/api/ai/coach", json={
            "device_id": "nonexistent_xyz",
            "date": TODAY,
            "refresh": False
        })
        assert resp.status_code == 404
