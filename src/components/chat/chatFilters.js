// Tiny shared helpers for filtering out internal-protocol messages from
// the chat history rendering. Centralised so both desktop and tablet
// chat variants apply the same rules.
//
// "Internal protocol" = messages our app sends/receives over the
// RealtimeClient as part of features (Read Aloud, Translate, Pronunciation
// Scoring) that the user shouldn't see as conversational chat turns.

/**
 * Returns true when the user-prompt text is one of our internal protocol
 * prompts and should NOT be rendered in the chat history.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isInternalProtocolUserPrompt(text) {
  if (!text) return false;
  return (
    text.includes('Read Aloud:') ||
    text.includes('Translate:') ||
    text.includes('wordcard:') ||
    text.includes('SyntaxAnalyze:') ||
    text.includes('Pronunciation scoring task')
  );
}

/**
 * Returns true when the assistant-reply text is the JSON response to a
 * pronunciation-scoring prompt and should NOT be rendered in the chat.
 *
 * Detects strict JSON shape (score + feedback + stars keys) inside the
 * text. Accepts JSON either standalone or embedded in prose, matching
 * the scoreParser tolerance.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isPronunciationScoreReply(text) {
  if (!text) return false;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return false;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return (
      typeof parsed.score === 'number' &&
      typeof parsed.feedback === 'string' &&
      typeof parsed.stars === 'number'
    );
  } catch {
    return false;
  }
}
