// CyberGuard - Home Page v5
document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('authToken')) { window.location.href = 'login.html'; return; }
    loadUserToSidebar();
    // Also update welcome message with first name
    const user = getCurrentUserLocal();
    const first = user.full_name ? user.full_name.split(' ')[0] : (user.username || 'User');
    const wEl = document.getElementById('welcome-message');
    if (wEl) wEl.textContent = `Welcome back, ${first}!`;
    await loadHomeStats();
});

async function loadHomeStats() {
    try {
        const stats = await getDashboardStats();
        const score = stats.compliance_score || 0;
        const gaps = stats.critical_gaps || 0;
        const scoreEl = document.getElementById('compliance-score-value');
        if (scoreEl) { scoreEl.textContent = score + '%'; scoreEl.style.color = score >= 80 ? 'var(--accent-success)' : score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)'; }
        const gEl = document.getElementById('critical-gaps-count');
        if (gEl) { gEl.textContent = gaps; gEl.style.color = gaps > 0 ? 'var(--accent-danger)' : 'var(--accent-success)'; }
        const hEl = document.getElementById('system-health-status');
        if (hEl) { hEl.textContent = score >= 70 ? 'Operational' : 'Needs Attention'; hEl.style.color = score >= 70 ? 'var(--accent-success)' : 'var(--accent-warning)'; }
        const aEl = document.getElementById('audited-controls-count');
        if (aEl) aEl.textContent = `${stats.audited_controls || 0} / ${stats.total_controls || 10}`;
    } catch (e) { console.error('Home stats error:', e); }
}