# tests/test_gcodes_api.py
import pytest
from httpx import AsyncClient
from pathlib import Path
import json

# Fixtures are now correctly handled by conftest.py
pytestmark = pytest.mark.asyncio

# --- Helper Data for Tests ---
SAMPLE_METADATA = {"name": "Test Profile", "filament_type": "PETG", "type": "annealing"}
SAMPLE_GCODE_BODY = "ADD_SEGMENT TEMP=150 RAMP_TIME=3600 HOLD_TIME=1800"
SAMPLE_FULL_GCODE_TO_SAVE = f"""; METADATA: {json.dumps(SAMPLE_METADATA)}
PROGRAM_CLEAR
{SAMPLE_GCODE_BODY}
EXECUTE_PROGRAM"""


async def test_list_profiles_empty(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests that the endpoint returns an empty list when no profiles exist.
    """
    response = await client.get("/api/gcodes/")
    assert response.status_code == 200
    data = response.json()
    assert data["files"] == []

async def test_save_and_list_profile(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests saving a new profile and then listing it to verify metadata parsing.
    """
    profile_name = "my_petg_profile"
    
    # 1. Save a new profile
    save_payload = {
        "name": profile_name,
        "gcode": SAMPLE_GCODE_BODY,
        "program_name": "My PETG Profile",
        "filament_type": "PETG-CF",
        "mode": "annealing",
        "overwrite": True
    }
    response_save = await client.post("/api/gcodes/save", json=save_payload)
    assert response_save.status_code == 200
    assert response_save.json()["ok"] is True
    
    # Verify file was created with the correct name
    expected_file = test_gcodes_dir / f"oven_{profile_name}.gcode"
    assert expected_file.exists()
    
    # 2. List profiles and check the content
    response_list = await client.get("/api/gcodes/")
    assert response_list.status_code == 200
    data = response_list.json()
    
    assert len(data["files"]) == 1
    profile_data = data["files"][0]
    assert profile_data["name"] == profile_name
    assert profile_data["filament_type"] == "PETG-CF"

async def test_get_profile_details(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests fetching the raw G-code content and other details of a specific profile.
    """
    profile_name = "test_profile"
    (test_gcodes_dir / f"oven_{profile_name}.gcode").write_text(SAMPLE_FULL_GCODE_TO_SAVE)
    
    response = await client.get(f"/api/gcodes/{profile_name}")
    assert response.status_code == 200
    data = response.json()
    
    assert data["name"] == profile_name
    assert data["gcode"] == SAMPLE_FULL_GCODE_TO_SAVE
    assert data["metadata"]["name"] == "Test Profile"
    assert len(data["points"]) > 0 # Verify that points for the chart are generated

async def test_delete_profile(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests deleting an existing profile.
    """
    profile_name = "test_to_delete"
    (test_gcodes_dir / f"oven_{profile_name}.gcode").write_text("content")

    response = await client.delete(f"/api/gcodes/?name={profile_name}")
    assert response.status_code == 200
    assert response.json()["ok"] is True
    
    # Verify that the file was actually deleted
    assert not (test_gcodes_dir / f"oven_{profile_name}.gcode").exists()