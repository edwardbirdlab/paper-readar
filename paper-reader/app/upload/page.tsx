'use client';

import { useRouter } from 'next/navigation';
import PdfUploader from '@/components/upload/PdfUploader';

export default function UploadPage() {
  const router = useRouter();

  const handleUploadComplete = (fileId: string) => {
    // Redirect to the paper viewer after successful upload
    router.push(`/papers/${fileId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Upload Scientific Papers
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload PDF files of scientific papers to read, annotate, and listen to them.
          </p>
        </div>

        <PdfUploader onUploadComplete={handleUploadComplete} />

        <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            What happens after upload?
          </h2>
          <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200 text-sm">
            <li>Text will be extracted from the PDF</li>
            <li>Citations and references will be filtered out for cleaner reading</li>
            <li>You can organize papers with tags and categories</li>
            <li>Add highlights and notes as you read</li>
            <li>Listen to papers with text-to-speech</li>
            <li>Record voice notes synced to specific parts of the text</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
