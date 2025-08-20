# app/settings.py
import os
from pathlib import Path

# User's home directory (e.g., /home/pi)
HOME_DIR = Path.home()

# Base URL for Moonraker/Klipper API
KLIPPER_API_URL = os.getenv("KLIPPER_API_URL", "http://127.0.0.1")

# Path to the directory for Klipper configuration files
# Main configs are stored here.
CONFIG_DIR = os.getenv("CONFIG_DIR", str(HOME_DIR / "printer_data" / "config"))

# NEW: Path to the directory for G-code profiles
GCODES_DIR = os.getenv("GCODES_DIR", str(HOME_DIR / "printer_data" / "gcodes"))

# Ambient temperature constant
AMBIENT_TEMP = 25 # Degrees C

# The application will ensure that the profile directory exists.
os.makedirs(GCODES_DIR, exist_ok=True)

# Print paths to the console on startup for easy verification
print(f"INFO:     Config directory is set to: {CONFIG_DIR}")
print(f"INFO:     G-codes directory is set to: {GCODES_DIR}")