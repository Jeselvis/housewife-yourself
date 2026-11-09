// GET  /api/eval-results  — return stored eval data (public, read-only)
// POST /api/eval-results  — append new results (requires Bearer token from EVAL_TOKEN env var)
//
// KV key: "eval"  (single JSON blob, same shape as the local eval-results.json)
// Setup:  wrangler kv namespace create EVAL_STORE
//         fill the returned id into wrangler.toml [[kv_namespaces]]
//         set EVAL_TOKEN secret: wrangler secret put EVAL_TOKEN

const HEADERS_JSON = { 'Content-Type': 'application/json' };
const MAX_RUNS = 500;

export async function onRequestGet({ env }) {
  if (!env.EVAL_STORE) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 503, headers: HEADERS_JSON });
  }
  const raw = await env.EVAL_STORE.get('eval');
  if (!raw) {
    return new Response(JSON.stringify({ runs: [], summaries: [] }), { headers: HEADERS_JSON });
  }
  return new Response(raw, { headers: HEADERS_JSON });
}

export async function onRequestPost({ request, env }) {
  if (!env.EVAL_STORE) {
    return new Response(JSON.stringify({ error: 'KV not bound' }), { status: 503, headers: HEADERS_JSON });
  }

  // auth
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!env.EVAL_TOKEN || token !== env.EVAL_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: HEADERS_JSON });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: HEADERS_JSON });
  }

  const { runs: newRuns = [], summary = null } = body;
  if (!Array.isArray(newRuns) || newRuns.length === 0) {
    return new Response(JSON.stringify({ error: 'runs must be a non-empty array' }), { status: 400, headers: HEADERS_JSON });
  }

  // load existing
  const raw = await env.EVAL_STORE.get('eval');
  const existing = raw ? JSON.parse(raw) : { runs: [], summaries: [] };

  existing.runs.push(...newRuns);
  if (existing.runs.length > MAX_RUNS) existing.runs = existing.runs.slice(-MAX_RUNS);
  if (summary) existing.summaries.push(summary);

  await env.EVAL_STORE.put('eval', JSON.stringify(existing));
  return new Response(JSON.stringify({ ok: true, total: existing.runs.length }), { headers: HEADERS_JSON });
}
