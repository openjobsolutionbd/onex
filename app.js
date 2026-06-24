// ── Base64 already global from index.html ──

// ── STATE ──
const S = {
  tok: localStorage.getItem('onex_gh_token') || '',
  repo: localStorage.getItem('onex_gh_repo') || '',
  pending: [],    // loaded from remote
  data: [],       // search data — loaded from _system/index.json on init
};

// ── REMOTE PATHS ──
const PENDING_PATH = '_system/pending.json';
const INDEX_PATH   = '_system/index.json';

// ── SEARCH INDEX ──
async function loadSearchData() {
  if (!S.tok || !S.repo) {
    const box = document.getElementById('results');
    if (box) box.innerHTML = '<div class="empty"><div class="empty-ico">⚙</div><div class="empty-lbl">Settings-এ GitHub token ও repo সেট করো</div></div>';
    return;
  }
  const [owner, repo] = S.repo.split('/');
  const box = document.getElementById('results');
  if (box) box.innerHTML = '<div class="empty"><div class="empty-lbl" style="margin-top:24px">লোড হচ্ছে…</div></div>';
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${INDEX_PATH}`, {
      headers: { Authorization: 'token ' + S.tok }
    });
    if (res.ok) {
      const data = await res.json();
      S.data = JSON.parse(atob(data.content.replace(/\s/g, '')));
      await logInfo('search', `${S.data.length} টি entry লোড হয়েছে`);
    } else {
      S.data = [];  // index এখনো তৈরি হয়নি — নতুন repo
    }
  } catch (e) {
    S.data = [];
    console.warn('loadSearchData failed', e);
  }
  renderFilters();
  doSearch();
}

async function updateSearchIndex(entry) {
  const targetRepo = entry.repo || S.repo;
  if (!S.tok || !targetRepo) return;
  const [owner, repo] = targetRepo.split('/');
  let index = [];
  let sha = null;
  // সর্বশেষ remote index নিয়ে আসো (অন্য session-এর entries হারাবে না)
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${INDEX_PATH}`, {
      headers: { Authorization: 'token ' + S.tok }
    });
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
      index = JSON.parse(atob(data.content.replace(/\s/g, '')));
    }
  } catch (e) { /* নতুন repo — index নেই */ }
  // Add বা update
  const existing = index.findIndex(e => e.id === entry.id);
  if (existing >= 0) index[existing] = entry;
  else index.push(entry);
  // GitHub-এ save
  const b64 = toBase64(JSON.stringify(index));
  try {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${INDEX_PATH}`, {
      method: 'PUT',
      headers: { Authorization: 'token ' + S.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Index: ' + entry.title, content: b64, ...(sha ? { sha } : {}) })
    });
    S.data = index;     // in-memory sync
    renderFilters();
    doSearch();
    await logInfo('search', `Index আপডেট: ${entry.title} (মোট: ${index.length})`);
  } catch (e) {
    await logError('search', 'Index আপডেট ব্যর্থ', e);
  }
}


async function loadRemotePending() {
  if (!S.tok || !S.repo) return;
  const [owner, repo] = S.repo.split('/');
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${PENDING_PATH}`, {
      headers: { Authorization: 'token ' + S.tok }
    });
    if (res.ok) {
      const data = await res.json();
      S.pending = JSON.parse(atob(data.content.replace(/\s/g, '')));
    } else {
      S.pending = [];
    }
  } catch (e) {
    console.warn('Could not load pending', e);
    S.pending = [];
  }
}

async function saveRemotePending() {
  if (!S.tok || !S.repo) return;
  const [owner, repo] = S.repo.split('/');
  const content = JSON.stringify(S.pending);
  const b64 = toBase64(content);
  try {
    let sha = null;
    const chk = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${PENDING_PATH}`, {
      headers: { Authorization: 'token ' + S.tok }
    });
    if (chk.ok) sha = (await chk.json()).sha;
    await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${PENDING_PATH}`, {
      method: 'PUT',
      headers: { Authorization: 'token ' + S.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update pending', content: b64, ...(sha ? { sha } : {}) })
    });
  } catch (e) {
    console.error('Failed to save pending', e);
  }
}

