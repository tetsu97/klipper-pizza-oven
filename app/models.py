# app/models.py
from pydantic import BaseModel
from typing import Any, Dict, List, Optional


class GcodeScriptPayload(BaseModel):
    script: str

class GcodeSavePayload(BaseModel):
    name: str
    gcode: Optional[str] = None
    overwrite: bool = False
    program_name: Optional[str] = None
    filament_type: Optional[str] = None
    mode: str = "annealing"
    points: Optional[List[Dict[str, Any]]] = None
    drying_time: Optional[int] = None
    drying_temp: Optional[int] = None

class GenerateGcodePayload(BaseModel):
    program_name: str
    filament_type: Optional[str] = None
    mode: str = "annealing"
    points: List[Dict[str, Any]]
    drying_time: Optional[int] = None
    drying_temp: Optional[int] = None

class FileNamePayload(BaseModel):
    name: str

class SaveConfigPayload(BaseModel):
    name: str
    content: str

class DuplicateProfilePayload(BaseModel):
    originalName: str
    newName: str