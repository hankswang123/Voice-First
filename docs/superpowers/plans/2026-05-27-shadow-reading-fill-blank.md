# Shadow Reading: Repeat & Fill-in-the-Blank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeat sentence and fill-in-the-blank typing practice modes to the Shadow Reading feature.

**Architecture:** Extend the existing `ShadowReading` component with a mode state (`sequential` | `fillBlank`), a floating toolbar for mode controls, and a fill-blank rendering path with per-letter input validation. Two files change: `ShadowReading.tsx` (logic + rendering) and `ShadowReading.module.css` (styles). No parent layout changes.

**Tech Stack:** React (hooks), TypeScript, CSS Modules

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/shadow-reading/ShadowReading.tsx` | Modify | Add mode state, word blanking algorithm, toolbar rendering, fill-blank sentence rendering, validation logic, auto-advance |
| `src/components/shadow-reading/ShadowReading.module.css` | Modify | Add styles for toolbar, blank inputs, validation states, success animation |

---

### Task 1: Add CSS styles for toolbar, blank inputs, validation, and success animation

**Files:**
- Modify: `src/components/shadow-reading/ShadowReading.module.css`

- [ ] **Step 1: Add floating toolbar styles**

Append to `ShadowReading.module.css` after the existing `.sentence.past` rule:

```css
/* Floating toolbar */
.toolbar {
  display: flex;
  gap: 8px;
  justify-content: center;
  padding: 8px 0;
  animation: fadeIn 0.15s ease-out;
}

.toolbarBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.95em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbarBtn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.35);
}

.toolbarBtn:active {
  transform: scale(0.96);
}

.toolbarBtn.active {
  background: rgba(124, 158, 255, 0.2);
  border-color: #7c9eff;
  color: #7c9eff;
}

/* Fill-blank sentence */
.fillBlankContainer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 4px;
  line-height: 2.8;
  position: relative;
}

.fillBlankWord {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.fillBlankInput {
  width: 24px;
  height: 32px;
  text-align: center;
  font-size: 1em;
  font-family: inherit;
  font-weight: 700;
  background: transparent;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: #ffffff;
  outline: none;
  transition: all 0.15s ease;
  padding: 0;
  text-transform: lowercase;
}

.fillBlankInput:focus {
  border-color: #7c9eff;
  box-shadow: 0 0 0 2px rgba(124, 158, 255, 0.25);
}

.fillBlankInput.correct {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.15);
}

.fillBlankInput.wrong {
  border-color: #f44336;
  background: rgba(244, 67, 54, 0.15);
}

.fillBlankWrongX {
  color: #f44336;
  font-size: 0.7em;
  margin-top: 2px;
  text-align: center;
  line-height: 1;
  height: 12px;
}

.fillBlankStatic {
  color: rgba(255, 255, 255, 0.7);
}

/* Word completed correctly */
.fillBlankWord.correct .fillBlankInput {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.15);
}

/* Success overlay */
.successOverlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 26, 46, 0.7);
  border-radius: 8px;
  animation: fadeIn 0.2s ease-out;
  z-index: 10;
}

.successCheck {
  font-size: 3em;
  color: #4CAF50;
  animation: popIn 0.3s ease-out;
}

