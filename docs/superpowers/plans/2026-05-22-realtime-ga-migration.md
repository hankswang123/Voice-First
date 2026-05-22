# Realtime GA Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore voice-realtime functionality on `voice-first-1.onrender.com` by vendoring `@hankswang123/realtime-api-beta` in-tree at `src/lib/realtime/` and surgically patching the WebSocket handshake to drop the disabled Beta-API protocol shape.

**Architecture:** Copy the 5 library source files verbatim. Edit `api.js` only — remove the `openai-beta.realtime-v1` subprotocol (browser path), the `OpenAI-Beta: realtime=v1` header (Node path), and stop hard-coding the OpenAI URL in the Node branch so the relay can still override. Fix one latent bug in `conversation.js`. Swap 4 import sites. Drop the dead npm dependency. Net behavioural change ~30 lines; ~1,400 lines copied verbatim.

**Tech Stack:** Node.js (ESM), CRA-bundled React 19 + TypeScript, Express, `ws` (WebSocket lib), `dotenv`, OpenAI Realtime GA API.

**Spec:** `docs/superpowers/specs/2026-05-22-realtime-ga-migration-design.md`

---

## File Structure

| Path | Action | Purpose |
|---|---|---|
| `src/lib/realtime/api.js` | CREATE (copied + edited) | Patched WebSocket connect — drops Beta handshake |
| `src/lib/realtime/client.js` | CREATE (copied verbatim) | High-level `RealtimeClient` — unchanged |
| `src/lib/realtime/conversation.js` | CREATE (copied + 1-line fix) | In-memory conversation state machine |
| `src/lib/realtime/event_handler.js` | CREATE (copied verbatim) | Event emitter base class |
| `src/lib/realtime/utils.js` | CREATE (copied verbatim) | Audio codec helpers |
| `src/lib/realtime/index.js` | CREATE (new) | Public re-export surface |
| `src/lib/realtime/index.d.ts` | CREATE (new) | TypeScript types for layouts that import `ItemType` |
| `src/lib/realtime/README.md` | CREATE (new) | Documents the directory as vendored code |
| `src/lib/realtime/__tests__/handshake.test.mjs` | CREATE (new) | Tier-1 test against real OpenAI |
| `tools/test-relay.mjs` | CREATE (new) | Tier-2 test against the local relay |
| `relay-server/lib/relay.js` | MODIFY (line 2) | Import path swap |
| `src/pages/DesktopLayout.tsx` | MODIFY (lines 27–28) | Import path swap (RealtimeClient + ItemType) |
| `src/pages/TabletLayout.tsx` | MODIFY (lines 27–28) | Same |
| `src/pages/ConsolePage.tsx` | MODIFY (lines 27–28) | Same (file is dead code, fixed for tidiness) |
| `package.json` | MODIFY | Drop `@hankswang123/realtime-api-beta` from dependencies |
| `package-lock.json` | MODIFY (auto via `npm install`) | Lockfile sync |
| `README.md` | MODIFY | Document `REALTIME_MODEL` and `REACT_APP_REALTIME_MODEL` |

---

## Task 0: Pre-flight — branch + backup

**Files:**
- No file changes; git only.

- [ ] **Step 1: Create the safety backup branch**

Run:
```bash
cd C:/Users/I058700/Repo/Voice-First
git fetch origin
git branch backup/pre-realtime-ga origin/main
```
Expected: branch created silently. `git branch --list backup/pre-realtime-ga` prints `backup/pre-realtime-ga`.

- [ ] **Step 2: Confirm working tree is clean**

Run:
```bash
git status
```
Expected: `nothing to commit, working tree clean`. If it isn't, stash or commit unrelated work before continuing.

- [ ] **Step 3: Create and check out the feature branch**

Run:
```bash
git checkout -b feature/realtime-ga-migration
```
Expected: `Switched to a new branch 'feature/realtime-ga-migration'`.

- [ ] **Step 4: Confirm `OPENAI_API_KEY` is set in `.env`**

Run:
```bash
grep -q '^OPENAI_API_KEY=' .env && echo OK || echo MISSING
```
Expected: `OK`. If `MISSING`, the Tier-1 handshake test in Task 2 will fail — set the key in `.env` before proceeding.

---

## Task 1: Vendor the library (verbatim copies)

**Files:**
- Create: `src/lib/realtime/api.js`
- Create: `src/lib/realtime/client.js`
- Create: `src/lib/realtime/conversation.js`
- Create: `src/lib/realtime/event_handler.js`
- Create: `src/lib/realtime/utils.js`
- Create: `src/lib/realtime/README.md`

- [ ] **Step 1: Create the destination directory**

Run:
```bash
mkdir -p src/lib/realtime
```
Expected: silent success. `ls src/lib/realtime` prints nothing yet.