// ── INIT ──
async function init() {
  updateGH();
  // Load remote data
  await loadRemoteLogs();
  await loadAssistantRules();
  await loadRemotePending();
  await loadSearchData();
  await assistantAnalyze();

  loadCustomCats();
  renderFilters();
  updateBadge();
  renderPending();

  if (S.repo) {
    document.getElementById('sGhRepo').value = S.repo;
    const map = { 'openjobsolutionbd/db': 'sRepo-db', 'openjobsolutionbd/app': 'sRepo-app', 'openjobsolutionbd/onex': 'sRepo-onex' };
    const btnId = map[S.repo];
    if (btnId) {
      ['sRepo-db','sRepo-app','sRepo-onex'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
      const el = document.getElementById(btnId); if (el) el.classList.add('active');
    }
  }

  // live search
  let t;
  document.getElementById('sInput').addEventListener('input', () => { clearTimeout(t); t = setTimeout(doSearch, 180); });
  document.getElementById('sInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

// ── NAV ──
function switchView(name, btn) {
  logInfo('nav', 'ভিউ সুইচ → ' + name);
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  document.querySelector('main').scrollTo(0, 0);
}

// ── GH STATUS ──
function updateGH() {
  const mark = document.getElementById('logoMark');
  const pd = document.getElementById('ghPillDot');
  const pt = document.getElementById('ghPillTxt');
  const pill = document.getElementById('ghPill');
  if (S.tok && S.repo) {
    mark.classList.add('on'); pd.classList.add('on'); pill.classList.add('on');
    pt.textContent = S.repo;
  } else {
    mark.classList.remove('on'); pd.classList.remove('on'); pill.classList.remove('on');
    pt.textContent = 'not connected';
  }
}

// ── SEARCH ──
let activeFilter = null;
function renderFilters() {
  const cats = [...new Set(S.data.map(d => d.category))];
  const row = document.getElementById('filterRow');
  row.innerHTML = '';
  cats.forEach(c => {
    const el = document.createElement('button');
    el.className = 'chip' + (activeFilter === c ? ' active' : '');
    el.textContent = c;
    el.onclick = () => { activeFilter = activeFilter === c ? null : c; renderFilters(); doSearch(); };
    row.appendChild(el);
  });
}
function doSearch() {
  const q = document.getElementById('sInput').value.trim().toLowerCase();
  const box = document.getElementById('results');
  const lbl = document.getElementById('resLabel');
  if (!q && !activeFilter) {
    const cats = [...new Set(S.data.map(d => d.category))];
    lbl.textContent = cats.length ? 'ক্যাটাগরি বেছে নাও' : '';
    if (cats.length) {
      box.innerHTML = cats.map(c => `<button class="chip" onclick="activeFilter='${c}';renderFilters();doSearch();" style="margin:4px;">${c}</button>`).join('');
    } else {
      box.innerHTML = '<div class="empty"><div class="empty-lbl">কোনো ক্যাটাগরি নেই</div></div>';
    }
    return;
  }
  let res = S.data;
  if (activeFilter) res = res.filter(d => d.category === activeFilter);
  if (q) res = res.filter(d => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
  if (!res.length) {
    lbl.textContent = '';
    box.innerHTML = '<div class="empty"><div class="empty-ico">◎</div><div class="empty-lbl">কিছু পাওয়া যায়নি</div><div class="empty-hint">অন্য keyword চেষ্টা করো</div></div>';
    return;
  }
  lbl.textContent = res.length + ' টি entry';
  box.innerHTML = res.map((r, i) => {
    let snip = r.content;
    if (q) {
      const idx = snip.toLowerCase().indexOf(q);
      if (idx > -1) {
        const s = Math.max(0, idx - 35);
        snip = (s ? '…' : '') + snip.slice(s, idx) + '<em>' + snip.slice(idx, idx + q.length) + '</em>' + snip.slice(idx + q.length, idx + q.length + 70) + '…';
      } else snip = snip.slice(0, 110) + '…';
    } else snip = snip.slice(0, 110) + '…';
    return `<div class="card" style="animation-delay:${i * 0.05}s" onclick="openDetail('${r.id}')">
      <div class="card-meta"><span class="cat-tag">${r.category}</span><span class="card-date">${r.date}</span></div>
      <div class="card-title">${r.title}</div>
      <div class="card-snip">${snip}</div>
    </div>`;
  }).join('');
}

// ── DETAIL SHEET ──
function renderMd(text) {
  if (!text) return '';
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return '<p>' + h + '</p>';
}

function openDetail(id) {
  const e = S.data.find(d => d.id === id);
  if (!e) { logWarn('detail', 'Entry পাওয়া যায়নি: ' + id); return; }
  const meta = `<div class="d-meta"><span class="chip">${e.category}</span><span class="d-date">${e.date || ''}</span></div>`;
  document.getElementById('dContent').innerHTML =
    `<h1 class="d-title">${e.title}</h1>${meta}<div class="d-body">${renderMd(e.md || e.content)}</div>`;
  document.getElementById('dOverlay').classList.add('open');
  document.getElementById('dSheet').classList.add('open');
}
function closeDetail() {
  document.getElementById('dOverlay').classList.remove('open');
  document.getElementById('dSheet').classList.remove('open');
}

// ── CATEGORY ──
function loadCustomCats() {
  const saved = JSON.parse(localStorage.getItem('onex_custom_cats') || '[]');
  const sel = document.getElementById('wCat');
  const customOpt = sel.querySelector('option[value="__custom__"]');
  saved.forEach(c => {
    if (!sel.querySelector(`option[value="${c}"]`)) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
      sel.insertBefore(opt, customOpt);
    }
  });
}
function saveCustomCat(cat) {
  const saved = JSON.parse(localStorage.getItem('onex_custom_cats') || '[]');
  if (!saved.includes(cat)) {
    saved.push(cat);
    localStorage.setItem('onex_custom_cats', JSON.stringify(saved));
  }
  const sel = document.getElementById('wCat');
  if (!sel.querySelector(`option[value="${cat}"]`)) {
    const customOpt = sel.querySelector('option[value="__custom__"]');
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    sel.insertBefore(opt, customOpt);
  }
  sel.value = cat;
  document.getElementById('wCatCustom').style.display = 'none';
}
function toggleCustomCat() {
  const sel = document.getElementById('wCat');
  const inp = document.getElementById('wCatCustom');
  if (sel.value === '__custom__') {
    inp.style.display = 'block';
    inp.focus();
    inp.onkeydown = e => {
      if (e.key === 'Enter') {
        const val = inp.value.trim().toLowerCase();
        if (val) saveCustomCat(val);
      }
    };
    inp.onblur = () => {
      const val = inp.value.trim().toLowerCase();
      if (val) saveCustomCat(val);
    };
  } else {
    inp.style.display = 'none';
  }
}
function getCategory() {
  const sel = document.getElementById('wCat');
  if (sel.value === '__custom__') {
    return document.getElementById('wCatCustom').value.trim().toLowerCase();
  }
  return sel.value;
}

// ── SEND TO PENDING (Write view "Send →" button) ──
async function sendToPending() {
  const topic = document.getElementById('wTopic').value.trim();
  const cat = getCategory();
  const repo = document.getElementById('wRepo').value;
  const md = document.getElementById('wContent').value.trim();
  if (!topic) { setSbar('Topic দাও', 'err'); return; }
  if (!cat) { setSbar('Category বেছে নাও বা লেখো', 'err'); return; }
  if (!md) { setSbar('Content লেখো', 'err'); return; }
  const idBase = topic.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  const id = idBase + '-' + Date.now();
  const date = new Date().toISOString().split('T')[0];
  const targetRepo = repo || 'openjobsolutionbd/db';
  const entry = { id, title: topic, category: cat, date, content: md.slice(0, 200), md, repo: targetRepo };
  S.pending.push(entry);
  await saveRemotePending();
  updateBadge();
  renderPending();
  setSbar('✓ Pending Review-এ পাঠানো হয়েছে', 'ok');
  await logInfo('write', `Pending-এ যোগ: ${topic}`);
  clearWrite();
}

// ── PUSH TO GITHUB (called from approveAndPush only) ──
async function pushToGH(entry) {
  const canPush = await assistantBeforePush();
  if (!canPush) return false;
  const targetRepo = entry.repo || 'openjobsolutionbd/db';
  const path = `${entry.category}/${entry.id}.js`;
  const jsContent = `export default ${JSON.stringify({ id: entry.id, title: entry.title, category: entry.category, date: entry.date, content: entry.md }, null, 2)};\n`;
  const b64 = toBase64(jsContent);
  const [owner, repoName] = targetRepo.split('/');
  await logInfo('push', `পুশ শুরু: ${entry.title} (${targetRepo}/${path})`);
  try {
    let sha = null;
    const chk = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, {
      headers: { Authorization: 'token ' + S.tok }
    });
    if (chk.ok) sha = (await chk.json()).sha;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: 'token ' + S.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Add: ' + entry.title, content: b64, ...(sha ? { sha } : {}) })
    });
    if (!res.ok) throw new Error((await res.json()).message);
    await logInfo('push', `পুশ সফল: ${entry.title}`);
    return true;
  } catch (e) {
    await logError('push', `পুশ ব্যর্থ: ${entry.title}`, e);
    await assistantAfterError('push', e);
    return false;
  }
}

