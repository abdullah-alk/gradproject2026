// CyberGuard - Dashboard Logic v5
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    loadUserToSidebar();
    await loadDashboard();
});

async function loadDashboard() {
    try {
        showLoader();
        // جلب البيانات من الـ API
        const [stats, domain, cat, gaps] = await Promise.all([
            getDashboardStats(), 
            getDomainScores(), 
            getScoresByControl(),
            apiRequest('/dashboard/gaps').catch(()=>[])
        ]);
        updateCards(stats);
        renderRadar(domain);
        renderBar(cat);
        renderGapsAndRecs(gaps || []);
        hideLoader();
    } catch (e) { 
        console.error("Dashboard Error:", e); 
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
    
    // تحديث دائرة نسبة الالتزام
    const circle = document.getElementById('compliance-circle');
    if (circle) {
        const circ = 2 * Math.PI * 80;
        circle.style.strokeDasharray = circ;
        circle.style.strokeDashoffset = circ - (score / 100) * circ;
        circle.style.stroke = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
        circle.style.transition = 'stroke-dashoffset 1.2s ease-in-out';
    }

    const totalGaps = (s.critical_gaps || 0) + (s.partial_controls || 0);
    set('total-gaps-count', totalGaps);
    set('critical-gaps-badge', s.critical_gaps || 0);
    set('medium-gaps-badge', s.partial_controls || 0);
    set('low-gaps-badge', s.compliant_controls || 0);

    const pct = s.audit_progress || 0;
    set('audit-progress-percentage', pct + '%');
    const bar = document.getElementById('audit-progress-bar');
    if (bar) { bar.style.width = pct + '%'; }
    
    set('audit-progress-text', `${s.audited_controls || 0} of 10 controls reviewed`);
    
    if (s.next_audit_date) {
        const d = new Date(s.next_audit_date);
        const diffMs = d - new Date();
        const diffDays = Math.floor(diffMs / 86400000);
        const diffHours = Math.floor((diffMs % 86400000) / 3600000);
        if (diffDays > 0) {
            set('next-audit-days', diffDays + 'd');
        } else if (diffHours > 0) {
            set('next-audit-days', diffHours + 'h');
        } else {
            set('next-audit-days', '<1h');
        }
        set('next-audit-date', 'Scheduled: ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    } else {
        set('next-audit-days', '—');
        set('next-audit-date', 'No audit scheduled yet');
    }
    
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
                backgroundColor: 'rgba(6,182,212,0.12)', 
                borderColor: '#06b6d4', 
                borderWidth: 2, 
                pointBackgroundColor: '#06b6d4', 
                pointRadius: 4 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { 
                r: { 
                    min: 0, 
                    max: 100, 
                    ticks: { color: '#64748b', backdropColor: 'transparent', stepSize: 25 }, 
                    grid: { color: '#334155' }, 
                    pointLabels: { color: '#94a3b8', font: { size: 11 } } 
                } 
            }, 
            plugins: { legend: { display: false } } 
        }
    });
}

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
                backgroundColor: scores.map(v => v >= 80 ? 'rgba(16,185,129,0.75)' : v >= 50 ? 'rgba(245,158,11,0.75)' : 'rgba(239,68,68,0.75)'), 
                borderRadius: 6, 
                borderSkipped: false 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            indexAxis: 'y', 
            scales: { 
                x: { 
                    min: 0, 
                    max: 100, 
                    ticks: { color: '#64748b', callback: v => v + '%' }, 
                    grid: { color: '#334155' } 
                }, 
                y: { 
                    ticks: { color: '#94a3b8', font: { size: 11 } }, 
                    grid: { display: false } 
                } 
            }, 
            plugins: { legend: { display: false } } 
        }
    });
}
function renderGapsAndRecs(gaps) {
    const gEl = document.getElementById('gaps-list');
    const rEl = document.getElementById('recommendations-list');
    if (!gaps.length) {
        if (gEl) gEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center"><i class="fas fa-check-circle" style="color:#10b981;margin-right:8px"></i>No critical gaps found</div>';
        if (rEl) rEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center"><i class="fas fa-check-circle" style="color:#10b981;margin-right:8px"></i>Use Guide Mode to generate recommendations</div>';
        return;
    }
    const auditGaps = gaps.filter(g => g.mode !== 'guide');
    if (gEl) gEl.innerHTML = auditGaps.length ? auditGaps.map(g => `
        <div style="border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:14px;margin-bottom:10px;background:rgba(239,68,68,.05)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-size:13px;font-weight:600;color:#ef4444">${g.control_id} — ${g.control_title}</span>
                <span style="font-size:11px;background:rgba(239,68,68,.15);color:#ef4444;padding:2px 8px;border-radius:10px;font-weight:600">${g.priority}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary)">${g.gap_description ? g.gap_description.substring(0,150)+'...' : 'Gap identified in last audit'}</div>
        </div>
    `).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center"><i class="fas fa-check-circle" style="color:#10b981;margin-right:8px"></i>No critical gaps found</div>';
    const guideGaps = gaps.filter(g => g.mode === 'guide');
    if (rEl) rEl.innerHTML = guideGaps.length ? guideGaps.map(g => `
        <div style="border:1px solid rgba(139,92,246,.2);border-radius:8px;padding:14px;margin-bottom:10px;background:rgba(139,92,246,.05)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <i class="fas fa-lightbulb" style="color:#8b5cf6;font-size:14px"></i>
                <span style="font-size:13px;font-weight:600;color:#8b5cf6">${g.control_id} — ${g.control_title}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${g.recommendation ? g.recommendation.replace(/\*\*(.*?)\*\*/g,'$1').replace(/^#+\s*/gm,'').substring(0,200)+'...' : 'Review and remediate this control'}</div>
            <a href="chatbot.html?control=${g.control_id}" style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:11px;color:var(--accent-primary);text-decoration:none"><i class="fas fa-arrow-right"></i> Start Audit</a>
        </div>
    `).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center"><i class="fas fa-check-circle" style="color:#10b981;margin-right:8px"></i>Use Guide Mode to generate recommendations</div>';
    
}
