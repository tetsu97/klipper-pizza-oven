from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Adresa Moonraker API
    moonraker_url: str = "http://localhost:7125"

    # Cesty k adresářům (použijeme ty z tvého původního main.py)
    gcode_dir: str = "/home/pi/printer_data/gcodes"
    config_dir: str = "/home/pi/printer_data/config"

    # Konfigurace pro Pydantic - umožňuje načítat hodnoty např. z .env souboru
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

# Vytvoříme jednu instanci, kterou budeme importovat v celé aplikaci
settings = Settings()