import { notFound } from 'next/navigation';
import PaperReader from '@/components/reader/PaperReader';
import db from '@/lib/db/client';

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

    return <PaperReader paper={paper} />;
  } catch (error) {
    console.error('Error fetching paper:', error);
    notFound();
  }
}
