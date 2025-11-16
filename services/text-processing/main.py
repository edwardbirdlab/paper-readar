"""
Text Processing Service
Two-stage LLM pipeline: Phi-3-mini-128k (cleanup) → Phi-3-medium-128k (reorganization)
"""
import os
import logging
import time
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

from prompts import STAGE1_CLEANUP_PROMPT, STAGE2_REORGANIZATION_PROMPT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
STAGE1_MODEL = os.getenv("STAGE1_MODEL", "microsoft/Phi-3-mini-128k-instruct")
STAGE2_MODEL = os.getenv("STAGE2_MODEL", "microsoft/Phi-3-medium-128k-instruct")
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "200000"))  # ~50k words
LOAD_BOTH_MODELS = os.getenv("LOAD_BOTH_MODELS", "true").lower() == "true"
DEVICE = "cpu"  # No GPU

# Global model instances
stage1_model = None
stage1_tokenizer = None
stage1_pipeline = None

stage2_model = None
stage2_tokenizer = None
stage2_pipeline = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    global stage1_model, stage1_tokenizer, stage1_pipeline
    global stage2_model, stage2_tokenizer, stage2_pipeline

    logger.info("=" * 60)
    logger.info("Text Processing Service Starting...")
    logger.info("=" * 60)
    logger.info(f"Stage 1 Model: {STAGE1_MODEL}")
    logger.info(f"Stage 2 Model: {STAGE2_MODEL}")
    logger.info(f"Load both models: {LOAD_BOTH_MODELS}")
    logger.info(f"Device: {DEVICE}")
    logger.info(f"Max text length: {MAX_TEXT_LENGTH}")

    try:
        if LOAD_BOTH_MODELS:
            # Production mode: Load both models
            logger.info("Loading Stage 1: Phi-3-mini-128k...")
            stage1_tokenizer = AutoTokenizer.from_pretrained(
                STAGE1_MODEL,
                trust_remote_code=True
            )
            stage1_model = AutoModelForCausalLM.from_pretrained(
                STAGE1_MODEL,
                torch_dtype=torch.float32,
                trust_remote_code=True,
                device_map="cpu"
            )
            stage1_pipeline = pipeline(
                "text-generation",
                model=stage1_model,
                tokenizer=stage1_tokenizer
                # Don't specify device when using device_map
            )
            logger.info("✓ Stage 1 model loaded (~10GB RAM)")

            logger.info("Loading Stage 2: Phi-3-medium-128k...")
            stage2_tokenizer = AutoTokenizer.from_pretrained(
                STAGE2_MODEL,
                trust_remote_code=True
            )
            stage2_model = AutoModelForCausalLM.from_pretrained(
                STAGE2_MODEL,
                torch_dtype=torch.float32,
                trust_remote_code=True,
                device_map="cpu"
            )
            stage2_pipeline = pipeline(
                "text-generation",
                model=stage2_model,
                tokenizer=stage2_tokenizer
                # Don't specify device when using device_map
            )
            logger.info("✓ Stage 2 model loaded (~28GB RAM)")
            logger.info("✓ Both models loaded successfully (~38GB total RAM)")
        else:
            # Testing mode: Models loaded on-demand
            logger.info("⚠ Models will be loaded on-demand (testing mode)")
            logger.info("⚠ Use /load-stage1 and /load-stage2 endpoints to load models")

        logger.info("✓ Text processing service ready")

    except Exception as e:
        logger.error(f"✗ Failed to load models: {e}")
        logger.error("Service will start but processing will fail until models are loaded")

    yield  # Server is running

    # Shutdown
    logger.info("Shutting down text processing service...")


# Initialize FastAPI app
app = FastAPI(
    title="Text Processing Service",
    description="Two-stage LLM pipeline for scientific paper text processing",
    version="1.0.0",
    lifespan=lifespan,
)


# ==================== Request/Response Models ====================

class ProcessRequest(BaseModel):
    """Request model for text processing"""
    text: str = Field(
        ...,
        min_length=1,
        max_length=MAX_TEXT_LENGTH,
        description="Text to process"
    )
    metadata: dict = Field(
        default_factory=dict,
        description="Optional metadata (title, authors, etc.)"
    )
    skip_stage1: bool = Field(
        default=False,
        description="Skip Stage 1 (for testing Stage 2 only)"
    )
    skip_stage2: bool = Field(
        default=False,
        description="Skip Stage 2 (for testing Stage 1 only)"
    )


