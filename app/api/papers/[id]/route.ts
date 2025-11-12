import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the paper first to check ownership and get file path
    const { data: paper, error: fetchError } = await supabase
      .from('papers')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    // Delete the PDF file from storage
    if (paper.pdf_storage_path) {
      await supabase.storage.from('papers').remove([paper.pdf_storage_path]);
    }

    // Delete the paper (cascades to notes, highlights, etc.)
    const { error: deleteError } = await supabase
      .from('papers')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete paper' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Paper deleted successfully' });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
