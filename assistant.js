// assistant.js - Learns from logs, automates, stores rules remotely
(function() {
  let rules = {};
  const RULES_PATH = '_system/rules.json';

  window.loadAssistantRules = async function() {
    if (!S.tok || !S.repo) return;
    const [owner, repo] = S.repo.split('/');
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${RULES_PATH}`, {
        headers: { Authorization: 'token ' + S.tok }
      });
      if (res.ok) {
        const data = await res.json();
        rules = JSON.parse(atob(data.content.replace(/\s/g, '')));
      }
    } catch (e) {
      console.warn('Could not load rules', e);
    }
  };

  async function saveRules() {
    if (!S.tok || !S.repo) return;
    const [owner, repo] = S.repo.split('/');
    const content = JSON.stringify(rules);
    const b64 = toBase64(content);
    try {
      let sha = null;
      const chk = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${RULES_PATH}`, {
        headers: { Authorization: 'token ' + S.tok }
      });
      if (chk.ok) sha = (await chk.json()).sha;
      await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${RULES_PATH}`, {
        method: 'PUT',
        headers: { Authorization: 'token ' + S.tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Update rules', content: b64, ...(sha ? { sha } : {}) })
      });
    } catch (e) {
      console.error('Failed to save rules', e);
    }
  }

  window.assistantAnalyze = async function() {
    const logs = getLogs();
    if (!logs.length) return;
    const tokenErrors = logs.filter(l => l.type === 'error' && l.tag === 'push' && l.error && l.error.includes('Bad credentials'));
    if (tokenErrors.length >= 2) rules.tokenExpired = true;
    const catErrors = logs.filter(l => l.type === 'error' && l.message.includes('Category'));
    if (catErrors.length >= 2) rules.categoryMissing = true;
    const netErrors = logs.filter(l => l.type === 'error' && l.error && (l.error.includes('fetch') || l.error.includes('network')));
    if (netErrors.length > 1) rules.networkUnstable = true;
    await saveRules();
  };

  window.assistantBeforePush = async function() {
    if (!S.tok || rules.tokenExpired) {
      await logWarn('assistant', 'টোকেন নেই বা মেয়াদোত্তীর্ণ, সেটিংস খোলা হচ্ছে');
      openSettings();
      setTimeout(() => { document.getElementById('sGhToken')?.focus(); }, 300);
      return false;
    }
    if (!S.repo) {
      await logInfo('assistant', 'রেপো নির্বাচন করা নেই, DB সেট হচ্ছে');
      localStorage.setItem('onex_gh_repo', 'openjobsolutionbd/db');
      S.repo = 'openjobsolutionbd/db';
      updateGH();
    }
    if (rules.networkUnstable) {
      await logWarn('assistant', 'নেটওয়ার্ক অস্থির, সতর্ক থাকুন');
    }
    return true;
  };

  window.assistantAfterError = async function(tag, error) {
    if (error.message && error.message.includes('Bad credentials')) {
      rules.tokenExpired = true;
      await saveRules();
      setTimeout(() => {
        if (confirm('আপনার gh token সম্ভবত ভুল বা মেয়াদোত্তীর্ণ। সেটিংস খুলবেন?')) {
          openSettings();
          document.getElementById('sGhToken').focus();
        }
      }, 500);
    } else if (error.message && (error.message.includes('NetworkError') || error.message.includes('fetch'))) {
      rules.networkUnstable = true;
      await saveRules();
    }
  };

  window.resetTokenExpired = async function() {
    rules.tokenExpired = false;
    await saveRules();
  };

  window.assistantLearnReject = async function(title) {
    const logs = getLogs();
    const rejectCount = logs.filter(l => l.tag === 'pending' && l.message.startsWith('Reject:') && l.message.includes(title)).length;
    if (rejectCount >= 2) {
      await logWarn('assistant', `"${title}" বারবার প্রত্যাখ্যান হয়েছে, এড়িয়ে চলুন`);
    }
  };
})();