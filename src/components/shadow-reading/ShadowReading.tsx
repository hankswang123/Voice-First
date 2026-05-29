import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styles from './ShadowReading.module.css';

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
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordDefinition, setWordDefinition] = useState<WordDefinition | null>(null);
  const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const definitionCacheRef = useRef<Map<string, WordDefinition>>(new Map());

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

  const startSentence = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || index >= englishCaptions.length) return;

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
  }, [audioRef, englishCaptions, playbackRate, clearAutoPause]);

  const advanceNext = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;
    if (nextIndex >= englishCaptions.length) {
      onExit();
      return;
    }
    startSentence(nextIndex);
  }, [englishCaptions.length, onExit, startSentence]);

  useEffect(() => {
    advanceRef.current = advanceNext;
  }, [advanceNext, advanceRef]);

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
