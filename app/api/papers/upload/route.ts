/**
 * Paper Upload API Route
 * Handles PDF upload, text extraction, chunking, and TTS job queueing
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import storage from '@/lib/storage/client';
import queue from '@/lib/queue/client';
import { chunkPaperText, cleanTextForTTS } from '@/lib/utils/chunking';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`Processing PDF upload: ${file.name} (${file.size} bytes)`);

    // Extract text and metadata from PDF using extraction service
    const pdfExtractionUrl = process.env.PDF_EXTRACTION_URL || 'http://localhost:3007';
    let text: string;
    let numpages: number;
    let metadata: any = {};

    try {
      console.log(`Sending PDF to extraction service at ${pdfExtractionUrl}`);

      // Create form data for extraction service
      const extractFormData = new FormData();
      extractFormData.append('file', file);

      // Call extraction service
      const extractResponse = await fetch(`${pdfExtractionUrl}/extract`, {
        method: 'POST',
        body: extractFormData,
      });

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();
        throw new Error(errorData.message || 'Extraction service failed');
      }

      const extractionResult = await extractResponse.json();

      text = extractionResult.text;
      numpages = extractionResult.pages;

      // Map metadata from extraction service
      if (extractionResult.metadata) {
        metadata = {
          creator: extractionResult.metadata.creator || '',
          producer: extractionResult.metadata.producer || '',
          creationDate: extractionResult.metadata.creation_date || '',
          modDate: extractionResult.metadata.mod_date || '',
          subject: extractionResult.metadata.subject || '',
          keywords: extractionResult.metadata.keywords || ''
        };
      }

      console.log(`Extraction complete: ${numpages} pages, ${text.length} characters`);

    } catch (error: any) {
      console.error('PDF extraction error:', error);
      console.error('PDF extraction error stack:', error.stack);
      const isDev = process.env.NODE_ENV === 'development';
      return NextResponse.json(
        {
          error: 'Failed to extract text from PDF',
          ...(isDev && { details: error.message, stack: error.stack })
        },
        { status: 400 }
      );
    }

    if (!text || text.trim().length < 100) {
      return NextResponse.json(
        { error: 'PDF appears to be empty or unreadable. Please ensure it contains text.' },
        { status: 400 }
      );
    }

    // Extract title and authors from metadata
    const title = metadata.title || file.name.replace('.pdf', '');
    const authors = metadata.author || '';

    console.log(`Extracted ${numpages} pages, ${text.length} characters`);

    // Phase 2: Clean up text using Phi-3 LLM
    const textCleanupUrl = process.env.TEXT_CLEANUP_URL;
    let cleanedText = text;

    if (textCleanupUrl) {
      try {
        console.log(`Sending text to cleanup service at ${textCleanupUrl}`);

        const cleanupResponse = await fetch(`${textCleanupUrl}/cleanup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text,
            temperature: 0.3,
            max_tokens: 4000
          }),
        });

        if (cleanupResponse.ok) {
          const cleanupResult = await cleanupResponse.json();
          cleanedText = cleanupResult.cleaned_text;
          console.log(
            `Text cleanup complete: ${text.length} → ${cleanedText.length} chars ` +
            `(${cleanupResult.reduction_percent}% reduction)`
          );
        } else {
          console.warn('Text cleanup failed, using raw extraction:', await cleanupResponse.text());
          // Continue with raw text if cleanup fails
        }
      } catch (error: any) {
        console.warn('Text cleanup service unavailable, using raw extraction:', error.message);
        // Continue with raw text if cleanup service is unavailable
      }
    } else {
      console.log('Text cleanup service not configured, skipping cleanup phase');
    }

    // Generate unique file path
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${timestamp}-${safeName}`;

    // Upload PDF to MinIO
    console.log('Uploading PDF to storage...');
    await storage.papers.upload(filePath, buffer);

    // Create paper record in database
    console.log('Creating paper record...');
    const paper = await db.papers.create({
      title,
      authors,
      pdfFilePath: filePath,
      totalPages: numpages,
      extractedText: cleanedText,  // Use cleaned text instead of raw
      metadata
    });

    console.log(`Paper created with ID: ${paper.id}`);

    // Update paper to processing status
    await db.papers.update(paper.id, {
      ttsStatus: 'processing'
    });

    // Chunk the paper text (using cleaned text)
    console.log('Chunking paper text...');
    const chunks = chunkPaperText(cleanedText);
    console.log(`Created ${chunks.length} chunks`);

    // Create chunk records and queue TTS jobs
    const ttsJobs = [];

    for (const chunk of chunks) {
      // Clean text for TTS
      const cleanedText = cleanTextForTTS(chunk.text);

      // Create chunk record
      const chunkRecord = await db.paperChunks.create({
        paperId: paper.id,
        chunkIndex: chunk.index,
        chunkType: chunk.type,
        sectionTitle: chunk.sectionTitle,
        textContent: cleanedText,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        wordCount: chunk.wordCount,
        charCount: chunk.charCount
      });

      // Prepare TTS job
      ttsJobs.push({
        paperId: paper.id,
        chunkId: chunkRecord.id,
        text: cleanedText,
        chunkIndex: chunk.index,
        voice: 'af_sarah' // Default voice
      });
    }

    // Queue all TTS jobs in bulk
    console.log(`Queueing ${ttsJobs.length} TTS jobs...`);
    await queue.addBulkTTSJobs(ttsJobs);

    // Update paper with TTS started timestamp
    await db.query(
      `UPDATE papers SET tts_started_at = NOW() WHERE id = $1`,
      [paper.id]
    );

    console.log(`Upload complete for paper ${paper.id}`);

    return NextResponse.json({
      id: paper.id,
      message: 'Paper uploaded successfully and TTS processing started',
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        totalPages: paper.total_pages,
        totalChunks: chunks.length,
        ttsStatus: 'processing'
      }
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    console.error('Error stack:', error.stack);

    // In development, return detailed error info
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
        ...(isDev && { stack: error.stack, details: error })
      },
      { status: 500 }
    );
  }
}
