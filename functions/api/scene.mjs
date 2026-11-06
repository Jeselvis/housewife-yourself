// Scene generation — shared by Vite dev middleware and Cloudflare Pages Function (onRequestPost).
// No env vars read directly; caller supplies keys.

import { createValidator, sanitizeGeneratedScene } from '../../src/validate/validate.js'

// Statically imported so bundlers (Vite + Cloudflare esbuild) include them at build time.
import goat       from '../../adventures/goat.json'    assert { type: 'json' }
import reunion    from '../../adventures/reunion.json'  assert { type: 'json' }
import passions   from '../../adventures/passions.json' assert { type: 'json' }
import lakeSparkleCast from '../../cast/lake-sparkle.json' assert { type: 'json' }
import briarwoodCast   from '../../cast/briarwood.json'    assert { type: 'json' }
import adventureSchema     from '../../schema/adventure.schema.json'       assert { type: 'json' }
import castSchema          from '../../schema/cast.schema.json'            assert { type: 'json' }
import generatedSceneSchema from '../../schema/generated-scene.schema.json' assert { type: 'json' }

const ADVENTURES = { goat, reunion, passions }
const CASTS = { 'lake-sparkle': lakeSparkleCast, briarwood: briarwoodCast }

function getAdventure(id) {
  const adv = ADVENTURES[id]
  if (!adv) throw new Error(`Unknown adventure: ${id}`)
  return adv
}
function getCast(id) {
  const cast = CASTS[id]
  if (!cast) throw new Error(`Unknown cast: ${id}`)
  return cast
}

let _validator = null
function getValidator() {
  if (!_validator) {
    _validator = createValidator({ adventureSchema, castSchema, generatedSceneSchema })
  }
  return _validator
}

// ── prompt ───────────────────────────────────────────────────────────────────

const SPICE_GUIDE = {
  1: 'Gentle camp. Passive-aggressive politeness. Silly chaos, no insults.',
  2: 'Vain, vengeful, shameless. Dark confessionals. Mild insults, no swearing.',
  3: 'Savage, feral, wildly escalating. Swearing is always bleeped like "[BLEEP]". Innuendo stays implied.',
}

function buildSystemPrompt(adventure, cast, spice) {
  const castLines = Object.entries(cast.characters)
    .map(([name, c]) => `${name}: ${c.voice} | secret hint: ${c.secret} | spice ceiling: ${c.spice}`)
    .join('\n')
  const flagIds = Object.keys(adventure.flags ?? {}).join(', ') || 'none'
  const statIds = Object.keys(adventure.stats).join(', ')
  return `You write one beat of "The Real Housewives of Lake Sparkle", a retro text-adventure parody of reality TV. Everything is fictional.

TONE: ${adventure.tone}
SPICE ${spice}: ${SPICE_GUIDE[spice]}

Reply with ONE JSON object matching the schema. No prose, no code fences.

RULES
- speaker must be exactly one name from CAST.
- narration: 1–2 sentences, present tense, second person.
- React to the player's last choice and to active flags. Callback to memory when funny.
- Never repeat a joke from RECENT BEATS. Each beat is wilder than the last.
- Exactly 3 choices. Each is a distinct absurd move. Funny to read, not just wild. One choice MUST be so unhinged it would make a producer spill their coffee — escalate beyond what seems reasonable.
- delta values are integers. Brand Value in dollars (3000–20000 typical).
- set: only flags from APPROVED FLAGS, only when the choice would cause it.
- mood: neutral | surprised | angry | smug.
- fx: wine | souffle | horns | sparkle — only when something physically happens to the speaker.
- Never exceed a character's spice ceiling.
- next is ONLY "generate" or "END". Never invent scene ids.
- choices[].delta keys must only be from STATS.
- NEVER use real people, real brands, real shows, slurs, explicit content, or real tragedies as punchlines.

CAST
${castLines}

APPROVED FLAGS: ${flagIds}
STATS: ${statIds}`
}

