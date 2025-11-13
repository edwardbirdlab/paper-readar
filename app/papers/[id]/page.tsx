import { notFound } from 'next/navigation';
import PaperReader from '@/components/reader/PaperReader';
import db from '@/lib/db/client';
import { papers as storage } from '@/lib/storage/client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: PageProps) {
  const { id } = await params;

  // Fetch the paper directly from database (server component)
  try {
    const paper = await db.papers.findById(id);

    if (!paper) {
      notFound();
    }

    // Transform database object to match PaperReader interface
    const pdfUrl = await storage.getUrl(paper.pdf_file_path);

    return <PaperReader paper={{
      id: paper.id,
      title: paper.title,
      authors: paper.authors || '',
      pdfUrl,
      ttsStatus: paper.tts_status || 'pending',
      totalChunks: 0,
      completedChunks: 0
    }} />;
  } catch (error) {
    console.error('Error fetching paper:', error);
    notFound();
  }
}
