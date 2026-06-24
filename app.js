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
      S.data = JSON.parse(fromBase64(data.content));
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
  if (!S.tok || !targetRepo) return false;
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
      index = JSON.parse(fromBase64(data.content));
    }
  } catch (e) { /* নতুন repo — index নেই */ }
  // Add বা update
  const existing = index.findIndex(e => e.id === entry.id);
  if (existing >= 0) index[existing] = entry;
  else index.push(entry);
  // GitHub-এ save
  const b64 = toBase64(JSON.stringify(index));
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${INDEX_PATH}`, {
      method: 'PUT',
      headers: { Authorization: 'token ' + S.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Index: ' + entry.title, content: b64, ...(sha ? { sha } : {}) })
    });
    if (!res.ok) throw new Error((await res.json()).message || ('Index সেভ ব্যর্থ (' + res.status + ')'));
    S.data = index;     // in-memory sync
    renderFilters();
    doSearch();
    await logInfo('search', `Index আপডেট: ${entry.title} (মোট: ${index.length})`);
    return true;
  } catch (e) {
    await logError('search', 'Index আপডেট ব্যর্থ', e);
    return false;
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
      S.pending = JSON.parse(fromBase64(data.content));
    } else {
      S.pending = [];
    }
  } catch (e) {
    console.warn('Could not load pending', e);
    S.pending = [];
  }
}

async function saveRemotePending() {
  if (!S.tok || !S.repo) return false;
  const [owner, repo] = S.repo.split('/');
  const content = JSON.stringify(S.pending);
  const b64 = toBase64(content);
  try {
    let sha = null;
    const chk = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${PENDING_PATH}`, {
      headers: { Authorization: 'token ' + S.tok }
    });
    if (chk.ok) sha = (await chk.json()).sha;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${PENDING_PATH}`, {
      method: 'PUT',
      headers: { Authorization: 'token ' + S.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update pending', content: b64, ...(sha ? { sha } : {}) })
    });
    if (!res.ok) throw new Error((await res.json()).message || ('Pending সেভ ব্যর্থ (' + res.status + ')'));
    return true;
  } catch (e) {
    console.error('Failed to save pending', e);
    return false;
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
  // HTML-special character escape আগে করে নেই
  let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // কোড ব্লক আলাদা করে রাখি (ভেতরের মার্কডাউন প্রসেস না করার জন্য), পরে আবার জোড়া লাগাই
  const codeBlocks = [];
  escaped = escaped.replace(/```([\s\S]*?)```/g, (m, code) => {
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });

  const inline = s => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  const blocks = [];
  let para = [];
  let listItems = [];
  const flushPara = () => { if (para.length) { blocks.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
  const flushList = () => { if (listItems.length) { blocks.push('<ul>' + listItems.join('') + '</ul>'); listItems = []; } };

  escaped.split('\n').forEach(line => {
    const codeMatch = line.match(/^\u0000CODEBLOCK(\d+)\u0000$/);
    const h3 = line.match(/^### (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h1 = line.match(/^# (.+)$/);
    const li = line.match(/^- (.+)$/);
    if (codeMatch) { flushPara(); flushList(); blocks.push(codeBlocks[Number(codeMatch[1])]); }
    else if (h3) { flushPara(); flushList(); blocks.push(`<h3>${inline(h3[1])}</h3>`); }
    else if (h2) { flushPara(); flushList(); blocks.push(`<h2>${inline(h2[1])}</h2>`); }
    else if (h1) { flushPara(); flushList(); blocks.push(`<h1>${inline(h1[1])}</h1>`); }
    else if (li) { flushPara(); listItems.push(`<li>${inline(li[1])}</li>`); }
    else if (line.trim() === '') { flushPara(); flushList(); }
    else { flushList(); para.push(inline(line)); }
  });
  flushPara(); flushList();
  return blocks.join('');
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
function slugifyCat(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function loadCustomCats() {
  const saved = JSON.parse(localStorage.getItem('onex_custom_cats') || '[]');
  const sel = document.getElementById('wCat');
  const customOpt = sel.querySelector('option[value="__custom__"]');
  saved.forEach(c => {
    if (!sel.querySelector(`option[value="${c}"]`)) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      sel.insertBefore(opt, customOpt);
    }
  });
}
function saveCustomCat(rawCat) {
  const cat = slugifyCat(rawCat);  // স্পেসসহ category-কে slug-এ পরিণত করে — push path ভাঙবে না
  if (!cat) return;
  const saved = JSON.parse(localStorage.getItem('onex_custom_cats') || '[]');
  if (!saved.includes(cat)) {
    saved.push(cat);
    localStorage.setItem('onex_custom_cats', JSON.stringify(saved));
  }
  const sel = document.getElementById('wCat');
  if (!sel.querySelector(`option[value="${cat}"]`)) {
    const customOpt = sel.querySelector('option[value="__custom__"]');
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
        if (inp.value.trim()) saveCustomCat(inp.value);
      }
    };
    inp.onblur = () => {
      if (inp.value.trim()) saveCustomCat(inp.value);
    };
  } else {
    inp.style.display = 'none';
  }
}
function getCategory() {
  const sel = document.getElementById('wCat');
  if (sel.value === '__custom__') {
    return slugifyCat(document.getElementById('wCatCustom').value);
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
  const ok = await saveRemotePending();
  if (!ok) {
    S.pending.pop();  // রিমোটে সেভ হয়নি — লোকাল থেকেও বাদ দাও, নাহলে আবার Send করলে duplicate তৈরি হবে
    updateBadge();
    renderPending();
    setSbar('✗ সেভ ব্যর্থ হয়েছে — ইন্টারনেট/টোকেন চেক করে আবার Send চাপো', 'err');
    await logError('write', `Pending সেভ ব্যর্থ: ${topic}`);
    return;
  }
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
    const idxOk = await updateSearchIndex(entry);   // index আপডেট + S.data sync
    S.pending = S.pending.filter(e => e.id !== id);
    const pendOk = await saveRemotePending();
    renderPending(); updateBadge();
    if (idxOk && pendOk) {
      setSbar('✓ "' + entry.title + '" pushed!', 'ok');
      await logInfo('pending', `Approve সফল: ${entry.title}`);
    } else {
      setSbar('⚠ ফাইল GitHub-এ পুশ হয়েছে, কিন্তু ' + (!idxOk ? 'search index' : 'pending list') + ' আপডেট ব্যর্থ — লগ দেখো', 'err');
      await logWarn('pending', `Approve আংশিক সফল (push ok, sync ব্যর্থ): ${entry.title}`);
    }
  } else {
    setSbar('✗ Push ব্যর্থ — লগ দেখো', 'err');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Approve'; }
  }
}

// Pending list থেকে entry সরিয়ে remote-এ সেভ করে — Reject ও Edit দুটোই এই হেল্পার শেয়ার করে,
// কিন্তু "reject" হিসেবে গণনা/শেখা হয় শুধু rejectEntry() থেকে, editPending() থেকে নয়।
async function removeFromPending(id) {
  const e = S.pending.find(x => x.id === id);
  S.pending = S.pending.filter(x => x.id !== id);
  const ok = await saveRemotePending();
  renderPending(); updateBadge();
  return { entry: e, ok };
}

async function rejectEntry(id) {
  const { entry: e, ok } = await removeFromPending(id);
  if (e) {
    await logWarn('pending', `Reject: ${e.title}`);
    await assistantLearnReject(e.title);
  }
  if (!ok) {
    await logError('pending', `Reject remote সেভ ব্যর্থ: ${e ? e.title : id}`);
    setSbar('✗ Reject সেভ ব্যর্থ — ইন্টারনেট/টোকেন চেক করো', 'err');
  }
}

async function editPending(id) {
  const e = S.pending.find(x => x.id === id);
  if (!e) return;
  document.getElementById('wTopic').value = e.title;
  document.getElementById('wCat').value = e.category;
  document.getElementById('wContent').value = e.md;
  selectRepoByValue(e.repo || 'openjobsolutionbd/db');  // আগের target repo ফিরিয়ে আনো, ভুল repo-তে push হওয়া এড়াতে
  const { ok } = await removeFromPending(id);
  await logInfo('pending', `Edit-এর জন্য সরানো হয়েছে: ${e.title}`);
  if (!ok) {
    await logError('pending', `Edit remote সেভ ব্যর্থ: ${e.title}`);
    setSbar('✗ Edit সেভ ব্যর্থ — ইন্টারনেট/টোকেন চেক করো', 'err');
  }
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
  const row = btn.closest('.repo-row');
  if (row) row.querySelectorAll('.repo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('wRepo').value = val;
}
// প্রোগ্রাম্যাটিকভাবে Write view-এর repo বাটন সিলেক্ট করে (Edit-এর সময় আগের target repo ফিরিয়ে আনতে)
function selectRepoByValue(val) {
  const row = document.querySelector('#view-write .repo-row');
  if (!row) return;
  row.querySelectorAll('.repo-btn').forEach(b => {
    const onclickAttr = b.getAttribute('onclick') || '';
    b.classList.toggle('active', onclickAttr.includes(`'${val}'`));
  });
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

// ── FILE BROWSER / EDITOR (Settings → repo-র ভেতরের ফাইল দেখে এডিট/ডিলিট) ──
const FB = {
  repo: '',        // 'owner/repo' — যেটার ফাইল দেখা হচ্ছে
  tok: '',         // ব্যবহৃত token (Settings input-এ নতুন টাইপ করা থাকলেও কাজ করার জন্য, Save চাপার অপেক্ষা না করে)
  tree: [],        // পুরো repo-র flat file list (recursive)
  path: '',        // বর্তমান folder path ('' = root)
  curFile: null,   // { path, sha } — editor-এ খোলা ফাইল
  originalText: '', // ফাইল খোলার সময়ের কনটেন্ট — unsaved-change চেক করার জন্য
};

async function openFileBrowser() {
  const repo = document.getElementById('sGhRepo').value.trim() || S.repo;
  const tok = document.getElementById('sGhToken').value.trim() || S.tok;  // লাইভ ইনপুট আগে, Save না চাপলেও কাজ করবে
  if (!tok || !repo) { alert('আগে gh token ও repo সিলেক্ট করো।'); return; }
  FB.repo = repo;
  FB.tok = tok;
  FB.path = '';
  document.getElementById('fbTitle').textContent = '📂 ' + repo;
  document.getElementById('settModal').classList.remove('open');
  document.getElementById('fbModal').classList.add('open');
  await fbLoadTree();
}
function closeFileBrowser() {
  document.getElementById('fbModal').classList.remove('open');
}

// path-এর প্রতিটা অংশ আলাদাভাবে এনকোড করে (# ? & ইত্যাদি চিহ্নযুক্ত ফাইলনেমেও কাজ করবে), স্ল্যাশ অক্ষত রাখে
function fbEncodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
const FB_BINARY_EXT = ['png','jpg','jpeg','gif','webp','ico','bmp','zip','rar','7z','pdf','mp3','mp4','mov','wav','woff','woff2','ttf','eot','exe','bin'];

async function fbLoadTree() {
  const list = document.getElementById('fbList');
  list.innerHTML = '<div class="empty"><div class="empty-lbl" style="margin-top:24px">লোড হচ্ছে…</div></div>';
  const [owner, repo] = FB.repo.split('/');
  try {
    // প্রথমে default branch খুঁজে বের করো
    const repoInfo = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: 'token ' + FB.tok }
    });
    if (!repoInfo.ok) throw new Error('Repo খুঁজে পাওয়া যায়নি (' + repoInfo.status + ')');
    const branch = (await repoInfo.json()).default_branch || 'main';
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: { Authorization: 'token ' + FB.tok }
    });
    if (!res.ok) throw new Error('Tree লোড ব্যর্থ (' + res.status + ')');
    const data = await res.json();
    FB.tree = (data.tree || []).filter(t => t.type === 'blob' || t.type === 'tree');
    if (data.truncated) {
      await logWarn('filebrowser', `${FB.repo}: repo এত বড় যে পুরো file list আনা যায়নি (GitHub truncated করেছে)`);
    }
    await logInfo('filebrowser', `${FB.repo} থেকে ${FB.tree.length} আইটেম লোড হয়েছে`);
    fbRender(!!data.truncated);
  } catch (e) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">⚠</div><div class="empty-lbl">${e.message}</div></div>`;
    await logError('filebrowser', 'Tree লোড ব্যর্থ', e);
  }
}

