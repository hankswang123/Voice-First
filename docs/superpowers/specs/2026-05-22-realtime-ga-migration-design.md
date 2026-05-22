# Realtime GA Migration — Design

**Date:** 2026-05-22
**Status:** Approved (pending written-spec review)
**Owner:** Voice-First maintainer

---

## Summary

Production at `https://voice-first-1.onrender.com` is stuck at "Connect..." because OpenAI disabled the Realtime Beta API wire shape. The library `@hankswang123/realtime-api-beta` (an unmaintained fork pinned to a github commit) negotiates the WebSocket with subprotocol `openai-beta.realtime-v1` and header `OpenAI-Beta: realtime=v1`. Both are now rejected by OpenAI's gateway with:

```
{
  "type": "error",
  "code": "beta_api_shape_disabled",
  "message": "The Realtime Beta API is no longer supported.
              Please use /v1/realtime for the GA API."
}
```

This design migrates the project to OpenAI's Realtime GA API by **vendoring the library in-tree** (`src/lib/realtime/`) and applying a surgical patch to the handshake. The conversation state machine, audio Int16 stitching, transcript queuing, function-call dispatch, and interrupt offset math ship unchanged — they were already speaking GA-shaped event names. Net behavioural change: **~30 lines**.

---

## Goal

Restore voice-realtime functionality on `voice-first-1.onrender.com` with the smallest possible change, preserving:

- All event subscriptions in `DesktopLayout.tsx` and `TabletLayout.tsx`.
- All registered tools (12 desktop, 9 tablet).
- Audio capture (`wavRecorder`) and playback (`wavStreamPlayer`) untouched.
- The relay server's structure and security model.

## Non-goals

- Relay simplification or rewrite.
- Migration to ephemeral client tokens.
- TypeScript conversion of vendored library code.
- Adding CI.
- Refactoring `DesktopLayout.tsx` or `TabletLayout.tsx`.
- Adopting `@openai/agents/realtime` or any new realtime SDK.

---

## Architecture

### Decision: in-tree fork (Option A1)

We vendor the existing library into the repo and patch the handshake. This was chosen over (A2) writing a new adapter from scratch and (B) full SDK swap. The decision rests on a key finding from a deep read of the library's 1,437 lines: **its inbound `EventProcessors` already speak GA-shaped event names** (`response.audio.delta`, `conversation.item.created`, `response.function_call_arguments.delta`, etc.). The Beta-vs-GA breakage is at the *handshake*, not at the event-stream level.

A new adapter would re-implement ~300–420 lines of conversation state management — risking subtle regressions in audio accumulation and interrupt offset math. The vendored fork preserves that proven logic verbatim.

### Final shape

```
src/lib/realtime/                          ← NEW (vendored, 5 files copied + 1 new)
   ├── api.js              ← copied from beta lib, patched handshake
   ├── client.js           ← copied verbatim
   ├── conversation.js     ← copied verbatim, one-line bug fix
   ├── event_handler.js    ← copied verbatim
   ├── utils.js            ← copied verbatim
   ├── index.js            ← NEW: re-exports RealtimeClient
   └── README.md           ← NEW: notes this is vendored code

relay-server/lib/relay.js                  ← import path swap only
src/pages/DesktopLayout.tsx                 ← import path swap only
src/pages/TabletLayout.tsx                  ← import path swap only
src/pages/ConsolePage.tsx                   ← import path swap (currently unused)
package.json                                ← drop @hankswang123/realtime-api-beta
```

### Boundaries and contracts

- **`src/lib/realtime/index.js` is the only public symbol** anything else in the repo imports. The five inner files are an implementation detail.
- **The relay's contract with the browser is unchanged.** It still receives JSON events on the WebSocket, still relays them, still hides the API key.
- **The layouts' contract with `RealtimeClient` is unchanged.** Same `.on(...)`, `.sendUserMessageContent(...)`, `.appendInputAudio(...)`, `.updateSession(...)`, `.addTool(...)`, `.cancelResponse(...)`, `.deleteItem(...)`, `.conversation.getItems()`, `.realtime.on('server.*', ...)`, `.realtime.connect({ model })`, `.isConnected()`. Zero call-site changes.
- **Conversation state machine, audio Int16 stitching, transcript queueing, function-call auto-dispatch, interrupt offset math** — all preserved verbatim.

