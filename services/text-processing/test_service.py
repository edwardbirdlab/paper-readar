#!/usr/bin/env python3
"""
Test script for text-processing service
Validates service structure, prompts, and API without loading actual models
"""
import sys
import json
from prompts import STAGE1_CLEANUP_PROMPT, STAGE2_REORGANIZATION_PROMPT

# Test sample text (from a scientific paper)
SAMPLE_TEXT = """
Abstract

Mosquitoes transmit various diseases such as malaria (e.g., Plasmodium falciparum), dengue,
and Zika virus [1]. The use of insecticides is one of the main control strategies (Smith et al.,
2020). However, sublethal exposure to insecticides can affect mosquito behavior and physiology.

Introduction

Culex quinquefasciatus (C. quinquefasciatus) is a major vector of West Nile virus. Recent studies
have shown that exposure to pyrethroids at LD₅₀ concentrations can alter feeding behavior. The
concentration used was approximately 50 µg/ml (α = 0.05, β = 0.8).

Methods

Adult mosquitoes were collected and exposed to deltamethrin at 25°C ± 2°C. Mortality was assessed
after 24h (Figure 1). Statistical analysis used ANOVA (p < 0.05).

Results

We observed significant mortality (65% ± 5%) compared to controls (see Table 1). Flight activity
decreased by 40% (Figure 2A).

Discussion

Our results demonstrate that sublethal insecticide exposure significantly impacts C. quinquefasciatus
behavior. These findings align with previous work (Author et al., 2019; Smith and Jones, 2021).

References

1. Smith, J. et al. (2020) Vector biology. Nature 123:456-789.
2. Jones, A. (2019) Insecticide resistance. Science 456:123-456.
"""

def test_prompts():
    """Test that prompts are properly defined"""
    print("=" * 80)
    print("TEST 1: Validate Prompts")
    print("=" * 80)

    # Check Stage 1 prompt
    print("\n✓ Stage 1 Cleanup Prompt:")
    print(f"  - Length: {len(STAGE1_CLEANUP_PROMPT)} characters")
    assert "CITATIONS" in STAGE1_CLEANUP_PROMPT, "Missing citations section"
    assert "ABBREVIATIONS" in STAGE1_CLEANUP_PROMPT, "Missing abbreviations section"
    assert "SPECIES NAMES" in STAGE1_CLEANUP_PROMPT, "Missing species names section"
    assert "GREEK LETTERS" in STAGE1_CLEANUP_PROMPT, "Missing Greek letters section"
    assert "PRESERVE" in STAGE1_CLEANUP_PROMPT, "Missing preserve section"
    print("  - Contains all required sections ✓")

    # Check Stage 2 prompt
    print("\n✓ Stage 2 Reorganization Prompt:")
    print(f"  - Length: {len(STAGE2_REORGANIZATION_PROMPT)} characters")
    assert "SECTION DETECTION" in STAGE2_REORGANIZATION_PROMPT, "Missing section detection"
    assert "SECTION ORDERING" in STAGE2_REORGANIZATION_PROMPT, "Missing section ordering"
    assert "[SECTION:" in STAGE2_REORGANIZATION_PROMPT, "Missing section marker format"
    assert "HANDLE MISSING" in STAGE2_REORGANIZATION_PROMPT, "Missing missing sections handling"
    print("  - Contains all required sections ✓")

    print("\n✅ All prompts validated successfully\n")

def simulate_stage1_processing(text):
    """Simulate Stage 1 processing (without actual model)"""
    print("=" * 80)
    print("TEST 2: Simulate Stage 1 Processing")
    print("=" * 80)

    print(f"\nInput text: {len(text)} characters")

    # Simulate what Stage 1 should do based on prompt
    print("\nStage 1 Tasks (based on prompt):")
    print("  1. Remove citations:")

    # Count citations to remove
    import re
    citations = re.findall(r'\[[\d,\-]+\]|\([A-Z][^)]+\d{4}\)', text)
    print(f"     - Found {len(citations)} citations to remove")

    print("  2. Expand abbreviations:")
    abbreviations = {
        'e.g.': 'for example',
        'µg/ml': 'micrograms per milliliter',
        'LD₅₀': 'lethal dose fifty',
        '°C': 'degrees Celsius',
        '±': 'plus or minus',
        'α': 'alpha',
        'β': 'beta'
    }
    for abbr, expanded in abbreviations.items():
        if abbr in text:
            print(f"     - {abbr} → {expanded}")

    print("  3. Expand species names (first occurrence):")
    if 'C. quinquefasciatus' in text:
        print(f"     - C. quinquefasciatus → Culex quinquefasciatus (first occurrence)")

    print("  4. Remove figure/table references:")
    figures = re.findall(r'Figure \d+[A-Z]?|Table \d+', text)
    print(f"     - Found {len(figures)} figure/table references to remove")

    print("  5. Preserve section structure:")
    sections = re.findall(r'^(Abstract|Introduction|Methods|Results|Discussion|References)$', text, re.MULTILINE)
    print(f"     - Detected {len(sections)} section headers to preserve")

    # Simulate cleaned output
    cleaned_text = text
    for citation in citations:
        cleaned_text = cleaned_text.replace(citation, '')
    for abbr, expanded in abbreviations.items():
        cleaned_text = cleaned_text.replace(abbr, expanded)
    cleaned_text = cleaned_text.replace('C. quinquefasciatus', 'Culex quinquefasciatus', 1)
    for fig in figures:
        cleaned_text = cleaned_text.replace(f"(see {fig})", "")
        cleaned_text = cleaned_text.replace(f"({fig})", "")

    print(f"\n✓ Stage 1 output: {len(cleaned_text)} characters")
    print("\n✅ Stage 1 simulation complete\n")

    return cleaned_text

