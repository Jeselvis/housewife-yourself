#!/usr/bin/env python3
"""
Pull episode transcripts for one show into local text files.

Setup (once):
    pip install playwright
    playwright install chromium

Usage:
    python pull_transcripts.py "https://subslikescript.com/series/The_Real_Housewives_of_New_York_City-1191056" \
        --out transcripts/rhony --delay 4 --limit 3

Notes:
- Renders pages in a real headless browser, so JS-built pages work.
- Honors robots.txt and sleeps between requests. Skips files already saved,
  so you can stop and resume.
- Keep the output private (add it to .gitignore). Only the beat extractor
  should read it.
- The CSS selectors below are best guesses. If a page comes back empty,
  open one in your browser, inspect it, and adjust SCRIPT_SELECTORS.
"""
import argparse
import json
import re
import time
import urllib.robotparser
from pathlib import Path
from urllib.parse import urljoin, urlparse

from playwright.sync_api import sync_playwright

USER_AGENT = "Mozilla/5.0 (compatible; lake-sparkle-scout/0.1; personal research)"
SCRIPT_SELECTORS = [".full-script", "article .main-article", "article", "main"]


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "untitled"


def allowed(rp: urllib.robotparser.RobotFileParser, url: str) -> bool:
    return rp.can_fetch(USER_AGENT, url)


def render(page, url: str) -> None:
    page.goto(url, wait_until="networkidle", timeout=60_000)


def collect_episode_links(page, show_url: str) -> list[dict]:
    render(page, show_url)
    base = f"{urlparse(show_url).scheme}://{urlparse(show_url).netloc}"
    anchors = page.eval_on_selector_all(
        "a[href]", "els => els.map(a => ({href: a.getAttribute('href'), text: a.textContent.trim()}))"
    )
    show_slug = urlparse(show_url).path.rstrip("/").split("/")[-1]
    seen, episodes = set(), []
    for a in anchors:
        href = urljoin(base, a["href"])
        # episode pages look like /series/<show-slug>/season-N/episode-M
        if show_slug in href and "/season-" in href and "/episode-" in href and href not in seen:
            seen.add(href)
            episodes.append({"url": href, "title": a["text"]})
    return episodes


def extract_text(page) -> str:
    for sel in SCRIPT_SELECTORS:
        el = page.query_selector(sel)
        if el:
            text = el.inner_text().strip()
            if len(text) > 500:
                return text
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("show_url")
    ap.add_argument("--out", default="transcripts")
    ap.add_argument("--delay", type=float, default=4.0, help="seconds between requests")
    ap.add_argument("--limit", type=int, default=0, help="max episodes (0 = all)")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    origin = f"{urlparse(args.show_url).scheme}://{urlparse(args.show_url).netloc}"
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(urljoin(origin, "/robots.txt"))
    rp.read()
    if not allowed(rp, args.show_url):
        raise SystemExit("robots.txt disallows this URL. Stopping.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=USER_AGENT)
        page = ctx.new_page()

        episodes = collect_episode_links(page, args.show_url)
        print(f"Found {len(episodes)} episode links")
        (out / "_index.json").write_text(json.dumps(episodes, indent=2))

        done = 0
        for i, ep in enumerate(episodes, 1):
            if args.limit and done >= args.limit:
                break
            if not allowed(rp, ep["url"]):
                print(f"[{i}] skipped (robots): {ep['url']}")
                continue
            m = re.search(r"season-(\d+)/episode-(\d+)", ep["url"])
            prefix = f"s{int(m.group(1)):02d}e{int(m.group(2)):02d}" if m else f"ep{i:04d}"
            path = out / f"{prefix}-{slugify(ep['title'])}.txt"
            if path.exists():
                continue
            time.sleep(args.delay)
            try:
                render(page, ep["url"])
                text = extract_text(page)
            except Exception as e:  # keep going on one-off failures
                print(f"[{i}] error: {e}")
                continue
            if not text:
                print(f"[{i}] no transcript text found: {ep['url']}")
                continue
            path.write_text(f"SOURCE: {ep['url']}\n\n{text}\n", encoding="utf-8")
            done += 1
            print(f"[{i}] saved {path.name} ({len(text):,} chars)")

        browser.close()


if __name__ == "__main__":
    main()
