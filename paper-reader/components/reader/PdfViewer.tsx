'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface PdfViewerProps {
  pdfUrl: string;
  onPageChange?: (page: number) => void;
  onTextExtracted?: (text: string) => void;
  initialPage?: number;
}

export default function PdfViewer({
  pdfUrl,
  onPageChange,
  onTextExtracted,
  initialPage = 1,
}: PdfViewerProps) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF document
  useEffect(() => {
    let isMounted = true;

    const loadPdf = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdfDoc = await loadingTask.promise;

        if (isMounted) {
          setPdf(pdfDoc);
          setNumPages(pdfDoc.numPages);
          setIsLoading(false);

          // Extract all text for search/TTS
          extractAllText(pdfDoc);
        }
      } catch (err) {
        console.error('Error loading PDF:', err);
        if (isMounted) {
          setError('Failed to load PDF');
          setIsLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [pdfUrl]);

  // Extract text from all pages
  const extractAllText = async (pdfDoc: pdfjsLib.PDFDocumentProxy) => {
    try {
      const textPromises = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        textPromises.push(extractPageText(pdfDoc, i));
      }

      const pageTexts = await Promise.all(textPromises);
      const fullText = pageTexts.join('\n\n');

      if (onTextExtracted) {
        onTextExtracted(fullText);
      }
    } catch (err) {
      console.error('Error extracting text:', err);
    }
  };

  // Extract text from a single page
  const extractPageText = async (
    pdfDoc: pdfjsLib.PDFDocumentProxy,
    pageNum: number
  ): Promise<string> => {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    return textContent.items.map((item: any) => item.str).join(' ');
  };

  // Render current page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let isMounted = true;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(currentPage);

        if (!isMounted) return;

        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');

        if (!canvas || !context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext: any = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        if (onPageChange) {
          onPageChange(currentPage);
        }
      } catch (err) {
        console.error('Error rendering page:', err);
      }
    };

    renderPage();

    return () => {
      isMounted = false;
    };
  }, [pdf, currentPage, zoom, onPageChange]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
    }
  };

  const nextPage = () => goToPage(currentPage + 1);
  const previousPage = () => goToPage(currentPage - 1);
  const zoomIn = () => setZoom((prev) => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 0.2, 0.5));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center text-red-600">
          <p className="text-xl font-semibold">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Page navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={previousPage}
              disabled={currentPage === 1}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 text-sm">
              <input
                type="number"
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                min={1}
                max={numPages}
              />
              <span className="text-gray-600 dark:text-gray-400">/ {numPages}</span>
            </div>

            <button
              onClick={nextPage}
              disabled={currentPage === numPages}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={zoomOut}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ZoomOut className="w-5 h-5" />
            </button>

            <span className="text-sm text-gray-600 dark:text-gray-400 w-16 text-center">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={zoomIn}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8"
      >
        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-lg">
          <canvas ref={canvasRef} className="w-full" />
        </div>
      </div>
    </div>
  );
}
