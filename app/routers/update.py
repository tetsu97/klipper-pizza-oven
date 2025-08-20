# app/routers/update.py
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Any, Dict
from ..dependencies import get_http_client

router = APIRouter(
    prefix="/api/update",
    tags=["update"],
)

def _forward_headers(request: Request) -> Dict[str, str]:
    headers = {}
    if api_key := request.headers.get("X-Api-Key"):
        headers["X-Api-Key"] = api_key
    return headers

@router.get("/status")
async def update_status(request: Request, client: httpx.AsyncClient = Depends(get_http_client)) -> Dict[str, Any]:
    """Získá stav update manageru."""
    try:
        r = await client.get("/machine/update/status", headers=_forward_headers(request))
        r.raise_for_status()
        return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Služba Moonraker není dostupná: {e} (Moonraker service unavailable).")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Chyba od Moonrakeru: {e.response.text} (Error from Moonraker).")

@router.post("/refresh")
async def update_refresh(request: Request, client: httpx.AsyncClient = Depends(get_http_client)) -> Dict[str, Any]:
    """Spustí refresh update manageru."""
    try:
        r = await client.post("/machine/update/refresh", headers=_forward_headers(request), timeout=30)
        r.raise_for_status()
        return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Služba Moonraker není dostupná: {e} (Moonraker service unavailable).")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Chyba od Moonrakeru: {e.response.text} (Error from Moonraker).")