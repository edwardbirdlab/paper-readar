"""
Unit tests for TTS Engine
"""
import pytest
import numpy as np
from tts_engine import (
    TTSEngine,
    TextPreprocessor,
    TTSError,
    ModelNotLoadedError,
    VoiceNotFoundError,
    TextPreprocessingError,
)


class TestTextPreprocessor:
    """Test text preprocessing functionality"""

    def test_clean_basic_text(self):
        """Test basic text cleaning"""
        text = "Hello  world.  This is   a test."
        cleaned = TextPreprocessor.clean_text(text)
        assert "  " not in cleaned  # No double spaces
        assert cleaned.startswith("Hello")

    def test_remove_citations_parens(self):
        """Test removal of parenthetical citations"""
        text = "This is a fact (Smith, 2020) that is well known."
        cleaned = TextPreprocessor.clean_text(text, remove_citations=True)
        assert "(Smith, 2020)" not in cleaned
        assert "fact" in cleaned and "well known" in cleaned

    def test_remove_citations_brackets(self):
        """Test removal of bracket citations"""
        text = "Multiple studies [1, 2, 3] have shown this."
        cleaned = TextPreprocessor.clean_text(text, remove_citations=True)
        assert "[1, 2, 3]" not in cleaned
        assert "Multiple studies" in cleaned

    def test_remove_et_al(self):
        """Test removal of et al."""
        text = "Research by Johnson et al. indicates this."
        cleaned = TextPreprocessor.clean_text(text, remove_citations=True)
        assert "et al." not in cleaned

    def test_remove_urls(self):
        """Test URL removal"""
        text = "Visit https://example.com for more info."
        cleaned = TextPreprocessor.clean_text(text)
        assert "https://example.com" not in cleaned
        assert "Visit" in cleaned and "for more info" in cleaned

    def test_remove_emails(self):
        """Test email removal"""
        text = "Contact us at test@example.com for details."
        cleaned = TextPreprocessor.clean_text(text)
        assert "test@example.com" not in cleaned
        assert "Contact us at" in cleaned

    def test_remove_latex_inline(self):
        """Test LaTeX inline equation removal"""
        text = "The formula $x^2 + y^2 = z^2$ is well known."
        cleaned = TextPreprocessor.clean_text(text)
        assert "$x^2 + y^2 = z^2$" not in cleaned
        assert "[equation]" in cleaned

    def test_remove_latex_display(self):
        """Test LaTeX display equation removal"""
        text = "Consider the equation: $$\\int_0^1 f(x) dx$$ which shows..."
        cleaned = TextPreprocessor.clean_text(text)
        assert "$$" not in cleaned
        assert "\\int" not in cleaned
        assert "[equation]" in cleaned

    def test_normalize_quotes(self):
        """Test quote normalization"""
        text = "\u201cHello\u201d and \u2018world\u2019 with quotes."
        cleaned = TextPreprocessor.clean_text(text)
        # Check that curly quotes are converted to straight quotes
        assert "\u201c" not in cleaned  # Left double quote removed
        assert "\u201d" not in cleaned  # Right double quote removed
        assert "\u2018" not in cleaned  # Left single quote removed
        assert "\u2019" not in cleaned  # Right single quote removed
        assert '"' in cleaned  # Converted to straight double quotes
        assert "'" in cleaned or "'" in cleaned  # Converted to straight single quotes

    def test_empty_text_raises_error(self):
        """Test that empty text raises error"""
        with pytest.raises(TextPreprocessingError):
            TextPreprocessor.clean_text("")

    def test_text_becomes_empty_raises_error(self):
        """Test that text becoming empty raises error"""
        with pytest.raises(TextPreprocessingError):
            # Text with only citations
            TextPreprocessor.clean_text("(Smith, 2020)")

    def test_should_skip_section_references(self):
        """Test detection of references section"""
        assert TextPreprocessor.should_skip_section("References\n")
        assert TextPreprocessor.should_skip_section("REFERENCES")
        assert TextPreprocessor.should_skip_section("references")

    def test_should_skip_section_bibliography(self):
        """Test detection of bibliography section"""
        assert TextPreprocessor.should_skip_section("Bibliography\n")
        assert TextPreprocessor.should_skip_section("bibliography")

    def test_should_not_skip_regular_text(self):
        """Test that regular text is not skipped"""
        assert not TextPreprocessor.should_skip_section("Introduction")
        assert not TextPreprocessor.should_skip_section("This refers to something")

    def test_validate_text_length_too_short(self):
        """Test validation of too-short text"""
        with pytest.raises(TextPreprocessingError, match="too short"):
            TextPreprocessor.validate_text_length("", min_length=1)

    def test_validate_text_length_too_long(self):
        """Test validation of too-long text"""
        long_text = "a" * 10000
        with pytest.raises(TextPreprocessingError, match="too long"):
            TextPreprocessor.validate_text_length(long_text, max_length=5000)

    def test_validate_text_length_valid(self):
        """Test validation of valid text length"""
        # Should not raise
        TextPreprocessor.validate_text_length("Hello world", min_length=1, max_length=100)

    def test_complex_academic_text(self):
        """Test preprocessing of realistic academic text"""
        text = """
        Abstract. Recent advances in neural networks (LeCun et al., 2015) have
        revolutionized NLP. Multiple studies [1, 2, 3] show improved results using
        transformers. The loss function $L = \\sum_{i=1}^n (y_i - \\hat{y}_i)^2$
        demonstrates this. Visit https://arxiv.org for papers.
        """
        cleaned = TextPreprocessor.clean_text(text)

        # Check citations removed
        assert "(LeCun et al., 2015)" not in cleaned
        assert "[1, 2, 3]" not in cleaned

        # Check LaTeX removed
        assert "$L =" not in cleaned
        assert "\\sum" not in cleaned

        # Check URL removed
        assert "https://arxiv.org" not in cleaned

        # Check content preserved
        assert "Abstract" in cleaned
        assert "neural networks" in cleaned
        assert "transformers" in cleaned


