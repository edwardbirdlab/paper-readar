/**
 * Text Processing Worker
 *
 * BullMQ worker that processes text-processing jobs:
 * 1. Receives job with paper ID and raw text
 * 2. Calls text-processing service (two-stage LLM pipeline)
 * 3. Parses [SECTION: Name] markers from output
 * 4. Creates chunks by section
 * 5. Queues TTS jobs for each chunk
 * 6. Updates paper status
 */

import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import Redis from 'ioredis';
import axios from 'axios';

// ==================== Configuration ====================

const TEXT_PROCESSING_URL = process.env.TEXT_PROCESSING_URL || 'http://text-processing:8009';
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '1');

const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ==================== Types ====================

interface TextProcessingJob {
  paperId: string;
  rawText: string;
  metadata?: {
    title?: string;
    authors?: string;
    pages?: number;
  };
}

interface ProcessedSection {
  name: string;
  content: string;
  wordCount: number;
  charCount: number;
}

interface Chunk {
  paperId: string;
  chunkIndex: number;
  chunkType: string;
  sectionTitle: string;
  textContent: string;
  wordCount: number;
  charCount: number;
}

// ==================== Helper Functions ====================

/**
 * Parse [SECTION: Name] markers and extract sections
 */
function parseSections(processedText: string): ProcessedSection[] {
  const sections: ProcessedSection[] = [];
  const sectionRegex = /\[SECTION:\s*([^\]]+)\]([\s\S]*?)(?=\[SECTION:|$)/g;

  let match;
  while ((match = sectionRegex.exec(processedText)) !== null) {
    const name = match[1].trim();
    const content = match[2].trim();

    if (content.length > 0) {
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

      sections.push({
        name,
        content,
        wordCount,
        charCount: content.length,
      });
    }
  }

  return sections;
}

/**
 * Chunk text by sections
 * - Sections < 800 words → single chunk
 * - Sections > 800 words → split by paragraphs (target 500 words/chunk)
 */
function chunkBySections(sections: ProcessedSection[], paperId: string): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    if (section.wordCount <= 800) {
      // Section fits in one chunk
      chunks.push({
        paperId,
        chunkIndex: chunkIndex++,
        chunkType: 'section',
        sectionTitle: section.name,
        textContent: section.content,
        wordCount: section.wordCount,
        charCount: section.charCount,
      });
    } else {
      // Split section by paragraphs
      const paragraphs = section.content.split(/\n\n+/);
      let currentChunk = '';
      let currentWordCount = 0;

      for (const para of paragraphs) {
        const paraWords = para.split(/\s+/).filter(w => w.length > 0).length;

        if (currentWordCount + paraWords > 800 && currentChunk.length > 0) {
          // Current chunk is full, save it
          chunks.push({
            paperId,
            chunkIndex: chunkIndex++,
            chunkType: 'section',
            sectionTitle: section.name,
            textContent: currentChunk.trim(),
            wordCount: currentWordCount,
            charCount: currentChunk.length,
          });

          currentChunk = para;
          currentWordCount = paraWords;
        } else {
          // Add paragraph to current chunk
          currentChunk += (currentChunk ? '\n\n' : '') + para;
          currentWordCount += paraWords;
        }
      }

      // Save last chunk if not empty
      if (currentChunk.trim().length > 0) {
        chunks.push({
          paperId,
          chunkIndex: chunkIndex++,
          chunkType: 'section',
          sectionTitle: section.name,
          textContent: currentChunk.trim(),
          wordCount: currentWordCount,
          charCount: currentChunk.length,
        });
      }
    }
  }

  return chunks;
}

/**
 * Update paper status in database
 */
