// CyberGuard Evidence v6 - PRODUCTION (Fixed Filter)
let currentEvidenceList=[];

document.addEventListener('DOMContentLoaded',async()=>{
  if(!checkAuth())return;
  loadUserToSidebar();
  checkURLParams();
  await loadEvidenceList();
  ['search-input','domain-filter','status-filter'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener(id==='search-input'?'input':'change',filterEvidence);
  });
});

function checkURLParams(){
  const p=new URLSearchParams(window.location.search);
  const control=p.get('control'),status=p.get('status'),score=p.get('score');
  if(!control&&!status)return;
  const color=status==='Compliant'?'#10b981':status==='Partial'?'#f59e0b':'#ef4444';
  const wrapper=document.querySelector('.content-wrapper');if(!wrapper)return;
  const banner=document.createElement('div');
  banner.style.cssText=`background:${color}10;border:1px solid ${color}40;border-radius:12px;padding:20px 24px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px`;
  banner.innerHTML=`<div><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase">Latest Audit Result</div><div style="font-size:18px;font-weight:700">Control <span style="color:var(--accent-primary)">${control}</span> — <span style="color:${color}">${status||'N/A'}</span>${score?` <span style="color:var(--text-muted);font-size:14px">(${score}%)</span>`:''}</div></div><a href="chatbot.html" style="display:inline-flex;align-items:center;gap:8px;background:rgba(6,182,212,.1);border:1px solid var(--accent-primary);color:var(--accent-primary);padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600"><i class="fas fa-robot"></i>New Audit</a>`;
  wrapper.insertBefore(banner,wrapper.firstChild);
}

async function loadEvidenceList(){
  try{
    showLoader();
    let data=[];
    try{data=await getEvidenceList();}catch(e){console.error('API error:',e);}
    if(!data||data.length===0)data=buildFromLocalStorage();
    currentEvidenceList=data;
    renderEvidenceTable(currentEvidenceList);
    hideLoader();
  }catch(e){
    console.error('Load error:',e);
    currentEvidenceList=buildFromLocalStorage();
    renderEvidenceTable(currentEvidenceList);
    hideLoader();
  }
}

function buildFromLocalStorage(){
  const res=JSON.parse(localStorage.getItem('audit_results')||'{}');
  const sco=JSON.parse(localStorage.getItem('audit_scores')||'{}');
  const domainMap={'1-1':'Governance','1-2':'Risk','1-3':'Assets','1-4':'Operations','1-5':'Network','1-6':'Identity','1-7':'Data','1-8':'Vulnerability','1-9':'Incident','1-10':'Physical'};
  const titleMap={'1-1':'Cybersecurity Governance','1-2':'Risk Management','1-3':'Asset Management','1-4':'Cybersecurity Operations','1-5':'System & Network Hardening','1-6':'Identity & Access Management','1-7':'Data Protection','1-8':'Vulnerability Management','1-9':'Incident Defense','1-10':'Physical Security'};
  return Object.entries(res).map(([id,status],i)=>({
    id:i+1,
    control_code:id,
    control_id:id,
    domain:domainMap[id]||'General',
    title:`Audit Report — ${titleMap[id]||id}`,
    status,
    score:sco[id]??null,
    created_at:new Date().toISOString(),
    file_path:null
  }));
}

function renderEvidenceTable(list){
  const tbody=document.getElementById('evidence-table-body');if(!tbody)return;
  tbody.innerHTML='';
  if(list.length===0){
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:60px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:48px;display:block;margin-bottom:16px;opacity:.4"></i><div style="font-size:16px;margin-bottom:8px">No evidence found</div><small>Complete an audit to generate records</small><br><a href="chatbot.html" style="display:inline-flex;align-items:center;gap:8px;margin-top:16px;color:var(--accent-primary);border:1px solid var(--accent-primary);padding:8px 20px;border-radius:8px;text-decoration:none;font-size:13px"><i class="fas fa-robot"></i>Go to Chatbot</a></td></tr>`;
    return;
  }
  list.forEach(item=>{
    const color=item.status==='Compliant'?'success':item.status==='Partial'?'warning':'danger';
    const tr=document.createElement('tr');tr.style.borderBottom='1px solid #334155';
    tr.innerHTML=`
      <td style="padding:16px;font-family:monospace;font-weight:700;color:var(--accent-primary)">${item.control_code||item.control_id||'—'}</td>
      <td style="padding:16px"><div style="display:flex;align-items:center;gap:10px"><i class="fas fa-file-shield" style="color:var(--accent-primary);font-size:18px"></i><div><div style="font-weight:600;color:var(--text-primary)">${item.title||'Audit Report'}</div><div style="font-size:11px;color:var(--text-muted)">${item.domain||''}${item.score!==null&&item.score!==undefined?' — Score: '+item.score+'%':''}</div></div></div></td>
      <td style="padding:16px"><span class="badge badge-${color}">${item.status||'Pending'}</span></td>
      <td style="padding:16px;color:var(--text-muted)">${formatDate(item.created_at)}</td>
      <td style="padding:16px;color:var(--text-muted)">${item.file_path?'File Uploaded':'AI Generated'}</td>
      <td style="padding:16px;text-align:right"><a href="chatbot.html?control=${item.control_code||item.control_id}" title="Re-Audit" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:6px;background:rgba(6,182,212,.1);color:var(--accent-primary);text-decoration:none;border:1px solid rgba(6,182,212,.2)"><i class="fas fa-redo" style="font-size:12px"></i></a></td>`;
    tbody.appendChild(tr);
  });
}

function filterEvidence(){
  const search=(document.getElementById('search-input')?.value||'').toLowerCase();
  const domain=document.getElementById('domain-filter')?.value||'all';
  const status=document.getElementById('status-filter')?.value||'all';
  
  const filtered=currentEvidenceList.filter(i=>{
    // Search match
    const controlCode=(i.control_code||i.control_id||'').toLowerCase();
    const title=(i.title||'').toLowerCase();
    const matchSearch=!search||controlCode.includes(search)||title.includes(search);
    
    // Domain match - FIXED: exact match only
    const matchDomain=domain==='all'||i.domain===domain;
    
    // Status match - FIXED: normalize both sides
    const itemStatus=(i.status||'').toLowerCase().replace(/[- ]/g,'');
    const filterStatus=status.toLowerCase().replace(/[- ]/g,'');
    const matchStatus=status==='all'||itemStatus===filterStatus||itemStatus.includes(filterStatus);
    
    return matchSearch&&matchDomain&&matchStatus;
  });
  
  renderEvidenceTable(filtered);
}