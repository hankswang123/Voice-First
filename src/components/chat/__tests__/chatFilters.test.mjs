// Tests for the chat-history filtering helpers used by both Chat
// variants (chat/ for tablet, chat_desktop/ for desktop) to hide
// internal-protocol messages from the user-facing chat history.
//
// Run from repo root:
//   node --test src/components/chat/__tests__/chatFilters.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isInternalProtocolUserPrompt,
  isPronunciationScoreReply,
} from '../chatFilters.js';

// -----------------------------------------------------------------------
// isInternalProtocolUserPrompt
// -----------------------------------------------------------------------

test('user prompt: hides Pronunciation scoring task prompt', () => {
  const text = `Pronunciation scoring task. The expected word/phrase is: "markhor".
The child just spoke. Score their pronunciation accuracy from 0-100.
Reply with JSON only: {"score": <number>, "feedback": "<short encouraging message>", "stars": <1-5>}`;
  assert.equal(isInternalProtocolUserPrompt(text), true);
});

test('user prompt: hides existing Read Aloud / Translate / wordcard / SyntaxAnalyze prompts', () => {
  assert.equal(isInternalProtocolUserPrompt('Read Aloud: hello world'), true);
  assert.equal(isInternalProtocolUserPrompt('Translate: bonjour'), true);
  assert.equal(isInternalProtocolUserPrompt('wordcard: oryx'), true);
  assert.equal(isInternalProtocolUserPrompt('SyntaxAnalyze: this is a sentence'), true);
});

test('user prompt: shows ordinary chat messages', () => {
  assert.equal(isInternalProtocolUserPrompt('What is the meaning of life?'), false);
  assert.equal(isInternalProtocolUserPrompt('Tell me a story'), false);
  assert.equal(isInternalProtocolUserPrompt(''), false);
  assert.equal(isInternalProtocolUserPrompt(undefined), false);
});

// -----------------------------------------------------------------------
// isPronunciationScoreReply
// -----------------------------------------------------------------------

test('assistant reply: hides strict JSON score replies', () => {
  const text = '{"score": 85, "feedback": "Great job!", "stars": 4}';
  assert.equal(isPronunciationScoreReply(text), true);
});

test('assistant reply: hides JSON embedded in prose (the actual screenshot scenario)', () => {
  const text = `Got it! I'll be scoring the pronunciation now.

Here's the feedback in JSON format:

{
  "score": 65,
  "feedback": "Good attempt! Let's work on clarity and rhythm.",
  "stars": 3
}`;
  assert.equal(isPronunciationScoreReply(text), true);
});

test('assistant reply: shows ordinary chat replies', () => {
  assert.equal(isPronunciationScoreReply('Hello! How can I help you today?'), false);
  assert.equal(isPronunciationScoreReply('The capital of France is Paris.'), false);
  assert.equal(isPronunciationScoreReply(''), false);
});

test('assistant reply: does NOT hide when JSON has only some required keys', () => {
  // Just a number doesn't qualify
  assert.equal(isPronunciationScoreReply('Your score is 85'), false);
  // Partial JSON missing keys
  assert.equal(isPronunciationScoreReply('{"score": 85}'), false);
  assert.equal(isPronunciationScoreReply('{"score": 85, "feedback": "Good"}'), false);
  // Wrong types
  assert.equal(isPronunciationScoreReply('{"score": "85", "feedback": "Good", "stars": 4}'), false);
});

test('assistant reply: tolerates malformed JSON gracefully', () => {
  assert.equal(isPronunciationScoreReply('{score: 85, broken'), false);
  assert.equal(isPronunciationScoreReply('}'), false);
});
