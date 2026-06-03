# Feature 5: 家庭语音互动 (Family Voice Interaction)

**Date:** 2026-06-02
**Status:** Draft

---

## 1. Overview

家庭语音互动 enables parent-child collaborative learning through voice. Parents and children under a shared family account can join the same voice session, take turns answering questions, and track progress together. The feature extends the existing single-user OpenAI Realtime API voice interaction into a multi-participant, turn-based learning environment.

### Goals

- Family accounts: parent creates a family group, adds child profiles
- Joint voice sessions: parent and child join the same session, see/hear each other
- Turn-based activities: AI facilitates turn-taking (vocabulary quiz, story reading, role-play)
- Parent dashboard: view child's session history, scores, time spent, strengths/weaknesses
- Shared achievements: family badges earned by learning together
- Remote participation: parent joins from a different device (same account)
- Session recording: save family sessions for review and playback
- Scheduling: set recurring learning times with reminders

### Non-Goals (for now)

- Video conferencing (voice only for now)
- Sibling-to-sibling sessions without a parent present
- Gamification with other families (social competition)
- Professional teacher/tutor integration
- Multi-language family profiles (app remains English-learning focused)

---

## 2. 解决的问题

- **Engagement gap**: Children lose interest learning alone; parent participation doubles session duration on average
- **Progress visibility**: Parents currently have no way to see what their child is learning or how they are progressing
- **Accountability**: Without structured scheduling, learning sessions are irregular and easily forgotten
- **Bonding opportunity**: English learning becomes a shared family activity rather than a solo chore
- **Skill reinforcement**: Turn-based activities let children observe parent pronunciation and mimic, accelerating learning
- **Session continuity**: Families can replay past sessions to review missed words or celebrate improvement

---

## 3. Current State

### Existing Auth System

- `db/auth.js`: `users` table with `id`, `email`, `password_hash`, `display_name`, `role`, `email_verified`
- JWT auth: access token (15 min) + refresh token (30 day), single-use rotation
- `middleware/auth.js`: `authenticate`, `requireAdmin`, `optionalAuth` middleware
- `routes/auth.js`: register, login, refresh, logout, me, preferences endpoints
- `src/contexts/AuthContext.tsx`: React context providing `user`, `accessToken`, `login`, `register`, `logout`, `isAuthenticated`

### Existing Voice Infrastructure

- `src/lib/realtime/`: Vendored OpenAI Realtime API client (WebSocket-based)
- `src/components/chat/Chat.tsx`: Chat component that manages Realtime API conversation
- `src/pages/DesktopLayout.tsx`: Main layout with `WavRecorder` (input) + `WavStreamPlayer` (output) + `RealtimeClient`
- `relay-server/`: Express WebSocket relay proxying to OpenAI API
- Single-device, single-user model: one RealtimeClient per page load, one audio input/output stream

### Existing Chat History

- `db/chatHistory.js`: SQLite tables `sessions`, `messages`, `items`
- Sessions scoped to user via `user_id` column
- `routes/chat.js`: REST endpoints for session CRUD, message persistence, item persistence

### Key Constraints

- OpenAI Realtime API: one WebSocket connection per client, server-side mixing needed for multi-participant audio
- SQLite: single-file database, no network sharing between devices
- Render free tier: ephemeral disk, no persistent WebSocket state across deploys
- Current UI: device-adaptive (DesktopLayout / TabletLayout), not designed for split-screen multi-user

---

## 4. Design

### 4.1 Family Account Model

#### New Database Tables

```sql
-- Family groups: one parent account owns the family
CREATE TABLE IF NOT EXISTS family_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  family_name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Family members: links users to a family group
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'parent',  -- 'parent' or 'child'
  display_name TEXT,
  avatar_url TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(family_id, user_id)
);

-- Child profiles: lightweight profiles for young children who may not have their own login
CREATE TABLE IF NOT EXISTS child_profiles (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  age INTEGER,
  avatar_url TEXT,
  pin TEXT,  -- simple 4-digit PIN for child login
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE
);
```

#### Design Decisions

