// ================================================================
// CyberGuard ECC Chatbot - INTEGRATED API VERSION (v10.0)
// ================================================================

// --- 1. Variables & State Management ---
let currentMode = 'audit', 
    currentControlId = null, 
    currentQuestions = [], 
    currentQuestionIndex = 0, 
    selectedControlInfo = null, 
    currentSessionId = null, 
    auditAnswers = [];

let chatHistory = {}; // الذاكرة لفصل الـ Audit عن الـ Guide

const eccDomains = [
    { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
    { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
    { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
    { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
    { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] },
    { id: '1-6', title: 'Cybersecurity in IT Project Management', subControls: ['1-6-1', '1-6-2-1', '1-6-2-2', '1-6-3-1', '1-6-3-2', '1-6-3-3', '1-6-3-4', '1-6-3-5', '1-6-4'] },
    { id: '1-7', title: 'Compliance with Standards & Laws', subControls: ['1-7-1', '1-7-2'] },
    { id: '1-8', title: 'Periodical Review and Audit', subControls: ['1-8-1', '1-8-2', '1-8-3'] },
    { id: '1-9', title: 'Cybersecurity in Human Resources', subControls: ['1-9-1', '1-9-2', '1-9-3-1', '1-9-3-2', '1-9-4-1', '1-9-4-2', '1-9-5', '1-9-6'] },
    { id: '1-10', title: 'Awareness and Training Program', subControls: ['1-10-1', '1-10-2', '1-10-3-1', '1-10-3-2', '1-10-3-3', '1-10-3-4', '1-10-4-1', '1-10-4-2', '1-10-4-3', '1-10-5'] }
];

// --- 2. Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;
    loadUserToSidebar();
    renderControlBrowser();
    
    // Mode Switchers
    document.getElementById('audit-mode-btn')?.addEventListener('click', () => setMode('audit'));
    document.getElementById('guide-mode-btn')?.addEventListener('click', () => setMode('guide'));
    
    // Chat Inputs
    document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
    document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

    addClearChatButton();
});

// --- 3. Mode & Selection Logic ---

function setMode(m) {
    if (currentMode === m) return;
    saveToHistory();
    currentMode = m;
    
    // UI Update
    document.getElementById('audit-mode-btn')?.classList.toggle('active', m === 'audit');
    document.getElementById('guide-mode-btn')?.classList.toggle('active', m === 'guide');
    
    if (currentControlId) {
        loadFromHistory(`${currentMode}_${currentControlId}`);
    }
}

async function selectControl(ctrl, el) {
    saveToHistory();
    
    document.querySelectorAll('.control-item').forEach(i => i.classList.remove('selected'));
    if (el) el.classList.add('selected');
    
    currentControlId = ctrl.id;
    selectedControlInfo = ctrl;
    
    document.getElementById('current-control-id').textContent = ctrl.id;
    document.getElementById('current-control-name').textContent = ctrl.title;
    
    loadFromHistory(`${currentMode}_${ctrl.id}`);
    updateRightPanel(ctrl.id);
}

function saveToHistory() {
    if (currentControlId) {
        const key = `${currentMode}_${currentControlId}`;
        chatHistory[key] = {
            html: document.getElementById('chat-messages').innerHTML,
            index: currentQuestionIndex,
            questions: [...currentQuestions],
            answers: [...auditAnswers],
            sessionId: currentSessionId
        };
    }
}

function loadFromHistory(key) {
    const cm = document.getElementById('chat-messages');
    if (chatHistory[key] && chatHistory[key].html) {
        const h = chatHistory[key];
        cm.innerHTML = h.html;
        currentQuestionIndex = h.index;
        currentQuestions = h.questions;
        auditAnswers = h.answers;
        currentSessionId = h.sessionId;
        
        if (currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
            if (!document.querySelector('.session-recovery-box')) offerSessionOptions(selectedControlInfo);
        }
    } else {
        cm.innerHTML = '';
        currentQuestionIndex = 0; currentQuestions = []; auditAnswers = [];
        showSubControlOptions(selectedControlInfo);
    }
    cm.scrollTop = cm.scrollHeight;
}

// --- 4. Audit/Guide Flow ---

function showAuditQ() {
    if (currentQuestionIndex >= currentQuestions.length) {
        currentMode === 'audit' ? finishAudit() : finishGuide();
        return;
    }
    
    const q = currentQuestions[currentQuestionIndex];
    const cm = document.getElementById('chat-messages');
    const m = document.createElement('div');
    m.className = 'message ai-message';
    m.innerHTML = `
        <div class="message-content">
            <div class="message-header">${currentMode === 'audit' ? 'AI Auditor' : 'AI Guide'}</div>
            <div class="message-text">
                <p style="font-size:11px; color:var(--text-muted)">Question ${currentQuestionIndex + 1} of ${currentQuestions.length}</p>
                <p style="margin:10px 0">${q.q}</p>
                <div class="btn-group" style="display:flex; gap:8px;">
                    <button onclick="answerAudit('yes', this)" style="border:1px solid #10b981; color:#10b981; background:none; padding:6px 15px; border-radius:6px; cursor:pointer;">Yes</button>
                    <button onclick="answerAudit('partial', this)" style="border:1px solid #f59e0b; color:#f59e0b; background:none; padding:6px 15px; border-radius:6px; cursor:pointer;">Partial</button>
                    <button onclick="answerAudit('no', this)" style="border:1px solid #ef4444; color:#ef4444; background:none; padding:6px 15px; border-radius:6px; cursor:pointer;">No</button>
                </div>
            </div>
        </div>`;
    cm.appendChild(m);
    cm.scrollTop = cm.scrollHeight;
}

async function answerAudit(ans, btn) {
    disableAllPreviousButtons();
    appendMsg('user', ans.toUpperCase());
    
    const currentQText = currentQuestions[currentQuestionIndex].q;
    auditAnswers.push({ question: currentQText, answer: ans });
    
    // API Call: Save Answer
    if (currentSessionId) {
        saveAuditAnswer(currentSessionId, currentQText, ans);
    }
    
    currentQuestionIndex++;
    saveToHistory();
    setTimeout(showAuditQ, 600);
}

async function finishAudit() {
    const total = auditAnswers.length;
    const yes = auditAnswers.filter(a => a.answer === 'yes').length;
    const partial = auditAnswers.filter(a => a.answer === 'partial').length;
    const score = Math.round(((yes + (partial * 0.5)) / total) * 100);
    const status = score >= 90 ? 'Compliant' : score >= 50 ? 'Partial' : 'Non-Compliant';

    appendMsg('ai', `
        <div style="background:rgba(16,185,129,0.05); padding:15px; border-radius:10px; border:1px solid #10b98133;">
            <h4 style="color:#10b981">Assessment Complete</h4>
            <p>Status: <strong>${status}</strong> | Compliance: <strong>${score}%</strong></p>
            <button onclick="showSubControlOptions(selectedControlInfo)" style="width:100%; margin-top:10px; padding:8px; background:#10b981; color:white; border:none; border-radius:5px; cursor:pointer;">New Sub-Control</button>
        </div>
    `);
    
    // API Call: Complete Session
    if (currentSessionId) {
        await completeAuditSession(currentSessionId, status, score);
    }
    
    // Update Sidebar UI
    const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
    res[currentControlId] = status;
    localStorage.setItem('audit_results', JSON.stringify(res));
    renderControlBrowser();
}

async function finishGuide() {
    showTyping();
    const answersText = auditAnswers.map(a => `${a.question}: ${a.answer}`).join('\n');
    try {
        // API Call: Recommendations
        const r = await getAIRecommendations(currentControlId, answersText);
        hideTyping();
        appendMsg('ai', `
            <div style="background:rgba(139,92,246,0.05); padding:15px; border-radius:10px; border:1px solid #8b5cf633;">
                <h4 style="color:#8b5cf6"><i class="fas fa-lightbulb"></i> AI Recommendations</h4>
                <div style="font-size:13px; line-height:1.6; margin:10px 0;">${r.answer || r.recommendations || 'Analysis complete.'}</div>
                <button onclick="showSubControlOptions(selectedControlInfo)" style="width:100%; padding:8px; background:#8b5cf6; color:white; border:none; border-radius:5px; cursor:pointer;">Continue</button>
            </div>
        `);
    } catch (e) { hideTyping(); }
}

// --- 5. UI Helpers ---

function appendMsg(role, txt) {
    const cm = document.getElementById('chat-messages');
    const m = document.createElement('div');
    m.className = `message ${role}-message`;
    const title = role === 'ai' ? (currentMode === 'audit' ? 'AI Auditor' : 'AI Guide') : 'User';
    m.innerHTML = `<div class="message-content"><div class="message-header">${title}</div><div class="message-text">${txt}</div></div>`;
    cm.appendChild(m);
    cm.scrollTop = cm.scrollHeight;
    saveToHistory();
}

function showSubControlOptions(ctrl) {
    const btns = ctrl.subControls.map(subId => `
        <button onclick="initiateSubAudit('${subId}')" style="padding:8px 12px; border:1px solid var(--accent-primary); background:none; color:var(--accent-primary); border-radius:6px; cursor:pointer; font-weight:600;">Control ${subId}</button>
    `).join('');
    
    const cm = document.getElementById('chat-messages');
    const m = document.createElement('div');
    m.className = 'message ai-message';
    m.innerHTML = `<div class="message-content"><div class="message-header">${currentMode === 'audit' ? 'AI Auditor' : 'AI Guide'}</div><div class="message-text">Please select a sub-control for ${currentMode}:<br><div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">${btns}</div></div></div>`;
    cm.appendChild(m);
    cm.scrollTop = cm.scrollHeight;
}

async function initiateSubAudit(subId) {
    disableAllPreviousButtons();
    appendMsg('user', `Starting: ${subId}`);
    showTyping();
    try {
        // API Call: Questions
        const r = await generateAuditQuestions(subId, currentMode);
        hideTyping();
        if (r.questions) {
            currentQuestions = r.questions.map(q => ({ q: q.question || q }));
            currentQuestionIndex = 0;
            const user = getCurrentUserLocal();
            // API Call: Session Start
            const s = await startAuditSessionAPI(user.id || user.user_id, subId, currentMode);
            currentSessionId = s.session_id || s.id;
            showAuditQ();
        }
    } catch (e) { hideTyping(); }
}

function showTyping() {
    const cm = document.getElementById('chat-messages');
    const t = document.createElement('div'); t.id = 'typing'; t.className = 'message ai-message';
    t.innerHTML = '<div class="message-text"><i class="fas fa-ellipsis-h fa-beat"></i> AI is thinking...</div>';
    cm.appendChild(t); cm.scrollTop = cm.scrollHeight;
}
function hideTyping() { document.getElementById('typing')?.remove(); }

function disableAllPreviousButtons() {
    document.querySelectorAll('.ai-message button').forEach(b => {
        b.disabled = true; b.style.opacity = '0.5'; b.style.pointerEvents = 'none';
    });
}

function renderControlBrowser() {
    const b = document.getElementById('control-browser');
    if (!b) return;
    const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
    b.innerHTML = eccDomains.map(c => `
        <div class="control-item" onclick='selectControl(${JSON.stringify(c)}, this)' data-id="${c.id}">
            <span class="status-dot" style="background:${getDotColor(res[c.id])}"></span>
            <div class="control-info">
                <strong>${c.id}</strong>
                <span>${c.title}</span>
            </div>
        </div>
    `).join('');
}

function getDotColor(s) {
    if (s === 'Compliant') return '#10b981';
    if (s === 'Partial') return '#f59e0b';
    if (s === 'Non-Compliant') return '#ef4444';
    return '#475569';
}

function updateRightPanel(id) {
    const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
    const status = res[id] || 'Not Started';
    const el = document.getElementById('current-control-status');
    if (el) {
        el.textContent = status;
        el.className = `badge badge-${status.replace(' ', '').toLowerCase()}`;
    }
}

async function handleUserMessage() {
    const input = document.getElementById('user-query'), text = input.value.trim();
    if (!text || !currentControlId) return;
    appendMsg('user', text); input.value = ''; showTyping();
    try {
        // API Call: Process Message
        const r = await callAIEngine(text, currentControlId, currentMode);
        hideTyping();
        appendMsg('ai', r.answer || r.response || 'I processed your request.');
    } catch (e) { hideTyping(); }
}

function addClearChatButton() {
    const header = document.querySelector('.chat-header');
    if (!header || document.getElementById('clear-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'clear-btn'; btn.innerHTML = '<i class="fas fa-trash"></i>';
    btn.style = "background:none; border:none; color:var(--text-muted); cursor:pointer;";
    btn.onclick = () => {
        if(confirm('Clear history?')) {
            chatHistory[`${currentMode}_${currentControlId}`] = null;
            document.getElementById('chat-messages').innerHTML = '';
            showSubControlOptions(selectedControlInfo);
        }
    };
    header.appendChild(btn);
}

function offerSessionOptions(ctrl) {
    const cm = document.getElementById('chat-messages');
    const m = document.createElement('div');
    m.className = 'message ai-message session-recovery-box';
    m.innerHTML = `
        <div class="message-content"><div class="message-text">
            <p>Restore pending <strong>${currentMode}</strong> session for ${ctrl.id}?</p>
            <div style="margin-top:10px">
                <button onclick="resumeSession()" style="background:var(--accent-primary); color:white; border:none; padding:5px 15px; border-radius:4px; cursor:pointer;">Resume</button>
                <button onclick="resetToSubControls()" style="background:none; border:1px solid #333; color:white; margin-left:10px; padding:5px 15px; border-radius:4px; cursor:pointer;">New</button>
            </div>
        </div></div>`;
    cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
}

function resumeSession() {
    document.querySelector('.session-recovery-box')?.remove();
    showAuditQ();
}



// // ================================================================
// // CyberGuard ECC Chatbot - FINAL MODE-SEPARATION EDITION (v8.7)
// // ================================================================

// let currentMode = 'audit', 
//     currentControlId = null, 
//     currentControlDbId = null, 
//     currentQuestions = [], 
//     currentQuestionIndex = 0, 
//     selectedControlInfo = null, 
//     currentSessionId = null, 
//     auditAnswers = [];

// // ذاكرة الجلسة: مفاتيح مركبة للفصل التام
// let chatHistory = {};

// const eccDomains = [
//     { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
//     { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
//     { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
//     { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
//     { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] },
//     { id: '1-6', title: 'Cybersecurity in IT Project Management', subControls: ['1-6-1', '1-6-2-1', '1-6-2-2', '1-6-3-1', '1-6-3-2', '1-6-3-3', '1-6-3-4', '1-6-3-5', '1-6-4'] },
//     { id: '1-7', title: 'Compliance with Standards & Laws', subControls: ['1-7-1', '1-7-2'] },
//     { id: '1-8', title: 'Periodical Review and Audit', subControls: ['1-8-1', '1-8-2', '1-8-3'] },
//     { id: '1-9', title: 'Cybersecurity in Human Resources', subControls: ['1-9-1', '1-9-2', '1-9-3-1', '1-9-3-2', '1-9-4-1', '1-9-4-2', '1-9-5', '1-9-6'] },
//     { id: '1-10', title: 'Awareness and Training Program', subControls: ['1-10-1', '1-10-2', '1-10-3-1', '1-10-3-2', '1-10-3-3', '1-10-3-4', '1-10-4-1', '1-10-4-2', '1-10-4-3', '1-10-5'] }
// ];

// document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkAuth()) return;
//     loadUserToSidebar();
//     renderControlBrowser();
    
//     document.getElementById('audit-mode-btn')?.addEventListener('click', () => setMode('audit'));
//     document.getElementById('guide-mode-btn')?.addEventListener('click', () => setMode('guide'));
//     document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
//     document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

//     addClearChatButton();
// });

// // --- Core Navigation & Mode Logic ---

// function setMode(m) {
//     if (currentMode === m) return;

//     // 1. حفظ حالة المود الحالي "قبل" التبديل
//     if (currentControlId) {
//         const oldKey = `${currentMode}_${currentControlId}`;
//         chatHistory[oldKey] = {
//             html: document.getElementById('chat-messages').innerHTML,
//             index: currentQuestionIndex,
//             questions: [...currentQuestions],
//             answers: [...auditAnswers],
//             sessionId: currentSessionId
//         };
//     }

//     // 2. تحديث المود وتغيير شكل الأزرار
//     currentMode = m;
//     document.getElementById('audit-mode-btn')?.classList.toggle('active', m === 'audit');
//     document.getElementById('guide-mode-btn')?.classList.toggle('active', m === 'guide');
    
//     // 3. إعادة تحميل المحتوى بناءً على المود الجديد لنفس الضابط
//     if (selectedControlInfo) {
//         const item = document.querySelector(`.control-item[data-id="${currentControlId}"]`);
//         loadControlState(selectedControlInfo, item);
//     }
// }

// async function selectControl(ctrl, el) {
//     // حفظ الحالة للقديم
//     if (currentControlId) {
//         const oldKey = `${currentMode}_${currentControlId}`;
//         chatHistory[oldKey] = {
//             html: document.getElementById('chat-messages').innerHTML,
//             index: currentQuestionIndex,
//             questions: [...currentQuestions],
//             answers: [...auditAnswers],
//             sessionId: currentSessionId
//         };
//     }
//     loadControlState(ctrl, el);
// }

// function loadControlState(ctrl, el) {
//     // تحديث الواجهة الجانبية
//     document.querySelectorAll('.control-item').forEach(i => i.classList.remove('selected'));
//     if (el) el.classList.add('selected');
    
//     currentControlId = ctrl.id;
//     selectedControlInfo = ctrl;

//     const cm = document.getElementById('chat-messages');
//     const currentKey = `${currentMode}_${ctrl.id}`;
    
//     // استعادة البيانات من الذاكرة بناءً على المود + الضابط
//     if (chatHistory[currentKey] && chatHistory[currentKey].html) {
//         const h = chatHistory[currentKey];
//         cm.innerHTML = h.html;
//         currentQuestionIndex = h.index;
//         currentQuestions = h.questions;
//         auditAnswers = h.answers;
//         currentSessionId = h.sessionId;

//         // التحقق من وجود جلسة غير مكتملة
//         if (currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
//             if (!document.querySelector('.session-recovery-box')) offerSessionOptions(ctrl);
//         }
//     } else {
//         // إذا لم توجد بيانات لهذا المود (بداية نظيفة)
//         cm.innerHTML = '';
//         currentQuestionIndex = 0;
//         currentQuestions = [];
//         auditAnswers = [];
//         showSubControlOptions(ctrl);
//     }

//     document.getElementById('current-control-id').textContent = ctrl.id;
//     document.getElementById('current-control-name').textContent = ctrl.title;
//     updateRightPanel(ctrl.id);
//     cm.scrollTop = cm.scrollHeight;
// }

// // --- Chat & Messages ---

// function appendMsg(role, txt) {
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div');
//     m.className = `message ${role}-message`;
//     const aiTitle = currentMode === 'audit' ? 'AI Auditor' : 'AI Guide';
    
//     m.innerHTML = `<div class="message-content">
//         <div class="message-header">${role === 'ai' ? aiTitle : 'User'}</div>
//         <div class="message-text">${txt}</div>
//     </div>`;
    
//     cm.appendChild(m); 
//     cm.scrollTop = cm.scrollHeight;
    
//     // التحديث الفوري للذاكرة
//     if (currentControlId) {
//         const key = `${currentMode}_${currentControlId}`;
//         if (!chatHistory[key]) chatHistory[key] = { index: 0, html: "" };
//         chatHistory[key].html = cm.innerHTML;
//     }
// }

// // --- Audit Flow Functions ---

// function showAuditQ() {
//     if (currentQuestionIndex >= currentQuestions.length) {
//         if (currentMode === 'audit') finishAudit(); else finishGuide();
//         return;
//     }
//     const q = currentQuestions[currentQuestionIndex];
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div'); 
//     m.className = 'message ai-message';
//     m.innerHTML = `
//         <div class="message-content"><div class="message-header">${currentMode === 'audit' ? 'AI Auditor' : 'AI Guide'}</div><div class="message-text">
//             <p style="font-size:11px;color:var(--text-muted)">Question ${currentQuestionIndex+1} of ${currentQuestions.length}</p>
//             <p style="margin:10px 0">${q.q}</p>
//             <div style="display:flex;gap:10px;">
//                 <button onclick="answerAudit('yes',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #10b981;color:#10b981;cursor:pointer;background:none">Yes</button>
//                 <button onclick="answerAudit('partial',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #f59e0b;color:#f59e0b;cursor:pointer;background:none">Partial</button>
//                 <button onclick="answerAudit('no',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #ef4444;color:#ef4444;cursor:pointer;background:none">No</button>
//             </div>
//         </div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// async function answerAudit(ans, btn) {
//     btn.closest('div').querySelectorAll('button').forEach(b => { 
//         b.disabled = true; b.style.opacity = '0.35'; b.style.cursor = 'not-allowed';
//     });
//     btn.style.opacity = '1';
    
//     const labels = { yes: 'Yes — Verified', partial: 'Partial — Needs improvement', no: 'No — Gap' };
//     appendMsg('user', labels[ans]);
    
//     auditAnswers.push({ question: currentQuestions[currentQuestionIndex].q, answer: ans });
//     currentQuestionIndex++; 
    
//     if (currentControlId) {
//         const key = `${currentMode}_${currentControlId}`;
//         chatHistory[key].index = currentQuestionIndex;
//         chatHistory[key].html = document.getElementById('chat-messages').innerHTML;
//     }

//     if (currentSessionId) {
//         try { await saveAuditAnswer(currentSessionId, currentQuestions[currentQuestionIndex-1].q, ans); } catch (e) {}
//     }
//     setTimeout(showAuditQ, 500);
// }

// // --- Rest of Helper Functions (Unchanged) ---

// function showSubControlOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message';
//     let btns = ctrl.subControls.map(subId => `
//         <button onclick="initiateSubAudit('${subId}')" style="padding:10px 14px; border:1px solid var(--accent-primary); background:rgba(6,182,212,0.05); color:var(--accent-primary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; margin-bottom:5px;">
//             Control ${subId}
//         </button>
//     `).join('');

//     m.innerHTML = `<div class="message-content"><div class="message-header">${currentMode === 'audit' ? 'AI Auditor' : 'AI Guide'}</div><div class="message-text">
//         <p style="margin-bottom:15px">Mode: <strong>${currentMode.toUpperCase()}</strong>. Select sub-control:</p>
//         <div style="display:flex; gap:10px; flex-wrap:wrap;">${btns}</div></div></div>`;
//     cm.appendChild(m);
//     cm.scrollTop = cm.scrollHeight;
// }

// async function initiateSubAudit(subId) {
//     disableAllPreviousButtons();
//     appendMsg('user', `Starting ${currentMode} for: ${subId}`);
//     showTyping();
//     try {
//         const r = await generateAuditQuestions(subId, currentMode);
//         hideTyping();
//         if (r.questions?.length > 0) {
//             currentQuestions = r.questions.map(q => ({ q: q.question, ev: q.expected_evidence || '', cat: subId }));
//             currentQuestionIndex = 0;
//             const u = getCurrentUserLocal();
//             const s = await startAuditSessionAPI(u.id, null, currentMode);
//             if(s?.session_id) currentSessionId = s.session_id;
//             setTimeout(showAuditQ, 400);
//         }
//     } catch (e) { hideTyping(); }
// }

// function offerSessionOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message session-recovery-box';
//     m.innerHTML = `
//         <div class="message-content"><div class="message-header">Restore Session</div><div class="message-text">
//             <p>Found a pending <strong>${currentMode}</strong> session for ${ctrl.id}.</p>
//             <button onclick="resumeAudit()" style="background:var(--accent-primary);color:white;padding:8px 15px;border-radius:6px;cursor:pointer;border:none;margin-top:10px">Resume</button>
//             <button onclick="resetToSubControls()" style="background:none;color:white;padding:8px 15px;border-radius:6px;cursor:pointer;border:1px solid #333;margin-left:10px">Restart</button>
//         </div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// function resumeAudit() {
//     disableAllPreviousButtons();
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
//     if (currentControlId) {
//         const key = `${currentMode}_${currentControlId}`;
//         chatHistory[key].html = document.getElementById('chat-messages').innerHTML;
//     }
//     setTimeout(showAuditQ, 400);
// }

// function resetToSubControls() {
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
//     showSubControlOptions(selectedControlInfo);
// }

// function addClearChatButton() {
//     const chatHeader = document.querySelector('.chat-header');
//     if (!chatHeader || document.getElementById('clear-chat-btn')) return;
//     const clearBtn = document.createElement('button');
//     clearBtn.id = 'clear-chat-btn';
//     clearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear';
//     clearBtn.style = "background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:600;";
//     clearBtn.onclick = clearCurrentChat;
//     chatHeader.appendChild(clearBtn);
// }

// function clearCurrentChat() {
//     if (!currentControlId) return;
//     if (confirm(`Clear this ${currentMode} session?`)) {
//         const key = `${currentMode}_${currentControlId}`;
//         chatHistory[key] = null;
//         document.getElementById('chat-messages').innerHTML = '';
//         showSubControlOptions(selectedControlInfo);
//     }
// }

// function disableAllPreviousButtons() {
//     document.querySelectorAll('.ai-message button').forEach(btn => {
//         btn.disabled = true;
//         btn.style.opacity = '0.5';
//         btn.removeAttribute('onclick'); 
//     });
// }

// function renderControlBrowser() {
//     const b = document.getElementById('control-browser'); if (!b) return;
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     b.innerHTML = '';
//     eccDomains.forEach(c => {
//         const item = document.createElement('div'); 
//         item.className = 'control-item'; 
//         item.dataset.id = c.id;
//         item.innerHTML = `
//             <div style="display:flex;align-items:center;gap:8px">
//                 <span class="status-dot" style="width:8px;height:8px;border-radius:50%;background:${getDotColor(res[c.id] || '')}"></span>
//                 <small style="color:var(--accent-primary);font-weight:600">${c.id}</small>
//             </div>
//             <div style="font-weight:500;font-size:13px;margin-top:3px;padding-left:16px">${c.title}</div>`;
//         item.onclick = () => selectControl(c, item);
//         b.appendChild(item);
//     });
// }

// function getDotColor(s) {
//     return s === 'Compliant' ? '#10b981' : s === 'Non-Compliant' ? '#ef4444' : s === 'Partial' ? '#f59e0b' : '#475569';
// }

// function updateRightPanel(id) {
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     const status = res[id] || 'Not Started';
//     const sl = document.getElementById('current-control-status');
//     if (sl) {
//         sl.textContent = status;
//         sl.className = `badge ${status === 'Compliant' ? 'badge-success' : status === 'Non-Compliant' ? 'badge-danger' : 'badge-warning'}`;
//     }
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
//     if (!text || !currentControlId) return;
//     appendMsg('user', text); input.value = ''; showTyping();
//     try {
//         const r = await callAIEngine(text, currentControlId, currentMode);
//         hideTyping(); appendMsg('ai', r.answer || 'No response.');
//     } catch (e) { hideTyping(); }
// }


// // ================================================================
// // CyberGuard ECC Chatbot - Stable Version 8.6 (Final Integrated)
// // ================================================================

// let currentMode = 'audit', 
//     currentControlId = null, 
//     currentControlDbId = null, 
//     currentQuestions = [], 
//     currentQuestionIndex = 0, 
//     selectedControlInfo = null, 
//     currentSessionId = null, 
//     auditAnswers = [];

// // ذاكرة الجلسة: تستخدم مفاتيح مركبة مثل (audit_1-1) أو (guide_1-1)
// let chatHistory = {};

// const eccDomains = [
//     { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
//     { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
//     { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
//     { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
//     { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] },
//     { id: '1-6', title: 'Cybersecurity in IT Project Management', subControls: ['1-6-1', '1-6-2-1', '1-6-2-2', '1-6-3-1', '1-6-3-2', '1-6-3-3', '1-6-3-4', '1-6-3-5', '1-6-4'] },
//     { id: '1-7', title: 'Compliance with Standards & Laws', subControls: ['1-7-1', '1-7-2'] },
//     { id: '1-8', title: 'Periodical Review and Audit', subControls: ['1-8-1', '1-8-2', '1-8-3'] },
//     { id: '1-9', title: 'Cybersecurity in Human Resources', subControls: ['1-9-1', '1-9-2', '1-9-3-1', '1-9-3-2', '1-9-4-1', '1-9-4-2', '1-9-5', '1-9-6'] },
//     { id: '1-10', title: 'Awareness and Training Program', subControls: ['1-10-1', '1-10-2', '1-10-3-1', '1-10-3-2', '1-10-3-3', '1-10-3-4', '1-10-4-1', '1-10-4-2', '1-10-4-3', '1-10-5'] }
// ];

// document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkAuth()) return;
//     loadUserToSidebar();
//     renderControlBrowser();
    
//     document.getElementById('audit-mode-btn')?.addEventListener('click', () => setMode('audit'));
//     document.getElementById('guide-mode-btn')?.addEventListener('click', () => setMode('guide'));
//     document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
//     document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

//     addClearChatButton();
// });

// // --- وظائف الواجهة والتحكم ---

// function addClearChatButton() {
//     const chatHeader = document.querySelector('.chat-header');
//     if (!chatHeader || document.getElementById('clear-chat-btn')) return;
//     const clearBtn = document.createElement('button');
//     clearBtn.id = 'clear-chat-btn';
//     clearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear';
//     clearBtn.style = "background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:600;";
//     clearBtn.onclick = clearCurrentChat;
//     chatHeader.appendChild(clearBtn);
// }

// function clearCurrentChat() {
//     if (!currentControlId) return;
//     if (confirm(`Clear history for ${currentMode.toUpperCase()} on ${currentControlId}?`)) {
//         const key = `${currentMode}_${currentControlId}`;
//         chatHistory[key] = null;
//         document.getElementById('chat-messages').innerHTML = '';
//         showSubControlOptions(selectedControlInfo);
//     }
// }

// function disableAllPreviousButtons() {
//     document.querySelectorAll('.ai-message button').forEach(btn => {
//         btn.disabled = true;
//         btn.style.opacity = '0.5';
//         btn.style.cursor = 'not-allowed';
//         btn.removeAttribute('onclick'); 
//     });
// }

// function renderControlBrowser() {
//     const b = document.getElementById('control-browser'); if (!b) return;
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     b.innerHTML = '';
//     eccDomains.forEach(c => {
//         const item = document.createElement('div'); 
//         item.className = 'control-item'; 
//         item.dataset.id = c.id;
//         item.innerHTML = `
//             <div style="display:flex;align-items:center;gap:8px">
//                 <span class="status-dot" style="width:8px;height:8px;border-radius:50%;background:${getDotColor(res[c.id] || '')}"></span>
//                 <small style="color:var(--accent-primary);font-weight:600">${c.id}</small>
//             </div>
//             <div style="font-weight:500;font-size:13px;margin-top:3px;padding-left:16px">${c.title}</div>`;
//         item.onclick = () => selectControl(c, item);
//         b.appendChild(item);
//     });
// }

// // --- إدارة الجلسات والأسئلة ---

// async function selectControl(ctrl, el) {
//     // 1. حفظ الحالة الحالية للمود والضابط السابق قبل الانتقال
//     if (currentControlId) {
//         const oldKey = `${currentMode}_${currentControlId}`;
//         chatHistory[oldKey] = {
//             html: document.getElementById('chat-messages').innerHTML,
//             index: currentQuestionIndex,
//             questions: currentQuestions,
//             answers: auditAnswers,
//             sessionId: currentSessionId
//         };
//     }

//     // 2. تحديث الواجهة
//     document.querySelectorAll('.control-item').forEach(i => i.classList.remove('selected'));
//     if (el) el.classList.add('selected');
//     currentControlId = ctrl.id;
//     selectedControlInfo = ctrl;

//     const cm = document.getElementById('chat-messages');
//     const currentKey = `${currentMode}_${ctrl.id}`;
    
//     // 3. استعادة المحادثة بناءً على المود الحالي والضابط
//     if (chatHistory[currentKey] && chatHistory[currentKey].html) {
//         const h = chatHistory[currentKey];
//         cm.innerHTML = h.html;
//         currentQuestionIndex = h.index;
//         currentQuestions = h.questions;
//         auditAnswers = h.answers;
//         currentSessionId = h.sessionId;

//         if (currentQuestions && currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
//             if (!document.querySelector('.session-recovery-box')) offerSessionOptions(ctrl);
//         }
//     } else {
//         cm.innerHTML = '';
//         currentQuestionIndex = 0;
//         currentQuestions = [];
//         auditAnswers = [];
//         showSubControlOptions(ctrl);
//     }

//     document.getElementById('current-control-id').textContent = ctrl.id;
//     document.getElementById('current-control-name').textContent = ctrl.title;
//     updateRightPanel(ctrl.id);
//     cm.scrollTop = cm.scrollHeight;
// }

// function showSubControlOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message';
//     let btns = ctrl.subControls.map(subId => `
//         <button onclick="initiateSubAudit('${subId}')" style="padding:10px 14px; border:1px solid var(--accent-primary); background:rgba(6,182,212,0.05); color:var(--accent-primary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; margin-bottom:5px;">
//             Control ${subId}
//         </button>
//     `).join('');

//     m.innerHTML = `<div class="message-content"><div class="message-header">${currentMode === 'audit' ? 'AI Auditor' : 'AI Guide'}</div><div class="message-text">
//         <p style="margin-bottom:15px">Select a sub-control to begin:</p>
//         <div style="display:flex; gap:10px; flex-wrap:wrap;">${btns}</div></div></div>`;
//     cm.appendChild(m);
//     cm.scrollTop = cm.scrollHeight;
// }

// async function initiateSubAudit(subId) {
//     disableAllPreviousButtons();
//     appendMsg('user', `Starting: ${subId}`);
//     showTyping();
//     try {
//         const r = await generateAuditQuestions(subId, currentMode);
//         hideTyping();
//         if (r.questions?.length > 0) {
//             currentQuestions = r.questions.map(q => ({ q: q.question, ev: q.expected_evidence || '', cat: subId }));
//             currentQuestionIndex = 0;
//             const u = getCurrentUserLocal();
//             const s = await startAuditSessionAPI(u.id, null, currentMode);
//             if(s?.session_id) currentSessionId = s.session_id;
//             setTimeout(showAuditQ, 400);
//         }
//     } catch (e) { hideTyping(); }
// }

// function showAuditQ() {
//     if (currentQuestionIndex >= currentQuestions.length) {
//         if (currentMode === 'audit') finishAudit(); else finishGuide();
//         return;
//     }
//     const q = currentQuestions[currentQuestionIndex];
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div'); 
//     m.className = 'message ai-message';
//     m.innerHTML = `
//         <div class="message-content"><div class="message-header">${currentMode === 'audit' ? 'AI Auditor' : 'AI Guide'}</div><div class="message-text">
//             <p style="font-size:11px;color:var(--text-muted)">Question ${currentQuestionIndex+1} of ${currentQuestions.length}</p>
//             <p style="margin:10px 0">${q.q}</p>
//             <div style="display:flex;gap:10px;">
//                 <button onclick="answerAudit('yes',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #10b981;color:#10b981;cursor:pointer;background:none">Yes</button>
//                 <button onclick="answerAudit('partial',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #f59e0b;color:#f59e0b;cursor:pointer;background:none">Partial</button>
//                 <button onclick="answerAudit('no',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #ef4444;color:#ef4444;cursor:pointer;background:none">No</button>
//             </div>
//         </div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// async function answerAudit(ans, btn) {
//     btn.closest('div').querySelectorAll('button').forEach(b => { 
//         b.disabled = true; b.style.opacity = '0.35'; b.style.cursor = 'not-allowed';
//     });
//     btn.style.opacity = '1';
    
//     const labels = { yes: 'Yes — Verified', partial: 'Partial — Needs improvement', no: 'No — Gap' };
//     appendMsg('user', labels[ans]);
    
//     auditAnswers.push({ question: currentQuestions[currentQuestionIndex].q, answer: ans });
//     currentQuestionIndex++; 
    
//     // تحديث الذاكرة فوراً بالمفتاح المركب
//     if (currentControlId) {
//         const key = `${currentMode}_${currentControlId}`;
//         if (!chatHistory[key]) chatHistory[key] = {};
//         chatHistory[key].index = currentQuestionIndex;
//         chatHistory[key].html = document.getElementById('chat-messages').innerHTML;
//     }

//     if (currentSessionId) {
//         try { await saveAuditAnswer(currentSessionId, currentQuestions[currentQuestionIndex-1].q, ans); } catch (e) {}
//     }
//     setTimeout(showAuditQ, 500);
// }

// // --- الاستعادة والتحكم بالتدفق ---

// function offerSessionOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message session-recovery-box';
//     m.innerHTML = `
//         <div class="message-content"><div class="message-header">Session Found</div><div class="message-text">
//             <p>You have an active session for <strong>${ctrl.id}</strong> in ${currentMode} mode.</p>
//             <button onclick="resumeAudit()" style="background:var(--accent-primary);color:white;padding:8px 15px;border-radius:6px;cursor:pointer;border:none;margin-top:10px">Resume</button>
//             <button onclick="resetToSubControls()" style="background:none;color:white;padding:8px 15px;border-radius:6px;cursor:pointer;border:1px solid #333;margin-left:10px">Start New</button>
//         </div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// function resumeAudit() {
//     disableAllPreviousButtons();
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
    
//     // تحديث السجل بعد حذف صندوق الاستعادة
//     if (currentControlId) {
//         const key = `${currentMode}_${currentControlId}`;
//         chatHistory[key].html = document.getElementById('chat-messages').innerHTML;
//     }

//     if (currentQuestions && currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
//         appendMsg('ai', `<i class="fas fa-fast-forward"></i> Resuming at Question ${currentQuestionIndex + 1}...`);
//         setTimeout(showAuditQ, 600);
//     } else {
//         showSubControlOptions(selectedControlInfo);
//     }
// }

// function resetToSubControls() {
//     disableAllPreviousButtons();
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
//     showSubControlOptions(selectedControlInfo);
// }

// function appendMsg(role, txt) {
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div');
//     m.className = `message ${role}-message`;
//     const aiTitle = currentMode === 'audit' ? 'AI Auditor' : 'AI Guide';
    
//     m.innerHTML = `<div class="message-content"><div class="message-header">${role === 'ai' ? aiTitle : 'User'}</div><div class="message-text">${txt}</div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
    
//     if (currentControlId) {
//         const key = `${currentMode}_${currentControlId}`;
//         if (!chatHistory[key]) chatHistory[key] = { index: 0, questions: [], answers: [], html: "" };
//         chatHistory[key].html = cm.innerHTML;
//     }
// }

// // --- وظائف مساعدة ونظام ---

// function getDotColor(s) {
//     return s === 'Compliant' ? '#10b981' : s === 'Non-Compliant' ? '#ef4444' : s === 'Partial' ? '#f59e0b' : '#475569';
// }

// function updateRightPanel(id) {
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     const status = res[id] || 'Not Started';
//     const sl = document.getElementById('current-control-status');
//     if (sl) {
//         sl.textContent = status;
//         sl.className = `badge ${status === 'Compliant' ? 'badge-success' : status === 'Non-Compliant' ? 'badge-danger' : 'badge-warning'}`;
//     }
// }

// function setMode(m) {
//     // حفظ الحالة للضابط الحالي قبل التبديل
//     if (currentControlId) {
//         const oldKey = `${currentMode}_${currentControlId}`;
//         chatHistory[oldKey] = {
//             html: document.getElementById('chat-messages').innerHTML,
//             index: currentQuestionIndex,
//             questions: currentQuestions,
//             answers: auditAnswers,
//             sessionId: currentSessionId
//         };
//     }

//     currentMode = m;
//     document.getElementById('audit-mode-btn')?.classList.toggle('active', m === 'audit');
//     document.getElementById('guide-mode-btn')?.classList.toggle('active', m === 'guide');
    
//     // إعادة تحميل بيانات الضابط في المود الجديد
//     if (selectedControlInfo) {
//         const item = document.querySelector(`.control-item[data-id="${currentControlId}"]`);
//         selectControl(selectedControlInfo, item);
//     }
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
//     if (!text || !currentControlId) return;
//     appendMsg('user', text); input.value = ''; showTyping();
//     try {
//         const r = await callAIEngine(text, currentControlId, currentMode);
//         hideTyping(); 
//         appendMsg('ai', r.answer || 'I am sorry, I couldn\'t process that request.');
//     } catch (e) { hideTyping(); }
// }



// #################################################################################




// // CyberGuard ECC Chatbot v8.5 - Stable Final Version
// // Features: Persistence, Recovery Logic, Button Disabling, and UI fixes.

// let currentMode = 'audit', 
//     currentControlId = null, 
//     currentControlDbId = null, 
//     currentQuestions = [], 
//     currentQuestionIndex = 0, 
//     selectedControlInfo = null, 
//     currentSessionId = null, 
//     auditAnswers = [];

// let chatHistory = {}; // Stores state per controlId

// const eccDomains = [
//     { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
//     { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
//     { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
//     { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
//     { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] },
//     { id: '1-6', title: 'Cybersecurity in IT Project Management', subControls: ['1-6-1', '1-6-2-1', '1-6-2-2', '1-6-3-1', '1-6-3-2', '1-6-3-3', '1-6-3-4', '1-6-3-5', '1-6-4'] },
//     { id: '1-7', title: 'Compliance with Standards & Laws', subControls: ['1-7-1', '1-7-2'] },
//     { id: '1-8', title: 'Periodical Review and Audit', subControls: ['1-8-1', '1-8-2', '1-8-3'] },
//     { id: '1-9', title: 'Cybersecurity in Human Resources', subControls: ['1-9-1', '1-9-2', '1-9-3-1', '1-9-3-2', '1-9-4-1', '1-9-4-2', '1-9-5', '1-9-6'] },
//     { id: '1-10', title: 'Awareness and Training Program', subControls: ['1-10-1', '1-10-2', '1-10-3-1', '1-10-3-2', '1-10-3-3', '1-10-3-4', '1-10-4-1', '1-10-4-2', '1-10-4-3', '1-10-5'] }
// ];

// document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkAuth()) return;
//     loadUserToSidebar();
//     renderControlBrowser();
    
//     document.getElementById('audit-mode-btn').addEventListener('click', () => setMode('audit'));
//     document.getElementById('guide-mode-btn').addEventListener('click', () => setMode('guide'));
//     document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
//     document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

//     addClearChatButton();
// });

// // --- UI Helpers ---
// function addClearChatButton() {
//     const chatHeader = document.querySelector('.chat-header');
//     if (document.getElementById('clear-chat-btn')) return;
//     const clearBtn = document.createElement('button');
//     clearBtn.id = 'clear-chat-btn';
//     clearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear Chat';
//     clearBtn.style = "background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;";
//     clearBtn.onclick = clearCurrentChat;
//     chatHeader.appendChild(clearBtn);
// }

// function clearCurrentChat() {
//     if (!currentControlId) return;
//     if (confirm(`Clear history for ${currentControlId}?`)) {
//         chatHistory[currentControlId] = null;
//         document.getElementById('chat-messages').innerHTML = '';
//         showSubControlOptions(selectedControlInfo);
//     }
// }

// function disableAllPreviousButtons() {
//     const cm = document.getElementById('chat-messages');
//     const allButtons = cm.querySelectorAll('.ai-message button');
//     allButtons.forEach(btn => {
//         btn.disabled = true;
//         btn.style.opacity = '0.5';
//         btn.style.cursor = 'not-allowed';
//         btn.removeAttribute('onclick'); 
//     });
// }

// function renderControlBrowser() {
//     const b = document.getElementById('control-browser'); if (!b) return;
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     b.innerHTML = '';
//     eccDomains.forEach(c => {
//         const item = document.createElement('div'); 
//         item.className = 'control-item'; 
//         item.dataset.id = c.id;
//         item.innerHTML = `
//             <div style="display:flex;align-items:center;gap:8px">
//                 <span class="status-dot" style="width:8px;height:8px;border-radius:50%;background:${getDotColor(res[c.id] || '')}"></span>
//                 <small style="color:var(--accent-primary);font-weight:600">${c.id}</small>
//             </div>
//             <div style="font-weight:500;font-size:13px;margin-top:3px;padding-left:16px">${c.title}</div>`;
//         item.onclick = () => selectControl(c, item);
//         b.appendChild(item);
//     });
// }

// async function selectControl(ctrl, el) {
//     // Save current before switching
//     if (currentControlId) {
//         chatHistory[currentControlId] = {
//             html: document.getElementById('chat-messages').innerHTML,
//             index: currentQuestionIndex,
//             questions: currentQuestions,
//             answers: auditAnswers,
//             sessionId: currentSessionId
//         };
//     }

//     document.querySelectorAll('.control-item').forEach(i => i.classList.remove('selected'));
//     el.classList.add('selected');
//     currentControlId = ctrl.id;
//     selectedControlInfo = ctrl;

//     const cm = document.getElementById('chat-messages');
    
//     if (chatHistory[ctrl.id] && chatHistory[ctrl.id].html) {
//         const h = chatHistory[ctrl.id];
//         cm.innerHTML = h.html;
//         currentQuestionIndex = h.index;
//         currentQuestions = h.questions;
//         auditAnswers = h.answers;
//         currentSessionId = h.sessionId;

//         // Only offer recovery if there are questions and it's not finished
//         if (currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
//             if (!document.querySelector('.session-recovery-box')) offerSessionOptions(ctrl);
//         }
//     } else {
//         cm.innerHTML = '';
//         currentQuestionIndex = 0;
//         currentQuestions = [];
//         auditAnswers = [];
//         showSubControlOptions(ctrl);
//     }

//     document.getElementById('current-control-id').textContent = ctrl.id;
//     document.getElementById('current-control-name').textContent = ctrl.title;
//     updateRightPanel(ctrl.id);
//     cm.scrollTop = cm.scrollHeight;
// }

// function showSubControlOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message';
//     let btns = ctrl.subControls.map(subId => `
//         <button onclick="initiateSubAudit('${subId}')" style="padding:10px 14px; border:1px solid var(--accent-primary); background:rgba(6,182,212,0.05); color:var(--accent-primary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; margin-bottom:5px;">
//             Control ${subId}
//         </button>
//     `).join('');

//     m.innerHTML = `<div class="message-content"><div class="message-header">AI Assistant</div><div class="message-text">
//         <p style="margin-bottom:15px">Select a sub-control for <strong>${ctrl.id}</strong>:</p>
//         <div style="display:flex; gap:10px; flex-wrap:wrap;">${btns}</div></div></div>`;
//     cm.appendChild(m);
//     cm.scrollTop = cm.scrollHeight;
// }

// async function initiateSubAudit(subId) {
//     disableAllPreviousButtons();
//     appendMsg('user', `Starting assessment: ${subId}`);
//     showTyping();
//     try {
//         const r = await generateAuditQuestions(subId, currentMode);
//         hideTyping();
//         if (r.questions?.length > 0) {
//             currentQuestions = r.questions.map(q => ({ q: q.question, ev: q.expected_evidence || '', cat: subId }));
//             currentQuestionIndex = 0;
//             const u = getCurrentUserLocal();
//             const s = await startAuditSessionAPI(u.id, null, currentMode);
//             if(s?.session_id) currentSessionId = s.session_id;
//             setTimeout(showAuditQ, 400);
//         }
//     } catch (e) { hideTyping(); }
// }

// function showAuditQ() {
//     if (currentQuestionIndex >= currentQuestions.length) {
//         if (currentMode === 'audit') finishAudit(); else finishGuide();
//         return;
//     }
//     const q = currentQuestions[currentQuestionIndex];
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div'); 
//     m.className = 'message ai-message';
//     m.innerHTML = `
//         <div class="message-content"><div class="message-header">AI Auditor</div><div class="message-text">
//             <p style="font-size:11px;color:var(--text-muted)">Question ${currentQuestionIndex+1} of ${currentQuestions.length}</p>
//             <p style="margin:10px 0">${q.q}</p>
//             <div style="display:flex;gap:10px;">
//                 <button onclick="answerAudit('yes',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #10b981;color:#10b981;cursor:pointer;background:none">Yes</button>
//                 <button onclick="answerAudit('partial',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #f59e0b;color:#f59e0b;cursor:pointer;background:none">Partial</button>
//                 <button onclick="answerAudit('no',this)" style="padding:8px 18px;border-radius:6px;border:1.5px solid #ef4444;color:#ef4444;cursor:pointer;background:none">No</button>
//             </div>
//         </div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// async function answerAudit(ans, btn) {
//     btn.closest('div').querySelectorAll('button').forEach(b => { 
//         b.disabled = true; b.style.opacity = '0.35'; b.style.cursor = 'not-allowed';
//     });
//     btn.style.opacity = '1';
//     appendMsg('user', ans.toUpperCase());
    
//     auditAnswers.push({ question: currentQuestions[currentQuestionIndex].q, answer: ans });
//     currentQuestionIndex++; 
    
//     if (currentControlId && chatHistory[currentControlId]) {
//         chatHistory[currentControlId].index = currentQuestionIndex;
//         chatHistory[currentControlId].html = document.getElementById('chat-messages').innerHTML;
//     }

//     if (currentSessionId) {
//         try { await saveAuditAnswer(currentSessionId, currentQuestions[currentQuestionIndex-1].q, ans); } catch (e) {}
//     }
//     setTimeout(showAuditQ, 500);
// }

// function offerSessionOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message session-recovery-box';
//     m.innerHTML = `
//         <div class="message-content"><div class="message-header">Recovery</div><div class="message-text">
//             <p>Active session found for ${ctrl.id}.</p>
//             <button onclick="resumeAudit()" style="background:var(--accent-primary);color:white;padding:8px 15px;border-radius:6px;cursor:pointer;border:none;margin-top:10px">Resume Assessment</button>
//             <button onclick="resetToSubControls()" style="background:none;color:white;padding:8px 15px;border-radius:6px;cursor:pointer;border:1px solid #333;margin-left:10px">Restart</button>
//         </div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
// }

// function resumeAudit() {
//     disableAllPreviousButtons();
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
    
//     if (currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
//         appendMsg('ai', `Resuming at Question ${currentQuestionIndex + 1}...`);
//         setTimeout(showAuditQ, 600);
//     } else {
//         showSubControlOptions(selectedControlInfo);
//     }
// }

// function resetToSubControls() {
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
//     showSubControlOptions(selectedControlInfo);
// }

// function appendMsg(role, txt) {
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div');
//     m.className = `message ${role}-message`;
//     m.innerHTML = `<div class="message-content"><div class="message-header">${role === 'ai' ? 'AI Auditor' : 'User'}</div><div class="message-text">${txt}</div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
//     if (currentControlId) {
//         if (!chatHistory[currentControlId]) chatHistory[currentControlId] = { html: "" };
//         chatHistory[currentControlId].html = cm.innerHTML;
//     }
// }

// function getDotColor(s) {
//     return s === 'Compliant' ? '#10b981' : s === 'Non-Compliant' ? '#ef4444' : s === 'Partial' ? '#f59e0b' : '#475569';
// }

// function updateRightPanel(id) {
//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     const status = res[id] || 'Not Started';
//     const sl = document.getElementById('current-control-status');
//     if (sl) {
//         sl.textContent = status;
//         sl.className = `badge ${status === 'Compliant' ? 'badge-success' : status === 'Non-Compliant' ? 'badge-danger' : 'badge-warning'}`;
//     }
// }

// function setMode(m) {
//     currentMode = m;
//     document.getElementById('audit-mode-btn').classList.toggle('active', m === 'audit');
//     document.getElementById('guide-mode-btn').classList.toggle('active', m === 'guide');
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
//     if (!text || !currentControlId) return;
//     appendMsg('user', text); input.value = ''; showTyping();
//     try {
//         const r = await callAIEngine(text, currentControlId, currentMode);
//         hideTyping(); appendMsg('ai', r.answer || 'No response.');
//     } catch (e) { hideTyping(); }
// }



// ###############################################




// // CyberGuard ECC Chatbot v8.2 - FULL UPDATED EDITION
// // Features: Chat Persistence, Clear Chat, English UI, and Full Control Logic

// let currentMode = 'audit', 
//     currentControlId = null, 
//     currentControlDbId = null, 
//     currentQuestions = [], 
//     currentQuestionIndex = 0, 
//     selectedControlInfo = null, 
//     currentSessionId = null, 
//     auditAnswers = [];

// // Dictionary to store chat history per control during the session
// let chatHistory = {};

// const eccDomains = [
//     { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
//     { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
//     { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
//     { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
//     { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] },
//     { id: '1-6', title: 'Cybersecurity in IT Project Management', subControls: ['1-6-1', '1-6-2-1', '1-6-2-2', '1-6-3-1', '1-6-3-2', '1-6-3-3', '1-6-3-4', '1-6-3-5', '1-6-4'] },
//     { id: '1-7', title: 'Compliance with Standards & Laws', subControls: ['1-7-1', '1-7-2'] },
//     { id: '1-8', title: 'Periodical Review and Audit', subControls: ['1-8-1', '1-8-2', '1-8-3'] },
//     { id: '1-9', title: 'Cybersecurity in Human Resources', subControls: ['1-9-1', '1-9-2', '1-9-3-1', '1-9-3-2', '1-9-4-1', '1-9-4-2', '1-9-5', '1-9-6'] },
//     { id: '1-10', title: 'Awareness and Training Program', subControls: ['1-10-1', '1-10-2', '1-10-3-1', '1-10-3-2', '1-10-3-3', '1-10-3-4', '1-10-4-1', '1-10-4-2', '1-10-4-3', '1-10-5'] }
// ];

// document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkAuth()) return;
//     loadUserToSidebar();
//     renderControlBrowser();
    
//     document.getElementById('audit-mode-btn').addEventListener('click', () => setMode('audit'));
//     document.getElementById('guide-mode-btn').addEventListener('click', () => setMode('guide'));
//     document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
//     document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

//     const res = JSON.parse(localStorage.getItem('audit_results') || '{}');
//     Object.entries(res).forEach(([id, s]) => updateDot(id, s));

//     addClearChatButton();
// });

// // --- UI Helper: Clear Chat Button ---
// function addClearChatButton() {
//     const chatHeader = document.querySelector('.chat-header');
//     if (document.getElementById('clear-chat-btn')) return;
//     const clearBtn = document.createElement('button');
//     clearBtn.id = 'clear-chat-btn';
//     clearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear Chat';
//     clearBtn.style = "background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; transition: 0.2s;";
//     clearBtn.onclick = clearCurrentChat;
//     chatHeader.appendChild(clearBtn);
// }

// function clearCurrentChat() {
//     if (!currentControlId) return;
//     if (confirm(`Are you sure you want to clear chat history for ${currentControlId}?`)) {
//         chatHistory[currentControlId] = null;
//         document.getElementById('chat-messages').innerHTML = '';
//         showSubControlOptions(selectedControlInfo);
//     }
// }

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

// // Stable Session Recovery
// async function selectControl(ctrl, el) {
//     // 1. حفظ الحالة الحالية للضابط "قبل" الانتقال (فقط إذا كانت هناك محادثة فعلاً)
//     if (currentControlId) {
//         chatHistory[currentControlId] = {
//             html: document.getElementById('chat-messages').innerHTML,
//             index: currentQuestionIndex,
//             questions: currentQuestions,
//             answers: auditAnswers,
//             sessionId: currentSessionId
//         };
//     }

//     document.querySelectorAll('.control-item').forEach(i => i.classList.remove('selected'));
//     el.classList.add('selected');
//     currentControlId = ctrl.id;
//     selectedControlInfo = ctrl;

//     const cm = document.getElementById('chat-messages');
    
//     // 2. استعادة المحادثة
//     if (chatHistory[ctrl.id] && chatHistory[ctrl.id].html) {
//         const history = chatHistory[ctrl.id];
//         cm.innerHTML = history.html;
        
//         // استعادة البيانات الخلفية
//         currentQuestionIndex = history.index;
//         currentQuestions = history.questions;
//         auditAnswers = history.answers;
//         currentSessionId = history.sessionId;

//         // 3. التعديل الجوهري: تظهر رسالة الاستعادة فقط إذا كانت هناك أسئلة (أي بدأ التقييم فعلاً)
//         // ولم نصل بعد إلى نهاية الأسئلة
//         const hasActiveQuestions = currentQuestions && currentQuestions.length > 0;
//         const isNotFinished = currentQuestionIndex < currentQuestions.length;

//         if (hasActiveQuestions && isNotFinished) {
//             if (!document.querySelector('.session-recovery-box')) {
//                 offerSessionOptions(ctrl);
//             }
//         } else if (!hasActiveQuestions) {
//             // إذا كانت المحادثة تحتوي فقط على قائمة الضوابط (بدون أسئلة)، لا نفعل شيئاً إضافياً
//             // لأن القائمة موجودة أصلاً في الـ HTML المستعاد
//         }
//     } else {
//         // جلسة جديدة كلياً
//         cm.innerHTML = '';
//         currentQuestionIndex = 0;
//         currentQuestions = [];
//         auditAnswers = [];
//         showSubControlOptions(ctrl);
//     }

//     document.getElementById('current-control-id').textContent = ctrl.id;
//     document.getElementById('current-control-name').textContent = ctrl.title;
//     updateRightPanel(ctrl.id);
//     cm.scrollTop = cm.scrollHeight;
// }

// function offerSessionOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     // أضفنا class محدد لمنع التكرار
//     m.className = 'message ai-message session-recovery-box'; 
//     m.innerHTML = `
//         <div class="message-content">
//             <div class="message-header">Session Recovery</div>
//             <div class="message-text" style="border-left: 3px solid var(--accent-primary); background: rgba(6,182,212,0.05); padding: 15px;">
//                 <p style="margin-bottom:12px; font-weight:600;">Welcome back! Control ${ctrl.id} has an active session. Proceed?</p>
//                 <div style="display:flex; gap:8px; flex-wrap:wrap;">
//                     <button onclick="resumeAudit()" style="padding:8px 15px; background:var(--accent-primary); color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700;">
//                         <i class="fas fa-play"></i> Resume
//                     </button>
//                     <button onclick="resetToSubControls()" style="padding:8px 15px; background:rgba(255,255,255,0.1); color:white; border:1px solid var(--border-color); border-radius:6px; cursor:pointer; font-size:12px;">
//                         <i class="fas fa-list"></i> Sub-controls
//                     </button>
//                 </div>
//             </div>
//         </div>`;
//     cm.appendChild(m);
//     cm.scrollTop = cm.scrollHeight;
// }

// function resumeAudit() {
//     disableAllPreviousButtons();
    
//     // 1. إزالة مربع خيارات الاستعادة
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
    
//     // 2. معالجة تكرار السؤال: نبحث عن آخر بلوك سؤال معروض ونعطله (Disabled)
//     // لكي لا يظن المستخدم أنه يحتاج للإجابة عليه مرة أخرى
//     const allMessages = document.querySelectorAll('.ai-message');
//     if (allMessages.length > 0) {
//         const lastMsg = allMessages[allMessages.length - 1];
//         const buttons = lastMsg.querySelectorAll('button');
//         if (buttons.length > 0) {
//             buttons.forEach(b => {
//                 b.disabled = true;
//                 b.style.opacity = '0.5';
//                 b.style.cursor = 'not-allowed';
//             });
//         }
//     }

//     // 3. التحقق من العداد والأسئلة
//     if (currentQuestions && currentQuestions.length > 0) {
//         if (currentQuestionIndex < currentQuestions.length) {
//             // إضافة رسالة توضيحية بسيطة
//             appendMsg('ai', `<i class="fas fa-fast-forward"></i> Resuming assessment... Moving to <strong>Question ${currentQuestionIndex + 1}</strong>`);
            
//             // 4. استدعاء السؤال التالي فعلياً
//             setTimeout(showAuditQ, 800);
//         } else {
//             appendMsg('ai', "Assessment for this section is already complete.");
//             showSubControlOptions(selectedControlInfo);
//         }
//     } else {
//         showSubControlOptions(selectedControlInfo);
//     }

//     // 5. تحديث الذاكرة لضمان عدم حفظ أزرار "الاستعادة" المحذوفة
//     if (currentControlId) {
//         chatHistory[currentControlId].html = document.getElementById('chat-messages').innerHTML;
//     }
// }

// function resetToSubControls() {
//     disableAllPreviousButtons();
    
//     const box = document.querySelector('.session-recovery-box');
//     if (box) box.remove();
//     showSubControlOptions(selectedControlInfo);
// }

// // تعديل بسيط على answerAudit لضمان تحديث الـ Index فوراً
// async function answerAudit(ans, btn) {
//     // 1. تعطيل الأزرار فور الضغط لمنع الإجابة المتكررة
//     btn.closest('div').querySelectorAll('button').forEach(b => { 
//         b.disabled = true; 
//         b.style.opacity = '0.35'; 
//     }); 
//     btn.style.opacity = '1';
    
//     const labels = { yes: 'Yes — Verified', partial: 'Partial — Needs improvement', no: 'No — Gap' };
//     appendMsg('user', labels[ans]); // هذه الدالة تضيف رسالة المستخدم للشاشة
    
//     // 2. تسجيل الإجابة في المصفوفة
//     auditAnswers.push({ 
//         question: currentQuestions[currentQuestionIndex].q, 
//         answer: ans, 
//         evidence: currentQuestions[currentQuestionIndex].ev 
//     });

//     // 3. تحديث العداد للانتقال للسؤال التالي
//     currentQuestionIndex++; 
    
//     // 4. تحديث الذاكرة (Index + HTML) لضمان عدم تكرار السؤال عند العودة
//     if (currentControlId && chatHistory[currentControlId]) {
//         chatHistory[currentControlId].index = currentQuestionIndex;
//         // حفظ شكل الشات الحالي (بأزرار معطلة) لضمان نظافة المحادثة عند الاستعادة
//         chatHistory[currentControlId].html = document.getElementById('chat-messages').innerHTML;
//     }

//     // 5. الحفظ في قاعدة البيانات عبر الـ API
//     if (currentSessionId) {
//         // نستخدم index-1 لأننا قمنا بزيادة العداد للتو
//         try { await saveAuditAnswer(currentSessionId, currentQuestions[currentQuestionIndex-1].q, ans); } catch (e) { console.error("API Save Error"); }
//     }
    
//     // 6. الانتقال للسؤال التالي بعد نصف ثانية
//     setTimeout(showAuditQ, 500);
// }

// function showSubControlOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message';
    
//     let buttonsHtml = ctrl.subControls.map(subId => `
//         <button onclick="initiateSubAudit('${subId}')" style="padding:10px 14px; border:1px solid var(--accent-primary); background:rgba(6,182,212,0.05); color:var(--accent-primary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition:0.2s; margin-bottom:5px;">
//             Control ${subId}
//         </button>
//     `).join('');

//     m.innerHTML = `
//         <div class="message-content">
//             <div class="message-header">AI Compliance Assistant</div>
//             <div class="message-text">
//                 <p style="margin-bottom:15px">You have selected Main Control <strong>${ctrl.id}</strong>. Please select the specific sub-control you wish to assess now:</p>
//                 <div style="display:flex; gap:10px; flex-wrap:wrap;">${buttonsHtml}</div>
//             </div>
//         </div>`;
//     cm.appendChild(m);
//     cm.scrollTop = cm.scrollHeight;
//     chatHistory[currentControlId] = cm.innerHTML; // Save state
// }

// async function initiateSubAudit(subId) {
//     disableAllPreviousButtons();
    
//     appendMsg('user', `Starting assessment for sub-control: ${subId}`);
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
//     chatHistory[currentControlId] = cm.innerHTML; // Update history
// }

// async function answerAudit(ans, btn) {
//     // 1. تعطيل الأزرار فور الضغط لمنع الإجابة المتكررة
//     btn.closest('div').querySelectorAll('button').forEach(b => { 
//         b.disabled = true; 
//         b.style.opacity = '0.35'; 
//     }); 
//     btn.style.opacity = '1';
    
//     const labels = { yes: 'Yes — Verified', partial: 'Partial — Needs improvement', no: 'No — Gap' };
//     appendMsg('user', labels[ans]); // هذه الدالة تضيف رسالة المستخدم للشاشة
    
//     // 2. تسجيل الإجابة في المصفوفة
//     auditAnswers.push({ 
//         question: currentQuestions[currentQuestionIndex].q, 
//         answer: ans, 
//         evidence: currentQuestions[currentQuestionIndex].ev 
//     });

//     // 3. تحديث العداد للانتقال للسؤال التالي
//     currentQuestionIndex++; 
    
//     // 4. تحديث الذاكرة (Index + HTML) لضمان عدم تكرار السؤال عند العودة
//     if (currentControlId && chatHistory[currentControlId]) {
//         chatHistory[currentControlId].index = currentQuestionIndex;
//         // حفظ شكل الشات الحالي (بأزرار معطلة) لضمان نظافة المحادثة عند الاستعادة
//         chatHistory[currentControlId].html = document.getElementById('chat-messages').innerHTML;
//     }

//     // 5. الحفظ في قاعدة البيانات عبر الـ API
//     if (currentSessionId) {
//         // نستخدم index-1 لأننا قمنا بزيادة العداد للتو
//         try { await saveAuditAnswer(currentSessionId, currentQuestions[currentQuestionIndex-1].q, ans); } catch (e) { console.error("API Save Error"); }
//     }
    
//     // 6. الانتقال للسؤال التالي بعد نصف ثانية
//     setTimeout(showAuditQ, 500);
// }

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
//                 </div>`);
//             await saveAuditRecommendation({control_id:currentControlDbId, session_id:currentSessionId, gap_description:answersText, recommendation:r.answer, priority:'High'});
//         }
//     } catch(e) { hideTyping(); }
//     setTimeout(() => showSubControlOptions(selectedControlInfo), 3000);
// }

// // --- Background Logic (Storage & Helpers) ---

// async function saveAuditToEvidence(controlId, controlTitle, status, score, answers, sessionId, controlDbId) {
//     try {
//         const transcript = answers.map((a, i) => {
//             const icon = a.answer === 'yes' ? '✅' : a.answer === 'partial' ? '⚠️' : '❌';
//             return `Q${i + 1}: ${a.question}\nAnswer: ${icon} ${a.answer.toUpperCase()}`;
//         }).join('\n\n');
//         const summary = `AUDIT REPORT — Control ${controlId}\nStatus: ${status}\nScore: ${score}%\n\n${transcript}`;
//         await apiRequest('/evidence/save-audit', {
//             method: 'POST',
//             body: JSON.stringify({ control_id: controlDbId, session_id: sessionId, title: `Audit Report — ${controlId}`, description: summary, status: status, score: score, answers: answers, evidence_type: 'audit_session' })
//         });
//     } catch (e) {
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
//     if (currentControlId) chatHistory[currentControlId] = cm.innerHTML; // Update history
// }

// function appendMsg(role, txt) {
//     const cm = document.getElementById('chat-messages'), m = document.createElement('div');
//     m.className = `message ${role}-message`;
//     m.innerHTML = `<div class="message-content"><div class="message-header">${role === 'ai' ? 'AI Auditor' : 'User'}</div><div class="message-text">${txt}</div></div>`;
//     cm.appendChild(m); cm.scrollTop = cm.scrollHeight;
//     if (currentControlId) chatHistory[currentControlId] = cm.innerHTML; // Update history
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

// function disableAllPreviousButtons() {
//     const cm = document.getElementById('chat-messages');
//     // نبحث عن جميع الأزرار داخل رسائل الـ AI فقط
//     const allButtons = cm.querySelectorAll('.ai-message button');
    
//     allButtons.forEach(btn => {
//         btn.disabled = true;
//         btn.style.opacity = '0.5';
//         btn.style.cursor = 'not-allowed';
//         // إزالة خاصية onclick لضمان عدم التفاعل نهائياً
//         btn.removeAttribute('onclick'); 
//     });
// }

// // CyberGuard ECC Chatbot v8 - FULL UPDATED EDITION (With New Controls 1-6 to 1-10)
// // Integration: Hierarchical Flow + Evidence Saving + API Sync + Advanced Recommendations

// let currentMode = 'audit', 
//     currentControlId = null, 
//     currentControlDbId = null, 
//     currentQuestions = [], 
//     currentQuestionIndex = 0, 
//     selectedControlInfo = null, 
//     currentSessionId = null, 
//     auditAnswers = [];

// // 1. هيكلية الضوابط المحدثة بالكامل (ECC Domains 1-1 to 1-10)
// const eccDomains = [
//     { id: '1-1', title: 'Cybersecurity Strategy', subControls: ['1-1-1', '1-1-2', '1-1-3'] },
//     { id: '1-2', title: 'Cybersecurity Management', subControls: ['1-2-1', '1-2-2', '1-2-3'] },
//     { id: '1-3', title: 'Cybersecurity Policies and Procedures', subControls: ['1-3-1', '1-3-2', '1-3-3', '1-3-4'] },
//     { id: '1-4', title: 'Cybersecurity Roles and Responsibilities', subControls: ['1-4-1', '1-4-2'] },
//     { id: '1-5', title: 'Cybersecurity Risk Management', subControls: ['1-5-1', '1-5-2', '1-5-3-1', '1-5-3-2', '1-5-3-3', '1-5-3-4', '1-5-4'] },
//     { 
//         id: '1-6', 
//         title: 'Cybersecurity in IT Project Management', 
//         subControls: ['1-6-1', '1-6-2-1', '1-6-2-2', '1-6-3-1', '1-6-3-2', '1-6-3-3', '1-6-3-4', '1-6-3-5', '1-6-4'] 
//     },
//     { 
//         id: '1-7', 
//         title: 'Compliance with Standards & Laws', 
//         subControls: ['1-7-1', '1-7-2'] 
//     },
//     { 
//         id: '1-8', 
//         title: 'Periodical Review and Audit', 
//         subControls: ['1-8-1', '1-8-2', '1-8-3'] 
//     },
//     { 
//         id: '1-9', 
//         title: 'Cybersecurity in Human Resources', 
//         subControls: ['1-9-1', '1-9-2', '1-9-3-1', '1-9-3-2', '1-9-4-1', '1-9-4-2', '1-9-5', '1-9-6'] 
//     },
//     { 
//         id: '1-10', 
//         title: 'Awareness and Training Program', 
//         subControls: ['1-10-1', '1-10-2', '1-10-3-1', '1-10-3-2', '1-10-3-3', '1-10-3-4', '1-10-4-1', '1-10-4-2', '1-10-4-3', '1-10-5'] 
//     }
// ];

// document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkAuth()) return;
//     loadUserToSidebar();
//     renderControlBrowser();
    
//     document.getElementById('audit-mode-btn').addEventListener('click', () => setMode('audit'));
//     document.getElementById('guide-mode-btn').addEventListener('click', () => setMode('guide'));
//     document.getElementById('send-btn')?.addEventListener('click', handleUserMessage);
//     document.getElementById('user-query')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleUserMessage(); });

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
    
//     showSubControlOptions(ctrl);
// }

// function showSubControlOptions(ctrl) {
//     const cm = document.getElementById('chat-messages');
//     const m = document.createElement('div');
//     m.className = 'message ai-message';
    
//     let buttonsHtml = ctrl.subControls.map(subId => `
//         <button onclick="initiateSubAudit('${subId}')" style="padding:10px 14px; border:1px solid var(--accent-primary); background:rgba(6,182,212,0.05); color:var(--accent-primary); border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition:0.2s; margin-bottom:5px;">
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
//                 <strong>${auditAnswers[0]?.cat || currentControlId} Assessment Complete</strong>
//                 <span style="font-size:20px; font-weight:800; color:${color}">${score}%</span>
//             </div>
//             <p style="font-size:12px; color:var(--text-muted); margin-top:5px">Section results saved. You can now assess another sub-control.</p>
//         </div>
//     `);

//     await saveProgress(currentControlId, status, score, yes, partial, no, total);
//     await saveAuditToEvidence(currentControlId, selectedControlInfo?.title || currentControlId, status, score, auditAnswers, currentSessionId, currentControlDbId);
    
//     setTimeout(() => showSubControlOptions(selectedControlInfo), 2500);
// }

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

