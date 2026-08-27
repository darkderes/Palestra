// Build the trimmed dataset the browser actually loads.
//
//   node scripts/build-data.mjs
//
// Reads data/exercises.json (full, Spanish) and writes data/exercises.min.json
// with only the fields index.html renders — id, name, taxonomy, muscles,
// Spanish instruction steps, and media paths. Everything else (multilingual
// `instructions`, `instruction_steps` for other languages, `media_id`,
// `created_at`, `attribution`) is dropped. Keeps the payload ~1 MB instead
// of the ~16 MB it was when embedded inline.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'data', 'exercises.json');
const OUT = join(root, 'data', 'exercises.min.json');

const full = JSON.parse(readFileSync(SRC, 'utf8'));

const min = full.map(e => ({
  id: e.id,
  name: e.name,
  category: e.category,
  body_part: e.body_part,
  equipment: e.equipment,
  target: e.target,
  muscle_group: e.muscle_group,
  secondary_muscles: e.secondary_muscles ?? [],
  instruction_steps: { es: e.instruction_steps?.es ?? [] },
  image: e.image,
  gif_url: e.gif_url,
}));

const json = JSON.stringify(min);
writeFileSync(OUT, json);

const mb = n => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log(`build-data: ${min.length} exercises`);
console.log(`  ${SRC}  ${mb(readFileSync(SRC).length)}`);
console.log(`  ${OUT}  ${mb(json.length)}`);
