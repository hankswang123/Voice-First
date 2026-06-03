import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './Flashcards.module.css';
import { Volume2, Square, Globe, Mic, MicOff } from 'react-feather';

import { RealtimeClient } from '../../lib/realtime/index.js';
import { useVoiceRecognition, PronunciationResult } from './useVoiceRecognition';
import PronunciationScore from './PronunciationScore';

// Optional: accept props if you already have external data
interface Card {
  front: string;
  back: string;
  front_translation?: string;
  back_translation?: string;
}
interface FlashcardsProps {
  cards?: Card[];
  realtimeClient?: RealtimeClient;
}

export default function Flashcards({ cards, realtimeClient }: FlashcardsProps) {
  const data: Card[] = cards && cards.length
    ? cards
    : [
        {
          front: "Flashcard 1: How is the name 'markhor' pronounced?",
          back: "MAR-kor.",
          front_translation: "卡片1：'markhor' 怎么读？",
          back_translation: "发音：MAR-kor"
        },
        {
          front: "Flashcard 2: How is the name 'oryx' pronounced?",
          back: "OR-iks.",
          front_translation: "卡片2：'oryx' 怎么读？",
          back_translation: "发音：OR-iks"
        },
      ];

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const clickTimeoutRef = useRef<number | null>(null);
  const hadSelectionAtMouseDownRef = useRef(false);

  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  // Voice mode state
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceResult, setVoiceResult] = useState<PronunciationResult | null>(null);

  const cancelSpeak = useCallback(() => {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => cancelSpeak();
  }, [cancelSpeak]);

  const card = React.useMemo(() => data[index], [data, index]);

  // Get the text the child should speak (front side of card)
  const expectedText = React.useMemo(() => {
    // Extract just the word/phrase from the front side
    // e.g., "Flashcard 1: How is the name 'markhor' pronounced?" → "markhor"
    const match = card.front.match(/'([^']+)'/);
    return match ? match[1] : card.front;
  }, [card]);

  const currentSideTranslation = React.useMemo(() => {
    return flipped ? (card.back_translation || '') : (card.front_translation || '');
  }, [flipped, card]);

  // Voice recognition hook
  const {
    isRecording,
    isProcessing,
    toggleRecording,
  } = useVoiceRecognition({
    realtimeClient,
    expectedText,
    onResult: useCallback((result: PronunciationResult) => {
      setVoiceResult(result);
      // Auto-flip to show answer after scoring
      if (!flipped) {
        setTimeout(() => setFlipped(true), 500);
      }
    }, [flipped]),
  });

  const handleTranslateToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!currentSideTranslation) return;
    if (!showTranslation) {
      setIsTranslating(true);
      requestAnimationFrame(() => {
        setShowTranslation(true);
        setIsTranslating(false);
      });
    } else {
      setShowTranslation(false);
    }
  }, [showTranslation, currentSideTranslation]);

  // Speak Aloud via Realtime API
  const speakCurrent = useCallback(() => {
    const text = flipped ? card.back : card.front;
    if (!text || !window.speechSynthesis) return;

    if (realtimeClient?.isConnected()) {
      realtimeClient.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Read Aloud: ${text} with Casual and child-friendly，Cheerful, warm tone. only output the read aloud content`,
        },
      ]);
    }
  }, [flipped, card, realtimeClient]);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    cardRef.current?.focus();
  }, [index, data.length]);

  const hasActiveSelection = () => {
    const sel = window.getSelection();
    if (!sel) return false;
    if (sel.isCollapsed) return false;
    return sel.toString().trim().length > 0;
  };

  const flipNow = () => {
    if (showTranslation) setShowTranslation(false);
    if (isTranslating) setIsTranslating(false);
    setFlipped(f => !f);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && !hasActiveSelection()) {
      e.preventDefault();
      flipNow();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };

  const handleMouseDown = () => {
    hadSelectionAtMouseDownRef.current = hasActiveSelection();
  };

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hadSelectionAtMouseDownRef.current) {
      hadSelectionAtMouseDownRef.current = false;
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      return;
    }

    if (e.detail > 1) {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      return;
    }

    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null;
      if (hasActiveSelection()) return;
      flipNow();
    }, 180);
  };

  const next = useCallback(() => {
    setFlipped(false);
    if (showTranslation) setShowTranslation(false);
    if (isTranslating) setIsTranslating(false);
    setVoiceResult(null);
    setIndex(i => (i + 1) % data.length);
  }, [data.length, showTranslation, isTranslating]);

  const prev = useCallback(() => {
    setFlipped(false);
    if (showTranslation) setShowTranslation(false);
    if (isTranslating) setIsTranslating(false);
    setVoiceResult(null);
    setIndex(i => (i - 1 + data.length) % data.length);
  }, [data.length, showTranslation, isTranslating]);

  const dismissScore = useCallback(() => {
    setVoiceResult(null);
  }, []);

  const toggleVoiceMode = useCallback(() => {
    // Side effects must NOT live inside a setState updater function.
    // React 18 StrictMode invokes updater functions twice in dev to surface
    // impurity, which would cause toggleRecording() to fire twice and the
    // second call would throw "Already recording: please call .pause() first".
    // Compute the next state in the event handler (not double-invoked),
    // run the side effect once, then setState with a plain value.
    const turningOn = !voiceMode;
    if (turningOn) {
      if (!isRecording) toggleRecording();
    } else {
      if (isRecording) toggleRecording();
      setVoiceResult(null);
    }
    setVoiceMode(turningOn);
  }, [voiceMode, isRecording, toggleRecording]);

  return (
    <div className={styles.root}>
      <div
        ref={cardRef}
        className={`${styles.flashcard} ${flipped ? styles.flipped : ''}`}
        onMouseDown={handleMouseDown}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Flashcard ${index + 1} of ${data.length}`}
      >
        {/* Voice hint when voice mode is active */}
        {voiceMode && !voiceResult && !isProcessing && (
          <div className={styles.voiceHint}>
            {isRecording ? '🎤 Listening...' : 'Say the word on the card'}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className={styles.processingIndicator}>
            Scoring<span className={styles.processingDot}>...</span>
          </div>
        )}

        <div className={`${styles.face} ${styles.front}`}>
          {card.front}
          {showTranslation && !flipped && card.front_translation && (
            <div className={styles.translationBadge} aria-live="polite">{card.front_translation}</div>
          )}
        </div>
        <div className={`${styles.face} ${styles.back}`}>
          {card.back}
          {showTranslation && flipped && card.back_translation && (
            <div className={styles.translationBadge} aria-live="polite">{card.back_translation}</div>
          )}
        </div>

        {/* Pronunciation Score Overlay */}
        {voiceResult && (
          <PronunciationScore result={voiceResult} onDismiss={dismissScore} />
        )}

        {/* Voice mode toggle (microphone) */}
        <button
          type="button"
          className={`${styles.micButton} ${voiceMode ? styles.active : ''}`}
          aria-label={voiceMode ? 'Disable voice mode' : 'Enable voice mode'}
          onClick={(e) => {
            e.stopPropagation();
            toggleVoiceMode();
          }}
        >
          {voiceMode ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        {/* Existing voice button (Read Aloud) */}
        <button
          type="button"
          className={`${styles.voiceButton} ${isSpeaking ? styles.speaking : ''}`}
          aria-label={isSpeaking ? 'Stop reading' : 'Read this card aloud'}
          onClick={(e) => {
            e.stopPropagation();
            if (isSpeaking) {
              cancelSpeak();
            } else {
              speakCurrent();
            }
          }}
        >
          {isSpeaking ? <Square size={18} /> : <Volume2 size={18} />}
        </button>

        {/* Translate Button */}
        <button
          type="button"
          className={styles.translateButton}
          aria-label={showTranslation ? 'Hide translation' : 'Show translation'}
          onClick={handleTranslateToggle}
          disabled={!currentSideTranslation}
        >
          {(isTranslating || showTranslation) ? <Square size={16} /> : <Globe size={16} />}
        </button>

      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.navButton} onClick={prev} aria-label="Previous">
          ‹
        </button>
        <span className={styles.counter}>
          {index + 1}/{data.length}
        </span>
        <button type="button" className={styles.navButton} onClick={next} aria-label="Next">
          ›
        </button>
      </div>
    </div>
  );
}
