# Feature 4: Voice Role-Playing (语音角色扮演)

**Date:** 2026-06-02
**Status:** Draft
**Scope:** Voice-driven conversation scenarios where the child plays a character and the AI plays the other, with hints, pronunciation feedback, difficulty levels, and completion summaries.

---

## 1. Overview

Add a **voice role-playing** mode to Voice-First. The child picks a scenario (e.g., ordering at a restaurant, asking for directions), selects which character they want to play, and then has a natural spoken conversation with the AI, who plays the other character. The system provides hints when the child gets stuck, gives inline pronunciation feedback, supports multiple difficulty levels, and produces a summary with score and new vocabulary when the scenario ends.

### Goals
- Scenario-based conversation: restaurant, store, doctor, airport, etc.
- Character selection: child picks their role; AI plays the counterpart
- Natural back-and-forth voice conversation via the existing OpenAI Realtime API
- Hint system: suggested phrases appear when the child is stuck
- Pronunciation feedback: inline corrections during conversation
- Three difficulty levels: beginner (simple phrases), intermediate (full sentences), advanced (free conversation)
- Scenario completion: summary of phrases used, score, and new vocabulary
- Visual: character avatars, speech bubbles, hint cards

### Non-Goals (for now)
- Multi-party role-play (more than 2 participants)
- Custom scenario creation by the user
- Role-play scoring that persists across sessions (scores are local per-session)
- Pre-recorded audio for character voices (AI generates voice in real-time)

---

## 2. Problems Solved

| Problem | How This Feature Addresses It |
|---------|-------------------------------|
| Children know isolated words but cannot use them in context | Role-play forces real conversational use of vocabulary |
| No safe space to practice "real-world" English interactions | Scenarios simulate restaurant, store, doctor visits, etc. |
| Children freeze when they don't know what to say | Hint system suggests phrases; difficulty levels reduce pressure |
| Pronunciation practice is disconnected from meaning | Pronunciation feedback happens within meaningful dialogue |
| Children lack motivation to practice conversation | Gamification: scores, star ratings, completion summaries |
| Parents/teachers cannot see what the child practiced | Completion summary shows phrases used, score, and new vocabulary |

---

## 3. Current State

### Existing Architecture
- **`RealtimeClient`** (vendored OpenAI Realtime API library) handles voice I/O via WebRTC
- **`WavRecorder`** captures microphone audio; **`WavStreamPlayer`** plays AI audio
- **`Chat.tsx`** displays conversation messages (user/assistant/audio roles) with markdown rendering
- **`Flashcards.tsx`** is a superpower component displayed in a `popupOverlay` div inside `DesktopLayout.tsx`
- **`ShadowReading.tsx`** is another superpower in the same popup overlay pattern
- **`useVoiceRecognition.ts`** hook wraps WavRecorder + RealtimeClient for recording and AI-based scoring
- **`PronunciationScore.tsx`** renders score overlay (0-100 + stars + feedback)
- **`ConsolePage.tsx`** / **`DesktopLayout.tsx`** owns the RealtimeClient, WavRecorder, WavStreamPlayer refs and orchestrates superpowers
- Toolbar at bottom of layout has icon buttons for Flashcards, Shadow Reading, etc.
- `client.updateSession({ instructions })` dynamically changes the AI's system prompt

### Key Pattern: Superpower Integration
Each superpower follows this integration pattern:
1. A toggle button in the toolbar (`toggleFlashcards`, `toggleShadowReading`)
2. A container `<div>` inside `#popupOverlay` with `display: none` by default
3. The toggle function shows/hides the container and the overlay
4. The component receives `realtimeClient` as a prop for voice interaction
5. Components are mutually exclusive (showing one hides others)

