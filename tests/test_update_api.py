# tests/test_update_api.py
import pytest
import httpx
from httpx import AsyncClient, RequestError, Response
from unittest.mock import AsyncMock, MagicMock

from app.main import app
from app.dependencies import get_http_client

pytestmark = pytest.mark.asyncio

async def test_get_update_status_success(client: AsyncClient, mock_http_client: AsyncMock):
    """
    Testuje úspěšné získání stavu aktualizací.
    """
    mock_response_data = {"result": {"version_info": {"klipper": {"version": "v0.10.0"}}}}
    mock_http_client.get.return_value.json.return_value = mock_response_data
    
    app.dependency_overrides[get_http_client] = lambda: mock_http_client

    response = await client.get("/api/update/status")
    
    assert response.status_code == 200
    assert response.json() == mock_response_data
    
    mock_http_client.get.assert_called_once_with("/machine/update/status", headers={})

    app.dependency_overrides.clear()


async def test_post_update_refresh_success(client: AsyncClient, mock_http_client: AsyncMock):
    """
    Testuje úspěšné spuštění obnovení aktualizací.
    """
    mock_response_data = {"result": "ok"}
    mock_http_client.post.return_value.json.return_value = mock_response_data
    
    app.dependency_overrides[get_http_client] = lambda: mock_http_client

    response = await client.post("/api/update/refresh")
    
    assert response.status_code == 200
    assert response.json() == mock_response_data
    
    mock_http_client.post.assert_called_once_with("/machine/update/refresh", headers={}, timeout=30)
    
    app.dependency_overrides.clear()


async def test_get_update_status_moonraker_error(client: AsyncClient, mock_http_client: AsyncMock):
    """
    Testuje chybový stav, kdy Moonraker vrátí chybu (např. 500).
    """
    mock_http_client.get.side_effect = httpx.HTTPStatusError(
        "Server Error",
        request=MagicMock(),
        response=Response(500, text="Internal Server Error")
    )
    app.dependency_overrides[get_http_client] = lambda: mock_http_client

    response = await client.get("/api/update/status")
    
    assert response.status_code == 500
    assert "Internal Server Error" in response.json()["detail"]
    
    app.dependency_overrides.clear()