- [ ] **Step 2: Copy the five library source files verbatim**

Run (from repo root, bash):
```bash
cp node_modules/@hankswang123/realtime-api-beta/lib/api.js          src/lib/realtime/api.js
cp node_modules/@hankswang123/realtime-api-beta/lib/client.js        src/lib/realtime/client.js
cp node_modules/@hankswang123/realtime-api-beta/lib/conversation.js  src/lib/realtime/conversation.js
cp node_modules/@hankswang123/realtime-api-beta/lib/event_handler.js src/lib/realtime/event_handler.js
cp node_modules/@hankswang123/realtime-api-beta/lib/utils.js         src/lib/realtime/utils.js
```
Expected: 5 files now exist. Verify with `ls src/lib/realtime/` — should list exactly those 5 filenames.

- [ ] **Step 3: Sanity-check that nothing was modified during the copy**

Run:
```bash
diff -q node_modules/@hankswang123/realtime-api-beta/lib/api.js src/lib/realtime/api.js
diff -q node_modules/@hankswang123/realtime-api-beta/lib/client.js src/lib/realtime/client.js
diff -q node_modules/@hankswang123/realtime-api-beta/lib/conversation.js src/lib/realtime/conversation.js
diff -q node_modules/@hankswang123/realtime-api-beta/lib/event_handler.js src/lib/realtime/event_handler.js
diff -q node_modules/@hankswang123/realtime-api-beta/lib/utils.js src/lib/realtime/utils.js
```
Expected: no output (all files identical).

- [ ] **Step 4: Create the README marker**

Create `src/lib/realtime/README.md` with content:
```markdown
# Vendored: @hankswang123/realtime-api-beta

This directory is a **vendored copy** of the `@hankswang123/realtime-api-beta`
library, with surgical patches to drop the OpenAI Realtime Beta API
handshake (subprotocol + header), which OpenAI disabled.

**Do not refactor casually.** Patches against the upstream baseline are
intentional. See:

- `docs/superpowers/specs/2026-05-22-realtime-ga-migration-design.md`
- The PR titled "fix(realtime): migrate to OpenAI Realtime GA via in-tree fork"

If you need to change behaviour here, scope it narrowly and document the
reason in the same style.
```

- [ ] **Step 5: Verify build still succeeds (nothing imports from the new dir yet)**

Run:
```bash
npm run build
```
Expected: build completes successfully. The new files are present but unreferenced, so the bundler ignores them.

- [ ] **Step 6: Commit**

Run:
```bash
git add src/lib/realtime/
git commit -m "$(cat <<'EOF'
chore(realtime): vendor @hankswang123/realtime-api-beta into src/lib/realtime

Verbatim copy of the library source files, with no edits in this commit.
Subsequent commits patch api.js (handshake) and conversation.js (one
latent bug fix) and add a public index.js. See spec at
docs/superpowers/specs/2026-05-22-realtime-ga-migration-design.md.
EOF
)"
```
Expected: commit succeeds. `git log --oneline -1` shows the new commit.

---

## Task 2: Patch `api.js` — drop Beta handshake

**Files:**
- Modify: `src/lib/realtime/api.js` (line 59 — `connect()` signature; lines 76–80 — browser handshake; lines 115–127 — Node handshake)

- [ ] **Step 1: Edit `connect()` signature to honour `REALTIME_MODEL` env var**

Open `src/lib/realtime/api.js`. Find this line (currently line 59):
```js
  async connect({ model } = { model: 'gpt-realtime-mini' }) {
```
Replace with:
```js
  async connect({ model } = {}) {
    model = model
      || (typeof process !== 'undefined' && process.env && process.env.REALTIME_MODEL)
      || 'gpt-realtime-mini';
```

- [ ] **Step 2: Edit the browser handshake to drop the Beta subprotocol**

In the same file, find this block (currently lines 76–80):
```js
      const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ''}`, [
        'realtime',
        `openai-insecure-api-key.${this.apiKey}`,
        'openai-beta.realtime-v1',
      ]);
```
Replace with:
```js
      const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ''}`, [
        'realtime',
        `openai-insecure-api-key.${this.apiKey}`,
      ]);
```
(Removed: the `'openai-beta.realtime-v1'` subprotocol entry.)

- [ ] **Step 3: Edit the Node handshake to drop the Beta header and respect `this.url`**

In the same file, find this block (currently lines 115–127):
```js
      const ws = new WebSocket(
        //'wss://api.openai.com/v1/realtime?model=gpt-realtime-mini',
        `wss://api.openai.com/v1/realtime?model=${model}`,
        [],
        {
          finishRequest: (request) => {
            // Auth
            request.setHeader('Authorization', `Bearer ${this.apiKey}`);
            request.setHeader('OpenAI-Beta', 'realtime=v1');
            request.end();
          },
        },
      );
