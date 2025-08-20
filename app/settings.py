# app/settings.py
import os
from pathlib import Path

# Domovský adresář uživatele (např. /home/pi)
HOME_DIR = Path.home()

# Základní URL pro Moonraker/Klipper API
KLIPPER_API_URL = os.getenv("KLIPPER_API_URL", "http://127.0.0.1")

# Cesta k adresáři pro konfigurační soubory Klipperu
# Zde jsou uloženy jak konfigurace, tak profily (pizza_*.cfg)
CONFIG_DIR = os.getenv("CONFIG_DIR", str(HOME_DIR / "printer_data" / "config"))

# OPRAVA: Přidána chybějící konstanta pro okolní teplotu
AMBIENT_TEMP = 25 # Degrees C

# Aplikace zajistí, že adresář pro profily existuje.
# U konfiguračního adresáře předpokládáme, že již existuje.
# os.makedirs(PROFILES_DIR, exist_ok=True) # Tento řádek již není potřeba

# Výpis cest do konzole při startu pro snadnou kontrolu
print(f"INFO:     Config directory is set to: {CONFIG_DIR}")