import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import PaperReader from '@/components/reader/PaperReader';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch the paper
  const { data: paper, error } = await supabase
    .from('papers')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !paper) {
    notFound();
  }

  return <PaperReader paper={paper} />;
}
