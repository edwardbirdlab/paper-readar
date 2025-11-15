/**
 * BullMQ Queue Client
 * Manages job queues for background processing
 */

import { Queue, QueueEvents } from 'bullmq';

// Parse Redis URL
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrlWithoutProtocol = redisUrl.replace('redis://', '');
const [host, portStr] = redisUrlWithoutProtocol.split(':');
const port = parseInt(portStr || '6379', 10);

if (isNaN(port)) {
  console.error('Redis configuration error:', {
    redisUrl: process.env.REDIS_URL,
    host,
    portStr,
    port
  });
  throw new Error(`Invalid REDIS_URL port: ${redisUrl}. Expected format: redis://hostname:port`);
}

console.log(`Initializing Redis connection: ${host}:${port}`);

// Redis configuration
const redisConnection = {
  host: host || 'localhost',
  port
};

/**
 * Text Processing Job Queue (Two-stage LLM pipeline)
 */
export const textProcessingQueue = new Queue('text-processing-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2, // Retry once if it fails
    backoff: {
      type: 'fixed',
      delay: 60000 // 1 minute
    },
    timeout: 7200000, // 2 hour timeout
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 100
    },
    removeOnFail: {
      age: 604800 // Keep failed jobs for 7 days
    }
  }
});

/**
 * TTS Job Queue
 */
export const ttsQueue = new Queue('tts-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 1000
    },
    removeOnFail: {
      age: 604800 // Keep failed jobs for 7 days
    }
  }
});

/**
 * Queue Events for monitoring
 */
export const ttsQueueEvents = new QueueEvents('tts-jobs', {
  connection: redisConnection
});

/**
 * Add a TTS job to the queue
 */
export interface TTSJobData {
  paperId: string;
  chunkId: string;
  text: string;
  chunkIndex: number;
  voice?: string;
}

export async function addTTSJob(data: TTSJobData): Promise<string> {
  const job = await ttsQueue.add('generate-tts', data, {
    jobId: `tts-${data.paperId}-${data.chunkIndex}`,
    priority: 1
  });

  console.log(`Added TTS job ${job.id} for chunk ${data.chunkIndex} of paper ${data.paperId}`);
  return job.id || '';
}

/**
 * Add multiple TTS jobs in bulk
 */
export async function addBulkTTSJobs(jobs: TTSJobData[]): Promise<void> {
  const bulkJobs = jobs.map((data, index) => ({
    name: 'generate-tts',
    data,
    opts: {
      jobId: `tts-${data.paperId}-${data.chunkIndex}`,
      priority: index + 1 // Process in order
    }
  }));

  await ttsQueue.addBulk(bulkJobs);
  console.log(`Added ${jobs.length} TTS jobs to queue`);
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string) {
  const job = await ttsQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const progress = job.progress;

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason
  };
}

/**
 * Get all jobs for a paper
 */
export async function getPaperJobs(paperId: string) {
  const jobs = await ttsQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
  return jobs.filter(job => job.data.paperId === paperId);
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    ttsQueue.getWaitingCount(),
    ttsQueue.getActiveCount(),
    ttsQueue.getCompletedCount(),
    ttsQueue.getFailedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active + completed + failed
  };
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: string): Promise<void> {
  const job = await ttsQueue.getJob(jobId);
  if (job) {
    await job.retry();
    console.log(`Retrying job ${jobId}`);
  }
}

/**
 * Remove a job from the queue
 */
export async function removeJob(jobId: string): Promise<void> {
  const job = await ttsQueue.getJob(jobId);
  if (job) {
    await job.remove();
    console.log(`Removed job ${jobId}`);
  }
}

/**
 * Clean up old jobs
 */
export async function cleanQueue(
  grace: number = 86400000, // 24 hours in ms
  limit: number = 1000
): Promise<void> {
  await ttsQueue.clean(grace, limit, 'completed');
  await ttsQueue.clean(grace, limit, 'failed');
  console.log('Queue cleaned');
}

/**
 * Text Processing Job Interface
 */
export interface TextProcessingJobData {
  paperId: string;
  rawText: string;
  metadata?: {
    title?: string;
    authors?: string;
    pages?: number;
  };
}

/**
 * Add a text processing job to the queue
 */
export async function addTextProcessingJob(data: TextProcessingJobData): Promise<string> {
  const job = await textProcessingQueue.add('process-text', data, {
    jobId: `text-${data.paperId}`,
    priority: 1
  });

  console.log(`Added text processing job ${job.id} for paper ${data.paperId}`);
  return job.id || '';
}

/**
 * Close queue connections
 */
export async function closeQueues(): Promise<void> {
  await textProcessingQueue.close();
  await ttsQueue.close();
  await ttsQueueEvents.close();
}

export default {
  textProcessingQueue,
  ttsQueue,
  ttsQueueEvents,
  addTextProcessingJob,
  addTTSJob,
  addBulkTTSJobs,
  getJobStatus,
  getPaperJobs,
  getQueueStats,
  retryJob,
  removeJob,
  cleanQueue,
  closeQueues
};
