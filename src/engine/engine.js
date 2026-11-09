// Game engine. Pure functions over plain JSON state: no DOM, no network, no randomness.
// Every function returns a NEW state object, so state is trivially serializable (save/load)
// and sendable to the LLM endpoint.
//
// Flow:  createState -> resolveScene + visibleChoices (render) -> choose -> {status, state}
//   status "scene"    : state already points at the next scene
//   status "generate" : ask the LLM (or fallbackScene) for a scene, then provideGeneratedScene
//   status "end"      : episode over, `ending` holds the result

import { evalCondition } from './conditions.js';

export const MAX_VISIBLE_CHOICES = 3;

const SCENE_DEFAULTS = {
  place: '',
  narration: '',
  speaker: '',
  line: '',
  confessional: '',
  mood: 'neutral',
  fx: [],
  memory: [],
  choices: [],
};

export function createState(adventure, { spice = 2, globalFlags = [] } = {}) {
  const stats = {};
  for (const [key, def] of Object.entries(adventure.stats)) stats[key] = def.start;
  const state = {
    adventureId: adventure.id,
    sceneId: 'start',
    spice,
    stats,
    flags:       [],               // ordered, so the recap reads in story order
    globalFlags: [...globalFlags], // persistent across episodes; seeded from localStorage by the app
    inventory:   [],               // items currently held
    memory: [],    // short facts the cast remembers; fed to the LLM
    history: [],   // [{ sceneId, choice, text }]
    beat: 0,
    act: 0,        // index into adventure.acts[] (0 when no acts defined)
    actBeat: 0,    // beats played since entering the current act
    generated: {}, // scenes written by the LLM, kept so saves can replay
    ended: false,
  };
  return enterScene(adventure, state, 'start');
}

export function setSpice(state, spice) {
  return { ...state, spice };
}

/** The scene as the player sees it: base <- first matching variant <- spice override. */
export function resolveScene(adventure, state, sceneId = state.sceneId) {
  const base = state.generated?.[sceneId] ?? adventure.scenes[sceneId];
  if (!base) throw new Error(`Unknown scene: ${sceneId}`);
  const { variants = [], spice = {}, ...core } = base;
  let scene = { ...core };
  const hit = variants.find((v) => evalCondition(v.if, state));
  if (hit) scene = { ...scene, ...hit.use };
  const level = spice[String(state.spice)];
  if (level) scene = { ...scene, ...level };
  return { ...SCENE_DEFAULTS, ...scene, id: sceneId };
}

/** Choices the player can pick. Authored order is priority: gated choices go first and
 *  displace the last ungated one, so the player always sees at most 3. */
export function visibleChoices(scene, state) {
  return scene.choices.filter((c) => evalCondition(c.requires, state)).slice(0, MAX_VISIBLE_CHOICES);
}

/** next may be "scene_id", "END", "generate", or an ordered list of { if?, go } rules. */
export function resolveNext(next, state) {
  const rules = typeof next === 'string' ? [{ go: next }] : next;
  for (const rule of rules) {
    if (evalCondition(rule.if, state)) return toTarget(rule.go);
  }
  throw new Error('No "next" rule matched. The last rule must have no "if".');
}

function toTarget(go) {
  if (go === 'END') return { kind: 'end' };
  if (go === 'generate') return { kind: 'generate' };
  return { kind: 'scene', id: go };
}

function applyDelta(adventure, stats, delta = {}) {
  const out = { ...stats };
  for (const [key, change] of Object.entries(delta)) {
    const def = adventure.stats[key];
    if (!def) throw new Error(`Unknown stat: ${key}`);
    let v = (out[key] ?? def.start) + change;
    if (def.min !== undefined) v = Math.max(def.min, v);
    if (def.max !== undefined) v = Math.min(def.max, v);
    out[key] = v;
  }
  return out;
}

function addFlags(flags, toSet = []) {
  const out = [...flags];
  for (const f of toSet) if (!out.includes(f)) out.push(f);
  return out;
}

function updateInventory(inventory, give = [], consume = []) {
  const drop = new Set(consume);
  const out = inventory.filter((item) => !drop.has(item));
  for (const item of give) if (!out.includes(item)) out.push(item);
  return out;
}

export function enterScene(adventure, state, sceneId) {
  const moved = { ...state, sceneId };
  const scene = resolveScene(adventure, moved);
  const memory = [...moved.memory];
  for (const fact of scene.memory) if (!memory.includes(fact)) memory.push(fact);
  return { ...moved, memory };
}

