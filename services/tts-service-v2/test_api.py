"""
Integration tests for TTS API endpoints
Tests the full API with real HTTP requests
"""
import pytest
import pytest_asyncio
import base64
import io
from httpx import AsyncClient, ASGITransport
import soundfile as sf

from main import app


@pytest_asyncio.fixture
async def client():
    """Create async HTTP client for testing"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestRootEndpoint:
    """Test root endpoint"""

    @pytest.mark.asyncio
    async def test_root(self, client):
        """Test root endpoint returns service info"""
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "Kokoro TTS v2"
        assert data["version"] == "2.0.0"
        assert "endpoints" in data


class TestHealthEndpoint:
    """Test health check endpoint"""

    @pytest.mark.asyncio
    async def test_health_check(self, client):
        """Test health check returns OK"""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["model_loaded"] is True
        assert data["voices_count"] > 0
        assert data["sample_rate"] == 24000


class TestVoicesEndpoint:
    """Test voices listing endpoint"""

    @pytest.mark.asyncio
    async def test_list_voices(self, client):
        """Test voices endpoint returns list"""
        response = await client.get("/voices")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["voices"], list)
        assert data["count"] > 0
        assert data["default"] == "af_sarah"
        assert "categories" in data

    @pytest.mark.asyncio
    async def test_voices_categories(self, client):
        """Test voice categorization"""
        response = await client.get("/voices")
        data = response.json()
        categories = data["categories"]
        assert "american_female" in categories
        assert "american_male" in categories
        assert "british_female" in categories
        assert "british_male" in categories

        # Check that some voices are categorized
        assert len(categories["american_female"]) > 0


class TestSynthesizeEndpoint:
    """Test synthesis endpoint"""

    @pytest.mark.asyncio
    async def test_synthesize_basic(self, client):
        """Test basic synthesis"""
        response = await client.post(
            "/synthesize",
            json={
                "text": "Hello world, this is a test.",
                "voice": "af_sarah",
                "speed": 1.0
            }
        )
        assert response.status_code == 200
        data = response.json()

        assert data["success"] is True
        assert "audio_base64" in data
        assert data["sample_rate"] == 24000
        assert data["duration_seconds"] > 0
        assert data["processing_time_seconds"] > 0
        assert data["rtf"] > 0
        assert data["voice"] == "af_sarah"

    @pytest.mark.asyncio
    async def test_synthesize_audio_valid(self, client):
        """Test that returned audio is valid WAV"""
        response = await client.post(
            "/synthesize",
            json={"text": "Testing audio validity."}
        )
        assert response.status_code == 200
        data = response.json()

        # Decode base64 audio
        audio_bytes = base64.b64decode(data["audio_base64"])

        # Verify it's valid WAV
        audio_buffer = io.BytesIO(audio_bytes)
        audio, sample_rate = sf.read(audio_buffer)

        assert len(audio) > 0
        assert sample_rate == 24000

    @pytest.mark.asyncio
    async def test_synthesize_with_preprocessing(self, client):
        """Test synthesis with preprocessing enabled"""
        response = await client.post(
            "/synthesize",
            json={
                "text": "This study (Author, 2020) shows results [1].",
                "preprocess": True,
                "remove_citations": True
            }
        )
        assert response.status_code == 200
        data = response.json()

        # Check that original and processed lengths differ
        metadata = data["metadata"]
        assert metadata["original_text_length"] > data["text_length"]

    @pytest.mark.asyncio
    async def test_synthesize_without_preprocessing(self, client):
        """Test synthesis without preprocessing"""
        response = await client.post(
            "/synthesize",
            json={
                "text": "Simple text without citations.",
                "preprocess": False
            }
        )
        assert response.status_code == 200
        data = response.json()

        # Lengths should be the same
        metadata = data["metadata"]
        assert metadata["original_text_length"] == data["text_length"]

    @pytest.mark.asyncio
    async def test_synthesize_different_voice(self, client):
        """Test synthesis with different voice"""
        response = await client.post(
            "/synthesize",
            json={
                "text": "Testing different voice.",
                "voice": "am_michael"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["voice"] == "am_michael"

    @pytest.mark.asyncio
    async def test_synthesize_different_speed(self, client):
        """Test synthesis with different speeds"""
        # Normal speed
        response1 = await client.post(
            "/synthesize",
            json={"text": "Testing speech speed.", "speed": 1.0}
        )
        data1 = response1.json()

        # Fast speed
        response2 = await client.post(
            "/synthesize",
            json={"text": "Testing speech speed.", "speed": 1.5}
        )
        data2 = response2.json()

        # Faster speed should have shorter duration
        assert data2["duration_seconds"] < data1["duration_seconds"]

    @pytest.mark.asyncio
    async def test_synthesize_empty_text_error(self, client):
        """Test that empty text returns error"""
        response = await client.post(
            "/synthesize",
            json={"text": ""}
        )
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_synthesize_invalid_voice_error(self, client):
        """Test that invalid voice returns error"""
        response = await client.post(
            "/synthesize",
            json={
                "text": "Test",
                "voice": "invalid_voice_123"
            }
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert data["error"] == "VoiceNotFoundError"

    @pytest.mark.asyncio
    async def test_synthesize_speed_validation(self, client):
        """Test speed validation"""
        # Too slow
        response1 = await client.post(
            "/synthesize",
            json={"text": "Test", "speed": 0.3}
        )
        assert response1.status_code == 422

        # Too fast
        response2 = await client.post(
            "/synthesize",
            json={"text": "Test", "speed": 3.0}
        )
        assert response2.status_code == 422

    @pytest.mark.asyncio
    async def test_synthesize_long_text(self, client):
        """Test synthesis with longer text"""
        long_text = (
            "This is a longer piece of text to test the system's ability "
            "to handle more realistic content. " * 20
        )
        response = await client.post(
            "/synthesize",
            json={"text": long_text}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["duration_seconds"] > 10  # Should be longer audio

    @pytest.mark.asyncio
    async def test_synthesize_metadata(self, client):
        """Test that metadata is complete"""
        response = await client.post(
            "/synthesize",
            json={"text": "Testing metadata."}
        )
        assert response.status_code == 200
        data = response.json()
        metadata = data["metadata"]

        assert "original_text_length" in metadata
        assert "audio_samples" in metadata
        assert "audio_size_bytes" in metadata
        assert "base64_size_bytes" in metadata
        assert metadata["audio_size_bytes"] > 0
        assert metadata["base64_size_bytes"] > 0

    @pytest.mark.asyncio
    async def test_synthesize_rtf_reasonable(self, client):
        """Test that RTF is reasonable (< 1.0 for real-time)"""
        response = await client.post(
            "/synthesize",
            json={"text": "Testing real-time factor."}
        )
        assert response.status_code == 200
        data = response.json()

        # RTF should be less than 1.0 for faster than real-time
        # On CPU, Kokoro typically achieves 0.2-0.4
        assert 0 < data["rtf"] < 1.0


class TestErrorHandling:
    """Test error handling and responses"""

    @pytest.mark.asyncio
    async def test_text_preprocessing_error(self, client):
        """Test text preprocessing error handling"""
        # Text with only citations that will be removed
        response = await client.post(
            "/synthesize",
            json={
                "text": "(Author, 2020)",
                "preprocess": True,
                "remove_citations": True
            }
        )
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert data["error"] == "TextPreprocessingError"

    @pytest.mark.asyncio
    async def test_whitespace_only_text(self, client):
        """Test that whitespace-only text is rejected"""
        response = await client.post(
            "/synthesize",
            json={"text": "   \n\t  "}
        )
        assert response.status_code == 422  # Validation error


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])