function fbRender(truncated) {
  const pathEl = document.getElementById('fbPath');
  const crumbWrap = document.getElementById('fbBreadcrumbWrap');
  pathEl.textContent = FB.repo + ' / ' + (FB.path || '') + (truncated ? '  ⚠ (তালিকা অসম্পূর্ণ — repo অনেক বড়)' : '');
  crumbWrap.style.display = FB.path ? 'block' : 'none';

  const prefix = FB.path ? FB.path + '/' : '';

  // এই ফোল্ডারের সরাসরি children বের করো (folder + file দুটোই)
  const seenDirs = new Set();
  const dirs = [];
  const files = [];
  FB.tree.forEach(item => {
    if (!item.path.startsWith(prefix)) return;
    const rest = item.path.slice(prefix.length);
    if (!rest) return;
    const segs = rest.split('/');
    if (segs.length === 1) {
      if (item.type === 'blob') files.push(item);
    } else {
      const dirName = segs[0];
      if (!seenDirs.has(dirName)) { seenDirs.add(dirName); dirs.push(dirName); }
    }
  });
  dirs.sort();
  files.sort((a, b) => a.path.localeCompare(b.path));

  const list = document.getElementById('fbList');
  if (!dirs.length && !files.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📭</div><div class="empty-lbl">এই ফোল্ডার খালি</div></div>';
    return;
  }
  list.innerHTML =
    dirs.map(d => `
      <div class="frow frow-dir" onclick="fbOpenDir('${(prefix + d).replace(/'/g, "\\'")}')">
        <div class="frow-ico">📁</div>
        <div class="frow-name">${d}</div>
        <div class="frow-meta">›</div>
      </div>`).join('') +
    files.map(f => {
      const name = f.path.slice(prefix.length);
      const kb = f.size ? Math.max(1, Math.round(f.size / 1024)) + ' KB' : '';
      return `
      <div class="frow frow-file" onclick="fbOpenFile('${f.path.replace(/'/g, "\\'")}', '${f.sha}', ${f.size || 0})">
        <div class="frow-ico">📄</div>
        <div class="frow-name">${name}</div>
        <div class="frow-meta">${kb}</div>
      </div>`;
    }).join('');
}

