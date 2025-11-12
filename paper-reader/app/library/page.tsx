import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LibraryView from '@/components/library/LibraryView';

export default async function LibraryPage() {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  // Fetch papers
  const { data: papers, error } = await supabase
    .from('papers')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return <LibraryView initialPapers={papers || []} />;
}