### Existing Realtime API Integration
- `realtimeClient.sendUserMessageContent([{ type: 'input_text', text: ... }])` sends text
- `realtimeClient.sendUserMessageContent([{ type: 'input_image', image_url: ... }])` sends images
- `realtimeClient.on('conversation.item.completed', handler)` listens for AI responses
- `client.updateSession({ instructions })` changes AI personality/behavior
- `wavRecorderRef.current.begin()` / `.record()` / `.pause()` for microphone capture
- `wavStreamPlayerRef.current.add16BitPCM(pcm)` for playing audio

---

## 4. Design

### 4.1 Scenario Data Model

```typescript
interface RolePlayScenario {
  id: string;                        // e.g. 'restaurant', 'airport'
  name: string;                      // Display name: 'Restaurant'
  nameCn: string;                    // Chinese name: '餐厅'
  icon: string;                      // Emoji or icon identifier
  description: string;               // Brief description of the scenario
  descriptionCn: string;             // Chinese description
  characters: RolePlayCharacter[];   // Available roles (always 2)
  difficultyTemplates: {
    beginner: string;                // AI system prompt for beginner level
    intermediate: string;            // AI system prompt for intermediate level
    advanced: string;                // AI system prompt for advanced level
  };
  hints: HintGroup[];               // Suggested phrases grouped by conversation stage
  completionCriteria: CompletionCriteria;
}

interface RolePlayCharacter {
  id: string;                        // e.g. 'customer', 'waiter'
  name: string;                      // Display name
  nameCn: string;                    // Chinese name
  avatar: string;                    // Emoji or SVG path
  description: string;               // Who this character is
}

interface HintGroup {
  stage: string;                     // e.g. 'ordering', 'paying'
  phrases: HintPhrase[];
}

interface HintPhrase {
  english: string;                   // "I'd like a hamburger, please."
  chinese: string;                   // "我想要一个汉堡，谢谢。"
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

interface CompletionCriteria {
  minTurns: number;                  // Minimum conversation turns to complete
  suggestedVocab: string[];          // Key vocabulary to include
}

interface RolePlayState {
  scenario: RolePlayScenario | null;
  selectedCharacter: RolePlayCharacter | null;
  aiCharacter: RolePlayCharacter | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  phase: RolePlayPhase;
  conversationHistory: RolePlayMessage[];
  hintsUsed: number;
  turnsCompleted: number;
  pronunciationScores: number[];
  newVocabulary: string[];
  startTime: number;
}

type RolePlayPhase =
  | 'select-scenario'      // Browse and pick a scenario
  | 'select-character'     // Pick which character to play
  | 'select-difficulty'    // Choose difficulty level
  | 'intro'               // AI introduces the scenario
  | 'conversation'         // Active role-play conversation
  | 'hint-shown'          // A hint card is displayed (temporary)
  | 'summary'             // Scenario completed, show results
  | 'paused';             // User paused the conversation

interface RolePlayMessage {
  role: 'user' | 'ai';
  character: string;                   // Character name
  text: string;                        // Transcript
  timestamp: number;
  pronunciationScore?: number;         // 0-100, only for user messages
  correction?: string;                 // Pronunciation correction text
}
```

### 4.2 Predefined Scenarios

| ID | Name | Characters | Setting |
|----|------|-----------|---------|
| `restaurant` | Restaurant | Customer / Waiter | Ordering food at a restaurant |
| `store` | Store | Shopper / Cashier | Buying items at a shop |
| `doctor` | Doctor | Patient / Doctor | Visiting the doctor |
| `airport` | Airport | Traveler / Agent | Checking in at the airport |
| `school` | School | Student / Teacher | First day at school |
| `park` | Park | Child / Park Ranger | Asking about park activities |

Each scenario ships with:
- 2 character definitions with avatars
- 3 difficulty-level system prompts (beginner/intermediate/advanced)
- 3-4 hint groups with 3-5 phrases each, per difficulty level
- Suggested vocabulary list

### 4.3 State Transitions

