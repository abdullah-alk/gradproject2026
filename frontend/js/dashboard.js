document.addEventListener('DOMContentLoaded', async () => {

    if (!checkAuth()) return;

    loadUserToSidebar();

    await loadDashboard();
});

async function loadDashboard() {
    try {
        showLoader();

        const [stats, domain, cat] = await Promise.all([
            getDashboardStats(),
            getDomainScores(),
            getScoresByControl()
        ]);

        updateCards(stats);
        renderRadar(domain);
        renderBar(cat);

        hideLoader();
    } catch (e) {
        console.error(e);
        hideLoader();
    }
}

function set(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function updateCards(s) {

    const score = s.compliance_score || 0;
    set('overall-compliance-score', score + '%');

    const totalGaps = (s.critical_gaps || 0) + (s.partial_controls || 0);
    set('total-gaps-count', totalGaps);

    const pct = s.audit_progress || 0;
    set('audit-progress-percentage', pct + '%');

    const bar = document.getElementById('audit-progress-bar');
    if (bar) bar.style.width = pct + '%';

    if (s.next_audit_date) {
        const d = new Date(s.next_audit_date);
        const diff = Math.ceil((d - new Date()) / 86400000);

        set('next-audit-days', (diff > 0 ? diff : 0) + 'd');
        set('next-audit-date', 'Scheduled: ' + d.toDateString());
    } else {
        set('next-audit-days', '—');
        set('next-audit-date', 'No audit scheduled');
    }
}

function renderRadar(data) {

    const ctx = document.getElementById('domainsRadarChart');
    if (!ctx) return;

    if (ctx._chart) ctx._chart.destroy();

    ctx._chart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: data.map(d => d.domain),
            datasets: [{
                label: 'Compliance %',
                data: data.map(d => d.score || 0),
                backgroundColor: 'rgba(6,182,212,0.15)',
                borderColor: '#06b6d4',
                borderWidth: 2,
                pointBackgroundColor: '#06b6d4',
                pointHoverRadius: 8
            }]
        },
        options: {
            interaction: {
                mode: 'nearest',
                intersect: true
            },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { color: '#64748b' },
                    grid: { color: '#334155' },
                    pointLabels: { color: '#94a3b8' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderBar(data) {

    const ctx = document.getElementById('categoryBarChart');
    if (!ctx) return;

    if (ctx._chart) ctx._chart.destroy();

    const scores = data.map(d => d.score || 0);

    ctx._chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.category || d.domain),
            datasets: [{
                data: scores,
                backgroundColor: scores.map(v =>
                    v >= 80 ? '#22c55e' :
                    v >= 50 ? '#facc15' :
                    '#ef4444'
                ),
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            onHover: (e, el) => {
                e.native.target.style.cursor = el.length ? 'pointer' : 'default';
            },
            scales: {
                x: {
                    min: 0,
                    max: 100,
                    ticks: { callback: v => v + '%' }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}
