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
from .routers import system, klipper, websocket, update, gcodes, config, installer, power

setup_logging()
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Pizza Oven Controller", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

app.include_router(system.router)
app.include_router(klipper.router)
app.include_router(websocket.router)
app.include_router(update.router)
app.include_router(gcodes.router)
app.include_router(config.router)
app.include_router(installer.router)
app.include_router(power.router)

@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/dashboard", status_code=307)

@app.get("/dashboard", response_class=HTMLResponse)
async def page_dashboard(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("dashboard.html", {"request": request, "page_id": "dashboard"})

@app.get("/console", response_class=HTMLResponse)
async def page_console(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("console.html", {"request": request, "page_id": "console"})

@app.get("/profiles", response_class=HTMLResponse)
async def page_profiles(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("profiles.html", {"request": request, "page_id": "profiles"})

@app.get("/machine", response_class=HTMLResponse)
async def page_machine(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("machine.html", {"request": request, "page_id": "machine"})

@app.get("/display", response_class=HTMLResponse, include_in_schema=False)
async def page_display(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("display.html", {"request": request})

@app.get("/__routes", response_class=PlainTextResponse, include_in_schema=False)
def list_routes() -> PlainTextResponse:
    lines = []
    for route in app.routes:
        methods = ",".join(route.methods) if hasattr(route, "methods") else ""
        lines.append(f"{methods:<8} {route.path}")
    return PlainTextResponse("\n".join(sorted(lines)))