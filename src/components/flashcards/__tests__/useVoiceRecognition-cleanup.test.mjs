// Regression tests for the cleanup-safety contract that useVoiceRecognition
// relies on. These tests do NOT render React — instead they directly exercise
// the underlying library primitives in the exact sequence the hook performs,
// reproducing the React 18 StrictMode race that triggered the runtime overlay.
//
// Run from repo root:
//   node --test src/components/flashcards/__tests__/useVoiceRecognition-cleanup.test.mjs
//
// Why these tests exist:
// - The voice-flashcards hook lives next to a parent layout (DesktopLayout)
//   whose own effect cleanup calls `client.reset()`, which clears every
//   registered event handler.
// - StrictMode runs each effect's cleanup synchronously between mount and
//   re-mount in dev, so the parent's cleanup can wipe handlers BEFORE the
//   child's cleanup tries to remove its own handler — `RealtimeClient.off`
//   then throws "not found as a listener".
// - Similarly, `WavRecorder.pause()` throws "Session ended: please call
//   .begin() first" if the cleanup runs before .begin() ever ran.
//
// These tests pin both invariants and prove that our defensive cleanup
// pattern (try/catch around .off, and a processor/recording guard around
// .pause) eliminates both throws.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RealtimeClient } from '../../../lib/realtime/index.js';
import { WavRecorder } from '../../../lib/wavetools/lib/wav_recorder.js';

// ---------------------------------------------------------------------------
// Section 1: Document the library contract — these throws are by design.
// If either of these tests starts failing, the upstream library changed
// and our defensive guards may be redundant or insufficient.
// ---------------------------------------------------------------------------

test('library contract: WavRecorder.pause() before begin() throws "Session ended"', async () => {
  const recorder = new WavRecorder({ sampleRate: 24000 });
  await assert.rejects(
    () => recorder.pause(),
    /Session ended: please call \.begin\(\) first/,
  );
});

test('library contract: RealtimeClient.off() after clearEventHandlers() throws', () => {
  const client = new RealtimeClient({ apiKey: 'test-key', dangerouslyAllowAPIKeyInBrowser: true });
  const handler = () => {};
  client.on('conversation.item.completed', handler);
  // Simulate parent layout's `client.reset()` wiping handlers first.
  client.clearEventHandlers();
  assert.throws(
    () => client.off('conversation.item.completed', handler),
    /Could not turn off specified event listener/,
  );
});

// ---------------------------------------------------------------------------
// Section 2: Hook cleanup contract — the patterns useVoiceRecognition
// actually applies. These mirror the inline cleanup blocks in
// src/components/flashcards/useVoiceRecognition.ts and must keep passing.
// ---------------------------------------------------------------------------

/**
 * Mirrors the WavRecorder cleanup block from useVoiceRecognition's init effect.
 * The real hook runs this inside a useEffect's cleanup; we extract the
 * essential conditional so it can be exercised directly in node.
 */
function safePauseRecorder(recorder) {
  if (recorder.processor && recorder.recording) {
    return recorder.pause().catch(() => { /* noop */ });
  }
  return Promise.resolve();
}

/**
 * Mirrors the RealtimeClient cleanup block from useVoiceRecognition's
 * listener-effect cleanup.
 */
function safeOffClient(client, eventName, handler) {
  try {
    client.off(eventName, handler);
  } catch {
    /* noop: already cleared */
  }
}

test('hook cleanup: safePauseRecorder() does not throw when begin() never ran', async () => {
  const recorder = new WavRecorder({ sampleRate: 24000 });
  // No begin() — processor stays null. The unfixed hook would throw here.
  await assert.doesNotReject(() => safePauseRecorder(recorder));
});

test('hook cleanup: safeOffClient() does not throw after parent reset()-equivalent', () => {
  const client = new RealtimeClient({ apiKey: 'test-key', dangerouslyAllowAPIKeyInBrowser: true });
  const handler = () => {};
  client.on('conversation.item.completed', handler);
  // Parent layout's cleanup wins the race in StrictMode.
  client.clearEventHandlers();
  // The unfixed hook would throw here.
  assert.doesNotThrow(() => safeOffClient(client, 'conversation.item.completed', handler));
});

test('hook cleanup: safeOffClient() still removes the listener on the happy path', () => {
  const client = new RealtimeClient({ apiKey: 'test-key', dangerouslyAllowAPIKeyInBrowser: true });
  let calls = 0;
  const handler = () => { calls += 1; };
  client.on('conversation.item.completed', handler);
  safeOffClient(client, 'conversation.item.completed', handler);
  // After off(), dispatching should not invoke the handler.
  client.dispatch('conversation.item.completed', { item: { id: 'x' } });
  assert.equal(calls, 0, 'handler should be removed on the normal path');
});

test('hook cleanup: full StrictMode-ish sequence does not surface either error', async () => {
  // Simulate the exact event order the runtime overlay surfaced:
  //   parent mounts -> child mounts (registers handler, constructs recorder)
  //   parent unmount-cleanup runs FIRST  (clears handlers)
  //   child unmount-cleanup runs SECOND  (off + pause must be safe)
  //   parent re-mounts and child re-mounts (StrictMode echo)
  const client = new RealtimeClient({ apiKey: 'test-key', dangerouslyAllowAPIKeyInBrowser: true });
  const recorder = new WavRecorder({ sampleRate: 24000 });
  const handler = () => {};

  // Child mount
  client.on('conversation.item.completed', handler);
  // recorder.begin() is intentionally NOT called — replicates "user enabled
  // voice mode but never pressed mic" before unmount.

  // Parent unmount: client.reset() ≅ disconnect + clearEventHandlers
  client.clearEventHandlers();

  // Child unmount: must be silent
  await assert.doesNotReject(async () => {
    await safePauseRecorder(recorder);
    safeOffClient(client, 'conversation.item.completed', handler);
  });
});
