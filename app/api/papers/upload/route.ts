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

    // Extract text and metadata from PDF
    // Use dynamic import for pdf-parse
    const pdfParse: any = await import('pdf-parse');
    let pdfData;
    try {
      // Call the default or module itself based on what's available
      pdfData = await (pdfParse.default || pdfParse)(buffer);
    } catch (error) {
      console.error('PDF parsing error:', error);
      return NextResponse.json(
        { error: 'Failed to parse PDF file' },
        { status: 400 }
      );
    }

    const { text, info, numpages } = pdfData;

    if (!text || text.trim().length < 100) {
      return NextResponse.json(
        { error: 'PDF appears to be empty or unreadable. Please ensure it contains text.' },
        { status: 400 }
      );
    }

    // Extract metadata
    const title = info?.Title || file.name.replace('.pdf', '');
    const authors = info?.Author || '';
    const metadata = {
      creator: info?.Creator,
      producer: info?.Producer,
      creationDate: info?.CreationDate,
      modDate: info?.ModDate,
      subject: info?.Subject,
      keywords: info?.Keywords
    };

    console.log(`Extracted ${numpages} pages, ${text.length} characters`);

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
      extractedText: text,
      metadata
    });

    console.log(`Paper created with ID: ${paper.id}`);

    // Update paper to processing status
    await db.papers.update(paper.id, {
      ttsStatus: 'processing'
    });

    // Chunk the paper text
    console.log('Chunking paper text...');
    const chunks = chunkPaperText(text);
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
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
