// logger.js - Remote log storage with batched saves and size limit
(function() {
  let remoteLogs = [];
  const LOG_PATH = '_system/logs.json';
  const MAX_LOGS = 300;
  let saveTimer = null;
  let isSaving = false;

  // Load logs from GitHub
  window.loadRemoteLogs = async function() {
    if (!S.tok || !S.repo) return;
    const [owner, repo] = S.repo.split('/');
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${LOG_PATH}`, {
        headers: { Authorization: 'token ' + S.tok }
      });
      if (res.ok) {
        const data = await res.json();
        const content = JSON.parse(fromBase64(data.content));
        remoteLogs = content;
      } else {
        remoteLogs = [];
      }
    } catch (e) {
      console.warn('Could not load remote logs', e);
    }
  };

  async function saveRemoteLogs() {
    if (!S.tok || !S.repo) return;
    if (isSaving) return;
    isSaving = true;
    const [owner, repo] = S.repo.split('/');
    const content = JSON.stringify(remoteLogs);
    const b64 = toBase64(content);
    try {
      let sha = null;
      const chk = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${LOG_PATH}`, {
        headers: { Authorization: 'token ' + S.tok }
      });
      if (chk.ok) sha = (await chk.json()).sha;
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${LOG_PATH}`, {
        method: 'PUT',
        headers: { Authorization: 'token ' + S.tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update logs', content: b64, ...(sha ? { sha } : {}) })
      });
      if (!res.ok) console.error('Failed to save logs: HTTP', res.status);
    } catch (e) {
      console.error('Failed to save logs', e);
    } finally {
      isSaving = false;
    }
  }

  // Debounced save — batches rapid log calls into one API request
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveRemoteLogs(); }, 2000);
  }

  // Flush immediately (for critical errors)
  async function flushNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await saveRemoteLogs();
  }

  function trimLogs() {
    if (remoteLogs.length > MAX_LOGS) {
      remoteLogs = remoteLogs.slice(-MAX_LOGS);
    }
  }

  function formatTimestamp() {
    const d = new Date();
    return d.toLocaleString('bn-BD', {
      hour12: false,
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  window.logInfo = function(tag, message, data) {
    const entry = { type: 'info', tag: String(tag), message: String(message), timestamp: formatTimestamp(), data: data || null };
    remoteLogs.push(entry);
    trimLogs();
    scheduleSave();
    return Promise.resolve();
  };

  window.logError = async function(tag, message, error) {
    const entry = { type: 'error', tag: String(tag), message: String(message), timestamp: formatTimestamp(), error: error ? (error.message || String(error)) : null };
    remoteLogs.push(entry);
    trimLogs();
    console.error(`[${tag}] ${message}`, error);
    await flushNow(); // errors save immediately
  };

  window.logWarn = function(tag, message, data) {
    const entry = { type: 'warn', tag: String(tag), message: String(message), timestamp: formatTimestamp(), data: data || null };
    remoteLogs.push(entry);
    trimLogs();
    scheduleSave();
    return Promise.resolve();
  };

  window.getLogs = () => remoteLogs;

  window.clearLogs = async function() {
    remoteLogs = [];
    await flushNow();
  };

  // Save on page unload to catch any pending logs
  window.addEventListener('beforeunload', () => {
    if (saveTimer) saveRemoteLogs();
  });
})();