async function updatePaperStatus(
  paperId: string,
  stage: string,
  error?: string
): Promise<void> {
  const client = await db.connect();

  try {
    if (stage === 'text_processing') {
      await client.query(
        `UPDATE papers
         SET processing_stage = $1,
             text_processing_started_at = NOW()
         WHERE id = $2`,
        [stage, paperId]
      );
    } else if (stage === 'text_completed') {
      await client.query(
        `UPDATE papers
         SET processing_stage = $1,
             text_processing_completed_at = NOW()
         WHERE id = $2`,
        [stage, paperId]
      );
    } else if (stage === 'tts_processing') {
      await client.query(
        `UPDATE papers
         SET processing_stage = $1
         WHERE id = $2`,
        [stage, paperId]
      );
    } else if (stage === 'failed') {
      await client.query(
        `UPDATE papers
         SET processing_stage = $1,
             text_processing_error = $2,
             text_processing_completed_at = NOW()
         WHERE id = $3`,
        [stage, error, paperId]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Create chunk records in database
 */
async function createChunks(chunks: Chunk[]): Promise<void> {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO paper_chunks (
          id, paper_id, chunk_index, chunk_type, section_title,
          text_content, word_count, char_count, status
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'pending'
        )`,
        [
          chunk.paperId,
          chunk.chunkIndex,
          chunk.chunkType,
          chunk.sectionTitle,
          chunk.textContent,
          chunk.wordCount,
          chunk.charCount,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Queue TTS jobs for all chunks
 */
async function queueTTSJobs(paperId: string): Promise<void> {
  const client = await db.connect();

  try {
    // Get all chunks for this paper
    const result = await client.query(
      `SELECT id, chunk_index, text_content
       FROM paper_chunks
       WHERE paper_id = $1
       ORDER BY chunk_index ASC`,
      [paperId]
    );

    // Queue TTS job for each chunk
    const { Queue } = await import('bullmq');
    const ttsQueue = new Queue('tts-jobs', { connection: redisConnection });

    for (const row of result.rows) {
      await ttsQueue.add(
        'generate-tts',
        {
          paperId,
          chunkId: row.id,
          text: row.text_content,
          chunkIndex: row.chunk_index,
          voice: 'af_sarah', // Default voice
        },
        {
          priority: row.chunk_index, // Process in order
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );
    }

    console.log(`✓ Queued ${result.rows.length} TTS jobs for paper ${paperId}`);
  } finally {
    client.release();
  }
}

// ==================== Worker Job Processing ====================

async function processTextJob(job: Job<TextProcessingJob>): Promise<void> {
  const { paperId, rawText, metadata } = job.data;

  console.log('='.repeat(80));
  console.log(`Processing text for paper: ${paperId}`);
  console.log(`Text length: ${rawText.length} characters`);
  console.log(`Metadata:`, metadata);
  console.log('='.repeat(80));

  try {
    // Step 1: Update paper status to text_processing
    await updatePaperStatus(paperId, 'text_processing');
    console.log('✓ Updated paper status to text_processing');

    // Step 2: Call text-processing service
    console.log('Calling text-processing service (this will take 2-3 hours)...');
    console.log(`URL: ${TEXT_PROCESSING_URL}/process`);

    const response = await axios.post(
      `${TEXT_PROCESSING_URL}/process`,
      {
        text: rawText,
        metadata,
      },
      {
        timeout: 7200000, // 2 hour timeout
      }
    );

    const { final_output, stage1_time, stage2_time, processing_time_seconds } = response.data;

    console.log(`✓ Text processing complete in ${processing_time_seconds}s`);
    console.log(`  - Stage 1 (cleanup): ${stage1_time}s`);
    console.log(`  - Stage 2 (reorganization): ${stage2_time}s`);
    console.log(`  - Output length: ${final_output.length} characters`);

    // Step 3: Parse sections from output
    const sections = parseSections(final_output);
    console.log(`✓ Parsed ${sections.length} sections:`);
    sections.forEach(s => {
      console.log(`  - [${s.name}]: ${s.wordCount} words`);
    });

    // Step 4: Chunk by sections
    const chunks = chunkBySections(sections, paperId);
    console.log(`✓ Created ${chunks.length} chunks`);

    // Step 5: Create chunk records in database
    await createChunks(chunks);
    console.log(`✓ Saved ${chunks.length} chunks to database`);

    // Step 6: Update paper status to text_completed
    await updatePaperStatus(paperId, 'text_completed');
    console.log('✓ Updated paper status to text_completed');

    // Step 7: Queue TTS jobs
    await queueTTSJobs(paperId);

    // Step 8: Update paper status to tts_processing
    await updatePaperStatus(paperId, 'tts_processing');
    console.log('✓ Updated paper status to tts_processing');

    console.log('='.repeat(80));
    console.log(`✅ Text processing job complete for paper ${paperId}`);
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Text processing failed:', error.message);

    // Update paper status to failed
    await updatePaperStatus(
      paperId,
      'failed',
      error.message || 'Unknown error during text processing'
    );

    throw error; // BullMQ will handle retry
  }
}

// ==================== Worker Setup ====================

const worker = new Worker<TextProcessingJob>(
  'text-processing-jobs',
  processTextJob,
  {
    connection: redisConnection,
    concurrency: WORKER_CONCURRENCY,
    limiter: {
      max: 1,
      duration: 1000, // Only 1 job per second (heavy processing)
    },
  }
);

// ==================== Event Handlers ====================

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

// ==================== Startup ====================

console.log('='.repeat(80));
console.log('TEXT PROCESSING WORKER STARTED');
console.log('='.repeat(80));
console.log(`Text Processing Service: ${TEXT_PROCESSING_URL}`);
console.log(`Concurrency: ${WORKER_CONCURRENCY}`);
console.log(`Queue: text-processing-jobs`);
console.log('='.repeat(80));

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing worker...');
  await worker.close();
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing worker...');
  await worker.close();
  await db.end();
  process.exit(0);
});
