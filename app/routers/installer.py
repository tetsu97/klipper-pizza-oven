# /app/routers/installer.py
import logging
from fastapi import APIRouter, HTTPException
from pathlib import Path
from .. import settings

router = APIRouter(
    prefix="/api/installer",
    tags=["installer"],
)

APP_MODULE_PATH = Path(__file__).resolve().parent.parent.parent / "klipper_module" / "pizza_oven.py"

def get_module_paths():
    """Helper function to get all relevant paths."""
    klipper_config_dir = Path(settings.CONFIG_DIR)
    return {
        "script": klipper_config_dir.parent / "extras" / "pizza_oven.py",
        "config": klipper_config_dir / "pizza_oven.cfg",
        "printer_config": klipper_config_dir / "printer.cfg",
        "extras_dir": klipper_config_dir.parent / "extras",
        "printer_data_dir": klipper_config_dir.parent
    }

@router.get("/status")
async def get_installation_status():
    """Checks if the oven module is installed and if Klipper exists."""
    paths = get_module_paths()
    # We consider Klipper to be valid if its main configuration file exists.
    klipper_path_valid = paths["printer_config"].is_file()

    script_exists = paths["script"].exists()
    include_present = False
    if klipper_path_valid:
        try:
            content = paths["printer_config"].read_text()
            if "[include pizza_oven.cfg]" in content:
                include_present = True
        except Exception:
            pass

    is_installed = klipper_path_valid and script_exists and include_present
    
    return {
        "klipper_path_valid": klipper_path_valid,
        "installed": is_installed,
        "details": {
            "script_exists": script_exists,
            "config_exists": paths["config"].exists(),
            "include_present": include_present
        }
    }

@router.post("/install_pizza_oven_module")
async def install_pizza_oven_module():
    """Installs or reinstalls the Klipper module pizza_oven.py."""
    try:
        paths = get_module_paths()
        target_script_path = paths["script"]
        target_cfg_path = paths["config"]
        printer_cfg_path = paths["printer_config"]
        klipper_extras_dir = paths["extras_dir"]

        # --- 1. Copying the script ---
        if not APP_MODULE_PATH.exists():
            raise HTTPException(status_code=500, detail="Source file pizza_oven.py not found in the application.")
        
        # We create the directories if they don't exist - this is the correct behavior.
        klipper_extras_dir.mkdir(exist_ok=True)
        target_script_path.write_text(APP_MODULE_PATH.read_text())
        logging.info(f"Script pizza_oven.py copied to {target_script_path}")

        # --- 2. Creating pizza_oven.cfg ---
        pizza_oven_cfg_content = (
            "# Configuration for the Pizza Oven module\n"
            "[pizza_oven]\n"
            "# IMPORTANT: Replace 'heater_pin' and 'sensor_pin' with the correct pins for your hardware.\n"
            "heater_pin: heater_pin_placeholder\n"
            "sensor_pin: sensor_pin_placeholder\n"
            "sensor_type: EPCOS 100K B57560G104F\n"
            "control: pid\n"
            "pid_Kp: 22.2\n"
            "pid_Ki: 1.08\n"
            "pid_Kd: 114\n"
            "min_temp: 0\n"
            "max_temp: 280\n"
        )
        target_cfg_path.write_text(pizza_oven_cfg_content)
        logging.info(f"Configuration file pizza_oven.cfg created in {target_cfg_path}")

        # --- 3. Modifying printer.cfg ---
        if not printer_cfg_path.exists():
            printer_cfg_path.write_text("[include pizza_oven.cfg]\n")
            logging.info(f"File printer.cfg not found, it was created and the include was added.")
        else:
            printer_cfg_content = printer_cfg_path.read_text()
            include_line = "[include pizza_oven.cfg]"
            
            if include_line not in printer_cfg_content:
                new_content = include_line + "\n" + printer_cfg_content
                printer_cfg_path.write_text(new_content)
                logging.info(f"Line '{include_line}' was added to the beginning of printer.cfg")
            else:
                logging.info("The include line already exists in printer.cfg, no changes made.")

        return {
            "ok": True, 
            "message": "Pizza Oven module successfully installed/reinstalled. Restart Klipper to activate.",
            "actions": [
                f"Script copied to: {target_script_path}",
                f"Configuration created in: {target_cfg_path}",
                "Main configuration printer.cfg was checked/modified."
            ]
        }

    except Exception as e:
        logging.error(f"Module installation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Module installation failed: {str(e)}")