// Pure parsing logic for pronunciation scoring.
// Lives as plain JS so it can be imported from both the TypeScript hook
// and the node:test regression suite without a build step.
//
// @typedef {Object} PronunciationResult
// @property {number} score    0..100
// @property {string} feedback short encouragement
// @property {number} stars    1..5

/**
 * Extract a pronunciation score from an assistant conversation item.
 *
 * Reads from BOTH `formatted.text` and `formatted.transcript` because the
 * Realtime API populates them differently depending on session config:
 *  - `formatted.text`       — when the model replies in text-only mode
 *                             (no `voice` set, modalities=['text'])
 *  - `formatted.transcript` — when the model replies with audio (TTS),
 *                             which is the default for voice-first apps
 *                             that set `voice: "alloy"` and leave
 *                             modalities at the default ['text','audio'].
 *
 * Returns null when the item isn't from the assistant or no score can
 * be parsed.
 *
 * @param {{role?: string, formatted?: {text?: string, transcript?: string}}} item
 * @returns {PronunciationResult | null}
 */
export function parsePronunciationScore(item) {
  if (item?.role !== 'assistant') return null;

  const text = item?.formatted?.text || item?.formatted?.transcript;
  if (!text) return null;

  // Try strict JSON inside the reply first.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.score === 'number') {
        return {
          score: clamp(parsed.score, 0, 100),
          feedback: typeof parsed.feedback === 'string' ? parsed.feedback : 'Good job!',
          stars: clamp(typeof parsed.stars === 'number' ? parsed.stars : 3, 1, 5),
        };
      }
    } catch {
      /* fall through to fallback regex */
    }
  }

  // Fallback: extract first 1-3 digit number from prose.
  const numMatch = text.match(/(\d{1,3})/);
  if (numMatch) {
    const score = clamp(parseInt(numMatch[1], 10), 0, 100);
    return {
      score,
      feedback: text.slice(0, 100),
      stars: scoreToStars(score),
    };
  }

  return null;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function scoreToStars(score) {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  return 1;
}
