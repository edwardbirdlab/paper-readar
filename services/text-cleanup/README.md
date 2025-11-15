# Text Cleanup Service

FastAPI service using Microsoft Phi-3 LLM to clean and normalize scientific paper text for optimal TTS quality.

## Overview

This is Phase 2 of the text extraction improvement plan. After PyMuPDF extracts raw text from PDFs, this service uses Phi-3 to intelligently clean and normalize the text by removing citations, expanding abbreviations, and preparing it for text-to-speech generation.

## Features

- **Citation Removal**: Removes [1], (Author, 2020), et al. references
- **Abbreviation Expansion**: µl → microliter, LD₅₀ → lethal dose fifty
- **Species Name Expansion**: C. quinquefasciatus → Culex quinquefasciatus (first use)
- **Greek Letter Expansion**: α → alpha, β → beta, etc.
- **Header/Footer Removal**: Page numbers, journal names, DOIs
- **Figure/Table Reference Removal**: "Figure 1", "see Table 2", captions
- **Author Affiliation Cleanup**: Removes institutional addresses mixed in text
- **Text Normalization**: Fixes spacing, quotes, removes LaTeX commands

## Model

- **Default**: `microsoft/Phi-3-mini-4k-instruct`
- **Size**: ~2.4GB download
- **Context**: 4096 tokens
- **Device**: CPU (no GPU required)
- **Performance**: Optimized for scientific text cleanup

## API Endpoints

### POST /cleanup

Clean and normalize scientific text.

**Request:**
```json
{
  "text": "The results (Smith, 2020) show that C. quinquefasciatus [1] sensitivity to pyrethroids (LD₅₀ = 50 µl)...",
  "temperature": 0.3,
  "max_tokens": 4000
}
```

**Response:**
```json
{
  "success": true,
  "cleaned_text": "The results show that Culex quinquefasciatus sensitivity to pyrethroids with lethal dose fifty equals 50 microliter...",
  "original_length": 120,
  "cleaned_length": 95,
  "reduction_percent": 20.83,
  "processing_time_seconds": 3.45
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_name": "microsoft/Phi-3-mini-4k-instruct",
  "device": "cpu"
}
```

## Usage

### Docker (Production)

The service is included in the main docker-compose.yml:

```bash
# Start all services including text cleanup
docker-compose up -d

# Check logs (model downloads on first run - may take 5-10 minutes)
docker-compose logs -f text-cleanup

# Rebuild just this service
docker-compose up -d --build text-cleanup
```

**Important**: First startup will download the Phi-3 model (~2.4GB). This is normal and only happens once.

### Local Development

```bash
cd services/text-cleanup

# Install dependencies (may take several minutes)
pip install -r requirements.txt

# Run service
python main.py

# Service available at http://localhost:8008
```

### Testing

```bash
# Test health endpoint
curl http://localhost:8008/health

# Test cleanup
curl -X POST http://localhost:8008/cleanup \
  -H "Content-Type: application/json" \
  -d '{"text": "The study (Author, 2020) examined C. quinquefasciatus [1] with LD50 = 10 µl."}' \
  | python -m json.tool
```

## Configuration

Environment variables:

- `MODEL_NAME`: Hugging Face model ID (default: `microsoft/Phi-3-mini-4k-instruct`)
- `MAX_TEXT_LENGTH`: Maximum input text length (default: 10000 chars)
- `PORT`: Port to run on (default: 8008)
- `HOST`: Host to bind to (default: 0.0.0.0)
- `HF_HOME`: Hugging Face cache directory (default: `/app/models`)

## Integration

This service is automatically called in the upload pipeline:

```
PDF Upload
  → PDF Extraction (PyMuPDF)
  → Text Cleanup (Phi-3) ← YOU ARE HERE
  → Text Chunking
  → TTS Generation (Kokoro)
  → Audio Playback
```

The cleanup step is optional - if the service is unavailable, the pipeline continues with raw extracted text.

## Text Cleanup Rules

The service applies these transformations:

### 1. Citations
```
Before: The results (Smith, 2020) show [1]...
After:  The results show...
```

### 2. Abbreviations
```
Before: Applied 10 µl of compound (e.g., pyrethroid)
After:  Applied 10 microliter of compound, for example pyrethroid
```

### 3. Species Names
```
Before: C. quinquefasciatus and E. coli
After:  Culex quinquefasciatus and Escherichia coli
```

### 4. Greek Letters
```
Before: α-diversity and β-analysis
After:  alpha-diversity and beta-analysis
```

### 5. Headers/Footers
```
Before: Vol. 36, no. 2    Journal of Vector Ecology    395
After:  [removed]
```

### 6. Figure References
```
Before: As shown in Figure 1, the results (see Table 2)...
After:  As shown, the results...
```

## Performance

- **Startup Time**: 30-60s (model loading)
- **First Request**: 10-20s (model initialization)
- **Subsequent Requests**: 2-5s per 1000 words
- **Memory Usage**: ~4-6GB RAM
- **CPU Usage**: Moderate (single-threaded inference)

## Troubleshooting

### Model Download Fails

If model download fails:
```bash
# Clear cache and retry
docker-compose down
docker volume rm paper-reader_phi3_models
docker-compose up -d text-cleanup
```

### Service Takes Too Long

If processing is slow:
- Check CPU usage: `docker stats`
- Reduce `max_tokens` in request
- Split very long texts into smaller chunks

### Out of Memory

If container runs out of memory:
- Increase Docker memory limit
- Use smaller model variant
- Process smaller text chunks

## Architecture

```
Request (Text) → FastAPI → Phi-3 → Cleanup Logic → Response (Cleaned Text)
                     ↓
                 System Prompt
                 (Cleanup Rules)
```

The service uses a carefully crafted system prompt that instructs Phi-3 to:
1. Preserve main narrative and scientific content
2. Remove metadata and references
3. Expand technical abbreviations
4. Normalize text for speech

## Dependencies

- **FastAPI**: Web framework
- **uvicorn**: ASGI server
- **transformers**: Hugging Face model loading
- **torch**: PyTorch for model inference
- **accelerate**: Model optimization
- **sentencepiece**: Tokenization
- **pydantic**: Data validation

## Future Improvements

Potential enhancements:
- Batch processing for multiple texts
- Caching for repeated text patterns
- Custom cleanup rules per paper type
- Quality metrics for cleanup effectiveness
- Quantized model for faster inference

## License

Part of Scientific Paper Reader v2.0 project.
