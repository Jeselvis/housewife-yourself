import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine/index.js';
import { goat, reunion, play } from '../testkit/helpers.mjs';

test('createState starts from stat definitions and the start scene memory', () => {
  const s = engine.createState(goat());
  assert.equal(s.sceneId, 'start');
  assert.deepEqual(s.stats, { drama: 62, pop: 48, glasses: 0, brand: 25000 });
  assert.deepEqual(s.flags, []);
  assert.deepEqual(s.memory, ['Dolly knows you arrived by jet ski.']);
  assert.equal(s.spice, 2);
});

test('state is plain JSON and choose() does not mutate its input', () => {
  const adv = goat();
  const s0 = engine.createState(adv);
  const snapshot = JSON.stringify(s0);
  engine.choose(adv, s0, 0);
  assert.equal(JSON.stringify(s0), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(s0)), s0);
});

test('choose applies deltas, flags, history and moves to the next scene', () => {
  const adv = goat();
  const { status, state } = engine.choose(adv, engine.createState(adv), 0);
  assert.equal(status, 'scene');
  assert.equal(state.sceneId, 'twin');
  assert.equal(state.stats.brand, 29000);
  assert.equal(state.stats.drama, 77);
  assert.deepEqual(state.flags, ['claimed_twin']);
  assert.equal(state.beat, 1);
  assert.equal(state.history[0].text.startsWith("Announce you are Bunny's"), true);
  assert.ok(state.memory.includes('Bunny now suspects you of being family.'));
});

test('stats clamp to min and max', () => {
  const adv = goat();
  adv.scenes.start.choices[0].delta = { brand: -999999, drama: 999, glasses: -5 };
  const { state } = engine.choose(adv, engine.createState(adv), 0);
  assert.equal(state.stats.brand, 0);
  assert.equal(state.stats.drama, 100);
  assert.equal(state.stats.glasses, 0);
});

test('spice overrides replace scene fields; level 2 is the base text', () => {
  const adv = goat();
  const base = engine.resolveScene(adv, engine.createState(adv, { spice: 2 }));
  const cozy = engine.resolveScene(adv, engine.createState(adv, { spice: 1 }));
  const wild = engine.resolveScene(adv, engine.createState(adv, { spice: 3 }));
  assert.match(base.line, /seating chart is sacred/);
  assert.match(cozy.line, /sliding over, gently/);
  assert.match(wild.line, /\[BLEEP\]/);
  assert.equal(wild.mood, 'angry');
  assert.equal(base.mood, 'smug');
  assert.equal(cozy.choices.length, 3); // untouched fields fall through
});

test('setSpice changes the scene without losing progress', () => {
  const adv = goat();
  let s = engine.choose(adv, engine.createState(adv), 0).state;
  s = engine.setSpice(s, 3);
  assert.equal(s.sceneId, 'twin');
  assert.equal(s.stats.brand, 29000);
});

test('gated choices appear first and displace the last ungated choice', () => {
  const adv = goat();
  // start -> twin -> pour wine (sets bunny_enemy) -> wined -> napkin -> dessert
  const { state } = engine.choose(adv, engine.choose(adv, engine.choose(adv, engine.createState(adv), 0).state, 0).state, 0);
  const sceneWith = engine.resolveScene(adv, state);
  const withFlag = engine.visibleChoices(sceneWith, state);
  assert.equal(state.sceneId, 'dessert');
  assert.equal(withFlag.length, 3);
  assert.match(withFlag[0].text, /Accept the knife/);

  // reach dessert without the flag: start -> chandelier -> marry the chandelier
  const noFlag = engine.choose(adv, engine.choose(adv, engine.createState(adv), 1).state, 2).state;
  const without = engine.visibleChoices(engine.resolveScene(adv, noFlag), noFlag);
  assert.equal(noFlag.sceneId, 'dessert');
  assert.equal(without.length, 3);
  assert.ok(without.every((c) => !/Accept the knife/.test(c.text)));
});

test('variants rewrite a scene when their condition holds', () => {
  const adv = goat();
  const wined = engine.choose(adv, engine.choose(adv, engine.choose(adv, engine.createState(adv), 0).state, 0).state, 0).state;
  const withFlag = engine.resolveScene(adv, wined);
  assert.equal(withFlag.speaker, 'BUNNY VANDERKLEET');
  assert.deepEqual(withFlag.fx, ['wine']);

  const clean = engine.choose(adv, engine.choose(adv, engine.createState(adv), 1).state, 2).state;
  const plain = engine.resolveScene(adv, clean);
  assert.equal(plain.speaker, 'TAMSIN RUIZ');
  assert.deepEqual(plain.fx, []);
});

