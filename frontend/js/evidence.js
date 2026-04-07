// CyberGuard Evidence v7 - WITH AUDIT SESSION POPUP VIEWER
let currentEvidenceList = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) return;
  loadUserToSidebar();
  checkURLParams();
  await loadEvidenceList();
  ['search-input','domain-filter','status-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'search-input' ? 'input' : 'change', filterEvidence);
  });
  injectPopupHTML();
});

// ===================================
// POPUP: Inject HTML into page
// ===================================
function injectPopupHTML() {
  const popup = document.createElement('div');
  popup.id = 'audit-popup-overlay';
  popup.style.cssText = `
    display:none;position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);
    align-items:center;justify-content:center;padding:20px;
  `;
  popup.innerHTML = `
    <div id="audit-popup-box" style="
      background:#0f172a;border:1px solid #334155;border-radius:16px;
      width:100%;max-width:780px;max-height:90vh;display:flex;flex-direction:column;
      box-shadow:0 25px 60px rgba(0,0,0,0.5);overflow:hidden;
    ">
      <!-- Header -->
      <div style="
        display:flex;justify-content:space-between;align-items:center;
        padding:20px 24px;border-bottom:1px solid #1e293b;
        background:#1e293b;flex-shrink:0;
      ">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="
            width:40px;height:40px;border-radius:10px;
            background:linear-gradient(135deg,#06b6d4,#8b5cf6);
            display:flex;align-items:center;justify-content:center;
          ">
            <i class="fas fa-shield-halved" style="color:white;font-size:18px;"></i>
          </div>
          <div>
            <div id="popup-control-id" style="font-size:13px;color:#06b6d4;font-weight:700;font-family:monospace;"></div>
            <div id="popup-title" style="font-size:16px;font-weight:700;color:#f1f5f9;"></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span id="popup-status-badge" class="badge"></span>
          <span id="popup-score-badge" style="font-size:20px;font-weight:800;"></span>
          <button onclick="closeAuditPopup()" style="
            background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);
            color:#ef4444;width:36px;height:36px;border-radius:8px;cursor:pointer;
            font-size:16px;display:flex;align-items:center;justify-content:center;
            transition:all 0.2s;
          " onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Meta bar -->
      <div id="popup-meta" style="
        display:flex;gap:24px;padding:12px 24px;
        background:#080e1c;border-bottom:1px solid #1e293b;
        font-size:12px;color:#64748b;flex-shrink:0;flex-wrap:wrap;
      "></div>

      <!-- Chat messages -->
      <div id="popup-messages" style="
        flex:1;overflow-y:auto;padding:24px;
        display:flex;flex-direction:column;gap:16px;
        background:#080e1c;
      "></div>

      <!-- Footer -->
      <div style="
        padding:16px 24px;border-top:1px solid #1e293b;
        background:#1e293b;display:flex;gap:12px;flex-shrink:0;
      ">
        <a id="popup-reaudit-btn" href="#" style="
          flex:1;text-align:center;background:rgba(6,182,212,0.1);
          border:1px solid #06b6d4;color:#06b6d4;padding:10px;
          border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;
          transition:all 0.2s;
        "><i class="fas fa-redo" style="margin-right:6px;"></i>Re-Audit This Control</a>
        <button onclick="window.print()" style="
          background:rgba(139,92,246,0.1);border:1px solid #8b5cf6;
          color:#8b5cf6;padding:10px 20px;border-radius:8px;cursor:pointer;
          font-size:13px;font-weight:600;
        "><i class="fas fa-print" style="margin-right:6px;"></i>Print</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);

  // Close on overlay click
  popup.addEventListener('click', e => {
    if (e.target === popup) closeAuditPopup();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAuditPopup();
  });
}

// ===================================
// POPUP: Open with audit data
// ===================================
function openAuditPopup(item) {
  const overlay = document.getElementById('audit-popup-overlay');
  const messages = document.getElementById('popup-messages');

  // Set header info
  document.getElementById('popup-control-id').textContent = item.control_code || item.control_id || '—';
  document.getElementById('popup-title').textContent = item.title || 'Audit Report';

  // Status badge
  const sb = document.getElementById('popup-status-badge');
  const status = item.status || 'Pending';
  sb.textContent = status;
  sb.className = `badge ${status === 'Compliant' ? 'badge-success' : status === 'Non-Compliant' || status === 'non-compliant' ? 'badge-danger' : status === 'Partial' || status === 'partial' ? 'badge-warning' : 'badge-info'}`;

  // Score
  const scoreBadge = document.getElementById('popup-score-badge');
  const scoreColor = status === 'Compliant' ? '#10b981' : status === 'Partial' ? '#f59e0b' : '#ef4444';
  scoreBadge.textContent = item.score != null ? item.score + '%' : '';
  scoreBadge.style.color = scoreColor;

  // Meta bar
  document.getElementById('popup-meta').innerHTML = `
    <span><i class="fas fa-calendar" style="margin-right:5px;color:#06b6d4;"></i>${formatDate(item.created_at)}</span>
    <span><i class="fas fa-folder" style="margin-right:5px;color:#8b5cf6;"></i>${item.domain || 'ECC-2023'}</span>
    <span><i class="fas fa-hashtag" style="margin-right:5px;color:#f59e0b;"></i>Session ${item.session_id || item.id || 'N/A'}</span>
    <span><i class="fas fa-robot" style="margin-right:5px;color:#10b981;"></i>AI Generated</span>
  `;

  // Re-audit link
  document.getElementById('popup-reaudit-btn').href = `chatbot.html?control=${item.control_code || item.control_id}`;

  // Build chat messages
  messages.innerHTML = '';

  // Opening system message
  addPopupMsg(messages, 'ai', `
    <strong>Audit Session — ${item.control_code || item.control_id}: ${item.title || ''}</strong><br>
    <span style="font-size:12px;color:var(--text-muted);">
      Completed on ${formatDate(item.created_at)} &nbsp;|&nbsp; 
      Final Score: <span style="color:${scoreColor};font-weight:700;">${item.score != null ? item.score + '%' : 'N/A'}</span> &nbsp;|&nbsp;
      Status: <span style="color:${scoreColor};font-weight:700;">${status}</span>
    </span>
  `);

  // Render answers if available
  const answers = item.answers || parseAnswersFromDescription(item.description);

  if (answers && answers.length > 0) {
    const total = answers.length;
    const yes = answers.filter(a => a.answer === 'yes').length;
    const partial = answers.filter(a => a.answer === 'partial').length;
    const no = answers.filter(a => a.answer === 'no').length;

    answers.forEach((a, i) => {
      // AI question bubble
      addPopupMsg(messages, 'ai', `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:11px;color:var(--text-muted);">Question ${i + 1} of ${total}</span>
          ${a.category ? `<span style="font-size:11px;background:rgba(6,182,212,0.1);color:var(--accent-primary);padding:2px 10px;border-radius:20px;">${a.category}</span>` : ''}
        </div>
        <p style="font-size:14px;line-height:1.7;margin-bottom:${a.evidence ? '8px' : '0'};">${a.question}</p>
        ${a.evidence ? `<p style="font-size:11px;color:#f59e0b;margin-top:8px;"><i class="fas fa-paperclip" style="margin-right:4px;"></i>Required evidence: ${a.evidence}</p>` : ''}
      `);

      // User answer bubble
      const ansColor = a.answer === 'yes' ? '#10b981' : a.answer === 'partial' ? '#f59e0b' : '#ef4444';
      const ansIcon = a.answer === 'yes' ? 'fa-check' : a.answer === 'partial' ? 'fa-adjust' : 'fa-times';
      const ansLabel = a.answer === 'yes' ? 'Yes — Verified' : a.answer === 'partial' ? 'Partial — Needs improvement' : 'No — Gap identified';
      addPopupMsg(messages, 'user', `
        <span style="color:${ansColor};font-weight:700;">
          <i class="fas ${ansIcon}" style="margin-right:6px;"></i>${ansLabel}
        </span>
      `);
    });

    // Final summary card
    addPopupMsg(messages, 'ai', `
      <div style="border:1px solid ${scoreColor}30;border-radius:12px;padding:20px;background:${scoreColor}08;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <strong>Audit Summary</strong>
          <span style="font-size:32px;font-weight:800;color:${scoreColor};">${item.score != null ? item.score + '%' : '—'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div style="text-align:center;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:12px;">
            <div style="font-size:24px;font-weight:800;color:#10b981;">${yes}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">YES</div>
          </div>
          <div style="text-align:center;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;">
            <div style="font-size:24px;font-weight:800;color:#f59e0b;">${partial}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">PARTIAL</div>
          </div>
          <div style="text-align:center;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px;">
            <div style="font-size:24px;font-weight:800;color:#ef4444;">${no}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">NO</div>
          </div>
        </div>
      </div>
    `);
  } else if (item.description) {
    // Fallback: show raw description if no structured answers
    addPopupMsg(messages, 'ai', `<pre style="font-size:12px;line-height:1.8;white-space:pre-wrap;color:var(--text-secondary);">${item.description}</pre>`);
  } else {
    addPopupMsg(messages, 'ai', '<span style="color:var(--text-muted);">No detailed audit data available for this session.</span>');
  }

  // Show popup
  overlay.style.display = 'flex';
  setTimeout(() => messages.scrollTop = 0, 50);
}

function closeAuditPopup() {
  const overlay = document.getElementById('audit-popup-overlay');
  if (overlay) overlay.style.display = 'none';
}

function addPopupMsg(container, role, html) {
  const d = document.createElement('div');
  d.className = `message ${role}-message`;
  d.innerHTML = `
    <div class="message-content">
      <div class="message-header">${role === 'ai' ? 'CyberGuard AI' : 'Auditor'}</div>
      <div class="message-text">${html}</div>
    </div>
  `;
  container.appendChild(d);
}

// Try to parse structured answers from description text (fallback)
function parseAnswersFromDescription(desc) {
  if (!desc) return [];
  try {
    // If description is JSON
    const parsed = JSON.parse(desc);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}

  // Try to parse from plain text format
  const lines = (desc || '').split('\n');
  const answers = [];
  let currentQ = null;
  lines.forEach(line => {
    const qMatch = line.match(/^Q\d+:\s+(.+)/);
    const aMatch = line.match(/^Answer:\s+[✅⚠️❌]?\s*(\w+)/i);
    const evMatch = line.match(/^Evidence required:\s+(.+)/i);
    if (qMatch) currentQ = { question: qMatch[1], answer: '', evidence: '' };
    else if (aMatch && currentQ) { currentQ.answer = aMatch[1].toLowerCase(); answers.push(currentQ); currentQ = null; }
    else if (evMatch && currentQ) currentQ.evidence = evMatch[1];
  });
  return answers;
}

// ===================================
// URL PARAMS CHECK
// ===================================
function checkURLParams() {
  const p = new URLSearchParams(window.location.search);
  const control = p.get('control'), status = p.get('status'), score = p.get('score');
  if (!control && !status) return;
  const color = status === 'Compliant' ? '#10b981' : status === 'Partial' ? '#f59e0b' : '#ef4444';
  const wrapper = document.querySelector('.content-wrapper'); if (!wrapper) return;
  const banner = document.createElement('div');
  banner.style.cssText = `background:${color}10;border:1px solid ${color}40;border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px`;
  banner.innerHTML = `<div><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase">Latest Audit Result</div><div style="font-size:18px;font-weight:700">Control <span style="color:var(--accent-primary)">${control}</span> — <span style="color:${color}">${status || 'N/A'}</span>${score ? ` <span style="color:var(--text-muted);font-size:14px">(${score}%)</span>` : ''}</div></div><a href="chatbot.html" style="display:inline-flex;align-items:center;gap:8px;background:rgba(6,182,212,.1);border:1px solid var(--accent-primary);color:var(--accent-primary);padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600"><i class="fas fa-robot"></i>New Audit</a>`;
  wrapper.insertBefore(banner, wrapper.firstChild);
}

// ===================================
// LOAD EVIDENCE LIST
// ===================================
async function loadEvidenceList() {
  try {
    showLoader();
    let data = [];
    try { data = await getEvidenceList(); } catch (e) { console.error('API error:', e); }
    if (!data || data.length === 0) data = buildFromLocalStorage();
    currentEvidenceList = data;
    renderEvidenceTable(currentEvidenceList);
    hideLoader();
  } catch (e) {
    currentEvidenceList = buildFromLocalStorage();
    renderEvidenceTable(currentEvidenceList);
    hideLoader();
  }
}

function buildFromLocalStorage() {
  // First try structured audit sessions log
  const sessions = JSON.parse(localStorage.getItem('audit_sessions_log') || '[]');
  if (sessions.length > 0) {
    return sessions.map((s, i) => ({
      id: i + 1,
      control_code: s.control_id,
      control_id: s.control_id,
      domain: getDomainForControl(s.control_id),
      title: `Audit Report — ${s.control_title || s.control_id}`,
      status: s.status,
      score: s.score,
      answers: s.answers,
      session_id: s.session_id,
      created_at: s.created_at,
      file_path: null,
      evidence_type: 'audit_session'
    }));
  }

  // Fallback: build from old audit_results format
  const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
  const sco = JSON.parse(localStorage.getItem('audit_scores') || '{}');
  const titleMap = {
    '1-1':'Cybersecurity Governance','1-2':'Risk Management','1-3':'Asset Management',
    '1-4':'Cybersecurity Operations','1-5':'System & Network Hardening',
    '1-6':'Identity & Access Management','1-7':'Data Protection',
    '1-8':'Vulnerability Management','1-9':'Incident Defense','1-10':'Physical Security'
  };
  return Object.entries(res).map(([id, status], i) => ({
    id: i + 1, control_code: id, control_id: id,
    domain: getDomainForControl(id),
    title: `Audit Report — ${titleMap[id] || id}`,
    status, score: sco[id] ?? null,
    created_at: new Date().toISOString(),
    file_path: null, evidence_type: 'audit_session'
  }));
}

function getDomainForControl(id) {
  const map = {
    '1-1':'Governance','1-2':'Risk','1-3':'Assets','1-4':'Operations',
    '1-5':'Network','1-6':'Identity','1-7':'Data','1-8':'Vulnerability',
    '1-9':'Incident','1-10':'Physical'
  };
  return map[id] || 'General';
}

// ===================================
// RENDER TABLE
// ===================================
function renderEvidenceTable(list) {
  const tbody = document.getElementById('evidence-table-body'); if (!tbody) return;
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:60px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:16px;opacity:.4"></i><div style="font-size:16px;margin-bottom:8px">No evidence found</div><small>Complete an audit to generate records</small><br><a href="chatbot.html" style="display:inline-flex;align-items:center;gap:8px;margin-top:16px;color:var(--accent-primary);border:1px solid var(--accent-primary);padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px"><i class="fas fa-robot"></i>Go to Chatbot</a></td></tr>`;
    return;
  }
  list.forEach(item => {
    const color = item.status === 'Compliant' ? 'success' : item.status === 'Partial' ? 'warning' : 'danger';
    const isAuditSession = item.evidence_type === 'audit_session' || item.answers;
    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid #334155;cursor:pointer;transition:background 0.15s;';
    tr.onmouseover = () => tr.style.background = '#1e293b';
    tr.onmouseout = () => tr.style.background = '';
    tr.innerHTML = `
      <td style="padding:16px;font-family:monospace;font-weight:700;color:var(--accent-primary)">${item.control_code || item.control_id || '—'}</td>
      <td style="padding:16px">
        <div style="display:flex;align-items:center;gap:10px">
          <i class="${isAuditSession ? 'fas fa-robot' : 'fas fa-file-shield'}" style="color:var(--accent-primary);font-size:18px"></i>
          <div>
            <div style="font-weight:600;color:var(--text-primary)">${item.title || 'Audit Report'}</div>
            <div style="font-size:11px;color:var(--text-muted)">${item.domain || ''}${item.score != null ? ' — Score: ' + item.score + '%' : ''}</div>
          </div>
        </div>
      </td>
      <td style="padding:16px"><span class="badge badge-${color}">${item.status || 'Pending'}</span></td>
      <td style="padding:16px;color:var(--text-muted)">${formatDate(item.created_at)}</td>
      <td style="padding:16px;color:var(--text-muted)">${isAuditSession ? '<span style="color:#06b6d4;font-size:12px"><i class="fas fa-robot" style="margin-right:4px;"></i>AI Audit</span>' : 'File Uploaded'}</td>
      <td style="padding:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">
        ${isAuditSession ? `
        <button onclick="openAuditPopup(${JSON.stringify(item).replace(/"/g,'&quot;')})" 
          title="View Audit" 
          style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;background:rgba(6,182,212,.1);color:var(--accent-primary);text-decoration:none;border:1px solid rgba(6,182,212,.2);cursor:pointer;font-size:12px;font-weight:600;">
          <i class="fas fa-eye"></i> View
        </button>` : ''}
        <a href="chatbot.html?control=${item.control_code || item.control_id}" title="Re-Audit"
          style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:6px;background:rgba(6,182,212,.1);color:var(--accent-primary);text-decoration:none;border:1px solid rgba(6,182,212,.2);">
          <i class="fas fa-redo" style="font-size:12px"></i>
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===================================
// FILTER
// ===================================
function filterEvidence() {
  const search = (document.getElementById('search-input')?.value || '').toLowerCase();
  const domain = document.getElementById('domain-filter')?.value || 'all';
  const status = document.getElementById('status-filter')?.value || 'all';
  const filtered = currentEvidenceList.filter(i => {
    const controlCode = (i.control_code || i.control_id || '').toLowerCase();
    const title = (i.title || '').toLowerCase();
    const matchSearch = !search || controlCode.includes(search) || title.includes(search);
    const matchDomain = domain === 'all' || i.domain === domain;
    const itemStatus = (i.status || '').toLowerCase().replace(/[- ]/g, '');
    const filterStatus = status.toLowerCase().replace(/[- ]/g, '');
    const matchStatus = status === 'all' || itemStatus === filterStatus || itemStatus.includes(filterStatus);
    return matchSearch && matchDomain && matchStatus;
  });
  renderEvidenceTable(filtered);
}