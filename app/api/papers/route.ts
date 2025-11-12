/**
 * Papers List API Route
 * Returns all papers with their status
 */

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');

    let papers;

    if (search) {
      // Full-text search
      papers = await db.papers.search(search);
    } else {
      // Get all papers with tags
      papers = await db.papers.findAll();
    }

    // Filter by tag if specified
    if (tag && papers) {
      papers = papers.filter((p: any) =>
        p.tag_names && p.tag_names.includes(tag)
      );
    }

    // Get chunk statistics for each paper
    const papersWithStats = await Promise.all(
      papers.map(async (paper: any) => {
        const chunks = await db.paperChunks.findByPaperId(paper.id);
        const completedChunks = chunks.filter((c: any) => c.tts_status === 'completed').length;
        const totalDuration = chunks.reduce((sum: number, c: any) =>
          sum + (parseFloat(c.audio_duration) || 0), 0
        );

        return {
          id: paper.id,
          title: paper.title,
          authors: paper.authors,
          abstract: paper.abstract,
          publicationDate: paper.publication_date,
          doi: paper.doi,
          totalPages: paper.total_pages,
          uploadDate: paper.upload_date,
          lastAccessed: paper.last_accessed,
          readingProgress: paper.reading_progress,
          ttsStatus: paper.tts_status,
          ttsStartedAt: paper.tts_started_at,
          ttsCompletedAt: paper.tts_completed_at,
          tags: paper.tag_names || [],
          tagColors: paper.tag_colors || [],
          totalChunks: chunks.length,
          completedChunks,
          totalAudioDuration: Math.round(totalDuration),
          createdAt: paper.created_at
        };
      })
    );

    return NextResponse.json({
      papers: papersWithStats,
      total: papersWithStats.length
    });

  } catch (error: any) {
    console.error('Error fetching papers:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
