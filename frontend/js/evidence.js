// ===================================
// USER-SCOPED LOCALSTORAGE HELPERS
// Drop these at the top of evidence.js (replace any existing getUserId logic)
// ===================================

/**
 * Returns the current user's ID from the stored JWT.
 * Falls back to 'guest' so reads never throw.
 */
function getCurrentUserId() {
  try {
    const token = localStorage.getItem('token') || localStorage.getItem('access_token') || '';
    if (!token) return 'guest';
    // JWT payload is the second base64 segment
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Adjust the key below if your backend uses 'id', 'sub', 'user_id', etc.
    return String(payload.sub || payload.id || payload.user_id || 'guest');
  } catch {
    return 'guest';
  }
}

/** Namespaced key: "u:<userId>:<key>" */
function userKey(key) {
  return `u:${getCurrentUserId()}:${key}`;
}

/** Read a user-scoped JSON item from localStorage (returns parsed value or fallback). */
function getUserStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(userKey(key));
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Write a user-scoped JSON item to localStorage. */
function setUserStorage(key, value) {
  localStorage.setItem(userKey(key), JSON.stringify(value));
}

// ===================================
// REPLACE buildFromLocalStorage in evidence.js with this version
// ===================================

function buildFromLocalStorage() {
  const items = [];

  // ── Structured audit sessions ──────────────────────────────────────────
  const sessions = getUserStorage('audit_sessions_log', []);
  sessions.forEach((s, i) => {
    const controlId = s.control_id || s.control_code;
    items.push({
      id: s.id || i + 1,
      control_code: controlId,
      control_id: controlId,
      domain: s.domain || getDomainForControl(controlId),
      title: s.title || `Audit Report — ${s.control_title || controlId}`,
      status: s.status,
      score: s.score,
      answers: s.answers || [],
      description: s.description,
      session_id: s.session_id,
      created_at: s.created_at,
      file_path: null,
      evidence_type: 'audit_session'
    });
  });

  // ── Legacy flat audit_results format ──────────────────────────────────
  const res = getUserStorage('audit_results', {});
  const sco = getUserStorage('audit_scores', {});
  const titleMap = {
    '1-1': 'Cybersecurity Governance', '1-2': 'Risk Management',
    '1-3': 'Asset Management',         '1-4': 'Cybersecurity Operations',
    '1-5': 'System & Network Hardening','1-6': 'Identity & Access Management',
    '1-7': 'Data Protection',           '1-8': 'Vulnerability Management',
    '1-9': 'Incident Defense',          '1-10': 'Physical Security'
  };
  Object.entries(res).forEach(([id, status], i) => {
    items.push({
      id: `legacy-${i + 1}`,
      control_code: id,
      control_id: id,
      domain: getDomainForControl(id),
      title: `Audit Report — ${titleMap[id] || id}`,
      status,
      score: sco[id] ?? null,
      created_at: new Date().toISOString(),
      file_path: null,
      evidence_type: 'audit_session'
    });
  });

  return mergeEvidenceLists([], items);
}

// ===================================
// USE THIS FUNCTION IN chatbot.js WHEN SAVING AN AUDIT SESSION
// (replaces any direct localStorage.setItem('audit_sessions_log', ...) calls)
// ===================================

/**
 * Appends a completed audit session to the current user's log.
 * Call this at the end of your audit flow in chatbot.js.
 *
 * @param {Object} session - The audit session object to save
 */
function saveAuditSession(session) {
  const existing = getUserStorage('audit_sessions_log', []);
  // Deduplicate by session_id if present
  const filtered = session.session_id
    ? existing.filter(s => s.session_id !== session.session_id)
    : existing;
  setUserStorage('audit_sessions_log', [session, ...filtered]);
}

/**
 * Saves/updates a legacy audit result (compliant / non-compliant / partial).
 * Call this wherever chatbot.js currently writes to 'audit_results' / 'audit_scores'.
 *
 * @param {string} controlId - e.g. '1-3'
 * @param {string} status     - 'Compliant' | 'Partial' | 'Non-Compliant'
 * @param {number|null} score - 0-100 or null
 */
function saveAuditResult(controlId, status, score = null) {
  const results = getUserStorage('audit_results', {});
  const scores  = getUserStorage('audit_scores',  {});
  results[controlId] = status;
  if (score !== null) scores[controlId] = score;
  setUserStorage('audit_results', results);
  setUserStorage('audit_scores',  scores);
}
