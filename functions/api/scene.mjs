// Scene generation — shared by Vite dev middleware and worker.js (Cloudflare).
// No env vars read directly; caller supplies keys.

// No Ajv — Cloudflare Workers block new Function(). Inline validation instead.
import passions from '../../adventures/passions.json'
import toast from '../../adventures/toast.json'
import lakeSparkleCast from '../../cast/lake-sparkle.json'
import briarwoodCast from '../../cast/briarwood.json'
import lakewoodCast from '../../cast/lakewood.json'

const ADVENTURES = { passions, toast }
const CASTS = { 'lake-sparkle': lakeSparkleCast, briarwood: briarwoodCast, lakewood: lakewoodCast }

const VALID_MOODS = new Set(['neutral', 'surprised', 'angry', 'smug'])
const VALID_FX    = new Set(['wine', 'souffle', 'horns', 'sparkle'])

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
const DEFAULT_MAGICA_MODEL = 'openai/gpt-5.6-terra'
const MAGICA_BASE_URL      = 'https://inference.magica.com/v1'
const MAX_OUTPUT_TOKENS    = 600
const PROVIDER_TIMEOUT_MS  = 29000

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

function validateGeneratedScene(scene, adv, cast) {
  const errors = []
  if (!scene || typeof scene !== 'object') return ['scene is not an object']
  if (!scene.place)     errors.push('missing place')
  if (!scene.narration) errors.push('missing narration')
  if (!scene.speaker)   errors.push('missing speaker')
  if (!scene.line)      errors.push('missing line')
  if (scene.speaker && !cast.characters[scene.speaker])
    errors.push(`speaker "${scene.speaker}" not in cast — must be one of: ${Object.keys(cast.characters).join(', ')}`)
  if (!Array.isArray(scene.choices) || scene.choices.length < 3)
    errors.push(`need at least 3 choices, got ${scene.choices?.length ?? 0}`)
  if (scene.mood && !VALID_MOODS.has(scene.mood))
    errors.push(`invalid mood "${scene.mood}" — must be: ${[...VALID_MOODS].join(', ')}`)
  if (Array.isArray(scene.choices)) {
    scene.choices.forEach((c, i) => {
      if (!c.text) errors.push(`choice[${i}] missing text`)
      if (c.next !== 'generate' && c.next !== 'END')
        errors.push(`choice[${i}] next must be "generate" or "END", got "${c.next}"`)
    })
  }
  return errors
}

function sanitizeGeneratedScene(scene, adv) {
  const approved = new Set(Object.keys(adv.flags ?? {}))
  const statKeys  = new Set(Object.keys(adv.stats))
  return {
    ...scene,
    mood: VALID_MOODS.has(scene.mood) ? scene.mood : 'neutral',
    fx:   Array.isArray(scene.fx) ? scene.fx.filter(f => VALID_FX.has(f)) : [],
    choices: scene.choices.map((c) => {
      const delta = {}
      for (const [key, val] of Object.entries(c.delta ?? {})) {
        if (!statKeys.has(key)) continue
        const step = adv.stats[key].maxStep ?? Infinity
        delta[key] = Math.max(-step, Math.min(step, val))
      }
      const set = (c.set ?? []).filter(f => approved.has(f))
      const out = { text: c.text, next: c.next, delta }
      if (set.length) out.set = set
      if (c.hint) out.hint = c.hint
      return out
    }),
  }
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

Reply with ONE JSON object exactly matching this shape. No prose, no code fences.

SCHEMA
{
  "place":     "LOCATION IN CAPS",
  "narration": "1-2 sentences, present tense, second person.",
  "speaker":   "CAST NAME",
  "line":      "what they say",
  "mood":      "neutral",
  "fx":        [],
  "choices": [
    { "text": "choice text", "next": "generate", "delta": { "drama": 5  } },
    { "text": "choice text", "next": "generate", "delta": {}              },
    { "text": "choice text", "next": "END",      "delta": { "drama": 10 } }
  ]
}

RULES
- speaker: exactly one name from CAST.
- narration: 1–2 sentences, present tense, second person.
- React to the player's last choice and active flags. Callback to memory when funny.
- Never repeat a joke from RECENT BEATS. Each beat is wilder than the last.
- Exactly 3 choices. Each a distinct absurd move — funny to read, not just wild. One MUST be so unhinged it would make a producer spill their coffee.
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
  const { stats, flags, inventory, memory, recentBeats, lastScene, choice, beat, actGoal } = req
  const statStr = Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(', ')
  return [
    `Beat: ${beat}`,
    actGoal ? `Act goal: ${actGoal}` : '',
    `Stats: ${statStr}`,
    `Active flags: ${flags.length ? flags.join(', ') : 'none'}`,
    inventory?.length ? `Inventory: ${inventory.join(', ')}` : '',
    memory.length ? `Cast remembers: ${memory.slice(-8).join(' | ')}` : '',
    recentBeats?.length ? `Recent beats (don't repeat): ${recentBeats.slice(-4).join(' | ')}` : '',
    lastScene?.speaker ? `Last: ${lastScene.speaker} said "${lastScene.line}"` : '',
    `Player chose: "${choice.text}"`,
    choice.hint ? `Hint: ${choice.hint}` : '',
  ].filter(Boolean).join('\n')
}

