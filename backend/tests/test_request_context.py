from fastapi.testclient import TestClient

from app.main import app


def test_request_id_is_added_when_missing():
    client = TestClient(app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID")


def test_request_id_is_propagated_when_provided():
    client = TestClient(app)
    response = client.get("/api/v1/health", headers={"X-Request-ID": "req-12345"})
    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == "req-12345"
