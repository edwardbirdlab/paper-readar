"""
Core TTS Engine for Kokoro TTS Service
Handles text preprocessing, audio generation, and voice management
"""
import re
import time
import logging
from typing import Tuple, Optional, Dict, Any
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """Base exception for TTS-related errors"""
    pass


class ModelNotLoadedError(TTSError):
    """Raised when trying to use TTS before model is loaded"""
    pass


class VoiceNotFoundError(TTSError):
    """Raised when requested voice is not available"""
    pass


class TextPreprocessingError(TTSError):
    """Raised when text preprocessing fails"""
    pass


class TextPreprocessor:
    """
    Preprocesses text for optimal TTS quality
    Removes citations, URLs, LaTeX, and other problematic patterns
    """

    # Patterns to remove or clean
    PATTERNS = {
        'citations_parens': r'\([A-Z][a-z]+(?:\s+et\s+al\.?)?,?\s+\d{4}[a-z]?\)',  # (Author, 2020)
        'citations_brackets': r'\[\d+(?:,\s*\d+)*\]',  # [1], [1, 2, 3]
        'et_al': r'\s+et\s+al\.',  # et al.
        'urls': r'https?://\S+',  # URLs
        'emails': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',  # emails
        'latex_inline': r'\$[^$]+\$',  # $equation$
        'latex_display': r'\$\$[^$]+\$\$',  # $$equation$$
        'latex_commands': r'\\[a-zA-Z]+\{[^}]*\}',  # \textbf{text}
        'multiple_spaces': r'\s+',  # Multiple spaces
        'parenthetical_abbrev': r'\((?:[A-Z]{2,}|[A-Z][a-z]+)\)',  # (TTS), (Api)
    }

    # Section headers to skip entirely
    SKIP_SECTIONS = [
        'references',
        'bibliography',
        'citations',
        'appendix',
        'supplementary material',
        'acknowledgments',
        'acknowledgements',
    ]

    @classmethod
    def clean_text(cls, text: str, remove_citations: bool = True) -> str:
        """
        Clean and preprocess text for TTS

        Args:
            text: Raw text to preprocess
            remove_citations: Whether to remove citations

        Returns:
            Cleaned text ready for TTS

        Raises:
            TextPreprocessingError: If text becomes empty after processing
        """
        if not text or not text.strip():
            raise TextPreprocessingError("Text is empty")

        original_length = len(text)
        cleaned = text

        try:
            # Remove citations if requested
            if remove_citations:
                cleaned = re.sub(cls.PATTERNS['citations_parens'], '', cleaned)
                cleaned = re.sub(cls.PATTERNS['citations_brackets'], '', cleaned)
                cleaned = re.sub(cls.PATTERNS['et_al'], '', cleaned)

            # Remove URLs and emails
            cleaned = re.sub(cls.PATTERNS['urls'], '', cleaned)
            cleaned = re.sub(cls.PATTERNS['emails'], '', cleaned)

            # Remove LaTeX
            cleaned = re.sub(cls.PATTERNS['latex_display'], ' [equation] ', cleaned)
            cleaned = re.sub(cls.PATTERNS['latex_inline'], ' [equation] ', cleaned)
            cleaned = re.sub(cls.PATTERNS['latex_commands'], '', cleaned)

            # Remove parenthetical abbreviations
            cleaned = re.sub(cls.PATTERNS['parenthetical_abbrev'], '', cleaned)

            # Normalize whitespace
            cleaned = re.sub(cls.PATTERNS['multiple_spaces'], ' ', cleaned)

            # Normalize quotes (using Unicode escapes)
            cleaned = cleaned.replace('\u201c', '"').replace('\u201d', '"')  # Smart double quotes
            cleaned = cleaned.replace('\u2018', "'").replace('\u2019', "'")  # Smart single quotes

            # Remove extra spaces around punctuation
            cleaned = re.sub(r'\s+([.,;:!?])', r'\1', cleaned)

            # Ensure space after punctuation
            cleaned = re.sub(r'([.,;:!?])([A-Za-z])', r'\1 \2', cleaned)

            # Strip leading/trailing whitespace
            cleaned = cleaned.strip()

            # Check if text is still valid
            if not cleaned:
                raise TextPreprocessingError(
                    f"Text became empty after preprocessing (original length: {original_length})"
                )

            if len(cleaned) < 3:
                raise TextPreprocessingError(
                    f"Text too short after preprocessing: '{cleaned}' (original length: {original_length})"
                )

            logger.debug(f"Preprocessed text: {original_length} → {len(cleaned)} chars")
            return cleaned

        except Exception as e:
            if isinstance(e, TextPreprocessingError):
                raise
            raise TextPreprocessingError(f"Failed to preprocess text: {e}") from e

    @classmethod
    def should_skip_section(cls, text: str) -> bool:
        """
        Check if text appears to be a section that should be skipped

        Args:
            text: Text to check

        Returns:
            True if text should be skipped
        """
        text_lower = text.lower().strip()

        # Check if starts with skip section header
        for section in cls.SKIP_SECTIONS:
            if text_lower.startswith(section):
                return True

        return False

    @classmethod
    def validate_text_length(cls, text: str, min_length: int = 1, max_length: int = 5000) -> None:
        """
        Validate text length is within acceptable bounds

        Args:
            text: Text to validate
            min_length: Minimum acceptable length
            max_length: Maximum acceptable length

        Raises:
            TextPreprocessingError: If text length is invalid
        """
        length = len(text)

        if length < min_length:
            raise TextPreprocessingError(
                f"Text too short: {length} chars (minimum: {min_length})"
            )

        if length > max_length:
            raise TextPreprocessingError(
                f"Text too long: {length} chars (maximum: {max_length})"
            )


