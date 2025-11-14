/**
 * Paper API Route
 * Handles getting paper details and deleting papers
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import storage from '@/lib/storage/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get paper with tags
    const paper = await db.papers.findById(id);

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    // Get chunk statistics
    const chunks = await db.paperChunks.findByPaperId(id);
    const completedChunks = chunks.filter((c: any) => c.tts_status === 'completed').length;

    // Get PDF URL
    const pdfUrl = storage.papers.getUrl(paper.pdf_file_path);

    return NextResponse.json({
      id: paper.id,
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      publicationDate: paper.publication_date,
      doi: paper.doi,
      pdfUrl,
      totalPages: paper.total_pages,
      metadata: paper.metadata,
      uploadDate: paper.upload_date,
      lastAccessed: paper.last_accessed,
      readingProgress: paper.reading_progress,
      ttsStatus: paper.tts_status,
      ttsStartedAt: paper.tts_started_at,
      ttsCompletedAt: paper.tts_completed_at,
      ttsError: paper.tts_error,
      tags: paper.tag_names || [],
      tagColors: paper.tag_colors || [],
      totalChunks: chunks.length,
      completedChunks,
      createdAt: paper.created_at,
      updatedAt: paper.updated_at
    });

  } catch (error: any) {
    console.error('Error fetching paper:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get the paper first to get file paths
    const paper = await db.papers.findById(id);

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    // Get all chunks to delete audio files
    const chunks = await db.paperChunks.findByPaperId(id);

    // Delete all audio files from MinIO
    for (const chunk of chunks) {
      if (chunk.audio_file_path) {
        try {
          await storage.audio.delete(chunk.audio_file_path);
        } catch (error) {
          console.warn(`Failed to delete audio file: ${chunk.audio_file_path}`, error);
        }
      }
    }

    // Delete the PDF file from storage
    if (paper.pdf_file_path) {
      try {
        await storage.papers.delete(paper.pdf_file_path);
      } catch (error) {
        console.warn(`Failed to delete PDF: ${paper.pdf_file_path}`, error);
      }
    }

    // Delete the paper from database (cascades to chunks, notes, highlights)
    await db.papers.delete(id);

    return NextResponse.json({ message: 'Paper deleted successfully' });

  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete paper' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Update paper
    const paper = await db.papers.update(id, {
      readingProgress: body.readingProgress,
      title: body.title
    });

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    // Update last accessed
    await db.query(
      `UPDATE papers SET last_accessed = NOW() WHERE id = $1`,
      [id]
    );

    return NextResponse.json({ message: 'Paper updated successfully', paper });

  } catch (error: any) {
    console.error('Update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update paper' },
      { status: 500 }
    );
  }
}
