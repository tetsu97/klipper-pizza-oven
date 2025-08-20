# tests/test_gcodes_api.py
import pytest
from httpx import AsyncClient
from pathlib import Path

# Fixtures are now correctly handled by conftest.py

pytestmark = pytest.mark.asyncio

async def test_list_profiles_empty(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests that the /api/gcodes endpoint returns an empty list when no profiles exist.
    """
    response = await client.get("/api/gcodes/")
    assert response.status_code == 200
    data = response.json()
    assert data["files"] == []

async def test_list_profiles_with_files(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests that the /api/gcodes endpoint correctly finds and lists profiles.
    """
    # Create test files in the clean temporary gcodes directory
    (test_gcodes_dir / "pizza_classic.cfg").write_text("[gcode_macro classic]")
    (test_gcodes_dir / "pizza_extra_cheese.cfg").write_text("[gcode_macro extra_cheese]")
    (test_gcodes_dir / "not_a_profile.txt").write_text("ignore me")

    response = await client.get("/api/gcodes/")
    assert response.status_code == 200
    data = response.json()
    
    assert len(data["files"]) == 2
    profile_names = {f["name"] for f in data["files"]}
    assert "classic" in profile_names
    assert "extra_cheese" in profile_names

async def test_delete_profile(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests deleting an existing profile.
    """
    profile_name = "test_to_delete"
    (test_gcodes_dir / f"pizza_{profile_name}.cfg").write_text("content")

    response = await client.delete(f"/api/gcodes/?name={profile_name}")
    assert response.status_code == 200
    assert response.json()["ok"] is True
    
    # Verify that the file was actually deleted
    assert not (test_gcodes_dir / f"pizza_{profile_name}.cfg").exists()

async def test_delete_nonexistent_profile(client: AsyncClient, test_gcodes_dir: Path):
    """
    Tests an attempt to delete a non-existent profile, expecting a 404 error.
    """
    response = await client.delete("/api/gcodes/?name=i_dont_exist")
    assert response.status_code == 404