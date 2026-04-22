// CyberGuard ECC Chatbot v7 - WITH EVIDENCE SAVING
// Saves completed audit sessions to evidence DB for review in evidence.html

let currentMode='audit',currentControlId=null,currentControlDbId=null,currentQuestions=[],currentQuestionIndex=0,selectedControlInfo=null,currentSessionId=null,auditAnswers=[];

const eccDomains=[
  {id:'1-1',title:'Cybersecurity Governance',domain:'Governance'},
  {id:'1-2',title:'Cybersecurity Risk Management',domain:'Risk'},
  {id:'1-3',title:'Cybersecurity Asset Management',domain:'Assets'},
  {id:'1-4',title:'Cybersecurity Operations',domain:'Operations'},
  {id:'1-5',title:'System & Network Hardening',domain:'Network'},
  {id:'1-6',title:'Identity & Access Management',domain:'Identity'},
  {id:'1-7',title:'Data Protection',domain:'Data'},
  {id:'1-8',title:'Vulnerability Management',domain:'Vulnerability'},
  {id:'1-9',title:'Incident Defense',domain:'Incident'},
  {id:'1-10',title:'Physical Security',domain:'Physical'}
];

document.addEventListener('DOMContentLoaded',async()=>{
  if(!checkAuth())return;
  loadUserToSidebar();
  renderControlBrowser();
  document.getElementById('audit-mode-btn').addEventListener('click',()=>setMode('audit'));
  document.getElementById('guide-mode-btn').addEventListener('click',()=>setMode('guide'));
  document.getElementById('send-btn').addEventListener('click',handleUserMessage);
  document.getElementById('user-query').addEventListener('keypress',e=>{if(e.key==='Enter')handleUserMessage();});
  const res=JSON.parse(localStorage.getItem('audit_results')||'{}');
  Object.entries(res).forEach(([id,s])=>updateDot(id,s));
});

function getDotColor(s){return s==='Compliant'?'#10b981':s==='Non-Compliant'?'#ef4444':s==='Partial'?'#f59e0b':'#475569';}

function renderControlBrowser(){
  const b=document.getElementById('control-browser');if(!b)return;b.innerHTML='';
  const res=JSON.parse(localStorage.getItem('audit_results')||'{}');
  eccDomains.forEach(c=>{
    const item=document.createElement('div');item.className='control-item';item.dataset.id=c.id;
    item.innerHTML=`<div style="display:flex;align-items:center;gap:8px"><span class="status-dot" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${getDotColor(res[c.id]||'')}"></span><small style="color:var(--accent-primary);font-weight:600">${c.id}</small></div><div style="font-weight:500;font-size:13px;margin-top:3px;padding-left:16px">${c.title}</div>`;
    item.onclick=()=>selectControl(c,item);
    b.appendChild(item);
  });
}

async function selectControl(ctrl,el){
  document.querySelectorAll('.control-item').forEach(i=>i.classList.remove('selected'));
  el.classList.add('selected');
  currentControlId=ctrl.id;selectedControlInfo=ctrl;auditAnswers=[];currentSessionId=null;currentQuestions=[];currentQuestionIndex=0;
  try{const cs=await getAllControls();const m=cs.find(c=>c.control_id===ctrl.id);if(m)currentControlDbId=m.id;}catch(e){}
  document.getElementById('current-control-id').textContent=ctrl.id;
  document.getElementById('current-control-name').textContent=ctrl.title;
  document.getElementById('current-control-requirement').textContent=`ECC-2023 compliance assessment for ${ctrl.title}`;
  updateRightPanel(ctrl.id);
  document.getElementById('chat-messages').innerHTML='';
  if(currentMode==='audit')await startAuditMode(ctrl);else await startGuideMode(ctrl);
}

function updateRightPanel(id){
  const res=JSON.parse(localStorage.getItem('audit_results')||'{}'),sco=JSON.parse(localStorage.getItem('audit_scores')||'{}');
  const status=res[id]||'Not Started',score=sco[id];
  const sl=document.getElementById('current-control-status');
  sl.textContent=status;sl.className=`badge ${status==='Compliant'?'badge-success':status==='Non-Compliant'?'badge-danger':status==='Partial'?'badge-warning':'badge-info'}`;
  const ev=document.getElementById('linked-evidence');
  if(status!=='Not Started'){ev.textContent=`Last audit: ${status}${score!==undefined?' — '+score+'%':''}`;ev.style.color=getDotColor(status);}
  else{ev.textContent='No audit performed yet';ev.style.color='';}
}

