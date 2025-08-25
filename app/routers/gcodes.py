# app/routers/gcodes.py
import logging
import json
import re
from pathlib import Path
import httpx
from fastapi import APIRouter, HTTPException, Query, Depends, Path as FastApiPath
from typing import Any, Dict, List

from .. import settings
from ..utils import is_safe_child, make_safe_filename
from ..dependencies import get_http_client
from ..models import GcodeSavePayload, FileNamePayload, DuplicateProfilePayload

GCODES_DIR = Path(settings.GCODES_DIR).resolve()
PROFILE_PREFIX = "oven_"

router = APIRouter(
    prefix="/api/gcodes",
    tags=["gcodes"],
)

def _parse_metadata(content: str) -> Dict[str, Any]:
    """Parses a JSON metadata line from G-code comments."""
    try:
        for line in content.splitlines():
            if line.strip().startswith("; METADATA:"):
                json_str = line.replace("; METADATA:", "").strip()
                return json.loads(json_str)
    except Exception:
        pass
    return {}

@router.get("/")
async def list_profiles() -> Dict[str, List[Dict[str, Any]]]:
    """Lists saved profiles (oven_*.gcode files from the gcodes directory)."""
    files: List[Dict[str, Any]] = []
    if not GCODES_DIR.exists():
        logging.warning(f"G-codes directory not found: {GCODES_DIR}")
        return {"files": []}
    
    for p in sorted(GCODES_DIR.glob(f"{PROFILE_PREFIX}*.gcode")):
        try:
            stat = p.stat()
            content = p.read_text(encoding="utf-8", errors="ignore")
            metadata = _parse_metadata(content)
            profile_name = p.name.replace(PROFILE_PREFIX, "", 1).replace(".gcode", "", 1)
            files.append({
                "name": profile_name,
                "filament_type": metadata.get("filament_type"),
                "size": stat.st_size, 
                "mtime": int(stat.st_mtime)
            })
        except Exception as e:
            logging.error(f"Failed to process profile file {p.name}: {e}", exc_info=True)
            continue
    return {"files": files}

