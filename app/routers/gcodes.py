# app/routers/gcodes.py
import json
import re
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import FileResponse, JSONResponse
from typing import Any, Dict, List, Optional, Tuple
import httpx

from .. import settings
from ..models import GenerateGcodePayload, GcodeSavePayload
from ..dependencies import get_http_client
from ..utils import make_safe_filename, ensure_gcode_extension, is_safe_child

# ZMĚNA: Prefix je nyní jen /api, aby odpovídal původní struktuře
router = APIRouter(
    prefix="/api",
    tags=["gcodes"],
)

GCODE_DIR = Path(settings.PROFILES_DIR).resolve()

# =========================
# Pomocné funkce (zůstávají stejné)
# =========================

def _points_to_gcode_lines(program_name: str, filament_type: Optional[str], mode: str, points: List[Dict[str, Any]], drying_time: Optional[int], drying_temp: Optional[int]) -> List[str]:
    speed = 2
    lines = ["; Generated G-code", f"; Program: {program_name}"]
    if filament_type:
        safe_fil = filament_type.replace('"', "'")
        lines.append(f'; filament_settings_id = "{safe_fil}"')

    meta = {"program_name": program_name, "filament_type": filament_type, "mode": mode, "points": points}
    lines.append(";PIZZA_META_START")
    lines.append(";" + json.dumps(meta, ensure_ascii=False))
    lines.append(";PIZZA_META_END")

    if mode == "annealing":
        pts = sorted([{"time": int(p["time"]), "temp": int(p["temp"])} for p in points], key=lambda p: p["time"])
        if pts:
            lines.append(f'; start_temp = {pts[0]["temp"]}')
        for i in range(len(pts) - 1):
            dt = pts[i + 1]["time"] - pts[i]["time"]
            if dt <= 0: continue
            target = int(pts[i + 1]["temp"])
            lines.append(f"TEMP_RAMP TEMP={target} DURATION={int(dt)} SPEED={speed}")
    elif mode == "drying" and drying_time is not None and drying_temp is not None:
        lines.append(f"; start_temp = {int(drying_temp)}")
        lines.append(f"TEMP_RAMP TEMP={int(drying_temp)} DURATION={int(drying_time)} SPEED={speed}")

    lines.append("SET_HEATER_TEMPERATURE HEATER=pizza_oven TARGET=0")
    return lines

def _parse_gcode_points(content: str) -> Tuple[Dict[str, Any], List[Dict[str, int]]]:
    # ... (tato funkce zůstává stejná jako v předchozí verzi)
    meta, points = {}, []
    try:
        if ";PIZZA_META_START" in content and ";PIZZA_META_END" in content:
            block = content.split(";PIZZA_META_START", 1)[1].split(";PIZZA_META_END", 1)[0]
            for line in block.splitlines():
                line = line.strip()
                if line.startswith(";{") and line.endswith("}"):
                    j = json.loads(line[1:])
                    if isinstance(j, dict):
                        meta = j
                        pts = j.get("points")
                        if isinstance(pts, list):
                            points = [{"time": int(p.get("time", 0)), "temp": int(p.get("temp", 0))} for p in pts]
                        break
    except Exception:
        pass
    return meta, sorted(points, key=lambda p: p["time"]) if points else []


# =========================
# API Endpoints
# =========================

# ZMĚNA: Cesta je nyní správně /api/generate_gcode
@router.post("/generate_gcode")
async def generate_gcode(payload: GenerateGcodePayload):
    lines = _points_to_gcode_lines(
        program_name=payload.program_name, filament_type=payload.filament_type,
        mode=payload.mode, points=payload.points,
        drying_time=payload.drying_time, drying_temp=payload.drying_temp,
    )
    return JSONResponse({"gcode": "\n".join(lines)})

# ZMĚNA: Cesta je explicitně /gcodes
@router.get("/gcodes")
async def list_gcodes():
    files: List[Dict[str, Any]] = []
    if not GCODE_DIR.exists():
        logging.warning(f"Adresář s profily nebyl nalezen: {GCODE_DIR}")
        return {"files": []}
    for p in sorted(GCODE_DIR.glob("*.gcode")):
        try:
            stat = p.stat()
            head = p.read_text(encoding="utf-8", errors="ignore")[:4000]
            m = re.search(r'^; filament_settings_id\s*=\s*"(.+)"', head, flags=re.M)
            files.append({"name": p.name, "size": stat.st_size, "mtime": int(stat.st_mtime), "filament_type": m.group(1) if m else None})
        except Exception as e:
            logging.error(f"Nepodařilo se zpracovat soubor profilu {p.name}: {e}", exc_info=True)
            continue
    return {"files": files}

@router.get("/gcodes/download")
async def download_gcode(name: str = Query(...)):
    safe = ensure_gcode_extension(make_safe_filename(name))
    path = GCODE_DIR / safe
    if not (is_safe_child(path, GCODE_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="text/plain", filename=path.name)

@router.get("/gcodes/load")
async def load_gcode_meta(name: str = Query(...)):
    safe = ensure_gcode_extension(make_safe_filename(name))
    path = GCODE_DIR / safe
    if not (is_safe_child(path, GCODE_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail="File not found")
    content = path.read_text(encoding="utf-8", errors="ignore")
    meta, points = _parse_gcode_points(content)
    return {**meta, "points": points}

@router.post("/gcodes/save")
async def gcodes_save(payload: GcodeSavePayload):
    safe_filename = ensure_gcode_extension(make_safe_filename(payload.name))
    target_path = GCODE_DIR / safe_filename
    if not is_safe_child(target_path, GCODE_DIR):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not payload.overwrite and target_path.exists():
        raise HTTPException(status_code=409, detail="File already exists")

    gcode_content = payload.gcode
    if gcode_content is None:
        gcode_lines = _points_to_gcode_lines(
            program_name=payload.program_name, filament_type=payload.filament_type,
            mode=payload.mode, points=payload.points,
            drying_time=payload.drying_time, drying_temp=payload.drying_temp,
        )
        gcode_content = "\n".join(gcode_lines)
    
    target_path.write_text(gcode_content, encoding="utf-8")
    return {"ok": True, "name": target_path.name, "size": target_path.stat().st_size}

@router.post("/gcodes/start")
async def start_gcode(name: str = Query(...), client: httpx.AsyncClient = Depends(get_http_client)):
    safe = ensure_gcode_extension(make_safe_filename(name))
    path = GCODE_DIR / safe
    if not (is_safe_child(path, GCODE_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        r = await client.post("/printer/print/start", json={"filename": safe})
        r.raise_for_status()
        return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

@router.delete("/gcodes")
async def delete_gcode(name: str = Query(...)):
    safe = ensure_gcode_extension(make_safe_filename(name))
    path = GCODE_DIR / safe
    if not (is_safe_child(path, GCODE_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink(missing_ok=True)
    return {"ok": True}