async function startAuditMode(ctrl){
  try{const u=getCurrentUserLocal();const s=await startAuditSessionAPI(u.id,currentControlDbId,'audit');if(s?.session_id)currentSessionId=s.session_id;}catch(e){}
  appendMsg('ai',`<strong>Audit Session — ${ctrl.id}: ${ctrl.title}</strong><br><span style="font-size:12px;color:var(--text-muted)">Generating questions from ECC-2023...</span>`);
  showTyping();
  try{
    const r=await generateAuditQuestions(ctrl.id,'audit');hideTyping();
    if(r.questions?.length>0){currentQuestions=r.questions.map(q=>({q:q.question,ev:q.expected_evidence||'',cat:q.category||''}));currentQuestionIndex=0;setTimeout(showAuditQ,400);}
    else{appendMsg('ai',`<span style="color:#ef4444">Could not generate questions. Ensure ECC documents are indexed.</span>`);}
  }catch(e){hideTyping();appendMsg('ai',`<span style="color:#ef4444">AI error. Check backend.</span>`);}
}

function showAuditQ(){
  if(currentQuestionIndex>=currentQuestions.length){finishAudit();return;}
  const q=currentQuestions[currentQuestionIndex],num=currentQuestionIndex+1,total=currentQuestions.length,pct=Math.round((currentQuestionIndex/total)*100);
  const cm=document.getElementById('chat-messages'),m=document.createElement('div');m.className='message ai-message';
  m.innerHTML=`<div class="message-content"><div class="message-header">AI Auditor</div><div class="message-text"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:11px;color:var(--text-muted)">Question ${num} of ${total}</span>${q.cat?`<span style="font-size:11px;background:rgba(6,182,212,0.1);color:var(--accent-primary);padding:2px 10px;border-radius:20px">${q.cat}</span>`:''}</div><div style="width:100%;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;margin-bottom:14px"><div style="height:100%;width:${pct}%;background:var(--accent-primary);border-radius:2px;transition:width 0.4s"></div></div><p style="font-size:14px;line-height:1.7;margin-bottom:${q.ev?'8px':'16px'}">${q.q}</p>${q.ev?`<p style="font-size:11px;color:#f59e0b;margin-bottom:16px"><i class="fas fa-paperclip" style="margin-right:4px"></i>Required evidence: ${q.ev}</p>`:''}<div style="display:flex;gap:10px;flex-wrap:wrap"><button onclick="answerAudit('yes',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #10b981;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s"><i class="fas fa-check" style="margin-right:6px"></i>Yes</button><button onclick="answerAudit('partial',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.08);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s"><i class="fas fa-adjust" style="margin-right:6px"></i>Partial</button><button onclick="answerAudit('no',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #ef4444;background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s"><i class="fas fa-times" style="margin-right:6px"></i>No</button></div></div></div>`;
  cm.appendChild(m);cm.scrollTop=cm.scrollHeight;
}

async function answerAudit(ans,btn){
  btn.closest('div').querySelectorAll('button').forEach(b=>{b.disabled=true;b.style.opacity='0.35';});
  btn.style.opacity='1';btn.style.transform='scale(1.05)';
  const labels={yes:'Yes — Verified',partial:'Partial — Needs improvement',no:'No — Gap'};
  appendMsg('user',labels[ans]);
  auditAnswers.push({question:currentQuestions[currentQuestionIndex].q,answer:ans,evidence:currentQuestions[currentQuestionIndex].ev});
  if(currentSessionId){try{await saveAuditAnswer(currentSessionId,currentQuestions[currentQuestionIndex].q,ans);}catch(e){}}
  if(ans==='no')appendMsg('ai',`<span style="color:#ef4444"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>Gap identified.</span>`);
  else if(ans==='partial')appendMsg('ai',`<span style="color:#f59e0b"><i class="fas fa-info-circle" style="margin-right:6px"></i>Partial (50% weight).</span>`);
  currentQuestionIndex++;setTimeout(showAuditQ,ans==='yes'?400:900);
}

