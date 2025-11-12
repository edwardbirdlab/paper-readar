import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const paperId = formData.get('paperId') as string;
    const currentPage = parseInt(formData.get('currentPage') as string);
    const characterPosition = parseInt(formData.get('characterPosition') as string);
    const contextText = formData.get('contextText') as string;
    const duration = parseInt(formData.get('duration') as string);

    if (!audioFile || !paperId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate unique file path
    const fileExt = 'webm';
    const fileName = `${user.id}/${paperId}/${Date.now()}.${fileExt}`;

    // Upload audio to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voice-notes')
      .upload(fileName, audioFile, {
        contentType: audioFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload audio' },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('voice-notes').getPublicUrl(fileName);

    // Create note record
    const { data: note, error: dbError } = await supabase
      .from('notes')
      .insert({
        paper_id: paperId,
        user_id: user.id,
        note_type: 'voice',
        audio_url: publicUrl,
        audio_storage_path: fileName,
        position_data: {
          page_number: currentPage,
          character_position: characterPosition,
        },
        context_text: contextText,
        duration: duration,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Clean up uploaded file
      await supabase.storage.from('voice-notes').remove([fileName]);
      return NextResponse.json(
        { error: 'Failed to create note record' },
        { status: 500 }
      );
    }

    return NextResponse.json({ note });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
