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

    if (s.next_audit_date) {
        const d = new Date(s.next_audit_date);
        const diff = Math.ceil((d - new Date()) / 86400000);
        set('next-audit-days', diff > 0 ? diff + 'd' : '0d');
    } else {
        set('next-audit-days', '—');
    }
}

/* ================= ECC DOMAINS (Radar) ================= */

function renderRadar(data) {

    const c = document.getElementById('domainsRadarChart');
    if (!c || !data?.length) return;

    if (c._chart) c._chart.destroy();

    c._chart = new Chart(c, {
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
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' },
                    pointLabels: { color: '#cbd5e1' }
                }
            }
        }
    });
}

/* ================= COMPLIANCE BY DOMAIN ================= */

function renderBar(data) {

    const c = document.getElementById('categoryBarChart');
    if (!c || !data?.length) return;

    if (c._chart) c._chart.destroy();

    const scores = data.map(d => d.score || 0);

    c._chart = new Chart(c, {
        type: 'bar',
        data: {
            labels: data.map(d => d.category || d.domain),
            datasets: [{
                label: 'Compliance %',
                data: scores,
                backgroundColor: scores.map(v =>
                    v >= 80 ? '#10b981' :
                    v >= 50 ? '#f59e0b' : '#ef4444'
                ),
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    min: 0,
                    max: 100,
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                },
                y: {
                    ticks: { color: '#cbd5e1' },
                    grid: { display: false }
                }
            }
        }
    });
}
