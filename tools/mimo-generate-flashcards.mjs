#!/usr/bin/env node
/**
 * Generate flashcards.txt from audio_scripts.txt using MiMo API.
 * Creates bilingual Q&A flashcards based on the script content.
 *
 * Usage:
 *   node tools/mimo-generate-flashcards.mjs                  # generate for all units missing flashcards
 *   node tools/mimo-generate-flashcards.mjs 06_Mothers       # generate for specific unit
 *   node tools/mimo-generate-flashcards.mjs --force           # overwrite existing
 *   node tools/mimo-generate-flashcards.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAY_DIR = path.join(__dirname, '..', 'public', 'play');
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2.5';

function loadApiKey() {
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY;
  const configPath = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'skills', 'model-switch', 'xiaomi.env.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')).ANTHROPIC_AUTH_TOKEN;
  }
  console.error('Cannot find MiMo API key.'); process.exit(1);
}

// Extract English-only text from interleaved script
function extractEnglish(content) {
  const lines = content.split('\n');
  const englishLines = [];
  for (const line of lines) {
    // Skip speaker labels, Chinese lines, blank lines
    if (line.match(/^Speaker \d+:/) || line.trim() === '') continue;
    if (/[一-鿿]/.test(line)) continue;
    if (line.trim()) englishLines.push(line.trim());
  }
  return englishLines.join('\n');
}

async function generateFlashcards(englishText, apiKey) {
  const body = {
    model: MIMO_MODEL,
    messages: [{
      role: 'user',
      content: `Based on the following English audio script about a children's magazine topic, generate 15-25 flashcards for vocabulary and comprehension practice.

Each flashcard should have:
- "front": An English question testing vocabulary or comprehension
- "back": A concise English answer
- "front_translation": Chinese translation of the question
- "back_translation": Chinese translation of the answer

Focus on:
1. Key vocabulary words from the script
2. Important facts or concepts mentioned
3. Comprehension questions about the content

Output ONLY a JSON array. No explanation.

Script:
${englishText}`
    }],
    max_completion_tokens: 16384,
    thinking: { type: 'disabled' }
  };

  const resp = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const target = args.find(a => !a.startsWith('--'));

  const apiKey = loadApiKey();
  const units = target ? [target] : fs.readdirSync(PLAY_DIR).filter(d => /^\d{2}_/.test(d)).sort();

  for (const unit of units) {
    const scriptPath = path.join(PLAY_DIR, unit, 'audio_scripts.txt');
    const fcPath = path.join(PLAY_DIR, unit, 'flashcards.txt');
    if (!fs.existsSync(scriptPath)) { console.log(`${unit}: no script, skip`); continue; }
    if (fs.existsSync(fcPath) && !force) { console.log(`${unit}: flashcards exist, skip`); continue; }

    const content = fs.readFileSync(scriptPath, 'utf8');
    const english = extractEnglish(content);
    console.log(`${unit}: generating flashcards from ${english.split('\n').length} lines...`);

    if (dryRun) continue;

    try {
      const result = await generateFlashcards(english, apiKey);
      // Extract JSON from response (may be wrapped in markdown code block)
      let jsonStr = result;
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      const cards = JSON.parse(jsonStr);
      fs.writeFileSync(fcPath, JSON.stringify(cards, null, 4) + '\n', 'utf8');
      console.log(`  OK: ${cards.length} cards`);
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
