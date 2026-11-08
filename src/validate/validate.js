// Validation for adventure files and LLM output.
//
// Runs anywhere Ajv runs (Node, Workers). It does NOT read files; pass the parsed schemas in.
// scripts/validate-adventures.mjs is the file-reading CLI wrapper.

import Ajv from 'ajv';
import { normalizeCondition } from '../engine/conditions.js';

export function createValidator({ adventureSchema, castSchema, generatedSceneSchema }) {
  // strictRequired/strictTypes off: bare "required" (no sibling "properties"/"type") is how the
  // schemas say "scenes must contain start" and express the allOf "required" overlays.
  // Unknown keywords still fail (strict: true).
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
  ajv.addSchema(adventureSchema);
  ajv.addSchema(castSchema);
  ajv.addSchema(generatedSceneSchema);
  const schemaAdventure = ajv.getSchema(adventureSchema.$id);
  const schemaCast = ajv.getSchema(castSchema.$id);
  const schemaGenerated = ajv.getSchema(generatedSceneSchema.$id);

  const fmt = (errs) => (errs ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);

  function validateCast(cast) {
    schemaCast(cast);
    return fmt(schemaCast.errors);
  }

  /** Schema check plus the cross-reference checks a schema can't express. */
  function validateAdventure(adv, cast) {
    const errors = [];
    const warnings = [];
    if (!schemaAdventure(adv)) {
      return { errors: fmt(schemaAdventure.errors), warnings };
    }
    semanticChecks(adv, cast, errors, warnings);
    return { errors, warnings };
  }

  /** Check raw LLM output against the schema and the adventure, without changing it. */
  function validateGeneratedScene(scene, adv, cast) {
    if (!schemaGenerated(scene)) return fmt(schemaGenerated.errors);
    const errors = [];
    if (!cast.characters[scene.speaker]) errors.push(`speaker "${scene.speaker}" is not in the cast`);
    return errors;
  }

  return { validateCast, validateAdventure, validateGeneratedScene };
}

/** Make LLM output safe to play: drop unknown flags/stats, clamp each delta to the stat's
 *  maxStep. Call validateGeneratedScene first. Returns a new scene; never mutates. */
export function sanitizeGeneratedScene(scene, adv) {
  const approved = new Set(Object.keys(adv.flags ?? {}));
  return {
    ...scene,
    choices: scene.choices.map((c) => {
      const delta = {};
      for (const [key, change] of Object.entries(c.delta ?? {})) {
        const def = adv.stats[key];
        if (!def) continue;
        const step = def.maxStep ?? Infinity;
        delta[key] = Math.max(-step, Math.min(step, change));
      }
      const set = (c.set ?? []).filter((f) => approved.has(f));
      const out = { text: c.text, next: c.next, delta };
      if (set.length) out.set = set;
      if (c.hint) out.hint = c.hint;
      return out;
    }),
  };
}

// ---------------------------------------------------------------------------

function condFlags(cond) {
  const c = normalizeCondition(cond);
  return {
    positive: c.flags ?? [],
    negative: c.notFlags ?? [],
    stats:    Object.keys(c.stats ?? {}),
    hasItems: c.hasItems ?? [],
    notItems: c.notItems ?? [],
  };
}

function targetsOf(next) {
  return typeof next === 'string' ? [next] : next.map((r) => r.go);
}

