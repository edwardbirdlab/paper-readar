# Kokoro TTS Service v2

## Overview

Complete redesign of the TTS service with improved reliability, error handling, and performance. Built from the ground up with production-ready features.

## Key Improvements

### 1. **Simplified API Design**
- **Before:** `/generate` endpoint with separate file download
- **After:** `/synthesize` endpoint with audio returned directly as base64
- No temporary file management needed
- Eliminates race conditions and cleanup issues

### 2. **Advanced Text Preprocessing**
- Removes academic citations: `(Author, 2020)`, `[1, 2, 3]`
- Strips URLs and email addresses
- Converts LaTeX equations to `[equation]` placeholder
- Normalizes smart quotes to straight quotes
- Removes extra whitespace and fixes punctuation
- Configurable via API parameters

### 3. **Comprehensive Error Handling**
- Custom exception types: `TTSError`, `VoiceNotFoundError`, `TextPreprocessingError`, `ModelNotLoadedError`
- Structured error responses with error codes
- Detailed error messages for debugging
- Proper HTTP status codes

### 4. **Production-Ready Features**
- Full unit test coverage (31 tests)
- Integration tests for all endpoints
- Proper logging with timestamps
- Health checks with model validation
- Graceful startup/shutdown with lifespan handlers

### 5. **Better Voice Management**
- 54 voices available (vs 10 documented before)
- Categorized by accent and gender
- Voice validation before synthesis
- Detailed voice listing endpoint

## API Documentation

### Base URL
```
http://localhost:3006
```

### Endpoints

