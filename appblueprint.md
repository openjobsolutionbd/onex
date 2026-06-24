# ONEX – App Blueprint

**Version:** 2.0.3
**Last updated:** 2026-06-24 (remaining bug fixes — edit/repo/category, markdown rendering, SW cache, file manager hardening)

> ⚠️ **নিয়ম (AI/Claude-এর জন্য — সবসময় মানতে হবে):**
> ONEX-এর কোডে যখনই কোনো feature যুক্ত/পরিবর্তন/মুছে ফেলা হয় এবং নতুন zip দেওয়া হয়, তখন **এই appblueprint.md ফাইলটা একই সাথে আপডেট করতে হবে** — user আলাদা করে না বললেও। আপডেট করতে হবে:
> - **Version** ও **Last updated** তারিখ (উপরে)
> - **Features** section-এ নতুন feature-এর এক লাইন entry
> - প্রাসঙ্গিক flow diagram (নতুন বা existing section-এ)
> - **API Endpoints Used** — নতুন কোনো GitHub API endpoint ব্যবহার হলে
> - **Known Limitations / Future Work** — কিছু সমাধান হলে checkbox tick করা, নতুন কিছু বাকি থাকলে যুক্ত করা
>
> zip বানানোর আগে সবসময় চেক করো: appblueprint.md কি কোডের সাথে sync আছে? sync না থাকলে zip পাঠানোর আগেই ঠিক করে নাও।

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
├── icons/            # Real PNG icons (192, 512, 512-maskable) — referenced by manifest.json + apple-touch-icon
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
- **File Manager** — Settings → "📂 এই repo-র ফাইল দেখো"। সিলেক্ট করা repo-র (DB/OJS/ONEX) সম্পূর্ণ file tree (folder + file, recursive) লোড করে browse করা যায়, manual path টাইপ না করে tap করে ফাইলে ঢোকা যায়, content view/edit/update(push)/delete করা যায়। GitHub Contents API + Trees API ব্যবহার করে।
- **Logger** — Batched remote logs, 2s debounce (errors flush immediately), max 300 entries
- **Assistant** — Detects token expiry and network issues from logs, stores rules remotely
- **Theme** — Warm dark & light mode, persisted in localStorage
- **PWA** — Installable, offline-capable (static assets cached; API always network-first)

## File Manager (Settings → ফাইল ম্যানেজার)
```
Settings-এ repo সিলেক্ট করো (DB / OJS / ONEX বাটন)
    ↓ "📂 এই repo-র ফাইল দেখো"
GET /git/trees/{branch}?recursive=1  → পুরো repo-র file list (FB.tree-তে cache হয়)
    ↓ folder tap করলে fbOpenDir() — client-side filter, নতুন API call লাগে না
    ↓ file tap করলে fbOpenFile()
GET /contents/{path}  → content + sha লোড, File Editor sheet খোলে
    ↓ "✓ আপডেট করো" (saveCurrentFile)
PUT /contents/{path}  → sha দিয়ে file overwrite, response-এর নতুন sha সংরক্ষণ
    ↓ "🗑 ডিলিট" (deleteCurrentFile) — confirm() এর পর
DELETE /contents/{path}  → sha দিয়ে file remove, list auto-refresh
```
- পুরো repo tree একবারেই (single API call) load হয় — folder navigation পরে পুরোটাই client-side, কোনো নতুন network call লাগে না।
- State: `FB = { repo, tok, tree, path, curFile, originalText }` — app.js-এর শীর্ষে, `S` state-এর independent। `FB.tok` Settings-এর live token input থেকে পড়া হয় (Save চাপার আগেও কাজ করে)।
- প্রতিটা ফাইল-অপারেশন (open/save/delete) `logInfo`/`logError`/`logWarn`-এর মাধ্যমে remote logs-এ যায়।
- Repo নির্বাচন reuse করে Settings-এর existing `sGhRepo` hidden input — আলাদা কোনো নতুন repo-input লাগেনি।
- Safety checks: ১MB+ ফাইল ব্লক করা হয় (GitHub Contents API limit), পরিচিত বাইনারি extension (ছবি/zip/pdf ইত্যাদি) খোলার আগে confirm চায়, unsaved change থাকলে বন্ধ করার আগে confirm চায়, path-এর প্রতিটা অংশ আলাদাভাবে এনকোড হয় (`fbEncodePath`)।

