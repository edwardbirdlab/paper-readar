import LibraryView from '@/components/library/LibraryView';

export default async function LibraryPage() {
  // Fetch papers from API
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/papers`, {
      cache: 'no-store' // Always fetch fresh data
    });

    if (!response.ok) {
      throw new Error('Failed to fetch papers');
    }

    const data = await response.json();

    return <LibraryView initialPapers={data.papers || []} />;
  } catch (error) {
    console.error('Error fetching papers:', error);
    return <LibraryView initialPapers={[]} />;
  }
}
