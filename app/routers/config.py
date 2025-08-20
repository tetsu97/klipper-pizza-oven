# app/routers/config.py
from pathlib import Path
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict, List, Union

from .. import settings
from ..models import FileNamePayload, SaveConfigPayload
from ..utils import is_safe_child

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

@router.get("/files")
async def config_files() -> Dict[str, List[Dict[str, Any]]]:
    return {"files": _iter_config_files(CONFIG_DIR)}

@router.get("/file")
async def get_config_file(name: str = Query(..., description="Relative path in config dir")) -> Dict[str, str]:
    path = (CONFIG_DIR / name).resolve()
    if not (is_safe_child(path, CONFIG_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Soubor '{name}' nebyl nalezen (File '{name}' not found).")
    try:
        txt = path.read_text(encoding="utf-8", errors="ignore")
        return {"name": name, "content": txt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chyba při čtení souboru '{name}': {e} (Error reading file '{name}': {e})")

@router.post("/file")
async def save_config_file(payload: SaveConfigPayload) -> Dict[str, Union[bool, str]]:
    path = (CONFIG_DIR / payload.name.strip()).resolve()
    if not is_safe_child(path, CONFIG_DIR):
        raise HTTPException(status_code=400, detail=f"Neplatná cesta k souboru: '{payload.name}' (Invalid file path).")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload.content, encoding="utf-8")
        return {"ok": True, "name": payload.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nepodařilo se uložit soubor '{payload.name}': {e} (Failed to save file '{payload.name}': {e})")

@router.post("/create-file")
async def create_empty_file(payload: FileNamePayload) -> Dict[str, Union[bool, str]]:
    path = (CONFIG_DIR / payload.name.strip()).resolve()
    if not is_safe_child(path, CONFIG_DIR):
        raise HTTPException(status_code=400, detail="Invalid name")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("", encoding="utf-8")
    return {"ok": True, "name": payload.name}

@router.delete("/delete-file")
async def delete_file(name: str = Query(..., description="File name to delete")) -> Dict[str, bool]:
    # Payload is no longer needed, we get 'name' directly from the URL query
    path = (CONFIG_DIR / name.strip()).resolve()
    if not (is_safe_child(path, CONFIG_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink(missing_ok=True)
    return {"ok": True}