@router.get("/{name}")
async def get_profile_details(name: str = FastApiPath(..., description="Name of the profile to load")):
    """Loads raw G-code, metadata, and chart points for a single profile."""
    safe_name = make_safe_filename(name)
    file_name = f"{PROFILE_PREFIX}{safe_name}.gcode"
    path = GCODES_DIR / file_name

    if not (is_safe_child(path, GCODES_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Profile '{safe_name}' not found.")

    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
        metadata = _parse_metadata(content)
        
        points = []
        current_time_min = 0.0
        last_temp = settings.AMBIENT_TEMP

        is_drying = metadata.get("type") == "drying"
        
        raw_segments = []
        add_segment_regex = re.compile(r"ADD_SEGMENT\s+TEMP=([0-9.]+)\s+RAMP_TIME=([0-9.]+)\s+HOLD_TIME=([0-9.]+)", re.IGNORECASE)
        for line in content.splitlines():
            match = add_segment_regex.match(line.strip())
            if match:
                raw_segments.append({
                    "temp": float(match.group(1)),
                    "ramp_time": float(match.group(2)),
                    "hold_time": float(match.group(3))
                })
        
        if is_drying and raw_segments:
            drying_temp = raw_segments[0]["temp"]
            drying_duration_min = raw_segments[0]["hold_time"] / 60
            points.append({"time": 0, "temp": drying_temp})
            points.append({"time": round(drying_duration_min, 2), "temp": drying_temp})
        else: # Annealing
            points.append({"time": 0, "temp": last_temp})
            for seg in raw_segments:
                temp = seg["temp"]
                ramp_time_min = seg["ramp_time"] / 60
                hold_time_min = seg["hold_time"] / 60
                
                if temp != last_temp:
                    points.append({"time": round(current_time_min, 2), "temp": last_temp})
                
                current_time_min += ramp_time_min
                points.append({"time": round(current_time_min, 2), "temp": temp})
                
                if hold_time_min > 0:
                    current_time_min += hold_time_min
                    points.append({"time": round(current_time_min, 2), "temp": temp})
                
                last_temp = temp

        return {
            "name": safe_name,
            "gcode": content,
            "metadata": metadata,
            "points": points
        }

    except Exception as e:
        logging.error(f"Error processing profile {safe_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error reading or parsing profile file: {e}")

@router.post("/save")
async def save_profile_gcode(payload: GcodeSavePayload):
    safe_name = make_safe_filename(payload.name)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid program name.")

    if not payload.gcode:
        raise HTTPException(status_code=400, detail="G-code content cannot be empty.")

    metadata = {
        "name": payload.program_name or safe_name,
        "filament_type": payload.filament_type,
        "type": payload.mode,
        "version": 1.0
    }
    
    header = f"; METADATA: {json.dumps(metadata)}\n"
    gcode_body = "\n".join([line for line in payload.gcode.splitlines() if not line.strip().startswith("; METADATA:")])
    full_content = header + gcode_body

    file_name = f"{PROFILE_PREFIX}{safe_name}.gcode"
    path = GCODES_DIR / file_name

    if not is_safe_child(path, GCODES_DIR):
         raise HTTPException(status_code=400, detail="Invalid file path.")
    
    try:
        path.write_text(full_content, encoding="utf-8")
        logging.info(f"Profile successfully saved to file: {path}")
    except Exception as e:
        logging.error(f"Failed to save profile {safe_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Error while saving file: {e}")
        
    return {"ok": True, "name": safe_name}


@router.post("/start")
async def start_profile(payload: FileNamePayload, client: httpx.AsyncClient = Depends(get_http_client)):
    safe_name = make_safe_filename(payload.name)
    file_to_print = f"{PROFILE_PREFIX}{safe_name}.gcode"
    
    path = GCODES_DIR / file_to_print
    if not (is_safe_child(path, GCODES_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Profile file '{file_to_print}' not found.")

    script = f'SDCARD_PRINT_FILE FILENAME="{file_to_print}"'
    
    try:
        r = await client.post("/printer/gcode/script", params={"script": script})
        r.raise_for_status()
        return {"ok": True, "response": r.json()}
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Moonraker service unavailable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Error from Klipper: {e.response.text}")

@router.post("/duplicate")
async def duplicate_profile(payload: DuplicateProfilePayload): # Změna payloadu
    """Duplicates an existing profile with a new user-provided name."""
    safe_original_name = make_safe_filename(payload.originalName)
    original_file_name = f"{PROFILE_PREFIX}{safe_original_name}.gcode"
    original_path = GCODES_DIR / original_file_name

    if not (is_safe_child(original_path, GCODES_DIR) and original_path.is_file()):
        raise HTTPException(status_code=404, detail=f"Original profile '{safe_original_name}' not found.")

    safe_new_name = make_safe_filename(payload.newName)
    if not safe_new_name:
        raise HTTPException(status_code=400, detail="The new profile name is invalid.")

    new_file_name = f"{PROFILE_PREFIX}{safe_new_name}.gcode"
    new_path = GCODES_DIR / new_file_name

    if new_path.exists():
        raise HTTPException(status_code=400, detail=f"A profile with the name '{safe_new_name}' already exists.")

    try:
        original_content = original_path.read_text(encoding="utf-8")
        metadata = _parse_metadata(original_content)
        
        metadata["name"] = safe_new_name
        
        header = f"; METADATA: {json.dumps(metadata)}\n"
        gcode_body = "\n".join([line for line in original_content.splitlines() if not line.strip().startswith("; METADATA:")])
        new_content = header + gcode_body
        
        new_path.write_text(new_content, encoding="utf-8")
        logging.info(f"Profile '{safe_original_name}' duplicated to '{safe_new_name}'")
        return {"ok": True, "newName": safe_new_name}
    except Exception as e:
        logging.error(f"Failed to duplicate profile {safe_original_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Error while duplicating file: {e}")

@router.delete("/")
async def delete_profile(name: str = Query(...)) -> Dict[str, bool]:
    if not name or ".." in name or "/" in name:
        raise HTTPException(status_code=400, detail="Invalid file name.")
    
    file_name = f"{PROFILE_PREFIX}{make_safe_filename(name)}.gcode"
    path = GCODES_DIR / file_name
    
    if not (is_safe_child(path, GCODES_DIR) and path.is_file()):
        raise HTTPException(status_code=404, detail=f"Profile '{name}' not found.")
    
    try:
        path.unlink()
        return {"ok": True}
    except Exception as e:
        logging.error(f"Failed to delete profile {name}: {e}")
        raise HTTPException(status_code=500, detail=f"Error while deleting file: {e}")