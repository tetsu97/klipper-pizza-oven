# tests/test_gcodes_api.py
import pytest
from httpx import AsyncClient
from pathlib import Path

# Importujeme router, abychom mohli modifikovat jeho CONFIG_DIR
from app.routers import gcodes

pytestmark = pytest.mark.asyncio

async def test_list_profiles_empty(client: AsyncClient, test_config_dir: Path):
    """
    Testuje, že endpoint /api/gcodes vrátí prázdný seznam, pokud neexistují žádné profily.
    """
    gcodes.CONFIG_DIR = test_config_dir
    # OPRAVA: Přidáno lomítko na konec URL
    response = await client.get("/api/gcodes/")
    assert response.status_code == 200
    data = response.json()
    assert data["files"] == []

async def test_list_profiles_with_files(client: AsyncClient, test_config_dir: Path):
    """
    Testuje, že endpoint /api/gcodes správně najde a vypíše profily.
    """
    gcodes.CONFIG_DIR = test_config_dir
    # Vytvoříme testovací soubory
    (test_config_dir / "pizza_classic.cfg").write_text("[gcode_macro classic]")
    (test_config_dir / "pizza_extra_cheese.cfg").write_text("[gcode_macro extra_cheese]")
    (test_config_dir / "not_a_profile.txt").write_text("ignore me")

    # OPRAVA: Přidáno lomítko na konec URL
    response = await client.get("/api/gcodes/")
    assert response.status_code == 200
    data = response.json()
    
    # Test nyní správně očekává 2 profily, protože hledá 'pizza_*.cfg'
    assert len(data["files"]) == 2
    profile_names = {f["name"] for f in data["files"]}
    assert "classic" in profile_names
    assert "extra_cheese" in profile_names

async def test_delete_profile(client: AsyncClient, test_config_dir: Path):
    """
    Testuje smazání existujícího profilu.
    """
    gcodes.CONFIG_DIR = test_config_dir
    profile_name = "test_to_delete"
    (test_config_dir / f"pizza_{profile_name}.cfg").write_text("content")

    # OPRAVA: Přidáno lomítko na konec URL
    response = await client.delete(f"/api/gcodes/?name={profile_name}")
    assert response.status_code == 200
    assert response.json()["ok"] is True
    
    # Ověříme, že soubor byl opravdu smazán
    assert not (test_config_dir / f"pizza_{profile_name}.cfg").exists()

async def test_delete_nonexistent_profile(client: AsyncClient, test_config_dir: Path):
    """
    Testuje pokus o smazání neexistujícího profilu, očekává chybu 404.
    """
    gcodes.CONFIG_DIR = test_config_dir
    # OPRAVA: Přidáno lomítko na konec URL
    response = await client.delete("/api/gcodes/?name=i_dont_exist")
    assert response.status_code == 404