function fbOpenDir(path) {
  FB.path = path;
  fbRender();
}
function fbGoUp() {
  const segs = FB.path.split('/');
  segs.pop();
  FB.path = segs.join('/');
  fbRender();
}

async function fbOpenFile(path, sha, size) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (FB_BINARY_EXT.includes(ext)) {
    if (!confirm(`"${path}" সম্ভবত একটা বাইনারি ফাইল (ছবি/zip/ইত্যাদি)। টেক্সট এডিটরে খুললে এবং Save করলে এটা নষ্ট হয়ে যেতে পারে। তবুও খুলবে?`)) return;
  }
  if (size && size > 900000) {
    alert('এই ফাইল ১MB-এর কাছাকাছি বা বেশি বড় — GitHub-এর সীমার কারণে এটা এখানে খোলা যাবে না। GitHub website থেকে দেখো।');
    return;
  }
  const [owner, repo] = FB.repo.split('/');
  document.getElementById('fbModal').classList.remove('open');
  document.getElementById('feModal').classList.add('open');
  document.getElementById('feTitle').textContent = '⏳ লোড হচ্ছে…';
  document.getElementById('fePath').textContent = FB.repo + '/' + path;
  document.getElementById('feContent').value = '';
  document.getElementById('feSbar').innerHTML = '';
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fbEncodePath(path)}`, {
      headers: { Authorization: 'token ' + FB.tok }
    });
    if (!res.ok) throw new Error('ফাইল লোড ব্যর্থ (' + res.status + ')');
    const data = await res.json();
    if (!data.content || data.encoding !== 'base64') {
      throw new Error('এই ফাইলের content GitHub থেকে পাওয়া যায়নি (অনেক বড়, বা বাইনারি হতে পারে)');
    }
    const text = fromBase64(data.content);
    FB.curFile = { path, sha: data.sha };
    FB.originalText = text;  // unsaved-change চেক করার জন্য মূল কনটেন্ট মনে রাখা
    document.getElementById('feTitle').textContent = '✎ ' + path.split('/').pop();
    document.getElementById('feContent').value = text;
    await logInfo('filebrowser', `ফাইল খোলা হয়েছে: ${FB.repo}/${path}`);
  } catch (e) {
    document.getElementById('feTitle').textContent = '⚠ ব্যর্থ';
    document.getElementById('feSbar').innerHTML = e.message;
    document.getElementById('feSbar').className = 'sbar err';
    await logError('filebrowser', 'ফাইল ওপেন ব্যর্থ: ' + path, e);
  }
}

function closeFileEditor() {
  document.getElementById('feModal').classList.remove('open');
  document.getElementById('fbModal').classList.add('open');
  FB.curFile = null;
  FB.originalText = '';
}
// বাইরে ট্যাপ পড়লে বা "বাতিল" চাপলে — আনসেভড পরিবর্তন থাকলে আগে নিশ্চিত হয়ে নেয়
function attemptCloseFileEditor() {
  const cur = document.getElementById('feContent').value;
  if (FB.curFile && cur !== FB.originalText) {
    if (!confirm('পরিবর্তন এখনও সেভ হয়নি। সত্যিই বের হতে চাও? পরিবর্তন হারিয়ে যাবে।')) return;
  }
  closeFileEditor();
}

async function saveCurrentFile() {
  if (!FB.curFile) return;
  const [owner, repo] = FB.repo.split('/');
  const { path, sha } = FB.curFile;
  const newText = document.getElementById('feContent').value;
  const sbar = document.getElementById('feSbar');
  sbar.innerHTML = '<span class="spin"></span>আপডেট হচ্ছে…';
  sbar.className = 'sbar ld';
  try {
    const b64 = toBase64(newText);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fbEncodePath(path)}`, {
      method: 'PUT',
      headers: { Authorization: 'token ' + FB.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update via ONEX file manager: ' + path, content: b64, sha })
    });
    if (!res.ok) throw new Error((await res.json()).message || ('আপডেট ব্যর্থ (' + res.status + ')'));
    const result = await res.json();
    FB.curFile.sha = result.content.sha;  // নতুন sha সংরক্ষণ — পরের save-এর জন্য
    FB.originalText = newText;  // সেভ হয়ে গেছে — এখন এটাই "আনসেভড নয়" বেসলাইন
    sbar.innerHTML = '✓ আপডেট সফল!';
    sbar.className = 'sbar ok';
    await logInfo('filebrowser', `ফাইল আপডেট হয়েছে: ${FB.repo}/${path}`);
  } catch (e) {
    sbar.innerHTML = '✗ ' + e.message;
    sbar.className = 'sbar err';
    await logError('filebrowser', 'ফাইল আপডেট ব্যর্থ: ' + path, e);
  }
}

