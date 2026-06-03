# Shadow Reading: Voice Shadow Reading with AI Scoring (Feature 2)

**Date:** 2026-06-02
**Status:** Draft

## Overview

Enhance the Shadow Reading component with AI-powered pronunciation scoring. After each sentence is read aloud, the child receives a real-time score (0-100), star rating (1-5), and encouraging feedback. Cumulative session score is tracked and displayed via a progress bar, and children can retry sentences to improve their score.

## Problems Solved

1. **No pronunciation feedback** — The current shadow reading component records audio via `WavRecorder` but discards it after playback. Children have no way to know if their pronunciation is correct.
2. **No motivation loop** — Without scoring or progression metrics, there is no gamification hook to encourage repeated practice.
3. **Inconsistent with flashcards** — The flashcards feature already has a full AI scoring pipeline (`useVoiceRecognition` → `RealtimeClient` → `PronunciationScore`). Shadow Reading should offer the same capability.
4. **No session-level progress** — Parents and children cannot see overall performance across an entire story/session.

## Current State

**`ShadowReading.tsx`** (764 lines) provides:
- Sequential sentence playback with auto-pause at next caption boundary
- Two modes: `sequential` (read-along) and `fillBlank` (type-the-blanks)
- Existing voice recording via `WavRecorder` (start/stop/save playback URL)
- Existing toolbar: Repeat, Play/Pause, Fill Blank, Help, My Voice, Next
- Keyboard navigation (Space/Escape) delegated to parent layouts
- Difficulty selector (easy/medium/hard) for fill-blank word selection

**`PronunciationScore.tsx`** (flashcards) provides:
- Overlay component displaying score number, 5-star rating, and feedback text
- Color-coded tiers: great (>=80), good (>=60), fair (>=40), poor (<40)
- Auto-dismiss after configurable timeout
- `popIn` animation on score number

**`useVoiceRecognition.ts`** (flashcards) provides:
- Recording pipeline: `WavRecorder` → `RealtimeClient.appendInputAudio()`
- AI scoring request: sends expected text + audio, receives JSON `{score, feedback, stars}`
- Parses AI response from `conversation.item.completed` event
- `PronunciationResult` interface: `{ score: number; feedback: string; stars: number }`

**Key gap:** Shadow Reading has recording but no scoring integration. The flashcards scoring pipeline exists but is designed for single-word/phrase scoring, not sentence-level with cumulative tracking.

## Design

### Architecture

Reuse and extend the existing flashcards scoring infrastructure. The `useVoiceRecognition` hook is generic enough to work for sentence-level scoring — the only change is the scoring prompt (longer sentences, paragraph-aware feedback).

The AI scoring pipeline flows as:

```
User reads sentence → WavRecorder captures audio → RealtimeClient sends audio + expected text
→ AI scores pronunciation → Response parsed into PronunciationResult → Displayed inline
```

### New State Model

```typescript
// Extends existing mode union
type ShadowReadingMode = 'sequential' | 'fillBlank' | 'scoring';

// Per-sentence score record (stored in session)
interface SentenceScore {
  sentenceIndex: number;
  score: number;          // 0-100
  stars: number;          // 1-5
  feedback: string;       // encouraging message from AI
  correctionHint?: string; // specific pronunciation correction
  attempts: number;       // retry count (1 = first try)
  bestScore: number;      // highest score across attempts
}

// Cumulative session scoring state
interface SessionScoringState {
  scores: SentenceScore[];          // per-sentence results
  cumulativeScore: number;          // average across completed sentences
  totalStars: number;               // sum of all stars earned
  bestPerSentence: Map<number, number>; // best score per sentence index
}
```

### New Mode: `scoring`

After the user records their voice reading a sentence, the component enters `scoring` mode. This mode:

1. Shows a recording indicator with pulsing animation
2. Sends audio to the AI for pronunciation analysis
3. Displays the score overlay inline (not a full-screen overlay like flashcards)
4. Provides action buttons: Retry, Listen, Next

```
sequential mode
  ├─ [Record button click] → enter scoring mode
  ├─ [Fill Blank click] → switch to fillBlank mode (existing)
  ├─ [Space] → advance to next sentence (existing)

scoring mode
  ├─ [AI response received] → display score card
  │   ├─ [Retry click] → re-record (stay in scoring mode, attempt++)
  │   ├─ [Listen click] → play back recorded audio
  │   ├─ [Next click] → save best score, advance to next sentence
  │   └─ [Space] → save best score, advance to next sentence
```

### New Components

#### 1. RecordingButton

Replaces the existing inline recording logic. A large, prominent microphone button that:
- Shows as a pulsing red circle when recording
- Shows as a gray microphone icon when idle
- Has a circular progress ring around it while recording (counts up to 30s max)
- On click: starts recording (reuses existing `WavRecorder` pattern)
- On second click or Space: stops recording and submits for scoring

