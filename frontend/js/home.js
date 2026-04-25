// CyberGuard - Home Page v5
document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('authToken')) { window.location.href = 'login.html'; return; }
    loadUserToSidebar();
    const user = getCurrentUserLocal();
    const first = user.full_name ? user.full_name.split(' ')[0] : (user.username || 'User');
    const wEl = document.getElementById('welcome-message');
    if (wEl) wEl.textContent = `Welcome back, ${first}!`;
    await loadHomeStats();
    await loadCyberAlerts();
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
        if (aEl) aEl.textContent = `${stats.audited_controls || 0} / 10`;
    } catch (e) { console.error('Home stats error:', e); }
}

async function loadCyberAlerts() {
    const grid = document.getElementById('alerts-grid');
    const updatedEl = document.getElementById('alerts-updated');
    if (!grid) return;

    try {
        let alerts = await apiRequest('/alerts');

        if (!alerts || alerts.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-muted);font-size:13px"><i class="fas fa-check-circle" style="color:var(--accent-success);font-size:24px;display:block;margin-bottom:8px"></i>No alerts — your compliance looks good!</div>';
            return;
        }

        // Remove duplicate titles
        const seen = new Set();
        alerts = alerts.filter(function(a) {
            if (seen.has(a.title)) return false;
            seen.add(a.title);
            return true;
        });

        if (updatedEl) updatedEl.textContent = 'Based on your audit results · ' + new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});

        grid.innerHTML = alerts.map(function(a) {
            var level = a.level || 'info';
            var iconColor = level === 'critical' ? 'rgba(239,68,68,.15)' : level === 'warning' ? 'rgba(245,158,11,.15)' : 'rgba(6,182,212,.15)';
            var iconText  = level === 'critical' ? '#ef4444' : level === 'warning' ? '#f59e0b' : '#06b6d4';
            var icon      = level === 'critical' ? 'fa-shield-xmark' : level === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
            var link      = a.control_id ? '<a href="chatbot.html?control=' + a.control_id + '" style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:11px;color:var(--accent-primary);text-decoration:none"><i class="fas fa-arrow-right"></i> Start Audit</a>' : '';
            return '<div class="alert-card">' +
                '<div class="alert-icon" style="background:' + iconColor + '"><i class="fas ' + icon + '" style="color:' + iconText + '"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">' +
                        '<span class="alert-badge ' + level + '">' + level + '</span>' +
                        '<span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + (a.source || 'ECC Auditor') + '</span>' +
                    '</div>' +
                    '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px">' + a.title + '</div>' +
                    '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + a.body + '</div>' +
                    link +
                '</div>' +
            '</div>';
        }).join('');

    } catch (e) {
        console.error('Alerts error:', e);
        if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:13px">Could not load alerts.</div>';
    }
}
