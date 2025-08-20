# tests/test_system_api.py
import pytest
from httpx import AsyncClient

# Tento testovací modul bude asynchronní, stejně jako naše API
pytestmark = pytest.mark.asyncio

async def test_get_disk_usage(client: AsyncClient):
    """
    Testuje endpoint /api/disk.
    Ověřuje, že endpoint vrátí stav 200 a správnou datovou strukturu.
    """
    response = await client.get("/api/disk")
    assert response.status_code == 200
    
    data = response.json()
    # Ověřujeme, že odpověď obsahuje očekávané klíče
    assert "total" in data
    assert "used" in data
    assert "free" in data
    assert "percent" in data
    
    # Ověřujeme, že hodnoty jsou buď číslo (int/float) nebo None, pokud psutil není dostupný
    for key in ["total", "used", "free", "percent"]:
        assert isinstance(data[key], (int, float)) or data[key] is None


async def test_get_system_host_info(client: AsyncClient):
    """
    Testuje endpoint /api/system/host.
    Ověřuje, že endpoint vrátí stav 200 a správnou datovou strukturu.
    """
    response = await client.get("/api/system/host")
    assert response.status_code == 200
    
    data = response.json()
    # Ověřujeme přítomnost všech hlavních klíčů
    assert "os" in data
    assert "mem" in data
    assert "cpu_temp_c" in data
    assert "network" in data
    
    # Detailnější kontrola vnořených struktur
    mem_info = data["mem"]
    assert "total_kb" in mem_info
    assert "used_kb" in mem_info
    assert "free_kb" in mem_info
    
    network_info = data["network"]
    assert isinstance(network_info, list) # Očekáváme seznam síťových rozhraní
    
    # Pokud jsou nějaká síťová rozhraní nalezena, zkontrolujeme strukturu prvního z nich
    if network_info:
        interface = network_info[0]
        assert "name" in interface
        assert "ip_address" in interface
        assert "type" in interface