**Positioning:** Appears in the toolbar when a sentence is in "waiting" state (audio finished playing), replacing the existing "Fill Blank" button slot.

#### 2. ScoreCard (inline, not overlay)

A compact score display that appears below the active sentence after AI scoring completes. Unlike the flashcards `PronunciationScore` overlay (which covers the entire card), this renders inline to preserve context.

```
┌─────────────────────────────────────────────┐
│  Sentence text is here...                    │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  ★★★★☆    85 / 100                  │   │
│  │  Great pronunciation! The "th"       │   │
│  │  sounds were very clear.             │   │
│  │                                      │   │
│  │  🎤 Retry   🔊 Listen   Next →      │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Score display:**
- Large score number (4rem), color-coded by tier
- 5-star row below the score (gold for earned, gray for unearned)
- Feedback text in one line
- Correction hint (if available) in a separate line with lighter color

**Action buttons:**
- **Retry** (microphone icon): Clears current score, re-enters recording state. Increments attempt counter.
- **Listen** (volume icon): Plays back the recorded audio via existing `playRecording` logic.
- **Next** (arrow): Saves the best score for this sentence to session state, advances to next sentence.

#### 3. SessionProgressBar

A horizontal progress bar at the top of the component, below the header. Shows cumulative session performance.

```
┌─────────────────────────────────────────────────┐
│ Shadow Reading / 影子跟读                        │
│ ┌─ Session: 72/100  ★ 18   [████████░░] 4/8 ─┐│
│ │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░ ││
│ └───────────────────────────────────────────────┘│
│                                                  │
│ Sentence 1 (past, faded)                         │
│ Sentence 2 (active, bold)                        │
│ ...                                              │
└─────────────────────────────────────────────────┘
```

**Components:**
- **Left segment:** Average score across all scored sentences (e.g., "72/100")
- **Center segment:** Total stars earned (e.g., "★ 18")
- **Right segment:** Sentences completed / total (e.g., "4/8")
- **Bar:** Filled proportionally to sentences scored, color transitions from green to gold based on average score

**Color thresholds:**
- Average >= 80: gold (#FFD700) fill
- Average >= 60: green (#4CAF50) fill
- Average >= 40: amber (#FF9800) fill
- Average < 40: red (#f44336) fill

### Cumulative Score Tracking

A `useReducer` manages session scoring state:

```typescript
type ScoreAction =
  | { type: 'SCORE_SUBMITTED'; sentenceIndex: number; result: PronunciationResult }
  | { type: 'RETRY'; sentenceIndex: number }
  | { type: 'RESET' };

function scoreReducer(state: SessionScoreState, action: ScoreAction): SessionScoreState {
  // SCORE_SUBMITTED: update best score per sentence, recompute averages
  // RETRY: clear current sentence result, allow re-score
  // RESET: clear all session scores
}
```

**Rules:**
- Each sentence can be scored multiple times (retry). Only the **best score** counts toward session average.
- `bestPerSentence` tracks highest score per sentence index.
- Session average = `mean(bestPerSentence.values())` for scored sentences only.
- Session star total = sum of stars from best scores.

### Visual Design

**Score Card (inline):**
- Semi-transparent dark background: `rgba(255, 255, 255, 0.08)`
- Rounded border: `12px`
- Padding: `16px 20px`
- Fade-in animation: `opacity 0 → 1, translateY 10px → 0` over 300ms
- Score number: `3rem` font (smaller than flashcards' 4rem to fit inline)
- Star row: `1.5rem` font, gold `#FFD700` active stars, `#555` inactive
- Feedback text: `1rem`, white with 90% opacity
- Correction hint: `0.85rem`, white with 60% opacity, italic

**Recording Button (in toolbar):**
- 40px circular button
- Idle: gray background `rgba(255,255,255,0.15)`, white mic icon
- Recording: red background `rgba(244,67,54,0.3)`, pulsing border animation
- Hover: slightly brighter background

**Session Progress Bar:**
- Height: `6px`, full width of scroll area
- Background: `rgba(255,255,255,0.08)`
- Fill: gradient from left, color based on average score
- Text: `0.8em`, muted white, positioned above the bar
- Appears only after first sentence is scored

**Score Number Color Tiers:**
- >= 80: `#4CAF50` (green)
- >= 60: `#FFC107` (amber)
- >= 40: `#FF9800` (orange)
- < 40: `#f44336` (red)

### AI Scoring Prompt

The scoring prompt sent to the RealtimeClient is adapted from the flashcards version for sentence-level scoring:

