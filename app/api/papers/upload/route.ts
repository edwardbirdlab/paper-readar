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

    // Generate unique file path
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${timestamp}-${safeName}`;

    // Upload PDF to MinIO
    console.log('Uploading PDF to storage...');
    await storage.papers.upload(filePath, buffer);

    // Create paper record in database with text_processing status
    console.log('Creating paper record...');
    const paper = await db.papers.create({
      title,
      authors,
      pdfFilePath: filePath,
      totalPages: numpages,
      extractedText: text,  // Store raw extracted text
      metadata
    });

    console.log(`Paper created with ID: ${paper.id}`);

    // Update paper to text_processing status
    await db.query(
      `UPDATE papers
       SET processing_stage = 'text_processing',
           text_processing_started_at = NOW()
       WHERE id = $1`,
      [paper.id]
    );

    // Queue text processing job (two-stage LLM pipeline)
    console.log('Queueing text processing job...');
    await queue.addTextProcessingJob({
      paperId: paper.id,
      rawText: text,
      metadata: {
        title,
        authors,
        pages: numpages
      }
    });

    console.log(`Upload complete for paper ${paper.id} - text processing queued`);

    return NextResponse.json({
      id: paper.id,
      message: 'Paper uploaded successfully - AI processing will take 2-3 hours',
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        totalPages: paper.total_pages,
        processingStage: 'text_processing',
        estimatedTime: '2-3 hours'
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