- **Invite code**: 6-character alphanumeric code (e.g., `FAM3X9`) for parent to share with co-parents. No email invitation flow for v1.
- **Child profiles**: Children under ~8 may not have their own email/password. A child profile is lightweight (name, age, avatar, optional 4-digit PIN) linked to the family group. The parent manages the profile.
- **Co-parents**: A parent can share the invite code with another adult. The co-parent registers their own account, then enters the code to join the family group. Both parents have equal access to all child profiles and sessions.
- **User.role extension**: The existing `role` column (`user`, `admin`) is NOT changed. Family role (parent/child) is tracked separately in `family_members`. This avoids conflating app-level roles with family roles.

### 4.2 Family Session Architecture

#### Session Model

```typescript
interface FamilySession {
  id: string;
  familyId: string;
  activityType: ActivityType;
  state: FamilySessionState;
  currentTurn: string | null;      // user_id or child_profile_id of whose turn it is
  participants: Participant[];
  activityData: ActivityData;
  startedAt: string;
  endedAt: string | null;
  recordedAudioUrl: string | null;  // URL to saved session recording
}

type ActivityType = 'vocabulary_quiz' | 'story_reading' | 'role_play';

type FamilySessionState =
  | 'waiting'      // created, waiting for participants
  | 'active'       // session in progress
  | 'paused'       // temporarily paused
  | 'completed';   // activity finished

interface Participant {
  id: string;        // user_id or child_profile_id
  role: 'parent' | 'child';
  displayName: string;
  isOnline: boolean;
  isMuted: boolean;
  lastScore: number | null;
}

interface ActivityData {
  // Varies by activityType — see Section 4.4
}
```

#### Multi-Participant Audio Strategy

The core challenge: OpenAI Realtime API supports one WebSocket per client, and does not natively mix multiple audio streams. Two approaches are considered:

**Chosen approach: Server-side mixing via relay-server**

The `relay-server` acts as the single Realtime API client. Each family participant connects to the relay-server via WebSocket. The relay-server:

1. Opens one connection to OpenAI Realtime API
2. Receives audio input from all participants (mixed server-side)
3. Routes AI audio output to all participants
4. Manages turn-taking by muting/unmuting participants based on `currentTurn`

```
Parent (browser)  ──WebSocket──→ relay-server ──WebSocket──→ OpenAI Realtime API
Child (browser)   ──WebSocket──→ relay-server ──┘
                                         ↓
                              Mixed AI response audio
                                         ↓
                              Broadcast to all participants
```

**Alternative (rejected): Separate Realtime API connections per participant**

Each participant opens their own Realtime API session. Pros: simpler relay-server logic. Cons: AI state is not shared (each participant gets independent AI responses), 2x API cost, no turn-based coordination. Rejected because the shared AI state is essential for turn-based activities.

#### New Database Tables for Family Sessions

```sql
CREATE TABLE IF NOT EXISTS family_sessions (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'waiting',
  current_turn TEXT,
  activity_data_json TEXT,
  recorded_audio_url TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_session_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,  -- user_id or child_profile_id
  participant_role TEXT NOT NULL, -- 'parent' or 'child'
  display_name TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  score INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES family_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_session_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  participant_id TEXT NOT NULL,
  activity_item TEXT,           -- the question/prompt for this turn
  response_text TEXT,           -- participant's spoken response
  response_audio_url TEXT,      -- URL to recorded audio for this turn
  score INTEGER,
  feedback TEXT,                -- AI feedback text
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES family_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_achievements (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  badge_type TEXT NOT NULL,     -- 'first_session', 'ten_sessions', 'streak_7', etc.
  badge_name TEXT NOT NULL,
  badge_icon TEXT,              -- URL to badge image
  earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_schedules (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  cron_expression TEXT NOT NULL,  -- e.g. '0 19 * * 1,3,5' for Mon/Wed/Fri 7pm
  reminder_minutes_before INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES family_groups(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_family_sessions_family ON family_sessions(family_id);
CREATE INDEX IF NOT EXISTS idx_family_sessions_state ON family_sessions(state);
CREATE INDEX IF NOT EXISTS idx_family_session_participants_session ON family_session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_family_session_turns_session ON family_session_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_family_achievements_family ON family_achievements(family_id);
CREATE INDEX IF NOT EXISTS idx_family_schedules_family ON family_schedules(family_id);
```

