#!/usr/bin/env node
/**
 * Add Chinese translations to audio_scripts.txt files.
 * Converts from:
 *   发言人1   00:00
 *   English text here
 * To (interleaved National Geographic format):
 *   Speaker 1: 00:00
 *    Chinese translation here
 *
 *   Speaker 1: 00:00
 *   English text here
 *
 * Usage:
 *   node tools/mimo-translate-scripts.mjs                  # translate all units 06-10
 *   node tools/mimo-translate-scripts.mjs 06_Mothers       # translate specific unit
 *   node tools/mimo-translate-scripts.mjs --force           # overwrite existing translations
 *   node tools/mimo-translate-scripts.mjs --dry-run         # preview without API calls
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAY_DIR = path.join(__dirname, '..', 'public', 'play');
const SCRIPT_NAME = 'audio_scripts.txt';
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2.5';
const TARGET_UNITS = ['06_Mothers', '07_Plants', '08_Near_the_Water', '09_Wash_my_Hands', '10_Good_Night'];

function loadApiKey() {
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY;
  const configPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.claude', 'skills', 'model-switch', 'xiaomi.env.json'
  );
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.ANTHROPIC_AUTH_TOKEN;
  }
  console.error('Cannot find MiMo API key.');
  process.exit(1);
}

// Parse script into blocks: [{ speaker, timestamp, english }]
function parseScript(content) {
  const lines = content.split('\n');
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^(发言人\d+)\s+(\d{2}:\d{2})\s*$/);
    if (match) {
      if (current) blocks.push(current);
      current = { speaker: match[1], timestamp: match[2], english: '' };
    } else if (current && line.trim()) {
      current.english = line.trim();
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// Batch translate English lines to Chinese
async function translateBatch(englishLines, apiKey) {
  const numbered = englishLines.map((line, i) => `[${i}] ${line}`).join('\n');

  const body = {
    model: MIMO_MODEL,
    messages: [{
      role: 'user',
      content: `Translate each numbered English line below to Chinese. Output ONLY the translations, one per line, keeping the same numbering format [N]. Do not add any explanation.\n\n${numbered}`
    }],
    max_completion_tokens: 16384,
    thinking: { type: 'disabled' }
  };

  const resp = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse numbered translations
  const translations = new Map();
  for (const line of content.split('\n')) {
    const m = line.match(/^\[(\d+)\]\s*(.+)/);
    if (m) translations.set(parseInt(m[1]), m[2].trim());
  }

  return englishLines.map((_, i) => translations.get(i) || englishLines[i]);
}

// Convert blocks to interleaved format
function toInterleaved(blocks, translations) {
  const lines = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const cn = translations[i];
    // Speaker number mapping: 发言人1 -> Speaker 1, etc.
    const speakerNum = b.speaker.replace('发言人', 'Speaker ');

    // Chinese line
    lines.push(`${speakerNum}: ${b.timestamp} `);
    lines.push(` ${cn}`);
    lines.push('');
    // English line
    lines.push(`${speakerNum}: ${b.timestamp} `);
    lines.push(`${b.english}`);
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const target = args.find(a => !a.startsWith('--'));

  const units = target ? [target] : TARGET_UNITS;
  const apiKey = loadApiKey();

  console.log(`Translating ${units.length} units to interleaved format...\n`);

  for (const unit of units) {
    const scriptPath = path.join(PLAY_DIR, unit, SCRIPT_NAME);
    if (!fs.existsSync(scriptPath)) {
      console.log(`${unit}: no script found, skipping`);
      continue;
    }

    const content = fs.readFileSync(scriptPath, 'utf8');
    const blocks = parseScript(content);
    console.log(`${unit}: ${blocks.length} blocks`);

    if (dryRun) continue;

    // Batch translate (50 lines per batch to stay under token limits)
    const BATCH_SIZE = 50;
    const allTranslations = [];

    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, i + BATCH_SIZE);
      const englishLines = batch.map(b => b.english);
      process.stdout.write(`  translating lines ${i + 1}-${i + batch.length}... `);

      const translations = await translateBatch(englishLines, apiKey);
      allTranslations.push(...translations);
      console.log('OK');

      // Rate limit
      if (i + BATCH_SIZE < blocks.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Write interleaved format
    const output = toInterleaved(blocks, allTranslations);
    fs.writeFileSync(scriptPath, output, 'utf8');
    console.log(`  wrote ${output.split('\n').length} lines\n`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