test('resolveNext takes the first matching rule and throws if none match', () => {
  const state = { flags: ['a'], stats: { brand: 50000 } };
  const next = [
    { if: ['b'], go: 'nope' },
    { if: { stats: { brand: '>=40000' } }, go: 'network_call' },
    { go: 'default' },
  ];
  assert.deepEqual(engine.resolveNext(next, state), { kind: 'scene', id: 'network_call' });
  assert.deepEqual(engine.resolveNext(next, { flags: [], stats: { brand: 0 } }), { kind: 'scene', id: 'default' });
  assert.deepEqual(engine.resolveNext('END', state), { kind: 'end' });
  assert.deepEqual(engine.resolveNext('generate', state), { kind: 'generate' });
  assert.throws(() => engine.resolveNext([{ if: ['zzz'], go: 'x' }], state), /No "next" rule matched/);
});

test('conditions: flags, notFlags and stat expressions', () => {
  const s = { flags: ['a', 'b'], stats: { brand: 10, drama: 90 } };
  assert.equal(engine.evalCondition(undefined, s), true);
  assert.equal(engine.evalCondition(['a', 'b'], s), true);
  assert.equal(engine.evalCondition(['a', 'c'], s), false);
  assert.equal(engine.evalCondition({ notFlags: ['c'] }, s), true);
  assert.equal(engine.evalCondition({ notFlags: ['a'] }, s), false);
  assert.equal(engine.evalCondition({ stats: { brand: '<20', drama: '>=90' } }, s), true);
  assert.equal(engine.evalCondition({ stats: { brand: '!=10' } }, s), false);
  assert.throws(() => engine.evalStatExpr('about 5', 1), /Bad stat expression/);
});

test('full run: wine on Bunny, cake duel, top ending with recap', async () => {
  const adv = goat();
  // twin(0) -> wine(0) -> pour on Dolly(1) -> dessert knife(0) -> revenge_cake eat(0) -> END
  const r = await play(engine, adv, [0, 0, 1, 0, 0]);
  assert.equal(r.status, 'end');
  assert.equal(r.state.ended, true);
  assert.equal(r.ending.title, 'Your Own Candle Line');
  assert.equal(r.state.stats.drama, 100);
  assert.deepEqual(r.state.flags, ['claimed_twin', 'wine_thrown', 'bunny_enemy', 'cake_duel']);
  assert.deepEqual(r.ending.recap, [
    "You announced you were Bunny's long-lost twin.",
    "You poured wine on Bunny's head.",
    "You accepted Bunny's knife and cut the cake.",
  ]);
  assert.throws(() => engine.choose(adv, r.state, 0), /already ended/);
});

// --- Global flags -----------------------------------------------------------

test('createState seeds globalFlags from option; choose applies setGlobal', () => {
  const adv = goat();
  adv.globalFlags = ['iguana_keeper', 'chaos_agent'];
  adv.scenes.start.choices[0].setGlobal = ['chaos_agent'];
  const s0 = engine.createState(adv, { globalFlags: ['iguana_keeper'] });
  assert.deepEqual(s0.globalFlags, ['iguana_keeper']);
  const { state: s1 } = engine.choose(adv, s0, 0);
  assert.deepEqual(s1.globalFlags, ['iguana_keeper', 'chaos_agent']);
  // idempotent: setting an already-set global flag does not duplicate it
  const { state: s2 } = engine.choose(adv, s1, 0);
  assert.equal(s2.globalFlags.filter((f) => f === 'chaos_agent').length, 1);
});

test('globalFlags and notGlobalFlags conditions are evaluated correctly', () => {
  const s = { flags: [], globalFlags: ['iguana_keeper'], stats: {}, inventory: [] };
  assert.equal(engine.evalCondition({ globalFlags: ['iguana_keeper'] }, s), true);
  assert.equal(engine.evalCondition({ globalFlags: ['chaos_agent'] }, s), false);
  assert.equal(engine.evalCondition({ notGlobalFlags: ['chaos_agent'] }, s), true);
  assert.equal(engine.evalCondition({ notGlobalFlags: ['iguana_keeper'] }, s), false);
  assert.equal(engine.evalCondition({ globalFlags: ['iguana_keeper'], notGlobalFlags: ['chaos_agent'] }, s), true);
});

