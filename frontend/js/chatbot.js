
// CyberGuard ECC Chatbot v8 - FULL UPDATED EDITION
// Integration: Hierarchical Flow + Evidence Saving + API Sync

let currentMode = 'audit', 
    currentControlId = null, 
    currentControlDbId = null, 
    currentQuestions = [], 
    currentQuestionIndex = 0, 
    selectedControlInfo = null, 
    currentSessionId = null, 
    auditAnswers = [];

// 1. هيكلية الضوابط (الأساسي والفرعي)
const eccDomains = [
    { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
    { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
    { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
    { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
    { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] },
    
    // الضوابط الجديدة المضافة
    { 
        id: '1-6', 
        title: 'Cybersecurity in IT Project Management', 
        subControls: ['1-6-1', '1-6-2-1', '1-6-2-2', '1-6-3-1', '1-6-3-2', '1-6-3-3', '1-6-3-4', '1-6-3-5', '1-6-4'] 
    },
    { 
        id: '1-7', 
        title: 'Compliance with Laws and Regulations', 
        subControls: ['1-7-1', '1-7-2'] 
    },
    { 
        id: '1-8', 
        title: 'Periodical Review and Audit', 
        subControls: ['1-8-1', '1-8-2', '1-8-3'] 
    },
    { 
        id: '1-9', 
        title: 'Cybersecurity in Human Resources', 
        subControls: ['1-9-1', '1-9-2', '1-9-3-1', '1-9-3-2', '1-9-4-1', '1-9-4-2', '1-9-5', '1-9-6'] 
    },
    { 
        id: '1-10', 
        title: 'Cybersecurity Awareness and Training', 
        subControls: ['1-10-1', '1-10-2', '1-10-3-1', '1-10-3-2', '1-10-3-3', '1-10-3-4', '1-10-4-1', '1-10-4-2', '1-10-4-3', '1-10-5'] 
    }
];

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    loadUserToSidebar();
    renderControlBrowser();
    
    document.getElementById('audit-mode-btn').addEventListener('click', () => setMode('audit'));
    document.getElementById('guide-mode-btn').addEventListener('click', () => setMode('guide'));
    document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
    document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

    // استعادة النتائج السابقة لتلوين النقاط
    const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
    Object.entries(res).forEach(([id, s]) => updateDot(id, s));
});

function getDotColor(s) {
    return s === 'Compliant' ? '#10b981' : s === 'Non-Compliant' ? '#ef4444' : s === 'Partial' ? '#f59e0b' : '#475569';
}

function renderControlBrowser() {
    const b = document.getElementById('control-browser'); if (!b) return; b.innerHTML = '';
    const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
    eccDomains.forEach(c => {
        const item = document.createElement('div'); 
        item.className = 'control-item'; 
        item.dataset.id = c.id;
        item.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px">
                <span class="status-dot" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${getDotColor(res[c.id] || '')}"></span>
                <small style="color:var(--accent-primary);font-weight:600">${c.id}</small>
            </div>
            <div style="font-weight:500;font-size:13px;margin-top:3px;padding-left:16px">${c.title}</div>`;
        item.onclick = () => selectControl(c, item);
        b.appendChild(item);
    });
}


async function selectControl(ctrl, el) {
    document.querySelectorAll('.control-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    
    currentControlId = ctrl.id;
    selectedControlInfo = ctrl;
    
    // إعادة تهيئة المتغيرات المؤقتة
    auditAnswers = [];
    currentQuestions = [];
    currentQuestionIndex = 0;

    // مفتاح التخزين المركب (مثلاً: audit_1-1)
    const storageKey = `${currentMode}_${ctrl.id}`;

    // 1. استعادة محادثة الوضع الحالي فقط
    const savedChat = localStorage.getItem(`chat_history_${storageKey}`);
    const cm = document.getElementById('chat-messages');
    cm.innerHTML = savedChat || ''; 
    
    // 2. التحقق من وجود جلسة استكمال لهذا الوضع تحديداً
    const savedSession = localStorage.getItem(`session_resume_${storageKey}`);
    
    if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        if (sessionData.index > 0 && sessionData.questions.length > 0) {
            showResumeOption(sessionData);
        } else {
            showSubControlOptions(ctrl);
        }
    } else if (!savedChat) {
        showSubControlOptions(ctrl);
    }
    
    cm.scrollTop = cm.scrollHeight;
}

function showSubControlOptions(ctrl) {
    const cm = document.getElementById('chat-messages');
    const m = document.createElement('div');
    m.className = 'message ai-message';
    
    let buttonsHtml = ctrl.subControls.map(subId => `
        <button onclick="initiateSubAudit('${subId}')" style="padding:10px 14px; border:1px solid var(--accent-primary); background:rgba(6,182,212,0.05); color:var(--accent-primary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition:0.2s; hover:background:var(--accent-primary);">
            Control ${subId}
        </button>
    `).join('');

    m.innerHTML = `
        <div class="message-content">
            <div class="message-header">AI Compliance Assistant</div>
            <div class="message-text">
                <p style="margin-bottom:15px">You have chosen the main control <strong>${ctrl.id}</strong>. Please select the sub-control you wish to assess now to begin:</p>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">${buttonsHtml}</div>
            </div>
        </div>`;
    cm.appendChild(m);
    cm.scrollTop = cm.scrollHeight;
}

async function initiateSubAudit(subId) {
    appendMsg('user', `Starting the sub-control assessment: ${subId}`);
    showTyping();
    
    try {
        const r = await generateAuditQuestions(subId, currentMode);
        hideTyping();
        
        if (r.questions?.length > 0) {
            currentQuestions = r.questions.map(q => ({
                q: q.question, 
                ev: q.expected_evidence || '', 
                cat: subId 
            }));
            currentQuestionIndex = 0;
            
            const u = getCurrentUserLocal();
            
            // التعديل الجوهري هنا: تحويل المعرف إلى String لمنع خطأ الـ SQL
            const s = await startAuditSessionAPI(u.id, subId, currentMode);
            if(s?.session_id) currentSessionId = s.session_id;
            if(s?.control_db_id) currentControlDbId = s.control_db_id;

            setTimeout(showAuditQ, 400);
        } else {
            appendMsg('ai', `<span style="color:#ef4444">Could not generate questions for ${subId}.</span>`);
        }
    } catch (e) {
        hideTyping();
        console.error("AI Error:", e);
        appendMsg('ai', `<span style="color:#ef4444">AI engine is currently unavailable.</span>`);
    }
}

function showAuditQ() {
    if (currentQuestionIndex >= currentQuestions.length) {
        if (currentMode === 'audit') finishAudit(); else finishGuide();
        return;
    }
    const q = currentQuestions[currentQuestionIndex], 
          num = currentQuestionIndex + 1, 
          total = currentQuestions.length, 
          pct = Math.round((currentQuestionIndex / total) * 100);
          
    const cm = document.getElementById('chat-messages'), m = document.createElement('div'); 
    m.className = 'message ai-message';
    m.innerHTML = `
        <div class="message-content">
            <div class="message-header">AI Auditor</div>
            <div class="message-text">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <span style="font-size:11px;color:var(--text-muted)">Question ${num} of ${total}</span>
                    <span style="font-size:11px;background:rgba(6,182,212,0.1);color:var(--accent-primary);padding:2px 10px;border-radius:20px">${q.cat}</span>
                </div>
                <div style="width:100%;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;margin-bottom:14px">
                    <div style="height:100%;width:${pct}%;background:var(--accent-primary);border-radius:2px;transition:width 0.4s"></div>
                </div>
                <p style="font-size:14px;line-height:1.7;margin-bottom:${q.ev ? '8px' : '16px'}">${q.q}</p>
                ${q.ev ? `<p style="font-size:11px;color:#f59e0b;margin-bottom:16px"><i class="fas fa-paperclip" style="margin-right:4px"></i>Required evidence: ${q.ev}</p>` : ''}
                <div style="display:flex;gap:10px;flex-wrap:wrap">
                    <button onclick="answerAudit('yes',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #10b981;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:13px;font-weight:600;">Yes</button>
                    <button onclick="answerAudit('partial',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.08);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:600;">Partial</button>
                    <button onclick="answerAudit('no',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #ef4444;background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:13px;font-weight:600;">No</button>
                </div>
            </div>
        </div>`;
    cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
}


async function answerAudit(ans, btn) {
    btn.closest('div').querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.35'; }); 
    btn.style.opacity = '1';
    
    const labels = { yes: 'Yes — Verified', partial: 'Partial — Needs improvement', no: 'No — Gap' };
    appendMsg('user', labels[ans]);
    
    const currentQ = currentQuestions[currentQuestionIndex];
    auditAnswers.push({ question: currentQ.q, answer: ans, evidence: currentQ.ev });
    
    if (currentSessionId) {
        try { await saveAuditAnswer(currentSessionId, currentQ.q, ans); } catch (e) {}
    }
    
    currentQuestionIndex++; 

    // حفظ حالة الاستكمال باستخدام المفتاح المركب
    const storageKey = `${currentMode}_${currentControlId}`;
    const sessionToSave = {
        subId: currentQ.cat,
        questions: currentQuestions,
        index: currentQuestionIndex,
        answers: auditAnswers,
        sessionId: currentSessionId,
        dbId: currentControlDbId
    };
    localStorage.setItem(`session_resume_${storageKey}`, JSON.stringify(sessionToSave));
    
    setTimeout(showAuditQ, 500);
}


async function finishAudit() {
    const total = auditAnswers.length, 
          yes = auditAnswers.filter(a => a.answer === 'yes').length, 
          partial = auditAnswers.filter(a => a.answer === 'partial').length, 
          no = auditAnswers.filter(a => a.answer === 'no').length;
    
    const score = total > 0 ? Math.round(((yes + partial * 0.5) / total) * 100) : 0;
    const status = score >= 80 ? 'Compliant' : score >= 40 ? 'Partial' : 'Non-Compliant';
    const color = getDotColor(status);
    const storageKey = `${currentMode}_${currentControlId}`;
    localStorage.removeItem(`session_resume_${storageKey}`);
    const sectionName = auditAnswers[0]?.cat || currentControlId;
    appendMsg('ai', `
        <div style="border:1px solid ${color}30; border-radius:12px; padding:20px; background:${color}08; margin-top:10px">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--text-primary)">Assessment Complete: ${sectionName}</strong>
                <span style="font-size:20px; font-weight:800; color:${color}">${score}%</span>
            </div>
            <div style="margin: 15px 0; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                <div style="width: ${score}%; height: 100%; background: ${color}; box-shadow: 0 0 10px ${color}50;"></div>
            </div>
            <p style="font-size:12px; color:var(--text-muted); margin-top:5px">Results saved. You can now assess another sub-control.</p>
        </div>
    `);
    try {
        await saveProgress(currentControlId, status, score, yes, partial, no, total);
        await saveAuditToEvidence(
            currentControlId, 
            selectedControlInfo?.title || currentControlId, 
            status, score, auditAnswers, 
            currentSessionId, currentControlDbId
        );
    } catch (e) {
        console.error("Error saving final audit results:", e);
    }
    // حفظ gap قبل تصفير المتغيرات
        const hasGaps = auditAnswers.some(a => a.answer === 'no' || a.answer === 'partial');
        if (hasGaps) try {
        const answersText = auditAnswers.map((a,i) => 
            `Q${i+1}: "${a.question}" => ${a.answer.toUpperCase()}`
        ).join('\n');
        await saveAuditRecommendation({
            control_id: currentControlDbId,
            session_id: currentSessionId,
            gap_description: answersText,
            recommendation: `Gaps identified in ${currentControlId}. Score: ${score}%. Review and remediate the following: ${auditAnswers.filter(a=>a.answer==='no').map(a=>a.question).join(' | ')}`,
            priority: status === 'Non-Compliant' ? 'High' : status === 'Partial' ? 'Medium' : 'Low'
        });
    } catch(e) { console.error('Gap save error:', e); }
    auditAnswers = [];
    currentQuestions = [];
    currentQuestionIndex = 0;
    currentSessionId = null;
    setTimeout(() => {
        if (selectedControlInfo) showSubControlOptions(selectedControlInfo);
    }, 3000);
}
async function saveAuditToEvidence(controlId, controlTitle, status, score, answers, sessionId, controlDbId) {
    try {
        const transcript = answers.map((a, i) => {
            const icon = a.answer === 'yes' ? '✅' : a.answer === 'partial' ? '⚠️' : '❌';
            return `Q${i + 1}: ${a.question}\nAnswer: ${icon} ${a.answer.toUpperCase()}${a.evidence ? '\nEvidence required: ' + a.evidence : ''}`;
        }).join('\n\n');
        
        const summary = `AUDIT REPORT — Control ${controlId}\nStatus: ${status}\nScore: ${score}%\n\n${transcript}`;
        
        await apiRequest('/evidence/save-audit', {
            method: 'POST',
            body: JSON.stringify({
                control_id: controlDbId,
                session_id: sessionId,
                title: `Audit Report — ${controlId}: ${controlTitle}`,
                description: summary,
                status: status,
                score: score,
                answers: answers,
                evidence_type: 'audit_session'
            })
        });
    } catch (e) {
        console.warn('[Offline Mode] Saving session locally.');
        const sessions = JSON.parse(localStorage.getItem('audit_sessions_log') || '[]');
        sessions.unshift({ control_id: controlId, status, score, created_at: new Date().toISOString() });
        localStorage.setItem('audit_sessions_log', JSON.stringify(sessions.slice(0, 50)));
    }
}

async function saveProgress(ctrlId, status, score, yes, partial, no, total) {
    const res = JSON.parse(localStorage.getItem('audit_results') || '{}'); res[ctrlId] = status;
    localStorage.setItem('audit_results', JSON.stringify(res));
    const sco = JSON.parse(localStorage.getItem('audit_scores') || '{}'); sco[ctrlId] = score;
    localStorage.setItem('audit_scores', JSON.stringify(sco));
    
    updateDot(ctrlId, status);
    updateRightPanel(ctrlId);
    
    try { await updateControlStatus(ctrlId, status); } catch (e) { }
    if (currentSessionId) { try { await completeAuditSession(currentSessionId, status, score); } catch (e) { } }
}

function updateRightPanel(id) {
    const res = JSON.parse(localStorage.getItem('audit_results') || '{}'), 
          sco = JSON.parse(localStorage.getItem('audit_scores') || '{}');
    const status = res[id] || 'Not Started', score = sco[id];
    const sl = document.getElementById('current-control-status');
    if (sl) {
        sl.textContent = status;
        sl.className = `badge ${status === 'Compliant' ? 'badge-success' : status === 'Non-Compliant' ? 'badge-danger' : 'badge-warning'}`;
    }
    const ev = document.getElementById('linked-evidence');
    if (ev) ev.textContent = status !== 'Not Started' ? `Last audit: ${status} — ${score || 0}%` : 'No audit performed yet';
}

function updateDot(id, status) {
    const item = document.querySelector(`.control-item[data-id="${id}"]`);
    if (item) {
        const dot = item.querySelector('.status-dot');
        if (dot) dot.style.background = getDotColor(status);
    }
}

function setMode(m) {
    currentMode = m;
    document.getElementById('audit-mode-btn').classList.toggle('active', m === 'audit');
    document.getElementById('guide-mode-btn').classList.toggle('active', m === 'guide');
    if (selectedControlInfo) selectControl(selectedControlInfo, document.querySelector(`.control-item[data-id="${currentControlId}"]`));
}



function appendMsg(role, txt) {
    const cm = document.getElementById('chat-messages'), m = document.createElement('div');
    m.className = `message ${role}-message`;
    m.innerHTML = `<div class="message-content"><div class="message-header">${role === 'ai' ? 'AI Auditor' : 'User'}</div><div class="message-text">${txt}</div></div>`;
    cm.appendChild(m); 
    cm.scrollTop = cm.scrollHeight;
    
    // حفظ المحادثة في مفتاح مخصص للوضع الحالي
    if (currentControlId) {
        const storageKey = `${currentMode}_${currentControlId}`;
        localStorage.setItem(`chat_history_${storageKey}`, cm.innerHTML);
    }
}

function showTyping() {
    const cm = document.getElementById('chat-messages');
    const ind = document.createElement('div'); ind.id = 'typing-indicator'; ind.className = 'message ai-message';
    ind.innerHTML = `<div class="message-content"><div class="message-text"><i class="fas fa-ellipsis-h fa-beat"></i> AI is working...</div></div>`;
    cm.appendChild(ind); cm.scrollTop = cm.scrollHeight;
}

function hideTyping() { const el = document.getElementById('typing-indicator'); if (el) el.remove(); }

async function handleUserMessage() {
    const input = document.getElementById('user-query'), text = input.value.trim();
    if (!text) return; if (!currentControlId) { appendMsg('ai', 'Please select a control first.'); return; }
    appendMsg('user', text); input.value = ''; showTyping();
    try {
        const r = await callAIEngine(text, currentControlId, currentMode);
        hideTyping(); appendMsg('ai', r.answer || 'No specific guidance available.');
    } catch (e) { hideTyping(); appendMsg('ai', 'Error connecting to AI engine.'); }
}

// دالة مضافة لـ Guide Mode
async function finishGuide() {
    appendMsg('ai', `<em style="color:var(--text-muted);font-size:12px">Generating final recommendations...</em>`);
    showTyping();
    const answersText = auditAnswers.map((a,i) => `Q${i+1}: "${a.question}" => ${a.answer.toUpperCase()}`).join('\n');
    try {
        const r = await getAIRecommendations(currentControlId, answersText);
        hideTyping();
        if (r?.answer) {
            let fmt = r.answer
                .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
                .replace(/^#{1,3}\s+(.+)$/gm, '<div style="font-size:15px;font-weight:700;color:#8b5cf6;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(139,92,246,0.2)">$1</div>')
                .replace(/^(\d+)\.\s+\*\*(.*?)\*\*/gm, '<div style="margin:12px 0 4px;display:flex;gap:8px;align-items:flex-start"><span style="background:rgba(6,182,212,0.15);color:#06b6d4;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">$1</span><strong style="color:#e2e8f0">$2</strong></div>')
                .replace(/^\s*-\s+\*\*(.*?)\*\*:\s*/gm, '<div style="margin:5px 0 2px;padding-left:16px"><span style="color:#06b6d4;font-weight:600;font-size:12px">▸ $1:</span> ')
                .replace(/^\s*-\s+/gm, '<div style="margin:3px 0;padding-left:16px;color:var(--text-secondary);font-size:13px">• ')
                .replace(/\n\n/g, '</div><br>')
                .replace(/\n/g, '</div>');
            appendMsg('ai', `
                <div style="border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:24px;background:rgba(139,92,246,0.05)">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(139,92,246,0.2)">
                        <i class="fas fa-lightbulb" style="color:#8b5cf6;font-size:20px"></i>
                        <strong style="font-size:16px;color:#8b5cf6">Recommendations — ${currentControlId}</strong>
                    </div>
                    <div style="font-size:13.5px;line-height:1.9;color:var(--text-secondary)">${fmt}</div>
                    <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(139,92,246,0.2);display:flex;gap:12px">
                        <a href="evidence.html?control=${currentControlId}" style="flex:1;text-align:center;background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;color:#8b5cf6;padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
                            <i class="fas fa-folder-open" style="margin-right:6px"></i>Evidence Vault
                        </a>

                    </div>
                </div>`);
            try {
                await saveAuditRecommendation({
                    control_id: currentControlDbId || null,
                    session_id: currentSessionId,
                    gap_description: answersText,
                    recommendation: r.answer,
                    priority: 'High'
        });
            } catch(e) { console.error('[❌] Gap save error:', e); }
        } else {
            appendMsg('ai', 'Could not generate recommendations.');
        }
    } catch(e) {
        hideTyping();
        appendMsg('ai', `<span style="color:#ef4444">Error generating recommendations.</span>`);
    }
    setTimeout(() => showSubControlOptions(selectedControlInfo), 3000);
}

function showResumeOption(sessionData) {
    const cm = document.getElementById('chat-messages');
    
    // تخزين البيانات في متغير عالمي مؤقت لسهولة الوصول إليها عند الضغط
    window.pendingSessionData = sessionData;

    const m = document.createElement('div');
    m.className = 'message ai-message';
    m.innerHTML = `
        <div class="message-content">
            <div class="message-header">AI Assistant</div>
            <div class="message-text">
                <p>Welcome back! I noticed you haven't completed the sub-control assessment. <strong>${sessionData.subId}</strong>.</p>
                <p style="font-size:12px; color:var(--text-muted)">You have reached the question ${sessionData.index} Out of ${sessionData.questions.length}</p>
                <div style="display:flex; gap:10px; margin-top:15px;">
                    <button onclick="resumeAuditAction()" style="padding:10px 18px; background:#06b6d4; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Continue where you left off</button>
                    <button onclick="restartAudit()" style="padding:10px 18px; background:transparent; border:1px solid #ef4444; color:#ef4444; border-radius:8px; cursor:pointer;">Starting over</button>
                </div>
            </div>
        </div>`;
    cm.appendChild(m);
    cm.scrollTop = cm.scrollHeight;
}


window.resumeAuditAction = function() {
    const data = window.pendingSessionData;
    if (!data) return;

    currentQuestions = data.questions;
    currentQuestionIndex = data.index;
    auditAnswers = data.answers;
    currentSessionId = data.sessionId;
    currentControlDbId = data.dbId;

    appendMsg('ai', `The session was successfully restored in mode (${currentMode}). We will continue from question number ${currentQuestionIndex + 1}...`);
    
    window.pendingSessionData = null;
    setTimeout(showAuditQ, 600);
};

function resumeAudit(data) {
    document.getElementById('chat-messages').innerHTML = '';
    appendMsg('ai', `The assessment is being completed for ${data.subId}...`);
    
    currentQuestions = data.questions;
    currentQuestionIndex = data.index;
    auditAnswers = data.answers;
    currentSessionId = data.sessionId;
    currentControlDbId = data.dbId;
    
    setTimeout(showAuditQ, 600);
}

function restartAudit() {
    localStorage.removeItem(`session_resume_${currentControlId}`);
    document.getElementById('chat-messages').innerHTML = '';
    showSubControlOptions(selectedControlInfo);
}

// أضف هذا الكود في نهاية ملفك أو داخل DOMContentLoaded
function addClearButton() {
    const header = document.querySelector('.chat-header') || document.getElementById('audit-mode-btn').parentElement;
    if (!document.getElementById('clear-chat-btn')) {
        const btn = document.createElement('button');
        btn.id = 'clear-chat-btn';
        btn.innerHTML = '<i class="fas fa-trash"></i> Clear the conversation';
        btn.style = "margin-left:10px; padding:5px 12px; background:#ef444420; color:#ef4444; border:1px solid #ef4444; border-radius:6px; cursor:pointer; font-size:12px;";
        btn.onclick = clearChat;
        header.appendChild(btn);
    }
}

async function clearChat() {
    if (!currentControlId) return;
    if (confirm("هل تريد مسح سجل المحادثة والتقييم للوضع الحالي فقط؟")) {
        const storageKey = `${currentMode}_${currentControlId}`;
        
        localStorage.removeItem(`chat_history_${storageKey}`);
        localStorage.removeItem(`session_resume_${storageKey}`);
        
        document.getElementById('chat-messages').innerHTML = '';
        showSubControlOptions(selectedControlInfo);
    }
}

addClearButton(); // تشغيل الدالة لإظهار الزر




// // CyberGuard ECC Chatbot v8 - FULL UPDATED EDITION
// // Integration: Hierarchical Flow + Evidence Saving + API Sync

// let currentMode = 'audit', 
//     currentControlId = null, 
//     currentControlDbId = null, 
//     currentQuestions = [], 
//     currentQuestionIndex = 0, 
//     selectedControlInfo = null, 
//     currentSessionId = null, 
//     auditAnswers = [];

// // 1. هيكلية الضوابط (الأساسي والفرعي)
// const eccDomains = [
//     { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
//     { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
//     { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
//     { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
//     { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] }
// ];

// document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkAuth()) return;
//     loadUserToSidebar();
//     renderControlBrowser();
    
//     document.getElementById('audit-mode-btn').addEventListener('click', () => setMode('audit'));
//     document.getElementById('guide-mode-btn').addEventListener('click', () => setMode('guide'));
//     document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
//     document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

//     // استعادة النتائج السابقة لتلوين النقاط
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     Object.entries(res).forEach(([id, s]) => updateDot(id, s));
// });

// function getDotColor(s) {
//     return s === 'Compliant' ? '#10b981' : s === 'Non-Compliant' ? '#ef4444' : s === 'Partial' ? '#f59e0b' : '#475569';
// }

// function renderControlBrowser() {
//     const b = document.getElementById('control-browser'); if (!b) return; b.innerHTML = '';
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     eccDomains.forEach(c => {
//         const item = document.createElement('div'); 
//         item.className = 'control-item'; 
//         item.dataset.id = c.id;
//         item.innerHTML = `
//             <div style="display:flex;align-items:center;gap:8px">
//                 <span class="status-dot" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${getDotColor(res[c.id] || '')}"></span>
//                 <small style="color:var(--accent-primary);font-weight:600">${c.id}</small>
//             </div>
//             <div style="font-weight:500;font-size:13px;margin-top:3px;padding-left:16px">${c.title}</div>`;
//         item.onclick = () => selectControl(c, item);
//         b.appendChild(item);
//     });
// }

// async function selectControl(ctrl, el) {
//     document.querySelectorAll('.control-item').forEach(i => i.classList.remove('selected'));
//     el.classList.add('selected');
    
//     currentControlId = ctrl.id;
//     selectedControlInfo = ctrl;
//     auditAnswers = [];
//     currentQuestions = [];
//     currentQuestionIndex = 0;

//     // جلب الـ ID من قاعدة البيانات للربط
//     try { 
//         const cs = await getAllControls(); 
//         const m = cs.find(c => c.control_id === ctrl.id); 
//         if (m) currentControlDbId = m.id; 
//     } catch (e) { console.error("Control DB sync error"); }

//     document.getElementById('current-control-id').textContent = ctrl.id;
//     document.getElementById('current-control-name').textContent = ctrl.title;
//     document.getElementById('current-control-requirement').textContent = `ECC-2023 compliance assessment for ${ctrl.title}`;
    
//     updateRightPanel(ctrl.id);
//     document.getElementById('chat-messages').innerHTML = '';
    
//     // عرض الضوابط الفرعية داخل الشات بدلاً من بدء الأسئلة
//     showSubControlOptions(ctrl);
// }

// function showSubControlOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message';
    
//     let buttonsHtml = ctrl.subControls.map(subId => `
//         <button onclick="initiateSubAudit('${subId}')" style="padding:10px 14px; border:1px solid var(--accent-primary); background:rgba(6,182,212,0.05); color:var(--accent-primary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition:0.2s; hover:background:var(--accent-primary);">
//             Control ${subId}
//         </button>
//     `).join('');

//     m.innerHTML = `
//         <div class="message-content">
//             <div class="message-header">AI Compliance Assistant</div>
//             <div class="message-text">
//                 <p style="margin-bottom:15px">لقد اخترت الضابط الرئيسي <strong>${ctrl.id}</strong>. يرجى اختيار الضابط الفرعي المطلوب تقييمه الآن للبدء:</p>
//                 <div style="display:flex; gap:10px; flex-wrap:wrap;">${buttonsHtml}</div>
//             </div>
//         </div>`;
//     cm.appendChild(m);
//     cm.scrollTop = cm.scrollHeight;
// }

// async function initiateSubAudit(subId) {
//     appendMsg('user', `بدء تقييم الضابط الفرعي: ${subId}`);
//     showTyping();
    
//     try {
//         const r = await generateAuditQuestions(subId, currentMode);
//         hideTyping();
        
//         if (r.questions?.length > 0) {
//             currentQuestions = r.questions.map(q => ({
//                 q: q.question, 
//                 ev: q.expected_evidence || '', 
//                 cat: subId 
//             }));
//             currentQuestionIndex = 0;
            
//             // بدء جلسة تقنية في الخلفية عبر الـ API
//             const u = getCurrentUserLocal();
//             const s = await startAuditSessionAPI(u.id, currentControlDbId, currentMode);
//             if(s?.session_id) currentSessionId = s.session_id;

//             setTimeout(showAuditQ, 400);
//         } else {
//             appendMsg('ai', `<span style="color:#ef4444">Could not generate questions for ${subId}.</span>`);
//         }
//     } catch (e) {
//         hideTyping();
//         appendMsg('ai', `<span style="color:#ef4444">AI engine is currently unavailable.</span>`);
//     }
// }

// function showAuditQ() {
//     if (currentQuestionIndex >= currentQuestions.length) {
//         if (currentMode === 'audit') finishAudit(); else finishGuide();
//         return;
//     }
//     const q = currentQuestions[currentQuestionIndex], 
//           num = currentQuestionIndex + 1, 
//           total = currentQuestions.length, 
//           pct = Math.round((currentQuestionIndex / total) * 100);
          
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div'); 
//     m.className = 'message ai-message';
//     m.innerHTML = `
//         <div class="message-content">
//             <div class="message-header">AI Auditor</div>
//             <div class="message-text">
//                 <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
//                     <span style="font-size:11px;color:var(--text-muted)">Question ${num} of ${total}</span>
//                     <span style="font-size:11px;background:rgba(6,182,212,0.1);color:var(--accent-primary);padding:2px 10px;border-radius:20px">${q.cat}</span>
//                 </div>
//                 <div style="width:100%;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;margin-bottom:14px">
//                     <div style="height:100%;width:${pct}%;background:var(--accent-primary);border-radius:2px;transition:width 0.4s"></div>
//                 </div>
//                 <p style="font-size:14px;line-height:1.7;margin-bottom:${q.ev ? '8px' : '16px'}">${q.q}</p>
//                 ${q.ev ? `<p style="font-size:11px;color:#f59e0b;margin-bottom:16px"><i class="fas fa-paperclip" style="margin-right:4px"></i>Required evidence: ${q.ev}</p>` : ''}
//                 <div style="display:flex;gap:10px;flex-wrap:wrap">
//                     <button onclick="answerAudit('yes',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #10b981;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:13px;font-weight:600;">Yes</button>
//                     <button onclick="answerAudit('partial',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.08);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:600;">Partial</button>
//                     <button onclick="answerAudit('no',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #ef4444;background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:13px;font-weight:600;">No</button>
//                 </div>
//             </div>
//         </div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// async function answerAudit(ans, btn) {
//     btn.closest('div').querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.35'; }); 
//     btn.style.opacity = '1';
    
//     const labels = { yes: 'Yes — Verified', partial: 'Partial — Needs improvement', no: 'No — Gap' };
//     appendMsg('user', labels[ans]);
    
//     auditAnswers.push({ question: currentQuestions[currentQuestionIndex].q, answer: ans, evidence: currentQuestions[currentQuestionIndex].ev });
    
//     if (currentSessionId) {
//         try { await saveAuditAnswer(currentSessionId, currentQuestions[currentQuestionIndex].q, ans); } catch (e) { }
//     }
    
//     currentQuestionIndex++; 
//     setTimeout(showAuditQ, 500);
// }

// async function finishAudit() {
//     const total = auditAnswers.length, 
//           yes = auditAnswers.filter(a => a.answer === 'yes').length, 
//           partial = auditAnswers.filter(a => a.answer === 'partial').length, 
//           no = auditAnswers.filter(a => a.answer === 'no').length;
    
//     const score = total > 0 ? Math.round(((yes + partial * 0.5) / total) * 100) : 0;
//     const status = score >= 80 ? 'Compliant' : score >= 40 ? 'Partial' : 'Non-Compliant';
//     const color = getDotColor(status);

//     appendMsg('ai', `
//         <div style="border:1px solid ${color}30; border-radius:12px; padding:20px; background:${color}08; margin-top:10px">
//             <div style="display:flex; justify-content:space-between; align-items:center;">
//                 <strong>${auditAnswers[0]?.cat} Assessment Complete</strong>
//                 <span style="font-size:20px; font-weight:800; color:${color}">${score}%</span>
//             </div>
//             <p style="font-size:12px; color:var(--text-muted); margin-top:5px">Section results saved. You can now assess another sub-control.</p>
//         </div>
//     `);

//     await saveProgress(currentControlId, status, score, yes, partial, no, total);
//     await saveAuditToEvidence(currentControlId, selectedControlInfo?.title || currentControlId, status, score, auditAnswers, currentSessionId, currentControlDbId);
    
//     // العودة التلقائية لعرض الخيارات الفرعية
//     setTimeout(() => showSubControlOptions(selectedControlInfo), 2500);
// }

// async function saveAuditToEvidence(controlId, controlTitle, status, score, answers, sessionId, controlDbId) {
//     try {
//         const transcript = answers.map((a, i) => {
//             const icon = a.answer === 'yes' ? '✅' : a.answer === 'partial' ? '⚠️' : '❌';
//             return `Q${i + 1}: ${a.question}\nAnswer: ${icon} ${a.answer.toUpperCase()}${a.evidence ? '\nEvidence required: ' + a.evidence : ''}`;
//         }).join('\n\n');
        
//         const summary = `AUDIT REPORT — Control ${controlId}\nStatus: ${status}\nScore: ${score}%\n\n${transcript}`;
        
//         await apiRequest('/evidence/save-audit', {
//             method: 'POST',
//             body: JSON.stringify({
//                 control_id: controlDbId,
//                 session_id: sessionId,
//                 title: `Audit Report — ${controlId}: ${controlTitle}`,
//                 description: summary,
//                 status: status,
//                 score: score,
//                 answers: answers,
//                 evidence_type: 'audit_session'
//             })
//         });
//     } catch (e) {
//         console.warn('[Offline Mode] Saving session locally.');
//         const sessions = JSON.parse(localStorage.getItem('audit_sessions_log') || '[]');
//         sessions.unshift({ control_id: controlId, status, score, created_at: new Date().toISOString() });
//         localStorage.setItem('audit_sessions_log', JSON.stringify(sessions.slice(0, 50)));
//     }
// }

// async function saveProgress(ctrlId, status, score, yes, partial, no, total) {
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}'); res[ctrlId] = status;
//     localStorage.setItem('audit_results', JSON.stringify(res));
//     const sco = JSON.parse(localStorage.getItem('audit_scores') || '{}'); sco[ctrlId] = score;
//     localStorage.setItem('audit_scores', JSON.stringify(sco));
    
//     updateDot(ctrlId, status);
//     updateRightPanel(ctrlId);
    
//     try { await updateControlStatus(ctrlId, status); } catch (e) { }
//     if (currentSessionId) { try { await completeAuditSession(currentSessionId, status, score); } catch (e) { } }
// }

// function updateRightPanel(id) {
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}'), 
//           sco = JSON.parse(localStorage.getItem('audit_scores') || '{}');
//     const status = res[id] || 'Not Started', score = sco[id];
//     const sl = document.getElementById('current-control-status');
//     if (sl) {
//         sl.textContent = status;
//         sl.className = `badge ${status === 'Compliant' ? 'badge-success' : status === 'Non-Compliant' ? 'badge-danger' : 'badge-warning'}`;
//     }
//     const ev = document.getElementById('linked-evidence');
//     if (ev) ev.textContent = status !== 'Not Started' ? `Last audit: ${status} — ${score || 0}%` : 'No audit performed yet';
// }

// function updateDot(id, status) {
//     const item = document.querySelector(`.control-item[data-id="${id}"]`);
//     if (item) {
//         const dot = item.querySelector('.status-dot');
//         if (dot) dot.style.background = getDotColor(status);
//     }
// }

// function setMode(m) {
//     currentMode = m;
//     document.getElementById('audit-mode-btn').classList.toggle('active', m === 'audit');
//     document.getElementById('guide-mode-btn').classList.toggle('active', m === 'guide');
//     if (selectedControlInfo) selectControl(selectedControlInfo, document.querySelector(`.control-item[data-id="${currentControlId}"]`));
// }

// function appendMsg(role, txt) {
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div');
//     m.className = `message ${role}-message`;
//     m.innerHTML = `<div class="message-content"><div class="message-header">${role === 'ai' ? 'AI Auditor' : 'User'}</div><div class="message-text">${txt}</div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// function showTyping() {
//     const cm = document.getElementById('chat-messages');
//     const ind = document.createElement('div'); ind.id = 'typing-indicator'; ind.className = 'message ai-message';
//     ind.innerHTML = `<div class="message-content"><div class="message-text"><i class="fas fa-ellipsis-h fa-beat"></i> AI is working...</div></div>`;
//     cm.appendChild(ind); cm.scrollTop = cm.scrollHeight;
// }

// function hideTyping() { const el = document.getElementById('typing-indicator'); if (el) el.remove(); }

// async function handleUserMessage() {
//     const input = document.getElementById('user-query'), text = input.value.trim();
//     if (!text) return; if (!currentControlId) { appendMsg('ai', 'Please select a control first.'); return; }
//     appendMsg('user', text); input.value = ''; showTyping();
//     try {
//         const r = await callAIEngine(text, currentControlId, currentMode);
//         hideTyping(); appendMsg('ai', r.answer || 'No specific guidance available.');
//     } catch (e) { hideTyping(); appendMsg('ai', 'Error connecting to AI engine.'); }
// }

// // دالة مضافة لـ Guide Mode
// async function finishGuide() {
//     appendMsg('ai', `<em style="color:var(--text-muted);font-size:12px">Generating final recommendations...</em>`);
//     showTyping();
//     const answersText = auditAnswers.map((a,i) => `Q${i+1}: "${a.question}" => ${a.answer.toUpperCase()}`).join('\n');
//     try {
//         const r = await getAIRecommendations(currentControlId, answersText);
//         hideTyping();
//         if (r?.answer) {
//             let fmt = r.answer
//                 .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e2e8f0">$1</strong>')
//                 .replace(/^#{1,3}\s+(.+)$/gm, '<div style="font-size:15px;font-weight:700;color:#8b5cf6;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid rgba(139,92,246,0.2)">$1</div>')
//                 .replace(/^(\d+)\.\s+\*\*(.*?)\*\*/gm, '<div style="margin:12px 0 4px;display:flex;gap:8px;align-items:flex-start"><span style="background:rgba(6,182,212,0.15);color:#06b6d4;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">$1</span><strong style="color:#e2e8f0">$2</strong></div>')
//                 .replace(/^\s*-\s+\*\*(.*?)\*\*:\s*/gm, '<div style="margin:5px 0 2px;padding-left:16px"><span style="color:#06b6d4;font-weight:600;font-size:12px">▸ $1:</span> ')
//                 .replace(/^\s*-\s+/gm, '<div style="margin:3px 0;padding-left:16px;color:var(--text-secondary);font-size:13px">• ')
//                 .replace(/\n\n/g, '</div><br>')
//                 .replace(/\n/g, '</div>');
//             appendMsg('ai', `
//                 <div style="border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:24px;background:rgba(139,92,246,0.05)">
//                     <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(139,92,246,0.2)">
//                         <i class="fas fa-lightbulb" style="color:#8b5cf6;font-size:20px"></i>
//                         <strong style="font-size:16px;color:#8b5cf6">Recommendations — ${currentControlId}</strong>
//                     </div>
//                     <div style="font-size:13.5px;line-height:1.9;color:var(--text-secondary)">${fmt}</div>
//                     <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(139,92,246,0.2);display:flex;gap:12px">
//                         <a href="evidence.html?control=${currentControlId}" style="flex:1;text-align:center;background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;color:#8b5cf6;padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
//                             <i class="fas fa-folder-open" style="margin-right:6px"></i>Evidence Vault
//                         </a>

//                     </div>
//                 </div>`);
//             try {
//                 await saveAuditRecommendation({control_id:currentControlDbId, session_id:currentSessionId, gap_description:answersText, recommendation:r.answer, priority:'High'});
//             } catch(e) { console.error('[❌] Gap save error:', e); }
//         } else {
//             appendMsg('ai', 'Could not generate recommendations.');
//         }
//     } catch(e) {
//         hideTyping();
//         appendMsg('ai', `<span style="color:#ef4444">Error generating recommendations.</span>`);
//     }
//     setTimeout(() => showSubControlOptions(selectedControlInfo), 3000);
// }




// // CyberGuard ECC Chatbot v7 - WITH EVIDENCE SAVING
// // Saves completed audit sessions to evidence DB for review in evidence.html
// let currentMode='audit',currentControlId=null,currentControlDbId=null,currentQuestions=[],currentQuestionIndex=0,selectedControlInfo=null,currentSessionId=null,auditAnswers=[];
// const eccDomains=[
// {id:'1-1',title:'Cybersecurity Governance',domain:'Governance'},
// {id:'1-2',title:'Cybersecurity Risk Management',domain:'Risk'},
// {id:'1-3',title:'Cybersecurity Asset Management',domain:'Assets'},
// {id:'1-4',title:'Cybersecurity Operations',domain:'Operations'},
// {id:'1-5',title:'System & Network Hardening',domain:'Network'},
// {id:'1-6',title:'Identity & Access Management',domain:'Identity'},
// {id:'1-7',title:'Data Protection',domain:'Data'},
// {id:'1-8',title:'Vulnerability Management',domain:'Vulnerability'},
// {id:'1-9',title:'Incident Defense',domain:'Incident'},
// {id:'1-10',title:'Physical Security',domain:'Physical'}
// ];
// document.addEventListener('DOMContentLoaded',async()=>{
// if(!checkAuth())return;
// loadUserToSidebar();
// renderControlBrowser();
// document.getElementById('audit-mode-btn').addEventListener('click',()=>setMode('audit'));
// document.getElementById('guide-mode-btn').addEventListener('click',()=>setMode('guide'));
// document.getElementById('send-btn').addEventListener('click',handleUserMessage);
// document.getElementById('user-query').addEventListener('keypress',e=>{if(e.key==='Enter')handleUserMessage();});
// const res=JSON.parse(localStorage.getItem('audit_results')||'{}');
// Object.entries(res).forEach(([id,s])=>updateDot(id,s));
// const urlControl=new URLSearchParams(window.location.search).get('control');
// if(urlControl){setTimeout(()=>{const c=eccDomains.find(d=>d.id===urlControl);const el=document.querySelector(`.control-item[data-id="${urlControl}"]`);if(c&&el)selectControl(c,el);},100);}
// });
// function getDotColor(s){return s==='Compliant'?'#10b981':s==='Non-Compliant'?'#ef4444':s==='Partial'?'#f59e0b':'#475569';}
// function renderControlBrowser(){
// const b=document.getElementById('control-browser');if(!b)return;b.innerHTML='';
// const res=JSON.parse(localStorage.getItem('audit_results')||'{}');
// eccDomains.forEach(c=>{
// const item=document.createElement('div');item.className='control-item';item.dataset.id=c.id;
// item.innerHTML=`<div style="display:flex;align-items:center;gap:8px"><span class="status-dot" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${getDotColor(res[c.id]||'')}"></span><small style="color:var(--accent-primary);font-weight:600">${c.id}</small></div><div style="font-weight:500;font-size:13px;margin-top:3px;padding-left:16px">${c.title}</div>`;
// item.onclick=()=>selectControl(c,item);
// b.appendChild(item);
// });
// }
// async function selectControl(ctrl,el){
// document.querySelectorAll('.control-item').forEach(i=>i.classList.remove('selected'));
// el.classList.add('selected');
// currentControlId=ctrl.id;selectedControlInfo=ctrl;auditAnswers=[];currentSessionId=null;currentQuestions=[];currentQuestionIndex=0;
// try{const cs=await getAllControls();const m=cs.find(c=>c.control_id===ctrl.id);if(m)currentControlDbId=m.id;}catch(e){}
// document.getElementById('current-control-id').textContent=ctrl.id;
// document.getElementById('current-control-name').textContent=ctrl.title;
// document.getElementById('current-control-requirement').textContent=`ECC-2023 compliance assessment for ${ctrl.title}`;
// updateRightPanel(ctrl.id);
// document.getElementById('chat-messages').innerHTML='';
// if(currentMode==='audit')await startAuditMode(ctrl);else await startGuideMode(ctrl);
// }
// function updateRightPanel(id){
// const res=JSON.parse(localStorage.getItem('audit_results')||'{}'),sco=JSON.parse(localStorage.getItem('audit_scores')||'{}');
// const status=res[id]||'Not Started',score=sco[id];
// const sl=document.getElementById('current-control-status');
// sl.textContent=status;sl.className=`badge ${status==='Compliant'?'badge-success':status==='Non-Compliant'?'badge-danger':status==='Partial'?'badge-warning':'badge-info'}`;
// const ev=document.getElementById('linked-evidence');
// if(status!=='Not Started'){ev.textContent=`Last audit: ${status}${score!==undefined?' — '+score+'%':''}`;ev.style.color=getDotColor(status);}
// else{ev.textContent='No audit performed yet';ev.style.color='';}
// }
// async function startAuditMode(ctrl){
// try{const u=getCurrentUserLocal();const s=await startAuditSessionAPI(u.id,currentControlDbId,'audit');if(s?.session_id)currentSessionId=s.session_id;}catch(e){}
// appendMsg('ai',`<strong>Audit Session — ${ctrl.id}: ${ctrl.title}</strong><br><span style="font-size:12px;color:var(--text-muted)">Generating questions from ECC-2023...</span>`);
// showTyping();
// try{
// const r=await generateAuditQuestions(ctrl.id,'audit');hideTyping();
// if(r.questions?.length>0){currentQuestions=r.questions.map(q=>({q:q.question,ev:q.expected_evidence||'',cat:q.category||''}));currentQuestionIndex=0;setTimeout(showAuditQ,400);}
// else{appendMsg('ai',`<span style="color:#ef4444">Could not generate questions. Ensure ECC documents are indexed.</span>`);}
// }catch(e){hideTyping();appendMsg('ai',`<span style="color:#ef4444">AI error. Check backend.</span>`);}
// }
// function showAuditQ(){
// if(currentQuestionIndex>=currentQuestions.length){finishAudit();return;}
// const q=currentQuestions[currentQuestionIndex],num=currentQuestionIndex+1,total=currentQuestions.length,pct=Math.round((currentQuestionIndex/total)*100);
// const cm=document.getElementById('chat-messages'),m=document.createElement('div');m.className='message ai-message';
// m.innerHTML=`<div class="message-content"><div class="message-header">AI Auditor</div><div class="message-text"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:11px;color:var(--text-muted)">Question ${num} of ${total}</span>${q.cat?`<span style="font-size:11px;background:rgba(6,182,212,0.1);color:var(--accent-primary);padding:2px 10px;border-radius:20px">${q.cat}</span>`:''}</div><div style="width:100%;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;margin-bottom:14px"><div style="height:100%;width:${pct}%;background:var(--accent-primary);border-radius:2px;transition:width 0.4s"></div></div><p style="font-size:14px;line-height:1.7;margin-bottom:${q.ev?'8px':'16px'}">${q.q}</p>${q.ev?`<p style="font-size:11px;color:#f59e0b;margin-bottom:16px"><i class="fas fa-paperclip" style="margin-right:4px"></i>Required evidence: ${q.ev}</p>`:''}<div style="display:flex;gap:10px;flex-wrap:wrap"><button onclick="answerAudit('yes',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #10b981;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s"><i class="fas fa-check" style="margin-right:6px"></i>Yes</button><button onclick="answerAudit('partial',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.08);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s"><i class="fas fa-adjust" style="margin-right:6px"></i>Partial</button><button onclick="answerAudit('no',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #ef4444;background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s"><i class="fas fa-times" style="margin-right:6px"></i>No</button></div></div></div>`;
// cm.appendChild(m);cm.scrollTop=cm.scrollHeight;
// }
// async function answerAudit(ans,btn){
// btn.closest('div').querySelectorAll('button').forEach(b=>{b.disabled=true;b.style.opacity='0.35';});btn.style.opacity='1';btn.style.transform='scale(1.05)';
// const labels={yes:'Yes — Verified',partial:'Partial — Needs improvement',no:'No — Gap'};
// appendMsg('user',labels[ans]);
// auditAnswers.push({question:currentQuestions[currentQuestionIndex].q,answer:ans,evidence:currentQuestions[currentQuestionIndex].ev});
// if(currentSessionId){try{await saveAuditAnswer(currentSessionId,currentQuestions[currentQuestionIndex].q,ans);}catch(e){}}
// if(ans==='no')appendMsg('ai',`<span style="color:#ef4444"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>Gap identified.</span>`);
// else if(ans==='partial')appendMsg('ai',`<span style="color:#f59e0b"><i class="fas fa-info-circle" style="margin-right:6px"></i>Partial (50% weight).</span>`);
// currentQuestionIndex++;setTimeout(showAuditQ,ans==='yes'?400:900);
// }
// async function finishAudit(){
// const total=auditAnswers.length,yes=auditAnswers.filter(a=>a.answer==='yes').length,partial=auditAnswers.filter(a=>a.answer==='partial').length,no=auditAnswers.filter(a=>a.answer==='no').length;
// const score=total>0?Math.round(((yes+partial*0.5)/total)*100):0;
// const status=score>=80?'Compliant':score>=40?'Partial':'Non-Compliant';
// const color=score>=80?'#10b981':score>=40?'#f59e0b':'#ef4444';
// appendMsg('ai',`<div style="border:1px solid ${color}30;border-radius:12px;padding:24px;background:${color}08"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><strong style="font-size:16px">Audit Complete — ${currentControlId}</strong><span style="font-size:36px;font-weight:800;color:${color}">${score}%</span></div><div style="width:100%;height:10px;background:rgba(255,255,255,0.08);border-radius:5px;overflow:hidden;margin-bottom:20px"><div style="height:100%;width:${score}%;background:${color};border-radius:5px;transition:width 1.2s ease"></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px"><div style="text-align:center;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:14px"><div style="font-size:28px;font-weight:800;color:#10b981">${yes}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">YES</div></div><div style="text-align:center;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:14px"><div style="font-size:28px;font-weight:800;color:#f59e0b">${partial}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">PARTIAL</div></div><div style="text-align:center;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:14px"><div style="font-size:28px;font-weight:800;color:#ef4444">${no}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">NO</div></div></div><div style="text-align:center;margin-bottom:16px"><span style="background:${color}18;border:1.5px solid ${color};color:${color};padding:8px 24px;border-radius:24px;font-size:14px;font-weight:700;text-transform:uppercase">${status}</span></div><a href="evidence.html?control=${currentControlId}&status=${status}&score=${score}" style="display:block;text-align:center;background:rgba(6,182,212,0.1);border:1px solid var(--accent-primary);color:var(--accent-primary);padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600"><i class="fas fa-folder-open" style="margin-right:6px"></i>View in Evidence Repository</a></div>`);
// await saveProgress(currentControlId,status,score,yes,partial,no,total);
// // ✅ SAVE AUDIT SESSION TO EVIDENCE DB
// await saveAuditToEvidence(currentControlId, selectedControlInfo?.title||currentControlId, status, score, auditAnswers, currentSessionId, currentControlDbId);
// }
// // ===================================
// // SAVE AUDIT TO EVIDENCE DATABASE
// // ===================================
// async function saveAuditToEvidence(controlId, controlTitle, status, score, answers, sessionId, controlDbId){
// try{
// // Build a readable audit transcript
// const transcript = answers.map((a,i)=>{
// const icon = a.answer==='yes'?'✅':a.answer==='partial'?'⚠️':'❌';
// return `Q${i+1}: ${a.question}\nAnswer: ${icon} ${a.answer.toUpperCase()}${a.evidence?'\nEvidence required: '+a.evidence:''}`;
// }).join('\n\n');
// const summary = `AUDIT REPORT — Control ${controlId}: ${controlTitle}\nDate: ${new Date().toLocaleString()}\nFinal Status: ${status}\nCompliance Score: ${score}%\n\nSession ID: ${sessionId||'N/A'}\n\n${'='.repeat(50)}\nQUESTIONS & ANSWERS\n${'='.repeat(50)}\n\n${transcript}`;
// // Save as evidence record via API
// await apiRequest('/evidence/save-audit', {
// method: 'POST',
// body: JSON.stringify({
// control_id: controlDbId,
// session_id: sessionId,
// title: `Audit Report — ${controlId}: ${controlTitle}`,
// description: summary,
// status: status,
// score: score,
// answers: answers,
// evidence_type: 'audit_session'
// })
// });
// console.log(`[✅] Audit saved to evidence DB for ${controlId}`);
// } catch(e){
// // Fallback: save to localStorage so evidence.html can still show it
// console.warn('[⚠️] Could not save to evidence API, saving locally:', e);
// const key = `audit_session_${controlId}_${Date.now()}`;
// const sessions = JSON.parse(localStorage.getItem('audit_sessions_log')||'[]');
// sessions.unshift({
// id: key,
// control_id: controlId,
// control_title: controlTitle,
// status,
// score,
// answers,
// session_id: sessionId,
// created_at: new Date().toISOString()
// });
// // Keep last 50 sessions
// localStorage.setItem('audit_sessions_log', JSON.stringify(sessions.slice(0,50)));
// }
// }
// async function startGuideMode(ctrl){
// try{
// const cs=await getAllControls();
// const m=cs.find(c=>c.control_id===ctrl.id);
// if(m)currentControlDbId=m.id;
// const u=getCurrentUserLocal();
// const uid=u.id||u.user_id||parseInt(localStorage.getItem('authToken')?.match(/token_(\d+)_/)?.[1])||null;
// const s=await startAuditSessionAPI(uid,currentControlDbId,'guide');
// if(s?.session_id)currentSessionId=s.session_id;
// }catch(e){}
// appendMsg('ai',`<strong>Guide Mode — ${ctrl.id}: ${ctrl.title}</strong><br>Assessing readiness...<br><span style="font-size:12px;color:var(--text-muted)">Preparing questions...</span>`);
// showTyping();
// try{const r=await generateAuditQuestions(ctrl.id,'guide');hideTyping();if(r.questions?.length>0){currentQuestions=r.questions.map(q=>({q:q.question,purpose:q.purpose||''}));currentQuestionIndex=0;auditAnswers=[];setTimeout(showGuideQ,400);}else{appendMsg('ai',`<span style="color:#ef4444">Could not generate questions.</span>`);}
// }catch(e){hideTyping();appendMsg('ai',`<span style="color:#ef4444">AI error.</span>`);}
// }
// function showGuideQ(){
// if(currentQuestionIndex>=currentQuestions.length){finishGuide();return;}
// const q=currentQuestions[currentQuestionIndex],num=currentQuestionIndex+1,total=currentQuestions.length;
// const cm=document.getElementById('chat-messages'),m=document.createElement('div');m.className='message ai-message';
// m.innerHTML=`<div class="message-content"><div class="message-header">AI Guide</div><div class="message-text"><p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Question ${num} of ${total}</p><p style="font-size:14px;line-height:1.7;margin-bottom:16px">${q.q}</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button onclick="answerGuide('yes',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #10b981;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-check" style="margin-right:6px"></i>Yes</button><button onclick="answerGuide('partial',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.08);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-adjust" style="margin-right:6px"></i>Partial</button><button onclick="answerGuide('no',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #ef4444;background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-times" style="margin-right:6px"></i>No</button></div></div></div>`;
// cm.appendChild(m);cm.scrollTop=cm.scrollHeight;
// }
// function answerGuide(ans,btn){
// btn.closest('div').querySelectorAll('button').forEach(b=>{b.disabled=true;b.style.opacity='0.35';});btn.style.opacity='1';btn.style.fontWeight='800';
// const labels={yes:'Yes',partial:'Partial',no:'No'};
// appendMsg('user',labels[ans]);
// auditAnswers.push({question:currentQuestions[currentQuestionIndex].q,answer:ans});
// currentQuestionIndex++;setTimeout(showGuideQ,400);
// }
// async function finishGuide(){
// appendMsg('ai',`<em style="color:var(--text-muted);font-size:12px">Generating recommendations...</em>`);
// showTyping();
// const answersText=auditAnswers.map((a,i)=>`Q${i+1}: "${a.question}" => ${a.answer.toUpperCase()}`).join('\n');
// try{
// const r=await getAIRecommendations(currentControlId,answersText);hideTyping();
// if(r?.answer){
// let fmt=r.answer.replace(/\*\*(.*?)\*\*/g,'<strong style="color:#8b5cf6">$1</strong>').replace(/^(#{1,3})\s+(.+)$/gm,'<h3 style="color:#8b5cf6;margin:16px 0 8px;font-size:15px">$2</h3>').replace(/^(\d+\.)\s+/gm,'<br><strong style="color:#06b6d4">$1</strong> ').replace(/^[-•]\s+/gm,'<br>• ').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
// appendMsg('ai',`<div style="border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:24px;background:rgba(139,92,246,0.05)"><div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(139,92,246,0.2)"><i class="fas fa-lightbulb" style="color:#8b5cf6;font-size:20px"></i><strong style="font-size:16px;color:#8b5cf6">Recommendations — ${currentControlId}</strong></div><div style="font-size:13.5px;line-height:1.9;color:var(--text-secondary)">${fmt}</div><div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(139,92,246,0.2);display:flex;gap:12px"><a href="evidence.html?control=${currentControlId}" style="flex:1;text-align:center;background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;color:#8b5cf6;padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600"><i class="fas fa-folder-open" style="margin-right:6px"></i>Evidence Vault</a><button onclick="window.print()" style="flex:0.4;background:rgba(6,182,212,0.1);border:1px solid #06b6d4;color:#06b6d4;padding:12px;border-radius:8px;cursor:pointer;font-size:13px"><i class="fas fa-print"></i> Print</button></div></div>`);
// try{console.log('[DEBUG] Saving gap:', {control_id:currentControlDbId, session_id:currentSessionId});await saveAuditRecommendation({control_id:currentControlDbId,session_id:currentSessionId,gap_description:answersText,recommendation:r.answer,priority:'High'});console.log('[✅] Gap saved');}catch(e){console.error('[❌] Gap error:', e);}
// }else{appendMsg('ai','Could not generate recommendations.');}
// }catch(e){hideTyping();appendMsg('ai',`<span style="color:#ef4444">Error.</span>`);}
// }
// async function saveProgress(ctrlId,status,score,yes,partial,no,total){
// const sl=document.getElementById('current-control-status');
// sl.textContent=status;sl.className=`badge ${status==='Compliant'?'badge-success':status==='Non-Compliant'?'badge-danger':'badge-warning'}`;
// const res=JSON.parse(localStorage.getItem('audit_results')||'{}');res[ctrlId]=status;localStorage.setItem('audit_results',JSON.stringify(res));
// const sco=JSON.parse(localStorage.getItem('audit_scores')||'{}');sco[ctrlId]=score;localStorage.setItem('audit_scores',JSON.stringify(sco));
// updateDot(ctrlId,status);
// const ev=document.getElementById('linked-evidence');ev.textContent=`Last audit: ${status} — ${score}%`;ev.style.color=getDotColor(status);
// try{await updateControlStatus(ctrlId,status);}catch(e){}
// try{const u=getCurrentUserLocal();const uid=u.id||u.user_id||parseInt(localStorage.getItem('authToken')?.match(/token_(\d+)_/)?.[1])||null;await saveComplianceScore({user_id:uid,control_id:currentControlDbId,session_id:currentSessionId,score,total_questions:total,answered_yes:yes,answered_partial:partial,answered_no:no});}catch(e){}
// if(currentSessionId){try{await completeAuditSession(currentSessionId,status,score);}catch(e){}}
// }
// function updateDot(id,status){const item=document.querySelector(`.control-item[data-id="${id}"]`);if(!item)return;const dot=item.querySelector('.status-dot');if(dot)dot.style.background=getDotColor(status);}
// async function handleUserMessage(){
// const input=document.getElementById('user-query'),text=input.value.trim();
// if(!text)return;if(!currentControlId){appendMsg('ai','Select a control first.');return;}
// appendMsg('user',text);input.value='';const lid=appendLoading();
// try{const r=await callAIEngine(text,currentControlId,currentMode==='guide'?'guidance':currentMode);updateLoading(lid,(r.answer||'No answer.').replace(/\n/g,'<br>'));}
// catch(e){updateLoading(lid,`<span style="color:#ef4444">AI error.</span>`);}
// }
// function showTyping(){
// const cm=document.getElementById('chat-messages');if(document.getElementById('typing-indicator'))return;
// const ind=document.createElement('div');ind.id='typing-indicator';ind.className='message ai-message';
// ind.innerHTML=`<div class="message-cont`