async function finishAudit(){
  const total=auditAnswers.length,yes=auditAnswers.filter(a=>a.answer==='yes').length,partial=auditAnswers.filter(a=>a.answer==='partial').length,no=auditAnswers.filter(a=>a.answer==='no').length;
  const score=total>0?Math.round(((yes+partial*0.5)/total)*100):0;
  const status=score>=80?'Compliant':score>=40?'Partial':'Non-Compliant';
  const color=score>=80?'#10b981':score>=40?'#f59e0b':'#ef4444';
  appendMsg('ai',`<div style="border:1px solid ${color}30;border-radius:12px;padding:24px;background:${color}08"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><strong style="font-size:16px">Audit Complete — ${currentControlId}</strong><span style="font-size:36px;font-weight:800;color:${color}">${score}%</span></div><div style="width:100%;height:10px;background:rgba(255,255,255,0.08);border-radius:5px;overflow:hidden;margin-bottom:20px"><div style="height:100%;width:${score}%;background:${color};border-radius:5px;transition:width 1.2s ease"></div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px"><div style="text-align:center;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:14px"><div style="font-size:28px;font-weight:800;color:#10b981">${yes}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">YES</div></div><div style="text-align:center;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:14px"><div style="font-size:28px;font-weight:800;color:#f59e0b">${partial}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">PARTIAL</div></div><div style="text-align:center;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:14px"><div style="font-size:28px;font-weight:800;color:#ef4444">${no}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">NO</div></div></div><div style="text-align:center;margin-bottom:16px"><span style="background:${color}18;border:1.5px solid ${color};color:${color};padding:8px 24px;border-radius:24px;font-size:14px;font-weight:700;text-transform:uppercase">${status}</span></div><a href="evidence.html?control=${currentControlId}&status=${status}&score=${score}" style="display:block;text-align:center;background:rgba(6,182,212,0.1);border:1px solid var(--accent-primary);color:var(--accent-primary);padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600"><i class="fas fa-folder-open" style="margin-right:6px"></i>View in Evidence Repository</a></div>`);
  await saveProgress(currentControlId,status,score,yes,partial,no,total);

  // ✅ SAVE AUDIT SESSION TO EVIDENCE DB
  await saveAuditToEvidence(currentControlId, selectedControlInfo?.title||currentControlId, status, score, auditAnswers, currentSessionId, currentControlDbId);
}

// ===================================
// SAVE AUDIT TO EVIDENCE DATABASE
// ===================================
async function saveAuditToEvidence(controlId, controlTitle, status, score, answers, sessionId, controlDbId){
  try{
    // Build a readable audit transcript
    const transcript = answers.map((a,i)=>{
      const icon = a.answer==='yes'?'✅':a.answer==='partial'?'⚠️':'❌';
      return `Q${i+1}: ${a.question}\nAnswer: ${icon} ${a.answer.toUpperCase()}${a.evidence?'\nEvidence required: '+a.evidence:''}`;
    }).join('\n\n');

    const summary = `AUDIT REPORT — Control ${controlId}: ${controlTitle}\nDate: ${new Date().toLocaleString()}\nFinal Status: ${status}\nCompliance Score: ${score}%\n\nSession ID: ${sessionId||'N/A'}\n\n${'='.repeat(50)}\nQUESTIONS & ANSWERS\n${'='.repeat(50)}\n\n${transcript}`;

    // Save as evidence record via API
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

    console.log(`[✅] Audit saved to evidence DB for ${controlId}`);
  } catch(e){
    // Fallback: save to localStorage so evidence.html can still show it
    console.warn('[⚠️] Could not save to evidence API, saving locally:', e);
    const key = `audit_session_${controlId}_${Date.now()}`;
    const sessions = JSON.parse(localStorage.getItem('audit_sessions_log')||'[]');
    sessions.unshift({
      id: key,
      control_id: controlId,
      control_title: controlTitle,
      status,
      score,
      answers,
      session_id: sessionId,
      created_at: new Date().toISOString()
    });
    // Keep last 50 sessions
    localStorage.setItem('audit_sessions_log', JSON.stringify(sessions.slice(0,50)));
  }
}

async function startGuideMode(ctrl){
  appendMsg('ai',`<strong>Guide Mode — ${ctrl.id}: ${ctrl.title}</strong><br>Assessing readiness...<br><span style="font-size:12px;color:var(--text-muted)">Preparing questions...</span>`);
  showTyping();
  try{const r=await generateAuditQuestions(ctrl.id,'guide');hideTyping();if(r.questions?.length>0){currentQuestions=r.questions.map(q=>({q:q.question,purpose:q.purpose||''}));currentQuestionIndex=0;auditAnswers=[];setTimeout(showGuideQ,400);}else{appendMsg('ai',`<span style="color:#ef4444">Could not generate questions.</span>`);}
  }catch(e){hideTyping();appendMsg('ai',`<span style="color:#ef4444">AI error.</span>`);}
}

