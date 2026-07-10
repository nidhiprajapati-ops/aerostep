import pytest
import requests
import os

BASE_URL = "https://fitpace-10.internal.preview.emergentagent.com"

class TestCORS:
    def test_options_preflight(self):
        """OPTIONS /api/profile must return 200 with CORS headers"""
        r = requests.options(f"{BASE_URL}/api/profile", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        })
        print(f"OPTIONS status: {r.status_code}")
        print(f"Headers: {dict(r.headers)}")
        assert r.status_code == 200
        assert "access-control-allow-origin" in r.headers

    def test_cors_allow_origin(self):
        """CORS wildcard origin header present"""
        r = requests.options(f"{BASE_URL}/api/profile", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        })
        acao = r.headers.get("access-control-allow-origin", "")
        print(f"access-control-allow-origin: {acao}")
        assert acao == "*" or "localhost" in acao

class TestProfile:
    DEVICE_ID = "TEST_playwright_device_001"

    def test_create_profile(self):
        """POST /api/profile creates profile"""
        r = requests.post(f"{BASE_URL}/api/profile", json={
            "device_id": self.DEVICE_ID,
            "name": "TEST_User",
            "age": 28,
            "gender": "male",
            "weight_kg": 75.0,
            "height_cm": 175.0,
            "activity_level": "moderate",
            "health_conditions": [],
        })
        print(f"POST /api/profile: {r.status_code} {r.text[:200]}")
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_User"
        assert "step_goal" in data

    def test_get_profile(self):
        """GET /api/profile/{device_id} returns profile"""
        r = requests.get(f"{BASE_URL}/api/profile/{self.DEVICE_ID}")
        print(f"GET /api/profile: {r.status_code}")
        assert r.status_code == 200
        assert r.json()["device_id"] == self.DEVICE_ID

    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200

