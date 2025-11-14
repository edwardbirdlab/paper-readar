# Kokoro TTS Service v2 - CPU-optimized
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY tts_engine.py .
COPY main.py .

# Create model directory
RUN mkdir -p /app/models

# Model files will be downloaded on first run if not present
# Or can be mounted as a volume for faster startup

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ONNX_NUM_THREADS=8
ENV MODEL_PATH=/app/models/kokoro-v1.0.onnx
ENV VOICES_PATH=/app/models/voices-v1.0.bin
ENV DEFAULT_VOICE=af_sarah
ENV DEFAULT_SPEED=1.0
ENV MAX_TEXT_LENGTH=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
