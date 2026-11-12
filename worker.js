import { handleSceneRequest } from './functions/api/scene.mjs'

function authorized(request, env) {
  if (!env.SITE_PASSWORD) return true  // no password set → open
  const header = request.headers.get('Authorization') ?? ''
  const [scheme, encoded] = header.split(' ')
  if (scheme !== 'Basic' || !encoded) return false
  try {
    const [, pass] = atob(encoded).split(':')
    return pass === env.SITE_PASSWORD
  } catch { return false }
}

function getUsername(request) {
  const header = request.headers.get('Authorization') ?? ''
  const [scheme, encoded] = header.split(' ')
  if (scheme !== 'Basic' || !encoded) return null
  try {
    const [user] = atob(encoded).split(':')
    return user || null
  } catch { return null }
}

export default {
  async fetch(request, env) {
    if (!authorized(request, env)) {
      return new Response('Unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Lake Sparkle Adventure"' },
      })
    }

    const url = new URL(request.url)

    if (url.pathname === '/api/ping') {
      const player = getUsername(request)
      if (player && env.EVAL_STORE) {
        env.EVAL_STORE.put(`player:${player}`, JSON.stringify({ lastSeen: Date.now() })).catch(() => {})
      }
      return new Response(JSON.stringify({ ok: true, player: player ?? 'anonymous' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.pathname === '/api/scene') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 })
      }
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

    return env.ASSETS.fetch(request)
  },
}
