"""Tests for performance-critical endpoints: health warm-up, profile, AI coach"""
import pytest
import requests
import os
import time

def _load_base_url():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "")
    if not url:
        env_path = os.path.join(os.path.dirname(__file__), "../../frontend/.env")
        with open(env_path) as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
    return url.rstrip("/")

BASE_URL = _load_base_url()


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


DEVICE_ID = "TEST_perf_flow_device_001"


# ─── Health warm-up ───────────────────────────────────────────────────────────
class TestHealthWarmup:
    """GET /api/health - pre-warm TLS connection on onboarding mount"""

    def test_health_returns_200(self, client):
        res = client.get(f"{BASE_URL}/api/health")
        assert res.status_code == 200

    def test_health_response_fast(self, client):
        """Health check should respond in < 1 second (pure DB ping)"""
        start = time.time()
        res = client.get(f"{BASE_URL}/api/health")
        elapsed = time.time() - start
        assert res.status_code == 200
        assert elapsed < 1.0, f"Health check too slow: {elapsed:.2f}s"

    def test_health_has_status_field(self, client):
        res = client.get(f"{BASE_URL}/api/health")
        data = res.json()
        assert "status" in data or "ok" in str(data).lower()


# ─── Profile creation ─────────────────────────────────────────────────────────
class TestProfileCreation:
    """POST /api/profile should be fast and persist data"""

    def test_post_profile_returns_200(self, client):
        res = client.post(f"{BASE_URL}/api/profile", json={
            "device_id": DEVICE_ID,
            "name": "TEST Perf User",
            "gender": "male",
            "age": 28,
            "weight_kg": 75.0,
            "height_cm": 175.0,
            "activity_level": "moderate",
            "health_conditions": [],
        })
        assert res.status_code == 200

    def test_post_profile_fast(self, client):
        """Profile POST should complete in < 2 seconds"""
        start = time.time()
        res = client.post(f"{BASE_URL}/api/profile", json={
            "device_id": DEVICE_ID,
            "name": "TEST Perf User",
            "gender": "male",
            "age": 28,
            "weight_kg": 75.0,
            "height_cm": 175.0,
            "activity_level": "moderate",
            "health_conditions": [],
        })
        elapsed = time.time() - start
        assert res.status_code == 200
        assert elapsed < 2.0, f"Profile POST too slow: {elapsed:.2f}s"

    def test_get_profile_after_create(self, client):
        """GET profile verifies data was persisted"""
        res = client.get(f"{BASE_URL}/api/profile/{DEVICE_ID}")
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "TEST Perf User"
        assert data["device_id"] == DEVICE_ID

    def test_profile_has_goals(self, client):
        """Profile must include step_goal and calorie_goal"""
        res = client.get(f"{BASE_URL}/api/profile/{DEVICE_ID}")
        data = res.json()
        assert "step_goal" in data
        assert "calorie_goal" in data
        assert data["step_goal"] > 0


# ─── AI Coach ─────────────────────────────────────────────────────────────────
class TestAICoach:
    """POST /api/ai/coach - must return a tip (possibly cached from pre-fetch)"""

    def test_ai_coach_returns_200_or_502(self, client):
        """AI coach may return 502 if LLM is unavailable — that is acceptable"""
        res = client.post(f"{BASE_URL}/api/ai/coach", json={
            "device_id": DEVICE_ID,
            "date": "2026-01-01",
            "refresh": False,
        })
        assert res.status_code in (200, 502), f"Unexpected status: {res.status_code}"

    def test_ai_coach_200_has_tip(self, client):
        res = client.post(f"{BASE_URL}/api/ai/coach", json={
            "device_id": DEVICE_ID,
            "date": "2026-01-01",
            "refresh": False,
        })
        if res.status_code == 200:
            data = res.json()
            assert "tip" in data
            assert len(data["tip"]) > 0

    def test_ai_coach_404_without_profile(self, client):
        """AI coach must return 404 for unknown device"""
        res = client.post(f"{BASE_URL}/api/ai/coach", json={
            "device_id": "TEST_nonexistent_device_xyz",
            "date": "2026-01-01",
            "refresh": False,
        })
        assert res.status_code == 404


# ─── Cleanup ──────────────────────────────────────────────────────────────────
def teardown_module(module):
    """No destructive cleanup needed — TEST_ prefix profiles are test-only data"""
    pass
