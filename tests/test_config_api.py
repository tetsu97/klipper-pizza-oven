# tests/test_config_api.py
import pytest
from httpx import AsyncClient
from pathlib import Path
import json

# Nepotřebujeme již mockování zde, protože to řeší fixture v conftest.py
from app.routers import config

@pytest.mark.asyncio
async def test_list_config_files_empty(client: AsyncClient, test_config_dir: Path):
    """
    Testuje endpoint pro výpis souborů, když je konfigurační adresář prázdný.
    Díky fixtuře 'test_config_dir' je adresář pro tento test vždy prázdný.
    """
    # Nastavíme routeru, aby používal náš dočasný adresář z fixtury
    config.CONFIG_DIR = test_config_dir

    response = await client.get("/api/config/files")
    assert response.status_code == 200
    assert response.json() == {"files": []}

@pytest.mark.asyncio
async def test_list_config_files_with_content(client: AsyncClient, test_config_dir: Path):
    """
    Testuje endpoint pro výpis souborů s nějakým obsahem.
    """
    config.CONFIG_DIR = test_config_dir
    
    # Vytvoření testovacích souborů v čistém dočasném adresáři
    (test_config_dir / "printer.cfg").write_text("test content")
    (test_config_dir / "macros").mkdir()
    (test_config_dir / "macros" / "my_macro.cfg").write_text("macro content")

    response = await client.get("/api/config/files")
    assert response.status_code == 200
    
    data = response.json()
    assert "files" in data
    assert len(data["files"]) == 2

    file_names = {f["name"] for f in data["files"]}
    assert "printer.cfg" in file_names
    # Použijeme os.path.join pro správné sestavení cesty nezávisle na OS
    import os
    assert os.path.join("macros", "my_macro.cfg") in file_names


@pytest.mark.asyncio
async def test_create_and_delete_file(client: AsyncClient, test_config_dir: Path):
    """
    Testuje vytvoření a následné smazání souboru přes API.
    """
    config.CONFIG_DIR = test_config_dir
    file_name = "test_file_to_delete.cfg"
    file_path = test_config_dir / file_name

    assert not file_path.exists()

    # 1. Vytvoření souboru (tato část zůstává stejná)
    create_payload = {"name": file_name, "content": "hello world"}
    response_create = await client.post("/api/config/file", json=create_payload)
    assert response_create.status_code == 200
    assert response_create.json()["ok"] is True
    assert file_path.exists()
    assert file_path.read_text() == "hello world"

    # 2. Smazání souboru (OPRAVA ZDE)
    # Nyní posíláme jméno souboru jako query parametr v URL
    response_delete = await client.delete(f"/api/config/delete-file?name={file_name}")
    assert response_delete.status_code == 200
    assert response_delete.json()["ok"] is True
    assert not file_path.exists()