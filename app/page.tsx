import Link from 'next/link';
import { FileText, Upload, BookOpen, Headphones, Mic, Search, Tags } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-gray-100 mb-6">
            Scientific Paper Reader
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-8 max-w-3xl mx-auto">
            Read, annotate, and listen to scientific papers with AI-powered text-to-speech.
            Organize your research library and take notes with ease.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/upload"
              className="inline-flex items-center justify-center px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg transition-colors shadow-lg"
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload Paper
            </Link>

            <Link
              href="/library"
              className="inline-flex items-center justify-center px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 text-lg font-semibold rounded-lg transition-colors shadow-lg border border-gray-200 dark:border-gray-700"
            >
              <FileText className="w-5 h-5 mr-2" />
              View Library
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-20">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              PDF Viewer
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Read scientific papers with a clean, distraction-free PDF viewer optimized for research.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
              <Headphones className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Text-to-Speech
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Listen to papers while commuting or exercising. Smart parsing filters out citations for smooth listening.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
              <Mic className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Voice Notes
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Record voice notes synced to specific parts of the text. Capture insights as you read or listen.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center mb-4">
              <FileText className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Annotations
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Highlight important passages and add notes. All your annotations are searchable and organized.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mb-4">
              <Tags className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Organization
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Tag and categorize papers. Create custom collections to organize your research library.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Full-Text Search
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Search across all your papers, notes, and highlights. Find exactly what you're looking for.
            </p>
          </div>
        </div>

        {/* PWA Notice */}
        <div className="mt-16 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-8 text-center">
          <h3 className="text-2xl font-bold text-blue-900 dark:text-blue-100 mb-4">
            Install as Progressive Web App
          </h3>
          <p className="text-blue-800 dark:text-blue-200 mb-6 max-w-2xl mx-auto">
            This app can be installed on your phone or desktop for offline access.
            Look for the "Add to Home Screen" or "Install" option in your browser menu.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-blue-700 dark:text-blue-300">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Works offline
            </div>
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Sync across devices
            </div>
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Fast and responsive
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
