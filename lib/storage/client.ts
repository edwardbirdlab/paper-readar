/**
 * MinIO Storage Client
 * Replaces Supabase Storage with MinIO (S3-compatible)
 */

import { Client as MinioClient, BucketItem } from 'minio';
import { Readable } from 'stream';

// Parse MinIO endpoint
const endpoint = process.env.MINIO_ENDPOINT || 'localhost:9000';
const [endPoint, portStr] = endpoint.split(':');
const port = parseInt(portStr || '9000', 10);

if (isNaN(port)) {
  console.error('MinIO configuration error:', {
    endpoint: process.env.MINIO_ENDPOINT,
    endPoint,
    portStr,
    port
  });
  throw new Error(`Invalid MINIO_ENDPOINT port: ${endpoint}. Expected format: hostname:port`);
}

console.log(`Initializing MinIO client: ${endPoint}:${port} (SSL: ${process.env.MINIO_USE_SSL === 'true'})`);

// Initialize MinIO client
const minioClient = new MinioClient({
  endPoint: endPoint || 'localhost',
  port,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

/**
 * Storage buckets
 */
export const BUCKETS = {
  PAPERS: 'papers',
  AUDIO: 'audio',
  VOICE_NOTES: 'voice-notes'
} as const;

/**
 * Ensure bucket exists
 */
export async function ensureBucket(bucketName: string): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log(`Bucket ${bucketName} created`);
    }
  } catch (error) {
    console.error(`Error ensuring bucket ${bucketName}:`, error);
    throw error;
  }
}

/**
 * Upload a file to storage
 */
export async function uploadFile(
  bucketName: string,
  fileName: string,
  fileBuffer: Buffer,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    await ensureBucket(bucketName);

    await minioClient.putObject(
      bucketName,
      fileName,
      fileBuffer,
      fileBuffer.length,
      metadata
    );

    console.log(`File uploaded: ${bucketName}/${fileName}`);
    return fileName;
  } catch (error) {
    console.error(`Error uploading file ${fileName}:`, error);
    throw error;
  }
}

/**
 * Upload a file from stream
 */
export async function uploadStream(
  bucketName: string,
  fileName: string,
  stream: Readable,
  size: number,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    await ensureBucket(bucketName);

    await minioClient.putObject(
      bucketName,
      fileName,
      stream,
      size,
      metadata
    );

    console.log(`Stream uploaded: ${bucketName}/${fileName}`);
    return fileName;
  } catch (error) {
    console.error(`Error uploading stream ${fileName}:`, error);
    throw error;
  }
}

/**
 * Download a file from storage
 */
