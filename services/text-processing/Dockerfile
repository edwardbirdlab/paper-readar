FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY prompts.py .

# Create cache directory for models
RUN mkdir -p /app/models
ENV HF_HOME=/app/models

# Set environment for production (load both models)
ENV LOAD_BOTH_MODELS=true

# Expose port
EXPOSE 8009

# Run the service
CMD ["python", "main.py"]
