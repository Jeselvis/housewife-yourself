# Deploying to Cloudflare Pages

## Prerequisites

- Cloudflare account
- Repo pushed to GitHub
- API keys: `GEMINI_API_KEY` and/or `MAGICA_API_KEY` (whichever provider you use)

## 1. Rename `api/` → `functions/`

Cloudflare Pages Functions must live in `functions/` at the repo root. The URL `/api/scene` maps to `functions/api/scene.mjs`.

```bash
git mv api functions
git commit -m "rename api/ to functions/ for Cloudflare Pages"
git push
```

## 2. Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise GitHub and pick the `housewife-yourself` repo
3. Set build settings:

| Setting | Value |
|---|---|
| Build command | `cd app && npm install && npm run build` |
| Build output directory | `app/dist` |
| Root directory | *(leave blank)* |

4. Click **Save and Deploy**

## 3. Add environment variables

After first deploy: **Settings** → **Environment variables** → add for **Production** (and optionally Preview):

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | your key |
| `MAGICA_API_KEY` | your key (if using Magica provider) |
| `SCENE_PROVIDER` | `gemini` or `magica` |
| `SCENE_MODEL` | optional — overrides default model |

Redeploy after adding vars: **Deployments** → **Retry deployment**.

## 4. Verify the function is wired

Hit the API endpoint directly to confirm it's routing (not 404):

```bash
curl -X POST https://your-project.pages.dev/api/scene \
  -H "Content-Type: application/json" \
  -d '{"adventureId":"goat","spice":1,"stats":{},"flags":[],"inventory":[],"memory":{},"recentBeats":[],"lastScene":{"place":"","speaker":"","line":""},"choice":{"text":"test"},"beat":1}'
```

Should return JSON (or a structured error), not a 404.

## 5. Custom domain (optional)

**Pages project** → **Custom domains** → **Set up a custom domain** → enter your domain.

If the domain is already on Cloudflare, DNS is configured automatically. Otherwise point a CNAME at `your-project.pages.dev`.

## Notes

- No `wrangler.toml` needed for Pages Functions
- `?scripted=1` query param disables LLM calls and uses fallback scenes only (useful for testing)
- Free tier is plenty for a game at normal traffic