class ProcessResponse(BaseModel):
    """Response model for successful processing"""
    success: bool = Field(True, description="Whether processing succeeded")
    stage1_output: Optional[str] = Field(None, description="Output from Stage 1 (cleanup)")
    stage2_output: Optional[str] = Field(None, description="Output from Stage 2 (reorganization)")
    final_output: str = Field(..., description="Final processed text")
    original_length: int = Field(..., description="Original text length")
    final_length: int = Field(..., description="Final text length")
    processing_time_seconds: float = Field(..., description="Total processing time")
    stage1_time: Optional[float] = Field(None, description="Stage 1 processing time")
    stage2_time: Optional[float] = Field(None, description="Stage 2 processing time")


class ErrorResponse(BaseModel):
    """Response model for errors"""
    success: bool = Field(False, description="Whether processing succeeded")
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    stage1_loaded: bool = Field(..., description="Whether Stage 1 model is loaded")
    stage2_loaded: bool = Field(..., description="Whether Stage 2 model is loaded")
    stage1_model: str = Field(..., description="Stage 1 model name")
    stage2_model: str = Field(..., description="Stage 2 model name")
    device: str = Field(..., description="Device being used")


# ==================== Helper Functions ====================

def load_stage1_model():
    """Load Stage 1 model on-demand"""
    global stage1_model, stage1_tokenizer, stage1_pipeline

    if stage1_pipeline is not None:
        logger.info("Stage 1 model already loaded")
        return

    logger.info("Loading Stage 1 model...")
    stage1_tokenizer = AutoTokenizer.from_pretrained(STAGE1_MODEL, trust_remote_code=True)
    stage1_model = AutoModelForCausalLM.from_pretrained(
        STAGE1_MODEL,
        torch_dtype=torch.float32,
        trust_remote_code=True,
        device_map="cpu"
    )
    stage1_pipeline = pipeline("text-generation", model=stage1_model, tokenizer=stage1_tokenizer)
    logger.info("✓ Stage 1 model loaded")


def load_stage2_model():
    """Load Stage 2 model on-demand"""
    global stage2_model, stage2_tokenizer, stage2_pipeline

    if stage2_pipeline is not None:
        logger.info("Stage 2 model already loaded")
        return

    logger.info("Loading Stage 2 model...")
    stage2_tokenizer = AutoTokenizer.from_pretrained(STAGE2_MODEL, trust_remote_code=True)
    stage2_model = AutoModelForCausalLM.from_pretrained(
        STAGE2_MODEL,
        torch_dtype=torch.float32,
        trust_remote_code=True,
        device_map="cpu"
    )
    stage2_pipeline = pipeline("text-generation", model=stage2_model, tokenizer=stage2_tokenizer)
    logger.info("✓ Stage 2 model loaded")


def unload_stage1_model():
    """Unload Stage 1 model to free RAM"""
    global stage1_model, stage1_tokenizer, stage1_pipeline

    if stage1_pipeline is None:
        logger.info("Stage 1 model not loaded")
        return

    logger.info("Unloading Stage 1 model...")
    del stage1_model
    del stage1_tokenizer
    del stage1_pipeline
    stage1_model = None
    stage1_tokenizer = None
    stage1_pipeline = None
    torch.cuda.empty_cache() if torch.cuda.is_available() else None
    logger.info("✓ Stage 1 model unloaded")


def unload_stage2_model():
    """Unload Stage 2 model to free RAM"""
    global stage2_model, stage2_tokenizer, stage2_pipeline

    if stage2_pipeline is None:
        logger.info("Stage 2 model not loaded")
        return

    logger.info("Unloading Stage 2 model...")
    del stage2_model
    del stage2_tokenizer
    del stage2_pipeline
    stage2_model = None
    stage2_tokenizer = None
    stage2_pipeline = None
    torch.cuda.empty_cache() if torch.cuda.is_available() else None
    logger.info("✓ Stage 2 model unloaded")


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "Text Processing Service",
        "version": "1.0.0",
        "status": "running",
        "stage1_model": STAGE1_MODEL,
        "stage2_model": STAGE2_MODEL,
        "endpoints": {
            "health": "GET /health",
            "process": "POST /process",
            "load_stage1": "POST /load-stage1",
            "load_stage2": "POST /load-stage2",
            "unload_stage1": "POST /unload-stage1",
            "unload_stage2": "POST /unload-stage2"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        stage1_loaded=stage1_pipeline is not None,
        stage2_loaded=stage2_pipeline is not None,
        stage1_model=STAGE1_MODEL,
        stage2_model=STAGE2_MODEL,
        device=DEVICE
    )


@app.post("/load-stage1")
async def load_stage1():
    """Load Stage 1 model (for testing)"""
    try:
        load_stage1_model()
        return {"success": True, "message": "Stage 1 model loaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load-stage2")
async def load_stage2():
    """Load Stage 2 model (for testing)"""
    try:
        load_stage2_model()
        return {"success": True, "message": "Stage 2 model loaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/unload-stage1")