```
[select-scenario] ──click scenario──→ [select-character]
[select-character] ──click character──→ [select-difficulty]
[select-difficulty] ──click level──→ [intro]
[intro] ──AI finishes intro──→ [conversation]
[conversation] ──child speaks──→ [conversation] (with pronunciation feedback)
[conversation] ──child taps hint──→ [hint-shown]
[hint-shown] ──child taps phrase or dismiss──→ [conversation]
[conversation] ──scenario complete / child ends──→ [summary]
[summary] ──click "Play Again"──→ [select-scenario]
[summary] ──click "Done"──→ close overlay
[conversation] ──click pause──→ [paused]
[paused] ──click resume──→ [conversation]
[any phase] ──click close──→ close overlay (resets state)
```

### 4.4 System Prompt Engineering

When a scenario starts, the AI's session instructions are updated to adopt the character:

```typescript
const buildRolePlayPrompt = (scenario: RolePlayScenario, character: RolePlayCharacter, difficulty: string): string => {
  return `You are playing the role of "${character.name}" (${character.description}) in a ${scenario.name} scenario.

${scenario.difficultyTemplates[difficulty]}

RULES:
- Stay in character at all times
- Use simple, clear English appropriate for a child learner
- Respond naturally to what the child says
- If the child makes a grammar mistake, gently correct them in your next response
- Keep responses short (1-3 sentences) to keep the conversation flowing
- If the child seems stuck, ask a simple question to help them continue
- End the conversation naturally after about 8-10 exchanges

IMPORTANT: Do NOT break character. Do NOT say you are an AI. You ARE the ${character.name}.`;
};
```

### 4.5 Hint System

Hints are context-aware. The system tracks which "stage" of the conversation we're in (based on turn count and keywords) and shows relevant phrases.

```typescript
// When child taps the hint button:
const getRelevantHints = (state: RolePlayState): HintPhrase[] => {
  const scenario = state.scenario;
  const stage = detectConversationStage(state);
  const relevantGroup = scenario.hints.find(h => h.stage === stage);
  
  return relevantGroup?.phrases
    .filter(p => p.difficulty === state.difficulty || 
                 (state.difficulty === 'intermediate' && p.difficulty === 'beginner') ||
                 state.difficulty === 'advanced')
    ?? [];
};
```

**Hint card behavior:**
- Tapping a hint phrase inserts it as the child's next spoken message (via `realtimeClient.sendUserMessageContent`)
- The phrase is also displayed in the chat as a "hint message" with a distinct visual style
- Hints used are counted and shown in the summary

### 4.6 Pronunciation Feedback

During conversation, after each child utterance, the AI provides gentle pronunciation correction as part of its natural response. This is achieved through the system prompt rather than a separate scoring step:

```
When you hear the child speak, if there is a significant pronunciation error,
naturally correct it in your response. For example:
- Child: "I want a hambager"
- You: "A hamburger? Great choice! Would you like fries with that?"

If pronunciation is good, just respond naturally without correction.
```

Additionally, a post-turn analysis is performed (similar to `useVoiceRecognition`) to provide a numerical score:

```typescript
// After each AI response in conversation mode:
const analyzeTurn = async (childSpeech: string, expectedContext: string) => {
  realtimeClient.sendUserMessageContent([{
    type: 'input_text',
    text: `Quick pronunciation analysis. The child said: "${childSpeech}" in the context of: "${expectedContext}".
Reply with JSON only: {"score": <0-100>, "correction": "<if needed, the correct pronunciation. otherwise empty>"}`
  }]);
};
```

The score and correction are displayed inline as a small badge below the user's speech bubble.

### 4.7 Difficulty Levels

| Level | Vocabulary | Sentence Length | AI Behavior |
|-------|-----------|----------------|-------------|
| **Beginner** (简单) | Single words and very short phrases | 3-6 words | AI speaks slowly, uses simple words, provides more hints, repeats key phrases |
| **Intermediate** (进阶) | Common phrases and simple sentences | 5-12 words | AI speaks at normal pace, expects full sentences, fewer hints |
| **Advanced** (挑战) | Full vocabulary, idiomatic expressions | Any length | AI speaks naturally, expects free conversation, minimal hints |