## API Endpoints Used
- `GET /repos/{owner}/{repo}` — default branch নির্ণয়
- `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` — পুরো repo file tree (File Manager)
- `GET /repos/{owner}/{repo}/contents/{path}` — file read / SHA check
- `PUT /repos/{owner}/{repo}/contents/{path}` — file create / update
- `DELETE /repos/{owner}/{repo}/contents/{path}` — file delete (File Manager)

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
- [x] Bengali/Unicode-safe remote read (index/pending/logs/rules) — `fromBase64()` (UTF-8 safe) সব জায়গায় ব্যবহার হয়। (fixed: v2.0.2)
- [x] Remote write failure visibility — index/pending/logs/rules সেভ ব্যর্থ হলে UI-তে স্পষ্ট error/warning দেখায়। (fixed: v2.0.2)
- [x] Edit ≈ Reject সমস্যা — `removeFromPending()` হেল্পার আলাদা করা হয়েছে; Edit করলে আর "Reject" হিসেবে গণনা/শেখা হয় না। (fixed: v2.0.3)
- [x] Edit-এর পর ভুল repo-তে push হওয়ার ঝুঁকি — `selectRepoByValue()` দিয়ে Edit করার সময় আগের target repo auto-restore হয়। (fixed: v2.0.3)
- [x] Multi-word custom category push path ভাঙা — `slugifyCat()` দিয়ে category সবসময় slug আকারে সেভ হয় (স্পেস → hyphen)। (fixed: v2.0.3)
- [x] Markdown list/heading/code-block invalid nesting — `renderMd()` সম্পূর্ণ rewrite, এখন `<ul><li>` ঠিকভাবে wrap হয়, heading/code-block আর বাইরের `<p>`-এর ভেতরে নেস্ট হয় না। (fixed: v2.0.3)
- [x] Service worker cache cleanup — `activate` listener যুক্ত হয়েছে, পুরোনো cache version delete হয়; `skipWaiting()`/`clients.claim()` দিয়ে নতুন version সাথে সাথে কার্যকর হয়। (fixed: v2.0.3)
- [x] File Manager token live-read — `openFileBrowser()` এখন Settings-এর live token input পড়ে (Save চাপার আগেও কাজ করবে), `FB.tok`-এ আলাদাভাবে সংরক্ষিত। (fixed: v2.0.3)
- [x] File Manager বড়/বাইনারি ফাইল হ্যান্ডলিং — ১MB+ ফাইল ব্লক করা হয়, পরিচিত বাইনারি extension-এ (ছবি/zip/pdf ইত্যাদি) খোলার আগে confirm চায়। (fixed: v2.0.3)
- [x] File Editor: ভুল ট্যাপে unsaved change হারানো — `attemptCloseFileEditor()` মূল কনটেন্টের সাথে তুলনা করে, পরিবর্তন থাকলে confirm চায়। (fixed: v2.0.3)
- [x] File Manager path encoding — `fbEncodePath()` প্রতিটা path-segment আলাদাভাবে `encodeURIComponent` করে; `#`, `?`, `&` থাকা ফাইলনেমেও কাজ করবে। (fixed: v2.0.3)
- [x] GitHub Trees API truncated তালিকা — বড় repo-তে list অসম্পূর্ণ হলে এখন স্পষ্ট ⚠ warning দেখায়। (fixed: v2.0.3)
- [x] selectRepo() cross-contamination — Write view-এ repo সিলেক্ট করলে Settings-এর repo বাটনের active state ভুলভাবে পরিবর্তন হতো (একই `.repo-row .repo-btn` selector পুরো page-এ match করত); এখন `btn.closest('.repo-row')` দিয়ে স্কোপ করা হয়েছে। (fixed: v2.0.3)
- [x] PWA icon compatibility — manifest.json ও apple-touch-icon আগে inline data-URI SVG ব্যবহার করত (কিছু Android/iOS-এ ঠিকমতো না দেখানোর ঝুঁকি ছিল, এবং iOS apple-touch-icon SVG সাপোর্ট করে না)। এখন real PNG ফাইল (`/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-512-maskable.png`) ব্যবহার হয়, SW cache-এও যুক্ত। (fixed: v2.0.3)
- [ ] GitHub Actions script: `.md` → `data.js` auto-conversion (long-term)
- [ ] GitHub Actions script: `.md` → `data.js` auto-conversion
- [ ] Search backend (Cloudflare D1)
- [ ] db-repo folder/taxonomy structure
- [ ] db-repo → ojs-repo connection (future)
