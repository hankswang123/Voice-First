#!/usr/bin/env node
/**
 * Transcribe audio files using MiMo Audio Understanding API.
 *
 * Usage:
 *   node tools/mimo-transcribe.mjs                    # transcribe all dirs missing audio_scripts.txt
 *   node tools/mimo-transcribe.mjs 05_Friends         # transcribe specific directory
 *   node tools/mimo-transcribe.mjs --dry-run           # show what would be transcribed
 *   node tools/mimo-transcribe.mjs --force 05_Friends  # overwrite existing script
 *
 * Requires MIMO_API_KEY env var (or reads from ../.env).
 * Uses MiMo-V2.5 Audio Understanding API (OpenAI-compatible).
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAY_DIR = path.join(__dirname, '..', 'public', 'play');
const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg'];
const SCRIPT_NAME = 'audio_scripts.txt';

// MiMo API config — token-plan proxy by default, override with env vars
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2.5';

// Load API key from .env if not in environment
function loadApiKey() {
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY;

  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('No .env file found and MIMO_API_KEY not set.');
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  // Check for MiMo-specific key first, fall back to reading from model-switch config
  const mimoMatch = envContent.match(/^MIMO_API_KEY\s*=\s*['"]?([^'"\n]+)['"]?/m);
  if (mimoMatch) return mimoMatch[1];

  // Read from model-switch skill config
  const configPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.claude', 'skills', 'model-switch', 'xiaomi.env.json'
  );
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.ANTHROPIC_AUTH_TOKEN;
  }

  console.error('Cannot find MiMo API key. Set MIMO_API_KEY or add it to .env');
  process.exit(1);
}

// Find audio file in a directory
function findAudioFile(dir) {
  for (const ext of AUDIO_EXTS) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(ext));
    if (files.length > 0) return path.join(dir, files[0]);
  }
  return null;
}

// Detect MIME type from file header (magic bytes), not extension
function detectMime(buffer) {
  // MP3: starts with ID3 tag (49 44 33) or frame sync (FF FB/FF F3)
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return 'audio/mpeg';
  if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return 'audio/mpeg';
  // M4A/MP4: ftyp box — use audio/m4a for MiMo API compatibility
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return 'audio/m4a';
  // WAV: RIFF header
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'audio/wav';
  // FLAC: fLaC header
  if (buffer[0] === 0x66 && buffer[1] === 0x4C && buffer[2] === 0x61 && buffer[3] === 0x43) return 'audio/flac';
  // OGG: OggS header
  if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return 'audio/ogg';
  // Fallback by extension
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/m4a', '.flac': 'audio/flac', '.ogg': 'audio/ogg' };
  return mimeMap[ext] || 'audio/mpeg';
}

// Convert M4A to MP3 using ffmpeg (token-plan proxy doesn't support M4A)
function convertToMp3(filePath) {
  const tmpDir = os.tmpdir();
  const outPath = path.join(tmpDir, `mimo-transcribe-${Date.now()}.mp3`);
  try {
    execSync(`ffmpeg -y -i "${filePath}" -codec:a libmp3lame -q:a 2 "${outPath}"`, {
      stdio: 'pipe', timeout: 120000
    });
    return outPath;
  } catch (e) {
    throw new Error(`ffmpeg conversion failed: ${e.stderr?.toString() || e.message}`);
  }
}

// Convert audio file to base64 data URL (converts M4A→MP3 if needed)
function audioToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  const mime = detectMime(buffer);
  let workFile = filePath;
  let converted = false;

  // MiMo token-plan proxy only supports MP3, convert M4A/MP4 to MP3
  if (mime === 'audio/m4a' || mime === 'audio/mp4') {
    process.stdout.write('(converting to mp3) ');
    workFile = convertToMp3(filePath);
    converted = true;
  }

  const workBuffer = fs.readFileSync(workFile);
  const base64 = workBuffer.toString('base64');
  const result = { dataUrl: `data:audio/mpeg;base64,${base64}`, mime: 'audio/mpeg', sizeMB: (workBuffer.length / (1024 * 1024)).toFixed(1) };

  // Clean up temp file
  if (converted) {
    try { fs.unlinkSync(workFile); } catch {}
  }

  return result;
}

// Call MiMo Audio Understanding API
async function transcribeAudio(audioBase64, apiKey) {
  const url = `${MIMO_BASE_URL}/chat/completions`;

  const body = {
    model: MIMO_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: audioBase64,
            },
          },
          {
            type: 'text',
            text: 'Please transcribe this audio accurately. Output ONLY the transcript in this exact format, nothing else:\n\n发言人1   MM:SS\ntranscript text here\n\n发言人2   MM:SS\ntranscript text here\n\nRules:\n- Use 发言人1, 发言人2, etc. for different speakers\n- Timestamps use MM:SS format (minutes:seconds)\n- Preserve natural punctuation and capitalization\n- Do not add any commentary, summary, or metadata',
          },
        ],
      },
    ],
    max_completion_tokens: 32768,
    thinking: { type: 'disabled' },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';
  const finishReason = choice?.finish_reason;
  if (finishReason === 'length') {
    console.warn(`\n  WARNING: Response truncated (finish_reason=length). Consider increasing max_completion_tokens.`);
  }
  return content;
}

// Discover directories that need transcription
function discoverDirs(targetDir, force) {
  const dirs = [];

  if (targetDir) {
    // Specific directory requested
    const dirPath = path.join(PLAY_DIR, targetDir);
    if (!fs.existsSync(dirPath)) {
      console.error(`Directory not found: ${dirPath}`);
      process.exit(1);
    }
    const scriptPath = path.join(dirPath, SCRIPT_NAME);
    if (fs.existsSync(scriptPath) && !force) {
      console.log(`${targetDir}: already has ${SCRIPT_NAME}, skipping (use --force to overwrite)`);
      return dirs;
    }
    dirs.push(dirPath);
    return dirs;
  }

  // Scan all directories
  for (const entry of fs.readdirSync(PLAY_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(PLAY_DIR, entry.name);
    const audioFile = findAudioFile(dirPath);
    if (!audioFile) continue; // no audio, skip

    const scriptPath = path.join(dirPath, SCRIPT_NAME);
    if (fs.existsSync(scriptPath) && !force) continue; // already has script

    dirs.push(dirPath);
  }

  return dirs;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const targetDir = args.find(a => !a.startsWith('--'));

  const dirs = discoverDirs(targetDir, force);

  if (dirs.length === 0) {
    console.log('No directories need transcription.');
    return;
  }

  console.log(`Found ${dirs.length} director${dirs.length === 1 ? 'y' : 'ies'} to transcribe:`);
  dirs.forEach(d => console.log(`  - ${path.basename(d)}`));

  if (dryRun) {
    console.log('\n(dry run — no API calls made)');
    return;
  }

  const apiKey = loadApiKey();
  console.log(`\nUsing API: ${MIMO_BASE_URL}`);
  console.log(`Model: ${MIMO_MODEL}\n`);

  let success = 0;
  let failed = 0;

  for (const dir of dirs) {
    const name = path.basename(dir);
    const audioFile = findAudioFile(dir);
    const fileSizeMB = (fs.statSync(audioFile).size / (1024 * 1024)).toFixed(1);

    try {
      const { dataUrl, mime, sizeMB: audioMB } = audioToBase64(audioFile);
      const b64MB = (Buffer.byteLength(dataUrl) / (1024 * 1024)).toFixed(1);
      process.stdout.write(`${name} (${audioMB}MB, ${mime}, base64=${b64MB}MB)... `);
      if (parseFloat(b64MB) > 48) {
        console.log('SKIPPED (base64 exceeds 50MB limit)');
        failed++;
        continue;
      }
      const transcript = await transcribeAudio(dataUrl, apiKey);

      if (!transcript || transcript.trim().length === 0) {
        console.log('EMPTY RESPONSE');
        failed++;
        continue;
      }

      const scriptPath = path.join(dir, SCRIPT_NAME);
      fs.writeFileSync(scriptPath, transcript.trim() + '\n', 'utf8');
      console.log(`OK (${transcript.length} chars)`);
      success++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }

    // Rate limit: pause between requests
    if (dirs.indexOf(dir) < dirs.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed.`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
