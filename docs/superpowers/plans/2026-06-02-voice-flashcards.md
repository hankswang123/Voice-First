# Voice Flashcards: 语音翻牌 + 发音评分 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement. Mark steps as you complete them.

**Goal:** Add voice interaction to Flashcards — speak to flip cards, get pronunciation scores.

**Architecture:** Extend existing Flashcards component with voice mode. Add a `useVoiceRecognition` hook that wraps WavRecorder + Realtime API for speech-to-text and pronunciation scoring. New `PronunciationScore` component displays animated scores. No changes to existing flip/translate/TTS logic.

**Tech Stack:** React hooks, TypeScript, WavRecorder, RealtimeClient, CSS Modules

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/flashcards/useVoiceRecognition.ts` | Create | Voice recognition hook: record audio, send to Realtime API, parse score response |
| `src/components/flashcards/PronunciationScore.tsx` | Create | Animated score display component |
| `src/components/flashcards/PronunciationScore.module.css` | Create | Score display styles |
| `src/components/flashcards/Flashcards.tsx` | Modify | Add voice mode toggle, wire up voice recognition, display score |
| `src/components/flashcards/Flashcards.module.css` | Modify | Add mic button, voice hint, score overlay styles |

---

## Task 1: Create useVoiceRecognition hook

**Files:**
- Create: `src/components/flashcards/useVoiceRecognition.ts`

### Step 1: Create the hook file

Create `src/components/flashcards/useVoiceRecognition.ts` with the following content:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { WavRecorder } from '../../lib/wavetools/lib/wav_recorder.js';
import { RealtimeClient } from '../../lib/realtime/index.js';

export interface PronunciationResult {
  score: number;        // 0-100
  feedback: string;     // encouraging message
  stars: number;        // 1-5
}

interface UseVoiceRecognitionOptions {
  realtimeClient?: RealtimeClient;
  expectedText?: string;
  onResult?: (result: PronunciationResult) => void;
  onTranscript?: (text: string) => void;
}

export function useVoiceRecognition({
  realtimeClient,
  expectedText,
  onResult,
  onTranscript,
}: UseVoiceRecognitionOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const wavRecorderRef = useRef<WavRecorder | null>(null);
  const responseBufferRef = useRef<string>('');

  // Initialize WavRecorder
  useEffect(() => {
    wavRecorderRef.current = new WavRecorder({ sampleRate: 24000 });
    return () => {
      if (wavRecorderRef.current) {
        wavRecorderRef.current.pause();
      }
    };
  }, []);

  // Listen for AI responses to parse score
  useEffect(() => {
    if (!realtimeClient) return;

    const handleConversationUpdated = ({ item }: any) => {
      if (item?.role === 'assistant' && item?.formatted?.text) {
        responseBufferRef.current = item.formatted.text;
      }
    };

    const handleConversationCompleted = ({ item }: any) => {
      if (item?.role === 'assistant' && item?.formatted?.text) {
        const text = item.formatted.text;
        try {
          // Try to parse JSON response from AI
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed.score === 'number') {
              onResult?.({
                score: Math.min(100, Math.max(0, parsed.score)),
                feedback: parsed.feedback || 'Good job!',
                stars: Math.min(5, Math.max(1, parsed.stars || 3)),
              });
            }
          }
        } catch (e) {
          // If JSON parse fails, try to extract score from text
          const scoreMatch = text.match(/(\d{1,3})/);
          if (scoreMatch) {
            const score = Math.min(100, parseInt(scoreMatch[1], 10));
            onResult?.({
              score,
              feedback: text.slice(0, 100),
              stars: score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1,
            });
          }
        }
        setIsProcessing(false);
        responseBufferRef.current = '';
      }
    };

    realtimeClient.on('conversation.updated', handleConversationUpdated);
    realtimeClient.on('conversation.item.completed', handleConversationCompleted);

    return () => {
      realtimeClient.off('conversation.updated', handleConversationUpdated);
      realtimeClient.off('conversation.item.completed', handleConversationCompleted);
    };
  }, [realtimeClient, onResult]);

  const startRecording = useCallback(async () => {
    if (!wavRecorderRef.current || !realtimeClient?.isConnected()) return;
    
    setIsRecording(true);
    setIsProcessing(false);
    
    await wavRecorderRef.current.begin();
    await wavRecorderRef.current.record((data) => {
      realtimeClient.appendInputAudio(data.mono);
    });
  }, [realtimeClient]);

  const stopRecording = useCallback(async () => {
    if (!wavRecorderRef.current) return;
    
    setIsRecording(false);
    setIsProcessing(true);
    
    await wavRecorderRef.current.pause();
    
    // Send scoring request to AI
    if (realtimeClient?.isConnected() && expectedText) {
      realtimeClient.sendUserMessageContent([{
        type: 'input_text',
        text: `Pronunciation scoring task. The expected word/phrase is: "${expectedText}". 
The child just spoke. Score their pronunciation accuracy from 0-100.
Reply with JSON only: {"score": <number>, "feedback": "<short encouraging message>", "stars": <1-5>}`,
      }]);
    }
  }, [realtimeClient, expectedText]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
```

### Step 2: Verify TypeScript compiles

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors (or only pre-existing errors unrelated to this file)

### Step 3: Commit

```bash
cd C:\Users\I058700\Repo\Voice-First
git add src/components/flashcards/useVoiceRecognition.ts
git commit -m "feat(voice-flashcards): add useVoiceRecognition hook"
```

---

## Task 2: Create PronunciationScore component

**Files:**
- Create: `src/components/flashcards/PronunciationScore.tsx`
- Create: `src/components/flashcards/PronunciationScore.module.css`

### Step 1: Create the CSS module

