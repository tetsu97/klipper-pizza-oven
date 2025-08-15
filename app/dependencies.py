# app/dependencies.py
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Request
from . import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Správce kontextu pro životní cyklus aplikace.
    Vytvoří instanci httpx.AsyncClient při startu a zavře ji při vypnutí.
    """
    # Použijeme base_url z nastavení pro všechny odchozí požadavky
    async with httpx.AsyncClient(base_url=settings.KLIPPER_API_URL, timeout=10.0) as client:
        app.state.http_client = client
        yield

def get_http_client(request: Request) -> httpx.AsyncClient:
    """
    Závislost (Dependency), která poskytuje sdílenou instanci httpx.AsyncClient.
    """
    return request.app.state.http_client