---

## The exact patch

### Patch 1 — `src/lib/realtime/api.js` (handshake)

#### Change A — model defaulting (line 59)

Before:
```js
async connect({ model } = { model: 'gpt-realtime-mini' }) {
```

After:
```js
async connect({ model } = {}) {
  model = model
    || (typeof process !== 'undefined' && process.env && process.env.REALTIME_MODEL)
    || 'gpt-realtime-mini';
```

The relay can now pick a model up from its server-side env var without a code change. The relay's `index.js` doesn't currently pass a model — leaving its caller untouched.

#### Change B — Browser handshake

Before:
```js
const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ''}`, [
  'realtime',
  `openai-insecure-api-key.${this.apiKey}`,
  'openai-beta.realtime-v1',
]);
```

After:
```js
const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ''}`, [
  'realtime',
  `openai-insecure-api-key.${this.apiKey}`,
]);
```

The `openai-beta.realtime-v1` subprotocol is what triggered `beta_api_shape_disabled`.

#### Change C — Node handshake

Before:
```js
const ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, [], {
  finishRequest: (request) => {
    request.setHeader('Authorization', `Bearer ${this.apiKey}`);
    request.setHeader('OpenAI-Beta', 'realtime=v1');
    request.end();
  },
});
```

After:
```js
const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ''}`, [], {
  finishRequest: (request) => {
    request.setHeader('Authorization', `Bearer ${this.apiKey}`);
    request.end();
  },
});
```

Two changes:
1. Hard-coded URL replaced by `this.url` so a relay deployment can override.
2. `OpenAI-Beta: realtime=v1` header removed — the second cause of `beta_api_shape_disabled`.

### Patch 2 — `src/lib/realtime/conversation.js` (one bug fix)

Line 50 today:
```js
newItem.formatted.transcript = this.queuedTranscriptItems.transcript;
```

After:
```js
newItem.formatted.transcript = this.queuedTranscriptItems[newItem.id].transcript;
```

The queue is keyed by item id, not a flat object. Today this silently does nothing; GA may surface this race more often, so we fix it while we're vendoring.

### Patch 3 — `src/lib/realtime/index.js` (new file)

```js
export { RealtimeClient } from './client.js';
export { RealtimeAPI } from './api.js';
export { RealtimeConversation } from './conversation.js';
export { RealtimeUtils } from './utils.js';
export { RealtimeEventHandler } from './event_handler.js';
```

### Patch 4 — Import updates (4 sites)

| File | Today | After |
|---|---|---|
| `relay-server/lib/relay.js:2` | `from '@hankswang123/realtime-api-beta'` | `from '../../src/lib/realtime/index.js'` |
| `src/pages/DesktopLayout.tsx` | same | `from '../lib/realtime/index.js'` |
| `src/pages/TabletLayout.tsx` | same | same |
| `src/pages/ConsolePage.tsx` | same | same (currently unused) |

### Patch 5 — `package.json`

Remove from `dependencies`:
```json
"@hankswang123/realtime-api-beta": "github:hankswang123/openai-realtime-api-beta#9f3d5b60bc0326d4293d88cf4d84a3aa8cda05ef"
```

Run `npm install` once to refresh the lockfile.

### Patch 6 — Documentation

Add to `README.md`:
```
## Realtime model selection (optional)

Defaults to gpt-realtime-mini. To override:

  - Server-side (relay): REALTIME_MODEL=gpt-realtime-mini
  - Browser-side (ephemeral key path): REACT_APP_REALTIME_MODEL=gpt-realtime-mini