### 4.3 State Transitions

#### Family Session Lifecycle

```
[No session] ──parent creates──→ [waiting]
[waiting] ──child joins──→ [waiting] (2nd participant)
[waiting] ──parent starts──→ [active]
[active] ──pause──→ [paused]
[paused] ──resume──→ [active]
[active] ──activity complete──→ [completed]
[active] ──parent ends early──→ [completed]
[waiting] ──timeout (10 min)──→ [cancelled]
```

#### Turn-Based State Machine

```
[active] ──AI announces turn──→ [waiting_for_speech]
[waiting_for_speech] ──participant speaks──→ [processing]
[processing] ──AI scores/responds──→ [feedback]
[feedback] ──display results (3s)──→ [next_turn]
[next_turn] ──switch participant──→ [waiting_for_speech]
[next_turn] ──last item──→ [activity_complete]
[waiting_for_speech] ──timeout (30s)──→ [skip_turn] → [next_turn]
```

#### Activity Data Shapes

```typescript
// Vocabulary Quiz
interface VocabularyQuizData {
  words: string[];              // list of words to quiz
  currentIndex: number;         // which word we are on
  turnOrder: string[];          // alternating participant IDs
  scores: Record<string, number[]>;  // participant_id → array of per-word scores
}

// Story Reading
interface StoryReadingData {
  storyText: string;            // the story broken into paragraphs
  paragraphs: string[];         // split paragraphs
  currentIndex: number;         // which paragraph
  turnOrder: string[];          // who reads which paragraph
  pronunciationScores: Record<string, number[]>;
}

// Role Play
interface RolePlayData {
  scenario: string;             // AI-generated scenario description
  roles: Record<string, string>; // participant_id → character name
  currentLine: number;
  dialogueHistory: Array<{
    speakerId: string;
    line: string;
    audioUrl: string | null;
  }>;
}
```

### 4.4 Activity Types

#### Vocabulary Quiz

- AI presents a word (spoken + shown on screen)
- Current participant must say the word correctly
- AI scores pronunciation (0-100), provides feedback
- Turns alternate between parent and child
- Parent sees child's score in real-time; child sees parent's score too (motivation)
- 10 words per session, adjustable by parent

**AI Prompt (system instruction for this activity):**
```
You are conducting a family vocabulary quiz. Two participants take turns.
When it is someone's turn, say the word clearly, then wait for them to speak.
Score their pronunciation 0-100. Give encouraging feedback.
After both participants answer the same word, announce who got the higher score.
Use a fun, game-show-host tone.
```

#### Story Reading

- AI reads a short story paragraph by paragraph
- Participants take turns reading paragraphs aloud
- AI scores pronunciation and fluency
- After reading, AI asks a comprehension question
- Story difficulty adapts to child's level

#### Role-Play

- AI sets up a scenario (e.g., "You are at a restaurant. Parent is the waiter, child is the customer.")
- Participants speak their character's lines
- AI guides the dialogue, suggests next lines if stuck
- At the end, AI provides a summary of language used and areas to improve

### 4.5 New Components

#### Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `FamilyDashboard` | `src/components/family/FamilyDashboard.tsx` | Main family page: shows members, sessions, achievements, schedule |
| `FamilySessionView` | `src/components/family/FamilySessionView.tsx` | Active family session: dual participant view, turn indicator, shared activity display |
| `FamilyMemberCard` | `src/components/family/FamilyMemberCard.tsx` | Card showing a family member's avatar, name, online status, recent stats |
| `TurnIndicator` | `src/components/family/TurnIndicator.tsx` | Visual indicator of whose turn it is (animated avatar + name) |
| `AchievementBadge` | `src/components/family/AchievementBadge.tsx` | Badge display with unlock animation |
| `ScheduleManager` | `src/components/family/ScheduleManager.tsx` | UI for creating/editing learning schedules |
| `SessionReplay` | `src/components/family/SessionReplay.tsx` | Replay a recorded family session (audio + turn transcript) |
| `ChildProfileSetup` | `src/components/family/ChildProfileSetup.tsx` | Form to create/edit child profiles (name, age, avatar, PIN) |
| `FamilyInviteDialog` | `src/components/family/FamilyInviteDialog.tsx` | Show invite code / enter invite code to join family |

