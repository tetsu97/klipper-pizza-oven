# tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport
from typing import AsyncGenerator, Generator
from pathlib import Path
import tempfile
import os

from app.main import app
from app import settings

@pytest.fixture
def test_config_dir() -> Generator[Path, None, None]:
    """
    Fixture, která vytvoří dočasný adresář pro testy
    a nastaví ho jako CONFIG_DIR.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_path = Path(tmpdir)
        # Uložíme původní hodnotu a nastavíme novou pro test
        original_config_dir = settings.CONFIG_DIR
        settings.CONFIG_DIR = str(temp_path)
        yield temp_path
        # Vrátíme původní hodnotu po skončení testu
        settings.CONFIG_DIR = original_config_dir


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """
    Fixture, která vytváří a poskytuje testovacího klienta pro API.
    """
    # Vytvoříme transport, který říká klientovi, jak komunikovat přímo s naší FastAPI aplikací
    transport = ASGITransport(app=app)
    
    # Místo app=app použijeme transport=transport
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_http_client() -> AsyncMock:
    """
    Fixture, která vytvoří mock (falešný) AsyncClient.
    Umožňuje nám kontrolovat odpovědi bez reálných síťových volání.
    """
    mock_client = AsyncMock(spec=AsyncClient)
    
    # Přednastavíme, že volání .get() a .post() vrátí mock odpověď
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"result": {"status": {}}}
    
    mock_client.get.return_value = mock_response
    mock_client.post.return_value = mock_response
    
    return mock_client