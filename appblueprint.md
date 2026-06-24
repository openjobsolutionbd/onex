# ONEX – App Blueprint

**Version:** 2.1.0
**Last updated:** 2026-06-24 (search update)

## Overview
ONEX is a single-page PWA — Personal Knowledge Operating System। এটা একজন ব্যবহারকারীর জন্য। GitHub-কে storage হিসেবে ব্যবহার করে content লেখা, review করা, এবং push করা যায়। Eye-friendly warm dark/light theme, offline support (service worker), এবং token-based GitHub authentication।

## Tech Stack
- HTML5, CSS3 (custom properties for theming)
- Vanilla JavaScript (no frameworks)
- GitHub API v3 (contents endpoint)
- Service Worker (offline caching — static assets only)
- Web App Manifest (PWA installability)

## File Structure

```
/
├── index.html        # Main HTML shell
├── style.css         # All styling (dark + light theme)
├── app.js            # Core logic (search, write, pending, settings, push)
├── logger.js         # Remote log storage (batched, GitHub-backed)
├── assistant.js      # Rule-based automation (token/network error handling)
├── sw.js             # Service worker (static cache only, API excluded)
├── manifest.json     # PWA manifest
├── version.txt       # Semver version string
├── update_version.py # Version bump utility
└── appblueprint.md   # This file
```

## Script Load Order (Critical)
```html
<script src="/app.js"></script>      <!-- S object defined here — must be first -->
<script src="/logger.js"></script>   <!-- uses S — loaded after app.js -->
<script src="/assistant.js"></script><!-- uses S — loaded after app.js -->
```
`init()` is deferred via `DOMContentLoaded` so logger and assistant are ready before use.

## Content Write Flow
```
Write view-এ লেখো (topic + category + content)
    ↓ "Send →" (sendToPending)
Pending Review-এ যায় → remote _system/pending.json-এ save
    ↓ "✓ Approve" (approveAndPush)
GitHub repo-তে push হয় → category/id.js ফাইল তৈরি
    ↓ (updateSearchIndex)
_system/index.json আপডেট হয় → পরের search-এ সঙ্গে সঙ্গে দেখায়
```
Write-এর "Send →" সরাসরি GitHub-এ push করে না।

## Remote Storage (_system/ folder in target repo)
| ফাইল | কী রাখে |
|---|---|
| `_system/index.json` | **Search index** — সব approved entry (id, title, category, date, content, md, repo) |
| `_system/pending.json` | Approve-এর অপেক্ষায় থাকা entries |
| `_system/logs.json` | App logs (max 300 entries, oldest trimmed) |
| `_system/rules.json` | Assistant-এর শেখা rules (token expired, network unstable) |

## Features
- **Search** — Live search (180ms debounce), category filter chips. Data loaded from `_system/index.json` at startup. New entries indexed automatically after each approve.
- **Write** — Topic / Category (custom category support) / Content, Send to Pending
- **Pending** — Remote-synced review queue, Approve & Push / Edit / Reject
- **GitHub Integration** — Personal access token (localStorage only, never leaves browser except to api.github.com)
- **Logger** — Batched remote logs, 2s debounce (errors flush immediately), max 300 entries
- **Assistant** — Detects token expiry and network issues from logs, stores rules remotely
- **Theme** — Warm dark & light mode, persisted in localStorage
- **PWA** — Installable, offline-capable (static assets cached; API always network-first)

## API Endpoints Used
- `GET /repos/{owner}/{repo}/contents/{path}` — file read / SHA check
- `PUT /repos/{owner}/{repo}/contents/{path}` — file create / update

## Entry Schema
```js
{
  id:       "topic-name-1719187200000",  // slug + timestamp
  title:    "Topic Name",
  category: "grammar",
  date:     "2026-06-24",
  content:  "first 200 chars...",        // search snippet
  md:       "full content",
  repo:     "owner/repo"                 // target repo, preserved through pending
}
```
**ID generation note:** Only whitespace is replaced with `-`. Bengali and other Unicode characters are preserved. If the entire topic is whitespace, fallback is `untitled-TIMESTAMP`.

## System Files (_system/)
These are managed automatically. Never edit manually.

## Security
- GitHub token stored in localStorage (client-side only)
- No server-side component; token only leaves browser to `api.github.com`
- `rules.tokenExpired` resets automatically when a new token is saved in Settings

## Service Worker Strategy
- **Static assets** (`/`, `index.html`, `style.css`, `app.js`, etc.) — cache-first
- **`api.github.com`**, Google Fonts — network-only (never cached)

## Deployment
1. Push all files to a GitHub repository (e.g., `openjobsolutionbd/onex`)
2. Connect to Cloudflare Pages
3. Build command: `python update_version.py` (optional) or leave empty
4. Publish directory: `/` (root)
5. App served over HTTPS — fulfills PWA requirements

## Versioning
- `version.txt` holds current version (e.g., `2.0.0`)
- Run `python update_version.py` before deploy to bump patch version and update SW cache name

## Development
- No build step. Edit files directly, test with any static server (`npx serve .`)
- For local PWA testing, `localhost` works without HTTPS

## Detail View
Markdown rendering inline (no external library). Supported:
`# h1` `## h2` `### h3` `**bold**` `*italic*` `` `code` `` ` ```block``` ` `- list`

Detail sheet shows: title + category chip + date + rendered markdown body.

## Known Limitations / Future Work
- [x] Search index load — `_system/index.json` থেকে load হয়, approve করলে auto-update
- [ ] GitHub Actions script: `.md` → `data.js` auto-conversion (long-term)
- [ ] GitHub Actions script: `.md` → `data.js` auto-conversion
- [ ] Search backend (Cloudflare D1)
- [ ] db-repo folder/taxonomy structure
- [ ] db-repo → ojs-repo connection (future)
