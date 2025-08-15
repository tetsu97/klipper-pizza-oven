# app/routers/websocket.py
import asyncio
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .. import settings

router = APIRouter()

@router.websocket("/websocket")
async def websocket_proxy(client_ws: WebSocket):
    """
    Proxy pro WebSocket spojení, přeposílá komunikaci na Moonraker.
    """
    await client_ws.accept()
    # Sestavení URI pro Moonraker WebSocket z URL v nastavení
    moonraker_host = settings.KLIPPER_API_URL.split('//')[-1]
    moonraker_uri = f"ws://{moonraker_host}/websocket"

    try:
        async with websockets.connect(moonraker_uri) as server_ws:
            
            async def client_to_server():
                while True:
                    message = await client_ws.receive_text()
                    await server_ws.send(message)

            async def server_to_client():
                while True:
                    message = await server_ws.recv()
                    await client_ws.send_text(message)

            # Spustíme obě korutiny souběžně
            await asyncio.gather(client_to_server(), server_to_client())

    except WebSocketDisconnect:
        print("INFO: Client WebSocket disconnected.")
    except (websockets.exceptions.ConnectionClosed, websockets.exceptions.ConnectionClosedOK) as e:
        print(f"INFO: Moonraker WebSocket connection closed: {e.code} {e.reason}")
    except Exception as e:
        print(f"ERROR: An unexpected WebSocket proxy error occurred: {e}")
