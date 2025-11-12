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

# Global model instance (lazy loaded)
kokoro_model = None


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

            # Initialize with CPU-optimized settings
            kokoro_model = Kokoro(
                model_path=MODEL_PATH,
                voice="af_sarah",  # Default voice
                num_threads=ONNX_NUM_THREADS
            )

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

    def generate(self, text: str, voice: str = "af_sarah", speed: float = 1.0):
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
        audio, sample_rate = kokoro_model.generate(
            text=request.text,
            voice=request.voice,
            speed=request.speed
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