async function approveAndPush(id) {
  const entry = S.pending.find(e => e.id === id);
  if (!entry) return;
  const btn = document.getElementById('app-' + id);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  setSbar('<span class="spin"></span>Push হচ্ছে…', 'ld');
  await logInfo('pending', `Approve শুরু: ${entry.title}`);
  const ok = await pushToGH(entry);
  if (ok) {
    await updateSearchIndex(entry);   // index আপডেট + S.data sync
    S.pending = S.pending.filter(e => e.id !== id);
    await saveRemotePending();
    renderPending(); updateBadge();
    setSbar('✓ "' + entry.title + '" pushed!', 'ok');
    await logInfo('pending', `Approve সফল: ${entry.title}`);
  } else {
    setSbar('✗ Push ব্যর্থ — লগ দেখো', 'err');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Approve'; }
  }
}

async function rejectEntry(id) {
  const e = S.pending.find(x => x.id === id);
  S.pending = S.pending.filter(x => x.id !== id);
  await saveRemotePending();
  renderPending(); updateBadge();
  if (e) {
    await logWarn('pending', `Reject: ${e.title}`);
    await assistantLearnReject(e.title);
  }
}

async function editPending(id) {
  const e = S.pending.find(x => x.id === id);
  if (!e) return;
  document.getElementById('wTopic').value = e.title;
  document.getElementById('wCat').value = e.category;
  document.getElementById('wContent').value = e.md;
  await rejectEntry(id);
  switchView('write', document.getElementById('nb-write'));
}