test('endings change with spice level', async () => {
  const adv = goat();
  const path = [0, 0, 1, 0, 0];
  assert.equal((await play(engine, adv, path, { spice: 1 })).ending.title, 'Your Own Tea Collection');
  assert.equal((await play(engine, adv, path, { spice: 2 })).ending.title, 'Your Own Candle Line');
  const wild = (await play(engine, adv, path, { spice: 3 })).ending;
  assert.equal(wild.title, 'Your Own Line of Personal Massagers');
});

test('low brand falls through to the default ending', async () => {
  const adv = goat();
  // wire(2) -> confess(0) -> window(2): 25000 -5000 +6000 -3000 = 23000
  const r = await play(engine, adv, [2, 0, 2]);
  assert.equal(r.status, 'end');
  assert.equal(r.state.stats.brand, 23000);
  assert.equal(r.ending.title, 'Woman Near Fountain');
});

test('inventory: createState has empty inventory; give adds, consume removes; hasItems gates choices', () => {
  const adv = goat();
  adv.items = { napkin: { label: 'Damp Napkin' }, goblet: { label: 'Crystal Goblet' } };

  // createState gives empty inventory
  const s0 = engine.createState(adv);
  assert.deepEqual(s0.inventory, []);

  // give on choice 0 (twin path)
  adv.scenes.start.choices[0].give = ['napkin'];
  const { state: s1 } = engine.choose(adv, s0, 0);
  assert.deepEqual(s1.inventory, ['napkin']);

  // give is idempotent: picking the same item again doesn't duplicate
  adv.scenes.twin.choices[0].give = ['napkin'];
  const { state: s2 } = engine.choose(adv, s1, 0);
  assert.deepEqual(s2.inventory, ['napkin']);

  // consume removes the item
  adv.scenes.twin.choices[1].consume = ['napkin'];
  const { state: s3 } = engine.choose(adv, s1, 1);
  assert.deepEqual(s3.inventory, []);

  // hasItems: choice requiring goblet hidden when inventory empty
  adv.scenes.start.choices[1].requires = { hasItems: ['goblet'] };
  const withoutGoblet = engine.visibleChoices(engine.resolveScene(adv, s0), s0);
  assert.ok(withoutGoblet.every((c) => !c.requires?.hasItems));

  // give goblet, then gated choice appears
  const sWithGoblet = { ...s0, inventory: ['goblet'] };
  const withItem = engine.visibleChoices(engine.resolveScene(adv, sWithGoblet), sWithGoblet);
  assert.ok(withItem.some((c) => c.requires?.hasItems?.includes('goblet')));

  // notItems: choice hidden when item IS held
  adv.scenes.start.choices[2].requires = { notItems: ['napkin'] };
  const withNapkin = { ...s0, inventory: ['napkin'] };
  const withNapkinChoices = engine.visibleChoices(engine.resolveScene(adv, withNapkin), withNapkin);
  assert.ok(withNapkinChoices.every((c) => !c.requires?.notItems?.includes('napkin')));
});

test('generate beats: status, provideGeneratedScene, fallback, and endAfter', () => {
  const adv = reunion();
  const first = engine.choose(adv, engine.createState(adv), 0);
  assert.equal(first.status, 'generate');
  assert.match(first.hint, /couch reacts/);
  assert.deepEqual(first.state.flags, ['tabloid_confessed']);

  const scene = engine.fallbackScene(first.state);
  assert.equal(scene.choices.length, 3);
  const playing = engine.provideGeneratedScene(adv, first.state, scene);
  assert.equal(playing.sceneId, 'gen-1');
  assert.equal(engine.resolveScene(adv, playing).narration.includes('cut away'), true);
  assert.equal(engine.visibleChoices(engine.resolveScene(adv, playing), playing).length, 3);

  // endAfter: 6 forces the end even when a choice would generate more
  const generating = { ...first.state, beat: 5 };
  const forced = engine.choose(adv, engine.provideGeneratedScene(adv, generating, {
    ...scene,
    choices: scene.choices.map((c) => ({ ...c, next: 'generate' })),
  }), 0);
  assert.equal(forced.status, 'end');
  assert.ok(forced.ending.title);
});