Create `src/components/flashcards/PronunciationScore.module.css`:

```css
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 12px;
  z-index: 10;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scoreCount {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.score {
  font-size: 4rem;
  font-weight: bold;
  color: #fff;
  animation: scoreCount 0.4s ease;
}

.score.great { color: #4CAF50; }      /* 80-100: green */
.score.good { color: #FFC107; }       /* 60-79: yellow */
.score.fair { color: #FF9800; }       /* 40-59: orange */
.score.poor { color: #f44336; }       /* 0-39: red */

.stars {
  font-size: 2rem;
  margin: 8px 0;
  letter-spacing: 4px;
}

.star {
  color: #555;
  transition: color 0.3s ease;
}

.star.active {
  color: #FFD700;
}

.feedback {
  color: #fff;
  font-size: 1.1rem;
  margin-top: 8px;
  text-align: center;
  padding: 0 20px;
}

.hint {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
  margin-top: 12px;
}
```

### Step 2: Create the component

Create `src/components/flashcards/PronunciationScore.tsx`:

```typescript
import React, { useEffect } from 'react';
import styles from './PronunciationScore.module.css';
import { PronunciationResult } from './useVoiceRecognition';

interface PronunciationScoreProps {
  result: PronunciationResult;
  onDismiss: () => void;
  autoHideMs?: number;
}

export default function PronunciationScore({
  result,
  onDismiss,
  autoHideMs = 3000,
}: PronunciationScoreProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoHideMs]);

  const scoreClass =
    result.score >= 80 ? styles.great :
    result.score >= 60 ? styles.good :
    result.score >= 40 ? styles.fair :
    styles.poor;

  const stars = Array.from({ length: 5 }, (_, i) => i < result.stars);

  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={`${styles.score} ${scoreClass}`}>
        {result.score}
      </div>
      <div className={styles.stars}>
        {stars.map((active, i) => (
          <span key={i} className={`${styles.star} ${active ? styles.active : ''}`}>
            ★
          </span>
        ))}
      </div>
      <div className={styles.feedback}>{result.feedback}</div>
      <div className={styles.hint}>tap to dismiss</div>
    </div>
  );
}
```

### Step 3: Verify TypeScript compiles

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

### Step 4: Commit

```bash
cd C:\Users\I058700\Repo\Voice-First
git add src/components/flashcards/PronunciationScore.tsx src/components/flashcards/PronunciationScore.module.css
git commit -m "feat(voice-flashcards): add PronunciationScore component"
```

---

## Task 3: Update Flashcards component with voice mode

**Files:**
- Modify: `src/components/flashcards/Flashcards.tsx`
- Modify: `src/components/flashcards/Flashcards.module.css`

### Step 1: Add voice mode CSS styles

Add the following to `Flashcards.module.css` (at the end of the file):

```css
/* Voice mode styles */
.micButton {
  position: absolute;
  bottom: 4px;
  right: 89px;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(2px);
  transition: background 0.2s, transform 0.15s;
}

.micButton:hover {
  background: rgba(0, 0, 0, 0.75);
}

.micButton:active {
  transform: scale(0.9);
}

.micButton.active {
  background: #e53935;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0.5); }
  70% { box-shadow: 0 0 0 12px rgba(229, 57, 53, 0); }
  100% { box-shadow: 0 0 0 0 rgba(229, 57, 53, 0); }
}

.voiceHint {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.85rem;
  pointer-events: none;
  z-index: 5;
  animation: fadeIn 0.3s ease;
  white-space: nowrap;
}

.processingIndicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 1.2rem;
  z-index: 5;
}

.processingDot {
  display: inline-block;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

### Step 2: Update Flashcards.tsx

Replace the entire content of `Flashcards.tsx` with:

```typescript
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
    setVoiceMode(v => {
      if (v) {
        // Turning off: stop recording if active
        if (isRecording) {
          toggleRecording();
        }
        setVoiceResult(null);
      }
      return !v;
    });
  }, [isRecording, toggleRecording]);

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
```

### Step 3: Verify TypeScript compiles

Run: `npx tsc --noEmit --skipLibCheck`
Expected: No errors

### Step 4: Verify build succeeds

Run: `npm run build`
Expected: Build succeeds

### Step 5: Commit

```bash
cd C:\Users\I058700\Repo\Voice-First
git add src/components/flashcards/Flashcards.tsx src/components/flashcards/Flashcards.module.css
git commit -m "feat(voice-flashcards): add voice mode with pronunciation scoring"
```

---

## Task 4: Manual verification

### Step 1: Start dev server

```bash
cd C:\Users\I058700\Repo\Voice-First
npm start
```

### Step 2: Verification checklist

1. [ ] Open the app, navigate to a magazine with flashcards
2. [ ] Flashcards display normally (existing functionality intact)
3. [ ] Click the new microphone icon → it turns red with pulse animation
4. [ ] Voice hint appears: "Say the word on the card"
5. [ ] Say a word → recording indicator shows "🎤 Listening..."
6. [ ] Stop speaking → processing indicator shows "Scoring..."
7. [ ] Score appears with stars and feedback text
8. [ ] Card auto-flips to show answer after scoring
9. [ ] Score auto-dismisses after 3 seconds
10. [ ] Click microphone again → voice mode turns off
11. [ ] Existing features still work: click to flip, Read Aloud, Translation, keyboard nav

### Step 3: Fix any issues and commit

```bash
cd C:\Users\I058700\Repo\Voice-First
git add -A
git commit -m "fix(voice-flashcards): address manual testing feedback"
```

---

## Task 5: Merge to main

```bash
cd C:\Users\I058700\Repo\Voice-First
git checkout main
git merge feature/voice-flashcards
git push origin main
```
