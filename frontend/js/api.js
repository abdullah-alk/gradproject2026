// ===================================================
// CyberGuard GRC - Unified API Layer v5
// ===================================================
const API_BASE_URL = 'https://gradproject2026-production-821d.up.railway.app/api';
let authToken = localStorage.getItem('authToken');

async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET', ...options,
            headers: { ...headers, ...(options.headers || {}) }
        });
        if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || `HTTP ${res.status}`); }
        return await res.json();
    } catch (e) { console.error('API Error:', e); throw e; }
}

// Auth
async function login(username, password) {
    const fd = new URLSearchParams();
    fd.append('username', username); fd.append('password', password);
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fd
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Login failed'); }
    const data = await res.json();
    authToken = data.access_token;
    localStorage.setItem('authToken', authToken);
    localStorage.setItem('userInfo', JSON.stringify(data.user));
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
}

function logout() {
    authToken = null;
    ['authToken','userInfo','user','audit_results','audit_scores'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'landing.html';
}

function getCurrentUserLocal() {
    try { return JSON.parse(localStorage.getItem('userInfo') || localStorage.getItem('user') || '{}'); }
    catch { return {}; }
}

// Controls
async function getAllControls() { return await apiRequest('/controls/'); }
async function getControlById(id) { return await apiRequest(`/controls/${id}`); }
async function updateControlStatus(controlId, status) {
    return await apiRequest(`/controls/${controlId}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

// Dashboard
async function getDashboardStats() { return await apiRequest('/dashboard/stats'); }
async function getDomainScores() { return await apiRequest('/dashboard/domain-scores'); }
async function getScoresByControl() { return await apiRequest('/dashboard/category-scores'); }

// AI / RAG
async function callAIEngine(text, controlId, mode) {
    return await apiRequest('/ai/process', { method: 'POST', body: JSON.stringify({ text, control_id: controlId, mode }) });
}
async function generateAuditQuestions(controlId, mode = 'audit') {
    return await apiRequest('/ai/generate-questions', { method: 'POST', body: JSON.stringify({ control_id: controlId, mode }) });
}
async function getAIRecommendations(controlId, userAnswers) {
    return await apiRequest('/ai/recommendations', { method: 'POST', body: JSON.stringify({ control_id: controlId, user_answers: userAnswers }) });
}

// Audit Sessions
async function startAuditSessionAPI(userId, controlId, mode) {
    return await apiRequest('/audit/session/start', { method: 'POST', body: JSON.stringify({ user_id: userId, control_id: controlId, mode }) });
}
async function saveAuditAnswer(sessionId, question, answer) {
    return await apiRequest('/audit/session/answer', { method: 'POST', body: JSON.stringify({ session_id: sessionId, question, answer, ai_generated: true }) });
}
async function completeAuditSession(sessionId, status, score) {
    return await apiRequest('/audit/session/complete', { method: 'POST', body: JSON.stringify({ session_id: sessionId, status, score }) });
}
async function saveComplianceScore(data) {
    return await apiRequest('/audit/compliance-score', { method: 'POST', body: JSON.stringify(data) });
}

// Evidence & Gaps
async function getEvidenceList(domain, status) {
    let url = '/evidence/?';
    if (domain) url += `domain=${encodeURIComponent(domain)}&`;
    if (status) url += `status=${encodeURIComponent(status)}`;
    return await apiRequest(url);
}
async function saveAuditRecommendation(data) {
    return await apiRequest('/gaps/save', { method: 'POST', body: JSON.stringify(data) });
}

// Scheduler
async function getSchedulingRecommendations() { try { return await apiRequest('/scheduler/recommendations'); } catch { return []; } }
async function scheduleAudit(data) { try { return await apiRequest('/scheduler/schedule', { method: 'POST', body: JSON.stringify(data) }); } catch { return null; } }
async function getScheduledAudits() { try { return await apiRequest('/audit/sessions/scheduled'); } catch { return []; } }
async function toggleAutoScheduling(enabled) { try { return await apiRequest('/scheduler/auto', { method: 'POST', body: JSON.stringify({ enabled }) }); } catch { return null; } }

// Utilities
function checkAuth() { if (!localStorage.getItem('authToken')) { window.location.href = 'login.html'; return false; } return true; }
function showLoader() { const l = document.getElementById('loader'); if (l) l.classList.add('active'); }
function hideLoader() { const l = document.getElementById('loader'); if (l) l.classList.remove('active'); }
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }

function loadUserToSidebar() {
    const user = getCurrentUserLocal();
    if (!user || !user.full_name) return;
    const parts = user.full_name.trim().split(' ');
    const initials = parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : user.full_name.substring(0,2).toUpperCase();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('user-name', user.full_name); set('user-name-display', user.full_name);
    set('user-role', user.role || 'Cyber Auditor'); set('user-role-display', user.role || 'Cyber Auditor');
    set('user-initials', initials);
}
