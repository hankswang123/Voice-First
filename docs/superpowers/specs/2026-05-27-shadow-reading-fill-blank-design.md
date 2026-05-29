# Shadow Reading: Repeat & Fill-in-the-Blank Feature

**Date:** 2026-05-27
**Status:** Approved

## Overview

Enhance the Shadow Reading feature with two new capabilities:
1. **Repeat sentence** - replay the current sentence on demand
2. **Fill-in-the-blank mode** - blank out random words for typing practice with per-letter validation

## Current State

`ShadowReading.tsx` (294 lines) handles sequential sentence playback, auto-pause, word dictionary lookup, and keyboard navigation via `advanceRef`. Keyboard events (Space/Escape) are handled by parent layouts (DesktopLayout/TabletLayout).

## Design

### New Sub-Components

#### 1. SentenceToolbar (inline in ShadowReading)

Floating toolbar that appears near the active sentence when the user is in "waiting" state (sentence finished playing, waiting for Space to advance).

**Controls:**
- **Repeat button** (icon: circular arrow) - replays current sentence audio
- **Fill Blank button** (icon: pencil/edit) - enters fill-in-the-blank mode for current sentence

**Positioning:** Appears below the active sentence, centered horizontally.

#### 2. FillBlankSentence (inline in ShadowReading)

Replaces the normal sentence display when in fill-in-the-blank mode.

**Behavior:**
- Displays the sentence with N words blanked out (randomly selected)
- Each blanked word becomes a row of per-letter `<input>` elements (one per character)
- Live character-by-character validation:
  - Correct letter → green background, auto-focus next input
  - Wrong letter → red background with X indicator
  - Backspace → move to previous input
- Case-insensitive comparison
- When ALL blanks are correctly filled:
  - Green checkmark animation (1.5s)
  - Auto-advance to next sentence

### State Model

```
Mode: 'sequential' | 'fillBlank'
```

- `sequential` (default): Existing behavior - play sentence, pause, Space to advance
- `fillBlank`: Current sentence is displayed with blanked words, user types to fill

### Transitions

```
sequential mode
  ├─ [Repeat click] → replay audio, stay sequential
  ├─ [Fill Blank click] → switch to fillBlank mode
  └─ [Space] → advance to next sentence (existing)

fillBlank mode
  ├─ [All blanks correct] → green checkmark → auto-advance to next sentence
  ├─ [Repeat click] → replay audio, stay in fillBlank mode
  └─ [Space] → exit fillBlank, advance to next sentence
```

### Word Blanking Algorithm

```typescript
function selectWordsToBlank(sentence: string): {
  blankedIndices: Set<number>;
  words: string[];
} {
  const words = sentence.split(/\s+/);
  // Filter out short words (<= 2 chars: a, I, an, is, of, etc.)
  const eligible = words
    .map((w, i) => ({ word: w, index: i }))
    .filter(({ word }) => word.replace(/[^a-zA-Z]/g, '').length > 2);

  // Blank count: 40% of eligible words, min 1, max 10
  const blankCount = Math.min(
    eligible.length,
    Math.max(1, Math.floor(eligible.length * 0.4))
  );

  // Randomly select which eligible words to blank
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const blankedIndices = new Set(shuffled.slice(0, blankCount).map(e => e.index));

  return { blankedIndices, words };
}
```

### Per-Letter Input Design

For a blanked word like "Hello":

```
[H] [e] [l] [l] [o]
```

- Each input is a single character, auto-focused on the next after typing
- Backspace on empty input moves focus to previous
- When a letter is typed:
  - If correct (case-insensitive): input gets green border
  - If wrong: input gets red border + small X below
- When the entire word is correct: all inputs get green background
- When ALL blanked words are fully correct: success animation triggers

### Visual Design

**Floating Toolbar:**
- Positioned below active sentence, centered
- Semi-transparent dark background (`rgba(255,255,255,0.1)`)
- Two icon buttons with hover highlight
- Appears with fade-in animation

**Blank Inputs:**
- Single-character inputs with consistent width (~24px)
- Border: 2px solid `rgba(255,255,255,0.3)` (default)
- Correct: 2px solid `#4CAF50` (green), background `rgba(76,175,80,0.15)`
- Wrong: 2px solid `#f44336` (red), background `rgba(244,67,54,0.15)`
- X indicator: small red `×` below wrong inputs

**Success Animation:**
- Green checkmark fades in over the sentence
- 1.5 second hold, then auto-advance

### Keyboard Behavior in fillBlank Mode

- **Tab**: Move focus to next blank input (browser default)
- **Space**: Exit fillBlank mode, advance to next sentence
- **Escape**: Exit fillBlank mode, exit shadow reading entirely (existing)
- **Any letter key**: Type into focused input (handled by input element)

### Files Changed

- `src/components/shadow-reading/ShadowReading.tsx` - Add state, toolbar, fill-blank rendering
- `src/components/shadow-reading/ShadowReading.module.css` - Add styles for toolbar, inputs, validation, animation

### No Changes To

- Parent layouts (DesktopLayout, TabletLayout) - no API changes
- Keyboard event handling in parent - Space/Escape still work the same
- Word dictionary lookup - remains functional in both modes

## Out of Scope

- Hints or "reveal letter" assistance
- Score tracking or progress persistence
- Difficulty levels (word selection ratio)
- Audio for individual words (only full sentence replay)
