#!/usr/bin/env node
// Publishes the deterministic "word of the day" snapshot.
// Runs daily in CI (see .github/workflows/daily-words.yml) and can be run locally:
//   node scripts/update-daily-word.mjs
//
// It reads dailywords/words.json (the source of truth), computes today's word by
// UTC calendar date, and writes:
//   - dailywords/today.json   : the authoritative snapshot the site prefers
//   - dailywords/history.json : a rolling log of the last 30 published words
//
// The selection is deterministic, so this only produces a new commit when the
// day actually rolls over.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'dailywords');

const EPOCH = Date.UTC(2024, 0, 1);
const DAY_MS = 86400000;

function dayIndex(date) {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((utcMidnight - EPOCH) / DAY_MS);
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const raw = JSON.parse(await readFile(join(DIR, 'words.json'), 'utf8'));
  const words = raw.words;
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('words.json has no words array');
  }

  const now = new Date();
  const idx = ((dayIndex(now) % words.length) + words.length) % words.length;
  const word = words[idx];

  const today = {
    date: isoDay(now),
    dayIndex: dayIndex(now),
    generatedAt: now.toISOString(),
    word
  };

  await writeFile(join(DIR, 'today.json'), JSON.stringify(today, null, 2) + '\n');

  // Maintain a rolling 30-entry history (newest first, de-duplicated by date).
  let history = [];
  try {
    history = JSON.parse(await readFile(join(DIR, 'history.json'), 'utf8'));
    if (!Array.isArray(history)) history = [];
  } catch (_) {}

  history = history.filter((h) => h.date !== today.date);
  history.unshift({ date: today.date, word: word.word, definition: word.definition });
  history = history.slice(0, 30);

  await writeFile(join(DIR, 'history.json'), JSON.stringify(history, null, 2) + '\n');

  console.log(`Word of the day for ${today.date} (day #${today.dayIndex}): ${word.word}`);
}

main().catch((err) => {
  console.error('Failed to update daily word:', err.message);
  process.exit(1);
});
