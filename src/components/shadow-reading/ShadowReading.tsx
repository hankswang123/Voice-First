import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styles from './ShadowReading.module.css';

function selectWordsToBlank(sentence: string): {
  blankedIndices: Set<number>;
  words: string[];
} {
  const words = sentence.split(/\s+/);
  const eligible = words
    .map((w, i) => ({ word: w, index: i }))
    .filter(({ word }) => word.replace(/[^a-zA-Z'-]/g, '').length > 2);

  const blankCount = Math.min(
    eligible.length,
    Math.max(1, Math.floor(eligible.length * 0.4))
  );

  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const blankedIndices = new Set(shuffled.slice(0, blankCount).map(e => e.index));

  return { blankedIndices, words };
}

interface ShadowReadingProps {
  audioCaptions: Array<{ time: number; text: string }>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playbackRate: number;
  isActive: boolean;
  onExit: () => void;
  advanceRef: React.MutableRefObject<(() => void) | null>;
}

const ShadowReading: React.FC<ShadowReadingProps> = ({
  audioCaptions,
  audioRef,
  playbackRate,
  isActive,
  onExit,
  advanceRef,
}) => {
  const currentIndexRef = useRef(0);
  const [displayIndex, setDisplayIndex] = React.useState(0);
  const isWaitingRef = useRef(false);
  const [isWaiting, setIsWaiting] = React.useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeItemRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<'sequential' | 'fillBlank'>('sequential');
  const [blankData, setBlankData] = useState<{
    blankedIndices: Set<number>;
    words: string[];
  } | null>(null);
  const [blankInputs, setBlankInputs] = useState<Map<number, string[]>>(new Map());
  const [blankValidation, setBlankValidation] = useState<Map<number, ('correct' | 'wrong' | 'empty')[]>>(new Map());
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const englishCaptions = useMemo(() => {
    const hasLatin = /[a-zA-Z]/;
    const filtered = audioCaptions.filter(c => hasLatin.test(c.text));
    return filtered.length > 0 ? filtered : audioCaptions;
  }, [audioCaptions]);

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
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const startSentence = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || index >= englishCaptions.length) return;

    resetFillBlankState();
    clearAutoPause();
    currentIndexRef.current = index;
    setDisplayIndex(index);
    isWaitingRef.current = false;
    setIsWaiting(false);

    audio.currentTime = englishCaptions[index].time;
    audio.play().catch(() => {});

    const nextCaption = englishCaptions[index + 1];
    if (nextCaption) {
      const duration = (nextCaption.time - englishCaptions[index].time) / playbackRate;
      timeoutRef.current = setTimeout(() => {
        audio.pause();
        isWaitingRef.current = true;
        setIsWaiting(true);
      }, duration * 1000);
    }
  }, [audioRef, englishCaptions, playbackRate, clearAutoPause, resetFillBlankState]);

  const advanceNext = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= englishCaptions.length) {
      onExit();
      return;
    }
    startSentence(nextIndex);
  }, [englishCaptions.length, onExit, startSentence]);

  const replaySentence = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Cancel any pending auto-pause
    clearAutoPause();
    isWaitingRef.current = false;
    setIsWaiting(false);

    const idx = currentIndexRef.current;
    audio.currentTime = englishCaptions[idx].time;
    audio.play().catch(() => {});

    const nextCaption = englishCaptions[idx + 1];
    if (nextCaption) {
      const duration = (nextCaption.time - englishCaptions[idx].time) / playbackRate;
      timeoutRef.current = setTimeout(() => {
        audio.pause();
        isWaitingRef.current = true;
        setIsWaiting(true);
      }, duration * 1000);
    }
  }, [audioRef, englishCaptions, playbackRate, clearAutoPause]);

  const enterFillBlank = useCallback(() => {
    const idx = currentIndexRef.current;
    const text = englishCaptions[idx].text;
    const { blankedIndices, words } = selectWordsToBlank(text);

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

    // Pause audio if playing
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
    clearAutoPause();
    isWaitingRef.current = false;
    setIsWaiting(false);
  }, [audioRef, englishCaptions, clearAutoPause]);

  const exitFillBlank = useCallback(() => {
    resetFillBlankState();
  }, [resetFillBlankState]);

  useEffect(() => {
    advanceRef.current = advanceNext;
  }, [advanceNext, advanceRef]);

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
    clearAutoPause();

    const audio = audioRef.current;
    if (!audio || isWaitingRef.current) return;

    const idx = currentIndexRef.current;
    const nextCaption = englishCaptions[idx + 1];
    if (nextCaption && !audio.paused) {
      const remaining = (nextCaption.time - audio.currentTime) / playbackRate;
      timeoutRef.current = setTimeout(() => {
        audio.pause();
        isWaitingRef.current = true;
        setIsWaiting(true);
      }, remaining * 1000);
    }
  }, [playbackRate, isActive, audioRef, englishCaptions, clearAutoPause]);

  useEffect(() => {
    if (!activeItemRef.current) return;
    activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [displayIndex]);

  if (!isActive) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Shadow Reading / 影子跟读</span>
        <span className={styles.hint}>Space: next sentence | Esc: exit</span>
      </div>
      <div className={styles.scrollArea}>
        {englishCaptions.map((caption, i) => (
          <div
            key={i}
            ref={(el) => { if (i === displayIndex) activeItemRef.current = el; }}
            className={`${styles.sentence} ${i === displayIndex ? styles.active : ''} ${i < displayIndex ? styles.past : ''}`}
          >
            {caption.text}
          </div>
        ))}
      </div>
      {isWaiting && displayIndex < englishCaptions.length - 1 && (
        <div className={styles.waitIndicator}>
          Press Space to continue...
        </div>
      )}
    </div>
  );
};

export default ShadowReading;
