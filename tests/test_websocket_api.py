# tests/test_websocket_api.py
import pytest
import asyncio
import websockets
from async_asgi_testclient import TestClient

from app.main import app
from app import settings

pytestmark = pytest.mark.asyncio

async def fake_moonraker_server(websocket):
    """
    Simuluje chování Moonraker WebSocket serveru.
    Čeká na zprávu a pošle ji zpět s prefixem.
    """
    try:
        async for message in websocket:
            await websocket.send(f"echo: {message}")
    except websockets.exceptions.ConnectionClosed:
        pass

async def test_websocket_proxy():
    """
    Testuje WebSocket proxy pomocí async-asgi-testclient.
    """
    moonraker_server = await websockets.serve(fake_moonraker_server, "127.0.0.1", 0)
    moonraker_port = moonraker_server.sockets[0].getsockname()[1]
    
    original_url = settings.KLIPPER_API_URL
    settings.KLIPPER_API_URL = f"http://127.0.0.1:{moonraker_port}"

    try:
        async with TestClient(app) as client:
            async with client.websocket_connect("/websocket") as ws:
                test_message = '{"jsonrpc":"2.0","method":"printer.info","id":1}'
                
                await ws.send_text(test_message)
                response = await ws.receive_text()
                
                assert response == f"echo: {test_message}"

    finally:
        moonraker_server.close()
        await moonraker_server.wait_closed()
        settings.KLIPPER_API_URL = original_url