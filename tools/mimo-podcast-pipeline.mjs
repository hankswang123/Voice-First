#!/usr/bin/env node
/**
 * Full podcast pipeline: MP3 convert → Transcribe → Translate → Flashcards → Keywords
 *
 * Usage:
 *   node tools/mimo-podcast-pipeline.mjs "三(上)_Unit_01"              # single unit
 *   node tools/mimo-podcast-pipeline.mjs "三(上)_Unit_01" "三(上)_Unit_02"  # multiple
 *   node tools/mimo-podcast-pipeline.mjs --all                         # all units with audio
 *   node tools/mimo-podcast-pipeline.mjs --force "三(上)_Unit_01"      # force re-run all steps
 *   node tools/mimo-podcast-pipeline.mjs --dry-run "三(上)_Unit_01"    # show plan without executing
 *   node tools/mimo-podcast-pipeline.mjs --from translate "三(上)_Unit_01"  # start from a specific step
 *
 * Steps (each skipped if output already exists, unless --force):
 *   1. mp3        — convert M4A/MP4 → MP3 (skipped if .mp3 exists)
 *   2. transcribe — transcribe audio → audio_scripts.txt (raw English)
 *   3. translate  — add Chinese translations → audio_scripts.txt (interleaved)
 *   4. flashcards — generate flashcards.txt
 *   5. keywords   — generate keywords.txt
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOLS_DIR = __dirname;
const PLAY_DIR = path.join(__dirname, '..', 'public', 'play');
const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg'];

const STEPS = ['mp3', 'transcribe', 'translate', 'flashcards', 'keywords'];

const STEP_COMMANDS = {
  mp3: (dir) => null, // handled specially via ffmpeg
  transcribe: (dir) => `node "${path.join(TOOLS_DIR, 'mimo-transcribe.mjs')}" "${dir}"`,
  translate: (dir) => `node "${path.join(TOOLS_DIR, 'mimo-translate-scripts.mjs')}" "${dir}"`,
  flashcards: (dir) => `node "${path.join(TOOLS_DIR, 'mimo-generate-flashcards.mjs')}" "${dir}"`,
  keywords: (dir) => `node "${path.join(TOOLS_DIR, 'mimo-generate-keywords.mjs')}" "${dir}"`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function findAudioFile(dir) {
  for (const ext of AUDIO_EXTS) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(ext));
    if (files.length > 0) return path.join(dir, files[0]);
  }
  return null;
}

function findMp3File(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3'));
  return files.length > 0 ? path.join(dir, files[0]) : null;
}

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function run(cmd, label) {
  console.log(`  ▸ ${label}...`);
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 600000 });
    return true;
  } catch (e) {
    console.error(`  ✗ ${label} failed (exit ${e.status})`);
    return false;
  }
}

// ── MP3 conversion step (inline, no subprocess) ──────────────────────────────

function convertToMp3(srcPath, destPath) {
  console.log(`  ▸ converting to mp3...`);
  try {
    execSync(`ffmpeg -y -i "${srcPath}" -codec:a libmp3lame -q:a 2 "${destPath}"`, {
      stdio: 'pipe', timeout: 120000,
    });
    const sizeMB = (fs.statSync(destPath).size / (1024 * 1024)).toFixed(1);
    console.log(`  ✓ mp3 saved (${sizeMB} MB)`);
    return true;
  } catch (e) {
    console.error(`  ✗ ffmpeg failed: ${e.stderr?.toString() || e.message}`);
    return false;
  }
}

// ── Step execution ───────────────────────────────────────────────────────────

function needsMp3(dir) {
  const audioFile = findAudioFile(dir);
  if (!audioFile) return false;
  if (path.extname(audioFile).toLowerCase() === '.mp3') return false; // already mp3
  return !findMp3File(dir); // need conversion if no mp3 exists
}

function needsStep(dir, step, force) {
  if (force) return true;
  switch (step) {
    case 'mp3': return needsMp3(dir);
    case 'transcribe': return !fileExists(path.join(dir, 'audio_scripts.txt'));
    case 'translate': {
      const script = path.join(dir, 'audio_scripts.txt');
      if (!fileExists(script)) return false;
      const content = fs.readFileSync(script, 'utf8');
      return !content.includes('Speaker 1:'); // not yet interleaved
    }
    case 'flashcards': return !fileExists(path.join(dir, 'flashcards.txt'));
    case 'keywords': return !fileExists(path.join(dir, 'keywords.txt'));
    default: return false;
  }
}

async function runPipeline(dirName, opts) {
  const { force, fromStep, dryRun } = opts;
  const dir = path.join(PLAY_DIR, dirName);
  const name = dirName;

  if (!fs.existsSync(dir)) {
    console.error(`\n✗ Directory not found: ${dir}`);
    return false;
  }

  const audioFile = findAudioFile(dir);
  if (!audioFile) {
    console.error(`\n✗ ${name}: no audio file found`);
    return false;
  }

  // Determine which steps to run
  const fromIdx = fromStep ? STEPS.indexOf(fromStep) : 0;
  if (fromStep && fromIdx === -1) {
    console.error(`Unknown step: ${fromStep}. Valid: ${STEPS.join(', ')}`);
    return false;
  }
  const stepsToRun = STEPS.slice(fromIdx);
  const activeSteps = stepsToRun.filter(s => needsStep(dir, s, force));

  console.log(`\n━━━ ${name} ━━━`);
  console.log(`  audio: ${path.basename(audioFile)}`);
  console.log(`  steps: ${activeSteps.length > 0 ? activeSteps.join(' → ') : '(all done)'}`);

  if (activeSteps.length === 0) {
    console.log(`  ✓ Nothing to do — all outputs exist. Use --force to re-run.`);
    return true;
  }

  if (dryRun) {
    console.log(`  (dry run — skipping execution)`);
    return true;
  }

  // Execute steps sequentially
  for (const step of activeSteps) {
    if (step === 'mp3') {
      const mp3Dest = path.join(dir, path.basename(audioFile, path.extname(audioFile)) + '.mp3');
      if (!convertToMp3(audioFile, mp3Dest)) return false;
    } else {
      const cmd = STEP_COMMANDS[step](name);
      if (!run(cmd, step)) return false;
    }
  }

  console.log(`  ✓ ${name} complete`);
  return true;
}

// ── Discover units ───────────────────────────────────────────────────────────

function discoverUnits() {
  return fs.readdirSync(PLAY_DIR)
    .filter(d => findAudioFile(path.join(PLAY_DIR, d)))
    .sort();
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const all = args.includes('--all');
  const fromIdx = args.indexOf('--from');
  const fromStep = fromIdx !== -1 ? args[fromIdx + 1] : null;

  const units = args.filter(a => !a.startsWith('--') && a !== fromStep);

  if (!all && units.length === 0) {
    console.log('Usage:');
    console.log('  node tools/mimo-podcast-pipeline.mjs "三(上)_Unit_01"');
    console.log('  node tools/mimo-podcast-pipeline.mjs --all');
    console.log('  node tools/mimo-podcast-pipeline.mjs --force --from translate "三(上)_Unit_01"');
    console.log(`\nSteps: ${STEPS.join(' → ')}`);
    console.log(`Units with audio: ${discoverUnits().join(', ')}`);
    return;
  }

  const targetUnits = all ? discoverUnits() : units;
  console.log(`Podcast pipeline — ${targetUnits.length} unit(s)`);
  console.log(`Steps: ${STEPS.join(' → ')}`);
  if (force) console.log('Mode: --force (re-run all steps)');
  if (fromStep) console.log(`Starting from: ${fromStep}`);
  if (dryRun) console.log('Mode: --dry-run (no execution)');

  let success = 0;
  let failed = 0;

  for (const unit of targetUnits) {
    const ok = await runPipeline(unit, { force, fromStep, dryRun });
    if (ok) success++; else failed++;
  }

  console.log(`\n━━━ Summary ━━━`);
  console.log(`  ✓ ${success} succeeded`);
  if (failed > 0) console.log(`  ✗ ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
