/**
 * Text Chunking Utilities
 * Intelligently split scientific papers into chunks for TTS generation
 */

interface Chunk {
  index: number;
  type: 'abstract' | 'section' | 'paragraph' | 'other';
  sectionTitle?: string;
  text: string;
  startPage?: number;
  endPage?: number;
  wordCount: number;
  charCount: number;
}

/**
 * Common section patterns in scientific papers
 */
const SECTION_PATTERNS = [
  /^Abstract\s*$/im,
  /^Introduction\s*$/im,
  /^Background\s*$/im,
  /^Related\s+Work\s*$/im,
  /^Methods?\s*$/im,
  /^Methodology\s*$/im,
  /^Materials?\s+and\s+Methods?\s*$/im,
  /^Experimental\s+Setup\s*$/im,
  /^Results?\s*$/im,
  /^Discussion\s*$/im,
  /^Results?\s+and\s+Discussion\s*$/im,
  /^Conclusion\s*$/im,
  /^Conclusions?\s*$/im,
  /^Future\s+Work\s*$/im,
  /^Acknowledgments?\s*$/im,
  /^References?\s*$/im,
  /^Bibliography\s*$/im,
  /^Appendix\s*$/im,
  // Numbered sections
  /^\d+\.?\s+[A-Z]/m,
  /^[IVX]+\.?\s+[A-Z]/m
];

/**
 * Patterns to identify references section (to skip)
 */
const REFERENCE_PATTERNS = [
  /^References?\s*$/im,
  /^Bibliography\s*$/im,
  /^Works?\s+Cited\s*$/im,
  /^Literature\s+Cited\s*$/im
];

/**
 * Maximum chunk size (in words) for optimal TTS processing
 */
const MAX_CHUNK_WORDS = 800;
const MIN_CHUNK_WORDS = 100;
const PREFERRED_CHUNK_WORDS = 500;

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Extract abstract from paper text
 */
function extractAbstract(text: string): string | null {
  // Try to find abstract section
  const abstractMatch = text.match(/abstract\s*(.{0,2000}?)\n\n/is);
  if (abstractMatch) {
    return abstractMatch[1].trim();
  }

  // Try numbered abstract
  const numberedMatch = text.match(/^abstract\s*\n+(.+?)(?=\n\n|\n\d+\.|\nIntroduction)/is);
  if (numberedMatch) {
    return numberedMatch[1].trim();
  }

  return null;
}

/**
 * Detect if text is likely a references section
 */
function isReferencesSection(text: string): boolean {
  const firstLine = text.split('\n')[0];
  return REFERENCE_PATTERNS.some(pattern => pattern.test(firstLine));
}

/**
 * Split text by section headers
 */
function splitBySections(text: string): Array<{title?: string; text: string}> {
  const sections: Array<{title?: string; text: string}> = [];
  const lines = text.split('\n');

  let currentSection: {title?: string; text: string} = {text: ''};
  let inReferences = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if this is a section header
    const isHeader = SECTION_PATTERNS.some(pattern => pattern.test(line));

    if (isHeader) {
      // Check if entering references section
      if (isReferencesSection(line)) {
        inReferences = true;
      }

      // Save previous section if it has content
      if (currentSection.text.trim().length > 0) {
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        title: line,
        text: ''
      };
    } else if (!inReferences) {
      // Add line to current section (skip references)
      currentSection.text += line + '\n';
    }
  }

  // Add final section
  if (currentSection.text.trim().length > 0 && !inReferences) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Split long text into paragraph-based chunks
 */
function splitIntoParagraphChunks(text: string, targetWords: number = PREFERRED_CHUNK_WORDS): string[] {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);

    // If paragraph alone exceeds max, split it by sentences
    if (paragraphWords > MAX_CHUNK_WORDS) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentWords = 0;
      }

      // Split long paragraph by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      let sentenceChunk = '';
      let sentenceWords = 0;

      for (const sentence of sentences) {
        const sentWords = countWords(sentence);
        if (sentenceWords + sentenceWords > MAX_CHUNK_WORDS && sentenceChunk) {
          chunks.push(sentenceChunk.trim());
          sentenceChunk = sentence + ' ';
          sentenceWords = sentWords;
        } else {
          sentenceChunk += sentence + ' ';
          sentenceWords += sentWords;
        }
      }

      if (sentenceChunk) {
        chunks.push(sentenceChunk.trim());
      }
      continue;
    }

    // Check if adding this paragraph would exceed target
    if (currentWords + paragraphWords > targetWords && currentWords >= MIN_CHUNK_WORDS) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph + '\n\n';
      currentWords = paragraphWords;
    } else {
      currentChunk += paragraph + '\n\n';
      currentWords += paragraphWords;
    }
  }

  // Add remaining text
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Main function: Chunk a scientific paper into optimal segments for TTS
 */
export function chunkPaperText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  // Clean and normalize text
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Extract and add abstract as first chunk
  const abstract = extractAbstract(cleanedText);
  if (abstract && countWords(abstract) >= MIN_CHUNK_WORDS) {
    chunks.push({
      index: chunkIndex++,
      type: 'abstract',
      sectionTitle: 'Abstract',
      text: abstract,
      wordCount: countWords(abstract),
      charCount: abstract.length
    });
  }

  // Split rest of paper by sections
  const sections = splitBySections(cleanedText);

  for (const section of sections) {
    const sectionWords = countWords(section.text);

    // Skip very short sections
    if (sectionWords < MIN_CHUNK_WORDS) {
      continue;
    }

    // If section is reasonable size, add as single chunk
    if (sectionWords <= MAX_CHUNK_WORDS) {
      chunks.push({
        index: chunkIndex++,
        type: 'section',
        sectionTitle: section.title,
        text: section.text.trim(),
        wordCount: sectionWords,
        charCount: section.text.length
      });
    } else {
      // Split large section into paragraph-based chunks
      const subChunks = splitIntoParagraphChunks(section.text);

      for (const subChunk of subChunks) {
        chunks.push({
          index: chunkIndex++,
          type: 'paragraph',
          sectionTitle: section.title,
          text: subChunk,
          wordCount: countWords(subChunk),
          charCount: subChunk.length
        });
      }
    }
  }

  return chunks;
}

/**
 * Clean text for TTS (remove citations, special characters, etc.)
 */
export function cleanTextForTTS(text: string): string {
  return text
    // Remove in-text citations like (Author, 2020) or [1]
    .replace(/\([^)]*\d{4}[^)]*\)/g, '')
    .replace(/\[\d+(?:,\s*\d+)*\]/g, '')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove email addresses
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '')
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    // Remove special LaTeX/formatting characters
    .replace(/[{}$\\]/g, '')
    // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Clean up
    .trim();
}

/**
 * Estimate audio duration for text (rough estimate)
 * Average speaking rate: ~150 words per minute
 */
export function estimateAudioDuration(text: string): number {
  const words = countWords(text);
  const minutes = words / 150;
  return Math.round(minutes * 60); // Return seconds
}

export default {
  chunkPaperText,
  cleanTextForTTS,
  estimateAudioDuration,
  countWords
};
