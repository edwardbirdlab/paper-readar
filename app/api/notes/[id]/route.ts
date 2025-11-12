import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Delete note
    await db.notes.delete(id);

    return NextResponse.json({ message: 'Note deleted successfully' });
  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete note' },
      { status: 500 }
    );
  }
}