```

### Diff size summary

| Category | Lines |
|---|---|
| Vendored code copied verbatim | ~1,400 |
| Lines actually edited (Beta → GA + bug fix) | **~30** |
| New `index.js` re-exports | 5 |
| Import path changes across 4 files | 4 |
| `package.json` and docs | ~5 |
| **Net behavioural change** | **~30 lines + 1 deleted dependency** |

---

## Relay strategy

`relay-server/lib/relay.js` keeps its current shape. The only edit is the import line:

```js
import { RealtimeClient } from '../../src/lib/realtime/index.js';
```

Reasons for *not* simplifying the relay in this PR:

1. The relay's job is non-trivial despite looking simple. It hides `OPENAI_API_KEY` from the browser, validates the upgrade path, queues client messages until the upstream connection is open, and translates close events.
2. Keeping the same `RealtimeClient` on relay and browser sides means a future GA event-shape change is fixed in one place and both sides pick it up.
3. It's outside the goal. Relay simplification is unrelated to the broken handshake.

### Render deployment surface

| Var | Where set | Default if absent |
|---|---|---|
| `OPENAI_API_KEY` | Render env | (none — fail-fast in `relay-server/index.js`) |
| `REALTIME_MODEL` | Render env (optional) | `gpt-realtime-mini` |
| `PORT` | Render env (auto) | `8081` for local |

Render dashboard handles `REALTIME_MODEL`. No `render.yaml` change required.

---

## Migration steps and verification

### Pre-flight

1. Confirm Render preview deploys are enabled for the `voice-first-1` service.
2. Decide once whether to set `REALTIME_MODEL` or leave it unset (defaults to `gpt-realtime-mini`).
3. Create `backup/pre-realtime-ga` branch pointing at current `main` for emergency rollback.

### Execution sequence

| Step | Action | Verification |
|---|---|---|
| 1 | Create `feature/realtime-ga-migration`. Copy 5 vendored files + add `index.js` + README stub. | `npm run build` still succeeds (nothing imports from new dir yet). |
| 2 | Apply Patch 1 to `src/lib/realtime/api.js`. | Run `src/lib/realtime/__tests__/handshake.test.mjs` against real OpenAI — must receive `server.session.created`, no `beta_api_shape_disabled`. |
| 3 | Apply Patch 2 to `src/lib/realtime/conversation.js`. | Build still succeeds. |
| 4 | Add `src/lib/realtime/index.js`. | Build succeeds, ESLint/TS clean. |
| 5 | Switch `relay-server/lib/relay.js` import. | `npm run relay` + `tools/test-relay.mjs` from another shell — must round-trip a session.update + text response. |
| 6 | Switch layout imports (Desktop, Tablet, Console). | `npm run build` clean. `npm start` connects locally. |
| 7 | Remove `@hankswang123/realtime-api-beta` from `package.json`, run `npm install`. | `grep -r "@hankswang123/realtime-api-beta" src/ relay-server/` returns nothing. |
| 8 | Push branch, open PR. | Render preview URL builds. |
| 9 | Run six manual scenarios on the preview URL. | All six pass (see scenario table below). |
| 10 | Merge to `main`. Render auto-deploys to prod. | Repeat the six scenarios on prod. Watch Render logs for ~5 min. |

### Six manual scenarios (Step 9 / 10)

| # | Scenario | Pass condition | Tests which Beta-synthesized event |
|---|---|---|---|
| 1 | Click connect button | Status reaches Connected within 3s | `realtime.event` (session.created) |
| 2 | Speak a sentence | Audio reply + streaming transcript | `conversation.updated` with `delta.audio` and `delta.transcript` |
| 3 | Speak mid-response | Audio stops within ~200ms | `conversation.interrupted` + `cancelResponse` offset math |
| 4 | "Search YouTube for koalas" | Tool runs, model speaks the result | `addTool` chain + auto `function_call_output` + `response.create` |
| 5 | Reconnect after disconnect | Reconnects cleanly, no leaked sockets | `disconnect()` → `connect()` lifecycle |
| 6 | Open Desktop and Tablet layouts | Both routes connect successfully | Same `RealtimeClient` works from both |

If any scenario fails, the verification log goes in the PR. Do NOT merge until all six pass.

---

## Testing strategy

### Test 1 — Handshake unit script

**Location:** `src/lib/realtime/__tests__/handshake.test.mjs`
**Committed in:** commit 2 (alongside the handshake patch).
**Goal:** Prove the patched `api.js` opens a GA-compatible WebSocket.
**Dependency-free Node script** — runnable as `node …`, no Jest.

What it does:
1. Loads `OPENAI_API_KEY` from `.env`.
2. Instantiates `RealtimeClient` with the API key directly (skips the relay).
3. Subscribes to `server.session.created` (success) and `close` (failure).
4. Calls `connect()` and waits up to 10 seconds.
5. Exits 0 on session created, exits 1 on any close-with-error.

When to run: Step 2 of the execution sequence; any time `api.js` is touched.
Cost: ~2 seconds, minimal API spend.

### Test 2 — Local relay integration script

**Location:** `tools/test-relay.mjs` (outside `src/` so CRA doesn't bundle it).
**Committed in:** commit 4 (alongside the relay-import switch).
**Goal:** Prove the relay accepts a browser connection and round-trips through to OpenAI.

What it does:
1. Assumes `npm run relay` is running on port 8081.
2. Opens `ws://localhost:8081/realtime`.
3. Sends a minimal `session.update`.
4. Sends `conversation.item.create` with `input_text: "say OK"`.
5. Sends `response.create`.
6. Waits for `server.response.audio_transcript.delta` containing "OK".
7. Exits 0 on success.

