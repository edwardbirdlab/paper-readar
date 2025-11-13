import LibraryView from '@/components/library/LibraryView';
import db from '@/lib/db/client';

export default async function LibraryPage() {
  // Fetch papers directly from database (server component)
  try {
    const papers = await db.papers.findAll();
    return <LibraryView initialPapers={papers} />;
  } catch (error) {
    console.error('Error fetching papers:', error);
    return <LibraryView initialPapers={[]} />;
  }
}
