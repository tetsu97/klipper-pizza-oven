# app/routers/system.py
import platform
import re
import socket
import logging
from fastapi import APIRouter
from typing import Any, Dict, List

try:
    import psutil
except ImportError:
    psutil = None

router = APIRouter(
    prefix="/api",
    tags=["system"],
)

def _get_network_info() -> List[Dict[str, str]]:
    """Gets information about active network interfaces (safer version)."""
    if not psutil:
        return []
    
    interfaces = []
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()

        for name, snics in addrs.items():
            if name == "lo" or name not in stats or not stats[name].isup:
                continue
            
            ip_address = None
            for addr in snics:
                if addr.family == socket.AF_INET:
                    ip_address = addr.address
                    break
            
            if ip_address:
                conn_type = "other"
                if name.startswith("wlan"):
                    conn_type = "wifi"
                elif name.startswith(("eth", "enp")):
                    conn_type = "lan"
                
                interfaces.append({
                    "name": name,
                    "ip_address": ip_address,
                    "type": conn_type
                })
    except Exception as e:
        logging.error(f"Error getting network status using psutil: {e}", exc_info=True)
        return []

    return interfaces

@router.get("/system/host")
async def system_host() -> Dict[str, Any]:
    """Returns information about the host system (OS, RAM, CPU, network)."""
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
            
    network_info = _get_network_info()

    return {
        "os": os_name,
        "mem": {"total_kb": mem_total, "used_kb": mem_used, "free_kb": max(0, mem_total - mem_used) if mem_total and mem_used else 0},
        "cpu_temp_c": cpu_temp,
        "network": network_info,
    }

def _disk_usage_json(path: str = "/") -> Dict[str, Any]:
    if not psutil:
        return {"total": None, "used": None, "free": None}
    u = psutil.disk_usage(path)
    return {"total": u.total, "used": u.used, "free": u.free, "percent": u.percent}

@router.get("/disk")
def get_disk() -> Dict[str, Any]:
    """Returns disk usage information for the root directory."""
    return _disk_usage_json("/")