@keyframes popIn {
  0% { transform: scale(0.3); opacity: 0; }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
```

- [ ] **Step 2: Commit CSS**

```bash
git add src/components/shadow-reading/ShadowReading.module.css
git commit -m "style(shadow-reading): add CSS for toolbar, fill-blank inputs, validation, and success animation"
```

---

### Task 2: Add mode state and word blanking algorithm to ShadowReading

**Files:**
- Modify: `src/components/shadow-reading/ShadowReading.tsx`

- [ ] **Step 1: Add `selectWordsToBlank` helper function**

Add this function at the top of `ShadowReading.tsx`, after the imports and before the component:

```typescript
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
```

- [ ] **Step 2: Add mode state and blank word data to component**

Inside the `ShadowReading` component, after the existing state declarations (after `activeItemRef`), add:

```typescript
  const [mode, setMode] = useState<'sequential' | 'fillBlank'>('sequential');
  const [blankData, setBlankData] = useState<{
    blankedIndices: Set<number>;
    words: string[];
  } | null>(null);
  const [blankInputs, setBlankInputs] = useState<Map<number, string[]>>(new Map());
  const [blankValidation, setBlankValidation] = useState<Map<number, ('correct' | 'wrong' | 'empty')[]>>(new Map());
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 3: Add import for `useState` if not already imported**

Check the import line. Current imports are:

```typescript
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
```

Add `useState` to the import:

```typescript
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
```

- [ ] **Step 4: Add `replaySentence` callback**

After the `advanceNext` callback definition, add:

```typescript
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
```

- [ ] **Step 5: Add `enterFillBlank` callback**

After `replaySentence`, add:

```typescript
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
```

- [ ] **Step 6: Add `exitFillBlank` callback**

After `enterFillBlank`, add:

```typescript
  const exitFillBlank = useCallback(() => {
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
```

- [ ] **Step 7: Clean up success timer on unmount**

In the existing `useEffect` that runs on `isActive` change (the one at the bottom that resets `currentIndexRef`), update the cleanup to also clear the success timer:

Find the existing cleanup:
```typescript
    return () => {
      clearAutoPause();
    };
```

Replace with:
```typescript
    return () => {
      clearAutoPause();
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
```

- [ ] **Step 8: Reset mode when advancing to next sentence**

Update the `startSentence` callback to also exit fill-blank mode. Find the existing `startSentence` callback and add `exitFillBlank()` as the first line inside it:

Current:
```typescript
  const startSentence = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || index >= englishCaptions.length) return;

    clearAutoPause();
```

New:
```typescript
  const startSentence = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || index >= englishCaptions.length) return;

    exitFillBlank();
    clearAutoPause();
```

And add `exitFillBlank` to the dependency array of `startSentence`:

```typescript
  }, [audioRef, englishCaptions, playbackRate, clearAutoPause, exitFillBlank]);
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `cd "C:\Users\I058700\Repo\Voice-First\.claude\worktrees\feature+shadow-reading-fill-blank" && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`

Expected: No errors (or only pre-existing errors unrelated to our changes).

- [ ] **Step 10: Commit**

```bash
git add src/components/shadow-reading/ShadowReading.tsx
git commit -m "feat(shadow-reading): add mode state, word blanking algorithm, and replay/enter-fill-blank callbacks"
```

---

### Task 3: Add fill-blank validation logic

**Files:**
- Modify: `src/components/shadow-reading/ShadowReading.tsx`

- [ ] **Step 1: Add `handleLetterInput` callback**

After the `exitFillBlank` callback, add:

```typescript
  const handleLetterInput = useCallback((
    wordIndex: number,
    charIndex: number,
    value: string,
    inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>
  ) => {
    if (!blankData) return;

    const word = blankData.words[wordIndex];
    const cleanWord = word.replace(/[^a-zA-Z'-]/g, '');
    const letter = value.toLowerCase().slice(-1); // take last char for safety

    setBlankInputs(prev => {
      const next = new Map(prev);
      const arr = [...(next.get(wordIndex) || [])];
      arr[charIndex] = letter;
      next.set(wordIndex, arr);

      // Check if this word is now fully correct
      const isWordCorrect = arr.every((ch, i) =>
        ch.toLowerCase() === cleanWord[i].toLowerCase()
      );

      if (isWordCorrect) {
        setBlankValidation(prevVal => {
          const vNext = new Map(prevVal);
          vNext.set(wordIndex, arr.map(() => 'correct' as const));
          return vNext;
        });

        // Check if ALL words are correct
        const allCorrect = blankData.blankedIndices.every(idx => {
          if (idx === wordIndex) return true; // this one just completed
          const w = blankData.words[idx].replace(/[^a-zA-Z'-]/g, '');
          const inputs = next.get(idx) || [];
          return inputs.every((ch, i) => ch.toLowerCase() === w[i].toLowerCase());
        });

        if (allCorrect) {
          setShowSuccess(true);
          successTimerRef.current = setTimeout(() => {
            advanceNext();
          }, 1500);
        }
      } else {
        // Update per-character validation
        setBlankValidation(prevVal => {
          const vNext = new Map(prevVal);
          vNext.set(wordIndex, arr.map((ch, i) => {
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
    }
  }, [blankData, advanceNext]);
```

- [ ] **Step 2: Add `handleLetterKeydown` callback**

After `handleLetterInput`, add:

```typescript
  const handleLetterKeydown = useCallback((
    wordIndex: number,
    charIndex: number,
    e: React.KeyboardEvent,
    inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>
  ) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const currentInputs = blankInputs.get(wordIndex) || [];
      if (!currentInputs[charIndex] && charIndex > 0) {
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
    } else if (e.key === ' ') {
      // Space in fill-blank mode: exit and advance
      e.preventDefault();
      exitFillBlank();
      advanceNext();
    }
  }, [blankInputs, exitFillBlank, advanceNext]);
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shadow-reading/ShadowReading.tsx
git commit -m "feat(shadow-reading): add letter input validation and backspace/space handling for fill-blank mode"
```

---

### Task 4: Add toolbar and fill-blank rendering to JSX

**Files:**
- Modify: `src/components/shadow-reading/ShadowReading.tsx`

- [ ] **Step 1: Replace the render section**

The current render section (from `if (!isActive) return null;` to the end) needs to be replaced. Find the existing JSX return block starting at line 161 (`if (!isActive) return null;`) and replace the entire return block with:

```tsx
  if (!isActive) return null;

  const currentCaption = englishCaptions[displayIndex];
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
                {words.map((word, wi) => (
                  <span key={wi} className={styles.fillBlankWord}>
                    {blankData.blankedIndices.has(wi) ? (
                      (() => {
                        const clean = word.replace(/[^a-zA-Z'-]/g, '');
                        const letterInputs = blankInputs.get(wi) || [];
                        const validation = blankValidation.get(wi) || [];
                        const wordCorrect = validation.length > 0 && validation.every(v => v === 'correct');
                        return (
                          <span className={`${styles.fillBlankWord} ${wordCorrect ? 'correct' : ''}`}>
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
                      })()
                    ) : (
                      <span className={styles.fillBlankStatic}>{word}</span>
                    )}
                    {' '}
                  </span>
                ))}
                {showSuccess && (
                  <div className={styles.successOverlay}>
                    <span className={styles.successCheck}>{'✓'}</span>
                  </div>
                )}
              </div>
            ) : (
              caption.text
            )}
            {i === displayIndex && isWaiting && !isFillBlankMode && (
              <div className={styles.toolbar}>
                <button className={styles.toolbarBtn} onClick={replaySentence}>
                  {'↻'} Repeat
                </button>
                <button className={styles.toolbarBtn} onClick={enterFillBlank}>
                  {'✎'} Fill Blank
                </button>
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
```

- [ ] **Step 2: Add `inputRefsMap` ref**

Inside the component, after the `activeItemRef` declaration, add:

```typescript
  const inputRefsMap = useRef<Map<string, HTMLInputElement>>(new Map());
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd "C:\Users\I058700\Repo\Voice-First\.claude\worktrees\feature+shadow-reading-fill-blank" && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`

Expected: No new errors.

- [ ] **Step 4: Build to verify no runtime issues**

Run: `cd "C:\Users\I058700\Repo\Voice-First\.claude\worktrees\feature+shadow-reading-fill-blank" && npm run build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/shadow-reading/ShadowReading.tsx
git commit -m "feat(shadow-reading): render floating toolbar and fill-blank sentence view with per-letter inputs"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server and test**

Run: `cd "C:\Users\I058700\Repo\Voice-First\.claude\worktrees\feature+shadow-reading-fill-blank" && npm start`

Open `http://localhost:3000`, load a magazine with audio scripts, and verify:

1. **Sequential mode unchanged**: Shadow Reading opens, sentences play one by one, Space advances, Escape exits
2. **Toolbar appears**: After a sentence finishes playing, the floating toolbar with "Repeat" and "Fill Blank" buttons appears below the active sentence
3. **Repeat works**: Click Repeat → current sentence replays from the beginning
4. **Fill Blank mode**: Click Fill Blank → sentence shows with some words blanked out, each blanked word shows per-letter inputs
5. **Letter validation**: Type a correct letter → green border. Type a wrong letter → red border with red X below
6. **Auto-focus**: After typing a letter, focus moves to next input in the same word
7. **Backspace**: On empty input, backspace moves to previous input
8. **Space exits fill-blank**: Pressing Space in fill-blank mode exits and advances to next sentence
9. **Success animation**: Fill all blanks correctly → green checkmark appears → auto-advances after 1.5s
10. **Dictionary lookup**: Still works in sequential mode (select a word with mouse)

- [ ] **Step 2: Commit any fixes if needed**

If manual testing reveals issues, fix and commit.
