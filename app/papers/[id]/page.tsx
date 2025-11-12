import { notFound } from 'next/navigation';
import PaperReader from '@/components/reader/PaperReader';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: PageProps) {
  const { id } = await params;

  // Fetch the paper from API
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/papers/${id}`, {
      cache: 'no-store' // Always fetch fresh data
    });

    if (!response.ok) {
      notFound();
    }

    const paper = await response.json();

    return <PaperReader paper={paper} />;
  } catch (error) {
    console.error('Error fetching paper:', error);
    notFound();
  }
}
