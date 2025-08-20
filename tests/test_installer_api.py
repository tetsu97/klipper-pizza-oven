# tests/test_installer_api.py
import pytest
from httpx import AsyncClient
from pathlib import Path

from app import settings

pytestmark = pytest.mark.asyncio

async def test_installer_status_not_installed(client: AsyncClient, klipper_environ: Path):
    """Testuje, že stav je 'not installed', pokud modul a Klipper config chybí."""
    # V čistém prostředí neexistuje printer.cfg, takže Klipper není validní
    response = await client.get("/api/installer/status")
    assert response.status_code == 200
    data = response.json()
    assert data["klipper_path_valid"] is False
    assert data["installed"] is False

async def test_install_module_success(client: AsyncClient, klipper_environ: Path):
    """Testuje kompletní proces instalace modulu do čistého prostředí."""
    config_dir = Path(settings.CONFIG_DIR)
    extras_dir = config_dir.parent / "extras"
    printer_cfg_path = config_dir / "printer.cfg"
    module_script_path = extras_dir / "pizza_oven.py"
    module_cfg_path = config_dir / "pizza_oven.cfg"

    # 1. Ověříme, že na začátku nic neexistuje
    assert not module_script_path.exists()
    assert not module_cfg_path.exists()
    assert not printer_cfg_path.exists()

    # 2. Zavoláme instalační endpoint
    response_install = await client.post("/api/installer/install_pizza_oven_module")
    
    # 3. Zkontrolujeme odpověď a ověříme, že se vše vytvořilo
    # Instalační skript by měl vytvořit i printer.cfg, pokud neexistuje
    assert response_install.status_code == 200, response_install.text
    assert response_install.json()["ok"] is True
    
    assert module_script_path.exists()
    assert module_cfg_path.exists()
    assert printer_cfg_path.exists()
    assert "[include pizza_oven.cfg]" in printer_cfg_path.read_text()

    # 4. Znovu zkontrolujeme stav, který by nyní měl být 'installed'
    response_status = await client.get("/api/installer/status")
    assert response_status.status_code == 200
    data = response_status.json()
    assert data["klipper_path_valid"] is True
    assert data["installed"] is True

async def test_reinstall_fixes_missing_include(client: AsyncClient, klipper_environ: Path):
    """Testuje, že přeinstalace opraví chybějící [include] v printer.cfg."""
    config_dir = Path(settings.CONFIG_DIR)
    printer_cfg_path = config_dir / "printer.cfg"
    
    # 1. První instalace
    # Instalační skript vytvoří printer.cfg
    await client.post("/api/installer/install_pizza_oven_module")
    
    # Ověříme, že první instalace proběhla a soubor existuje
    assert printer_cfg_path.exists()
    assert "[include pizza_oven.cfg]" in printer_cfg_path.read_text()

    # 2. Ručně "rozbijeme" konfiguraci - odstraníme include
    content = printer_cfg_path.read_text()
    printer_cfg_path.write_text(content.replace("[include pizza_oven.cfg]\n", ""))
    
    status_broken = await client.get("/api/installer/status")
    assert status_broken.json()["installed"] is False

    # 3. Spustíme znovu instalaci
    response_reinstall = await client.post("/api/installer/install_pizza_oven_module")
    assert response_reinstall.status_code == 200, response_reinstall.text

    # 4. Ověříme, že se konfigurace opravila
    status_fixed = await client.get("/api/installer/status")
    assert status_fixed.json()["installed"] is True
    assert "[include pizza_oven.cfg]" in printer_cfg_path.read_text()