function buildUserMessage(req) {
  const { stats, flags, inventory, memory, recentBeats, lastScene, choice, beat } = req
  const statStr = Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(', ')
  return [
    `Beat: ${beat}`,
    `Stats: ${statStr}`,
    `Active flags: ${flags.length ? flags.join(', ') : 'none'}`,
    inventory?.length ? `Inventory: ${inventory.join(', ')}` : '',
    memory.length  ? `Cast remembers: ${memory.slice(-8).join(' | ')}` : '',
    recentBeats?.length ? `Recent beats (don't repeat): ${recentBeats.slice(-4).join(' | ')}` : '',
    lastScene?.speaker ? `Last: ${lastScene.speaker} said "${lastScene.line}"` : '',
    `Player chose: "${choice.text}"`,
    choice.hint ? `Hint: ${choice.hint}` : '',
  ].filter(Boolean).join('\n')
}

// ── provider calls ────────────────────────────────────────────────────────────

async function callMagica(systemPrompt, userMessage, { key, base = 'https://inference.magica.com/v1', model = 'deepseek/deepseek-v4.1-flash' }) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.9,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Magica HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from Magica')
  return text
}

async function callGemini(systemPrompt, userMessage, { key, model = 'gemini-2.0-flash' }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 600, temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')
  return text
}

function callProvider(systemPrompt, userMessage, keys) {
  if (keys.geminiKey && keys.provider === 'gemini') {
    return callGemini(systemPrompt, userMessage, { key: keys.geminiKey, model: keys.model })
  }
  return callMagica(systemPrompt, userMessage, { key: keys.magicaKey, model: keys.model })
}

// ── validate + retry ──────────────────────────────────────────────────────────

async function tryGenerate(adventure, cast, systemPrompt, userMessage, keys, attempt = 1, extraInstruction = '') {
  const prompt = extraInstruction
    ? `${systemPrompt}\n\nFIX FROM PREVIOUS ATTEMPT: ${extraInstruction}`
    : systemPrompt

  const rawText = await callProvider(prompt, userMessage, keys)

  let parsed
  try { parsed = JSON.parse(rawText) } catch (e) {
    if (attempt < 2) return tryGenerate(adventure, cast, systemPrompt, userMessage, keys, 2, `JSON parse failed: ${e.message}`)
    return null
  }

  const errors = getValidator().validateGeneratedScene(parsed, adventure, cast)
  if (errors.length) {
    if (attempt < 2) return tryGenerate(adventure, cast, systemPrompt, userMessage, keys, 2, `Validation errors: ${errors.join('; ')}`)
    return null
  }

  return sanitizeGeneratedScene(parsed, adventure)
}

// ── public entry point (used by Vite dev middleware) ─────────────────────────

/**
 * @param {object} body  — request body matching LLM_CONTRACT.md
 * @param {object} keys  — { magicaKey, geminiKey, provider?, model? }
 * @returns {{ scene: object } | { fallback: true } | { error: string, status: number }}
 */
export async function handleSceneRequest(body, keys) {
  const { adventureId, spice } = body ?? {}
  if (!adventureId) return { error: 'Missing adventureId', status: 400 }

  let adventure, cast
  try {
    adventure = getAdventure(adventureId)
    cast      = getCast(adventure.cast)
  } catch {
    return { error: `Unknown adventure: ${adventureId}`, status: 400 }
  }

  const systemPrompt = buildSystemPrompt(adventure, cast, spice ?? 2)
  const userMessage  = buildUserMessage(body)

  try {
    const scene = await tryGenerate(adventure, cast, systemPrompt, userMessage, keys)
    return scene ? { scene } : { fallback: true }
  } catch (err) {
    console.error('[scene] provider error:', err?.message ?? err)
    return { fallback: true }
  }
}

// ── Cloudflare Pages Function entry point ─────────────────────────────────────

export async function onRequestPost(context) {
  const { request, env } = context

  let body
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON', status: 400 }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const keys = {
    geminiKey: env.GEMINI_API_KEY,
    magicaKey: env.MAGICA_API_KEY,
    provider:  env.SCENE_PROVIDER ?? 'gemini',
    model:     env.SCENE_MODEL,
  }

  const result = await handleSceneRequest(body, keys)
  return new Response(JSON.stringify(result), {
    status: result.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