#### Backend Routes

| Route File | Endpoint Prefix | Description |
|------------|-----------------|-------------|
| `routes/family.js` | `/api/family/*` | Family group CRUD, member management, invite code |
| `routes/family-session.js` | `/api/family-sessions/*` | Session lifecycle, turn management, activity data |
| `routes/family-achievements.js` | `/api/family-achievements/*` | Achievement queries, badge awarding |
| `routes/family-schedule.js` | `/api/family-schedule/*` | Schedule CRUD, reminder triggers |

#### New Database Files

| File | Description |
|------|-------------|
| `db/family.js` | Family group + member + child profile operations |
| `db/familySession.js` | Family session + participant + turn operations |
| `db/familyAchievements.js` | Achievement queries and badge awarding |
| `db/familySchedule.js` | Schedule CRUD and reminder logic |

### 4.6 Relay Server Changes

The relay-server needs significant changes to support multi-participant sessions:

```typescript
// relay-server/lib/FamilySessionRelay.ts (new file)

interface FamilyRelaySession {
  sessionId: string;
  participants: Map<string, ParticipantConnection>;
  currentTurn: string | null;
  realtimeClient: RealtimeClient;  // single shared OpenAI connection
  isRecording: boolean;
  audioChunks: Map<string, ArrayBuffer[]>;  // per-participant audio recording
}

export class FamilySessionRelay {
  // Manages one family session's WebSocket connections
  // Each participant connects via: ws://relay-server/family-session/:sessionId?participantId=xxx

  handleJoin(sessionId: string, participantId: string, ws: WebSocket): void;
  handleLeave(sessionId: string, participantId: string): void;
  handleAudioInput(sessionId: string, participantId: string, audio: ArrayBuffer): void;
  setTurn(sessionId: string, participantId: string): void;  // mute others, unmute this participant
  broadcastAIResponse(sessionId: string, audio: ArrayBuffer): void;
  startRecording(sessionId: string): void;
  stopRecording(sessionId: string): Promise<string>;  // returns recording URL
}
```

**Audio routing logic:**
- When participant's turn is active: their mic audio is forwarded to OpenAI
- When not their turn: mic audio is muted (not sent to OpenAI), but participant can still hear AI
- AI response audio is broadcast to all participants
- Each participant's audio is recorded locally for session replay

**WebSocket protocol (family extension):**

```
Client → Server:
  { type: "join", sessionId, participantId, participantRole }
  { type: "leave", sessionId, participantId }
  { type: "audio", sessionId, participantId, data: base64 }
  { type: "set_turn", sessionId, participantId }  // parent only

Server → Client:
  { type: "participant_joined", participantId, displayName, role }
  { type: "participant_left", participantId }
  { type: "turn_changed", participantId }
  { type: "ai_audio", data: base64 }
  { type: "ai_text", text: string }
  { type: "activity_event", event: string, data: any }
```

### 4.7 State Model (Frontend)

```typescript
// src/contexts/FamilyContext.tsx

interface FamilyState {
  // Family group
  familyGroup: FamilyGroup | null;
  members: FamilyMember[];
  childProfiles: ChildProfile[];
  inviteCode: string | null;

  // Current session
  activeSession: FamilySession | null;
  participants: Participant[];
  currentTurn: string | null;
  isMyTurn: boolean;

  // Activity
  activityType: ActivityType | null;
  activityProgress: number;  // 0-100
  scores: Record<string, number[]>;

  // Achievements
  achievements: Achievement[];

  // Schedule
  schedules: Schedule[];

  // Connection
  isConnected: boolean;
  isRecording: boolean;
}
```