```
Replace with:
```js
      const ws = new WebSocket(
        `${this.url}${model ? `?model=${model}` : ''}`,
        [],
        {
          finishRequest: (request) => {
            // Auth
            request.setHeader('Authorization', `Bearer ${this.apiKey}`);
            request.end();
          },
        },
      );
```
(Removed: the hard-coded URL line and its commented variant; the `OpenAI-Beta: realtime=v1` header. Replaced: hard-coded URL with `this.url`-based template.)

- [ ] **Step 4: Write the failing handshake test**

Create `src/lib/realtime/__tests__/handshake.test.mjs`:
```js
// Tier-1 test: confirm the patched api.js opens a GA-compatible WebSocket.
// Run from repo root: node src/lib/realtime/__tests__/handshake.test.mjs
//
// Requires OPENAI_API_KEY in .env at the repo root.
// Exits 0 on server.session.created, exits 1 on any close-with-error or timeout.

import 'dotenv/config';
import { RealtimeClient } from '../client.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('FAIL: OPENAI_API_KEY missing from .env');
  process.exit(1);
}

const client = new RealtimeClient({ apiKey });

const timeout = setTimeout(() => {
  console.error('FAIL: timed out waiting for server.session.created (10s)');
  process.exit(1);
}, 10_000);

client.realtime.on('server.session.created', (event) => {
  clearTimeout(timeout);
  console.log('PASS: server.session.created received, session id =', event.session?.id);
  process.exit(0);
});

client.realtime.on('close', ({ error }) => {
  if (error) {
    clearTimeout(timeout);
    console.error('FAIL: WebSocket closed with error before session.created');
    process.exit(1);
  }
});

try {
  await client.connect();
} catch (e) {
  clearTimeout(timeout);
  console.error('FAIL: connect() threw:', e.message);
  process.exit(1);
}
```

- [ ] **Step 5: Run the test — it should now PASS (the patch is the fix)**

Run:
```bash
node src/lib/realtime/__tests__/handshake.test.mjs
```
Expected output (within ~2 seconds):
```
PASS: server.session.created received, session id = sess_...
```
Exit code: 0.

If it instead prints `beta_api_shape_disabled` or any FAIL line, **stop and debug** — the patch in Steps 1–3 was applied incorrectly. Re-read the diff before continuing.

- [ ] **Step 6: Commit**

Run:
```bash
git add src/lib/realtime/api.js src/lib/realtime/__tests__/handshake.test.mjs
git commit -m "$(cat <<'EOF'
fix(realtime): drop disabled Beta handshake (subprotocol + header)

Removes the 'openai-beta.realtime-v1' WebSocket subprotocol and the
'OpenAI-Beta: realtime=v1' header. Both are rejected by OpenAI's GA
gateway with code 'beta_api_shape_disabled'.

Also:
  - honour this.url in the Node branch (was hard-coded to api.openai.com)
  - allow REALTIME_MODEL env var to override the default model
  - add Tier-1 handshake test that connects to wss://api.openai.com
    and exits 0 on server.session.created

The Tier-1 test passes against real OpenAI; before this commit it
returned beta_api_shape_disabled.
EOF
)"
```
Expected: commit succeeds.

---

## Task 3: Patch `conversation.js` — fix `queuedTranscriptItems` lookup

**Files:**
- Modify: `src/lib/realtime/conversation.js:50`

- [ ] **Step 1: Apply the one-line fix**

Open `src/lib/realtime/conversation.js`. Find this block (line 49–51):
```js
      if (this.queuedTranscriptItems[newItem.id]) {
        newItem.formatted.transcript = this.queuedTranscriptItems.transcript;
        delete this.queuedTranscriptItems[newItem.id];
      }
```
Replace with:
```js
      if (this.queuedTranscriptItems[newItem.id]) {
        newItem.formatted.transcript = this.queuedTranscriptItems[newItem.id].transcript;
        delete this.queuedTranscriptItems[newItem.id];
      }
```
(Only `this.queuedTranscriptItems.transcript` → `this.queuedTranscriptItems[newItem.id].transcript`. The condition above already keys by id correctly.)

- [ ] **Step 2: Verify the build still succeeds**

Run:
```bash
npm run build
```
Expected: build completes successfully. (No tests exist for this race; the bug only fires when a VAD-empty transcript arrives before its conversation item — hard to exercise on demand. The Tier-3 manual scenarios in Task 8 cover it indirectly.)

- [ ] **Step 3: Commit**

Run:
```bash
git add src/lib/realtime/conversation.js
git commit -m "$(cat <<'EOF'
fix(realtime): correct queuedTranscriptItems lookup