class TestTTSEngine:
    """Test TTS Engine functionality"""

    @pytest.fixture
    def model_paths(self):
        """Provide paths to test model files"""
        return {
            'model': '/tmp/kokoro_models/kokoro-v1.0.onnx',
            'voices': '/tmp/kokoro_models/voices-v1.0.bin',
        }

    @pytest.fixture
    def engine(self, model_paths):
        """Create engine instance (requires model files)"""
        try:
            return TTSEngine(
                model_path=model_paths['model'],
                voices_path=model_paths['voices'],
                auto_load=True,
            )
        except FileNotFoundError:
            pytest.skip("Model files not available")

    def test_engine_initialization(self, model_paths):
        """Test engine initialization"""
        engine = TTSEngine(
            model_path=model_paths['model'],
            voices_path=model_paths['voices'],
            auto_load=False,
        )
        assert not engine.is_loaded
        assert engine.default_voice == "af_sarah"

    def test_engine_load_model(self, engine):
        """Test model loading"""
        assert engine.is_loaded
        assert len(engine.available_voices) > 0

    def test_available_voices(self, engine):
        """Test getting available voices"""
        voices = engine.available_voices
        assert isinstance(voices, list)
        assert len(voices) > 10
        assert "af_sarah" in voices

    def test_validate_voice_valid(self, engine):
        """Test validation of valid voice"""
        # Should not raise
        engine.validate_voice("af_sarah")

    def test_validate_voice_invalid(self, engine):
        """Test validation of invalid voice"""
        with pytest.raises(VoiceNotFoundError):
            engine.validate_voice("invalid_voice_123")

    def test_preprocess_text(self, engine):
        """Test text preprocessing through engine"""
        text = "This is a test (Smith, 2020) with citations."
        cleaned = engine.preprocess_text(text)
        assert "(Smith, 2020)" not in cleaned
        assert "test" in cleaned

    def test_synthesize_basic(self, engine):
        """Test basic synthesis"""
        text = "Hello, this is a test."
        audio, sample_rate, metadata = engine.synthesize(text)

        # Check audio
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

        # Check sample rate
        assert sample_rate == 24000

        # Check metadata
        assert metadata['duration_seconds'] > 0
        assert metadata['processing_time_seconds'] > 0
        assert metadata['rtf'] > 0
        assert metadata['voice'] == "af_sarah"

    def test_synthesize_custom_voice(self, engine):
        """Test synthesis with custom voice"""
        text = "Testing different voice."
        audio, sample_rate, metadata = engine.synthesize(
            text, voice="am_michael"
        )

        assert metadata['voice'] == "am_michael"
        assert len(audio) > 0

    def test_synthesize_custom_speed(self, engine):
        """Test synthesis with custom speed"""
        text = "Testing speech speed."
        audio_normal, _, meta_normal = engine.synthesize(text, speed=1.0)
        audio_fast, _, meta_fast = engine.synthesize(text, speed=1.5)

        # Faster speed should produce shorter audio
        assert len(audio_fast) < len(audio_normal)
        assert meta_fast['speed'] == 1.5

    def test_synthesize_with_preprocessing(self, engine):
        """Test synthesis with automatic preprocessing"""
        text = "This study (Author, 2020) shows results [1]."
        audio, sample_rate, metadata = engine.synthesize(
            text, preprocess=True, remove_citations=True
        )

        # Check that original length differs from processed
        assert metadata['original_text_length'] > metadata['processed_text_length']
        assert len(audio) > 0

    def test_synthesize_without_preprocessing(self, engine):
        """Test synthesis without preprocessing"""
        text = "Simple text without citations."
        audio, sample_rate, metadata = engine.synthesize(
            text, preprocess=False
        )

        # Lengths should be the same
        assert metadata['original_text_length'] == metadata['processed_text_length']
        assert len(audio) > 0

    def test_synthesize_invalid_voice_raises_error(self, engine):
        """Test that invalid voice raises error"""
        with pytest.raises(VoiceNotFoundError):
            engine.synthesize("Test", voice="invalid_voice")

    def test_model_not_loaded_error(self, model_paths):
        """Test that using unloaded model raises error"""
        engine = TTSEngine(
            model_path=model_paths['model'],
            voices_path=model_paths['voices'],
            auto_load=False,
        )

        with pytest.raises(ModelNotLoadedError):
            engine.synthesize("Test")


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v"])