**Context provider wraps at the App level (inside AuthProvider)**, so all authenticated pages can access family state.

### 4.8 Visual Design

#### Family Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│  Family Dashboard                    [Invite] [Settings]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  👨 Dad   │  │  👩 Mom   │  │  👧 Lily  │  [+ Add]│
│  │  Online   │  │  Online   │  │  Offline  │         │
│  │  Score: 92│  │  Score: 88│  │  Score: 85│         │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                     │
│  ── Recent Sessions ──────────────────────────────  │
│  │ Jun 1 │ Vocab Quiz  │ 10 words │ Avg: 87     │  │
│  │ May 30│ Story Read  │ 5 pages  │ Avg: 91     │  │
│  │ May 28│ Role Play   │ Restaurant│ Avg: 83    │  │
│                                                     │
│  ── Achievements ─────────────────────────────────  │
│  🏆 First Session  🔥 7-Day Streak  ⭐ Perfect 10  │
│                                                     │
│  ── Schedule ─────────────────────────────────────  │
│  Mon/Wed/Fri 7:00 PM - Vocabulary Quiz (15 min)   │
│  Sat 10:00 AM - Story Reading (20 min)            │
│                                                     │
│  [Start Session]                                    │
└─────────────────────────────────────────────────────┘
```

#### Active Session View

```
┌─────────────────────────────────────────────────────┐
│  Family Session: Vocabulary Quiz      [Pause] [End] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─── Turn Indicator ───────────────────────────┐  │
│  │    🎤 Lily's Turn                            │  │
│  │    "Say the word: APPLE"                     │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────┐      ┌──────────────┐            │
│  │   👨 Dad      │      │   👧 Lily     │            │
│  │   Score: 92   │      │   Score: 85   │            │
│  │   ● Online    │      │   ● Speaking  │            │
│  │   Last: 95    │      │   Last: 88    │            │
│  └──────────────┘      └──────────────┘            │
│                                                     │
│  ┌─── Progress ─────────────────────────────────┐  │
│  │  Word 3/10  ████████░░░░░░░░░░░░  30%       │  │
│  │  Dad: 🟢🟢🟡   Lily: 🟢🟢🟢                │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── Chat ─────────────────────────────────────┐  │
│  │  AI: Great job Lily! Your pronunciation is    │  │
│  │      improving! Dad, your turn next.          │  │
│  │  Dad: "BANANA" [audio waveform]              │  │
│  │  AI: Excellent! 95 points!                    │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [🎤 Mute]  [🔊 Volume]  [📊 Score History]       │
└─────────────────────────────────────────────────────┘
```

#### Color Palette & Styling

- Follows existing Voice-First design system (no new global styles)
- Family-specific colors:
  - Online indicator: `#4CAF50` (green)
  - Speaking indicator: `#FF9800` (orange pulse)
  - Turn highlight: `#2196F3` (blue border glow)
  - Achievement gold: `#FFD700`
  - Score bars: green (>80), yellow (60-80), red (<60)
- Animations:
  - Turn transition: avatar scales up with blue glow (200ms ease-out)
  - Score reveal: number counts up from 0 (500ms)
  - Achievement unlock: badge scales from 0 to 1.2 to 1.0 with particle burst
  - Speaking indicator: orange ring pulses around active participant's avatar

### 4.9 Session Recording

- Each participant's audio is captured via `WavRecorder` on their device
- Audio chunks are sent to relay-server and stored in memory during the session
- On session end, relay-server:
  1. Combines participant audio chunks into per-turn audio files
  2. Saves combined audio to `/public/family-sessions/{sessionId}/`
  3. Stores recording URL in `family_sessions.recorded_audio_url`
  4. Individual turn audio stored in `family_session_turns.response_audio_url`
- Storage limit: 50MB per session (approximately 30 minutes of audio)
- Old recordings cleaned up after 90 days (configurable)

### 4.10 Scheduling & Reminders

- Parent creates a schedule: activity type + cron expression + reminder offset
- Server-side cron job checks `family_schedules` table every minute
- When a scheduled time is within the reminder window:
  1. Create a pending session in `family_sessions` with state `scheduled`
  2. Send notification to parent's device (browser push notification via Service Worker)
  3. Show notification in-app (bell icon badge)