### 4.8 Completion & Summary

When the conversation reaches the target number of turns (or the child taps "End Scenario"):

```typescript
interface RolePlaySummary {
  scenarioName: string;
  characterPlayed: string;
  difficulty: string;
  totalTurns: number;
  hintsUsed: number;
  averagePronunciationScore: number;
  scoreBreakdown: {
    conversationFlow: number;     // 0-100: how natural the conversation was
    pronunciation: number;        // 0-100: average pronunciation score
    vocabulary: number;           // 0-100: variety and appropriateness of words used
    overall: number;              // 0-100: weighted average
  };
  starRating: 1 | 2 | 3 | 4 | 5;
  phrasesUsed: string[];          // All phrases the child said
  newVocabulary: NewVocabItem[];  // Words used or encountered
  encouragement: string;          // AI-generated encouragement message
}

interface NewVocabItem {
  word: string;
  meaning: string;               // Chinese meaning
  example: string;               // Example sentence from the conversation
}
```

The summary is generated by sending a final instruction to the AI:

```typescript
realtimeClient.sendUserMessageContent([{
  type: 'input_text',
  text: `Scenario complete. Analyze the conversation and provide a summary.
Reply with JSON only: {
  "conversationFlow": <0-100>,
  "pronunciation": <0-100>,
  "vocabulary": <0-100>,
  "overall": <0-100>,
  "phrasesUsed": ["<phrase1>", "<phrase2>", ...],
  "newVocabulary": [{"word": "<word>", "meaning": "<chinese>", "example": "<sentence>"}],
  "encouragement": "<short encouraging message>"
}`
}]);
```

### 4.9 Visual Design

#### 4.9.1 Scenario Selection Screen

A grid of scenario cards, each showing:
- Icon/emoji (large, centered)
- Name (English + Chinese)
- Brief description
- Difficulty badges

**Layout:** 2-column grid on tablet, 3-column on desktop.

**Card style:**
- Rounded corners (12px)
- Subtle shadow
- Hover/tap: slight scale + highlight
- Background: light gradient matching scenario theme

#### 4.9.2 Character Selection Screen

Two character cards side by side:
- Character avatar (emoji, large)
- Character name (English + Chinese)
- Role description
- "Play as this character" button

**Selected state:** highlighted border, checkmark badge.

#### 4.9.3 Difficulty Selection

Three buttons in a row:
- **简单 (Beginner)** - Green
- **进阶 (Intermediate)** - Blue
- **挑战 (Advanced)** - Orange

Each button shows the level name in English and Chinese with a brief description.

#### 4.9.4 Conversation View

The main role-play screen:

```
┌─────────────────────────────────────────────┐
│  [AI Avatar]  Waiter         [User Avatar]  Child
│                                             │
│  ┌─────────────┐         ┌─────────────┐   │
│  │ AI speech   │         │ User speech │   │
│  │ bubble      │         │ bubble      │   │
│  └─────────────┘         └─────────────┘   │
│                                    [score]  │
│  ┌─────────────┐         ┌─────────────┐   │
│  │ AI speech   │         │ User speech │   │
│  │ bubble      │         │ bubble      │   │
│  └─────────────┘         └─────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  💡 Hint: "I'd like a hamburger"    │   │
│  │     Tap to speak this phrase        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [🎤 Mic] [💡 Hint] [⏸ Pause] [🚪 End]    │
└─────────────────────────────────────────────┘
```

**Speech bubbles:**
- AI: left-aligned, light blue background, AI avatar emoji
- User: right-aligned, light green background, user avatar emoji
- Each bubble has a subtle tail/arrow pointing to the sender
- Pronunciation score badge: small circle (color-coded) below user bubbles

