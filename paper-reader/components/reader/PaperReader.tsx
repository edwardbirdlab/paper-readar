'use client';

import { useState } from 'react';
import { Paper } from '@/lib/types/database';
import PdfViewer from './PdfViewer';
import AudioPlayer from './AudioPlayer';
import NotesPanel from './NotesPanel';
import { BookOpen, Headphones, StickyNote } from 'lucide-react';

interface PaperReaderProps {
  paper: Paper;
}

type ViewMode = 'read' | 'listen' | 'notes';

export default function PaperReader({ paper }: PaperReaderProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const [extractedText, setExtractedText] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [readingPosition, setReadingPosition] = useState(0);

  const handleTextExtracted = (text: string) => {
    setExtractedText(text);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePositionChange = (position: number) => {
    setReadingPosition(position);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {paper.title}
        </h1>
        {paper.authors && paper.authors.length > 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {paper.authors.join(', ')}
          </p>
        )}

        {/* View mode tabs */}
        <div className="flex space-x-1 mt-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setViewMode('read')}
            className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors ${
              viewMode === 'read'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Read</span>
          </button>

          <button
            onClick={() => setViewMode('listen')}
            className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors ${
              viewMode === 'listen'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <Headphones className="w-4 h-4" />
            <span>Listen</span>
          </button>

          <button
            onClick={() => setViewMode('notes')}
            className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors ${
              viewMode === 'notes'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <StickyNote className="w-4 h-4" />
            <span>Notes</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'read' && (
          <PdfViewer
            pdfUrl={paper.pdf_url}
            onPageChange={handlePageChange}
            onTextExtracted={handleTextExtracted}
          />
        )}

        {viewMode === 'listen' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto">
              <PdfViewer
                pdfUrl={paper.pdf_url}
                onPageChange={handlePageChange}
                onTextExtracted={handleTextExtracted}
              />
            </div>
            <AudioPlayer
              paperId={paper.id}
              text={extractedText || paper.reading_text || ''}
              currentPage={currentPage}
              onPositionChange={handlePositionChange}
            />
          </div>
        )}

        {viewMode === 'notes' && (
          <NotesPanel
            paperId={paper.id}
            currentPage={currentPage}
          />
        )}
      </div>
    </div>
  );
}