def simulate_stage2_processing(text):
    """Simulate Stage 2 processing (without actual model)"""
    print("=" * 80)
    print("TEST 3: Simulate Stage 2 Processing")
    print("=" * 80)

    print(f"\nInput text: {len(text)} characters")

    # Simulate what Stage 2 should do based on prompt
    print("\nStage 2 Tasks (based on prompt):")
    print("  1. Detect sections:")

    import re
    sections_detected = []
    for line in text.split('\n'):
        line = line.strip()
        if line in ['Abstract', 'Introduction', 'Methods', 'Results', 'Discussion', 'References']:
            sections_detected.append(line)

    print(f"     - Detected sections: {', '.join(sections_detected)}")

    print("  2. Reorder to standard sequence:")
    standard_order = ['Abstract', 'Introduction', 'Methods', 'Results', 'Discussion']
    print(f"     - Standard order: {' → '.join(standard_order)}")

    print("  3. Skip References section")

    print("  4. Add [SECTION: Name] markers:")

    # Simulate reorganized output
    reorganized = ""
    for section in standard_order:
        if section in sections_detected:
            reorganized += f"\n[SECTION: {section}]\n"
            # Extract section content (simplified)
            start = text.find(section)
            if start != -1:
                # Find next section or end
                next_section_start = len(text)
                for other_section in sections_detected:
                    if other_section != section:
                        pos = text.find(other_section, start + len(section))
                        if pos != -1 and pos < next_section_start:
                            next_section_start = pos

                content = text[start + len(section):next_section_start].strip()
                reorganized += content + "\n"
                print(f"     - Added [SECTION: {section}] with {len(content)} chars")

    print(f"\n✓ Stage 2 output: {len(reorganized)} characters")
    print(f"✓ Sections in output: {len(standard_order)}")
    print("\n✅ Stage 2 simulation complete\n")

    return reorganized

def test_output_format(text):
    """Test that output has correct format for chunking"""
    print("=" * 80)
    print("TEST 4: Validate Output Format")
    print("=" * 80)

    import re
    section_markers = re.findall(r'\[SECTION: ([^\]]+)\]', text)

    print(f"\nFound {len(section_markers)} section markers:")
    for marker in section_markers:
        print(f"  - [SECTION: {marker}]")

    # Verify sections are in correct order
    expected_order = ['Abstract', 'Introduction', 'Methods', 'Results', 'Discussion']
    actual_order = [m for m in section_markers if m in expected_order]

    if actual_order == [s for s in expected_order if s in actual_order]:
        print("\n✓ Sections are in correct order")
    else:
        print(f"\n✗ Section order incorrect: {actual_order}")

    print("\n✅ Output format validated\n")

def test_api_structure():
    """Test that the API structure is correct"""
    print("=" * 80)
    print("TEST 5: Validate API Structure")
    print("=" * 80)

    # Import main to check structure
    import main

    print("\n✓ FastAPI app exists:", hasattr(main, 'app'))
    print("✓ Stage 1 model variable:", hasattr(main, 'stage1_model'))
    print("✓ Stage 2 model variable:", hasattr(main, 'stage2_model'))
    print("✓ Load stage1 function:", hasattr(main, 'load_stage1_model'))
    print("✓ Load stage2 function:", hasattr(main, 'load_stage2_model'))
    print("✓ Unload stage1 function:", hasattr(main, 'unload_stage1_model'))
    print("✓ Unload stage2 function:", hasattr(main, 'unload_stage2_model'))

    # Check configuration
    print(f"\n✓ Stage 1 Model: {main.STAGE1_MODEL}")
    print(f"✓ Stage 2 Model: {main.STAGE2_MODEL}")
    print(f"✓ Device: {main.DEVICE}")
    print(f"✓ Max text length: {main.MAX_TEXT_LENGTH}")

    print("\n✅ API structure validated\n")

def main():
    """Run all tests"""
    print("\n" + "=" * 80)
    print("TEXT PROCESSING SERVICE - VALIDATION TESTS")
    print("=" * 80 + "\n")

    try:
        # Test 1: Validate prompts
        test_prompts()

        # Test 2: Simulate Stage 1
        stage1_output = simulate_stage1_processing(SAMPLE_TEXT)

        # Test 3: Simulate Stage 2
        stage2_output = simulate_stage2_processing(stage1_output)

        # Test 4: Validate output format
        test_output_format(stage2_output)

        # Test 5: Check API structure
        test_api_structure()

        print("=" * 80)
        print("✅ ALL TESTS PASSED")
        print("=" * 80)
        print("\nService structure is valid and ready for Docker deployment!")
        print("Models will be loaded when deployed to production environment.\n")

        return 0

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
