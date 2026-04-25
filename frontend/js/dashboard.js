

// CyberGuard - Dashboard v5

document.addEventListener('DOMContentLoaded', async () => {

    if (!checkAuth()) return;

    loadUserToSidebar();

    await loadDashboard();

});

async function loadDashboard() {

    try {

        showLoader();

        const [stats, domain, cat] = await Promise.all([getDashboardStats(), getDomainScores(), getScoresByControl()]);

        updateCards(stats);

        renderRadar(domain);

        renderBar(cat);

        hideLoader();

    } catch (e) { console.error(e); hideLoader(); }

}

function set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function updateCards(s) {

    const score = s.compliance_score || 0;

    set('overall-compliance-score', score + '%');

    const circle = document.getElementById('compliance-circle');

    if (circle) {

        const circ = 2 * Math.PI * 80;

        [circle.style](http://circle.style).strokeDasharray = circ;

        [circle.style](http://circle.style).strokeDashoffset = circ - (score / 100) * circ;

        [circle.style](http://circle.style).stroke = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

        [circle.style](http://circle.style).transition = 'stroke-dashoffset 1.2s ease';

    }

    const totalGaps = (s.critical_gaps || 0) + (s.partial_controls || 0);

    set('total-gaps-count', totalGaps);

    set('critical-gaps-badge', s.critical_gaps || 0);

    set('medium-gaps-badge', s.partial_controls || 0);

    set('low-gaps-badge', s.compliant_controls || 0);

    const pct = s.audit_progress || 0;

    set('audit-progress-percentage', pct + '%');

    const bar = document.getElementById('audit-progress-bar');

    if (bar) { [bar.style](http://bar.style).width = pct + '%'; }

    set('audit-progress-text', `${s.audited_controls || 0} of ${[s.total](http://s.total)_controls || 10} controls reviewed`);

    if ([s.next](http://s.next)_audit_date) {

        const d = new Date([s.next](http://s.next)_audit_date);

        const diff = Math.ceil((d - new Date()) / 86400000);

        set('next-audit-days', (diff > 0 ? diff : 0) + 'd');

        set('next-audit-date', 'Scheduled: ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));

    } else {

        set('next-audit-days', '—');

        set('next-audit-date', 'No audit scheduled yet');

    }

}

function renderRadar(data) {

    const c = document.getElementById('domainsRadarChart');

    if (!c || !data?.length) return;

    if (c._chart) c._chart.destroy();

    c._chart = new Chart(c, {

        type: 'radar',

        data: { labels: [data.map](http://data.map)(d => d.domain), datasets: [{ label: 'Compliance %', data: [data.map](http://data.map)(d => d.score || 0), backgroundColor: 'rgba(6,182,212,0.12)', borderColor: '#06b6d4', borderWidth: 2, pointBackgroundColor: '#06b6d4', pointRadius: 4 }] },

        options: { responsive: true, maintainAspectRatio: false, scales: { r: { min: 0, max: 100, ticks: { color: '#64748b', backdropColor: 'transparent', stepSize: 25 }, grid: { color: '#334155' }, pointLabels: { color: '#94a3b8', font: { size: 11 } } } }, plugins: { legend: { display: false } } }

    });

}

function renderBar(data) {

    const c = document.getElementById('categoryBarChart');

    if (!c || !data?.length) return;

    if (c._chart) c._chart.destroy();

    const scores = [data.map](http://data.map)(d => d.score || 0);

    c._chart = new Chart(c, {

        type: 'bar',

        data: { labels: [data.map](http://data.map)(d => d.category || d.domain), datasets: [{ label: 'Compliance %', data: scores, backgroundColor: [scores.map](http://scores.map)(v => v >= 80 ? 'rgba(16,185,129,0.75)' : v >= 50 ? 'rgba(245,158,11,0.75)' : 'rgba(239,68,68,0.75)'), borderRadius: 6, borderSkipped: false }] },

        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { min: 0, max: 100, ticks: { color: '#64748b', callback: v => v + '%' }, grid: { color: '#334155' } }, y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } } }, plugins: { legend: { display: false } } }

    });

}
