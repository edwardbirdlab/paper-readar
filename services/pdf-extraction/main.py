"""
PDF Extraction Service
Simple FastAPI service for extracting text from PDFs using PyMuPDF
"""
import os
import logging
import tempfile
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import fitz  # PyMuPDF

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="PDF Extraction Service",
    description="Extract text from PDF files using PyMuPDF (fitz)",
    version="1.0.0",
)


# ==================== Request/Response Models ====================

class ExtractionResponse(BaseModel):
    """Response model for PDF extraction"""
    success: bool = Field(True, description="Whether extraction succeeded")
    text: str = Field(..., description="Extracted text content")
    pages: int = Field(..., description="Number of pages in PDF")
    text_length: int = Field(..., description="Length of extracted text in characters")
    metadata: dict = Field(default_factory=dict, description="PDF metadata")


class ErrorResponse(BaseModel):
    """Response model for errors"""
    success: bool = Field(False, description="Whether extraction succeeded")
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Service version")
    library: str = Field(..., description="PDF library being used")


# ==================== API Endpoints ====================

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "PDF Extraction Service",
        "version": "1.0.0",
        "status": "running",
        "library": "PyMuPDF (fitz)",
        "endpoints": {
            "health": "GET /health",
            "extract": "POST /extract"
        }
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    Returns service status
    """
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        library=f"PyMuPDF {fitz.version[0]}"
    )


@app.post("/extract", response_model=ExtractionResponse)
async def extract_pdf(file: UploadFile = File(...)):
    """
    Extract text from PDF file

    Accepts a PDF file upload and returns extracted text with metadata.
    Uses PyMuPDF for high-quality text extraction with layout awareness.

    Example response:
    ```json
    {
        "success": true,
        "text": "Extracted text content...",
        "pages": 18,
        "text_length": 84576,
        "metadata": {
            "title": "Paper Title",
            "author": "Author Name",
            "subject": "Research Paper",
            "creator": "LaTeX",
            "producer": "pdfTeX",
            "creation_date": "D:20210101120000"
        }
    }
    ```
    """
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PDF"
        )

    logger.info(f"Extracting text from PDF: {file.filename}")

    try:
        # Read uploaded file
        pdf_bytes = await file.read()

        if not pdf_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty PDF file"
            )

        # Open PDF with PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        # Extract text from all pages
        text_parts = []
        for page_num, page in enumerate(doc):
            page_text = page.get_text("text")
            text_parts.append(page_text)
            logger.debug(f"Page {page_num + 1}: {len(page_text)} chars")

        # Join pages with double newline
        full_text = "\n\n".join(text_parts)

        # Extract metadata
        metadata = {}
        if doc.metadata:
            metadata = {
                "title": doc.metadata.get("title", ""),
                "author": doc.metadata.get("author", ""),
                "subject": doc.metadata.get("subject", ""),
                "creator": doc.metadata.get("creator", ""),
                "producer": doc.metadata.get("producer", ""),
                "creation_date": doc.metadata.get("creationDate", ""),
                "mod_date": doc.metadata.get("modDate", ""),
                "keywords": doc.metadata.get("keywords", "")
            }

        pages_count = len(doc)
        doc.close()

        logger.info(
            f"✓ Extraction complete: {pages_count} pages, "
            f"{len(full_text)} chars from {file.filename}"
        )

        return ExtractionResponse(
            success=True,
            text=full_text,
            pages=pages_count,
            text_length=len(full_text),
            metadata=metadata
        )

    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF extraction failed: {str(e)}"
        )


# ==================== Main ====================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8007"))
    host = os.getenv("HOST", "0.0.0.0")

    logger.info(f"Starting PDF extraction service on {host}:{port}")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )
