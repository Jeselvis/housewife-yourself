import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
// Load parent-directory .env so MAGICA_API_KEY / GEMINI_API_KEY reach the middleware.
loadEnv({ path: resolve(__dir, '../.env'), override: false })

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-scene',
      configureServer(server) {
        server.middlewares.use('/api/scene', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }
          let body = ''
          req.on('data', (chunk) => { if (body.length < 10_000) body += chunk })
          req.on('end', async () => {
            res.setHeader('Content-Type', 'application/json')
            try {
              const { handleSceneRequest } = await import('../functions/api/scene.mjs')
              const data = JSON.parse(body)
              const result = await handleSceneRequest(data, {
                magicaKey: process.env.MAGICA_API_KEY,
                geminiKey:  process.env.GEMINI_API_KEY,
                provider:   process.env.SCENE_PROVIDER ?? 'magica',
                model:      process.env.SCENE_MODEL,
              })
              if (result.status) res.statusCode = result.status
              res.end(JSON.stringify(result))
            } catch (err) {
              console.error('[api/scene]', err)
              res.statusCode = 500
              res.end(JSON.stringify({ fallback: true }))
            }
          })
        })
      },
    },
  ],
  server: { fs: { allow: ['..'] } },
})