/** Apply the player's pick. `choiceIndex` indexes visibleChoices(). */
export function choose(adventure, state, choiceIndex) {
  if (state.ended) throw new Error('The episode has already ended.');
  const scene = resolveScene(adventure, state);
  const choice = visibleChoices(scene, state)[choiceIndex];
  if (!choice) throw new RangeError(`No visible choice at index ${choiceIndex}.`);

  let next = {
    ...state,
    stats:       applyDelta(adventure, state.stats, choice.delta),
    flags:       addFlags(state.flags, choice.set),
    globalFlags: addFlags(state.globalFlags ?? [], choice.setGlobal),
    inventory:   updateInventory(state.inventory ?? [], choice.give, choice.consume),
    history:   [...state.history, { sceneId: state.sceneId, choice: choiceIndex, text: choice.text }],
    beat:      state.beat + 1,
    act:       state.act ?? 0,
    actBeat:   (state.actBeat ?? 0) + 1,
  };

  // ── act progression ───────────────────────────────────────────────────────
  const acts = adventure.acts ?? [];
  let { act, actBeat } = next;
  let forcedAnchor = null;

  if (acts.length > 0 && act < acts.length) {
    const currentAct = acts[act];
    const minBeats = currentAct.minBeats ?? 0;
    const untilMet = !currentAct.until || evalCondition(currentAct.until, next);
    if (actBeat >= minBeats && untilMet) {
      forcedAnchor = currentAct.anchor ?? null;
      act++;
      actBeat = 0;
    }
  }
  next = { ...next, act, actBeat };

  // ── forced anchor routing (act completion) ────────────────────────────────
  if (forcedAnchor) {
    if (!adventure.scenes[forcedAnchor]) throw new Error(`Unknown anchor scene: ${forcedAnchor}`);
    return { status: 'scene', state: enterScene(adventure, next, forcedAnchor) };
  }

  // ── target resolution ─────────────────────────────────────────────────────
  let target = resolveNext(choice.next, next);

  // endAfter: force end after N total beats
  if (adventure.endAfter && next.beat >= adventure.endAfter && target.kind !== 'end') {
    target = { kind: 'end' };
  }

  // acts: block END while any act is still incomplete
  if (target.kind === 'end' && acts.length > 0 && act < acts.length) {
    target = { kind: 'generate' };
  }

  if (target.kind === 'scene') {
    if (!adventure.scenes[target.id]) throw new Error(`Unknown scene: ${target.id}`);
    return { status: 'scene', state: enterScene(adventure, next, target.id) };
  }
  if (target.kind === 'end') {
    const ended = { ...next, ended: true };
    return { status: 'end', state: ended, ending: pickEnding(adventure, ended) };
  }
  return { status: 'generate', state: next, choice, hint: choice.hint ?? null };
}

/** Returns the current act definition for a state, or null if no acts or all complete. */
export function currentAct(adventure, state) {
  const acts = adventure.acts ?? [];
  return acts[state.act ?? 0] ?? null;
}

/** Install an LLM-written (already validated + sanitized) scene and move to it. */
export function provideGeneratedScene(adventure, state, scene) {
  const id = `gen-${state.beat}`;
  const withScene = { ...state, generated: { ...state.generated, [id]: scene } };
  return enterScene(adventure, withScene, id);
}

/** Used when the LLM call fails or returns garbage. Always safe, always three choices. */
export function fallbackScene(state) {
  const last = state.history[state.history.length - 1];
  return {
    place: 'COMMERCIAL BREAK · WE\'LL BE RIGHT BACK',
    narration: `The producers cut away${last ? ` right after you chose to: "${last.text}"` : ''}. When the cameras come back, nobody will discuss it.`,
    speaker: '',
    line: '',
    confessional: '',
    mood: 'neutral',
    fx: [],
    memory: [],
    choices: [
      { text: 'Pretend that never happened.', next: 'END', delta: { pop: 5 } },
      { text: 'Demand a second take.', next: 'END', delta: { drama: 10 } },
      { text: 'Leave through the window. Take the snacks.', next: 'END', delta: { pop: -5 } },
    ],
  };
}

/** First ending whose condition holds (the last one should have no condition). */
export function pickEnding(adventure, state) {
  const hit = adventure.endings.find((e) => evalCondition(e.if, state));
  if (!hit) throw new Error('No ending matched. The last ending must have no "if".');
  const { spice = {}, if: _condition, ...core } = hit;
  const ending = { ...core, ...(spice[String(state.spice)] ?? {}) };
  const recap = state.flags.map((f) => adventure.flags?.[f]?.recap).filter(Boolean);
  return { title: ending.title, text: ending.text, recap, stats: { ...state.stats } };
}
