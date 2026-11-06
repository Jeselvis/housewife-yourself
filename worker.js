import { handleSceneRequest } from './functions/api/scene.mjs'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

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
