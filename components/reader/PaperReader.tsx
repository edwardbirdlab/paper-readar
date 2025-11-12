'use client';

import { useState, useEffect } from 'react';
import PdfViewer from './PdfViewer';
import AudioPlayer from './AudioPlayer';
import NotesPanel from './NotesPanel';
import { BookOpen, Headphones, StickyNote, Loader2 } from 'lucide-react';

interface Paper {
  id: string;
  title: string;
  authors: string;
  pdfUrl: string;
  ttsStatus: string;
  totalChunks?: number;
  completedChunks?: number;
}

interface AudioChunk {
  id: string;
  chunkIndex: number;
  chunkType: string;
  sectionTitle?: string;
  textContent: string;
  audioUrl: string | null;
  audioDuration: number | null;
  ttsStatus: string;
  wordCount: number;
}

interface PaperReaderProps {
  paper: Paper;
}

type ViewMode = 'read' | 'listen' | 'notes';

export default function PaperReader({ paper }: PaperReaderProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const [currentPage, setCurrentPage] = useState(1);
  const [readingPosition, setReadingPosition] = useState({ chunkId: '', position: 0 });
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [ttsStatus, setTtsStatus] = useState(paper.ttsStatus);

  // Fetch chunks when entering listen mode
  useEffect(() => {
    if (viewMode === 'listen') {
      fetchChunks();
    }
  }, [viewMode, paper.id]);

  // Poll for updates while TTS is processing
  useEffect(() => {
    if (ttsStatus === 'processing' && viewMode === 'listen') {
      const interval = setInterval(() => {
        fetchChunks();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [ttsStatus, viewMode, paper.id]);

  const fetchChunks = async () => {
    try {
      setIsLoadingChunks(true);
      const response = await fetch(`/api/papers/${paper.id}/chunks`);

      if (!response.ok) {
        throw new Error('Failed to fetch chunks');
      }

      const data = await response.json();
      setChunks(data.chunks || []);

      // Update TTS status based on chunks
      if (data.completedChunks === data.totalChunks && data.totalChunks > 0) {
        setTtsStatus('completed');
      } else if (data.totalChunks > 0) {
        setTtsStatus('processing');
      }
    } catch (error) {
      console.error('Error fetching chunks:', error);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePositionChange = (chunkId: string, position: number) => {
    setReadingPosition({ chunkId, position });
  };

  const completedChunks = chunks.filter(c => c.ttsStatus === 'completed').length;
  const totalChunks = chunks.length;
  const processingProgress = totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0;

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {paper.title}
            </h1>
            {paper.authors && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {paper.authors}
              </p>
            )}
          </div>

          {/* TTS Status Badge */}
          {viewMode === 'listen' && (
            <div className="ml-4">
              {ttsStatus === 'pending' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Queued
                </span>
              )}
              {ttsStatus === 'processing' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Processing {processingProgress}%
                </span>
              )}
              {ttsStatus === 'completed' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                  ✓ Ready
                </span>
              )}
              {ttsStatus === 'failed' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
                  ✗ Failed
                </span>
              )}
            </div>
          )}
        </div>

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
            {ttsStatus === 'processing' && (
              <span className="ml-1 px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded">
                {processingProgress}%
              </span>
            )}
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
            pdfUrl={paper.pdfUrl}
            onPageChange={handlePageChange}
            onTextExtracted={() => {}}
          />
        )}

        {viewMode === 'listen' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto">
              {isLoadingChunks && chunks.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
                    <p className="text-gray-600 dark:text-gray-400">Loading audio chunks...</p>
                  </div>
                </div>
              ) : (
                <PdfViewer
                  pdfUrl={paper.pdfUrl}
                  onPageChange={handlePageChange}
                  onTextExtracted={() => {}}
                />
              )}
            </div>
            <AudioPlayer
              paperId={paper.id}
              chunks={chunks}
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
