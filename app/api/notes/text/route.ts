import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    const { paperId, chunkId, content, currentPage } = await request.json();

    if (!paperId || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create note record
    const note = await db.notes.create({
      paperId,
      chunkId,
      noteType: 'text',
      content,
      positionData: {
        page_number: currentPage,
      },
    });

    return NextResponse.json({ note });
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