- Child receives a notification when parent starts a scheduled session

**Implementation note:** For v1, reminders use in-app notifications only (no email/push). A future iteration can add browser push notifications via Web Push API.

### 4.11 Achievement System

#### Badge Types

| Badge | Condition | Icon |
|-------|-----------|------|
| First Session | Complete first family session | 🎯 |
| Week Warrior | 7 consecutive days with at least one session | 🔥 |
| Perfect 10 | Get 100/100 on any quiz item | ⭐ |
| Bookworm | Complete 10 story reading sessions | 📚 |
| Role Master | Complete 5 role-play sessions | 🎭 |
| Family Fun | 20 total family sessions | 👨‍👩‍👧‍👦 |
| Speed Reader | Complete a story reading in under 5 minutes | ⚡ |
| Consistent Learner | 30-day learning streak | 🏆 |
| Vocabulary Champion | Learn 100 words total across all quizzes | 📝 |

#### Badge Awarding Logic

After each session completes, the server checks all badge conditions for the family:
1. Query session count, streak, scores from database
2. Compare against badge thresholds
3. Insert new badges into `family_achievements`
4. Return newly earned badges in the session completion response
5. Frontend shows unlock animation with confetti

### 4.12 Files Changed

| File | Action | Responsibility |
|------|--------|---------------|
| `db/family.js` | Create | Family group, member, child profile CRUD |
| `db/familySession.js` | Create | Family session, participant, turn CRUD |
| `db/familyAchievements.js` | Create | Achievement queries and badge awarding |
| `db/familySchedule.js` | Create | Schedule CRUD |
| `db/auth.js` | Modify | Add `family_id` column to users table (nullable FK) |
| `db/chatHistory.js` | No change | Existing chat history untouched |
| `routes/family.js` | Create | Family group API endpoints |
| `routes/family-session.js` | Create | Session lifecycle API endpoints |
| `routes/family-achievements.js` | Create | Achievement API endpoints |
| `routes/family-schedule.js` | Create | Schedule API endpoints |
| `middleware/auth.js` | No change | Existing auth middleware reused |
| `local-server.js` | Modify | Register new route files |
| `src/App.tsx` | Modify | Add family routes under ProtectedRoute |
| `src/contexts/FamilyContext.tsx` | Create | Family state management context |
| `src/components/family/FamilyDashboard.tsx` | Create | Main family page |
| `src/components/family/FamilySessionView.tsx` | Create | Active session view |
| `src/components/family/FamilyMemberCard.tsx` | Create | Member display card |
| `src/components/family/TurnIndicator.tsx` | Create | Turn display component |
| `src/components/family/AchievementBadge.tsx` | Create | Badge display |
| `src/components/family/ScheduleManager.tsx` | Create | Schedule CRUD UI |
| `src/components/family/SessionReplay.tsx` | Create | Session playback |
| `src/components/family/ChildProfileSetup.tsx` | Create | Child profile form |
| `src/components/family/FamilyInviteDialog.tsx` | Create | Invite code dialog |
| `src/components/family/style/` | Create | SCSS modules for family components |
| `src/pages/DesktopLayout.tsx` | Modify | Add family nav entry (sidebar icon) |
| `src/pages/TabletLayout.tsx` | Modify | Add family nav entry |
| `relay-server/lib/FamilySessionRelay.ts` | Create | Multi-participant session relay |
| `relay-server/index.js` | Modify | Add family session WebSocket route |

### 4.13 API Endpoints

#### Family Group

```
POST   /api/family                    Create family group (becomes owner)
GET    /api/family                    Get current user's family group
POST   /api/family/join               Join family via invite code
GET    /api/family/members            List family members
POST   /api/family/members            Add member (co-parent via invite code)
DELETE /api/family/members/:id        Remove member
POST   /api/family/invite-code/refresh  Generate new invite code
```

#### Child Profiles

