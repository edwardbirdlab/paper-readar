"""
Pytest configuration for TTS service tests
"""
import os
import pytest

# Set environment variables for testing before importing the app
os.environ["MODEL_PATH"] = "/tmp/kokoro_models/kokoro-v1.0.onnx"
os.environ["VOICES_PATH"] = "/tmp/kokoro_models/voices-v1.0.bin"
os.environ["ONNX_NUM_THREADS"] = "4"  # Reduce threads for testing


def pytest_configure(config):
    """Configure pytest"""
    # Ensure model files exist
    model_path = os.getenv("MODEL_PATH")
    voices_path = os.getenv("VOICES_PATH")

    if not os.path.exists(model_path) or not os.path.exists(voices_path):
        pytest.exit(
            f"Model files not found. Run test_kokoro_generation.py first to download them.\n"
            f"Expected:\n"
            f"  - {model_path}\n"
            f"  - {voices_path}"
        )
