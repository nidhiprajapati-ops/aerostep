"""
Backend tests for step source tracking (phone/ble) and history endpoint.
Tests for Weekly Stats Source Breakdown feature.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def device_id():
    return f"TEST_{uuid.uuid4().hex[:8]}"

@pytest.fixture(scope="module")
def setup_profile(device_id):
    """Create a test profile"""
    resp = requests.post(f"{BASE_URL}/api/profile", json={
        "device_id": device_id,
        "name": "TEST_User",
        "age": 30,
        "gender": "male",
        "weight_kg": 70,
        "height_cm": 170,
        "activity_level": "moderate",
        "health_conditions": [],
    })
    assert resp.status_code == 200, f"Profile creation failed: {resp.text}"
    return resp.json()

today = datetime.now(timezone.utc).strftime("%Y-%m-%d")


class TestPostStepsSourcePhone:
    """POST /api/steps with source=phone increments steps_phone"""

    def test_post_steps_phone_source(self, device_id, setup_profile):
        resp = requests.post(f"{BASE_URL}/api/steps", json={
            "device_id": device_id,
            "date": today,
            "steps": 500,
            "mode": "increment",
            "source": "phone",
        })
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert "steps" in data
        assert data["steps"] >= 500
        print(f"PASS: POST steps phone - total steps: {data['steps']}")

    def test_post_more_phone_steps(self, device_id, setup_profile):
        resp = requests.post(f"{BASE_URL}/api/steps", json={
            "device_id": device_id,
            "date": today,
            "steps": 300,
            "mode": "increment",
            "source": "phone",
        })
        assert resp.status_code == 200
        print(f"PASS: POST more phone steps")


class TestPostStepsSourceBLE:
    """POST /api/steps with source=ble increments steps_ble"""

    def test_post_steps_ble_source(self, device_id, setup_profile):
        resp = requests.post(f"{BASE_URL}/api/steps", json={
            "device_id": device_id,
            "date": today,
            "steps": 200,
            "mode": "increment",
            "source": "ble",
        })
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert "steps" in data
        print(f"PASS: POST steps ble - total steps: {data['steps']}")


class TestHistoryEndpoint:
    """GET /api/steps/{device_id}/history returns steps_phone and steps_ble per day"""

    def test_history_returns_source_fields(self, device_id, setup_profile):
        resp = requests.get(f"{BASE_URL}/api/steps/{device_id}/history?days=7")
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert "days" in data, "Missing 'days' in response"
        assert "summary" in data, "Missing 'summary' in response"
        print(f"PASS: History endpoint returns days: {len(data['days'])}")
        return data

    def test_history_days_have_steps_phone_field(self, device_id, setup_profile):
        resp = requests.get(f"{BASE_URL}/api/steps/{device_id}/history?days=7")
        assert resp.status_code == 200
        data = resp.json()
        for day in data["days"]:
            assert "steps_phone" in day, f"Missing steps_phone in day: {day}"
        print("PASS: All days have steps_phone field")

    def test_history_days_have_steps_ble_field(self, device_id, setup_profile):
        resp = requests.get(f"{BASE_URL}/api/steps/{device_id}/history?days=7")
        assert resp.status_code == 200
        data = resp.json()
        for day in data["days"]:
            assert "steps_ble" in day, f"Missing steps_ble in day: {day}"
        print("PASS: All days have steps_ble field")

    def test_history_today_has_correct_phone_steps(self, device_id, setup_profile):
        resp = requests.get(f"{BASE_URL}/api/steps/{device_id}/history?days=7")
        assert resp.status_code == 200
        data = resp.json()
        # Find today's entry
        today_entry = next((d for d in data["days"] if d["date"] == today), None)
        assert today_entry is not None, f"Today {today} not found in history"
        # We added 800 phone + 200 ble steps
        assert today_entry["steps_phone"] >= 800, f"Expected >= 800 phone steps, got {today_entry['steps_phone']}"
        print(f"PASS: Today has {today_entry['steps_phone']} phone steps")

    def test_history_today_has_correct_ble_steps(self, device_id, setup_profile):
        resp = requests.get(f"{BASE_URL}/api/steps/{device_id}/history?days=7")
        assert resp.status_code == 200
        data = resp.json()
        today_entry = next((d for d in data["days"] if d["date"] == today), None)
        assert today_entry is not None
        assert today_entry["steps_ble"] >= 200, f"Expected >= 200 BLE steps, got {today_entry['steps_ble']}"
        print(f"PASS: Today has {today_entry['steps_ble']} BLE steps")

    def test_history_total_steps_equals_phone_plus_ble(self, device_id, setup_profile):
        """Total steps should equal sum of phone + ble steps"""
        resp = requests.get(f"{BASE_URL}/api/steps/{device_id}/history?days=7")
        assert resp.status_code == 200
        data = resp.json()
        today_entry = next((d for d in data["days"] if d["date"] == today), None)
        assert today_entry is not None
        expected_total = today_entry["steps_phone"] + today_entry["steps_ble"]
        assert today_entry["steps"] == expected_total, \
            f"Total {today_entry['steps']} != phone {today_entry['steps_phone']} + ble {today_entry['steps_ble']}"
        print(f"PASS: Total steps = phone + ble = {expected_total}")

    def test_history_30_days(self, device_id, setup_profile):
        resp = requests.get(f"{BASE_URL}/api/steps/{device_id}/history?days=30")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["days"]) == 30
        print("PASS: 30-day history returns 30 days")