```
POST   /api/family/children           Create child profile
GET    /api/family/children           List child profiles
PUT    /api/family/children/:id       Update child profile
DELETE /api/family/children/:id       Delete child profile
POST   /api/family/children/:id/pin   Set/change child PIN
POST   /api/family/children/login     Child login via PIN
```

#### Family Sessions

```
POST   /api/family-sessions           Create session (parent only)
GET    /api/family-sessions           List family sessions (with filters)
GET    /api/family-sessions/:id       Get session details
POST   /api/family-sessions/:id/join  Join session as participant
POST   /api/family-sessions/:id/start Start session (parent only)
POST   /api/family-sessions/:id/pause Pause session
POST   /api/family-sessions/:id/resume Resume session
POST   /api/family-sessions/:id/end   End session
POST   /api/family-sessions/:id/turn  Advance turn (server-side or via WS)
GET    /api/family-sessions/:id/turns Get turn history
GET    /api/family-sessions/:id/recording  Get session recording URL
```

#### Achievements

```
GET    /api/family-achievements       List family achievements
GET    /api/family-achievements/progress  Get progress toward locked badges
```

#### Schedules

```
POST   /api/family-schedules          Create schedule
GET    /api/family-schedules          List family schedules
PUT    /api/family-schedules/:id      Update schedule
DELETE /api/family-schedules/:id      Delete schedule
```

#### Progress/Dashboard

```
GET    /api/family/progress           Aggregate family progress (scores, time, streaks)
GET    /api/family/progress/:userId   Individual member progress
GET    /api/family/progress/child/:childId  Child-specific progress
```

---

## 5. Out of Scope

- **Video interaction**: Voice only for v1. Video calls require WebRTC infrastructure and significantly more bandwidth/storage.
- **Cross-family competition**: No leaderboards or social features between families in v1.
- **Offline sessions**: All sessions require network connectivity for OpenAI Realtime API.
- **Custom activity creation**: Parents cannot create their own activity types; only the three built-in types are supported.
- **Multi-child sessions without parent**: Children cannot start sessions among themselves; a parent or co-parent must be present.
- **Session recording playback with transcription**: v1 saves audio only; full transcript playback with word-level highlighting is a future enhancement.
- **Mobile push notifications**: v1 uses in-app notifications only. Browser push via Service Worker is planned for v2.
- **Teacher/tutor mode**: No support for non-family adult participants (e.g., English tutors).
- **Billing for additional family members**: All family features are included in the base app; no tiered pricing for family size.
- **Localization**: Interface remains English/Chinese bilingual; no additional languages for UI chrome.

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Database schema + migration
- Family group CRUD API
- Child profile CRUD API
- Family invite code flow
- Basic family dashboard UI

### Phase 2: Multi-Participant Sessions (Week 3-4)
- Relay-server multi-participant audio routing
- Family session creation and lifecycle API
- Turn-based state machine
- Family session view UI (turn indicator, participant cards)
- Basic vocabulary quiz activity

### Phase 3: Activities & Recording (Week 5-6)
- Story reading activity
- Role-play activity
- Session recording (per-participant audio capture + server-side storage)
- Session replay UI

### Phase 4: Progress & Achievements (Week 7-8)
- Parent dashboard with progress charts
- Achievement system (badge awarding + display)
- Schedule management UI
- In-app notifications for reminders
- Polish and testing

---

## 7. Open Questions

1. **Audio mixing quality**: Server-side audio mixing may introduce latency. Should we test with `opus` codec for lower bitrate? Benchmark needed.
2. **Child PIN security**: 4-digit PIN is weak but appropriate for young children. Should we add a "too many attempts" lockout? Recommended: 5 attempts then 5-minute cooldown.
3. **Session recording storage**: Render free tier has ephemeral disk. Should recordings be stored externally (e.g., Cloudflare R2, S3)? For v1, local storage with 90-day cleanup is acceptable.
4. **Co-parent limit**: Should there be a maximum number of co-parents? Recommended: max 2 parents per family for v1.
5. **Child age range**: The app targets ages 3-8. Should activities adapt difficulty based on `child_profiles.age`? Yes, recommended for v2. For v1, parent selects difficulty manually.