export async function downloadFile(
  bucketName: string,
  fileName: string
): Promise<Buffer> {
  try {
    const chunks: Buffer[] = [];
    const stream = await minioClient.getObject(bucketName, fileName);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading file ${fileName}:`, error);
    throw error;
  }
}

/**
 * Get a stream for a file
 */
export async function getFileStream(
  bucketName: string,
  fileName: string
): Promise<Readable> {
  try {
    return await minioClient.getObject(bucketName, fileName);
  } catch (error) {
    console.error(`Error getting file stream ${fileName}:`, error);
    throw error;
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(
  bucketName: string,
  fileName: string
): Promise<void> {
  try {
    await minioClient.removeObject(bucketName, fileName);
    console.log(`File deleted: ${bucketName}/${fileName}`);
  } catch (error) {
    console.error(`Error deleting file ${fileName}:`, error);
    throw error;
  }
}

/**
 * List files in a bucket
 */
export async function listFiles(
  bucketName: string,
  prefix?: string
): Promise<BucketItem[]> {
  try {
    const files: BucketItem[] = [];
    const stream = minioClient.listObjects(bucketName, prefix, true);

    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => files.push(obj));
      stream.on('end', () => resolve(files));
      stream.on('error', reject);
    });
  } catch (error) {
    console.error(`Error listing files in ${bucketName}:`, error);
    throw error;
  }
}

/**
 * Generate a presigned URL for file access
 */
export async function getPresignedUrl(
  bucketName: string,
  fileName: string,
  expirySeconds: number = 3600
): Promise<string> {
  try {
    const url = await minioClient.presignedGetObject(
      bucketName,
      fileName,
      expirySeconds
    );
    return url;
  } catch (error) {
    console.error(`Error generating presigned URL for ${fileName}:`, error);
    throw error;
  }
}

/**
 * Get public URL for a file (if bucket is public)
 */
export function getPublicUrl(bucketName: string, fileName: string): string {
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  // Use public endpoint for browser-accessible URLs, fallback to internal endpoint
  const endpoint = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'localhost:9000';
  return `${protocol}://${endpoint}/${bucketName}/${fileName}`;
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  bucketName: string,
  fileName: string
): Promise<any> {
  try {
    const stat = await minioClient.statObject(bucketName, fileName);
    return stat;
  } catch (error) {
    console.error(`Error getting file metadata ${fileName}:`, error);
    throw error;
  }
}

/**
 * Copy a file within or between buckets
 */
export async function copyFile(
  sourceBucket: string,
  sourceFile: string,
  destBucket: string,
  destFile: string
): Promise<void> {
  try {
    const conditions = new (minioClient as any).CopyConditions();
    await minioClient.copyObject(
      destBucket,
      destFile,
      `/${sourceBucket}/${sourceFile}`,
      conditions
    );
    console.log(`File copied: ${sourceBucket}/${sourceFile} -> ${destBucket}/${destFile}`);
  } catch (error) {
    console.error(`Error copying file ${sourceFile}:`, error);
    throw error;
  }
}

// Helper functions for common operations

/**
 * Papers storage
 */
export const papers = {
  async upload(fileName: string, fileBuffer: Buffer): Promise<string> {
    return uploadFile(BUCKETS.PAPERS, fileName, fileBuffer, {
      'Content-Type': 'application/pdf'
    });
  },

  async download(fileName: string): Promise<Buffer> {
    return downloadFile(BUCKETS.PAPERS, fileName);
  },

  getUrl(fileName: string): string {
    return getPublicUrl(BUCKETS.PAPERS, fileName);
  },

  async delete(fileName: string): Promise<void> {
    return deleteFile(BUCKETS.PAPERS, fileName);
  }
};

/**
 * Audio storage
 */
export const audio = {
  async upload(fileName: string, fileBuffer: Buffer): Promise<string> {
    return uploadFile(BUCKETS.AUDIO, fileName, fileBuffer, {
      'Content-Type': 'audio/wav'
    });
  },

  async download(fileName: string): Promise<Buffer> {
    return downloadFile(BUCKETS.AUDIO, fileName);
  },

  getUrl(fileName: string): string {
    return getPublicUrl(BUCKETS.AUDIO, fileName);
  },

  async getStream(fileName: string): Promise<Readable> {
    return getFileStream(BUCKETS.AUDIO, fileName);
  },

  async delete(fileName: string): Promise<void> {
    return deleteFile(BUCKETS.AUDIO, fileName);
  },

  async listForPaper(paperId: string): Promise<BucketItem[]> {
    return listFiles(BUCKETS.AUDIO, `${paperId}/`);
  }
};

/**
 * Voice notes storage
 */
export const voiceNotes = {
  async upload(fileName: string, fileBuffer: Buffer): Promise<string> {
    return uploadFile(BUCKETS.VOICE_NOTES, fileName, fileBuffer, {
      'Content-Type': 'audio/webm'
    });
  },

  async download(fileName: string): Promise<Buffer> {
    return downloadFile(BUCKETS.VOICE_NOTES, fileName);
  },

  async getUrl(fileName: string): Promise<string> {
    return getPresignedUrl(BUCKETS.VOICE_NOTES, fileName);
  },

  async delete(fileName: string): Promise<void> {
    return deleteFile(BUCKETS.VOICE_NOTES, fileName);
  }
};

export default {
  minioClient,
  BUCKETS,
  ensureBucket,
  uploadFile,
  uploadStream,
  downloadFile,
  getFileStream,
  deleteFile,
  listFiles,
  getPresignedUrl,
  getPublicUrl,
  getFileMetadata,
  copyFile,
  papers,
  audio,
  voiceNotes
};
