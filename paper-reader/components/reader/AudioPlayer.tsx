'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic, Square, Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  paperId: string;
  text: string;
  currentPage: number;
  onPositionChange?: (position: number) => void;
}

export default function AudioPlayer({
  paperId,
  text,
  currentPage,
  onPositionChange,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [recordingTime, setRecordingTime] = useState(0);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize speech synthesis
  useEffect(() => {
    if (text) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = playbackRate;
      utterance.volume = volume;

      utterance.onboundary = (event) => {
        setCurrentPosition(event.charIndex);
        if (onPositionChange) {
          onPositionChange(event.charIndex);
        }
      };

      utterance.onend = () => {
        setIsPlaying(false);
      };

      utteranceRef.current = utterance;
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [text, playbackRate, volume, onPositionChange]);

  const togglePlayPause = () => {
    if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    } else {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else if (utteranceRef.current) {
        window.speechSynthesis.speak(utteranceRef.current);
      }
      setIsPlaying(true);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await saveVoiceNote(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Update recording time
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please check microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const saveVoiceNote = async (audioBlob: Blob) => {
    try {
      // Get context text (current position in text)
      const contextText = text.substring(
        Math.max(0, currentPosition - 100),
        Math.min(text.length, currentPosition + 100)
      );

      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('paperId', paperId);
      formData.append('currentPage', currentPage.toString());
      formData.append('characterPosition', currentPosition.toString());
      formData.append('contextText', contextText);
      formData.append('duration', recordingTime.toString());

      const response = await fetch('/api/notes/voice', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to save voice note');
      }

      alert('Voice note saved successfully!');
    } catch (error) {
      console.error('Error saving voice note:', error);
      alert('Failed to save voice note');
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Playback controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={togglePlayPause}
              className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
              disabled={!text}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6" />
              )}
            </button>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Speed:</span>
              <select
                value={playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              >
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1.0">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2.0">2.0x</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-24"
              />
            </div>
          </div>

          {/* Voice note recording */}
          <div className="flex items-center space-x-3">
            {isRecording ? (
              <>
                <span className="text-sm text-red-600 dark:text-red-400 font-mono">
                  {formatTime(recordingTime)}
                </span>
                <button
                  onClick={stopRecording}
                  className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors animate-pulse"
                >
                  <Square className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button
                onClick={startRecording}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                disabled={isPlaying}
              >
                <Mic className="w-5 h-5" />
                <span className="text-sm font-medium">Add Voice Note</span>
              </button>
            )}
          </div>
        </div>

        {/* Info text */}
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
          <p>
            <strong>Tip:</strong> Pause the audio and click "Add Voice Note" to record a note
            at the current position. The note will be linked to the text being read.
          </p>
        </div>

        {/* TTS Configuration Notice */}
        {!text && (
          <div className="text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg">
            Text is being extracted from the PDF. Please wait...
          </div>
        )}
      </div>
    </div>
  );
}
