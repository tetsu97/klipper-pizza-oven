# app/main.py
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import logging

from .logging_config import setup_logging
from .dependencies import lifespan
from .routers import system, klipper, websocket, update, gcodes, config

# Nastavení logování a cest
setup_logging()
BASE_DIR = Path(__file__).resolve().parent.parent # Nyní jsme o úroveň hlouběji
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Pizza Oven Controller", version="1.0.0", lifespan=lifespan)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Připojení statických souborů a šablon
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Zahrnutí všech routerů
app.include_router(system.router)
app.include_router(klipper.router)
app.include_router(websocket.router)
app.include_router(update.router)
app.include_router(gcodes.router)
app.include_router(config.router)

# =========================
# Endpoity pro servírování stránek
# =========================
@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/dashboard", status_code=307)

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
# DEBUG: výpis rout
# =========================
@app.get("/__routes", response_class=PlainTextResponse, include_in_schema=False)
def list_routes():
    lines = []
    for route in app.routes:
        methods = ",".join(route.methods) if hasattr(route, "methods") else ""
        lines.append(f"{methods:<8} {route.path}")
    return "\n".join(sorted(lines))