The body of the queue-drain block read this.queuedTranscriptItems.transcript
instead of this.queuedTranscriptItems[newItem.id].transcript. Today this
silently never attaches a queued transcript; under GA the race is more
visible. Fixed inline while we are vendoring the library.
EOF
)"
```
Expected: commit succeeds.

---

## Task 4: Add the public `index.js` and TypeScript declarations

**Files:**
- Create: `src/lib/realtime/index.js`
- Create: `src/lib/realtime/index.d.ts`

- [ ] **Step 1: Create `src/lib/realtime/index.js`**

Create `src/lib/realtime/index.js` with content:
```js
export { RealtimeClient } from './client.js';
export { RealtimeAPI } from './api.js';
export { RealtimeConversation } from './conversation.js';
export { RealtimeUtils } from './utils.js';
export { RealtimeEventHandler } from './event_handler.js';
```

- [ ] **Step 2: Create `src/lib/realtime/index.d.ts`**

The two layout files import the type `ItemType` from
`@hankswang123/realtime-api-beta/dist/lib/client.js`. The vendored library
ships no types of its own. To avoid touching the giant layout files for
type bookkeeping, declare a permissive `ItemType` here that satisfies
the existing usages (which only reach into properties like `id`, `role`,
`status`, `formatted.audio`, `formatted.text`, `formatted.transcript`,
`formatted.tool`).

Create `src/lib/realtime/index.d.ts` with content:
```ts
// Type declarations for the vendored realtime library.
//
// The upstream JS library ships no .d.ts. Layouts only need ItemType.
// We declare it permissively (any-shaped) — no consumer relies on
// strict typing today and the vendored JS code has no static contract
// to extract types from. If stricter typing is desired later, generate
// types from the JS via `tsc --allowJs --declaration`.

export interface ItemType {
  id: string;
  type: string;
  role?: string;
  status?: string;
  content?: any[];
  formatted?: {
    audio?: Int16Array;
    text?: string;
    transcript?: string;
    tool?: { type: string; name: string; call_id: string; arguments: string };
    output?: string;
    file?: any;
  };
  // Permit any additional fields the underlying library populates.
  [key: string]: any;
}

export class RealtimeClient {
  constructor(options?: { url?: string; apiKey?: string; dangerouslyAllowAPIKeyInBrowser?: boolean; debug?: boolean });
  realtime: any;
  conversation: any;
  tools: any;
  sessionConfig: any;
  connect(): Promise<true>;
  disconnect(): true;
  isConnected(): boolean;
  reset(): true;
  on(eventName: string, handler: (...args: any[]) => any): any;
  off(eventName: string, handler?: (...args: any[]) => any): any;
  updateSession(session?: Record<string, any>): true;
  sendUserMessageContent(content: any[]): true;
  appendInputAudio(arrayBuffer: ArrayBuffer | Int16Array): true;
  createResponse(): true;
  cancelResponse(id: string, sampleCount?: number): { item?: ItemType };
  deleteItem(id: string): true;
  addTool(definition: any, handler: (...args: any[]) => any): { definition: any; handler: any };
  removeTool(name: string): true;
  waitForNextItem(): Promise<{ item: ItemType }>;
  waitForNextCompletedItem(): Promise<{ item: ItemType }>;
}

export class RealtimeAPI {}
export class RealtimeConversation {}
export class RealtimeUtils {}
export class RealtimeEventHandler {}
```

- [ ] **Step 3: Verify the build still succeeds**

Run:
```bash
npm run build
```
Expected: build completes successfully. No imports from `src/lib/realtime/index.js` yet; this confirms the new files don't introduce syntax errors.

- [ ] **Step 4: Commit**

Run:
```bash
git add src/lib/realtime/index.js src/lib/realtime/index.d.ts
git commit -m "$(cat <<'EOF'
feat(realtime): add public re-exports and TypeScript declarations

src/lib/realtime/index.js mirrors the upstream package's public surface.
src/lib/realtime/index.d.ts provides a permissive ItemType for layouts
that import the type directly. The vendored library ships no .d.ts.
EOF
)"
```
Expected: commit succeeds.

---

## Task 5: Switch the relay's import + add the relay integration test

**Files:**
- Modify: `relay-server/lib/relay.js:2`
- Create: `tools/test-relay.mjs`

- [ ] **Step 1: Switch the relay's import to the vendored library**

Open `relay-server/lib/relay.js`. Find line 2:
```js
import { RealtimeClient } from '@hankswang123/realtime-api-beta';
```
Replace with:
```js
import { RealtimeClient } from '../../src/lib/realtime/index.js';
```

- [ ] **Step 2: Create the relay integration test**

Create `tools/test-relay.mjs` with content:
```js
// Tier-2 test: confirm the local relay round-trips a session.update +
// text response through to OpenAI and back.
//
// Pre-requisite: in another shell, run `npm run relay`. The relay must
// be listening on ws://localhost:8081/.
//
// Run from repo root: node tools/test-relay.mjs
// Exits 0 if the model speaks "OK" within 30s, exits 1 otherwise.

