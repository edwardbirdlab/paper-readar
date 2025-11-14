"""
Kokoro TTS Service v2 - Production FastAPI Application
High-quality TTS using Kokoro-82M model optimized for CPU
"""
import os
import time
import base64
import io
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
import soundfile as sf

from tts_engine import TTSEngine, TTSError, VoiceNotFoundError, TextPreprocessingError

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
MODEL_PATH = os.getenv("MODEL_PATH", "/app/models/kokoro-v1.0.onnx")
VOICES_PATH = os.getenv("VOICES_PATH", "/app/models/voices-v1.0.bin")
ONNX_NUM_THREADS = int(os.getenv("ONNX_NUM_THREADS", "8"))
DEFAULT_VOICE = os.getenv("DEFAULT_VOICE", "af_sarah")
DEFAULT_SPEED = float(os.getenv("DEFAULT_SPEED", "1.0"))
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "5000"))

# Global TTS engine
tts_engine: Optional[TTSEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    global tts_engine
    logger.info("=" * 60)
    logger.info("Kokoro TTS Service v2 Starting...")
    logger.info("=" * 60)
    logger.info(f"Model path: {MODEL_PATH}")
    logger.info(f"Voices path: {VOICES_PATH}")
    logger.info(f"ONNX threads: {ONNX_NUM_THREADS}")
    logger.info(f"Default voice: {DEFAULT_VOICE}")
    logger.info(f"Max text length: {MAX_TEXT_LENGTH}")

    try:
        tts_engine = TTSEngine(
            model_path=MODEL_PATH,
            voices_path=VOICES_PATH,
            auto_load=True,
            default_voice=DEFAULT_VOICE,
            default_speed=DEFAULT_SPEED,
        )
        logger.info(f"✓ Model loaded successfully with {len(tts_engine.available_voices)} voices")
        logger.info("✓ TTS service ready")
    except Exception as e:
        logger.error(f"✗ Failed to load model: {e}")
        logger.error("Service will start but synthesis will fail")

    yield  # Server is running

    # Shutdown
    logger.info("Shutting down TTS service...")


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Kokoro TTS Service v2",
    description="High-quality Text-to-Speech using Kokoro-82M with improved error handling and preprocessing",
    version="2.0.0",
    lifespan=lifespan,
)


# ==================== Request/Response Models ====================

class SynthesizeRequest(BaseModel):
    """Request model for TTS synthesis"""
    text: str = Field(
        ...,
        min_length=1,
        max_length=MAX_TEXT_LENGTH,
        description="Text to synthesize",
        examples=["Hello world, this is a test."]
    )
    voice: Optional[str] = Field(
        None,
        description="Voice ID (uses service default if not specified)",
        examples=["af_sarah", "am_michael", "bf_emma"]
    )
    speed: Optional[float] = Field(
        None,
        ge=0.5,
        le=2.0,
        description="Speech speed multiplier (0.5-2.0)",
        examples=[1.0, 1.2, 0.8]
    )
    preprocess: bool = Field(
        True,
        description="Apply text preprocessing (remove citations, URLs, etc.)"
    )
    remove_citations: bool = Field(
        True,
        description="Remove citations during preprocessing"
    )

    @field_validator('text')
    @classmethod
    def validate_text(cls, v: str) -> str:
        """Validate text is not empty after stripping"""
        if not v.strip():
            raise ValueError("Text cannot be empty or whitespace only")
        return v


class SynthesizeResponse(BaseModel):
    """Response model for successful synthesis"""
    success: bool = Field(True, description="Whether synthesis succeeded")
    audio_base64: str = Field(..., description="Base64-encoded WAV audio data")
    sample_rate: int = Field(..., description="Audio sample rate in Hz")
    duration_seconds: float = Field(..., description="Audio duration in seconds")
    processing_time_seconds: float = Field(..., description="Time taken to generate audio")
    rtf: float = Field(..., description="Real-Time Factor (processing_time / duration)")
    voice: str = Field(..., description="Voice used for synthesis")
    text_length: int = Field(..., description="Length of processed text in characters")
    metadata: dict = Field(..., description="Additional metadata")


class ErrorResponse(BaseModel):
    """Response model for errors"""
    success: bool = Field(False, description="Whether synthesis succeeded")
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[dict] = Field(None, description="Additional error details")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    model_loaded: bool = Field(..., description="Whether model is loaded")
    model_path: str = Field(..., description="Path to model file")
    voices_count: int = Field(..., description="Number of available voices")
    sample_rate: int = Field(..., description="Audio sample rate")
    version: str = Field(..., description="Service version")


