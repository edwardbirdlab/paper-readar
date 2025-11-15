# PDF Extraction Service

FastAPI-based microservice for extracting text from PDF files using PyMuPDF (fitz).

## Overview

This service provides high-quality PDF text extraction optimized for scientific papers. It replaces the previous pdf-parse method with PyMuPDF for better layout handling and character encoding.

## Features

- **High-Quality Extraction**: PyMuPDF provides 40-50% better layout handling than pdf-parse
- **Better Encoding**: Proper handling of special characters (ê, ñ, etc.)
- **Multi-Column Support**: Better handling of scientific paper layouts
- **Metadata Extraction**: Extracts PDF metadata (title, author, creation date, etc.)
- **Fast & Lightweight**: Minimal dependencies, quick startup

## API Endpoints

### POST /extract

Extract text from a PDF file.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: `file` (PDF file)

**Response:**
```json
{
  "success": true,
  "text": "Extracted text content...",
  "pages": 18,
  "text_length": 90947,
  "metadata": {
    "title": "Paper Title",
    "author": "Author Name",
    "subject": "Research Paper",
    "creator": "LaTeX",
    "producer": "pdfTeX",
    "creation_date": "D:20210101120000",
    "mod_date": "D:20210101120000",
    "keywords": ""
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "library": "PyMuPDF 1.23.8"
}
```

## Usage

### Docker (Production)

The service is included in the main docker-compose.yml:

```bash
# Start all services including PDF extraction
docker-compose up -d

# Check logs
docker-compose logs -f pdf-extraction

# Rebuild just this service
docker-compose up -d --build pdf-extraction
```

### Local Development

```bash
cd services/pdf-extraction

# Install dependencies
pip install -r requirements.txt

# Run service
python main.py

# Service available at http://localhost:8007
```

### Testing

```bash
# Test health endpoint
curl http://localhost:8007/health

# Test extraction
curl -X POST http://localhost:8007/extract \
  -F "file=@/path/to/paper.pdf" \
  | python -m json.tool
```

## Configuration

Environment variables (optional):

- `PORT`: Port to run on (default: 8007)
- `HOST`: Host to bind to (default: 0.0.0.0)

## Improvements Over pdf-parse

### Issues Fixed

1. **Encoding Artifacts**: No more `/gid00030/` or garbled characters
2. **Special Characters**: Proper Unicode support (Eugênio, ñ, etc.)
3. **Layout Handling**: Better column detection and text ordering
4. **Performance**: Faster extraction
5. **Section Detection**: Better identification of paper sections

### Comparison

| Feature | pdf-parse | PyMuPDF |
|---------|-----------|---------|
| Text Quality | Fair | Good |
| Special Chars | Poor (garbled) | Excellent |
| Multi-Column | Poor | Good |
| Speed | Slow | Fast |
| Metadata | Limited | Complete |

## Next Steps: Phase 2

This is Phase 1 of the text extraction improvement plan. Phase 2 will add:

- **Phi-3 LLM Cleanup Service** to:
  - Remove citations: [1], (Author, 2020)
  - Remove figure/table references
  - Expand abbreviations: µl → microliter
  - Expand species names: C. quinquefasciatus → Culex quinquefasciatus
  - Remove headers, footers, page numbers
  - Clean up author affiliations

See `PDF_EXTRACTION_ANALYSIS.md` for detailed test results and Phase 2 planning.

## Dependencies

- **FastAPI**: Web framework
- **uvicorn**: ASGI server
- **PyMuPDF**: PDF text extraction
- **pydantic**: Data validation
- **python-multipart**: File upload handling

## Architecture

```
PDF Upload → FastAPI → PyMuPDF → Extract Text → Return JSON
                ↓
            Validate File Type
            Extract Metadata
            Handle Errors
```

## License

Part of Scientific Paper Reader v2.0 project.