#### 1. Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_path": "/app/models/kokoro-v1.0.onnx",
  "voices_count": 54,
  "sample_rate": 24000,
  "version": "2.0.0"
}
```

#### 2. List Voices
```http
GET /voices
```

**Response:**
```json
{
  "voices": ["af_sarah", "am_michael", "bf_emma", ...],
  "count": 54,
  "default": "af_sarah",
  "categories": {
    "american_female": ["af_sarah", "af_nicole", ...],
    "american_male": ["am_adam", "am_michael", ...],
    "british_female": ["bf_alice", "bf_emma", ...],
    "british_male": ["bm_daniel", "bm_george", ...],
    "other": ["zf_xiaobei", ...]
  }
}
```

#### 3. Synthesize Speech
```http
POST /synthesize
```

**Request Body:**
```json
{
  "text": "This is a test of the text-to-speech system.",
  "voice": "af_sarah",
  "speed": 1.0,
  "preprocess": true,
  "remove_citations": true
}
```

**Parameters:**
- `text` (required): Text to synthesize (1-5000 chars)
- `voice` (optional): Voice ID (default: "af_sarah")
- `speed` (optional): Speech speed 0.5-2.0 (default: 1.0)
- `preprocess` (optional): Enable text preprocessing (default: true)
- `remove_citations` (optional): Remove citations during preprocessing (default: true)

**Response:**
```json
{
  "success": true,
  "audio_base64": "UklGRiQAAABXQVZFZm10...",
  "sample_rate": 24000,
  "duration_seconds": 3.5,
  "processing_time_seconds": 0.85,
  "rtf": 0.243,
  "voice": "af_sarah",
  "text_length": 45,
  "metadata": {
    "original_text_length": 52,
    "audio_samples": 84000,
    "audio_size_bytes": 168044,
    "base64_size_bytes": 224060
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "VoiceNotFoundError",
  "message": "Voice 'invalid' not found. Available voices: af_sarah, am_michael...",
  "details": {
    "available_voices_count": 54
  }
}
```

## Architecture

### Core Components

1. **`tts_engine.py`** - Core TTS functionality
   - `TextPreprocessor` - Text cleaning and validation
   - `TTSEngine` - Model management and audio generation
   - Custom exceptions for error handling

2. **`main.py`** - FastAPI application
   - API endpoints
   - Request/response models with Pydantic
   - Error handlers
   - Lifespan management

3. **`test_tts_engine.py`** - Unit tests (31 tests)
4. **`test_api.py`** - Integration tests (18 tests)

### Text Preprocessing Pipeline

```
Raw Text
  ↓
Remove Citations → "(Author, 2020)" removed
  ↓
Remove URLs → "https://..." removed
  ↓
Process LaTeX → "$x^2$" → "[equation]"
  ↓
Normalize Quotes → """ → "\""
  ↓
Fix Whitespace → Multiple spaces collapsed
  ↓
Validate Length → Check min/max bounds
  ↓
Clean Text (ready for TTS)
```

### Audio Generation Flow

```
Request
  ↓
Validate Input (Pydantic)
  ↓
Preprocess Text (optional)
  ↓
Validate Voice
  ↓
Generate Audio (Kokoro)
  ↓
Convert to WAV bytes
  ↓
Encode as Base64
  ↓
Response with metadata
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_PATH` | `/app/models/kokoro-v1.0.onnx` | Path to ONNX model file |
| `VOICES_PATH` | `/app/models/voices-v1.0.bin` | Path to voices file |
| `ONNX_NUM_THREADS` | `8` | Number of CPU threads for inference |
| `DEFAULT_VOICE` | `af_sarah` | Default voice ID |
| `DEFAULT_SPEED` | `1.0` | Default speech speed |
| `MAX_TEXT_LENGTH` | `5000` | Maximum text length in characters |
| `PORT` | `8000` | Server port |
| `HOST` | `0.0.0.0` | Server host |

### Model Files

The service requires two model files:
1. **kokoro-v1.0.onnx** (~310 MB) - Main TTS model
2. **voices-v1.0.bin** (~27 MB) - Voice embeddings

**Download URLs:**
```bash
# Model file
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx

# Voices file
wget https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

## Performance

### Benchmarks (on typical server CPU)

- **RTF (Real-Time Factor):** 0.2-0.4
  - Generates audio 3-5x faster than playback time
  - Example: 10 seconds of audio generated in 2-4 seconds

- **Sample Rate:** 24,000 Hz
- **Audio Format:** WAV (uncompressed)
- **Typical Sizes:**
  - 1 minute audio ≈ 2.8 MB WAV
  - 5 minute audio ≈ 14 MB WAV

### Resource Usage

- **Memory:** ~2 GB (model + runtime)
- **CPU:** 100-400% during generation (8 threads)
- **Disk:** ~350 MB (models)

## Testing

### Run Unit Tests
```bash
cd services/tts-service-v2
pip install -r requirements.txt
pytest test_tts_engine.py -v
```

### Run Integration Tests
```bash
pytest test_api.py -v
```

### Manual Testing
```bash
# Start service
python main.py

# Test synthesis
curl -X POST http://localhost:8000/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world"}' | jq .
```

## Migration from v1

### Breaking Changes

1. **Endpoint Change**
   - Old: `POST /generate`
   - New: `POST /synthesize`

2. **Response Format**
   - Old: `{ audio_path: "/audio/file.wav", duration: 3.5 }`
   - New: `{ audio_base64: "UklGR...", duration_seconds: 3.5 }`

3. **No File Downloads**
   - Old: Download from `/audio/{filename}`, then DELETE
   - New: Audio included in response, no cleanup needed

4. **New Request Parameters**
   - Added: `preprocess` (bool)
   - Added: `remove_citations` (bool)
   - Removed: `format` (always WAV)

### Worker Updates Required

See `services/tts-worker/src/index.ts` for updated worker code:
- Change endpoint to `/synthesize`
- Decode `audio_base64` instead of downloading
- Remove temp file cleanup
- Update field names (`duration` → `duration_seconds`)

## Troubleshooting

### Model Not Loading

**Symptom:** 503 Service Unavailable
**Solution:**
- Check model files exist at `MODEL_PATH` and `VOICES_PATH`
- Verify file permissions (should be readable)
- Check logs for download errors

### Slow Generation

**Symptom:** High RTF (>0.5)
**Solution:**
- Increase `ONNX_NUM_THREADS` to match CPU cores
- Reduce `WORKER_CONCURRENCY` to avoid overload
- Check CPU is not throttling

### Empty Audio

**Symptom:** `audio_base64` decodes to empty file
**Solution:**
- Check text is not empty after preprocessing
- Verify voice exists (`GET /voices`)
- Check service logs for errors

### Citation Removal Issues

**Symptom:** Text too short after preprocessing
**Solution:**
- Disable preprocessing: `"preprocess": false`
- Or disable citation removal: `"remove_citations": false`
- Check original text isn't all citations

## Development

### Project Structure
```
services/tts-service-v2/
├── main.py                 # FastAPI application
├── tts_engine.py          # Core TTS engine
├── requirements.txt       # Python dependencies
├── Dockerfile            # Container definition
├── .dockerignore        # Docker ignore rules
├── test_tts_engine.py   # Unit tests
├── test_api.py          # Integration tests
├── conftest.py          # Pytest configuration
└── README.md           # This file
```

### Adding New Features

1. **New Preprocessing Rule:**
   - Add pattern to `TextPreprocessor.PATTERNS`
   - Apply in `clean_text()` method
   - Add unit test in `test_tts_engine.py`

2. **New API Endpoint:**
   - Add endpoint in `main.py`
   - Create request/response models
   - Add integration test in `test_api.py`

3. **New Voice Category:**
   - Update categorization in `/voices` endpoint
   - Update documentation

## License

Apache 2.0 (same as Kokoro model)

## Support

For issues, check:
1. Service logs: `docker logs paper-reader-tts-service`
2. Worker logs: `docker logs paper-reader-tts-worker`
3. Health endpoint: `curl http://localhost:3006/health`
4. Voices endpoint: `curl http://localhost:3006/voices`