When to run: Step 5 of the execution sequence.
Cost: ~5 seconds, ~500 tokens of API spend.

### Test 3 — Six manual scenarios on Render preview

The six scenarios in the execution-sequence table above. This layer catches anything Tests 1 and 2 miss (event-shape regressions specific to the layouts).

### What we explicitly do NOT test

- Unit tests for `client.js` / `conversation.js` / `event_handler.js` / `utils.js`. These are vendored verbatim. A new test would only document existing behaviour.
- Mocked WebSocket tests. The bug we're fixing is *literally* the OpenAI server's response — mocking defeats the test's purpose.
- Cypress / Playwright UI tests. None exist today; adding them is unrelated work.
- Load tests / latency benchmarks.
- Tests for the audio worklet, `wavRecorder`, `wavStreamPlayer`. Untouched code.

### CI considerations

The repo currently has no CI workflow. We do **not** add one in this PR; it's scope creep. The two test scripts run manually before merge. CI deserves its own PR if you want it later.

---

## PR shape

### Commit plan

Five clean commits so the diff tells a coherent story:

| # | Subject | Files |
|---|---|---|
| 1 | `chore(realtime): vendor @hankswang123/realtime-api-beta into src/lib/realtime` | 5 copied files + new `index.js` + tiny README |
| 2 | `fix(realtime): drop disabled Beta handshake (subprotocol + header)` | `src/lib/realtime/api.js` only + handshake test |
| 3 | `fix(realtime): correct queuedTranscriptItems lookup` | `src/lib/realtime/conversation.js` only |
| 4 | `refactor(realtime): switch app and relay to vendored client` | `relay-server/lib/relay.js`, 3 layouts + relay test |
| 5 | `chore: drop @hankswang123/realtime-api-beta dependency + docs` | `package.json`, `package-lock.json`, README |

### PR title

```
fix(realtime): migrate to OpenAI Realtime GA via in-tree fork
```

### PR description

```markdown
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
- [ ] Connects to wss://api.openai.com/v1/realtime
- [ ] Receives `server.session.created`
- [ ] No `beta_api_shape_disabled` error

Tier 2 — local relay integration (`tools/test-relay.mjs`):
- [ ] `npm run relay` accepts browser-side WebSocket
- [ ] Round-trips `session.update` + text response
- [ ] Receives `server.response.audio_transcript.delta` containing expected text

Tier 3 — Render preview (URL: <fill in when preview deploys>):
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
```

### Rollback procedure

| Stage | Symptom | Action |
|---|---|---|
| Render preview build fails | Preview URL 502 / build error | Don't merge. Fix on the branch. |
| Render preview connect hangs | "Connect..." persists on preview URL | Don't merge. Run handshake test (Tier 1) directly against OpenAI to isolate. |
| Tools partially work, audio glitches | Some scenarios pass, some fail | Don't merge. Inspect Render preview logs; identify which `EventProcessors` entry mismatches GA. |
| Post-merge regression | Production breaks differently than today | `git revert <merge-commit>` immediately, push. Render redeploys. Re-open the branch. |
| Post-merge non-regression bug | Fix-forward in a follow-up PR (not a revert) | Adjust `conversation.js` or `api.js` and re-run the same test pyramid. |

### Branch lifecycle

```
main (broken in prod)
  │
  ├──► feature/realtime-ga-migration   ← 5 commits per the plan
  │       │
  │       ├── PR opened ──► Render preview builds
  │       ├── Tier 1 test green
  │       ├── Tier 2 test green
  │       ├── Tier 3 (6 manual scenarios) green on preview URL
  │       │
  │       └──► Merge to main
  │
  └── (post-merge) backup branch backup/pre-realtime-ga retained for 30 days
```