async def unload_stage1():
    """Unload Stage 1 model (for testing)"""
    try:
        unload_stage1_model()
        return {"success": True, "message": "Stage 1 model unloaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/unload-stage2")
async def unload_stage2():
    """Unload Stage 2 model (for testing)"""
    try:
        unload_stage2_model()
        return {"success": True, "message": "Stage 2 model unloaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process", response_model=ProcessResponse)
async def process_text(request: ProcessRequest):
    """
    Two-stage text processing pipeline

    Stage 1: Local cleanup (citations, abbreviations, formatting)
    Stage 2: Global reorganization (section detection and reordering)
    """
    start_time = time.time()
    original_length = len(request.text)

    logger.info(f"Processing {original_length} chars of text...")

    stage1_output = None
    stage2_output = None
    stage1_time = None
    stage2_time = None

    try:
        # Stage 1: Local cleanup
        if not request.skip_stage1:
            if stage1_pipeline is None:
                if not LOAD_BOTH_MODELS:
                    raise HTTPException(
                        status_code=503,
                        detail="Stage 1 model not loaded. Call /load-stage1 first."
                    )
                else:
                    raise HTTPException(
                        status_code=503,
                        detail="Stage 1 model failed to load on startup"
                    )

            logger.info(f"Stage 1: Cleaning {original_length} chars...")
            stage1_start = time.time()

            stage1_messages = [
                {"role": "system", "content": STAGE1_CLEANUP_PROMPT},
                {"role": "user", "content": f"Clean this scientific paper text for TTS:\n\n{request.text}"}
            ]

            stage1_prompt = stage1_tokenizer.apply_chat_template(
                stage1_messages,
                tokenize=False,
                add_generation_prompt=True
            )

            stage1_result = stage1_pipeline(
                stage1_prompt,
                max_new_tokens=150000,  # Large enough for full papers
                temperature=0.2,  # Low for deterministic cleanup
                do_sample=True,
                return_full_text=False,
                pad_token_id=stage1_tokenizer.eos_token_id
            )

            stage1_output = stage1_result[0]['generated_text'].strip()
            stage1_time = time.time() - stage1_start

            logger.info(f"✓ Stage 1 complete: {len(stage1_output)} chars in {stage1_time:.2f}s")
        else:
            logger.info("⊘ Stage 1 skipped")
            stage1_output = request.text

        # Stage 2: Section reorganization
        if not request.skip_stage2:
            if stage2_pipeline is None:
                if not LOAD_BOTH_MODELS:
                    raise HTTPException(
                        status_code=503,
                        detail="Stage 2 model not loaded. Call /load-stage2 first."
                    )
                else:
                    raise HTTPException(
                        status_code=503,
                        detail="Stage 2 model failed to load on startup"
                    )

            logger.info(f"Stage 2: Reorganizing {len(stage1_output)} chars...")
            stage2_start = time.time()

            stage2_messages = [
                {"role": "system", "content": STAGE2_REORGANIZATION_PROMPT},
                {"role": "user", "content": f"Reorganize this cleaned scientific paper text for TTS listening:\n\n{stage1_output}"}
            ]

            stage2_prompt = stage2_tokenizer.apply_chat_template(
                stage2_messages,
                tokenize=False,
                add_generation_prompt=True
            )

            stage2_result = stage2_pipeline(
                stage2_prompt,
                max_new_tokens=150000,
                temperature=0.3,  # Slightly higher for creative reorganization
                do_sample=True,
                return_full_text=False,
                pad_token_id=stage2_tokenizer.eos_token_id
            )

            stage2_output = stage2_result[0]['generated_text'].strip()
            stage2_time = time.time() - stage2_start

            logger.info(f"✓ Stage 2 complete: {len(stage2_output)} chars in {stage2_time:.2f}s")
        else:
            logger.info("⊘ Stage 2 skipped")
            stage2_output = stage1_output

        # Final output is from last stage
        final_output = stage2_output if stage2_output else stage1_output
        total_time = time.time() - start_time

        logger.info(
            f"✓ Processing complete: {original_length} → {len(final_output)} chars "
            f"in {total_time:.2f}s"
        )

        return ProcessResponse(
            success=True,
            stage1_output=stage1_output if not request.skip_stage1 else None,
            stage2_output=stage2_output if not request.skip_stage2 else None,
            final_output=final_output,
            original_length=original_length,
            final_length=len(final_output),
            processing_time_seconds=round(total_time, 2),
            stage1_time=round(stage1_time, 2) if stage1_time else None,
            stage2_time=round(stage2_time, 2) if stage2_time else None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Processing failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Text processing failed: {str(e)}"
        )


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8009"))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"Starting text processing service on {host}:{port}")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )
