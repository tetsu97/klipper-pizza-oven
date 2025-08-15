# app/routers/system.py
import platform
import re
from fastapi import APIRouter
from typing import Any, Dict

try:
    import psutil
except ImportError:
    psutil = None

# ZMĚNA ZDE: Prefix je nyní jen /api, aby cesty odpovídaly frontendu
router = APIRouter(
    prefix="/api",
    tags=["system"],
)

@router.get("/system/host")
async def system_host():
    """Vrací informace o hostitelském systému (OS, RAM, CPU teplota)."""
    os_name = platform.platform()
    mem_total = mem_used = None
    if psutil:
        vm = psutil.virtual_memory()
        mem_total = int(vm.total // 1024)
        mem_used = int((vm.total - vm.available) // 1024)
    
    cpu_temp = None
    if psutil and hasattr(psutil, "sensors_temperatures"):
        temps = psutil.sensors_temperatures() or {}
        preferred = ["cpu-thermal", "cpu_thermal", "soc_thermal", "coretemp", "k10temp"]
        key = next((k for k in preferred if k in temps and temps[k]), None)
        entries = temps.get(key) if key else next(iter(temps.values()), None)
        if entries and getattr(entries[0], "current", None) is not None:
            cpu_temp = float(entries[0].current)

    return {
        "os": os_name,
        "mem": {"total_kb": mem_total, "used_kb": mem_used, "free_kb": max(0, mem_total - mem_used)},
        "cpu_temp_c": cpu_temp,
    }

def _disk_usage_json(path: str = "/") -> Dict[str, Any]:
    if not psutil:
        return {"total": None, "used": None, "free": None}
    u = psutil.disk_usage(path)
    return {"total": u.total, "used": u.used, "free": u.free, "percent": u.percent}

# Tato cesta bude nyní správně -> /api/disk
@router.get("/disk")
def get_disk():
    """Vrací informace o využití disku pro kořenový adresář."""
    return _disk_usage_json("/")
