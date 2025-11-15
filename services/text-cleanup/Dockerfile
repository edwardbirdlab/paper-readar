FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Create cache directory for models
RUN mkdir -p /app/models
ENV HF_HOME=/app/models

# Expose port
EXPOSE 8008

# Run the service
CMD ["python", "main.py"]
