// Usage: npm run validate        (validates every file in cast/ and adventures/)
//        npm run validate -- adventures/goat.json
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createValidator } from '../src/validate/validate.js';
import Ajv from 'ajv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const jsonIn = (dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.json') && !f.startsWith('._')).map((f) => join(root, dir, f));

let globalsData = null;
const globalsPath = join(root, 'globals.json');
if (existsSync(globalsPath)) {
  const globals = load(globalsPath);
  const globalsSchema = load(join(root, 'schema/globals.schema.json'));
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
  const validate = ajv.compile(globalsSchema);
  if (!validate(globals)) {
    console.log('FAIL globals.json');
    validate.errors.forEach((e) => console.log(`       error: ${e.instancePath || '/'} ${e.message}`));
    process.exit(1);
  }
  console.log('ok   globals.json');
  globalsData = globals;
}

const validator = createValidator({
  adventureSchema: load(join(root, 'schema/adventure.schema.json')),
  castSchema: load(join(root, 'schema/cast.schema.json')),
  generatedSceneSchema: load(join(root, 'schema/generated-scene.schema.json')),
  globalsData,
});

let failed = false;
const report = (file, errors, warnings = []) => {
  const name = file.replace(root + '/', '');
  if (errors.length) failed = true;
  console.log(`${errors.length ? 'FAIL' : 'ok  '} ${name}`);
  errors.forEach((e) => console.log(`       error: ${e}`));
  warnings.forEach((w) => console.log(`       warn:  ${w}`));
};

const casts = {};
for (const file of jsonIn('cast')) {
  const cast = load(file);
  casts[cast.id] = cast;
  report(file, validator.validateCast(cast));
}

const requested = process.argv.slice(2).map((p) => resolve(p));
const adventureFiles = requested.length ? requested : jsonIn('adventures');
for (const file of adventureFiles) {
  const adv = load(file);
  const { errors, warnings } = validator.validateAdventure(adv, casts[adv.cast]);
  report(file, errors, warnings);
}

process.exit(failed ? 1 : 0);
