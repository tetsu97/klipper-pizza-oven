# app/settings.py
import os
from pathlib import Path

# Domovský adresář uživatele (např. /home/pi)
HOME_DIR = Path.home()

# Základní URL pro Moonraker/Klipper API
KLIPPER_API_URL = os.getenv("KLIPPER_API_URL", "http://127.0.0.1")

# Cesta k adresáři pro ukládání G-code profilů
# Výchozí hodnota je nyní /home/pi/printer_data/gcodes
PROFILES_DIR = os.getenv("PROFILES_DIR", str(HOME_DIR / "printer_data" / "gcodes"))

# ZMĚNA ZDE: Cesta k adresáři pro konfigurační soubory Klipperu
# Nyní ukazuje přesně na adresář, který jsi zadal.
CONFIG_DIR = os.getenv("CONFIG_DIR", str(HOME_DIR / "printer_data" / "config"))

# Aplikace zajistí, že adresář pro profily existuje.
# U konfiguračního adresáře předpokládáme, že již existuje.
os.makedirs(PROFILES_DIR, exist_ok=True)

# Výpis cest do konzole při startu pro snadnou kontrolu
print(f"INFO:     Profiles directory is set to: {PROFILES_DIR}")
print(f"INFO:     Config directory is set to: {CONFIG_DIR}")
