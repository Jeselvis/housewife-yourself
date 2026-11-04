import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeGeneratedScene } from '../src/validate/validate.js';
import { goat, reunion, cast, validator, load } from '../testkit/helpers.mjs';

const v = validator();

test('shipped cast and adventures validate with no errors or warnings', () => {
  assert.deepEqual(v.validateCast(cast()), []);
  for (const adv of [goat(), reunion()]) {
    const { errors, warnings } = v.validateAdventure(adv, cast());
    assert.deepEqual(errors, [], adv.id);
    assert.deepEqual(warnings, [], adv.id);
  }
});

test('catches broken scene references', () => {
  const adv = goat();
  adv.scenes.twin.choices[0].next = 'nowhere';
  const { errors } = v.validateAdventure(adv, cast());
  assert.ok(errors.some((e) => /next "nowhere" is not a scene/.test(e)));
});

test('catches undeclared flags, flags read but never set, and unknown stats', () => {
  const adv = goat();
  adv.scenes.twin.choices[0].set = ['mystery_flag'];
  adv.scenes.dessert.choices[0].requires = ['ghost_flag'];
  adv.scenes.twin.choices[1].delta = { charisma: 5 };
  const { errors } = v.validateAdventure(adv, cast());
  assert.ok(errors.some((e) => /sets undeclared flag "mystery_flag"/.test(e)));
  assert.ok(errors.some((e) => /flag "ghost_flag" is not declared/.test(e)));
  assert.ok(errors.some((e) => /unknown stat "charisma"/.test(e)));
});

test('catches a speaker who is not in the cast', () => {
  const adv = goat();
  adv.scenes.start.speaker = 'SOME RANDOM PERSON';
  assert.ok(v.validateAdventure(adv, cast()).errors.some((e) => /not in the cast/.test(e)));
});

test('requires 3 ungated choices, a default final rule, and a default ending', () => {
  const adv = goat();
  adv.scenes.chandelier.choices.pop();
  adv.scenes.wire.choices[0].next = [{ if: ['wired'], go: 'dessert' }];
  adv.endings[adv.endings.length - 1].if = { stats: { brand: '>=0' } };
  const { errors } = v.validateAdventure(adv, cast());
  assert.ok(errors.some((e) => /at least 3 choices without "requires"/.test(e)));
  assert.ok(errors.some((e) => /last "next" rule must have no "if"/.test(e)));
  assert.ok(errors.some((e) => /last ending must have no "if"/.test(e)));
});

test('warns about unreachable scenes', () => {
  const adv = goat();
  adv.scenes.orphan = { ...adv.scenes.goat };
  const { warnings } = v.validateAdventure(adv, cast());
  assert.ok(warnings.some((w) => /scene "orphan" is unreachable/.test(w)));
});

test('schema rejects typos and unknown moods/fx', () => {
  const adv = goat();
  adv.scenes.start.mood = 'furious';
  adv.scenes.start.fx = ['confetti'];
  adv.scenes.start.naration = 'typo';
  const { errors } = v.validateAdventure(adv, cast());
  assert.ok(errors.length >= 3);
});

// --- LLM output ---------------------------------------------------------

test('a well-formed generated scene passes', () => {
  const scene = load('test/fixtures/generated-scene.valid.json');
  assert.deepEqual(v.validateGeneratedScene(scene, reunion(), cast()), []);
});

test('generated scenes with unknown mood, 2 choices, or a stranger speaker fail', () => {
  const good = load('test/fixtures/generated-scene.valid.json');
  assert.ok(v.validateGeneratedScene({ ...good, mood: 'ecstatic' }, reunion(), cast()).length > 0);
  assert.ok(v.validateGeneratedScene({ ...good, choices: good.choices.slice(0, 2) }, reunion(), cast()).length > 0);
  assert.ok(v.validateGeneratedScene({ ...good, speaker: 'A NEW GUY' }, reunion(), cast()).some((e) => /not in the cast/.test(e)));
  assert.ok(v.validateGeneratedScene({ ...good, choices: good.choices.map((c) => ({ ...c, next: 'dessert' })) }, reunion(), cast()).length > 0);
});

test('sanitize drops unapproved flags and unknown stats, and clamps deltas to maxStep', () => {
  const adv = reunion();
  const raw = load('test/fixtures/generated-scene.valid.json');
  raw.choices[0].delta = { drama: 999, brand: -999999, charisma: 50 };
  raw.choices[0].set = ['tabloid_confessed', 'invented_flag'];
  const clean = sanitizeGeneratedScene(raw, adv);
  assert.deepEqual(clean.choices[0].delta, { drama: 30, brand: -25000 });
  assert.deepEqual(clean.choices[0].set, ['tabloid_confessed']);
  assert.notEqual(clean, raw); // new object
  assert.deepEqual(raw.choices[0].set, ['tabloid_confessed', 'invented_flag']); // input untouched
});