async function deleteCurrentFile() {
  if (!FB.curFile) return;
  const { path, sha } = FB.curFile;
  if (!confirm(`"${path}" ফাইলটা সত্যিই ডিলিট করতে চাও? এটা আর ফেরানো যাবে না।`)) return;
  const [owner, repo] = FB.repo.split('/');
  const sbar = document.getElementById('feSbar');
  sbar.innerHTML = '<span class="spin"></span>ডিলিট হচ্ছে…';
  sbar.className = 'sbar ld';
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fbEncodePath(path)}`, {
      method: 'DELETE',
      headers: { Authorization: 'token ' + FB.tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Delete via ONEX file manager: ' + path, sha })
    });
    if (!res.ok) throw new Error((await res.json()).message || ('ডিলিট ব্যর্থ (' + res.status + ')'));
    await logWarn('filebrowser', `ফাইল ডিলিট হয়েছে: ${FB.repo}/${path}`);
    FB.curFile = null;
    FB.originalText = '';
    document.getElementById('feModal').classList.remove('open');
    document.getElementById('fbModal').classList.add('open');
    await fbLoadTree();  // list রিফ্রেশ
  } catch (e) {
    sbar.innerHTML = '✗ ' + e.message;
    sbar.className = 'sbar err';
    await logError('filebrowser', 'ফাইল ডিলিট ব্যর্থ: ' + path, e);
  }
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
  // settings modal বন্ধ হয়ে যায়, তাই Write view-এর sbar-এ না দেখিয়ে
  // header-এর gh pill-ই confirm হিসেবে কাজ করে — আলাদা alert দরকার নেই
}

// ── LOG VIEWER ──
function showLogs() {
  closeSettings();
  const logs = getLogs();
  const list = document.getElementById('logList');
  if (!logs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-lbl">কোনো লগ নেই</div></div>';
  } else {
    const typeColor = { info: '#6ac06d', error: '#e06c75', warn: '#e5b567' };
    list.innerHTML = [...logs].reverse().map(l => {
      const col = typeColor[l.type] || '#8a8480';
      const err = l.error ? ` <span style="color:#e06c75">| ${l.error}</span>` : '';
      return `<div style="padding:6px 0;border-bottom:1px solid #1e2229;">
        <span style="color:#3a3e45;font-size:10px">${l.timestamp}</span>
        <span style="color:${col};font-weight:700"> [${l.type.toUpperCase()}]</span>
        <span style="color:#6b6560"> ${l.tag}:</span>
        <span> ${l.message}</span>${err}
      </div>`;
    }).join('');
  }
  document.getElementById('logModal').classList.add('open');
}
function closeLogModal() {
  document.getElementById('logModal').classList.remove('open');
}
async function clearLogsAndClose() {
  if (!confirm('সব লগ মুছে ফেলবে?')) return;
  await clearLogs();
  closeLogModal();
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