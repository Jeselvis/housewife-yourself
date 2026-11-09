#!/usr/bin/env node
/**
 * LLM eval runner. Plays fixed fixtures through the real endpoint and writes
 * results to app/public/eval-results.json for the /analytics page.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/eval.mjs
 *   GEMINI_API_KEY=xxx node scripts/eval.mjs --runs 10 --adventure toast --provider gemini
 *   MAGICA_API_KEY=xxx node scripts/eval.mjs --provider magica --model openai/gpt-5.6-terra
 *
 * Outputs JSON to app/public/eval-results.json (gitignored).
 * Whether it's actually funny is a manual check — read a few outputs at the end.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSceneRequest } from '../functions/api/scene.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = join(root, 'app/public/eval-results.json');

// When EVAL_ENDPOINT is set, POST results there instead of writing locally.
// Set EVAL_TOKEN to match the secret on the Worker.
// Example: EVAL_ENDPOINT=https://your-site.pages.dev EVAL_TOKEN=xxx node scripts/eval.mjs
const EVAL_ENDPOINT = process.env.EVAL_ENDPOINT ?? null;
const EVAL_TOKEN    = process.env.EVAL_TOKEN ?? null;

// ── cli args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };

const RUNS     = parseInt(get('--runs', '5'), 10);
const FILTER   = get('--adventure', null);   // null = all fixtures
const PROVIDER = get('--provider', 'gemini');
const MODEL    = get('--model', null);        // null = provider default

const keys = {
  geminiKey: process.env.GEMINI_API_KEY,
  magicaKey: process.env.MAGICA_API_KEY,
  provider:  PROVIDER,
  model:     MODEL ?? undefined,
};

if (!keys.geminiKey && !keys.magicaKey) {
  console.error('Set GEMINI_API_KEY or MAGICA_API_KEY');
  process.exit(1);
}

// ── fixtures ──────────────────────────────────────────────────────────────────
// Representative mid-game states. Each becomes the request body.

const FIXTURES = [
  {
    id: 'passions-chapel',
    adventureId: 'passions',
    spice: 2,
    beat: 3,
    stats: { drama: 70, chaos: 55, tears: 1, destiny: 18000 },
    flags: ['helped_crystal'],
    inventory: [],
    memory: [
      'Crystal grabbed you at the garden and claims Vangie does not exist.',
      'Crystal gave you a photograph. Vangie\'s Wikipedia page was created eighteen months ago.',
      'The ceremony has begun at Crane Manor chapel.',
    ],
    recentBeats: [
      'Crystal: "That\'s Vangie at a conference in Geneva in 2019."',
      'You pocketed the photograph as evidence.',
    ],
    lastScene: {
      place: 'CRANE MANOR · THE CHAPEL · 4:31 PM',
      speaker: 'VANGIE HOTCH',
      line: 'I\'m not here to make friends. I\'m here to make a marriage.',
    },
    choice: {
      text: 'Sit in the back and wait. Something is definitely coming.',
      hint: 'Something small but significant happens in the row ahead of you.',
    },
    actGoal: 'The ceremony is happening and it must be disrupted.',
  },
  {
    id: 'passions-basement',
    adventureId: 'passions',
    spice: 3,
    beat: 4,
    stats: { drama: 85, chaos: 75, tears: 2, destiny: 25000 },
    flags: ['helped_crystal', 'evil_awakened'],
    inventory: [],
    memory: [
      'Crystal grabbed you at the garden.',
      'Something is in the Crane Manor basement. Magdalena\'s ex-husband, apparently.',
      'The basement door is always unlocked. This is a known problem.',
      'The ceremony has stopped. Everyone in the chapel is now looking at the same point.',
    ],
    recentBeats: [
      'Magdalena: "He\'s still down there."',
      'You announced something was in the basement to all the guests.',
      'The ceremony stopped.',
    ],
    lastScene: {
      place: 'CRANE MANOR · THE CHAPEL · 4:52 PM',
      speaker: 'VANGIE HOTCH',
      line: 'All right. Fine. You want the truth?',
    },
    choice: {
      text: 'Magdalena whispers something to you. You repeat it aloud to the whole chapel.',
      hint: 'What Magdalena whispered concerns the basement, the guest list, and a year nobody mentioned.',
    },
    actGoal: 'Everything is in the open — escalate to a decisive ending.',
  },
  {
    id: 'toast-georgie',
    adventureId: 'toast',
    spice: 2,
    beat: 2,
    stats: { drama: 55, brand: 18000, alliances: 2 },
    flags: ['georgie_survived'],
    inventory: [],
    memory: [
      'Georgie Chase is already at the holiday party and flirting with everyone.',
      'Georgie offered a double martini and a trip to Florida.',
      'Georgie is tracking which of his tests you have passed. He will not say which.',
    ],
    recentBeats: [
      'Georgie: "It\'ll be the kinkiest experience you\'ve ever had at a holiday dinner."',
      'You accepted the martini.',
    ],
    lastScene: {
      place: 'HOTEL GROTTO · THE TABLE · 7:22 PM',
      speaker: 'GEORGIE CHASE',
      line: 'You have passed two of three tests tonight. I\'ll tell you which two after dinner.',
    },
    choice: {
      text: 'Tell Georgie about Celeste\'s boyfriend Marceau and watch his face.',
      hint: 'Georgie has opinions about Marceau involving the French, accents, and an unresolved property dispute.',
    },
    actGoal: 'Survive the holiday party — navigate Georgie, survive the Secret Santa, and pick a side in the photoshoot drama.',
  },
  {
    id: 'toast-confrontation',
    adventureId: 'toast',
    spice: 3,
    beat: 11,
    stats: { drama: 82, brand: 32000, alliances: 4 },
    flags: ['georgie_survived', 'mimosa_sided', 'wine_defended', 'accent_defended'],
    inventory: ['wine_glass'],
    memory: [
      'Mimosa is furious about how Dallas handled the toaster oven photoshoot.',
      'Roxy believes Celeste deliberately set her up to fail at the wine tasting.',
      'Roxy accused Marceau of faking his French accent the moment he left the room.',
      'Celeste and Roxy are in a full hallway confrontation.',
      'Dallas called Roxy \'crazy\' to someone\'s husband — a separate incident happening simultaneously.',
    ],
    recentBeats: [
      'Roxy: "She tried to make me say my own wine was [BLEEP]!"',
      'You defended Roxy\'s brand publicly.',
      'Roxy: "FAKE. ACCENT. I called it at the first \'au revoir\'!"',
      'You told Celeste immediately about the accent mocking.',
    ],
    lastScene: {
      place: 'JANNA BULLOCK\'S TOWNHOUSE · THE HALLWAY · 9:19 PM',
      speaker: 'CELESTE DE VILLIERS',
      line: 'You said something decent. I need a witness for what I am about to do. Are you available?',
    },
    choice: {
      text: 'Back away into the crowd, pick up a glass of champagne, and watch from a safe distance while everything burns.',
      hint: 'Something escalates that you could not have predicted even from your safe distance.',
    },
    actGoal: 'At Janna\'s party the wine drama has boiled over. Someone is about to scream.',
  },
];

// ── runner ────────────────────────────────────────────────────────────────────

function percentile(sorted, p) {
  const i = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, i))];
}

async function runFixture(fixture, run) {
  const start = Date.now();
  let outcome = 'success';
  let retried = false;
  let scene = null;
  let error = null;

  // Instrument retries by wrapping keys with a counting proxy is complex —
  // instead we infer retry from the response having no scene but no fallback flag,
  // which isn't reliable. Simpler: just track latency + outcome.
  try {
    const result = await handleSceneRequest(fixture, keys);
    const latencyMs = Date.now() - start;
    if (result.fallback) {
      outcome = 'fallback';
      error = result.reason ?? 'unknown';
    } else {
      scene = result.scene;
    }
    return { id: `${fixture.id}-r${run}`, fixture: fixture.id, adventureId: fixture.adventureId,
      provider: PROVIDER, model: MODEL ?? 'default', spice: fixture.spice,
      beat: fixture.beat, run, latencyMs, outcome, retried, scene, error,
      timestamp: new Date().toISOString() };
  } catch (err) {
    return { id: `${fixture.id}-r${run}`, fixture: fixture.id, adventureId: fixture.adventureId,
      provider: PROVIDER, model: MODEL ?? 'default', spice: fixture.spice,
      beat: fixture.beat, run, latencyMs: Date.now() - start, outcome: 'error',
      retried: false, scene: null, error: err.message, timestamp: new Date().toISOString() };
  }
}

async function main() {
  const fixtures = FILTER ? FIXTURES.filter(f => f.adventureId === FILTER) : FIXTURES;
  if (!fixtures.length) { console.error(`No fixtures match --adventure ${FILTER}`); process.exit(1); }

  console.log(`Eval: ${RUNS} runs × ${fixtures.length} fixtures = ${RUNS * fixtures.length} requests`);
  console.log(`Provider: ${PROVIDER}  Model: ${MODEL ?? 'default'}\n`);

  const results = [];
  for (const fixture of fixtures) {
    for (let r = 1; r <= RUNS; r++) {
      process.stdout.write(`  ${fixture.id} run ${r}/${RUNS} ... `);
      const result = await runFixture(fixture, r);
      results.push(result);
      const tag = result.outcome === 'success' ? '✓' : result.outcome === 'fallback' ? '✗ fallback' : '✗ error';
      console.log(`${tag}  ${result.latencyMs}ms`);
      // brief pause to avoid hammering rate limits
      if (r < RUNS) await new Promise(res => setTimeout(res, 500));
    }
    console.log('');
  }

  // summary
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const successes = results.filter(r => r.outcome === 'success').length;
  const fallbacks = results.filter(r => r.outcome === 'fallback').length;
  const errors    = results.filter(r => r.outcome === 'error').length;
  const summary = {
    total: results.length,
    success: successes,
    fallback: fallbacks,
    error: errors,
    successRate: +(successes / results.length).toFixed(3),
    fallbackRate: +((fallbacks + errors) / results.length).toFixed(3),
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p95LatencyMs: percentile(latencies, 0.95),
    provider: PROVIDER,
    model: MODEL ?? 'default',
    runs: RUNS,
    generatedAt: new Date().toISOString(),
  };

  console.log('── Summary ──────────────────────────────────');
  console.log(`Success:   ${(summary.successRate * 100).toFixed(0)}%  (${successes}/${results.length})`);
  console.log(`Fallback:  ${(summary.fallbackRate * 100).toFixed(0)}%  (${fallbacks + errors}/${results.length})`);
  console.log(`Avg ms:    ${summary.avgLatencyMs}`);
  console.log(`p95 ms:    ${summary.p95LatencyMs}`);

  if (EVAL_ENDPOINT) {
    // POST to Cloudflare Worker — results live in KV, analytics page reads them there
    const url = EVAL_ENDPOINT.replace(/\/$/, '') + '/api/eval-results';
    console.log(`\nPosting to ${url} ...`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(EVAL_TOKEN ? { Authorization: `Bearer ${EVAL_TOKEN}` } : {}),
      },
      body: JSON.stringify({ runs: results, summary }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`POST failed ${res.status}: ${text}`);
    } else {
      const data = await res.json();
      console.log(`Stored. Total runs in KV: ${data.total}`);
    }
    console.log(`Open ${EVAL_ENDPOINT.replace(/\/$/, '')}/analytics to review.\n`);
  } else {
    // local fallback — write to app/public/eval-results.json
    let existing = { runs: [], summaries: [] };
    if (existsSync(OUT)) {
      try { existing = JSON.parse(readFileSync(OUT, 'utf8')); } catch {}
    }
    existing.runs.push(...results);
    existing.summaries.push(summary);
    if (existing.runs.length > 500) existing.runs = existing.runs.slice(-500);
    writeFileSync(OUT, JSON.stringify(existing, null, 2));
    console.log(`\nResults written to ${OUT.replace(root + '/', '')}`);
    console.log('Open /analytics while the dev server runs to review.\n');
  }

  // print a few sample scenes for manual review
  const samples = results.filter(r => r.scene).slice(0, 2);
  for (const s of samples) {
    console.log(`── Sample: ${s.fixture} ──`);
    console.log(`  ${s.scene.speaker}: "${s.scene.line}"`);
    s.scene.choices?.forEach((c, i) => console.log(`  [${i + 1}] ${c.text}`));
    console.log('');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
