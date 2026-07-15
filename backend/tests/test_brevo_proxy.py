"""Backend tests for Brevo proxy API.

Since we don't have a valid Brevo API key, we test:
- Root endpoint
- Missing key -> 401 with normalized detail.message
- Invalid key -> 4xx (401 from Brevo) with normalized detail.message
- No 500 errors from proxy code path (error normalization)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://brevo-ios-dashboard.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Root ---
class TestRoot:
    def test_root_message(self, client):
        r = client.get(f"{API}/")
        assert r.status_code == 200
        body = r.json()
        assert "message" in body
        assert isinstance(body["message"], str) and body["message"]


# --- Missing key (proxy short-circuits with 401 before hitting Brevo) ---
class TestMissingKey:
    @pytest.mark.parametrize("path", [
        "/brevo/account",
        "/brevo/campaigns",
        "/brevo/contacts",
        "/brevo/attributes",
    ])
    def test_missing_key_returns_401(self, client, path):
        r = client.get(f"{API}{path}")
        assert r.status_code == 401, f"{path} => {r.status_code} body={r.text[:200]}"
        data = r.json()
        assert "detail" in data
        detail = data["detail"]
        assert isinstance(detail, dict) and "message" in detail
        assert "Brevo" in detail["message"] or "key" in detail["message"].lower()


# --- Invalid key (proxy forwards to Brevo which returns 401) ---
class TestInvalidKey:
    HEADERS = {"X-Brevo-Key": "invalid-test"}

    def test_account_invalid_key(self, client):
        r = client.get(f"{API}/brevo/account", headers=self.HEADERS)
        assert r.status_code == 401
        assert r.status_code < 500
        data = r.json()
        assert "detail" in data and isinstance(data["detail"], dict)
        assert "message" in data["detail"] and data["detail"]["message"]

    @pytest.mark.parametrize("path", [
        "/brevo/campaigns",
        "/brevo/contacts",
        "/brevo/attributes",
    ])
    def test_get_endpoints_invalid_key_return_4xx(self, client, path):
        r = client.get(f"{API}{path}", headers=self.HEADERS)
        assert 400 <= r.status_code < 500, f"{path} => {r.status_code}"
        data = r.json()
        assert "detail" in data
        assert isinstance(data["detail"], dict) and data["detail"].get("message")

    def test_post_contact_invalid_key(self, client):
        r = client.post(
            f"{API}/brevo/contacts",
            headers=self.HEADERS,
            json={"email": "TEST_x@example.com", "attributes": {"FIRSTNAME": "T"}},
        )
        assert 400 <= r.status_code < 500, f"POST /brevo/contacts => {r.status_code} body={r.text[:200]}"
        data = r.json()
        assert "detail" in data and isinstance(data["detail"], dict)
        assert data["detail"].get("message")

    def test_put_contact_invalid_key(self, client):
        r = client.put(
            f"{API}/brevo/contacts/test@example.com",
            headers=self.HEADERS,
            json={"attributes": {"FIRSTNAME": "TEST"}},
        )
        assert 400 <= r.status_code < 500, f"PUT /brevo/contacts/{{id}} => {r.status_code} body={r.text[:200]}"
        data = r.json()
        assert "detail" in data and isinstance(data["detail"], dict)
        assert data["detail"].get("message")


# --- No 500 crashes ---
class TestNoServerCrashes:
    """Ensure proxy never returns 500 on invalid/missing keys."""

    @pytest.mark.parametrize("method,path,headers,body", [
        ("GET", "/brevo/account", {}, None),
        ("GET", "/brevo/account", {"X-Brevo-Key": "invalid-test"}, None),
        ("GET", "/brevo/campaigns", {"X-Brevo-Key": "invalid-test"}, None),
        ("GET", "/brevo/contacts", {"X-Brevo-Key": "invalid-test"}, None),
        ("GET", "/brevo/attributes", {"X-Brevo-Key": "invalid-test"}, None),
        ("GET", "/brevo/contacts/test@example.com", {"X-Brevo-Key": "invalid-test"}, None),
        ("POST", "/brevo/contacts", {"X-Brevo-Key": "invalid-test"}, {"email": "TEST_x@example.com"}),
        ("PUT", "/brevo/contacts/test@example.com", {"X-Brevo-Key": "invalid-test"}, {"attributes": {}}),
    ])
    def test_no_500(self, client, method, path, headers, body):
        r = client.request(method, f"{API}{path}", headers=headers, json=body)
        assert r.status_code != 500, f"{method} {path} => 500. body={r.text[:200]}"
        assert r.status_code < 600
