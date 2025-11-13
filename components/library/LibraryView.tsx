'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Paper } from '@/lib/types/database';
import { Search, FileText, Calendar, Users, BookOpen, Trash2 } from 'lucide-react';

interface LibraryViewProps {
  initialPapers: Paper[];
}

export default function LibraryView({ initialPapers }: LibraryViewProps) {
  const [papers, setPapers] = useState(initialPapers);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unread' | 'reading' | 'completed'>('all');

  const deletePaper = async (id: string) => {
    if (!confirm('Are you sure you want to delete this paper?')) return;

    try {
      const response = await fetch(`/api/papers/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setPapers(papers.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error('Error deleting paper:', error);
    }
  };

  // Filter papers
  const filteredPapers = papers.filter((paper) => {
    const matchesSearch =
      paper.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.authors?.some((author) =>
        author.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesStatus =
      filterStatus === 'all' || paper.reading_status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'N/A';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'reading':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            My Library
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {papers.length} {papers.length === 1 ? 'paper' : 'papers'} in your collection
          </p>
        </div>

        {/* Search and filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            {(['all', 'unread', 'reading', 'completed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                  filterStatus === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Papers grid */}
        {filteredPapers.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
              {searchQuery || filterStatus !== 'all'
                ? 'No papers found'
                : 'No papers yet'}
            </p>
            <p className="text-gray-500 dark:text-gray-500 text-sm">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Upload your first scientific paper to get started'}
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <Link
                href="/upload"
                className="inline-block mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Upload Paper
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPapers.map((paper) => (
              <div
                key={paper.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        paper.reading_status
                      )}`}
                    >
                      {paper.reading_status}
                    </span>

                    <button
                      onClick={() => deletePaper(paper.id)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      <Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>

                  <Link href={`/papers/${paper.id}`}>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-2">
                      {paper.title}
                    </h3>
                  </Link>

                  {paper.authors && paper.authors.trim().length > 0 && (
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <Users className="w-4 h-4 mr-1" />
                      <span className="truncate">{paper.authors}</span>
                    </div>
                  )}

                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-4">
                    <Calendar className="w-4 h-4 mr-1" />
                    <span>Added {formatDate(paper.created_at)}</span>
                  </div>

                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <span>{paper.total_pages || 0} pages</span>
                  </div>

                  {/* Progress bar */}
                  {paper.reading_progress > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span>Progress</span>
                        <span>{Math.round(paper.reading_progress)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${paper.reading_progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <Link
                    href={`/papers/${paper.id}`}
                    className="mt-4 w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Open</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
