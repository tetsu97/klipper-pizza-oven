# app/routers/gcodes.py
import logging
from pathlib import Path
import httpx
from fastapi import APIRouter, HTTPException, Query, Depends, Path as FastApiPath
from typing import Any, Dict, List

# CHANGE: Import GCODES_DIR instead of CONFIG_DIR from settings
from .. import settings
from ..utils import is_safe_child, make_safe_filename
from ..dependencies import get_http_client
from ..models import GcodeSavePayload, FileNamePayload
from ..settings import AMBIENT_TEMP

# CHANGE: Use GCODES_DIR as the base directory for profiles
GCODES_DIR = Path(settings.GCODES_DIR).resolve()

router = APIRouter(
    prefix="/api/gcodes",
    tags=["gcodes"],
)

@router.get("/")
async def list_profiles() -> Dict[str, List[Dict[str, Any]]]:
    """Lists saved profiles (pizza_*.cfg files from the gcodes directory)."""
    files: List[Dict[str, Any]] = []
    if not GCODES_DIR.exists():
        logging.warning(f"G-codes directory not found: {GCODES_DIR}")
        return {"files": []}
    
    # The logic remains the same, just the directory changes
    for p in sorted(GCODES_DIR.glob("pizza_*.cfg")):
        try:
            stat = p.stat()
            profile_name = p.name.replace("pizza_", "", 1).replace(".cfg", "", 1)
            files.append({
                "name": profile_name, 
                "size": stat.st_size, 
                "mtime": int(stat.st_mtime)
            })
        except Exception as e:
            logging.error(f"Failed to process profile file {p.name}: {e}", exc_info=True)
            continue
    return {"files": files}

@router.get("/{name}")
async def get_profile_details(name: str = FastApiPath(..., description="Name of the profile to load")):
    """Loads the details and segments of a single profile for UI display."""
    safe_name = make_safe_filename(name)
    file_name = f"pizza_{safe_name}.cfg"
    path = GCODES_DIR / file_name

    if not (is_safe_child(path, GCODES_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Profile '{safe_name}' not found.")

    try:
        content = path.read_text(encoding="utf-8").strip()
        lines = content.split('\n')
        
        points = []
        current_time_min = 0
        previous_temp = AMBIENT_TEMP
        
        points.append({"time": 0, "temp": previous_temp})
        
        for i, line in enumerate(lines):
            if not line.strip():
                continue
            
            parts = line.split(":")
            if len(parts) != 4:
                logging.warning(f"Skipping invalid line in profile {safe_name}: {line}")
                continue

            temp, ramp_time_sec, hold_time_sec, _ = map(float, parts)

            if i > 0 and temp != previous_temp:
                 points.append({"time": round(current_time_min, 2), "temp": previous_temp})

            current_time_min += ramp_time_sec / 60
            points.append({"time": round(current_time_min, 2), "temp": temp})
            
            if hold_time_sec > 0:
                current_time_min += hold_time_sec / 60
                points.append({"time": round(current_time_min, 2), "temp": temp})
            
            previous_temp = temp

        if len(points) > 1 and points[0]['time'] == points[1]['time'] and points[0]['temp'] == points[1]['temp']:
            points.pop(0)

        return {"name": safe_name, "points": points}

    except Exception as e:
        logging.error(f"Error parsing profile {safe_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error reading profile file: {e}")

async def _send_gcode(client: httpx.AsyncClient, script: str):
    """Helper function to send G-code."""
    try:
        r = await client.post("/printer/gcode/script", params={"script": script})
        r.raise_for_status()
        return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Moonraker service unavailable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Error from Klipper: {e.response.text}")

@router.post("/save")
async def save_profile(payload: GcodeSavePayload):
    """Builds and directly saves the profile file to the gcodes directory."""
    safe_name = make_safe_filename(payload.name)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid program name.")

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
         raise HTTPException(status_code=400, detail="Missing data to create profile.")

    file_name = f"pizza_{safe_name}.cfg"
    path = GCODES_DIR / file_name

    if not is_safe_child(path, GCODES_DIR):
         raise HTTPException(status_code=400, detail="Invalid file path.")
    try:
        path.write_text("\n".join(profile_content) + "\n", encoding="utf-8")
        logging.info(f"Profile was successfully saved to file: {path}")
    except Exception as e:
        logging.error(f"Failed to save profile {safe_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Error while saving file: {e}")
        
    return {"ok": True, "name": safe_name}

@router.post("/start")
async def start_profile(payload: FileNamePayload, client: httpx.AsyncClient = Depends(get_http_client)):
    """Starts the selected profile (LOAD_PROGRAM, EXECUTE_PROGRAM)."""
    safe_name = make_safe_filename(payload.name)
    await _send_gcode(client, f'LOAD_PROGRAM NAME="{safe_name}"')
    await _send_gcode(client, 'EXECUTE_PROGRAM')
    return {"ok": True}

@router.delete("/")
async def delete_profile(name: str = Query(...)) -> Dict[str, bool]:
    """Deletes the profile file."""
    if not name or ".." in name or "/" in name:
        raise HTTPException(status_code=400, detail="Invalid file name.")
    
    file_name = f"pizza_{make_safe_filename(name)}.cfg"
    path = GCODES_DIR / file_name
    
    if not (is_safe_child(path, GCODES_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found.")
    
    try:
        path.unlink()
        return {"ok": True}
    except Exception as e:
        logging.error(f"Failed to delete profile {name}: {e}")
        raise HTTPException(status_code=500, detail=f"Error while deleting file: {e}")