function semanticChecks(adv, cast, errors, warnings) {
  const sceneIds = new Set(Object.keys(adv.scenes));
  const flagDefs = adv.flags ?? {};
  const itemDefs = adv.items ?? {};
  const statKeys  = new Set(Object.keys(adv.stats));
  const itemKeys  = new Set(Object.keys(itemDefs));
  const flagsSet     = new Set();
  const flagsRead    = new Set(); // positive reads
  const flagsReadNeg = new Set();
  const itemsGiven   = new Set();
  const itemsRead    = new Set(); // used in hasItems/notItems
  const edges = new Map(); // sceneId -> Set(target ids)

  if (cast) {
    if (cast.id !== adv.cast) errors.push(`cast: adventure wants "${adv.cast}" but was given "${cast.id}"`);
  } else {
    errors.push(`cast "${adv.cast}" not found`);
  }
  if (sceneIds.has('generate')) errors.push('scene id "generate" is reserved');

  const checkCondition = (cond, where) => {
    const { positive, negative, stats, hasItems, notItems } = condFlags(cond);
    for (const f of positive) {
      flagsRead.add(f);
      if (!flagDefs[f]) errors.push(`${where}: flag "${f}" is not declared in "flags"`);
    }
    for (const f of negative) {
      flagsReadNeg.add(f);
      if (!flagDefs[f]) errors.push(`${where}: flag "${f}" is not declared in "flags"`);
    }
    for (const s of stats) if (!statKeys.has(s)) errors.push(`${where}: unknown stat "${s}"`);
    for (const item of [...hasItems, ...notItems]) {
      itemsRead.add(item);
      if (!itemKeys.has(item)) errors.push(`${where}: item "${item}" is not declared in "items"`);
    }
  };

  // acts — checked after checkCondition is defined
  (adv.acts ?? []).forEach((act, i) => {
    const at = `acts[${i}]`;
    if (act.anchor && !sceneIds.has(act.anchor)) errors.push(`${at}: anchor "${act.anchor}" is not a scene`);
    if (act.until) checkCondition(act.until, `${at}.until`);
    if (!act.until && !act.minBeats) warnings.push(`${at}: no "until" and no "minBeats" — act will complete on the first beat`);
  });

  const checkChoices = (choices, where, sceneId) => {
    const ungated = choices.filter((c) => c.requires === undefined).length;
    if (ungated < 3) errors.push(`${where}: needs at least 3 choices without "requires" (has ${ungated}) so the player always sees 3`);
    choices.forEach((c, i) => {
      const at = `${where}.choices[${i}]`;
      if (c.requires) checkCondition(c.requires, `${at}.requires`);
      for (const f of c.set ?? []) {
        flagsSet.add(f);
        if (!flagDefs[f]) errors.push(`${at}: sets undeclared flag "${f}"`);
      }
      for (const item of c.give ?? []) {
        itemsGiven.add(item);
        if (!itemKeys.has(item)) errors.push(`${at}: gives undeclared item "${item}"`);
      }
      for (const item of c.consume ?? []) {
        if (!itemKeys.has(item)) errors.push(`${at}: consumes undeclared item "${item}"`);
      }
      for (const k of Object.keys(c.delta ?? {})) if (!statKeys.has(k)) errors.push(`${at}: delta uses unknown stat "${k}"`);
      if (Array.isArray(c.next)) {
        c.next.forEach((r, j) => r.if && checkCondition(r.if, `${at}.next[${j}].if`));
        if (c.next[c.next.length - 1].if !== undefined) errors.push(`${at}: the last "next" rule must have no "if"`);
      }
      for (const t of targetsOf(c.next)) {
        if (t === 'END' || t === 'generate') continue;
        if (!sceneIds.has(t)) errors.push(`${at}: next "${t}" is not a scene`);
        else edges.get(sceneId).add(t);
      }
      if (targetsOf(c.next).includes('generate') && !adv.tone) {
        warnings.push(`${at}: uses "generate" but the adventure has no "tone"`);
      }
    });
  };

  for (const [id, scene] of Object.entries(adv.scenes)) {
    edges.set(id, new Set());
    const bodies = [{ label: id, body: scene }];
    (scene.variants ?? []).forEach((v, i) => {
      checkCondition(v.if, `${id}.variants[${i}].if`);
      bodies.push({ label: `${id}.variants[${i}].use`, body: v.use });
    });
    for (const [lvl, body] of Object.entries(scene.spice ?? {})) bodies.push({ label: `${id}.spice.${lvl}`, body });

    for (const { label, body } of bodies) {
      if (body.speaker && cast && !cast.characters[body.speaker]) errors.push(`${label}: speaker "${body.speaker}" is not in the cast`);
      if (body.choices) checkChoices(body.choices, label, id);
    }
  }

  adv.endings.forEach((e, i) => {
    if (e.if) checkCondition(e.if, `endings[${i}].if`);
  });
  if (adv.endings[adv.endings.length - 1].if !== undefined) errors.push('endings: the last ending must have no "if"');

  // reachability from "start"
  const seen = new Set(['start']);
  const queue = ['start'];
  while (queue.length) {
    for (const t of edges.get(queue.shift()) ?? []) {
      if (!seen.has(t)) { seen.add(t); queue.push(t); }
    }
  }
  for (const id of sceneIds) if (!seen.has(id)) warnings.push(`scene "${id}" is unreachable from "start"`);

  // flags
  for (const f of flagsRead) if (!flagsSet.has(f)) errors.push(`flag "${f}" is read but no choice ever sets it`);
  for (const f of flagsReadNeg) if (!flagsSet.has(f)) warnings.push(`flag "${f}" is used in notFlags but never set`);
  for (const f of Object.keys(flagDefs)) {
    if (!flagsSet.has(f)) warnings.push(`flag "${f}" is declared but never set`);
    else if (!flagsRead.has(f) && !flagsReadNeg.has(f) && !flagDefs[f].recap) {
      warnings.push(`flag "${f}" is set but never read and has no "recap"`);
    }
  }

  // items
  for (const item of itemsRead) {
    if (!itemsGiven.has(item)) errors.push(`item "${item}" is required in a condition but no choice ever gives it`);
  }
  for (const item of Object.keys(itemDefs)) {
    if (!itemsGiven.has(item)) warnings.push(`item "${item}" is declared but never given`);
    else if (!itemsRead.has(item)) warnings.push(`item "${item}" is given but never used in a condition`);
  }
}
