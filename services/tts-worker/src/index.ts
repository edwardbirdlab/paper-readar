/**
 * TTS Worker - Background job processor for generating TTS audio
 * Processes paper chunks and generates audio using Kokoro TTS service
 */

import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { Client as MinioClient } from 'minio';
import axios from 'axios';
import winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Environment configuration
const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_URL?.replace('redis://', '').split(':')[0] || 'localhost',
    port: parseInt(process.env.REDIS_URL?.split(':')[2] || '6379')
  },
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://paper_reader:changeme@localhost:5432/paper_reader'
  },
  minio: {
    endPoint: (process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[0],
    port: parseInt((process.env.MINIO_ENDPOINT || 'localhost:9000').split(':')[1] || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
  },
  tts: {
    serviceUrl: process.env.TTS_SERVICE_URL || 'http://localhost:8000'
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2')
  }
};

// Database connection pool
const pool = new Pool({
  connectionString: config.database.connectionString
});

// MinIO client
const minioClient = new MinioClient(config.minio);

// Job data interface
interface TTSJobData {
  paperId: string;
  chunkId: string;
  text: string;
  chunkIndex: number;
  voice?: string;
}

/**
 * Process a single TTS job
 */
async function processTTSJob(job: Job<TTSJobData>) {
  const { paperId, chunkId, text, chunkIndex, voice = 'af_sarah' } = job.data;

  logger.info(`Processing TTS job for chunk ${chunkIndex} of paper ${paperId}`);

  try {
    // Update chunk status to processing
    await pool.query(
      'UPDATE paper_chunks SET tts_status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', chunkId]
    );

    // Call TTS service
    logger.info(`Calling TTS service for ${text.length} characters`);
    const ttsResponse = await axios.post(`${config.tts.serviceUrl}/generate`, {
      text,
      voice,
      speed: 1.0,
      format: 'wav'
    });

    const { audio_path, duration } = ttsResponse.data;

    // Download audio file from TTS service
    const audioUrl = `${config.tts.serviceUrl}${audio_path}`;
    logger.info(`Downloading audio from ${audioUrl}`);

    const audioResponse = await axios.get(audioUrl, {
      responseType: 'arraybuffer'
    });

    // Upload to MinIO
    const audioFileName = `${paperId}/${chunkIndex}.wav`;
    const audioBuffer = Buffer.from(audioResponse.data);

    logger.info(`Uploading audio to MinIO: ${audioFileName}`);
    await minioClient.putObject(
      'audio',
      audioFileName,
      audioBuffer,
      audioBuffer.length,
      {
        'Content-Type': 'audio/wav'
      }
    );

    // Clean up temp file on TTS service
    try {
      await axios.delete(audioUrl);
    } catch (err) {
      logger.warn(`Failed to delete temp file: ${err}`);
    }

    // Update chunk with audio file path and duration
    await pool.query(
      `UPDATE paper_chunks
       SET audio_file_path = $1,
           audio_duration = $2,
           tts_status = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [audioFileName, duration, 'completed', chunkId]
    );

    // Check if all chunks for this paper are completed
    const chunkStatus = await pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tts_status = 'completed') as completed
       FROM paper_chunks
       WHERE paper_id = $1`,
      [paperId]
    );

    const { total, completed } = chunkStatus.rows[0];

    logger.info(`Paper ${paperId}: ${completed}/${total} chunks completed`);

    // Update paper status if all chunks are done
    if (parseInt(completed) === parseInt(total)) {
      await pool.query(
        `UPDATE papers
         SET tts_status = $1,
             tts_completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        ['completed', paperId]
      );
      logger.info(`Paper ${paperId} TTS processing completed!`);
    }

    logger.info(`Successfully processed chunk ${chunkIndex} for paper ${paperId}`);

    return { success: true, audioPath: audioFileName, duration };

  } catch (error: any) {
    logger.error(`Error processing TTS job: ${error.message}`, { error });

    // Update chunk with error
    await pool.query(
      `UPDATE paper_chunks
       SET tts_status = $1,
           tts_error = $2,
           updated_at = NOW()
       WHERE id = $3`,
      ['failed', error.message, chunkId]
    );

    // Update paper status to failed
    await pool.query(
      `UPDATE papers
       SET tts_status = $1,
           tts_error = $2,
           updated_at = NOW()
       WHERE id = $3`,
      ['failed', error.message, paperId]
    );

    throw error;
  }
}

/**
 * Main function - start the worker
 */
async function main() {
  logger.info('Starting TTS Worker...');
  logger.info('Configuration:', {
    redis: `${config.redis.host}:${config.redis.port}`,
    database: config.database.connectionString.split('@')[1],
    minio: `${config.minio.endPoint}:${config.minio.port}`,
    tts: config.tts.serviceUrl,
    concurrency: config.worker.concurrency
  });

  // Test database connection
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    process.exit(1);
  }

  // Test MinIO connection
  try {
    const buckets = await minioClient.listBuckets();
    logger.info(`MinIO connected successfully. Buckets: ${buckets.map(b => b.name).join(', ')}`);
  } catch (error) {
    logger.error('Failed to connect to MinIO:', error);
    process.exit(1);
  }

  // Create BullMQ worker
  const worker = new Worker(
    'tts-jobs',
    async (job: Job<TTSJobData>) => {
      return await processTTSJob(job);
    },
    {
      connection: {
        host: config.redis.host,
        port: config.redis.port
      },
      concurrency: config.worker.concurrency,
      limiter: {
        max: 10,
        duration: 60000 // Max 10 jobs per minute per worker
      }
    }
  );

  // Worker event handlers
  worker.on('completed', (job: Job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    logger.error(`Job ${job?.id} failed:`, error);
  });

  worker.on('error', (error: Error) => {
    logger.error('Worker error:', error);
  });

  logger.info(`TTS Worker started with concurrency: ${config.worker.concurrency}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing worker...');
    await worker.close();
    await pool.end();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, closing worker...');
    await worker.close();
    await pool.end();
    process.exit(0);
  });
}

// Start the worker
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
