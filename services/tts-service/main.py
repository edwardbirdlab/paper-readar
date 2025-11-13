"""
Kokoro TTS Service - FastAPI Application
High-quality TTS using Kokoro-82M model optimized for CPU
"""

import os
import time
import asyncio
from pathlib import Path
from typing import Optional
import logging
import urllib.request

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import numpy as np
import soundfile as sf

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Kokoro TTS Service",
    description="High-quality Text-to-Speech using Kokoro-82M",
    version="1.0.0"
)

# Configuration
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models")
ONNX_NUM_THREADS = int(os.getenv("ONNX_NUM_THREADS", "8"))
TEMP_AUDIO_DIR = Path("/tmp/tts_audio")
TEMP_AUDIO_DIR.mkdir(exist_ok=True)

# Model file URLs (from Hugging Face)
MODEL_FILE_URL = "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v1.0.onnx"
VOICES_FILE_URL = "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices-v1.0.bin"

# Global model instance (lazy loaded)
kokoro_model = None


def download_model_files():
    """Download Kokoro model files if they don't exist"""
    model_dir = Path(MODEL_PATH)
    model_dir.mkdir(parents=True, exist_ok=True)

    model_file = model_dir / "kokoro-v1.0.onnx"
    voices_file = model_dir / "voices-v1.0.bin"

    if not model_file.exists():
        logger.info(f"Downloading model file to {model_file}...")
        try:
            urllib.request.urlretrieve(MODEL_FILE_URL, model_file)
            logger.info(f"Model file downloaded successfully ({model_file.stat().st_size / 1024 / 1024:.1f} MB)")
        except Exception as e:
            logger.error(f"Failed to download model file: {e}")
            raise
    else:
        logger.info(f"Model file already exists at {model_file}")

    if not voices_file.exists():
        logger.info(f"Downloading voices file to {voices_file}...")
        try:
            urllib.request.urlretrieve(VOICES_FILE_URL, voices_file)
            logger.info(f"Voices file downloaded successfully ({voices_file.stat().st_size / 1024 / 1024:.1f} MB)")
        except Exception as e:
            logger.error(f"Failed to download voices file: {e}")
            raise
    else:
        logger.info(f"Voices file already exists at {voices_file}")

    return str(model_file), str(voices_file)


class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to convert to speech", min_length=1)
    voice: Optional[str] = Field("af_sarah", description="Voice to use (e.g., af_sarah, bf_emma)")
    speed: Optional[float] = Field(1.0, description="Speech speed multiplier", ge=0.5, le=2.0)
    format: Optional[str] = Field("wav", description="Audio format (wav or mp3)")


class TTSResponse(BaseModel):
    audio_path: str
    duration: float
    sample_rate: int
    text_length: int
    processing_time: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str


def load_kokoro_model():
    """Load Kokoro model with ONNX optimizations"""
    global kokoro_model

    if kokoro_model is not None:
        return kokoro_model

    try:
        logger.info(f"Loading Kokoro model from {MODEL_PATH}")
        logger.info(f"ONNX threads: {ONNX_NUM_THREADS}")

        # Import and configure kokoro
        try:
            from kokoro_onnx import Kokoro

            # Download model files if needed
            model_file, voices_file = download_model_files()

            # Initialize Kokoro with both required files
            logger.info(f"Initializing Kokoro with model: {model_file}, voices: {voices_file}")
            kokoro_model = Kokoro(model_file, voices_file)

            logger.info("Kokoro model loaded successfully")
            return kokoro_model

        except ImportError:
            logger.error("kokoro-onnx not installed, using fallback")
            # Fallback implementation
            kokoro_model = FallbackTTS()
            return kokoro_model

    except Exception as e:
        logger.error(f"Error loading Kokoro model: {str(e)}")
        raise