import WebSocket from 'ws';

const RELAY = process.env.RELAY_URL || 'ws://localhost:8081/';

const ws = new WebSocket(RELAY, { handshakeTimeout: 10_000 });
let transcript = '';
const t0 = Date.now();

const timeout = setTimeout(() => {
  console.error(`FAIL: timed out after 30s. Transcript so far: ${JSON.stringify(transcript)}`);
  ws.terminate();
  process.exit(1);
}, 30_000);

ws.on('open', () => {
  console.log(`[relay-test] OPEN after ${Date.now() - t0}ms`);
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      instructions: 'Reply with exactly the two letters: OK',
      modalities: ['text'],
      turn_detection: null,
    },
  }));
  ws.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Say OK' }],
    },
  }));
  ws.send(JSON.stringify({ type: 'response.create' }));
});

ws.on('message', (buf) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch {
    return;
  }
  if (msg.type === 'response.text.delta' && typeof msg.delta === 'string') {
    transcript += msg.delta;
  }
  if (msg.type === 'response.audio_transcript.delta' && typeof msg.delta === 'string') {
    transcript += msg.delta;
  }
  if (msg.type === 'response.done' || msg.type === 'response.text.done') {
    if (transcript.toUpperCase().includes('OK')) {
      clearTimeout(timeout);
      console.log(`PASS: model replied with "${transcript.trim()}"`);
      ws.close();
      process.exit(0);
    }
    clearTimeout(timeout);
    console.error(`FAIL: response done but transcript did not contain OK: ${JSON.stringify(transcript)}`);
    ws.close();
    process.exit(1);
  }
  if (msg.type === 'error') {
    clearTimeout(timeout);
    console.error('FAIL: relay returned error event:', JSON.stringify(msg.error));
    ws.close();
    process.exit(1);
  }
});

ws.on('close', (code) => {
  console.log(`[relay-test] CLOSE code=${code} after ${Date.now() - t0}ms`);
});

