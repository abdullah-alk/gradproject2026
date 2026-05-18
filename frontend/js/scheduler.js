// CyberGuard Scheduler v6 - PRODUCTION
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;

    loadUserToSidebar();

    await loadSchedulerData();

    document.getElementById('schedule-manual-audit-btn')
        ?.addEventListener('click', handleScheduleManualAudit);

    const repeatToggle = document.getElementById('repeat-toggle');
    const repeatOptions = document.getElementById('repeat-options');

    if (repeatToggle && repeatOptions) {
        repeatToggle.addEventListener('change', () => {
            repeatOptions.style.display =
                repeatToggle.checked ? 'block' : 'none';
        });
    }
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
   // const rawAudits = await res.json();
   // if (rawAudits && rawAudits.length > 0) {
     //   startCountdown(new Date(rawAudits[0].scheduled_next_audit || rawAudits[0].date));
   // }

     const rawAudits = await res.json();

if (rawAudits && rawAudits.length > 0) {

    const nearestAudit = rawAudits.reduce((closest, current) => {

        const currentDate = new Date(current.scheduled_next_audit);
        const closestDate = new Date(closest.scheduled_next_audit);

        return currentDate < closestDate ? current : closest;

    });

    startCountdown(new Date(nearestAudit.scheduled_next_audit));
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
            priority_level: document.getElementById('priority-level-select')?.value || 'medium',
            repeat_enabled: document.getElementById('repeat-toggle')?.checked || false,
            repeat_frequency: document.getElementById('repeat-frequency')?.value || null,
            repeat_until: document.getElementById('repeat-until')?.value || null
});
       

        //startCountdown(selectedDate);

        const dateStr = selectedDate.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        showToast('success','Audit Scheduled',`Successfully scheduled for ${dateStr}`);

        // Update countdown immediately
        startCountdown(selectedDate);

        // Reload scheduled audits list
        await loadScheduledAudits();

        // Reset form
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

function showConfirmModal(message, onConfirm) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:28px;width:340px;text-align:center;">
            <div style="width:48px;height:48px;background:rgba(239,68,68,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <i class="fas fa-trash" style="color:#ef4444;font-size:18px;"></i>
            </div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">Confirm Delete</h3>
            <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px;">${message}</p>
            <div style="display:flex;gap:12px;">
                <button id="confirm-cancel" style="flex:1;padding:10px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);border-radius:8px;cursor:pointer;font-size:13px;">Cancel</button>
                <button id="confirm-ok" style="flex:1;padding:10px;border:none;background:#ef4444;color:white;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">Delete</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('confirm-cancel').onclick = () => modal.remove();
    document.getElementById('confirm-ok').onclick = () => { modal.remove(); onConfirm(); };
}

async function loadScheduledAudits() {
    try {
        const audits = await getScheduledAudits();
        const list = document.getElementById('scheduled-audits-list');
        const count = document.getElementById('audits-count');
        if (!audits || audits.length === 0) {

        list.innerHTML = `
            <div style="text-align:center;padding:32px;color:var(--text-muted);">
                <i class="fas fa-calendar"
                   style="font-size:32px;margin-bottom:12px;display:block;opacity:0.4;"></i>

                <p>No audits scheduled yet</p>
            </div>
        `;

        if (count) {
            count.textContent = '0 Scheduled';
        }

         // Stop countdown timer
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        // Reset countdown display
        updateDisplay(0, 0, 0);

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
                            <i class="fas fa-shield-halved" style="margin-right:4px;"></i>${a.scope}
                            &nbsp;·&nbsp;
                            <span style="
                                padding:3px 10px;
                                border-radius:20px;
                                font-size:11px;
                                font-weight:600;
                                background:${
                                    a.priority === 'critical'
                                        ? 'rgba(220,38,38,0.22)'
                                        : a.priority === 'high'
                                        ? 'rgba(249,115,22,0.22)'
                                        : a.priority === 'medium'
                                        ? 'rgba(234,179,8,0.20)'
                                        : 'rgba(34,197,94,0.20)'
                                };

                                color:${
                                    a.priority === 'critical'
                                        ? '#ff4d4f'
                                        : a.priority === 'high'
                                        ? '#fb923c'
                                        : a.priority === 'medium'
                                        ? '#facc15'
                                        : '#4ade80'
                                };

                                border:1px solid ${
                                    a.priority === 'critical'
                                        ? 'rgba(255,77,79,0.45)'
                                        : a.priority === 'high'
                                        ? 'rgba(251,146,60,0.45)'
                                        : a.priority === 'medium'
                                        ? 'rgba(250,204,21,0.45)'
                                        : 'rgba(74,222,128,0.45)'
                                };
                            ">
                                ${a.priority ? a.priority.toUpperCase() : 'MEDIUM'}
                            </span>
                        </div>
                    </div>
                </div>
            <div style="display:flex;align-items:center;gap:8px;">
                  <span style="background:rgba(16,185,129,0.1);color:#10b981;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;">Scheduled</span>
                  ${a.repeat_enabled ? `
                    <span style="
                        background:rgba(139,92,246,0.12);
                        color:#8b5cf6;
                        padding:4px 12px;
                        border-radius:20px;
                        font-size:11px;
                        font-weight:600;
                                            ">
                        Repeats ${a.repeat_frequency}
                        </span>
                                ` : ''}
                 <button onclick="handleDeleteAudit(${a.id})" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:11px;">
                 <i class="fas fa-trash"></i>
               </button>
           </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load audits error:', e);
    }
}
async function handleDeleteAudit(sessionId) {
    showConfirmModal('Are you sure you want to delete this scheduled audit?', async () => {
        showLoader();
        try {
            await deleteScheduledAudit(sessionId);
            showToast('success', 'Deleted', 'Scheduled audit removed.');
            await loadScheduledAudits();
        } catch (e) {
            showToast('error', 'Failed', 'Could not delete audit.');
        } finally {
            hideLoader();
        }
    });
}
window.addEventListener('beforeunload', () => {
    if (countdownInterval) clearInterval(countdownInterval);
});
