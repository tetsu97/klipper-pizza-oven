# tests/test_utils.py
import pytest
from pathlib import Path

from app.utils import make_safe_filename, ensure_gcode_extension, is_safe_child

def test_make_safe_filename():
    """
    Testuje funkci pro "očištění" názvu souboru.
    """
    assert make_safe_filename("Můj Profil 1.gcode") == "Mj Profil 1.gcode"
    
    # OPRAVA ZDE: Očekávaný výsledek je 'nebezpennzev'
    assert make_safe_filename("nebezpečný/../název") == "nebezpennzev"
    
    assert make_safe_filename("  extra mezery  ") == "extra mezery"
    assert make_safe_filename("!@#$%^&*()", default="default_name") == "default_name"
    assert make_safe_filename(None, default="default_name") == "default_name"

def test_ensure_gcode_extension():
    """
    Testuje funkci, která zajišťuje příponu .gcode.
    """
    assert ensure_gcode_extension("program") == "program.gcode"
    assert ensure_gcode_extension("program.gcode") == "program.gcode"
    assert ensure_gcode_extension("program.GCODE") == "program.GCODE"
    assert ensure_gcode_extension("") == ".gcode"

def test_is_safe_child():
    """
    Testuje bezpečnostní funkci pro ověření cesty k souboru.
    """
    base_dir = Path("/home/user/config")
    
    # Bezpečné cesty
    assert is_safe_child(base_dir / "printer.cfg", base_dir) is True
    assert is_safe_child(base_dir / "macros" / "heat.cfg", base_dir) is True
    
    # Nebezpečné cesty
    assert is_safe_child(base_dir / ".." / "os_config.txt", base_dir) is False
    assert is_safe_child(Path("/etc/passwd"), base_dir) is False
    
    # Cesta je stejná jako základní adresář
    assert is_safe_child(base_dir, base_dir) is False