ws.on('error', (err) => {
  clearTimeout(timeout);
  console.error('FAIL: socket error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Run the relay in a background shell**

In a separate terminal, run:
```bash
cd C:/Users/I058700/Repo/Voice-First
npm run relay
```
Expected: the relay logs `[RealtimeRelay] Listening on ws://localhost:8081`. Leave this terminal running for Step 4.

- [ ] **Step 4: Run the relay integration test**

In your main terminal:
```bash
node tools/test-relay.mjs
```
Expected output (within ~10–15 seconds):
```
[relay-test] OPEN after ...ms
PASS: model replied with "OK..."
```
Exit code: 0.

If it prints `FAIL: relay returned error event` or hits the 30-second timeout, **stop and debug**:
- Check the relay log for `Error connecting to OpenAI: ...`.
- If the relay log shows `beta_api_shape_disabled`, Task 2 was applied incorrectly.
- If the relay log shows `Connected to OpenAI successfully!` but no events flow back, the import in Step 1 of this task was applied incorrectly.

- [ ] **Step 5: Stop the background relay**

In the relay's terminal, press `Ctrl+C`. Confirm the process exits.

- [ ] **Step 6: Commit**

Run:
```bash
git add relay-server/lib/relay.js tools/test-relay.mjs
git commit -m "$(cat <<'EOF'
refactor(relay): use the in-tree vendored RealtimeClient

Switches relay-server/lib/relay.js to import from
../../src/lib/realtime/index.js instead of the dropped npm dependency.
No structural changes to the relay.

Adds tools/test-relay.mjs, a Tier-2 integration test that drives the
local relay end-to-end against OpenAI and asserts the model speaks "OK".
EOF
)"
```
Expected: commit succeeds.

---

## Task 6: Switch the layouts' imports

**Files:**
- Modify: `src/pages/DesktopLayout.tsx:27-28`
- Modify: `src/pages/TabletLayout.tsx:27-28`
- Modify: `src/pages/ConsolePage.tsx:27-28`

- [ ] **Step 1: Update `DesktopLayout.tsx` imports**

Open `src/pages/DesktopLayout.tsx`. Find lines 27–28:
```ts
import { RealtimeClient } from '@hankswang123/realtime-api-beta';
import { ItemType } from '@hankswang123/realtime-api-beta/dist/lib/client.js';
```
Replace with:
```ts
import { RealtimeClient, type ItemType } from '../lib/realtime/index.js';
```

- [ ] **Step 2: Update `TabletLayout.tsx` imports**

Open `src/pages/TabletLayout.tsx`. Find lines 27–28 (identical to Desktop):
```ts
import { RealtimeClient } from '@hankswang123/realtime-api-beta';
import { ItemType } from '@hankswang123/realtime-api-beta/dist/lib/client.js';
```
Replace with:
```ts
import { RealtimeClient, type ItemType } from '../lib/realtime/index.js';
```

- [ ] **Step 3: Update `ConsolePage.tsx` imports (dead code, kept tidy)**

Open `src/pages/ConsolePage.tsx`. Find lines 27–28:
```ts
import { RealtimeClient } from '@hankswang123/realtime-api-beta';
import { ItemType } from '@hankswang123/realtime-api-beta/dist/lib/client.js';
```
Replace with:
```ts
import { RealtimeClient, type ItemType } from '../lib/realtime/index.js';
```

- [ ] **Step 4: Verify the build succeeds**

Run:
```bash
npm run build
```
Expected: build completes successfully — no `Module not found`, no TS errors. CRA's bundler resolves the `.js` extension because of how the vendored files reference each other.

If you see `TS2305: Module ... has no exported member 'ItemType'`, re-check Task 4 Step 2 — the type export in `index.d.ts` is missing or misnamed.

- [ ] **Step 5: Run a quick local smoke test**

Run:
```bash
npm start
```
Expected: both `react-scripts start` (port 3000) and the local server (port 3001) start. Open http://localhost:3000/ in a browser, click the connect button.

Pass condition: the connection-status indicator transitions to "Connected" within ~3 seconds. (Full feature verification happens in Task 8 against the Render preview.)

Stop the dev server with `Ctrl+C` in the terminal afterwards.

- [ ] **Step 6: Commit**

Run:
```bash
git add src/pages/DesktopLayout.tsx src/pages/TabletLayout.tsx src/pages/ConsolePage.tsx
git commit -m "$(cat <<'EOF'
refactor(layouts): import RealtimeClient from the vendored library

Updates the three layout files to import RealtimeClient and the ItemType
type from src/lib/realtime/index.js instead of the dropped npm dependency.
ConsolePage.tsx is currently unmounted (App.tsx commented its route);
its import is updated for tidiness only.
EOF
)"
```
Expected: commit succeeds.

---

## Task 7: Drop the npm dependency + update README

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-updated by `npm install`)
- Modify: `README.md`

- [ ] **Step 1: Remove the dependency from `package.json`**

Open `package.json`. Find this line (currently line 7):
```json
    "@hankswang123/realtime-api-beta": "github:hankswang123/openai-realtime-api-beta#9f3d5b60bc0326d4293d88cf4d84a3aa8cda05ef",
```
Delete the entire line, including the trailing comma.

(After the edit, the next line — `"axios"` — should still be valid JSON. Open `package.json` in your editor and confirm it parses cleanly.)

- [ ] **Step 2: Refresh the lockfile**

Run:
```bash
npm install
```
Expected: npm removes the dropped package and any sub-deps it pulled in. The output mentions removed packages.

- [ ] **Step 3: Verify the codebase has no remaining references**

Run:
```bash
grep -rn "@hankswang123/realtime-api-beta" src/ relay-server/ tools/ package.json
```
Expected: no output (zero references).

- [ ] **Step 4: Verify the build still succeeds**

Run:
```bash
npm run build
```
Expected: build completes successfully.

- [ ] **Step 5: Add the env-var documentation to README**

Open `README.md`. Append (anywhere appropriate — for example, after the existing `Environment Variables` section if there is one, or at the end of the file):
```markdown
## Realtime model selection (optional)

The Realtime client defaults to `gpt-realtime-mini`. To override:

- **Server-side (relay running on Render or locally):** set `REALTIME_MODEL=<model-id>` in the environment.
- **Browser-side (ephemeral-key path only):** set `REACT_APP_REALTIME_MODEL=<model-id>` in `.env` before running `npm run build`.

The relay path used by `voice-first-1.onrender.com` ignores the browser-side variable; only `REALTIME_MODEL` (server-side) takes effect there. Configure it in the Render service's Environment settings.
```

- [ ] **Step 6: Commit**

Run:
```bash
git add package.json package-lock.json README.md
git commit -m "$(cat <<'EOF'
chore: drop @hankswang123/realtime-api-beta dependency + docs

The library is fully vendored at src/lib/realtime/. Drop the npm
dependency, refresh the lockfile, and document the optional
REALTIME_MODEL / REACT_APP_REALTIME_MODEL env vars.

Verified: grep for the package name across src/, relay-server/, tools/,
and package.json returns no matches.
EOF
)"
```
Expected: commit succeeds.

---

## Task 8: Push, open PR, run preview-tier verification

**Files:**
- No file changes; git + Render + manual testing.

- [ ] **Step 1: Push the branch**

Run:
```bash
git push -u origin feature/realtime-ga-migration
```
Expected: push succeeds; GitHub returns a "Create a pull request" URL.

- [ ] **Step 2: Open the PR**

Open the URL from Step 1, or run:
```bash
gh pr create --title "fix(realtime): migrate to OpenAI Realtime GA via in-tree fork" --body "$(cat <<'EOF'
## Why

Production at https://voice-first-1.onrender.com is stuck at "Connect..."
because OpenAI disabled the Realtime Beta API shape. Connecting through
the relay returns:

  {
    "type": "error",
    "code": "beta_api_shape_disabled",
    "message": "The Realtime Beta API is no longer supported.
                Please use /v1/realtime for the GA API."
  }

The library `@hankswang123/realtime-api-beta` (an unmaintained fork of
OpenAI's reference Beta library) negotiates the WebSocket with subprotocol
`openai-beta.realtime-v1` and header `OpenAI-Beta: realtime=v1`. Both are
now rejected by OpenAI's gateway.

## What

Vendor the library into `src/lib/realtime/` and apply a surgical patch to
the handshake. The conversation state machine, audio Int16 stitching,
transcript queuing, function-call dispatch, and interrupt offset math
all ship unchanged — they were already speaking GA-shaped event names.

Net behavioural change: ~30 lines.

## Patch summary

- Drop the `openai-beta.realtime-v1` subprotocol from the browser handshake
- Drop the `OpenAI-Beta: realtime=v1` header from the Node handshake
- Stop hard-coding `wss://api.openai.com/v1/realtime` in the Node branch;
  honour `this.url` so the relay can override
- Allow `REALTIME_MODEL` (Node) and `REACT_APP_REALTIME_MODEL` (browser)
  env vars to override the default `gpt-realtime-mini`
- Fix a latent bug in `queuedTranscriptItems` lookup (line 50 of
  conversation.js)

## Files touched

- `src/lib/realtime/` — new directory, vendored library + 30 lines of edits
- `relay-server/lib/relay.js` — import path swap
- `src/pages/DesktopLayout.tsx` — import path swap
- `src/pages/TabletLayout.tsx` — import path swap
- `src/pages/ConsolePage.tsx` — import path swap (currently unused)
- `package.json` / `package-lock.json` — drop dropped library
- `README.md` — document `REALTIME_MODEL` env var

## How tested

Tier 1 — handshake unit script (`src/lib/realtime/__tests__/handshake.test.mjs`):
- [x] Connects to wss://api.openai.com/v1/realtime
- [x] Receives `server.session.created`
- [x] No `beta_api_shape_disabled` error

Tier 2 — local relay integration (`tools/test-relay.mjs`):
- [x] `npm run relay` accepts browser-side WebSocket
- [x] Round-trips `session.update` + text response
- [x] Receives `response.text.delta` containing expected text

Tier 3 — Render preview (URL: <fill in once preview deploys>):
- [ ] Connect button → Connected within 3s
- [ ] Speak a sentence → audio reply + streaming transcript
- [ ] Interrupt mid-response stops audio within ~200ms
- [ ] "Search YouTube for koalas" tool runs and model speaks the result
- [ ] Reconnect after disconnect works cleanly
- [ ] Both Desktop and Tablet layouts connect

## Rollback

`git revert <merge-commit>` and push. Render auto-deploys the revert.
Service returns to current broken state — no worse than today.

## Out of scope (NOT in this PR)

- Relay simplification
- Migration to ephemeral client tokens
- TypeScript conversion of vendored code
- Adding CI

## Spec

docs/superpowers/specs/2026-05-22-realtime-ga-migration-design.md
EOF
)"
```
Expected: PR is created; the command prints the PR URL.

- [ ] **Step 3: Wait for the Render preview deploy**

In the Render dashboard, the PR triggers a preview build for the `voice-first-1` service. The preview URL takes the form `voice-first-1-pr-<n>.onrender.com`.

Pass condition: the preview build status is "Live" within ~5 minutes. If the build fails, **stop and read the build log**; the most likely cause is a missed import or a TypeScript error not surfaced by `npm run build` locally.

Once live, paste the preview URL into the PR description, replacing `<fill in once preview deploys>`.

- [ ] **Step 4: Run the six manual scenarios on the preview URL**

Open the preview URL in a Chrome tab. Run each scenario in order, recording pass/fail in a scratch markdown file you'll paste into the PR.

| # | Scenario | Pass condition |
|---|---|---|
| 1 | Click the connect button | Status reaches "Connected" within ~3s |
| 2 | Speak: "What is the koala on the cover doing?" | The model speaks an audio reply; the transcript streams in progressively beneath the message |
| 3 | While the model is mid-reply, speak again | Audio playback stops within ~200ms; the new turn begins cleanly |
| 4 | Speak: "Search YouTube for koalas" | The `youtube_search` tool fires; the model speaks the result containing video titles |
| 5 | Click disconnect, then reconnect | Connection re-establishes cleanly; no console errors about leaked listeners or duplicate sockets |
| 6 | Resize the window narrow enough to trigger the tablet layout, then connect | The tablet layout connects successfully (this verifies `TabletLayout.tsx` shares the same code path) |

If any scenario fails, **do NOT merge**. Open the browser console and the Render service logs side-by-side, identify the failing event class, and fix on the branch. Re-run the failing scenario after pushing the fix.

- [ ] **Step 5: Update the PR with the verification log**

Edit the PR description and check the six Tier-3 boxes once they all pass. Paste any noteworthy observations (latency, voice quality changes) under the "Tier 3" heading.

- [ ] **Step 6: Merge the PR**

When all six scenarios pass:
```bash
gh pr merge --squash --delete-branch
```
Or use the GitHub UI's "Squash and merge" button.

(We use squash here so the merged history on `main` is one commit referencing the PR; the five-commit history is preserved on the PR page itself for review.)

Expected: PR merged. Render auto-deploys to `voice-first-1.onrender.com`.

- [ ] **Step 7: Verify production**

Wait for the Render production deploy to go "Live" (~3–5 minutes). Then open `https://voice-first-1.onrender.com/` and re-run scenarios 1, 2, 3, and 5 from Step 4. (Scenarios 4 and 6 are unchanged from preview if they passed there.)

Pass condition: all four scenarios pass on production.

If any fail in production despite passing in preview (rare but possible — env-var differences, model-tier differences):
```bash
git revert <merge-commit-sha> -m 1
git push origin main
```
Render auto-deploys the revert. Service returns to its pre-migration broken state.

- [ ] **Step 8: Watch logs for 5 minutes**

Open the Render service log stream. Confirm there are no recurring `[RealtimeRelay] Error connecting to OpenAI` lines and no recurring browser disconnect/reconnect loops.

If the log is clean, the migration is complete.

---

## Task 9: Cleanup

**Files:**
- No file changes; branch hygiene only.

- [ ] **Step 1: Confirm the local feature branch is gone**

After the squash-merge, the remote branch was deleted. Clean up locally:
```bash
git checkout main
git pull origin main
git branch -d feature/realtime-ga-migration 2>/dev/null || git branch -D feature/realtime-ga-migration
```
Expected: branch deleted. (Use `-D` if `-d` complains about commits not on `main` — squash-merge leaves the original commits orphaned.)

- [ ] **Step 2: Calendar reminder to delete `backup/pre-realtime-ga` after 30 days**

The backup branch from Task 0 is intentional belt-and-suspenders. After 30 days of stable production, delete it:
```bash
# Run in ~30 days, only if production has been stable.
git branch -D backup/pre-realtime-ga
git push origin --delete backup/pre-realtime-ga 2>/dev/null || true
```
(If you forget, it's harmless — the branch just sits there.)

---

## Self-Review Checklist

The plan author ran this before handing the plan over. Re-running on completion:

**Spec coverage:**
- ✅ Architecture (in-tree fork at `src/lib/realtime/`) → Tasks 1, 4
- ✅ Patch 1 (`api.js` handshake) → Task 2
- ✅ Patch 2 (`conversation.js` bug) → Task 3
- ✅ Patch 3 (`index.js`) → Task 4
- ✅ Patch 4 (import swaps × 4) → Tasks 5, 6
- ✅ Patch 5 (drop npm dep) → Task 7
- ✅ Patch 6 (README env-var docs) → Task 7
- ✅ Pre-flight (backup branch + clean tree) → Task 0
- ✅ Tier-1 handshake test → Task 2 Step 4
- ✅ Tier-2 relay integration test → Task 5 Step 2
- ✅ Tier-3 six manual scenarios → Task 8 Step 4
- ✅ PR title and body → Task 8 Step 2
- ✅ Rollback procedure → Task 8 Step 7
- ✅ Branch lifecycle (backup retention) → Task 0, Task 9

**Type consistency:**
- ✅ `RealtimeClient` is the only public symbol the layouts import as a runtime value; same name everywhere.
- ✅ `ItemType` is exported as a type from `index.d.ts` and consumed via `import { type ItemType }` in three layouts.
- ✅ `REALTIME_MODEL` (server) vs `REACT_APP_REALTIME_MODEL` (browser) — both spelled identically wherever they appear.

**Placeholder scan:**
- One intentional placeholder: `<fill in once preview deploys>` in the PR body (Task 8 Step 2). Replaced in Task 8 Step 3.
- No `TODO`/`TBD`/`fill in details`/`appropriate error handling`/`similar to Task N` strings in any task body.
