// CyberGuard Scheduler v6 - PRODUCTION
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    loadUserToSidebar();
    await loadSchedulerData();
    document.getElementById('schedule-manual-audit-btn')?.addEventListener('click', handleScheduleManualAudit);
    document.getElementById('enable-auto-scheduling')?.addEventListener('change', e => toggleAutoScheduling(e.target.checked));
});

async function loadSchedulerData() {
    try {
        showLoader();
        const stats = await getDashboardStats();
        const score = stats.compliance_score || 0;
        const gaps = stats.critical_gaps || 0;
        const daysRec = gaps > 3 ? 7 : gaps > 0 ? 14 : 30;

        const recEl = document.getElementById('ai-recommendation-content');
        if (recEl) {
            recEl.innerHTML = `Based on your current compliance score (<strong>${score}%</strong>) and <strong>${gaps} critical gap${gaps !== 1 ? 's' : ''}</strong>, we recommend scheduling the next audit within <strong>${daysRec} days</strong>, with priority focus on the lowest-scoring domains.`;
        }
// edit here 
        const audits = await getScheduledAudits();
    if (audits && audits.length > 0) {
    const res = await fetch('https://gradproject2026-production-821d.up.railway.app/api/audit/sessions/scheduled', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
       });
    const rawAudits = await res.json();
    if (rawAudits && rawAudits.length > 0) {
        startCountdown(new Date(rawAudits[0].scheduled_next_audit || rawAudits[0].date));
    }
      } else if (stats.next_audit_date) {
    startCountdown(new Date(stats.next_audit_date));
      } else {
    const d = new Date();
    d.setDate(d.getDate() + daysRec);
    startCountdown(d);
    }
       

        await loadScheduledAudits();
        hideLoader();
    } catch (e) {
        console.error('Scheduler load error:', e);
        hideLoader();
        const d = new Date();
        d.setDate(d.getDate() + 14);
        startCountdown(d);
    }
}

function startCountdown(target) {
    if (countdownInterval) clearInterval(countdownInterval);
    const tick = () => {
        const diff = target - new Date();
        if (diff <= 0) { updateDisplay(0, 0, 0); clearInterval(countdownInterval); return; }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        updateDisplay(days, hours, mins);
    };
    tick();
    countdownInterval = setInterval(tick, 60000);
}

function updateDisplay(d, h, m) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2, '0'); };
    set('countdown-days', d);
    set('countdown-hours', h);
    set('countdown-minutes', m);
}

async function handleScheduleManualAudit() {
    const dateInput = document.getElementById('manual-audit-date');

    if (!dateInput || !dateInput.value) {
        showToast('error', 'Missing Date', 'Please select an audit date.');
        return;
    }

    let selectedDate;
    try {
        selectedDate = new Date(dateInput.value + 'T00:00:00');
    } catch (e) {
        showToast('error', 'Invalid Date', 'Invalid date format.');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
        showToast('error', 'Invalid Date', 'Audit date cannot be in the past.');
        return;
    }

    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    if (selectedDate > maxDate) {
        showToast('error', 'Invalid Date', 'Audit date cannot be more than 1 year in the future.');
        return;
    }

    showLoader();
    try {
        await scheduleAudit({
            audit_date: dateInput.value,
            scope: document.getElementById('audit-scope-select')?.value || 'full',
            assigned_auditor: document.getElementById('assigned-auditor-select')?.value || 'security-team'
        });

        //startCountdown(selectedDate);

        const dateStr = selectedDate.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        showToast('success', 'Audit Scheduled', `Successfully scheduled for ${dateStr}`);
        await loadScheduledAudits();
        dateInput.value = '';
    } catch (e) {
        console.error('Schedule error:', e);
        showToast('error', 'Failed', 'Failed to schedule audit. Please try again.');
    } finally {
        hideLoader();
    }
}

function showToast(type, title, msg) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const t = document.getElementById('toast-title');
    const m = document.getElementById('toast-msg');
    const colors = { success: '#10b981', error: '#ef4444', info: '#06b6d4' };
    const icons = { success: 'fa-check', error: 'fa-times', info: 'fa-info' };
    icon.style.background = colors[type] + '20';
    icon.style.color = colors[type];
    icon.innerHTML = `<i class="fas ${icons[type]}"></i>`;
    t.textContent = title;
    m.textContent = msg;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
    }, 4000);
}

async function loadScheduledAudits() {
    try {
        const audits = await getScheduledAudits();
        const list = document.getElementById('scheduled-audits-list');
        const count = document.getElementById('audits-count');
        if (!audits || audits.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);"><i class="fas fa-calendar" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.4;"></i><p>No audits scheduled yet</p></div>`;
            if (count) count.textContent = '0 Scheduled';
            return;
        }
        if (count) count.textContent = `${audits.length} Scheduled`;
        list.innerHTML = audits.map(a => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-secondary);border-radius:10px;margin-bottom:10px;border:1px solid var(--border-color);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:40px;height:40px;background:rgba(6,182,212,0.1);border-radius:8px;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-calendar-check" style="color:var(--accent-primary);"></i>
                    </div>
                    <div>
                        <div style="font-weight:600;font-size:14px;">${a.title || 'Scheduled Audit'}</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                            <i class="fas fa-clock" style="margin-right:4px;"></i>${a.date}
                            &nbsp;·&nbsp;
                            <i class="fas fa-user" style="margin-right:4px;"></i>${a.auditor}
                        </div>
                    </div>
                </div>
            <div style="display:flex;align-items:center;gap:8px;">
                  <span style="background:rgba(16,185,129,0.1);color:#10b981;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;">Scheduled</span>
                 <button onclick="deleteScheduledAudit(${a.id})" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:11px;">
                 <i class="fas fa-trash"></i>
               </button>
           </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load audits error:', e);
    }
}
async function deleteScheduledAudit(sessionId) {
    if (!confirm('Delete this scheduled audit?')) return;
    showLoader();
    try {
        await deleteScheduledAuditAPI(sessionId);
        showToast('success', 'Deleted', 'Scheduled audit removed.');
        await loadScheduledAudits();
    } catch (e) {
        showToast('error', 'Failed', 'Could not delete audit.');
    } finally {
        hideLoader();
    }
}
window.addEventListener('beforeunload', () => {
    if (countdownInterval) clearInterval(countdownInterval);
});
