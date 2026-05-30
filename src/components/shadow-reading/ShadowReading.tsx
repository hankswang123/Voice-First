import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styles from './ShadowReading.module.css';
import { WavRecorder } from '../../lib/wavetools/index.js';

type Difficulty = 'easy' | 'medium' | 'hard';

function selectWordsToBlank(sentence: string, difficulty: Difficulty = 'easy'): {
  blankedIndices: Set<number>;
  words: string[];
} {
  const words = sentence.split(/\s+/);

  // Filter eligible words based on difficulty
  const minLen = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 6 : 11;
  const maxLen = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 10 : Infinity;

  const eligible = words
    .map((w, i) => ({ word: w, index: i }))
    .filter(({ word }) => {
      const cleanLen = word.replace(/[^a-zA-Z'-]/g, '').length;
      return cleanLen >= minLen && cleanLen <= maxLen;
    });

  // No fallback - if no words match the difficulty, return empty set
  if (eligible.length === 0) {
    return { blankedIndices: new Set(), words };
  }

  const blankCount = Math.min(
    eligible.length,
    Math.max(1, Math.floor(eligible.length * 0.4))
  );

  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const blankedIndices = new Set(shuffled.slice(0, blankCount).map(e => e.index));

  return { blankedIndices, words };
}

interface WordDefinition {
  word: string;
  phonetic: string;
  meanings: Array<{
    partOfSpeech: string;
    definitions: Array<{ definition: string; example: string | null }>;
  }>;
}

interface ShadowReadingProps {
  audioCaptions: Array<{ time: number; text: string }>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playbackRate: number;
  isActive: boolean;
  onExit: () => void;
  advanceRef: React.MutableRefObject<(() => void) | null>;
  prevRef?: React.MutableRefObject<(() => void) | null>;
  nextRef?: React.MutableRefObject<(() => void) | null>;
}

const ShadowReading: React.FC<ShadowReadingProps> = ({
  audioCaptions,
  audioRef,
  playbackRate,
  isActive,
  onExit,
  advanceRef,
  prevRef,
  nextRef,
}) => {
  const currentIndexRef = useRef(0);
  const [displayIndex, setDisplayIndex] = React.useState(0);
  const isWaitingRef = useRef(false);
  const [isWaiting, setIsWaiting] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  const inputRefsMap = useRef<Map<string, HTMLInputElement>>(new Map());
  const [mode, setMode] = useState<'sequential' | 'fillBlank'>('sequential');
  const [blankData, setBlankData] = useState<{
    blankedIndices: Set<number>;
    words: string[];
  } | null>(null);
  const [blankInputs, setBlankInputs] = useState<Map<number, string[]>>(new Map());
  const [blankValidation, setBlankValidation] = useState<Map<number, ('correct' | 'wrong' | 'empty')[]>>(new Map());
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordDefinition, setWordDefinition] = useState<WordDefinition | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const definitionCacheRef = useRef<Map<string, WordDefinition>>(new Map());
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  // Voice recording state for encouraging speaking practice
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recordingStartedRef = useRef(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const recordedAudioRef = useRef<HTMLAudioElement | null>(null);

  const englishCaptions = useMemo(() => {
    const hasLatin = /[a-zA-Z]/;
    const filtered = audioCaptions.filter(c => hasLatin.test(c.text));
    return filtered.length > 0 ? filtered : audioCaptions;
  }, [audioCaptions]);

  // Stop voice recording and save the audio
  const stopRecording = useCallback(async () => {
    if (!wavRecorderRef.current || !recordingStartedRef.current) return;
    try {
      const result = await wavRecorderRef.current.end();
      wavRecorderRef.current = null;
      recordingStartedRef.current = false;
      setIsRecording(false);
      // Save the recorded audio URL for playback
      if (result?.url) {
        setRecordedAudioUrl(result.url);
      }
    } catch (err) {
      console.warn('Could not stop recording:', err);
    }
  }, []);

  // Play back the recorded audio
  const playRecording = useCallback(() => {
    if (!recordedAudioUrl) return;
    if (recordedAudioRef.current) {
      recordedAudioRef.current.pause();
      recordedAudioRef.current = null;
    }
    const audio = new Audio(recordedAudioUrl);
    recordedAudioRef.current = audio;
    audio.onended = () => setIsPlayingRecording(false);
    audio.play().catch(() => {});
    setIsPlayingRecording(true);
  }, [recordedAudioUrl]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    if (recordedAudioRef.current) {
      recordedAudioRef.current.pause();
      recordedAudioRef.current = null;
    }
    setIsPlayingRecording(false);
  }, []);

  const clearAutoPause = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetFillBlankState = useCallback(() => {
    setMode('sequential');
    setBlankData(null);
    setBlankInputs(new Map());
    setBlankValidation(new Map());
    setShowSuccess(false);
    setRecordedAudioUrl(null);
    setIsPlayingRecording(false);
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    if (recordedAudioRef.current) {
      recordedAudioRef.current.pause();
      recordedAudioRef.current = null;
    }
    // Stop recording when exiting fill-blank mode
    stopRecording();
  }, [stopRecording]);

  const startSentence = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || index >= englishCaptions.length) return;

    resetFillBlankState();
    clearAutoPause();
    currentIndexRef.current = index;
    setDisplayIndex(index);
    isWaitingRef.current = false;
    setIsWaiting(false);
    setIsPaused(false);

    audio.currentTime = englishCaptions[index].time;
    audio.play().catch(() => {});
    // Pause at next caption is handled by handleTimeUpdate — no duplicate timeout needed
  }, [audioRef, englishCaptions, clearAutoPause, resetFillBlankState]);

  const advanceNext = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= englishCaptions.length) {
      onExit();
      return;
    }
    startSentence(nextIndex);
  }, [englishCaptions.length, onExit, startSentence]);

  const goToPrev = useCallback(() => {
    const prevIndex = currentIndexRef.current - 1;
    if (prevIndex < 0) return;
    startSentence(prevIndex);
  }, [startSentence]);

  const goToNext = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= englishCaptions.length) return;
    startSentence(nextIndex);
  }, [englishCaptions.length, startSentence]);

  const replaySentence = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    clearAutoPause();
    isWaitingRef.current = false;
    setIsWaiting(false);
    setIsPaused(false);

    const idx = currentIndexRef.current;
    audio.currentTime = englishCaptions[idx].time;
    audio.play().catch(() => {});
    // Pause at next caption is handled by handleTimeUpdate
  }, [audioRef, englishCaptions, clearAutoPause]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // If waiting (script finished naturally), replay from beginning
    if (isWaitingRef.current) {
      replaySentence();
      setIsPaused(false);
      return;
    }

    // Normal pause/resume during playback
    if (audio.paused) {
      audio.play().catch(() => {});
      setIsPaused(false);
    } else {
      audio.pause();
      setIsPaused(true);
    }
  }, [audioRef, replaySentence]);

  // Start voice recording to encourage speaking practice
  const startRecording = useCallback(async () => {
    if (recordingStartedRef.current) return;
    try {
      const recorder = new WavRecorder({ sampleRate: 24000 });
      await recorder.begin();
      await recorder.record();
      wavRecorderRef.current = recorder;
      recordingStartedRef.current = true;
      setIsRecording(true);
    } catch (err) {
      console.warn('Could not start recording:', err);
    }
  }, []);

  const enterFillBlank = useCallback(() => {
    const idx = currentIndexRef.current;
    const text = englishCaptions[idx].text;
    const { blankedIndices, words } = selectWordsToBlank(text, difficulty);

    setBlankData({ blankedIndices, words });

    // Initialize input state: one string per blanked word
    const inputs = new Map<number, string[]>();
    blankedIndices.forEach(i => {
      inputs.set(i, new Array(words[i].replace(/[^a-zA-Z'-]/g, '').length).fill(''));
    });
    setBlankInputs(inputs);
    setBlankValidation(new Map());
    setShowSuccess(false);
    setMode('fillBlank');

    // Start recording to encourage speaking practice
    startRecording();
  }, [englishCaptions, difficulty, startRecording]);

  const exitFillBlank = useCallback(() => {
    resetFillBlankState();
  }, [resetFillBlankState]);

  const handleLetterInput = useCallback((
    wordIndex: number,
    charIndex: number,
    value: string,
    inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>
  ) => {
    if (!blankData) return;

    const word = blankData.words[wordIndex];
    const cleanWord = word.replace(/[^a-zA-Z'-]/g, '');
    const letter = value.toLowerCase().slice(-1);

    // Compute what the updated inputs will look like
    const currentArr = blankInputs.get(wordIndex) || [];
    const newArr = [...currentArr];
    newArr[charIndex] = letter;

    // Check if this word is now fully correct
    const isWordCorrect = newArr.every((ch, i) =>
      ch.toLowerCase() === cleanWord[i].toLowerCase()
    );

    // Check if ALL words are correct (using the prospective new array)
    const allCorrect = [...blankData.blankedIndices].every(idx => {
      if (idx === wordIndex) return true;
      const w = blankData.words[idx].replace(/[^a-zA-Z'-]/g, '');
      const inputs = idx === wordIndex ? newArr : (blankInputs.get(idx) || []);
      return inputs.every((ch, i) => ch.toLowerCase() === w[i].toLowerCase());
    });

    setBlankInputs(prev => {
      const next = new Map(prev);
      next.set(wordIndex, newArr);

      if (isWordCorrect) {
        setBlankValidation(prevVal => {
          const vNext = new Map(prevVal);
          vNext.set(wordIndex, newArr.map(() => 'correct' as const));
          return vNext;
        });

        if (allCorrect) {
          setShowSuccess(true);
          // Stop recording so user can listen to their voice
          stopRecording();
          // No auto-advance — user stays on current script to play their recording
        }
      } else {
        setBlankValidation(prevVal => {
          const vNext = new Map(prevVal);
          vNext.set(wordIndex, newArr.map((ch, i) => {
            if (!ch) return 'empty' as const;
            return ch.toLowerCase() === cleanWord[i].toLowerCase()
              ? 'correct' as const
              : 'wrong' as const;
          }));
          return vNext;
        });
      }

      return next;
    });

    // Auto-focus next input
    if (charIndex < cleanWord.length - 1) {
      const nextKey = `${wordIndex}-${charIndex + 1}`;
      inputRefs.current.get(nextKey)?.focus();
    } else if (isWordCorrect && !allCorrect) {
      // Word completed — jump to next blanked word's first input
      const sortedIndices = [...blankData.blankedIndices].sort((a, b) => a - b);
      const currentPos = sortedIndices.indexOf(wordIndex);
      for (let j = currentPos + 1; j < sortedIndices.length; j++) {
        const nextWordIdx = sortedIndices[j];
        const nextWord = blankData.words[nextWordIdx].replace(/[^a-zA-Z'-]/g, '');
        const nextInputs = nextWordIdx === wordIndex ? newArr : (blankInputs.get(nextWordIdx) || []);
        const isNextDone = nextInputs.every((ch, i) => ch.toLowerCase() === nextWord[i].toLowerCase());
        if (!isNextDone) {
          const targetKey = `${nextWordIdx}-0`;
          // Small delay to ensure state update has flushed
          setTimeout(() => {
            inputRefs.current.get(targetKey)?.focus();
          }, 10);
          break;
        }
      }
    }
  }, [blankData, blankInputs, advanceNext]);

  const handleLetterKeydown = useCallback((
    wordIndex: number,
    charIndex: number,
    e: React.KeyboardEvent,
    inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>
  ) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const currentInputs = blankInputs.get(wordIndex) || [];
      if (currentInputs[charIndex]) {
        // Current input has a letter — clear it and stay
        setBlankInputs(prev => {
          const next = new Map(prev);
          const arr = [...(next.get(wordIndex) || [])];
          arr[charIndex] = '';
          next.set(wordIndex, arr);
          return next;
        });
      } else if (charIndex > 0) {
        // Current input is empty, move to previous and clear it
        const prevKey = `${wordIndex}-${charIndex - 1}`;
        inputRefs.current.get(prevKey)?.focus();
        setBlankInputs(prev => {
          const next = new Map(prev);
          const arr = [...(next.get(wordIndex) || [])];
          arr[charIndex - 1] = '';
          next.set(wordIndex, arr);
          return next;
        });
      }
    } else if (e.key === 'Space') {
      // Space in fill-blank mode: exit and advance
      e.preventDefault();
      exitFillBlank();
      advanceNext();
    }
  }, [blankInputs, exitFillBlank, advanceNext]);

  // Help function: fills in the next incorrect/empty letter
  const handleHelp = useCallback(() => {
    if (!blankData) return;

    const sortedIndices = [...blankData.blankedIndices].sort((a, b) => a - b);

    // Find the first incorrect or empty letter across all blanked words
    for (const wordIdx of sortedIndices) {
      const word = blankData.words[wordIdx];
      const cleanWord = word.replace(/[^a-zA-Z'-]/g, '');
      const currentInputs = blankInputs.get(wordIdx) || [];
      const validation = blankValidation.get(wordIdx) || [];

      for (let charIdx = 0; charIdx < cleanWord.length; charIdx++) {
        const isCorrect = validation[charIdx] === 'correct';
        const currentVal = currentInputs[charIdx]?.toLowerCase();
        const correctVal = cleanWord[charIdx]?.toLowerCase();

        if (!isCorrect && currentVal !== correctVal) {
          // Found an incorrect/empty letter - fill it with the correct one
          setBlankInputs(prev => {
            const next = new Map(prev);
            const arr = [...(next.get(wordIdx) || [])];
            arr[charIdx] = correctVal;
            next.set(wordIdx, arr);

            // Check if this completes the word
            const isWordCorrect = arr.every((ch, i) =>
              ch.toLowerCase() === cleanWord[i].toLowerCase()
            );

            if (isWordCorrect) {
              setBlankValidation(prevVal => {
                const vNext = new Map(prevVal);
                vNext.set(wordIdx, arr.map(() => 'correct' as const));
                return vNext;
              });

              // Check if ALL words are correct
              const allCorrect = [...blankData.blankedIndices].every(idx => {
                const w = blankData.words[idx].replace(/[^a-zA-Z'-]/g, '');
                const inputs = idx === wordIdx ? arr : (prev.get(idx) || []);
                return inputs.every((ch, i) => ch.toLowerCase() === w[i].toLowerCase());
              });

              if (allCorrect) {
                setShowSuccess(true);
                stopRecording();
              }
            } else {
              // Update validation for this word
              setBlankValidation(prevVal => {
                const vNext = new Map(prevVal);
                vNext.set(wordIdx, arr.map((ch, i) => {
                  if (!ch) return 'empty' as const;
                  return ch.toLowerCase() === cleanWord[i].toLowerCase()
                    ? 'correct' as const
                    : 'wrong' as const;
                }));
                return vNext;
              });
            }

            return next;
          });

          // Focus the next input after this one
          if (charIdx < cleanWord.length - 1) {
            const nextKey = `${wordIdx}-${charIdx + 1}`;
            setTimeout(() => {
              inputRefsMap.current.get(nextKey)?.focus();
            }, 50);
          } else {
            // Move to next word's first input
            const currentPos = sortedIndices.indexOf(wordIdx);
            for (let j = currentPos + 1; j < sortedIndices.length; j++) {
              const nextWordIdx = sortedIndices[j];
              const nextWord = blankData.words[nextWordIdx].replace(/[^a-zA-Z'-]/g, '');
              const nextInputs = blankInputs.get(nextWordIdx) || [];
              const isNextDone = nextInputs.every((ch, i) => ch.toLowerCase() === nextWord[i].toLowerCase());
              if (!isNextDone) {
                const targetKey = `${nextWordIdx}-0`;
                setTimeout(() => {
                  inputRefsMap.current.get(targetKey)?.focus();
                }, 50);
                break;
              }
            }
          }

          return; // Only fill one letter per help click
        }
      }
    }
  }, [blankData, blankInputs, blankValidation, stopRecording]);

  useEffect(() => {
    advanceRef.current = advanceNext;
    if (prevRef) prevRef.current = goToPrev;
    if (nextRef) nextRef.current = goToNext;
  }, [advanceNext, goToPrev, goToNext, advanceRef, prevRef, nextRef]);

  // Word selection handler for dictionary lookup
  const handleWordLookup = useCallback(async (word: string, rect: DOMRect) => {
    // Cancel any pending hide
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    const cleanWord = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (!cleanWord || cleanWord.length < 2) return;

    setSelectedWord(cleanWord);
    setOverlayPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });

    // Check cache first
    if (definitionCacheRef.current.has(cleanWord)) {
      setWordDefinition(definitionCacheRef.current.get(cleanWord)!);
      return;
    }

    try {
      const res = await fetch(`/api/dictionary/${encodeURIComponent(cleanWord)}`);
      if (res.ok) {
        const data = await res.json();
        definitionCacheRef.current.set(cleanWord, data);
        setWordDefinition(data);
      } else {
        setWordDefinition(null);
      }
    } catch {
      setWordDefinition(null);
    }
  }, []);

  // Mouse up handler for word selection
  useEffect(() => {
    if (!isActive) return;

    const handleMouseUp = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || '';
      if (text && text.length < 30) {
        const range = selection?.getRangeAt(0);
        if (range) {
          const rect = range.getBoundingClientRect();
          handleWordLookup(text, rect);
        }
      }
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.toString().trim() === '') {
        // Start hide timer when selection is cleared
        hideTimerRef.current = setTimeout(() => {
          setSelectedWord(null);
          setWordDefinition(null);
          setOverlayPos(null);
        }, 1000);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isActive, handleWordLookup]);

  useEffect(() => {
    if (!isActive) return;

    currentIndexRef.current = 0;
    setDisplayIndex(0);
    startSentence(0);

    return () => {
      clearAutoPause();
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, [isActive, startSentence, clearAutoPause]);

  useEffect(() => {
    if (!isActive) return;
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (isWaitingRef.current) return;
      const idx = currentIndexRef.current;
      const nextCaption = englishCaptions[idx + 1];
      if (nextCaption && audio.currentTime >= nextCaption.time) {
        audio.pause();
        isWaitingRef.current = true;
        setIsWaiting(true);
        setIsPaused(true);
        clearAutoPause();
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [isActive, audioRef, englishCaptions, clearAutoPause]);

  useEffect(() => {
    if (!isActive) return;
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      const idx = currentIndexRef.current;
      const nextCaption = englishCaptions[idx + 1];
      if (nextCaption) {
        audio.pause();
        isWaitingRef.current = true;
        setIsWaiting(true);
        setIsPaused(true);
        clearAutoPause();
      } else {
        onExit();
      }
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isActive, audioRef, englishCaptions, onExit, clearAutoPause]);

  useEffect(() => {
    if (!isActive) return;
    // Clear stale timeout when playback rate changes — handleTimeUpdate handles pausing
    clearAutoPause();
  }, [playbackRate, isActive, clearAutoPause]);

  // Cleanup recorder on unmount or deactivation
  useEffect(() => {
    return () => {
      if (wavRecorderRef.current && recordingStartedRef.current) {
        wavRecorderRef.current.end().catch(() => {});
        wavRecorderRef.current = null;
        recordingStartedRef.current = false;
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (!activeItemRef.current) return;
    activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [displayIndex]);

  // Auto-focus first blank input when entering fill-blank mode
  useEffect(() => {
    if (mode !== 'fillBlank' || !blankData) return;
    const sortedIndices = [...blankData.blankedIndices].sort((a, b) => a - b);
    if (sortedIndices.length === 0) return;
    const firstWordIdx = sortedIndices[0];
    const firstInputKey = `${firstWordIdx}-0`;
    // Retry until the input element is mounted (up to 500ms)
    let attempts = 0;
    const tryFocus = () => {
      const el = inputRefsMap.current.get(firstInputKey);
      if (el) {
        el.focus();
      } else if (attempts++ < 10) {
        setTimeout(tryFocus, 50);
      }
    };
    const timer = setTimeout(tryFocus, 50);
    return () => clearTimeout(timer);
  }, [mode, blankData]);

  if (!isActive) return null;

  const words = blankData?.words || [];
  const isFillBlankMode = mode === 'fillBlank' && blankData;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Shadow Reading / 影子跟读</span>
        <div className={styles.headerRight}>
          <div className={styles.difficultySelector}>
            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                className={`${styles.difficultyBtn} ${difficulty === d ? styles.difficultyActive : ''}`}
                onClick={() => setDifficulty(d)}
                title={d === 'easy' ? '≤5 letters' : d === 'medium' ? '6-10 letters' : '10+ letters'}
              >
                {d === 'easy' ? 'E' : d === 'medium' ? 'M' : 'H'}
              </button>
            ))}
          </div>
          {isRecording && (
            <span className={styles.recordingIndicator}>
              <span className={styles.recordingDot} /> Recording
            </span>
          )}
          <span className={styles.hint}>
            {isFillBlankMode
              ? '↑↓: navigate | Space: skip | 💡: help'
              : '↑↓: navigate | Space: next | Esc: exit'}
          </span>
        </div>
      </div>
      <div className={styles.scrollArea}>
        {englishCaptions.map((caption, i) => (
          <div
            key={i}
            ref={(el) => { if (i === displayIndex) activeItemRef.current = el; }}
            className={`${styles.sentence} ${i === displayIndex ? styles.active : ''} ${i < displayIndex ? styles.past : ''}`}
          >
            {i === displayIndex && isFillBlankMode && blankData ? (
              <div className={styles.fillBlankContainer}>
                {words.map((word, wi) => {
                  const isLast = wi === words.length - 1;
                  const spacer = isLast ? '' : ' ';
                  if (blankData.blankedIndices.has(wi)) {
                    const clean = word.replace(/[^a-zA-Z'-]/g, '');
                    const letterInputs = blankInputs.get(wi) || [];
                    const validation = blankValidation.get(wi) || [];
                    const wordCorrect = validation.length > 0 && validation.every(v => v === 'correct');
                    return (
                      <span key={wi} className={`${styles.fillBlankWord} ${wordCorrect ? 'correct' : ''}`} style={{ marginRight: spacer ? '0.35em' : undefined }}>
                        {clean.split('').map((_, ci) => {
                          const key = `${wi}-${ci}`;
                          const val = letterInputs[ci] || '';
                          const state = validation[ci] || 'empty';
                          return (
                            <span key={ci} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                              <input
                                ref={(el) => {
                                  if (el) inputRefsMap.current.set(key, el);
                                }}
                                className={`${styles.fillBlankInput} ${
                                  state === 'correct' ? styles.correct :
                                  state === 'wrong' ? styles.wrong : ''
                                }`}
                                type="text"
                                maxLength={1}
                                value={val}
                                onChange={(e) => handleLetterInput(wi, ci, e.target.value, inputRefsMap)}
                                onKeyDown={(e) => handleLetterKeydown(wi, ci, e, inputRefsMap)}
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                              />
                              <span className={styles.fillBlankWrongX}>
                                {state === 'wrong' ? '×' : ''}
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    );
                  }
                  return (
                    <span key={wi} style={{ whiteSpace: 'pre' }}>
                      <span className={styles.fillBlankStatic}>{word}</span>
                      {spacer}
                    </span>
                  );
                })}
                {showSuccess && (
                  <div className={styles.successBanner}>
                    <span className={styles.successCheck}>✓</span>
                    <span className={styles.successText}>All correct!</span>
                  </div>
                )}
              </div>
            ) : (
              caption.text
            )}
            {i === displayIndex && (
              <div className={styles.toolbar}>
                <button className={styles.toolbarBtn} onClick={replaySentence}>
                  {'↻'} Repeat
                </button>
                <button className={styles.toolbarBtn} onClick={togglePlayPause}>
                  {(isWaiting || isPaused) ? '▶' : '⏸'}
                </button>
                {!isFillBlankMode && !showSuccess && (
                  <button className={styles.toolbarBtn} onClick={enterFillBlank}>
                    {'✎'} Fill Blank
                  </button>
                )}
                {isFillBlankMode && !showSuccess && (
                  <button className={`${styles.toolbarBtn} ${styles.helpBtn}`} onClick={handleHelp}>
                    {'💡'} Help
                  </button>
                )}
                {recordedAudioUrl && showSuccess && (
                  <button
                    className={`${styles.toolbarBtn} ${styles.playbackBtn}`}
                    onClick={isPlayingRecording ? stopPlayback : playRecording}
                  >
                    {isPlayingRecording ? '⏹' : '🎙'} {isPlayingRecording ? 'Stop' : 'My Voice'}
                  </button>
                )}
                {showSuccess && (
                  <button
                    className={`${styles.toolbarBtn} ${styles.nextToolbarBtn}`}
                    onClick={() => {
                      exitFillBlank();
                      advanceNext();
                    }}
                  >
                    {'Next →'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {isWaiting && displayIndex < englishCaptions.length - 1 && !isFillBlankMode && (
        <div className={styles.waitIndicator}>
          Press Space to continue...
        </div>
      )}
      {selectedWord && overlayPos && (
        <div className={styles.wordOverlay} style={{ top: overlayPos.top, left: overlayPos.left }}>
          <div className={styles.wordTitle}>
            {selectedWord}
            {wordDefinition?.phonetic && <span className={styles.phonetic}> {wordDefinition.phonetic}</span>}
          </div>
          {wordDefinition?.meanings?.map((m, i) => (
            <div key={i} className={styles.meaning}>
              <span className={styles.pos}>{m.partOfSpeech}</span>
              {m.definitions.map((d, j) => (
                <div key={j} className={styles.def}>
                  {d.definition}
                  {d.example && <span className={styles.example}> "{d.example}"</span>}
                </div>
              ))}
            </div>
          ))}
          {!wordDefinition && <div className={styles.loading}>Looking up...</div>}
        </div>
      )}
    </div>
  );
};

export default ShadowReading;
