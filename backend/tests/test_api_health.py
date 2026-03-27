"""Integration test for the health endpoint."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_200():
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
