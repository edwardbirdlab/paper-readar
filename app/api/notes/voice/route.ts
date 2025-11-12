import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';
import storage from '@/lib/storage/client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const paperId = formData.get('paperId') as string;
    const chunkId = formData.get('chunkId') as string;
    const currentPage = parseInt(formData.get('currentPage') as string);
    const timePosition = parseFloat(formData.get('timePosition') as string);
    const contextText = formData.get('contextText') as string;
    const duration = parseInt(formData.get('duration') as string);

    if (!audioFile || !paperId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Convert audio file to buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique file path
    const fileName = `${paperId}/${Date.now()}.webm`;

    // Upload audio to MinIO
    await storage.voiceNotes.upload(fileName, buffer);

    // Create note record
    const note = await db.notes.create({
      paperId,
      chunkId,
      noteType: 'voice',
      voiceFilePath: fileName,
      voiceDuration: duration,
      positionData: {
        page_number: currentPage,
        time_position: timePosition,
      },
      contextText,
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