```
Pronunciation scoring task. The expected sentence is: "{expectedText}".

The child just read this sentence aloud. Score their pronunciation accuracy from 0-100.

Criteria:
- Overall fluency and rhythm (25%)
- Individual word pronunciation (35%)
- Stress and intonation patterns (20%)
- Clarity and intelligibility (20%)

Reply with JSON only:
{
  "score": <number 0-100>,
  "feedback": "<short encouraging message, max 20 words>",
  "stars": <1-5>,
  "correctionHint": "<specific word or sound to practice, or null>"
}
```

**Star mapping (fallback if AI omits stars):**
- >= 90: 5 stars
- >= 75: 4 stars
- >= 60: 3 stars
- >= 40: 2 stars
- < 40: 1 star

### Retry Flow

When the child taps "Retry":
1. `attempts` counter increments for current sentence
2. Previous score for this sentence is cleared from display (but best is retained in session state)
3. Recording indicator reappears — child re-records
4. New score replaces display (if better than previous best, session updates)
5. No limit on retries — child can practice until satisfied
6. Attempt count shown as small badge: "Attempt 2" / "Attempt 3"

### Sentence Progress Indicators

Sentences in the scroll area gain visual feedback after scoring:

- **Unscored (past):** Existing faded opacity (0.35)
- **Scored (past):** Small star badge (★ 85) appended after the sentence text, color-coded by tier
- **Active:** Current sentence, bold, full opacity
- **Future:** Dimmed, 0.4 opacity (unchanged)

This gives a visual "trail" of accomplishments as the child progresses.

### Props Interface Changes

```typescript
interface ShadowReadingProps {
  audioCaptions: Array<{ time: number; text: string }>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  playbackRate: number;
  isActive: boolean;
  onExit: () => void;
  advanceRef: React.MutableRefObject<(() => void) | null>;
  prevRef?: React.MutableRefObject<(() => void) | null>;
  nextRef?: React.MutableRefObject<(() => void) | null>;
  // NEW: AI scoring integration
  realtimeClient?: RealtimeClient;           // optional — scoring disabled if absent
  enableScoring?: boolean;                    // default true, toggle scoring feature
}
```

**Graceful degradation:** If `realtimeClient` is not provided, the recording button still appears but records locally only (existing behavior). The score card and progress bar are hidden. This preserves backward compatibility.

### Keyboard Behavior

**scoring mode:**
- **Space** → Stop recording (if recording) / Submit score (if processed) / Advance to next sentence (if score displayed)
- **Escape** → Cancel recording, exit scoring mode, stay on current sentence
- **R** → Retry (when score is displayed)
- **L** → Listen to recording (when score is displayed)

### Files Changed

| File | Change |
|------|--------|
| `src/components/shadow-reading/ShadowReading.tsx` | Add scoring mode, score state, AI integration, ScoreCard rendering, Progress bar, Retry flow |
| `src/components/shadow-reading/ShadowReading.module.css` | Add styles for ScoreCard, Progress Bar, Recording Button, Score Indicators on sentences |
| `src/components/flashcards/useVoiceRecognition.ts` | Extract `PronunciationResult` type to shared types file (optional refactor) |

### Files Created

| File | Purpose |
|------|---------|
| `src/components/shadow-reading/ScoreCard.tsx` | Standalone score display component (score, stars, feedback, actions) |
| `src/components/shadow-reading/ScoreCard.module.css` | Styles for ScoreCard |
| `src/components/shadow-reading/SessionProgressBar.tsx` | Cumulative session progress bar |
| `src/components/shadow-reading/SessionProgressBar.module.css` | Styles for progress bar |
| `src/components/shadow-reading/useSessionScoring.ts` | Custom hook managing session score state (reducer pattern) |

### No Changes To

- Parent layouts (DesktopLayout, TabletLayout) — no API changes
- Keyboard event handling in parent — Space/Escape still work the same
- `RealtimeClient` — reused as-is, no modifications needed
- `WavRecorder` — reused as-is for audio capture
- Existing fill-blank mode — unaffected
- `PronunciationScore.tsx` (flashcards) — not modified; Shadow Reading has its own inline ScoreCard

## Out of Scope

- **Pronunciation coaching / phoneme-level feedback** — The AI provides a single score and a brief hint, not a detailed phonetic breakdown per phoneme.
- **Session persistence / history** — Scores are in-memory only for the current session. No localStorage or backend persistence.
- **Leaderboards or social comparison** — No multi-user or competitive features.
- **Custom scoring criteria** — The scoring criteria (fluency, pronunciation, stress, clarity) are fixed in the prompt. No user/parent configurability.
- **Offline scoring** — AI scoring requires the RealtimeClient connection. No local/fallback scoring model.
- **Sentence-level audio normalization** — No volume normalization or noise reduction before scoring. The raw WavRecorder output is sent as-is.
- **Scoring for fill-blank mode** — Fill-blank already has its own success criteria (typing accuracy). AI scoring is only for the sequential/read-aloud mode.
- **Multiple language support** — English-only scoring prompt. No Mandarin or bilingual scoring.
