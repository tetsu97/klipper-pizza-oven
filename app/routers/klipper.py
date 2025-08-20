# app/routers/klipper.py
import httpx
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from typing import List, Dict, Optional, Any

from ..dependencies import get_http_client
from ..models import GcodeScriptPayload

router = APIRouter(
    prefix="/api",
    tags=["klipper"],
)

@router.get("/printer/print_status")
async def get_print_status(client: httpx.AsyncClient = Depends(get_http_client)) -> Dict[str, Any]:
    """Vrátí pouze stav z objektu print_stats."""
    try:
        r = await client.get("/printer/objects/query?print_stats=state")
        r.raise_for_status()
        return r.json()
    except httpx.RequestError:
        return {"error": "Klipper is restarting", "status": 503}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

@router.get("/status")
@router.get("/printer/status_ext")
async def status_ext(client: httpx.AsyncClient = Depends(get_http_client)) -> Dict[str, Any]:
    """Rozšířený stav tisku s progress/ETA."""
    try:
        q = {
            "display_status": ["progress"],
            "print_stats": ["state", "filename", "print_duration"],
            "toolhead": ["position"],
            "gcode_move": ["speed_factor", "extrude_factor"],
        }
        r = await client.post("/printer/objects/query", json={"objects": q})
        r.raise_for_status()
        st = (r.json().get("result", {}) or {}).get("status", {}) or {}

        state = (st.get("print_stats") or {}).get("state")
        filename = (st.get("print_stats") or {}).get("filename")
        print_duration = (st.get("print_stats") or {}).get("print_duration") or 0.0
        progress = (st.get("display_status") or {}).get("progress") or 0.0
        
        eta_s = None
        if progress > 0.001 and print_duration > 0:
            eta_s = max(0, int(print_duration * (1.0 / progress - 1.0)))

        return {
            "state": state, "progress": progress, "elapsed_s": int(print_duration),
            "eta_s": eta_s, "file": {"name": filename} if filename else None,
        }
    except (httpx.RequestError, httpx.HTTPStatusError) as e:
        return {"error": str(e)}

@router.post("/console/send")
async def console_send(payload: GcodeScriptPayload, client: httpx.AsyncClient = Depends(get_http_client)) -> Dict[str, Any]:
    """Odešle G-code skript do Klipperu."""
    if not payload.script:
        raise HTTPException(status_code=400, detail="Příkaz nesmí být prázdný (Script cannot be empty).")
    try:
        r = await client.post("/printer/gcode/script", params={"script": payload.script})
        r.raise_for_status()
        return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Služba Moonraker není dostupná: {e} (Moonraker service unavailable).")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Chyba od Klipperu: {e.response.text} (Error from Klipper).")

@router.get("/api/temps")
async def temps_api(client: httpx.AsyncClient = Depends(get_http_client)) -> Dict[str, Dict[str, Optional[float]]]:
    """Sjednocené teploty ze všech dostupných objektů."""
    try:
        r_list = await client.get("/printer/objects/list")
        r_list.raise_for_status()
        obj_list = (r_list.json().get("result", {}) or {}).get("objects", [])

        wanted = [
            obj for obj in obj_list 
            if obj in ("extruder", "heater_bed") or obj.startswith(("heater_generic ", "temperature_sensor "))
        ]
        
        if not wanted:
            return {}

        query = {
            obj: ["temperature"] if obj.startswith("temperature_sensor ") else ["temperature", "target"] 
            for obj in wanted
        }
        
        r_q = await client.post("/printer/objects/query", json={"objects": query})
        r_q.raise_for_status()
        parsed = (r_q.json().get("result", {}) or {}).get("status", {})

        out: Dict[str, Dict[str, Optional[float]]] = {}
        for name, vals in parsed.items():
            out[name] = {"actual": vals.get("temperature"), "target": vals.get("target")}
        return out
        
    except httpx.RequestError as e:
        # Chyba sítě - Moonraker není dostupný
        raise HTTPException(status_code=503, detail=f"Služba Moonraker není dostupná: {e} (Moonraker service unavailable).")
    
    except httpx.HTTPStatusError as e:
        # Jakákoliv HTTP chyba od Moonrakeru (např. 404, 500)
        raise HTTPException(status_code=e.response.status_code, detail=f"Chyba od Moonrakeru: {e.response.text}")
        
    except Exception as e:
        # Neočekávaná chyba - zalogujeme ji pro ladění
        logging.error(f"Neočekávaná chyba při získávání teplot: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Neočekávaná chyba serveru: {e} (Unexpected server error).")