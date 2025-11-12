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

    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    // Generate a unique file path
    const fileExt = 'pdf';
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    const filePath = `${fileName}`;

    // Basic metadata from filename
    // Note: PDF metadata extraction happens on client-side in PdfViewer component
    let metadata = {
      title: file.name.replace('.pdf', ''),
      authors: [] as string[],
      pageCount: null, // Will be updated by client after loading
    };

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('papers')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('papers').getPublicUrl(filePath);

    // Create paper record in database
    const { data: paper, error: dbError } = await supabase
      .from('papers')
      .insert({
        user_id: user.id,
        title: metadata.title,
        authors: metadata.authors,
        pdf_url: publicUrl,
        pdf_storage_path: filePath,
        page_count: metadata.pageCount,
        file_size: file.size,
        reading_status: 'unread',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Clean up uploaded file
      await supabase.storage.from('papers').remove([filePath]);
      return NextResponse.json(
        { error: 'Failed to create paper record' },
        { status: 500 }
      );
    }

    // Queue text extraction (this would be done in a background job in production)
    // For now, we'll return the paper and handle extraction separately
    return NextResponse.json({
      id: paper.id,
      message: 'Paper uploaded successfully',
      paper,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