// ── provider calls ────────────────────────────────────────────────────────────

async function callMagica(systemPrompt, userMessage, { key, base = MAGICA_BASE_URL, model = DEFAULT_MAGICA_MODEL }) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.9,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Magica HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Empty response from Magica')
  return text
}

async function callGemini(systemPrompt, userMessage, { key, model = DEFAULT_GEMINI_MODEL }) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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

  console.log('[scene] system prompt:', prompt.slice(0, 300))
  console.log('[scene] user message:', userMessage)

  const rawText = await callProvider(prompt, userMessage, keys)
  console.log('[scene] raw response:', rawText.slice(0, 800))

  // Some models wrap JSON in markdown code fences despite response_format: json_object
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed
  try { parsed = JSON.parse(cleaned) } catch (e) {
    if (attempt < 2) return tryGenerate(adventure, cast, systemPrompt, userMessage, keys, 2, `JSON parse failed: ${e.message}`)
    throw new Error(`JSON parse failed on retry: ${e.message} | raw: ${rawText.slice(0, 300)}`)
  }

  const errors = validateGeneratedScene(parsed, adventure, cast)
  if (errors.length) {
    console.error('[scene] validation errors:', errors.join('; '))
    console.error('[scene] raw parsed:', JSON.stringify(parsed).slice(0, 500))
    if (attempt < 2) return tryGenerate(adventure, cast, systemPrompt, userMessage, keys, 2, `Validation errors: ${errors.join('; ')}`)
    throw new Error(`Validation failed after retry: ${errors.join('; ')}`)
  }

  return sanitizeGeneratedScene(parsed, adventure)
}

// ── public entry point ────────────────────────────────────────────────────────

// ── Cloudflare Pages Function entry point ─────────────────────────────────────

export async function onRequestPost(context) {
  const { request, env } = context
  let body
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
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

// ── shared logic (also used by Vite dev middleware) ───────────────────────────

/**
 * @param {object} body — request body matching LLM_CONTRACT.md
 * @param {object} keys — { magicaKey, geminiKey, provider?, model? }
 */
export async function handleSceneRequest(body, keys) {
  const { adventureId, spice } = body ?? {}
  if (!adventureId) return { error: 'Missing adventureId', status: 400 }

  let adventure, cast
  try {
    adventure = getAdventure(adventureId)
    cast = getCast(adventure.cast)
  } catch {
    return { error: `Unknown adventure: ${adventureId}`, status: 400 }
  }

  const systemPrompt = buildSystemPrompt(adventure, cast, spice ?? 2)
  const userMessage = buildUserMessage(body)

  try {
    const scene = await tryGenerate(adventure, cast, systemPrompt, userMessage, keys)
    return scene ? { scene } : { fallback: true, reason: 'generate returned null' }
  } catch (err) {
    console.error('[scene] provider error:', err?.message ?? err)
    return { fallback: true, reason: err?.message ?? String(err) }
  }
}