After 30 days, delete `backup/pre-realtime-ga`.

### Final scope summary

| Metric | Count |
|---|---|
| Net lines of behavioural change | ~30 |
| Lines copied verbatim | ~1,400 |
| New files | 7 (5 vendored + index.js + handshake test + relay test + README stub) |
| Files edited | 7 (api.js, conversation.js, relay.js, 3 layouts, package.json) |
| Dependencies removed | 1 (`@hankswang123/realtime-api-beta`) |
| Dependencies added | 0 |
| Commits in PR | 5 |
| Manual verification scenarios | 6 |
| Estimated dev time end-to-end | 2–3 hours including verification |

---

## Discovered during implementation

The plan estimated "~30 lines of net behavioural change." The actual figure is **~80 lines** because Tier-2 testing surfaced four GA-shape divergences that the protocol-side analysis (handshake-only) missed. Each was patched as its own commit on `feature/realtime-ga-migration`:

| # | Commit | GA divergence | Remedy |
|---|---|---|---|
| 1 | `5354cdc` | GA's `session.update` rejects 8 Beta-only fields (`modalities`, `voice`, `input_audio_format`, `output_audio_format`, `input_audio_transcription`, `turn_detection`, `temperature`, `max_response_output_tokens`) as unknown parameters. | `client.js`: strip the 8 fields from the payload before `realtime.send('session.update', ...)`. Defensive — keeps `this.sessionConfig` schema intact for the layouts. |
| 2 | `820e605` | `server.conversation.item.created` was renamed to `server.conversation.item.added` in GA. GA also emits a new `server.conversation.item.done`. | Wire both `.created` and `.added` names to the same handler in `client.js` and `conversation.js` `EventProcessors`. Treat `.done` as a status-only update. |
| 3 | `0e60534` | Audio streaming events were prefixed with `output_` in GA: `response.audio.delta` → `response.output_audio.delta`; `response.audio_transcript.delta` → `response.output_audio_transcript.delta`. | Wire the GA names alongside the Beta names in `client.js` and add aliases to `EventProcessors` in `conversation.js`. |
| 4 | `2db0f20` | GA requires `session.type` (`'realtime'` for audio sessions, `'transcription'` for transcribe-only). Beta did not. | `client.js`: inject `session.type = 'realtime'` if not provided. |

**Pattern to notice:** the divergences split into two classes — _outbound payload shape_ (1, 4) and _inbound event names_ (2, 3). All four were found by extending `tools/test-relay.mjs` from a single text-response probe into four probes covering text, tool calls, mid-response cancel, and graceful close. The four-probe suite passes end-to-end against real OpenAI.

**Layout files were never touched** to fix any of these. The fixes all live in the vendored library, which validates the in-tree fork architecture choice (Option A1) — every divergence is a single library-internal patch, not a layout-by-layout migration.

**Implication for future GA changes:** when OpenAI evolves the Realtime API further, the same playbook applies — extend the Tier-2 probe, identify the divergence, patch `client.js` or `conversation.js`, commit. No layout work required.

## Risk register

| Risk | Likelihood at planning | Outcome |
|---|---|---|
| GA rejects the new handshake too (some other field we missed) | Low | **Did not occur.** Tier-1 handshake passed first try. |
| GA renamed an inbound event the library handles | Low–Med | **Materialized.** Three event renames (see "Discovered during implementation" above). All fixed via aliases in `client.js` and `conversation.js`. |
| GA-only outbound payload requirements (not in plan's risk register) | (not anticipated) | **Materialized.** Two outbound shape changes — `session.type` required, 8 session fields rejected. Fixed in `client.js`. |
| Render's preview deploy doesn't pick up env var changes | Low | TBD — deferred to Tier-3 verification on the preview deploy. |
| Vendored code drift from upstream | N/A | Upstream is unmaintained against a disabled API. There is no upstream to drift from. |

## Source of truth

- OpenAI gateway error message itself: `beta_api_shape_disabled`, "The Realtime Beta API is no longer supported. Please use /v1/realtime for the GA API."
- Library source read in full: 1,437 lines across 5 files in `node_modules/@hankswang123/realtime-api-beta/lib/`.