class VoicesResponse(BaseModel):
    """Voices list response"""
    voices: list[str] = Field(..., description="List of available voice IDs")
    count: int = Field(..., description="Number of available voices")
    default: str = Field(..., description="Default voice ID")
    categories: dict = Field(..., description="Voices grouped by category")


# ==================== Exception Handlers ====================

@app.exception_handler(VoiceNotFoundError)
async def voice_not_found_handler(request: Request, exc: VoiceNotFoundError):
    """Handle voice not found errors"""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ErrorResponse(
            error="VoiceNotFoundError",
            message=str(exc),
            details={"available_voices_count": len(tts_engine.available_voices) if tts_engine else 0}
        ).model_dump()
    )


@app.exception_handler(TextPreprocessingError)
async def text_preprocessing_handler(request: Request, exc: TextPreprocessingError):
    """Handle text preprocessing errors"""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ErrorResponse(
            error="TextPreprocessingError",
            message=str(exc)
        ).model_dump()
    )


@app.exception_handler(TTSError)
async def tts_error_handler(request: Request, exc: TTSError):
    """Handle general TTS errors"""
    logger.error(f"TTS Error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="TTSError",
            message=str(exc)
        ).model_dump()
    )


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "Kokoro TTS v2",
        "version": "2.0.0",
        "status": "running",
        "model": "kokoro-82m",
        "endpoints": {
            "health": "GET /health",
            "voices": "GET /voices",
            "synthesize": "POST /synthesize"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    Returns detailed service status and model information
    """
    if tts_engine is None or not tts_engine.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded"
        )

    return HealthResponse(
        status="healthy",
        model_loaded=True,
        model_path=MODEL_PATH,
        voices_count=len(tts_engine.available_voices),
        sample_rate=24000,
        version="2.0.0"
    )


@app.get("/voices", response_model=VoicesResponse)
async def list_voices():
    """
    List all available voices with categories
    """
    if tts_engine is None or not tts_engine.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded"
        )

    voices = tts_engine.available_voices

    # Categorize voices
    categories = {
        "american_female": [v for v in voices if v.startswith("af_")],
        "american_male": [v for v in voices if v.startswith("am_")],
        "british_female": [v for v in voices if v.startswith("bf_")],
        "british_male": [v for v in voices if v.startswith("bm_")],
        "other": [v for v in voices if not any(v.startswith(p) for p in ["af_", "am_", "bf_", "bm_"])]
    }

    return VoicesResponse(
        voices=voices,
        count=len(voices),
        default=DEFAULT_VOICE,
        categories=categories
    )


@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(request: SynthesizeRequest):
    """
    Synthesize speech from text

    Returns base64-encoded WAV audio data directly in the response.
    No need for separate file retrieval.

    Example:
    ```json
    {
        "text": "Hello world, this is a test.",
        "voice": "af_sarah",
        "speed": 1.0,
        "preprocess": true
    }
    ```
    """
    start_time = time.time()

    if tts_engine is None or not tts_engine.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded - service not ready"
        )

    try:
        logger.info(
            f"Synthesis request: {len(request.text)} chars, "
            f"voice={request.voice or DEFAULT_VOICE}, "
            f"speed={request.speed or DEFAULT_SPEED}, "
            f"preprocess={request.preprocess}"
        )

        # Synthesize audio
        audio, sample_rate, metadata = tts_engine.synthesize(
            text=request.text,
            voice=request.voice,
            speed=request.speed,
            preprocess=request.preprocess,
            remove_citations=request.remove_citations,
        )

        # Convert to WAV bytes
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, audio, sample_rate, format='WAV')
        wav_bytes = wav_buffer.getvalue()

        # Encode as base64
        audio_base64 = base64.b64encode(wav_bytes).decode('utf-8')

        total_time = time.time() - start_time

        logger.info(
            f"✓ Synthesis complete: {metadata['duration_seconds']:.2f}s audio "
            f"generated in {total_time:.2f}s (RTF: {metadata['rtf']:.3f})"
        )

        return SynthesizeResponse(
            success=True,
            audio_base64=audio_base64,
            sample_rate=sample_rate,
            duration_seconds=metadata['duration_seconds'],
            processing_time_seconds=total_time,
            rtf=metadata['rtf'],
            voice=metadata['voice'],
            text_length=metadata['processed_text_length'],
            metadata={
                'original_text_length': metadata['original_text_length'],
                'audio_samples': metadata['audio_samples'],
                'audio_size_bytes': len(wav_bytes),
                'base64_size_bytes': len(audio_base64),
            }
        )

    except (VoiceNotFoundError, TextPreprocessingError, TTSError):
        # These will be handled by exception handlers
        raise

    except Exception as e:
        logger.error(f"Unexpected error during synthesis: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthesis failed: {str(e)}"
        )


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"Starting server on {host}:{port}")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )
