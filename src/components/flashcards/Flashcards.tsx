import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './Flashcards.module.css';
import { Volume2, Square, Globe } from 'react-feather';

import { RealtimeClient } from '@hankswang123/realtime-api-beta';

// Optional: accept props if you already have external data
interface Card {
  front: string;
  back: string;
  front_translation?: string;   // added
  back_translation?: string;    // added  
}
interface FlashcardsProps {
  cards?: Card[];
  realtimeClient?: RealtimeClient;
}

export default function Flashcards({ cards, realtimeClient }: FlashcardsProps) {
  // You can replace this with actual data or fetch from a file
  // Fallback data if no cards prop is provided  
  //console.log('Flashcards cards:', cards);
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
  const [isTranslating, setIsTranslating] = useState(false); // keeps Square icon logic consistent  

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

  // Current side translation text (already prepared in Card[])
  const currentSideTranslation = React.useMemo(() => {
    return flipped ? (card.back_translation || '') : (card.front_translation || '');
  }, [flipped, card]);

  const handleTranslateToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // If translation text is preloaded, just toggle; keep a brief async frame if you want Square flash
    if (!currentSideTranslation) {
      // No translation available; optionally you could disable the button instead.
      return;
    }
    if (!showTranslation) {
      // Simulate short loading phase only if you want Square to appear
      setIsTranslating(true);
      requestAnimationFrame(() => {
        setShowTranslation(true);
        setIsTranslating(false);
      });
    } else {
      setShowTranslation(false);
    }
  }, [showTranslation, currentSideTranslation]);  

  /* SpeechSynthesisUtterance quality suck, use Realtime API instead */
  /*
  const speakCurrent = useCallback(() => {
    const text = flipped ? card.back : card.front;
    if (!text || !window.speechSynthesis) return;
    cancelSpeak();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /Google|Microsoft|Natural|Neural/i.test(v.name));
    if (preferred) utter.voice = preferred;
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utter);
  }, [flipped, card, cancelSpeak]);  */

  //Speak Aloud the current card via Realtime API
  const speakCurrent = useCallback(() => {
    const text = flipped ? card.back : card.front;
    if (!text || !window.speechSynthesis) return;

    if(realtimeClient.isConnected()){
      realtimeClient.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Read Aloud: ${text} with Casual and child-friendly，Cheerful, warm tone. only output the read aloud content`,
        },
        ]);  
    }

  }, [flipped, card, cancelSpeak]);    

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);  

  const cardRef = useRef<HTMLDivElement|null>(null);  
  useEffect(() => {
    cardRef.current?.focus();
  }, [index, data.length]);  

  const hasActiveSelection = () => {
    const sel = window.getSelection();
    if (!sel) return false;
    if (sel.isCollapsed) return false;
    return sel.toString().trim().length > 0;
  };

    // Immediate flip helper
  const flipNow = () => setFlipped(f => !f);

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
    // Snapshot whether a selection existed BEFORE this click clears it
    hadSelectionAtMouseDownRef.current = hasActiveSelection();
  };  

 const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If there WAS a selection at mousedown, skip flipping (even though click cleared it)
    if (hadSelectionAtMouseDownRef.current) {
      hadSelectionAtMouseDownRef.current = false;
      // Cancel any pending flip timeout
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      return;
    }

    // Double click (detail > 1) => cancel pending single-click flip
    if (e.detail > 1) {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      return;
    }

    // Schedule delayed flip to allow time for a possible second click (double-click)
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null;
      // Re-check (user might have dragged to select)
      if (hasActiveSelection()) return;
      flipNow();
    }, 180);
  };  

  const next = useCallback(() => {
    setFlipped(false);
    setIndex(i => (i + 1) % data.length);
  }, [data.length]);

  const prev = useCallback(() => {
    setFlipped(false);
    setIndex(i => (i - 1 + data.length) % data.length);
  }, [data.length]);

  //const card = data[index];

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
        //aria-label="Flashcard"
        aria-label={`Flashcard ${index + 1} of ${data.length}`}
      >
        <div className={styles.front}>{card.front}</div>
        <div className={styles.back}>{card.back}</div>

        <button
          type="button"
          className={`${styles.voiceButton} ${isSpeaking ? styles.speaking : ''}`}
          aria-label={isSpeaking ? 'Stop reading' : 'Read this card aloud'}
          onClick={(e) => {
            e.stopPropagation(); // prevent triggering flip
            if (isSpeaking) {
              cancelSpeak();
            } else {
              speakCurrent();
            }
          }}
        >
          {isSpeaking ? <Square size={18} /> : <Volume2 size={18} />}
        </button>

        {/* Translate Button (uses Globe; Square when "translating") */}
        <button
          type="button"
          className={styles.translateButton}
            aria-label={showTranslation ? 'Hide translation' : 'Show translation'}
          onClick={handleTranslateToggle}
          disabled={!currentSideTranslation}
        >
          {(isTranslating || showTranslation) ? <Square size={16} /> : <Globe size={16} />}
        </button>

        {showTranslation && currentSideTranslation && (
          <div className={styles.translationBadge}>
            {currentSideTranslation}
          </div>
        )}

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