**Hint card:**
- Slides up from bottom when hint button is tapped
- Shows 3-5 suggested phrases as tappable chips
- Tapping a chip sends it as the child's speech
- Semi-transparent overlay behind hint card

**Control bar (bottom):**
- Microphone button (large, centered, pulsing when listening)
- Hint button (lightbulb icon)
- Pause/Resume button
- End scenario button (door icon)

#### 4.9.5 Summary Screen

```
┌─────────────────────────────────────────────┐
│           🎉 Great Job!                     │
│                                             │
│  Overall Score: 85/100    ★★★★☆            │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Flow: 90  │ │Pronun: 80│ │Vocab: 85 │   │
│  └──────────┘ └──────────┘ └──────────┘   │
│                                             │
│  Phrases You Used:                          │
│  • "I'd like a hamburger, please."         │
│  • "Can I have some water?"                │
│  • "How much is it?"                       │
│                                             │
│  New Words:                                 │
│  • receipt /rɪˈsiːt/ - 收据                │
│  • order /ˈɔːrdər/ - 点餐                  │
│                                             │
│  [🔄 Play Again]  [✅ Done]                │
└─────────────────────────────────────────────┘
```

### 4.10 Files Changed

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/roleplay/RolePlay.tsx` | **Create** | Main role-play component (scenario selection through summary) |
| `src/components/roleplay/RolePlay.module.css` | **Create** | All role-play styles |
| `src/components/roleplay/ScenarioCard.tsx` | **Create** | Individual scenario selection card |
| `src/components/roleplay/CharacterSelect.tsx` | **Create** | Character selection screen |
| `src/components/roleplay/DifficultySelect.tsx` | **Create** | Difficulty level selection |
| `src/components/roleplay/ConversationView.tsx` | **Create** | Main conversation UI with speech bubbles |
| `src/components/roleplay/HintCard.tsx` | **Create** | Hint phrase overlay |
| `src/components/roleplay/RolePlaySummary.tsx` | **Create** | Completion summary screen |
| `src/components/roleplay/useRolePlay.ts` | **Create** | Custom hook managing role-play state and transitions |
| `src/components/roleplay/scenarios.ts` | **Create** | Scenario data definitions (all 6 scenarios) |
| `src/components/roleplay/types.ts` | **Create** | TypeScript type definitions |
| `src/pages/DesktopLayout.tsx` | **Modify** | Add RolePlay container in popup overlay + toggle button in toolbar |
| `src/pages/TabletLayout.tsx` | **Modify** | Same changes as DesktopLayout (parallel layout) |

### 4.11 Integration into DesktopLayout

Following the existing superpower pattern:

```tsx
// In DesktopLayout.tsx - import
import RolePlay from "../components/roleplay/RolePlay";

// In render - add container inside popupOverlay
<div id="rolePlayContainer"
     style={{
       display: 'none',
       width: '100%',
       height: '100%',
       flexDirection: 'column',
       backgroundColor: '#f0f4f8'
     }}>
  <RolePlay realtimeClient={clientRef.current} />
</div>

// In toolbar - add toggle button
const toggleRolePlay = () => {
  const popupOverlay = document.getElementById('popupOverlay');
  const rolePlayContainer = document.getElementById('rolePlayContainer');
  const flashcardsContainer = document.getElementById('flashcardsContainer');
  const shadowContainer = document.getElementById('shadowReadingContainer');
  if (!popupOverlay || !rolePlayContainer) return;

  const isVisible =
    popupOverlay.style.display === 'flex' &&
    rolePlayContainer.style.display === 'flex';

  if (isVisible) {
    rolePlayContainer.style.display = 'none';
    popupOverlay.style.display = 'none';
    return;
  }

  rolePlayContainer.style.display = 'flex';
  if (flashcardsContainer) flashcardsContainer.style.display = 'none';
  if (shadowContainer) shadowContainer.style.display = 'none';
  popupOverlay.style.display = 'flex';
};

