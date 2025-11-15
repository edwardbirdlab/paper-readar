"""
Text Cleanup Service
FastAPI service using Phi-3 LLM to clean and normalize scientific paper text for TTS
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "microsoft/Phi-3-mini-4k-instruct")
MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "10000"))
DEVICE = "cpu"  # No GPU available based on user specs

# Global model and tokenizer
model = None
tokenizer = None
text_pipeline = None


# System prompt for text cleanup
CLEANUP_PROMPT = """You are a scientific text preprocessor. Your task is to clean and normalize scientific paper text to make it suitable for text-to-speech (TTS) reading.

Apply these rules:

1. CITATIONS - Remove all citation formats:
   - Bracketed: [1], [17], [1-3], [Smith et al.]
   - Parenthetical: (Author, 2020), (Smith and Jones, 2019), (et al., 2021)
   - Remove "et al." phrases

2. FIGURE/TABLE REFERENCES - Remove:
   - "Figure 1", "Fig. 2", "Table 3", etc.
   - Figure/table captions
   - "(see Figure X)" or similar parentheticals

3. HEADERS/FOOTERS - Remove:
   - Page numbers
   - Journal names, volume/issue numbers
   - Running headers (repeated text at top/bottom)
   - DOI links, URLs

4. ABBREVIATIONS - Expand for readability:
   - µl → microliter
   - LD₅₀ or LD50 → lethal dose fifty
   - e.g., → for example
   - i.e., → that is
   - etc., → and so forth
   - vs. → versus

5. SPECIES NAMES - Expand on first use:
   - C. quinquefasciatus → Culex quinquefasciatus
   - E. coli → Escherichia coli
   - Keep abbreviated after first mention

6. GREEK LETTERS - Write out:
   - α → alpha
   - β → beta
   - γ → gamma
   - μ → mu
   - Δ → delta

7. AUTHOR AFFILIATIONS - Remove:
   - Department/institution addresses mixed in body text
   - Email addresses
   - Superscript affiliation markers (¹, ², *, †)

8. FORMATTING - Clean up:
   - Remove extra whitespace
   - Fix broken words from line breaks
   - Normalize quotes (" " or ' ')
   - Remove LaTeX commands (\\textbf{}, $equation$)

9. PRESERVE:
   - Main narrative text
   - Section headers (Abstract, Introduction, Methods, Results, Discussion, Conclusion)
   - Key scientific terms and findings

Return ONLY the cleaned text. Do not add explanations or comments."""


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    global model, tokenizer, text_pipeline
    logger.info("=" * 60)
    logger.info("Text Cleanup Service Starting...")
    logger.info("=" * 60)
    logger.info(f"Model: {MODEL_NAME}")
    logger.info(f"Device: {DEVICE}")
    logger.info(f"Max text length: {MAX_TEXT_LENGTH}")

    try:
        logger.info("Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME,
            trust_remote_code=True
        )

        logger.info("Loading model (this may take a minute)...")
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float32,  # Use float32 for CPU
            trust_remote_code=True,
            device_map="cpu"
        )

        logger.info("Creating text generation pipeline...")
        text_pipeline = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            device=DEVICE
        )

        logger.info("✓ Model loaded successfully")
        logger.info("✓ Text cleanup service ready")
    except Exception as e:
        logger.error(f"✗ Failed to load model: {e}")
        logger.error("Service will start but cleanup will fail")

    yield  # Server is running

    # Shutdown
    logger.info("Shutting down text cleanup service...")


# Initialize FastAPI app
app = FastAPI(
    title="Text Cleanup Service",
    description="Clean and normalize scientific paper text using Phi-3 LLM",
    version="1.0.0",
    lifespan=lifespan,
)


# ==================== Request/Response Models ====================

class CleanupRequest(BaseModel):
    """Request model for text cleanup"""
    text: str = Field(
        ...,
        min_length=1,
        max_length=MAX_TEXT_LENGTH,
        description="Text to clean up"
    )
    max_tokens: Optional[int] = Field(
        4000,
        description="Maximum tokens to generate"
    )
    temperature: Optional[float] = Field(
        0.3,
        ge=0.0,
        le=1.0,
        description="Generation temperature (lower = more deterministic)"
    )


class CleanupResponse(BaseModel):
    """Response model for successful cleanup"""
    success: bool = Field(True, description="Whether cleanup succeeded")
    cleaned_text: str = Field(..., description="Cleaned and normalized text")
    original_length: int = Field(..., description="Length of original text")
    cleaned_length: int = Field(..., description="Length of cleaned text")
    reduction_percent: float = Field(..., description="Percentage reduction in length")
    processing_time_seconds: float = Field(..., description="Time taken to process")


class ErrorResponse(BaseModel):
    """Response model for errors"""
    success: bool = Field(False, description="Whether cleanup succeeded")
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    model_loaded: bool = Field(..., description="Whether model is loaded")
    model_name: str = Field(..., description="Model name")
    device: str = Field(..., description="Device being used")


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "Text Cleanup Service",
        "version": "1.0.0",
        "status": "running",
        "model": MODEL_NAME,
        "endpoints": {
            "health": "GET /health",
            "cleanup": "POST /cleanup"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    Returns service status and model information
    """
    if model is None or tokenizer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded"
        )

    return HealthResponse(
        status="healthy",
        model_loaded=True,
        model_name=MODEL_NAME,
        device=DEVICE
    )


@app.post("/cleanup", response_model=CleanupResponse)
async def cleanup_text(request: CleanupRequest):
    """
    Clean and normalize scientific text for TTS

    Accepts raw extracted text and returns cleaned version with:
    - Citations removed
    - Abbreviations expanded
    - Species names expanded
    - Headers/footers removed
    - Text normalized for speech

    Example:
    ```json
    {
        "text": "The results (Smith, 2020) show that C. quinquefasciatus...",
        "temperature": 0.3,
        "max_tokens": 4000
    }
    ```
    """
    start_time = time.time()

    if text_pipeline is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded - service not ready"
        )

    try:
        original_length = len(request.text)
        logger.info(f"Cleaning text: {original_length} chars")

        # Create the prompt
        messages = [
            {"role": "system", "content": CLEANUP_PROMPT},
            {"role": "user", "content": f"Clean this scientific text for TTS:\n\n{request.text}"}
        ]

        # Format for Phi-3
        prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )

        # Generate cleaned text
        result = text_pipeline(
            prompt,
            max_new_tokens=request.max_tokens,
            temperature=request.temperature,
            do_sample=request.temperature > 0,
            return_full_text=False,
            pad_token_id=tokenizer.eos_token_id
        )

        # Extract cleaned text
        cleaned_text = result[0]['generated_text'].strip()

        # Calculate stats
        cleaned_length = len(cleaned_text)
        reduction = ((original_length - cleaned_length) / original_length * 100) if original_length > 0 else 0
        processing_time = time.time() - start_time

        logger.info(
            f"✓ Cleanup complete: {original_length} → {cleaned_length} chars "
            f"({reduction:.1f}% reduction) in {processing_time:.2f}s"
        )

        return CleanupResponse(
            success=True,
            cleaned_text=cleaned_text,
            original_length=original_length,
            cleaned_length=cleaned_length,
            reduction_percent=round(reduction, 2),
            processing_time_seconds=round(processing_time, 2)
        )

    except Exception as e:
        logger.error(f"Cleanup failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Text cleanup failed: {str(e)}"
        )


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8008"))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"Starting text cleanup service on {host}:{port}")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )
