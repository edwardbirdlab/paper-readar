/**
 * Paper Chunks API Route
 * Returns all chunks for a paper with audio URLs
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import storage from '@/lib/storage/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paperId } = await params;

    // Get paper to verify it exists
    const paper = await db.papers.findById(paperId);
    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    // Get all chunks for this paper
    const chunks = await db.paperChunks.findByPaperId(paperId);

    // Add audio URLs to chunks that have audio files
    const chunksWithUrls = chunks.map((chunk: any) => ({
      id: chunk.id,
      chunkIndex: chunk.chunk_index,
      chunkType: chunk.chunk_type,
      sectionTitle: chunk.section_title,
      textContent: chunk.text_content,
      startPage: chunk.start_page,
      endPage: chunk.end_page,
      wordCount: chunk.word_count,
      charCount: chunk.char_count,
      audioUrl: chunk.audio_file_path
        ? storage.audio.getUrl(chunk.audio_file_path)
        : null,
      audioDuration: chunk.audio_duration || null,
      ttsStatus: chunk.tts_status,
      ttsError: chunk.tts_error,
      createdAt: chunk.created_at,
      updatedAt: chunk.updated_at
    }));

    return NextResponse.json({
      paperId,
      totalChunks: chunksWithUrls.length,
      completedChunks: chunksWithUrls.filter((c: any) => c.ttsStatus === 'completed').length,
      chunks: chunksWithUrls
    });

  } catch (error: any) {
    console.error('Error fetching chunks:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
