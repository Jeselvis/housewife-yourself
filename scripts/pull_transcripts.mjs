#!/usr/bin/env node
/**
 * Pull episode transcripts for one show into local text files.
 *
 * Setup (once):
 *     npm install playwright
 *     npx playwright install chromium
 *
 * Usage:
 *     node scripts/pull_transcripts.mjs "https://subslikescript.com/series/The_Real_Housewives_of_New_York_City-1191056" \
 *         --out transcripts/rhony --delay 4 --limit 3
 *
 * Notes:
 * - Renders pages in a real headless browser, so JS-built pages work.
 * - Honors robots.txt and sleeps between requests. Skips files already saved,
 *   so you can stop and resume.
 * - Keep the output private (add it to .gitignore). Only the beat extractor
 *   should read it.
 * - The CSS selectors below are best guesses. If a page comes back empty,
 *   open one in your browser, inspect it, and adjust SCRIPT_SELECTORS.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { URL } from 'url';

const USER_AGENT = 'Mozilla/5.0 (compatible; lake-sparkle-scout/0.1; personal research)';
const SCRIPT_SELECTORS = ['.full-script', 'article .main-article', 'article', 'main'];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'untitled';
}

async function fetchRobotsTxt(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseDisallowed(robotsTxt) {
  const disallowed = new Set();
  let applies = false;
  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    if (!line) { applies = false; continue; }
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      applies = value === '*';
    } else if (applies && field === 'disallow' && value) {
      disallowed.add(value);
    }
  }
  return disallowed;
}

function allowed(disallowed, url) {
  if (!disallowed) return true;
  const path = new URL(url).pathname;
  for (const pattern of disallowed) {
    if (path.startsWith(pattern)) return false;
  }
  return true;
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function render(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
}

async function collectEpisodeLinks(page, showUrl) {
  await render(page, showUrl);
  const parsed = new URL(showUrl);
  const base = `${parsed.protocol}//${parsed.host}`;
  const showSlug = parsed.pathname.replace(/\/$/, '').split('/').at(-1);

  const anchors = await page.$$eval(
    'a[href]',
    (els) => els.map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim() }))
  );

  const seen = new Set();
  const episodes = [];
  for (const a of anchors) {
    if (!a.href) continue;
    const href = new URL(a.href, base).href;
    if (showSlug && href.includes(showSlug) && href.includes('/season-') && href.includes('/episode-') && !seen.has(href)) {
      seen.add(href);
      episodes.push({ url: href, title: a.text });
    }
  }
  return episodes;
}

async function extractText(page) {
  for (const sel of SCRIPT_SELECTORS) {
    const el = await page.$(sel);
    if (el) {
      const text = (await el.innerText()).trim();
      if (text.length > 500) return text;
    }
  }
  return '';
}

function parseArgs() {
  const args = process.argv.slice(2);
  let showUrl = null;
  let out = 'transcripts';
  let delay = 4.0;
  let limit = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--delay') delay = parseFloat(args[++i]);
    else if (args[i] === '--limit') limit = parseInt(args[++i], 10);
    else if (!args[i].startsWith('--')) showUrl = args[i];
  }

  if (!showUrl) {
    console.error('Usage: node scripts/pull_transcripts.mjs <show_url> [--out dir] [--delay secs] [--limit n]');
    process.exit(1);
  }

  return { showUrl, out, delay, limit };
}

async function main() {
  const { showUrl, out, delay, limit } = parseArgs();

  await mkdir(out, { recursive: true });

  const parsed = new URL(showUrl);
  const origin = `${parsed.protocol}//${parsed.host}`;
  const robotsTxt = await fetchRobotsTxt(origin);
  const disallowed = robotsTxt ? parseDisallowed(robotsTxt) : null;

  if (!allowed(disallowed, showUrl)) {
    console.error('robots.txt disallows this URL. Stopping.');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page = await ctx.newPage();

  try {
    const episodes = await collectEpisodeLinks(page, showUrl);
    console.log(`Found ${episodes.length} episode links`);
    await writeFile(join(out, '_index.json'), JSON.stringify(episodes, null, 2));

    let done = 0;
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      if (limit && done >= limit) break;
      if (!allowed(disallowed, ep.url)) {
        console.log(`[${i + 1}] skipped (robots): ${ep.url}`);
        continue;
      }

      const m = ep.url.match(/season-(\d+)\/episode-(\d+)/);
      const prefix = m
        ? `s${String(parseInt(m[1])).padStart(2, '0')}e${String(parseInt(m[2])).padStart(2, '0')}`
        : `ep${String(i + 1).padStart(4, '0')}`;
      const filePath = join(out, `${prefix}-${slugify(ep.title)}.txt`);

      if (await fileExists(filePath)) continue;

      await sleep(delay * 1000);

      try {
        await render(page, ep.url);
        const text = await extractText(page);
        if (!text) {
          console.log(`[${i + 1}] no transcript text found: ${ep.url}`);
          continue;
        }
        await writeFile(filePath, `SOURCE: ${ep.url}\n\n${text}\n`, 'utf-8');
        done++;
        console.log(`[${i + 1}] saved ${filePath.split('/').at(-1)} (${text.length.toLocaleString()} chars)`);
      } catch (e) {
        console.log(`[${i + 1}] error: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main();
