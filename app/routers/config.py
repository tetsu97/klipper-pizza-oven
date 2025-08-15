# app/routers/config.py
from pathlib import Path
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict, List

from .. import settings
from ..models import FileNamePayload, SaveConfigPayload
from ..utils import is_safe_child

# ZMĚNA ZDE: Prefix je nyní správně nastaven na /api/config
router = APIRouter(
    prefix="/api/config",
    tags=["config"],
)

CONFIG_DIR = Path(settings.CONFIG_DIR).resolve()

def _iter_config_files(base: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not base.exists():
        logging.warning(f"Adresář s konfigurací nebyl nalezen: {base}")
        return []

    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        try:
            st = p.stat()
            name = str(p.relative_to(base))
            out.append({"name": name, "size": st.st_size, "mtime": int(st.st_mtime)})
        except Exception as e:
            logging.error(f"Nepodařilo se zpracovat konfigurační soubor {p.name}: {e}", exc_info=True)
            continue
    return out

# Tato cesta bude nyní správně -> /api/config/files
@router.get("/files")
async def config_files():
    return {"files": _iter_config_files(CONFIG_DIR)}

# Tato cesta bude nyní správně -> /api/config/file
@router.get("/file")
async def get_config_file(name: str = Query(..., description="Relative path in config dir")):
    path = (CONFIG_DIR / name).resolve()
    if not (is_safe_child(path, CONFIG_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail="File not found")
    txt = path.read_text(encoding="utf-8", errors="ignore")
    return {"name": name, "content": txt}

@router.post("/file")
async def save_config_file(payload: SaveConfigPayload):
    path = (CONFIG_DIR / payload.name.strip()).resolve()
    if not is_safe_child(path, CONFIG_DIR):
        raise HTTPException(status_code=400, detail="Invalid name")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload.content, encoding="utf-8")
    return {"ok": True, "name": payload.name}

# Tyto endpoiny byly v původním souboru pod /api/, ale logicky patří sem.
# Pro konzistenci je přesuneme také pod /api/config.
# Pokud by to dělalo problémy, můžeme je vrátit do samostatného routeru.

@router.post("/create-file")
async def create_empty_file(payload: FileNamePayload):
    path = (CONFIG_DIR / payload.name.strip()).resolve()
    if not is_safe_child(path, CONFIG_DIR):
        raise HTTPException(status_code=400, detail="Invalid name")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("", encoding="utf-8")
    return {"ok": True, "name": payload.name}

@router.delete("/delete-file")
async def delete_file(payload: FileNamePayload):
    path = (CONFIG_DIR / payload.name.strip()).resolve()
    if not (is_safe_child(path, CONFIG_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink(missing_ok=True)
    return {"ok": True}
