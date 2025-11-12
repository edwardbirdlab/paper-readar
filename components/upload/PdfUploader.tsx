'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, X, CheckCircle } from 'lucide-react';

interface UploadFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;
  error?: string;
}

interface PdfUploaderProps {
  onUploadComplete?: (fileId: string) => void;
}

export default function PdfUploader({ onUploadComplete }: PdfUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf'
    );

    addFiles(droppedFiles);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map((file) => ({
      file,
      id: Math.random().toString(36).substring(7),
      status: 'pending',
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...uploadFiles]);

    // Auto-start upload
    uploadFiles.forEach((uploadFile) => {
      uploadPdf(uploadFile);
    });
  };

  const uploadPdf = async (uploadFile: UploadFile) => {
    try {
      // Update status to uploading
      updateFileStatus(uploadFile.id, 'uploading', 0);

      const formData = new FormData();
      formData.append('file', uploadFile.file);

      // Upload to server
      const response = await fetch('/api/papers/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Update to processing
      updateFileStatus(uploadFile.id, 'processing', 100);

      const data = await response.json();

      // Complete
      updateFileStatus(uploadFile.id, 'complete', 100);

      if (onUploadComplete) {
        onUploadComplete(data.id);
      }
    } catch (error) {
      updateFileStatus(
        uploadFile.id,
        'error',
        0,
        error instanceof Error ? error.message : 'Upload failed'
      );
    }
  };

  const updateFileStatus = (
    id: string,
    status: UploadFile['status'],
    progress: number,
    error?: string
  ) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status, progress, error } : f
      )
    );
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Drag and drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-12 text-center transition-colors
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
          }
        `}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileInput}
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-full">
            <Upload className="w-12 h-12 text-blue-600 dark:text-blue-400" />
          </div>

          <div>
            <label
              htmlFor="file-upload"
              className="cursor-pointer text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Choose files
            </label>
            <span className="text-gray-600 dark:text-gray-400"> or drag and drop</span>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            PDF files up to 50MB
          </p>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Uploaded Files ({files.length})
          </h3>

          {files.map((uploadFile) => (
            <div
              key={uploadFile.id}
              className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  {uploadFile.status === 'complete' ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : uploadFile.status === 'error' ? (
                    <X className="w-6 h-6 text-red-500" />
                  ) : (
                    <FileText className="w-6 h-6 text-blue-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {uploadFile.file.name}
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatFileSize(uploadFile.file.size)}</span>
                    <span>•</span>
                    <span className="capitalize">{uploadFile.status}</span>
                  </div>
                  {uploadFile.error && (
                    <p className="text-xs text-red-500 mt-1">{uploadFile.error}</p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {uploadFile.status === 'uploading' && (
                <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2 ml-4">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadFile.progress}%` }}
                  />
                </div>
              )}

              {/* Remove button */}
              {(uploadFile.status === 'complete' || uploadFile.status === 'error') && (
                <button
                  onClick={() => removeFile(uploadFile.id)}
                  className="ml-4 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
