from __future__ import annotations

import datetime as dt
import json
import logging
import os
import platform
import re
import asyncio
from io import BytesIO
from pathlib import Path
from settings import settings
from pydantic import BaseModel
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Tuple
from starlette.websockets import WebSocketState, WebSocketDisconnect

import httpx
from fastapi import Body, FastAPI, HTTPException, Query, Request, WebSocket
import websockets
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

class GcodeScriptPayload(BaseModel):
    script: str

class GcodeSavePayload(BaseModel):
    name: str
    program_name: str
    filament_type: Optional[str] = None # volitelný parametr
    mode: str = "annealing" # výchozí hodnota
    points: List[Dict[str, Any]]
    overwrite: bool
    drying_time: Optional[int] = None
    drying_temp: Optional[int] = None

class FileNamePayload(BaseModel):
    name: str

class SaveGcodeBody(BaseModel):
    filename: str
    gcode: str

class SaveConfigPayload(BaseModel):
    name: str
    content: str

class GenerateGcodePayload(BaseModel):
    program_name: str
    filament_type: Optional[str] = None
    mode: str = "annealing"
    points: List[Dict[str, Any]]
    drying_time: Optional[int] = None
    drying_temp: Optional[int] = None

# =========================
# ZÁKLAD / CESTY
# =========================
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

GCODE_DIR = Path(settings.gcode_dir).resolve()
CONFIG_DIR = Path(settings.config_dir).resolve()
GCODE_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kód se spustí při startu aplikace
    # Vytvoříme jednoho klienta a uložíme ho do "stavu" aplikace
    app.state.http_client = httpx.AsyncClient(
        base_url=settings.moonraker_url, # Základní URL vezmeme z nastavení
        timeout=10.0 # Výchozí timeout 10 sekund
    )
    print("INFO:     HTTPX client started.")
    yield
    # Kód se spustí při vypnutí aplikace
    await app.state.http_client.aclose()
    print("INFO:     HTTPX client closed.")

app = FastAPI(title="Pizza Oven Controller", version="1.0.0", lifespan=lifespan)
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# psutil je volitelný
try:
    import psutil  # apt install python3-psutil  /  pip install psutil
except Exception:
    psutil = None  # type: ignore

# =========================
# CORS (pokud FE a BE běží na stejné doméně/portu, můžeš klidně vypnout)
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # případně zúžit
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# STATIC / ŠABLONY
# =========================
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Výchozí stránka → /dashboard (nepoužíváme už index.html)
@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/dashboard", status_code=307)

# Alias pro staré záložky
@app.get("/index.html", include_in_schema=False)
async def index_legacy():
    return RedirectResponse(url="/dashboard", status_code=307)

# MPA stránky
@app.get("/dashboard", response_class=HTMLResponse)
async def page_dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request, "page_id": "dashboard"})

@app.get("/console", response_class=HTMLResponse)
async def page_console(request: Request):
    return templates.TemplateResponse("console.html", {"request": request, "page_id": "console"})

@app.get("/profiles", response_class=HTMLResponse)
async def page_profiles(request: Request):
    return templates.TemplateResponse("profiles.html", {"request": request, "page_id": "profiles"})

@app.get("/machine", response_class=HTMLResponse)
async def page_machine(request: Request):
    return templates.TemplateResponse("machine.html", {"request": request, "page_id": "machine"})


# =========================
# POMOCNÉ / UTIL
# =========================
SAFE_FILENAME_RE = re.compile(r"[A-Za-z0-9._ -]+")

def make_safe_filename(name: str, default: str = "program") -> str:
    if not name:
        return default
    name = name.strip()
    parts = SAFE_FILENAME_RE.findall(name)
    cleaned = "".join(parts).strip().strip(".")
    return cleaned or default

def ensure_gcode_extension(filename: str) -> str:
    return filename if filename.lower().endswith(".gcode") else f"{filename}.gcode"

def is_safe_child(path: Path, base: Path) -> bool:
    try:
        path = path.resolve()
        base = base.resolve()
        return str(path).startswith(str(base))
    except Exception:
        return False

def _forward_headers(request: Request) -> Dict[str, str]:
    # případné přeposílání X-Api-Key atp. na Moonraker
    h: Dict[str, str] = {}
    api = request.headers.get("X-Api-Key")
    if api:
        h["X-Api-Key"] = api
    return h


