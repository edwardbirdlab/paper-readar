'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Mic2, Play, Trash2 } from 'lucide-react';
import { Note } from '@/lib/types/database';

interface NotesPanelProps {
  paperId: string;
  currentPage: number;
}

export default function NotesPanel({ paperId, currentPage }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newNoteText, setNewNoteText] = useState('');
  const [showAllPages, setShowAllPages] = useState(false);

  // Fetch notes
  useEffect(() => {
    fetchNotes();
  }, [paperId]);

  const fetchNotes = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/papers/${paperId}/notes`);
      if (response.ok) {
        const data = await response.json();
        setNotes(data.notes);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addTextNote = async () => {
    if (!newNoteText.trim()) return;

    try {
      const response = await fetch('/api/notes/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperId,
          content: newNoteText,
          currentPage,
        }),
      });

      if (response.ok) {
        setNewNoteText('');
        fetchNotes();
      }
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchNotes();
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const playVoiceNote = (audioUrl: string) => {
    const audio = new Audio(audioUrl);
    audio.play();
  };

  const filteredNotes = showAllPages
    ? notes
    : notes.filter(
        (note) => note.position_data?.page_number === currentPage
      );

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Notes & Annotations
            </h2>

            <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showAllPages}
                onChange={(e) => setShowAllPages(e.target.checked)}
                className="rounded"
              />
              <span>Show all pages</span>
            </label>
          </div>

          {/* Add new text note */}
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Add Text Note
            </h3>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Write a note for this page..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={addTextNote}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Add Note
              </button>
            </div>
          </div>

          {/* Notes list */}
          <div className="space-y-4">
            {filteredNotes.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No notes yet</p>
                <p className="text-sm">
                  {showAllPages
                    ? 'Add notes to start organizing your thoughts'
                    : 'No notes on this page'}
                </p>
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {note.note_type === 'voice' ? (
                        <Mic2 className="w-5 h-5 text-purple-600" />
                      ) : (
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                      )}
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Page {note.position_data?.page_number || 'N/A'}
                      </span>
                    </div>

                    <button
                      onClick={() => deleteNote(note.id)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                      <Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                  </div>

                  {note.note_type === 'text' ? (
                    <p className="text-gray-900 dark:text-gray-100 mb-2">
                      {note.content}
                    </p>
                  ) : (
                    <div>
                      <button
                        onClick={() => note.voice_file_path && playVoiceNote(note.voice_file_path)}
                        className="flex items-center space-x-2 px-3 py-2 bg-purple-100 dark:bg-purple-900 hover:bg-purple-200 dark:hover:bg-purple-800 rounded-lg transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        <span className="text-sm">Play voice note</span>
                        {note.voice_duration && (
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            ({note.voice_duration}s)
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  {note.context_text && (
                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-sm text-gray-600 dark:text-gray-400 italic">
                      "{note.context_text.substring(0, 150)}..."
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(note.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
