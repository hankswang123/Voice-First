// TDD regression test for the "no score after recording" bug.
//
// Hypothesis under test:
// When the parent layout configures the shared RealtimeClient with
// `voice: "alloy"` and modalities defaulting to ['text','audio'], the
// assistant's reply arrives as audio with a transcript. The transcript text
// lives in `item.formatted.transcript` while `item.formatted.text` stays
// empty. The current useVoiceRecognition listener filter only checks
// `formatted.text`, so the score event is silently dropped.
//
// This test simulates that scenario by dispatching a synthetic
// `conversation.item.completed` event whose item has the JSON score in
// `formatted.transcript` (text empty), and asserts that the hook's parser
// extracts the score and calls onResult.
//
// EXPECTED RESULT BEFORE FIX (RED):
//   - parsePronunciationScore returns null because it looks at .text only
// EXPECTED RESULT AFTER FIX (GREEN):
//   - parsePronunciationScore returns {score: 88, feedback: ..., stars: 4}
//
// Run from repo root:
//   node --test src/components/flashcards/__tests__/score-from-transcript.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePronunciationScore } from '../scoreParser.js';

test('extracts score from formatted.transcript when text is empty (audio-mode reply)', () => {
  // Simulates what arrives when the AI replies in audio mode with TTS voice:
  // - formatted.text is the empty string (no text-delta events fired)
  // - formatted.transcript holds the spoken-aloud text including JSON
  const item = {
    role: 'assistant',
    formatted: {
      text: '',
      transcript: '{"score": 88, "feedback": "Great job!", "stars": 4}',
    },
  };

  const result = parsePronunciationScore(item);

  assert.equal(result?.score, 88);
  assert.equal(result?.feedback, 'Great job!');
  assert.equal(result?.stars, 4);
});

test('extracts score from formatted.text when present (legacy text-mode reply)', () => {
  // Backward compatibility: text-only mode still works.
  const item = {
    role: 'assistant',
    formatted: {
      text: '{"score": 75, "feedback": "Good!", "stars": 3}',
      transcript: '',
    },
  };

  const result = parsePronunciationScore(item);

  assert.equal(result?.score, 75);
  assert.equal(result?.feedback, 'Good!');
  assert.equal(result?.stars, 3);
});

test('extracts score from JSON embedded in prose transcript', () => {
  // The AI voiced an explanation around the JSON (which can happen).
  const item = {
    role: 'assistant',
    formatted: {
      text: '',
      transcript: 'Here is your score: {"score": 92, "feedback": "Wow!", "stars": 5} Great work!',
    },
  };

  const result = parsePronunciationScore(item);

  assert.equal(result?.score, 92);
  assert.equal(result?.stars, 5);
});

test('returns null for non-assistant items (user messages)', () => {
  const item = {
    role: 'user',
    formatted: { text: '{"score": 100}', transcript: '' },
  };

  assert.equal(parsePronunciationScore(item), null);
});

test('returns null when both text and transcript are empty', () => {
  const item = {
    role: 'assistant',
    formatted: { text: '', transcript: '' },
  };

  assert.equal(parsePronunciationScore(item), null);
});

test('clamps score to 0..100 range', () => {
  const item = {
    role: 'assistant',
    formatted: {
      text: '',
      transcript: '{"score": 150, "feedback": "x", "stars": 5}',
    },
  };

  assert.equal(parsePronunciationScore(item)?.score, 100);

  const negative = {
    role: 'assistant',
    formatted: {
      text: '',
      transcript: '{"score": -10, "feedback": "x", "stars": 1}',
    },
  };

  assert.equal(parsePronunciationScore(negative)?.score, 0);
});

test('clamps stars to 1..5 range', () => {
  const item = {
    role: 'assistant',
    formatted: {
      text: '',
      transcript: '{"score": 50, "feedback": "x", "stars": 99}',
    },
  };

  assert.equal(parsePronunciationScore(item)?.stars, 5);
});
