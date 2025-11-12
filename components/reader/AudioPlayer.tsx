'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Mic, Square, Volume2, SkipBack, SkipForward, Loader2 } from 'lucide-react';

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

interface AudioPlayerProps {
  paperId: string;
  chunks: AudioChunk[];
  currentPage: number;
  onPositionChange?: (chunkId: string, position: number) => void;
}

export default function AudioPlayer({
  paperId,
  chunks,
  currentPage,
  onPositionChange,
}: AudioPlayerProps) {
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentChunk = chunks[currentChunkIndex];
  const completedChunks = chunks.filter(c => c.ttsStatus === 'completed').length;
  const totalChunks = chunks.length;
  const processingComplete = completedChunks === totalChunks;

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.volume = volume;
      audio.playbackRate = playbackRate;

      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
        setIsLoading(false);
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
        if (onPositionChange && currentChunk) {
          onPositionChange(currentChunk.id, audio.currentTime);
        }
      };

      audio.onended = () => {
        // Auto-advance to next chunk
        if (currentChunkIndex < chunks.length - 1) {
          setCurrentChunkIndex(prev => prev + 1);
        } else {
          setIsPlaying(false);
        }
      };

      audio.onerror = () => {
        console.error('Audio playback error');
        setIsPlaying(false);
        setIsLoading(false);
      };

      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Load audio when chunk changes
  useEffect(() => {
    if (audioRef.current && currentChunk?.audioUrl) {
      setIsLoading(true);
      audioRef.current.src = currentChunk.audioUrl;
      audioRef.current.load();

      if (isPlaying) {
        audioRef.current.play().catch(err => {
          console.error('Playback error:', err);
          setIsPlaying(false);
          setIsLoading(false);
        });
      }
    }
  }, [currentChunkIndex, currentChunk?.audioUrl]);

  // Update audio properties
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = playbackRate;
    }
  }, [volume, playbackRate]);

  const togglePlayPause = async () => {
    if (!audioRef.current || !currentChunk) return;

    if (!currentChunk.audioUrl) {
      alert('Audio is still being generated. Please wait.');
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Play error:', error);
        alert('Failed to play audio');
      }
    }
  };

  const goToNextChunk = () => {
    if (currentChunkIndex < chunks.length - 1) {
      setCurrentChunkIndex(prev => prev + 1);
      setCurrentTime(0);
    }
  };

  const goToPreviousChunk = () => {
    if (currentChunkIndex > 0) {
      setCurrentChunkIndex(prev => prev - 1);
      setCurrentTime(0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
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
      if (!currentChunk) return;

      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('paperId', paperId);
      formData.append('chunkId', currentChunk.id);
      formData.append('currentPage', currentPage.toString());
      formData.append('timePosition', currentTime.toString());
      formData.append('contextText', currentChunk.textContent.substring(0, 200));
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
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getChunkLabel = (chunk: AudioChunk): string => {
    if (chunk.sectionTitle) {
      return chunk.sectionTitle;
    }
    if (chunk.chunkType === 'abstract') {
      return 'Abstract';
    }
    return `Section ${chunk.chunkIndex + 1}`;
  };

  if (totalChunks === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="max-w-4xl mx-auto text-center py-8">
          <div className="text-gray-500 dark:text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>Processing paper for audio generation...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Processing status */}
        {!processingComplete && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Generating audio: {completedChunks} / {totalChunks} chunks complete
                </span>
              </div>
              <div className="w-48 bg-blue-200 dark:bg-blue-900 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(completedChunks / totalChunks) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Current chunk info */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {getChunkLabel(currentChunk)}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Chunk {currentChunkIndex + 1} of {totalChunks} • {currentChunk.wordCount} words
            </p>
          </div>
          {currentChunk.ttsStatus === 'processing' && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center">
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              Generating...
            </span>
          )}
          {currentChunk.ttsStatus === 'failed' && (
            <span className="text-xs text-red-600 dark:text-red-400">
              Generation failed
            </span>
          )}
        </div>

        {/* Playback controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={goToPreviousChunk}
            disabled={currentChunkIndex === 0}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={togglePlayPause}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!currentChunk.audioUrl || isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6" />
            )}
          </button>

          <button
            onClick={goToNextChunk}
            disabled={currentChunkIndex === chunks.length - 1}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Time display */}
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
              disabled={!currentChunk.audioUrl}
            />
          </div>

          {/* Speed control */}
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

          {/* Volume control */}
          <div className="flex items-center space-x-2">
            <Volume2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20"
            />
          </div>

          {/* Voice note recording */}
          <div className="flex items-center">
            {isRecording ? (
              <>
                <span className="text-sm text-red-600 dark:text-red-400 font-mono mr-2">
                  {formatTime(recordingTime)}
                </span>
                <button
                  onClick={stopRecording}
                  className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors animate-pulse"
                >
                  <Square className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={startRecording}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                disabled={isPlaying}
                title="Add voice note"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