# =========================
# SYSTÉM / DISK
# =========================
@app.get("/api/system/host")
async def system_host():
    # OS
    try:
        os_name = platform.platform()
    except Exception:
        os_name = "Unknown OS"

    # RAM
    mem_total = mem_used = None
    if psutil:
        try:
            vm = psutil.virtual_memory()
            mem_total = int(vm.total // 1024)
            mem_used = int((vm.total - vm.available) // 1024)
        except Exception:
            pass
    if mem_total is None or mem_used is None:
        try:
            with open("/proc/meminfo") as f:
                info = f.read()
            total_kb = int(re.search(r"MemTotal:\s+(\d+)", info).group(1))
            avail_kb = int(re.search(r"MemAvailable:\s+(\d+)", info).group(1))
            mem_total = total_kb
            mem_used = total_kb - avail_kb
        except Exception:
            mem_total = 0
            mem_used = 0

    # CPU teplota
    cpu_temp = None
    if psutil and hasattr(psutil, "sensors_temperatures"):
        try:
            temps = psutil.sensors_temperatures(fahrenheit=False) or {}
            preferred = ["cpu-thermal", "cpu_thermal", "soc_thermal", "coretemp", "k10temp"]
            key = next((k for k in preferred if k in temps and temps[k]), None)
            entries = temps.get(key) if key else next(iter(temps.values()), None)
            if entries and getattr(entries[0], "current", None) is not None:
                cpu_temp = float(entries[0].current)
        except Exception:
            cpu_temp = None

    return {
        "os": os_name,
        "mem": {"total_kb": mem_total, "used_kb": mem_used, "free_kb": max(0, mem_total - mem_used)},
        "cpu_temp_c": cpu_temp,
    }

def _disk_usage_json(path: str = "/") -> Dict[str, Any]:
    if not psutil:
        return {"path": path, "total": None, "used": None, "free": None, "percent": None}
    u = psutil.disk_usage(path)
    return {
        "path": str(Path(path).resolve()),
        "total": u.total,
        "used": u.used,
        "free": u.free,
        "percent": u.percent,
    }

@app.get("/api/disk")
def get_disk():
    return _disk_usage_json("/")

@app.get("/api/disk/{mount_path:path}")
def get_disk_for_path(mount_path: str):
    return _disk_usage_json("/" + mount_path.strip("/"))


# =========================
# MOONRAKER / PRINTER
# =========================
MOONRAKER = settings.moonraker_url

@app.get("/api/printer/print_status")
async def get_print_status(request: Request):
    """Vrátí pouze stav z objektu print_stats."""
    client = request.app.state.http_client
    try:
        r = await client.get("/printer/objects/query?print_stats=state")
        r.raise_for_status()
        return r.json()
    except httpx.RequestError:
        # Během restartu je normální, že je služba dočasně nedostupná
        return JSONResponse(status_code=503, content={"error": "Klipper is restarting"})
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

@app.get("/api/status")
async def status_alias():
    return await status_ext()

@app.get("/api/temps")
async def temps_api(request: Request):
    """Sjednocené teploty ze všech dostupných objektů."""
    client = request.app.state.http_client
    try:
        # Krok 1: Zjisti, jaké teplotní senzory jsou k dispozici
        r_list = await client.get("/printer/objects/list")
        r_list.raise_for_status()
        obj_list = (r_list.json().get("result", {}) or {}).get("objects", [])

        # Krok 2: Vyber jen ty, které nás zajímají
        wanted: List[str] = []
        for obj in obj_list:
            if (
                obj in ("extruder", "heater_bed")
                or obj.startswith("heater_generic ")
                or obj.startswith("temperature_sensor ")
            ):
                wanted.append(obj)
        if not wanted:
            return {}

        # Krok 3: Sestav dotaz na jejich aktuální hodnoty
        query: Dict[str, List[str]] = {}
        for obj in wanted:
            if obj.startswith("temperature_sensor "):
                query[obj] = ["temperature"]
            else:
                query[obj] = ["temperature", "target"]

        # Krok 4: Odešli dotaz a zpracuj odpověď
        r_q = await client.post("/printer/objects/query", json={"objects": query})
        r_q.raise_for_status()
        parsed = (r_q.json().get("result", {}) or {}).get("status", {})

        # Krok 5: Připrav a vrať finální strukturu dat
        out: Dict[str, Dict[str, Optional[float]]] = {}
        for name, vals in parsed.items():
            actual = vals.get("temperature")
            target = vals.get("target") if "target" in vals else None
            out[name] = {"actual": actual, "target": target}
        return out

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Error from Moonraker: {e.response.text}",
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")
    except Exception as e:
        # TENTO BLOK TEĎ MUSÍ BÝT SPRÁVNĚ ODSAZENÝ UVNITŘ FUNKCE
        logging.error(f"Unexpected error in temps_api: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.get("/api/printer/status_ext")
async def status_ext():
    """Rozšířený stav tisku s progress/ETA."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            q = {
                "display_status": ["progress"],
                "print_stats": ["state", "filename", "print_duration"],
                "toolhead": ["position"],
                "gcode_move": ["speed_factor", "extrude_factor"],
            }
            r = await client.post(f"{MOONRAKER}/printer/objects/query", json={"objects": q})
            res = r.json().get("result", {}) or {}
            st = res.get("status", {}) or {}

            state = (st.get("print_stats") or {}).get("state")
            filename = (st.get("print_stats") or {}).get("filename")
            print_duration = (st.get("print_stats") or {}).get("print_duration") or 0.0
            progress = (st.get("display_status") or {}).get("progress") or 0.0
            pos = (st.get("toolhead") or {}).get("position") or [0, 0, 0, 0]
            z_height = pos[2] if len(pos) >= 3 else None
            speed_factor = (st.get("gcode_move") or {}).get("speed_factor") or 1.0
            extrude_factor = (st.get("gcode_move") or {}).get("extrude_factor") or 1.0

            eta_s = None
            try:
                p = float(progress)
                if p > 0.0 and print_duration:
                    eta_s = max(0, int(print_duration * (1.0 / p - 1.0)))
            except Exception:
                eta_s = None

            return {
                "state": state,
                "progress": progress,
                "elapsed_s": int(print_duration) if print_duration else None,
                "eta_s": eta_s,
                "file": {"name": filename} if filename else None,
                "z_height": z_height,
                "speed_multiplier": speed_factor,
                "flow_multiplier": extrude_factor,
            }
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/console/send")
async def console_send(request: Request):
    data = await request.json()
    script = (data.get("script") or "").strip()
    if not script:
        raise HTTPException(status_code=400, detail="Missing script")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{MOONRAKER}/printer/gcode/script", json={"script": script})
            return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")

# TENTO CELÝ BLOK PŘIDEJ DO main.py
@app.websocket("/websocket")
async def websocket_proxy(client_ws: WebSocket):
    """
    Tato funkce funguje jako proxy. Přijme WebSocket spojení od klienta (z prohlížeče)
    a přepošle veškerou komunikaci na skutečný WebSocket server Moonrakeru.
    """
    await client_ws.accept()
    moonraker_uri = f"ws://{settings.moonraker_url.split('//')[1]}/websocket"

    try:
        async with websockets.connect(moonraker_uri) as server_ws:
            print("INFO:     WebSocket proxy connected to Moonraker.")

            async def client_to_server():
                """Čte zprávy od klienta a posílá je na server."""
                while True:
                    message = await client_ws.receive_text()
                    await server_ws.send(message)

            async def server_to_client():
                """Čte zprávy ze serveru a posílá je klientovi."""
                while True:
                    message = await server_ws.recv()
                    await client_ws.send_text(message)

            await asyncio.gather(client_to_server(), server_to_client())

    # Ošetření normálního odpojení ze strany klienta (prohlížeče)
    except WebSocketDisconnect as e:
        print(f"INFO:     Client WebSocket disconnected: {e.code}")

    # Ošetření normálního odpojení ze strany Moonrakeru
    except (websockets.exceptions.ConnectionClosed, websockets.exceptions.ConnectionClosedOK) as e:
        print(f"INFO:     Moonraker WebSocket connection closed: {e.code} {e.reason}")
    
    # Ošetření ostatních, neočekávaných chyb
    except Exception as e:
        print(f"ERROR:    An unexpected WebSocket proxy error occurred: {e}")
    
    # Blok finally už není potřeba, protože 'async with' a 'WebSocketDisconnect'
    # se postarají o korektní uzavření na obou stranách.

# =========================
# UPDATE MANAGER (proxy)
# =========================
@app.get("/api/update/status")
async def update_status(request: Request):
    try:
        async with httpx.AsyncClient(timeout=10, headers=_forward_headers(request)) as client:
            r = await client.get(f"{MOONRAKER}/machine/update/status")
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

@app.post("/api/update/refresh")
async def update_refresh(request: Request):
    try:
        async with httpx.AsyncClient(timeout=30, headers=_forward_headers(request)) as client:
            r = await client.post(f"{MOONRAKER}/machine/update/refresh")
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

@app.post("/api/update/update")
async def update_component(name: str = Query(..., description="Component name"), request: Request = None):
    if not name:
        raise HTTPException(status_code=400, detail="Missing name")
    try:
        async with httpx.AsyncClient(timeout=None, headers=_forward_headers(request)) as client:
            r = await client.post(f"{MOONRAKER}/machine/update/update", json={"name": name})
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

@app.post("/api/update/update_all")
async def update_all(request: Request):
    try:
        async with httpx.AsyncClient(timeout=None, headers=_forward_headers(request)) as client:
            r = await client.post(f"{MOONRAKER}/machine/update/update_all")
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)


# =========================
# G-CODE: generování / ukládání / načítání / správa
# =========================
def _points_to_gcode_lines(program_name: str, filament_type: str, mode: str, points: List[Dict[str, int]], drying_time: Optional[int], drying_temp: Optional[int]) -> List[str]:
    speed = 2  # °C/min (příklad)
    lines = ["; Generated G-code", f"; Program: {program_name}"]
    if filament_type:
        safe_fil = filament_type.replace('"', "'")
        lines.append(f'; filament_settings_id = "{safe_fil}"')

    # Ulož i meta JSON do hlavičky (kvůli editoru)
    meta = {"program_name": program_name, "filament_type": filament_type, "mode": mode, "points": points}
    lines.append(";PIZZA_META_START")
    lines.append(";" + json.dumps(meta, ensure_ascii=False))
    lines.append(";PIZZA_META_END")

    if mode == "annealing":
        pts = sorted(
            [{"time": int(p["time"]), "temp": int(p["temp"])} for p in points],
            key=lambda p: p["time"],
        )
        if pts:
            lines.append(f'; start_temp = {pts[0]["temp"]}')
        for i in range(len(pts) - 1):
            dt = pts[i + 1]["time"] - pts[i]["time"]
            if dt <= 0:
                continue
            target = int(pts[i + 1]["temp"])
            lines.append(f"TEMP_RAMP TEMP={target} DURATION={int(dt)} SPEED={speed}")

    elif mode == "drying":
        if isinstance(drying_time, (int, float)) and isinstance(drying_temp, (int, float)):
            lines.append(f"; start_temp = {int(drying_temp)}")
            lines.append(f"TEMP_RAMP TEMP={int(drying_temp)} DURATION={int(drying_time)} SPEED={speed}")

    lines.append("SET_HEATER_TEMPERATURE HEATER=pizza_oven TARGET=0")
    return lines

def _parse_gcode_points(content: str) -> Tuple[Dict[str, Any], List[Dict[str, int]]]:
    """
    Z hlavičky zkus vytáhnout JSON meta; pokud není, zkus heuristiku z TEMP_RAMP.
    Vrací: (meta, points)
    """
    meta: Dict[str, Any] = {}
    points: List[Dict[str, int]] = []

    # 1) JSON meta v komentáři
    try:
        if ";PIZZA_META_START" in content and ";PIZZA_META_END" in content:
            block = content.split(";PIZZA_META_START", 1)[1].split(";PIZZA_META_END", 1)[0]
            # očekáváme řádek začínající ';{...}'
            for line in block.splitlines():
                line = line.strip()
                if line.startswith(";{") and line.endswith("}"):
                    j = json.loads(line[1:])
                    if isinstance(j, dict):
                        meta = j
                        pts = j.get("points")
                        if isinstance(pts, list):
                            for p in pts:
                                t = int(p.get("time", 0))
                                temp = int(p.get("temp", 0))
                                points.append({"time": t, "temp": temp})
                        break
    except Exception:
        pass

    if points:
        return meta, sorted(points, key=lambda p: p["time"])

    # 2) Heuristika TEMP_RAMP → body
    time_cursor = 0
    start_temp = None
    for line in content.splitlines():
        s = line.strip()
        if not s or s.startswith(";"):
            # zkus hlavičku
            mname = re.search(r"^; Program:\s*(.+)$", s)
            if mname:
                meta.setdefault("program_name", mname.group(1).strip())
            mfil = re.search(r'^; filament_settings_id\s*=\s*"(.+)"', s)
            if mfil:
                meta.setdefault("filament_type", mfil.group(1).strip())
            mstart = re.search(r"^; start_temp\s*=\s*(\d+)", s)
            if mstart:
                start_temp = int(mstart.group(1))
            continue
        if s.startswith("TEMP_RAMP"):
            # TEMP_RAMP TEMP=xxx DURATION=yyy ...
            mt = re.search(r"TEMP=(\d+)", s)
            md = re.search(r"DURATION=(\d+)", s)
            if mt and md:
                temp = int(mt.group(1))
                dur = int(md.group(1))
                if start_temp is None:
                    start_temp = temp
                # Vytvoř body pro konec úseku
                points.append({"time": time_cursor, "temp": start_temp if points == [] else points[-1]["temp"]})
                time_cursor += max(0, dur)
                points.append({"time": time_cursor, "temp": temp})
                start_temp = temp

    # dedupe & seřadit
    uniq: List[Dict[str, int]] = []
    for p in sorted(points, key=lambda x: x["time"]):
        if not uniq or (uniq[-1]["time"] != p["time"] or uniq[-1]["temp"] != p["temp"]):
            uniq.append(p)
    return meta, uniq

@app.post("/api/generate_gcode")
async def generate_gcode(payload: GenerateGcodePayload):
    lines = _points_to_gcode_lines(
        program_name=payload.program_name,
        filament_type=payload.filament_type,
        mode=payload.mode,
        points=payload.points,
        drying_time=payload.drying_time,
        drying_temp=payload.drying_temp,
    )
    return JSONResponse({"gcode": "\n".join(lines)})

    lines = _points_to_gcode_lines(program_name, filament_type, mode, points, drying_time, drying_temp)
    return JSONResponse({"gcode": "\n".join(lines)})

@app.post("/api/save_gcode")
async def save_gcode(payload: Dict[str, Any] = Body(...)):
    filename = (payload.get("filename") or "").strip()
    gcode = (payload.get("gcode") or "").rstrip()
    if not filename or not gcode:
        raise HTTPException(status_code=400, detail="Missing filename or gcode")
    safe = make_safe_filename(filename)
    safe = ensure_gcode_extension(safe)
    target = (GCODE_DIR / safe).resolve()
    if not is_safe_child(target, GCODE_DIR):
        raise HTTPException(status_code=400, detail="Invalid filename")
    target.write_text(gcode, encoding="utf-8")
    return {"ok": True, "filename": target.name}

@app.get("/api/gcodes")
async def list_gcodes():
    files: List[Dict[str, Any]] = []
    for p in sorted(GCODE_DIR.glob("*.gcode")):
        try:
            stat = p.stat()
            # Zkusíme z hlavičky získat filament_type
            fil = None
            with p.open("r", encoding="utf-8", errors="ignore") as f:
                head = f.read(4000)
            m = re.search(r'^; filament_settings_id\s*=\s*"(.+)"', head, flags=re.M)
            if m:
                fil = m.group(1)
            files.append({
                "name": p.name,
                "size": stat.st_size,
                "mtime": int(stat.st_mtime),
                "filament_type": fil
            })
        except Exception:
            continue
    return {"files": files}

@app.get("/api/gcodes/download")
async def download_gcode(name: str = Query(...)):
    safe = make_safe_filename(name)
    safe = ensure_gcode_extension(safe)
    path = (GCODE_DIR / safe).resolve()
    if not (is_safe_child(path, GCODE_DIR) and path.exists()):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="text/plain", filename=path.name)

@app.get("/api/gcodes/load")
async def load_gcode_meta(name: str = Query(...)):
    safe = make_safe_filename(name)
    safe = ensure_gcode_extension(safe)
    path = (GCODE_DIR / safe).resolve()
    if not (is_safe_child(path, GCODE_DIR) and path.exists()):
        raise HTTPException(status_code=404, detail="File not found")
    content = path.read_text(encoding="utf-8", errors="ignore")
    meta, points = _parse_gcode_points(content)
    return {
        "program_name": meta.get("program_name") or "",
        "filament_type": meta.get("filament_type") or "",
        "mode": meta.get("mode") or "annealing",
        "points": points,
    }

@app.post("/api/gcodes/save")
async def gcodes_save(payload: GcodeSavePayload):

    safe_filename = make_safe_filename(payload.name)
    safe_filename = ensure_gcode_extension(safe_filename)
    target_path = (GCODE_DIR / safe_filename).resolve()

    if not is_safe_child(target_path, GCODE_DIR):
        raise HTTPException(status_code=400, detail="Invalid file name or path")

    if not payload.overwrite and target_path.exists():
        raise HTTPException(
            status_code=409, 
            detail=f"File '{target_path.name}' already exists. Use overwrite=true to replace it."
        )

    gcode_lines = _points_to_gcode_lines(
        program_name=payload.program_name,
        filament_type=payload.filament_type,
        mode=payload.mode,
        points=payload.points,
        drying_time=payload.drying_time,
        drying_temp=payload.drying_temp,
    )

    try:
        target_path.write_text("\n".join(gcode_lines), encoding="utf-8")
        return {"ok": True, "name": target_path.name}
    except Exception as e:
        logging.error(f"Failed to write G-code file {target_path.name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save file to disk.")

@app.post("/api/gcodes/start")
async def start_gcode(name: str = Query(...)):
    safe = make_safe_filename(name)
    safe = ensure_gcode_extension(safe)
    path = (GCODE_DIR / safe).resolve()
    if not (is_safe_child(path, GCODE_DIR) and path.exists()):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{MOONRAKER}/printer/print/start", json={"filename": safe})
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Moonraker unreachable: {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

@app.delete("/api/gcodes")
async def delete_gcode(name: str = Query(...)):
    safe = make_safe_filename(name)
    safe = ensure_gcode_extension(safe)
    path = (GCODE_DIR / safe).resolve()
    if not (is_safe_child(path, GCODE_DIR) and path.exists()):
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink(missing_ok=True)
    return {"ok": True}


# =========================
# CONFIG FILES (Machine)
# =========================
def _iter_config_files(base: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        try:
            st = p.stat()
            name = str(p.relative_to(base))
            out.append({"name": name, "size": st.st_size, "mtime": int(st.st_mtime)})
        except Exception:
            continue
    return out

@app.get("/api/config/files")
async def config_files():
    return {"files": _iter_config_files(CONFIG_DIR)}

@app.get("/api/config/file")
async def get_config_file(name: str = Query(..., description="Relative path in config dir")):
    rel = Path(name)
    path = (CONFIG_DIR / rel).resolve()
    if not (is_safe_child(path, CONFIG_DIR) and path.exists()):
        raise HTTPException(status_code=404, detail="File not found")
    txt = path.read_text(encoding="utf-8", errors="ignore")
    return {"name": str(rel), "content": txt}

@app.post("/api/config/file")
async def save_config_file(payload: SaveConfigPayload):
    path = (CONFIG_DIR / payload.name.strip()).resolve()
    if not is_safe_child(path, CONFIG_DIR):
        raise HTTPException(status_code=400, detail="Invalid name")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload.content, encoding="utf-8")
    return {"ok": True, "name": payload.name}

@app.post("/api/create-file")
async def create_empty_file(payload: FileNamePayload): # Změna zde
    # Díky modelu už nemusíme kontrolovat, jestli 'name' existuje.
    path = (CONFIG_DIR / payload.name.strip()).resolve() # Použijeme payload.name
    if not is_safe_child(path, CONFIG_DIR):
        raise HTTPException(status_code=400, detail="Invalid name")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text("", encoding="utf-8")
    return {"ok": True, "name": payload.name}

@app.delete("/api/delete-file")
async def delete_file(payload: FileNamePayload): # Změna zde
    path = (CONFIG_DIR / payload.name.strip()).resolve() # Použijeme payload.name
    if not (is_safe_child(path, CONFIG_DIR) and path.exists()):
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink(missing_ok=True)
    return {"ok": True}


# =========================
# DEBUG: výpis rout
# =========================
@app.get("/__routes", response_class=PlainTextResponse)
def __routes():
    lines = []
    for r in app.router.routes:
        methods = ",".join(sorted(r.methods)) if getattr(r, "methods", None) else ""
        path = getattr(r, "path", "")
        lines.append(f"{methods:9} {path}")
    return "\n".join(sorted(lines))
