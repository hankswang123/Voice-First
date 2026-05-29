#!/usr/bin/env node
/**
 * Generate keywords.txt from audio_scripts.txt using MiMo API.
 * Extracts key vocabulary with timestamps and page numbers.
 *
 * Usage:
 *   node tools/mimo-generate-keywords.mjs                  # generate for all units missing keywords
 *   node tools/mimo-generate-keywords.mjs 06_Mothers       # generate for specific unit
 *   node tools/mimo-generate-keywords.mjs --force           # overwrite existing
 *   node tools/mimo-generate-keywords.mjs --dry-run
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

// Extract English lines with timestamps from interleaved script
function extractWithTimestamps(content) {
  const lines = content.split('\n');
  const entries = [];
  let currentTimestamp = null;

  for (const line of lines) {
    const speakerMatch = line.match(/^Speaker (\d+):\s+(\d{2}:\d{2})/);
    if (speakerMatch) {
      currentTimestamp = speakerMatch[2];
      continue;
    }
    if (currentTimestamp && line.trim() && !/[一-鿿]/.test(line)) {
      entries.push({ timestamp: currentTimestamp, text: line.trim() });
      currentTimestamp = null; // reset for next block
    }
  }
  return entries;
}

async function generateKeywords(entries, apiKey) {
  // Format entries with timestamps for context
  const scriptWithTimestamps = entries.map(e => `[${e.timestamp}] ${e.text}`).join('\n');

  const body = {
    model: MIMO_MODEL,
    messages: [{
      role: 'user',
      content: `Extract 10-15 key vocabulary words from this children's educational audio script. For each keyword, provide its time range in the audio and a suggested page number (assume 32-page magazine, distribute evenly).

Input format: [MM:SS] text line

Output ONLY a JSON object (no array, no explanation). Format:
{
  "KeywordWithEmoji": [startSeconds, endSeconds, pageNumber],
  ...
}

Rules:
- Keywords should be important vocabulary words children should learn
- Add a relevant emoji after each keyword
- startSeconds/endSeconds are in total seconds (e.g., "01:23" = 83)
- pageNumber should be 1-32, distributed across the script's time range
- Include a final "Recap🔁" entry covering the last portion

Script:
${scriptWithTimestamps}`
    }],
    max_completion_tokens: 4096,
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
    const kwPath = path.join(PLAY_DIR, unit, 'keywords.txt');
    if (!fs.existsSync(scriptPath)) { console.log(`${unit}: no script, skip`); continue; }
    if (fs.existsSync(kwPath) && !force) { console.log(`${unit}: keywords exist, skip`); continue; }

    const content = fs.readFileSync(scriptPath, 'utf8');
    const entries = extractWithTimestamps(content);
    console.log(`${unit}: generating keywords from ${entries.length} entries...`);

    if (dryRun) continue;

    try {
      const result = await generateKeywords(entries, apiKey);
      // Extract JSON from response
      let jsonStr = result;
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      const keywords = JSON.parse(jsonStr);
      fs.writeFileSync(kwPath, JSON.stringify(keywords, null, 4) + '\n', 'utf8');
      console.log(`  OK: ${Object.keys(keywords).length} keywords`);
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