class TTSEngine:
    """
    High-level TTS engine that manages Kokoro model and audio generation
    """

    def __init__(
        self,
        model_path: str,
        voices_path: str,
        auto_load: bool = True,
        default_voice: str = "af_sarah",
        default_speed: float = 1.0,
    ):
        """
        Initialize TTS engine

        Args:
            model_path: Path to Kokoro ONNX model file
            voices_path: Path to voices.bin file
            auto_load: Whether to load model immediately
            default_voice: Default voice to use
            default_speed: Default speech speed
        """
        self.model_path = Path(model_path)
        self.voices_path = Path(voices_path)
        self.default_voice = default_voice
        self.default_speed = default_speed

        self._model: Optional[Kokoro] = None
        self._available_voices: Optional[list] = None
        self._preprocessor = TextPreprocessor()

        # Validate paths
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")
        if not self.voices_path.exists():
            raise FileNotFoundError(f"Voices file not found: {voices_path}")

        if auto_load:
            self.load_model()

    def load_model(self) -> None:
        """
        Load the Kokoro model

        Raises:
            TTSError: If model loading fails
        """
        if self._model is not None:
            logger.info("Model already loaded")
            return

        try:
            logger.info(f"Loading Kokoro model from {self.model_path}")
            start_time = time.time()

            self._model = Kokoro(str(self.model_path), str(self.voices_path))

            # Cache available voices
            self._available_voices = self._model.get_voices()

            elapsed = time.time() - start_time
            logger.info(
                f"Model loaded successfully in {elapsed:.2f}s "
                f"({len(self._available_voices)} voices available)"
            )

            # Validate default voice
            if self.default_voice not in self._available_voices:
                logger.warning(
                    f"Default voice '{self.default_voice}' not available, "
                    f"using '{self._available_voices[0]}'"
                )
                self.default_voice = self._available_voices[0]

        except Exception as e:
            raise TTSError(f"Failed to load model: {e}") from e

    @property
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._model is not None

    @property
    def available_voices(self) -> list:
        """Get list of available voices"""
        if not self.is_loaded:
            raise ModelNotLoadedError("Model not loaded")
        return self._available_voices.copy()

    def validate_voice(self, voice: str) -> None:
        """
        Validate that voice is available

        Args:
            voice: Voice ID to validate

        Raises:
            ModelNotLoadedError: If model not loaded
            VoiceNotFoundError: If voice not available
        """
        if not self.is_loaded:
            raise ModelNotLoadedError("Model not loaded")

        if voice not in self._available_voices:
            raise VoiceNotFoundError(
                f"Voice '{voice}' not found. Available voices: "
                f"{', '.join(self._available_voices[:10])}..."
            )

    def preprocess_text(self, text: str, remove_citations: bool = True) -> str:
        """
        Preprocess text for TTS

        Args:
            text: Raw text
            remove_citations: Whether to remove citations

        Returns:
            Cleaned text

        Raises:
            TextPreprocessingError: If preprocessing fails
        """
        return self._preprocessor.clean_text(text, remove_citations)

    def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        speed: Optional[float] = None,
        preprocess: bool = True,
        remove_citations: bool = True,
        lang: str = "en-us",
    ) -> Tuple[np.ndarray, int, Dict[str, Any]]:
        """
        Synthesize speech from text

        Args:
            text: Text to synthesize
            voice: Voice ID (uses default if None)
            speed: Speech speed multiplier (uses default if None)
            preprocess: Whether to preprocess text
            remove_citations: Whether to remove citations during preprocessing
            lang: Language code

        Returns:
            Tuple of (audio_array, sample_rate, metadata_dict)

        Raises:
            ModelNotLoadedError: If model not loaded
            VoiceNotFoundError: If voice invalid
            TextPreprocessingError: If text preprocessing fails
            TTSError: If synthesis fails
        """
        if not self.is_loaded:
            raise ModelNotLoadedError("Model not loaded - call load_model() first")

        # Use defaults if not specified
        voice = voice or self.default_voice
        speed = speed if speed is not None else self.default_speed

        # Validate voice
        self.validate_voice(voice)

        # Store original text for metadata
        original_text = text
        original_length = len(text)

        # Preprocess if requested
        if preprocess:
            text = self.preprocess_text(text, remove_citations)

        try:
            logger.info(
                f"Synthesizing: {len(text)} chars, voice={voice}, speed={speed}"
            )
            start_time = time.time()

            # Generate audio
            audio, sample_rate = self._model.create(
                text=text,
                voice=voice,
                speed=speed,
                lang=lang,
            )

            processing_time = time.time() - start_time
            duration = len(audio) / sample_rate
            rtf = processing_time / duration if duration > 0 else 0

            metadata = {
                'processing_time_seconds': processing_time,
                'duration_seconds': duration,
                'rtf': rtf,
                'original_text_length': original_length,
                'processed_text_length': len(text),
                'voice': voice,
                'speed': speed,
                'sample_rate': sample_rate,
                'audio_samples': len(audio),
            }

            logger.info(
                f"Synthesis complete: {duration:.2f}s audio "
                f"generated in {processing_time:.2f}s (RTF: {rtf:.3f})"
            )

            return audio, sample_rate, metadata

        except Exception as e:
            if isinstance(e, (ModelNotLoadedError, VoiceNotFoundError, TextPreprocessingError)):
                raise
            raise TTSError(f"Synthesis failed: {e}") from e