class FallbackTTS:
    """Fallback TTS for development/testing when Kokoro is not available"""

    def __init__(self):
        self.sample_rate = 22050
        logger.warning("Using fallback TTS - Kokoro not available")

    def create(self, text: str, voice: str = "af_sarah", speed: float = 1.0, lang: str = "en-us"):
        """Generate dummy audio (silence) for testing"""
        duration = len(text) * 0.05  # Rough estimate: 50ms per character
        samples = int(self.sample_rate * duration / speed)
        audio = np.zeros(samples, dtype=np.float32)
        return audio, self.sample_rate


@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    try:
        load_kokoro_model()
        logger.info("TTS service started successfully")
    except Exception as e:
        logger.error(f"Failed to load model on startup: {str(e)}")
        # Continue anyway - model will be loaded on first request


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if kokoro_model is not None else "initializing",
        model_loaded=kokoro_model is not None,
        version="1.0.0"
    )


@app.post("/generate", response_model=TTSResponse)
async def generate_tts(request: TTSRequest):
    """
    Generate TTS audio from text

    Returns a JSON response with the path to the generated audio file.
    The audio file should be retrieved using the /audio/{filename} endpoint.
    """
    start_time = time.time()

    try:
        # Load model if not already loaded
        if kokoro_model is None:
            load_kokoro_model()

        logger.info(f"Generating TTS for {len(request.text)} characters")

        # Generate audio using Kokoro
        audio, sample_rate = kokoro_model.create(
            text=request.text,
            voice=request.voice,
            speed=request.speed,
            lang="en-us"
        )

        # Calculate duration
        duration = len(audio) / sample_rate

        # Save audio file
        filename = f"tts_{int(time.time() * 1000)}.{request.format}"
        audio_path = TEMP_AUDIO_DIR / filename

        sf.write(str(audio_path), audio, sample_rate)

        processing_time = time.time() - start_time

        logger.info(f"TTS generated in {processing_time:.2f}s - Duration: {duration:.2f}s")

        return TTSResponse(
            audio_path=f"/audio/{filename}",
            duration=duration,
            sample_rate=sample_rate,
            text_length=len(request.text),
            processing_time=processing_time
        )

    except Exception as e:
        logger.error(f"Error generating TTS: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


@app.get("/audio/{filename}")
async def get_audio(filename: str):
    """Serve generated audio file"""
    audio_path = TEMP_AUDIO_DIR / filename

    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        path=str(audio_path),
        media_type="audio/wav",
        filename=filename
    )


@app.delete("/audio/{filename}")
async def delete_audio(filename: str):
    """Delete audio file after it's been downloaded"""
    audio_path = TEMP_AUDIO_DIR / filename

    if audio_path.exists():
        audio_path.unlink()
        return {"message": "Audio file deleted"}

    raise HTTPException(status_code=404, detail="Audio file not found")


@app.get("/voices")
async def list_voices():
    """List available voices"""
    # Kokoro default voices
    voices = [
        {"id": "af_sarah", "name": "Sarah (American Female)", "language": "en"},
        {"id": "af_nicole", "name": "Nicole (American Female)", "language": "en"},
        {"id": "af_bella", "name": "Bella (American Female)", "language": "en"},
        {"id": "af_jessica", "name": "Jessica (American Female)", "language": "en"},
        {"id": "am_adam", "name": "Adam (American Male)", "language": "en"},
        {"id": "am_michael", "name": "Michael (American Male)", "language": "en"},
        {"id": "bf_emma", "name": "Emma (British Female)", "language": "en"},
        {"id": "bf_isabella", "name": "Isabella (British Female)", "language": "en"},
        {"id": "bm_george", "name": "George (British Male)", "language": "en"},
        {"id": "bm_lewis", "name": "Lewis (British Male)", "language": "en"},
    ]

    return {"voices": voices}


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Kokoro TTS",
        "version": "1.0.0",
        "status": "running",
        "model": "kokoro-82m",
        "endpoints": {
            "health": "/health",
            "generate": "/generate (POST)",
            "voices": "/voices",
            "audio": "/audio/{filename}"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