// ── PENDING ──
function renderPending() {
  const list = document.getElementById('pendList');
  const ct = document.getElementById('pendCt');
  ct.textContent = S.pending.length + ' entry অপেক্ষায়';
  if (!S.pending.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">✓</div><div class="empty-lbl">সব clear</div></div>';
    return;
  }
  list.innerHTML = S.pending.map(e => `
    <div class="pcard">
      <div class="pcard-title">${e.title}</div>
      <div class="pcard-meta">${e.category} · ${e.repo || 'openjobsolutionbd/db'} · ${e.date}</div>
      <div class="pcard-preview">${e.content.slice(0, 130)}…</div>
      <div class="pcard-acts">
        <button class="pact pact-ok" id="app-${e.id}" onclick="approveAndPush('${e.id}')">✓ Approve</button>
        <button class="pact pact-ed" onclick="editPending('${e.id}')">Edit</button>
        <button class="pact pact-no" onclick="rejectEntry('${e.id}')">✕</button>
      </div>
    </div>`).join('');
}
function updateBadge() {
  const b = document.getElementById('badge');
  b.style.display = S.pending.length ? 'flex' : 'none';
  b.textContent = S.pending.length;
}

// ── WRITE HELPERS ──
function clearWrite() {
  ['wTopic', 'wContent', 'wCatCustom'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('wCat').value = '';
  document.getElementById('wCatCustom').style.display = 'none';
  setSbar('', '');
}
function setSbar(msg, type) {
  const el = document.getElementById('wSbar');
  el.innerHTML = msg;
  el.className = 'sbar' + (type ? ' ' + type : '');
}

// ── REPO SELECT ──
function selectRepo(btn, val) {
  document.querySelectorAll('.repo-row .repo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('wRepo').value = val;
}
function selectSettRepo(btn, val) {
  ['sRepo-db', 'sRepo-app', 'sRepo-onex'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  btn.classList.add('active');
  document.getElementById('sGhRepo').value = val;
}

// ── SETTINGS ──
function openSettings() {
  document.getElementById('settModal').classList.add('open');
  document.getElementById('sGhToken').value = localStorage.getItem('onex_gh_token') || '';
  const savedRepo = localStorage.getItem('onex_gh_repo') || '';
  if (savedRepo) {
    document.getElementById('sGhRepo').value = savedRepo;
    const map = { 'openjobsolutionbd/db': 'sRepo-db', 'openjobsolutionbd/app': 'sRepo-app', 'openjobsolutionbd/onex': 'sRepo-onex' };
    ['sRepo-db', 'sRepo-app', 'sRepo-onex'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
    const btnId = map[savedRepo];
    if (btnId) { const el = document.getElementById(btnId); if (el) el.classList.add('active'); }
  }
}
function closeSettings() { document.getElementById('settModal').classList.remove('open'); }
function saveSettings() {
  const token = document.getElementById('sGhToken').value.trim();
  const repo = document.getElementById('sGhRepo').value.trim();
  if (token) {
    localStorage.setItem('onex_gh_token', token);
    S.tok = token;
    if (typeof resetTokenExpired === 'function') resetTokenExpired();
    logInfo('settings', 'gh token সংরক্ষিত');
  }
  if (repo) {
    localStorage.setItem('onex_gh_repo', repo);
    S.repo = repo;
    logInfo('settings', 'Target repo সংরক্ষিত: ' + repo);
  }
  updateGH();
  closeSettings();
  alert('Settings saved!');
}

// ── LOG VIEWER ──
function showLogs() {
  closeSettings();
  const logs = getLogs();
  const logStr = logs.map(l =>
    `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.tag}: ${l.message}` +
    (l.error ? ' | Error: ' + l.error : '') +
    (l.data ? ' | Data: ' + JSON.stringify(l.data) : '')
  ).join('\n');
  const w = window.open('', 'ONEX_Logs', 'width=700,height=500,scrollbars=yes');
  w.document.write('<pre style="font-size:12px;white-space:pre-wrap;">' + (logStr || 'কোনো লগ নেই') + '</pre>');
}

// ── THEME ──
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('onex_theme', isLight ? 'light' : 'dark');
  document.getElementById('themeBtn').textContent = isLight ? '☀️' : '🌙';
}
function loadTheme() {
  const t = localStorage.getItem('onex_theme');
  if (t === 'light') {
    document.documentElement.classList.add('light');
    document.getElementById('themeBtn').textContent = '☀️';
  }
}

// ── PWA SERVICE WORKER ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => logInfo('sw', 'Service Worker নিবন্ধিত'))
    .catch(err => logError('sw', 'Service Worker নিবন্ধন ব্যর্থ', err));
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  loadTheme();
});