import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createValidator } from '../src/validate/validate.js';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const load = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

export const goat = () => load('adventures/goat.json');
export const reunion = () => load('adventures/reunion.json');
export const cast = () => load('cast/lake-sparkle.json');
export const layers = () => load('src/portrait/layers.json');

export const validator = () =>
  createValidator({
    adventureSchema: load('schema/adventure.schema.json'),
    castSchema: load('schema/cast.schema.json'),
    generatedSceneSchema: load('schema/generated-scene.schema.json'),
  });

/** Play a list of visible-choice indices from the start; returns the last result. */
export async function play(engine, adventure, indices, opts = {}) {
  let state = engine.createState(adventure, opts);
  let result = { status: 'scene', state };
  for (const i of indices) {
    result = engine.choose(adventure, result.state, i);
  }
  return result;
}
