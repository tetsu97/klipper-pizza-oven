# tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from typing import AsyncGenerator, Generator
from pathlib import Path
import tempfile
from unittest.mock import AsyncMock, MagicMock

from app.main import app
from app import settings
from app.routers import config, gcodes

@pytest.fixture
def test_config_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """
    Creates a temporary directory for config files and patches the settings.
    """
    monkeypatch.setattr(settings, "CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(config, "CONFIG_DIR", tmp_path.resolve())
    yield tmp_path

@pytest.fixture
def test_gcodes_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """
    Creates a temporary directory for gcode files and patches the settings.
    """
    monkeypatch.setattr(settings, "GCODES_DIR", str(tmp_path))
    monkeypatch.setattr(gcodes, "GCODES_DIR", tmp_path.resolve())
    yield tmp_path

@pytest.fixture
def klipper_environ(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Path, None, None]:
    """
    Creates a complete and fully isolated simulated Klipper environment.
    """
    printer_data_dir = tmp_path / "printer_data"
    config_dir = printer_data_dir / "config"
    gcodes_dir = printer_data_dir / "gcodes"
    
    config_dir.mkdir(parents=True)
    gcodes_dir.mkdir(parents=True)
    
    monkeypatch.setattr(settings, "CONFIG_DIR", str(config_dir))
    monkeypatch.setattr(settings, "GCODES_DIR", str(gcodes_dir))
    
    yield printer_data_dir

@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """
    Fixture that creates and provides a test client for the API.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.fixture
def mock_http_client() -> AsyncMock:
    """
    Fixture that creates a mock (fake) AsyncClient.
    """
    mock_client = AsyncMock(spec=AsyncClient)
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"result": {"status": {}}}
    mock_client.get.return_value = mock_response
    mock_client.post.return_value = mock_response
    return mock_client