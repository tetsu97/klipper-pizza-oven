# app/routers/gcodes.py
import logging
from pathlib import Path
import httpx
from fastapi import APIRouter, HTTPException, Query, Depends, Path as FastApiPath
from typing import Any, Dict, List

from .. import settings
from ..utils import is_safe_child, make_safe_filename
from ..dependencies import get_http_client
from ..models import GcodeSavePayload, FileNamePayload
from ..settings import AMBIENT_TEMP

CONFIG_DIR = Path(settings.CONFIG_DIR).resolve()

router = APIRouter(
    prefix="/api/gcodes",
    tags=["gcodes"],
)

@router.get("/")
async def list_profiles() -> Dict[str, List[Dict[str, Any]]]:
    """Vypíše uložené profily (pizza_*.cfg soubory z konfiguračního adresáře)."""
    files: List[Dict[str, Any]] = []
    if not CONFIG_DIR.exists():
        logging.warning(f"Adresář s konfigurací nebyl nalezen: {CONFIG_DIR}")
        return {"files": []}
    
    for p in sorted(CONFIG_DIR.glob("pizza_*.cfg")):
        try:
            stat = p.stat()
            profile_name = p.name.replace("pizza_", "", 1).replace(".cfg", "", 1)
            files.append({
                "name": profile_name, 
                "size": stat.st_size, 
                "mtime": int(stat.st_mtime)
            })
        except Exception as e:
            logging.error(f"Nepodařilo se zpracovat soubor profilu {p.name}: {e}", exc_info=True)
            continue
    return {"files": files}

@router.get("/{name}")
async def get_profile_details(name: str = FastApiPath(..., description="Název profilu k načtení")):
    """Načte detaily a segmenty jednoho profilu pro zobrazení v UI."""
    safe_name = make_safe_filename(name)
    file_name = f"pizza_{safe_name}.cfg"
    path = CONFIG_DIR / file_name

    if not (is_safe_child(path, CONFIG_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Profil '{safe_name}' nebyl nalezen.")

    try:
        content = path.read_text(encoding="utf-8").strip()
        lines = content.split('\n')
        
        # OPRAVA: Vylepšená logika, aby se zamezilo duplicitním bodům v čase 0
        points = []
        current_time_min = 0
        previous_temp = AMBIENT_TEMP
        
        # Přidáme pouze jeden startovní bod
        points.append({"time": 0, "temp": previous_temp})
        
        for i, line in enumerate(lines):
            if not line.strip():
                continue
            
            parts = line.split(":")
            if len(parts) != 4:
                logging.warning(f"Přeskakuji neplatný řádek v profilu {safe_name}: {line}")
                continue

            temp, ramp_time_sec, hold_time_sec, _ = map(float, parts)

            # Bod na začátku náběhu přidáme, POUZE pokud se teplota mění
            # a NENÍ to úplně první segment v souboru.
            if i > 0 and temp != previous_temp:
                 points.append({"time": round(current_time_min, 2), "temp": previous_temp})

            # Bod po náběhu
            current_time_min += ramp_time_sec / 60
            points.append({"time": round(current_time_min, 2), "temp": temp})
            
            # Bod po držení (pokud existuje)
            if hold_time_sec > 0:
                current_time_min += hold_time_sec / 60
                points.append({"time": round(current_time_min, 2), "temp": temp})
            
            previous_temp = temp

        # Odstraníme případný duplicitní první bod, pokud by teplota prvního
        # segmentu byla shodou okolností stejná jako ambientní.
        if len(points) > 1 and points[0]['time'] == points[1]['time'] and points[0]['temp'] == points[1]['temp']:
            points.pop(0)

        return {"name": safe_name, "points": points}

    except Exception as e:
        logging.error(f"Chyba při parsování profilu {safe_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chyba při čtení souboru profilu: {e}")

async def _send_gcode(client: httpx.AsyncClient, script: str):
    """Pomocná funkce pro odeslání G-kódu."""
    try:
        r = await client.post("/printer/gcode/script", params={"script": script})
        r.raise_for_status()
        return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Služba Moonraker není dostupná: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Chyba od Klipperu: {e.response.text}")

@router.post("/save")
async def save_profile(payload: GcodeSavePayload):
    """Sestaví a přímo uloží soubor s profilem do konfiguračního adresáře."""
    safe_name = make_safe_filename(payload.name)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Neplatný název programu.")

    profile_content = []
    if payload.mode == "annealing" and payload.points:
        for seg in payload.points:
            ramp_time_sec = (seg.get('ramp_time') or 60) * 60
            hold_time_sec = (seg.get('hold_time') or 0) * 60
            temp = seg.get('temp') or 25
            method_code = 1 
            profile_content.append(f"{temp}:{ramp_time_sec}:{hold_time_sec}:{method_code}")
    elif payload.mode == "drying" and payload.drying_temp and payload.drying_time:
        hold_time_sec = payload.drying_time * 60
        temp = payload.drying_temp
        profile_content.append(f"{temp}:1:{hold_time_sec}:1")
    else:
         raise HTTPException(status_code=400, detail="Chybějící data pro vytvoření profilu.")

    file_name = f"pizza_{safe_name}.cfg"
    path = CONFIG_DIR / file_name

    if not is_safe_child(path, CONFIG_DIR):
         raise HTTPException(status_code=400, detail="Neplatná cesta k souboru.")
    try:
        path.write_text("\n".join(profile_content) + "\n", encoding="utf-8")
        logging.info(f"Profil byl úspěšně uložen do souboru: {path}")
    except Exception as e:
        logging.error(f"Nepodařilo se uložit profil {safe_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Chyba při ukládání souboru: {e}")
        
    return {"ok": True, "name": safe_name}

@router.post("/start")
async def start_profile(payload: FileNamePayload, client: httpx.AsyncClient = Depends(get_http_client)):
    """Spustí zvolený profil (LOAD_PROGRAM, EXECUTE_PROGRAM)."""
    safe_name = make_safe_filename(payload.name)
    await _send_gcode(client, f'LOAD_PROGRAM NAME="{safe_name}"')
    await _send_gcode(client, 'EXECUTE_PROGRAM')
    return {"ok": True}

@router.delete("/")
async def delete_profile(name: str = Query(...)) -> Dict[str, bool]:
    """Smaže soubor s profilem."""
    if not name or ".." in name or "/" in name:
        raise HTTPException(status_code=400, detail="Neplatný název souboru.")
    
    file_name = f"pizza_{make_safe_filename(name)}.cfg"
    path = CONFIG_DIR / file_name
    
    if not (is_safe_child(path, CONFIG_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Profil '{name}' nebyl nalezen.")
    
    try:
        path.unlink()
        return {"ok": True}
    except Exception as e:
        logging.error(f"Nepodařilo se smazat profil {name}: {e}")
        raise HTTPException(status_code=500, detail=f"Chyba při mazání souboru: {e}")