// Toolbar button (use Users icon from react-feather)
<div title='Voice Role-Play'>
  <Users color='blue' style={{ width: '17px', height: '17px' }} onClick={toggleRolePlay} />
</div>
```

### 4.12 Custom Hook: `useRolePlay`

```typescript
function useRolePlay(realtimeClient?: RealtimeClient) {
  const [state, setState] = useState<RolePlayState>(initialState);
  const turnCountRef = useRef(0);

  // Start a scenario
  const selectScenario = (scenario: RolePlayScenario) => { ... };

  // Select character (the other becomes AI)
  const selectCharacter = (character: RolePlayCharacter) => { ... };

  // Select difficulty and begin
  const startConversation = (difficulty: 'beginner' | 'intermediate' | 'advanced') => {
    // 1. Update AI instructions via client.updateSession()
    // 2. Send intro message from AI character
    // 3. Set phase to 'intro'
  };

  // Handle child speaking (via mic or hint tap)
  const sendChildMessage = (text: string) => {
    // 1. Send to Realtime API
    // 2. Record in conversationHistory
    // 3. Increment turn count
    // 4. After AI responds, analyze pronunciation
    // 5. Check completion criteria
  };

  // Show hints
  const showHints = () => { ... };

  // End scenario early
  const endScenario = () => {
    // 1. Request summary from AI
    // 2. Set phase to 'summary'
  };

  // Reset to initial state
  const reset = () => { ... };

  return { state, selectScenario, selectCharacter, startConversation, sendChildMessage, showHints, endScenario, reset };
}
```

### 4.13 Realtime API Event Handling

During active conversation, the hook listens for:

```typescript
useEffect(() => {
  if (!realtimeClient) return;

  const handleCompleted = ({ item }: any) => {
    if (item?.role === 'assistant' && item?.formatted?.text) {
      const text = item.formatted.text;

      // Check if it's a pronunciation analysis response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (typeof parsed.score === 'number') {
            // This is pronunciation feedback - update last user message
            updateLastMessageScore(parsed.score, parsed.correction);
            return;
          }
          if (parsed.phrasesUsed) {
            // This is the summary response
            setSummary(parsed);
            return;
          }
        }
      } catch (e) {
        // Not JSON - treat as normal AI conversation response
      }

      // Normal AI response - add to conversation
      addAiMessage(text);
    }
  };

  realtimeClient.on('conversation.item.completed', handleCompleted);
  return () => realtimeClient.off('conversation.item.completed', handleCompleted);
}, [realtimeClient, state.phase]);
```

---

## 5. Out of Scope

- **Multiplayer role-play** (Feature 5: Family mode could support this)
- **Custom scenario editor** (parents/teachers creating their own scenarios)
- **Persistent scoring** across sessions (scores are per-session only)
- **Audio recording playback** of the full conversation (future iteration)
- **Role-play with image context** (e.g., showing a menu image during restaurant scenario)
- **Offline mode** (requires network for Realtime API)
- **Video avatars** (static emoji avatars only for now)
- **Scenario progression/unlocking** (all scenarios available from the start)
- **TabletLayout parity** in v1 (DesktopLayout first, TabletLayout in follow-up if needed)

---

## 6. Open Questions

1. **Voice selection:** Should the AI character use a different voice than the default? (e.g., deeper voice for doctor, higher for shopkeeper). The Realtime API supports voice selection per session.
2. **Conversation length:** Is 8-10 turns the right target, or should it vary by difficulty?
3. **Hint frequency:** Should the hint button show a "suggested" indicator after a timeout (e.g., 10 seconds of silence)?
4. **Replay value:** Should the same scenario feel different each time (randomized dialogue), or is it OK if the AI character behaves similarly on replay?
5. **Scoring weights:** How should conversation flow, pronunciation, and vocabulary be weighted in the overall score? (Current proposal: 30/40/30)