// ── act system ───────────────────────────────────────────────────────────────

function actAdventure() {
  return {
    id: 'act-test', version: 1, label: 'TEST', episode: 'Test', cast: 'test',
    tone: 'test',
    stats: { drama: { label: 'Drama', start: 0, min: 0, max: 100 } },
    flags: { revealed: {}, finished: {} },
    items: {},
    acts: [
      { goal: 'Act 1 goal', until: ['revealed'], minBeats: 2 },
      { goal: 'Act 2 goal', minBeats: 2 },
    ],
    scenes: {
      start: {
        place: 'HERE', narration: 'Begin.',
        choices: [
          { text: 'Reveal', next: 'generate', delta: { drama: 5 }, set: ['revealed'] },
          { text: 'Wait',   next: 'generate', delta: { drama: 1 } },
          { text: 'Quiet',  next: 'generate', delta: { drama: 1 } },
        ],
      },
      climax: {
        place: 'CLIMAX', narration: 'Showdown.',
        choices: [
          { text: 'End it',  next: 'END', set: ['finished'] },
          { text: 'Push on', next: 'generate' },
          { text: 'Stall',   next: 'generate' },
        ],
      },
    },
    endings: [
      { if: ['finished'], title: 'Victory', text: 'You won.' },
      { title: 'Fallback', text: 'Nothing.' },
    ],
  };
}

test('createState initialises act and actBeat to 0', () => {
  const adv = actAdventure();
  const s = engine.createState(adv);
  assert.equal(s.act, 0);
  assert.equal(s.actBeat, 0);
});

test('act does not advance before minBeats is reached', () => {
  const adv = actAdventure();
  const s0 = engine.createState(adv);
  // choice 0 sets 'revealed' — but minBeats: 2 so act stays at 0 on beat 1
  const r1 = engine.choose(adv, s0, 0);
  assert.equal(r1.state.act, 0);
  assert.equal(r1.state.actBeat, 1);
});

test('act advances when minBeats met and until condition holds', () => {
  const adv = actAdventure();
  const s0 = engine.createState(adv);
  const r1 = engine.choose(adv, s0, 0); // beat 1: revealed set, actBeat=1 < 2
  // beat 2 with revealed already set → actBeat=2 >= 2, condition holds → act advances
  const r2 = engine.choose(adv, r1.state, 1);
  assert.equal(r2.state.act, 1);
  assert.equal(r2.state.actBeat, 0);
});

test('END is blocked (overridden to generate) while acts are incomplete', () => {
  const adv = actAdventure();
  // Add an END choice to start
  adv.scenes.start.choices[0].next = 'END';
  const s0 = engine.createState(adv);
  const r = engine.choose(adv, s0, 0);
  // Acts not complete → END overridden to generate
  assert.equal(r.status, 'generate');
});

test('END is allowed once all acts complete', () => {
  const adv = actAdventure();
  const s0 = engine.createState(adv);
  // Fast-forward: skip to act 1 complete state
  const s = { ...s0, act: 2, actBeat: 3, flags: ['revealed', 'finished'] };
  adv.scenes.start.choices[0].next = 'END';
  const r = engine.choose(adv, s, 0);
  assert.equal(r.status, 'end');
});

test('anchor fires when act completes, overriding choice.next', () => {
  const adv = actAdventure();
  adv.acts[0].anchor = 'climax';
  const s0 = engine.createState(adv);
  const r1 = engine.choose(adv, s0, 0); // beat 1: revealed, actBeat=1
  const r2 = engine.choose(adv, r1.state, 1); // beat 2: actBeat=2, until met → anchor
  assert.equal(r2.status, 'scene');
  assert.equal(r2.state.sceneId, 'climax');
  assert.equal(r2.state.act, 1);
  assert.equal(r2.state.actBeat, 0);
});

test('currentAct returns the current act or null when all complete', () => {
  const adv = actAdventure();
  const s0 = engine.createState(adv);
  assert.equal(engine.currentAct(adv, s0).goal, 'Act 1 goal');
  assert.equal(engine.currentAct(adv, { ...s0, act: 1 }).goal, 'Act 2 goal');
  assert.equal(engine.currentAct(adv, { ...s0, act: 2 }), null);
  assert.equal(engine.currentAct({ ...adv, acts: undefined }, s0), null);
});
