# tests/test_klipper_api.py
import pytest
from httpx import AsyncClient, RequestError
from unittest.mock import AsyncMock, MagicMock

from app.main import app
from app.dependencies import get_http_client

pytestmark = pytest.mark.asyncio

async def test_console_send_success(client: AsyncClient, mock_http_client: AsyncMock):
    """
    Testuje úspěšné odeslání G-kódu.
    """
    # Nahradíme závislost get_http_client naším mockem
    app.dependency_overrides[get_http_client] = lambda: mock_http_client

    payload = {"script": "M112"}
    await client.post("/api/console/send", json=payload)
    
    # Ověříme, že náš mock klient byl zavolán se správnými parametry
    mock_http_client.post.assert_called_once_with("/printer/gcode/script", params={"script": "M112"})
    
    # Vyčistíme override po testu
    app.dependency_overrides.clear()

async def test_console_send_moonraker_unavailable(client: AsyncClient, mock_http_client: AsyncMock):
    """
    Testuje chybový stav, kdy Moonraker není dostupný.
    """
    # Nastavíme mock tak, aby vyhodil výjimku simulující chybu sítě
    mock_http_client.post.side_effect = RequestError("Connection failed")
    app.dependency_overrides[get_http_client] = lambda: mock_http_client

    payload = {"script": "M112"}
    response = await client.post("/api/console/send", json=payload)
    
    assert response.status_code == 503
    assert "Moonraker service unavailable" in response.json()["detail"]
    
    app.dependency_overrides.clear()