function showGuideQ(){
  if(currentQuestionIndex>=currentQuestions.length){finishGuide();return;}
  const q=currentQuestions[currentQuestionIndex],num=currentQuestionIndex+1,total=currentQuestions.length;
  const cm=document.getElementById('chat-messages'),m=document.createElement('div');m.className='message ai-message';
  m.innerHTML=`<div class="message-content"><div class="message-header">AI Guide</div><div class="message-text"><p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Question ${num} of ${total}</p><p style="font-size:14px;line-height:1.7;margin-bottom:16px">${q.q}</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button onclick="answerGuide('yes',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #10b981;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-check" style="margin-right:6px"></i>Yes</button><button onclick="answerGuide('partial',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #f59e0b;background:rgba(245,158,11,0.08);color:#f59e0b;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-adjust" style="margin-right:6px"></i>Partial</button><button onclick="answerGuide('no',this)" style="padding:10px 22px;border-radius:8px;border:1.5px solid #ef4444;background:rgba(239,68,68,0.08);color:#ef4444;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-times" style="margin-right:6px"></i>No</button></div></div></div>`;
  cm.appendChild(m);cm.scrollTop=cm.scrollHeight;
}

function answerGuide(ans,btn){
  btn.closest('div').querySelectorAll('button').forEach(b=>{b.disabled=true;b.style.opacity='0.35';});
  btn.style.opacity='1';btn.style.fontWeight='800';
  const labels={yes:'Yes',partial:'Partial',no:'No'};
  appendMsg('user',labels[ans]);
  auditAnswers.push({question:currentQuestions[currentQuestionIndex].q,answer:ans});
  currentQuestionIndex++;setTimeout(showGuideQ,400);
}

