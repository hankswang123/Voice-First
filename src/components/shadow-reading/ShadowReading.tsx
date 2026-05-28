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
    // Audio keeps playing — fill-blank works in parallel with hearing
  }, [englishCaptions]);

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
          successTimerRef.current = setTimeout(() => {
            advanceNext();
          }, 1500);
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
        <span className={styles.hint}>
          {isFillBlankMode
            ? 'Type to fill blanks | Space: skip'
            : 'Space: next sentence | Esc: exit'}
        </span>
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
                  <div className={styles.successOverlay}>
                    <span className={styles.successCheck}>{'✓'}</span>
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
                {!isFillBlankMode && (
                  <button className={styles.toolbarBtn} onClick={enterFillBlank}>
                    {'✎'} Fill Blank
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
    </div>
  );
};

export default ShadowReading;
