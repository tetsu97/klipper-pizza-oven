# /app/routers/power.py
import asyncio
import logging
import time
import os
from fastapi import APIRouter, HTTPException, Body, BackgroundTasks
from typing import Dict

router = APIRouter(
    prefix="/api/power",
    tags=["power"],
)

SERVICE_NAME = "klipper-pizza-oven"

async def run_command(command: str):
    """Spustí systémový příkaz bezpečně a čeká na jeho dokončení."""
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_message = stderr.decode()
            logging.error(f"Command '{command}' failed with code {proc.returncode}: {error_message}")
            if "command not found" in error_message:
                if "at" in command:
                    raise HTTPException(status_code=500, detail="The 'at' command is not installed. Please run 'sudo apt install at'.")
            raise HTTPException(status_code=500, detail=f"Command failed: {error_message}")
        
        logging.info(f"Command '{command}' executed successfully.")
        return {"ok": True, "message": "Command executed."}
        
    except Exception as e:
        logging.error(f"Failed to execute command '{command}': {e}", exc_info=True)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/restart_service")
async def restart_service() -> Dict[str, bool]:
    """
    Naplánuje restart služby pomocí příkazu 'at', aby se proces oddělil.
    """
    command = f'echo "sudo systemctl restart {SERVICE_NAME}" | at now'
    await run_command(command)
    return {"ok": True}

@router.post("/reboot_host")
async def reboot_host() -> Dict[str, bool]:
    """Restartuje celé zařízení (Raspberry Pi)."""
    await run_command("sudo reboot")
    return {"ok": True}

@router.post("/shutdown_host")
async def shutdown_host() -> Dict[str, bool]:
    """Vypne celé zařízení (Raspberry Pi)."""
    await run_command("sudo shutdown now")
    return {"ok": True}

@router.post("/restart_display")
async def restart_display() -> Dict[str, bool]:
    """Restarts the entire kiosk session by re-running the user's startup script."""
    start_script_path = "/home/pi/kiosk.sh" 

    command = (
        f"export DISPLAY=:0 && "
        f"nohup {start_script_path} > /dev/null 2>&1 &"
    )
    
    await run_command(command)
    return {"ok": True}