async function finishGuide(){
  appendMsg('ai',`<em style="color:var(--text-muted);font-size:12px">Generating recommendations...</em>`);
  showTyping();
  const answersText=auditAnswers.map((a,i)=>`Q${i+1}: "${a.question}" => ${a.answer.toUpperCase()}`).join('\n');
  try{
    const r=await getAIRecommendations(currentControlId,answersText);hideTyping();
    if(r?.answer){
      let fmt=r.answer.replace(/\*\*(.*?)\*\*/g,'<strong style="color:#8b5cf6">$1</strong>').replace(/^(#{1,3})\s+(.+)$/gm,'<h3 style="color:#8b5cf6;margin:16px 0 8px;font-size:15px">$2</h3>').replace(/^(\d+\.)\s+/gm,'<br><strong style="color:#06b6d4">$1</strong> ').replace(/^[-•]\s+/gm,'<br>• ').replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
      appendMsg('ai',`<div style="border:1px solid rgba(139,92,246,0.3);border-radius:12px;padding:24px;background:rgba(139,92,246,0.05)"><div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(139,92,246,0.2)"><i class="fas fa-lightbulb" style="color:#8b5cf6;font-size:20px"></i><strong style="font-size:16px;color:#8b5cf6">Recommendations — ${currentControlId}</strong></div><div style="font-size:13.5px;line-height:1.9;color:var(--text-secondary)">${fmt}</div><div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(139,92,246,0.2);display:flex;gap:12px"><a href="evidence.html?control=${currentControlId}" style="flex:1;text-align:center;background:rgba(139,92,246,0.15);border:1px solid #8b5cf6;color:#8b5cf6;padding:12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600"><i class="fas fa-folder-open" style="margin-right:6px"></i>Evidence Vault</a><button onclick="window.print()" style="flex:0.4;background:rgba(6,182,212,0.1);border:1px solid #06b6d4;color:#06b6d4;padding:12px;border-radius:8px;cursor:pointer;font-size:13px"><i class="fas fa-print"></i> Print</button></div></div>`);
      try{await saveAuditRecommendation({control_id:currentControlDbId,session_id:currentSessionId,gap_description:answersText,recommendation:r.answer,priority:'High'});}catch(e){}
    }else{appendMsg('ai','Could not generate recommendations.');}
  }catch(e){hideTyping();appendMsg('ai',`<span style="color:#ef4444">Error.</span>`);}
}

async function saveProgress(ctrlId,status,score,yes,partial,no,total){
  const sl=document.getElementById('current-control-status');
  sl.textContent=status;sl.className=`badge ${status==='Compliant'?'badge-success':status==='Non-Compliant'?'badge-danger':'badge-warning'}`;
  const res=JSON.parse(localStorage.getItem('audit_results')||'{}');res[ctrlId]=status;localStorage.setItem('audit_results',JSON.stringify(res));
  const sco=JSON.parse(localStorage.getItem('audit_scores')||'{}');sco[ctrlId]=score;localStorage.setItem('audit_scores',JSON.stringify(sco));
  updateDot(ctrlId,status);
  const ev=document.getElementById('linked-evidence');ev.textContent=`Last audit: ${status} — ${score}%`;ev.style.color=getDotColor(status);
  try{await updateControlStatus(ctrlId,status);}catch(e){}
  try{const u=getCurrentUserLocal();const uid=u.id||u.user_id||parseInt(localStorage.getItem('authToken')?.match(/token_(\d+)_/)?.[1])||null;await saveComplianceScore({user_id:uid,control_id:currentControlDbId,session_id:currentSessionId,score,total_questions:total,answered_yes:yes,answered_partial:partial,answered_no:no});}catch(e){}
  if(currentSessionId){try{await completeAuditSession(currentSessionId,status,score);}catch(e){}}
}

function updateDot(id,status){const item=document.querySelector(`.control-item[data-id="${id}"]`);if(!item)return;const dot=item.querySelector('.status-dot');if(dot)dot.style.background=getDotColor(status);}

async function handleUserMessage(){
  const input=document.getElementById('user-query'),text=input.value.trim();
  if(!text)return;if(!currentControlId){appendMsg('ai','Select a control first.');return;}
  appendMsg('user',text);input.value='';const lid=appendLoading();
  try{const r=await callAIEngine(text,currentControlId,currentMode==='guide'?'guidance':currentMode);updateLoading(lid,(r.answer||'No answer.').replace(/\n/g,'<br>'));}
  catch(e){updateLoading(lid,`<span style="color:#ef4444">AI error.</span>`);}
}

function showTyping(){
  const cm=document.getElementById('chat-messages');if(document.getElementById('typing-indicator'))return;
  const ind=document.createElement('div');ind.id='typing-indicator';ind.className='message ai-message';
  ind.innerHTML=`<div class="message-content"><div class="message-header">AI</div><div class="message-text"><span style="display:inline-flex;gap:5px"><span style="width:7px;height:7px;border-radius:50%;background:var(--accent-primary);animation:bounce 1s infinite"></span><span style="width:7px;height:7px;border-radius:50%;background:var(--accent-primary);animation:bounce 1s infinite 0.2s"></span><span style="width:7px;height:7px;border-radius:50%;background:var(--accent-primary);animation:bounce 1s infinite 0.4s"></span></span></div></div>`;
  cm.appendChild(ind);cm.scrollTop=cm.scrollHeight;
  if(!document.getElementById('bounce-style')){const s=document.createElement('style');s.id='bounce-style';s.textContent='@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}';document.head.appendChild(s);}
}
function hideTyping(){const i=document.getElementById('typing-indicator');if(i)i.remove();}
function appendLoading(){const id='ld'+Date.now(),cm=document.getElementById('chat-messages'),d=document.createElement('div');d.id=id;d.className='message ai-message';d.innerHTML=`<div class="message-content"><div class="message-header">AI</div><div class="message-text"><em style="color:var(--text-muted)">Searching...</em></div></div>`;cm.appendChild(d);cm.scrollTop=cm.scrollHeight;return id;}
function updateLoading(id,text){const m=document.getElementById(id);if(m){m.querySelector('.message-text').innerHTML=text;document.getElementById('chat-messages').scrollTop=99999;}}
function appendMsg(role,text){const cm=document.getElementById('chat-messages'),d=document.createElement('div');d.className=`message ${role}-message`;d.innerHTML=`<div class="message-content"><div class="message-header">${role==='ai'?'CyberGuard AI':'Auditor'}</div><div class="message-text">${text}</div></div>`;cm.appendChild(d);cm.scrollTop=cm.scrollHeight;}
function setMode(mode){currentMode=mode;document.getElementById('audit-mode-btn').classList.toggle('active',mode==='audit');document.getElementById('guide-mode-btn').classList.toggle('active',mode==='guide');if(selectedControlInfo){const el=document.querySelector('.control-item.selected');if(el)selectControl(selectedControlInfo,el);}}
