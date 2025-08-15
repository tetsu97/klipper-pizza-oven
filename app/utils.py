# app/utils.py
import re
from pathlib import Path

SAFE_FILENAME_RE = re.compile(r"[A-Za-z0-9._ -]+")

def make_safe_filename(name: str, default: str = "program") -> str:
    """Očistí název souboru od nebezpečných znaků."""
    if not name:
        return default
    name = name.strip()
    parts = SAFE_FILENAME_RE.findall(name)
    cleaned = "".join(parts).strip().strip(".")
    return cleaned or default

def ensure_gcode_extension(filename: str) -> str:
    """Zajistí, že název souboru končí na .gcode."""
    return filename if filename.lower().endswith(".gcode") else f"{filename}.gcode"

def is_safe_child(path: Path, base: Path) -> bool:
    """Zkontroluje, zda je cesta bezpečně uvnitř základního adresáře."""
    try:
        path = path.resolve()
        base = base.resolve()
        return str(path).startswith(str(base))
    except Exception:
        return False
