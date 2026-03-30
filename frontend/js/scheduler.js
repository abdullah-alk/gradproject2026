// CyberGuard Scheduler v6 - PRODUCTION (Fixed Validation)
let countdownInterval=null;

document.addEventListener('DOMContentLoaded',async()=>{
  if(!checkAuth())return;
  loadUserToSidebar();
  await loadSchedulerData();
  document.getElementById('schedule-manual-audit-btn')?.addEventListener('click',handleScheduleManualAudit);
  document.getElementById('enable-auto-scheduling')?.addEventListener('change',e=>toggleAutoScheduling(e.target.checked));
});

async function loadSchedulerData(){
  try{
    showLoader();
    const stats=await getDashboardStats();
    const score=stats.compliance_score||0;
    const gaps=stats.critical_gaps||0;
    const daysRec=gaps>3?7:gaps>0?14:30;
    
    // Update AI recommendation
    const recEl=document.getElementById('ai-recommendation-content');
    if(recEl){
      recEl.innerHTML=`Based on your current compliance score (<strong>${score}%</strong>) and <strong>${gaps} critical gap${gaps!==1?'s':''}</strong>, we recommend scheduling the next audit within <strong>${daysRec} days</strong>, with priority focus on the lowest-scoring domains.`;
    }
    
    // Start countdown
    if(stats.next_audit_date){
      startCountdown(new Date(stats.next_audit_date));
    }else{
      const d=new Date();
      d.setDate(d.getDate()+daysRec);
      startCountdown(d);
    }
    
    hideLoader();
  }catch(e){
    console.error('Scheduler load error:',e);
    hideLoader();
    // Fallback countdown
    const d=new Date();
    d.setDate(d.getDate()+14);
    startCountdown(d);
  }
}

function startCountdown(target){
  if(countdownInterval)clearInterval(countdownInterval);
  
  const tick=()=>{
    const diff=target-new Date();
    if(diff<=0){
      updateDisplay(0,0,0);
      clearInterval(countdownInterval);
      return;
    }
    
    const days=Math.floor(diff/86400000);
    const hours=Math.floor((diff%86400000)/3600000);
    const mins=Math.floor((diff%3600000)/60000);
    
    updateDisplay(days,hours,mins);
  };
  
  tick();
  countdownInterval=setInterval(tick,60000); // Update every minute
}

function updateDisplay(d,h,m){
  const set=(id,v)=>{
    const el=document.getElementById(id);
    if(el)el.textContent=String(v).padStart(2,'0');
  };
  set('countdown-days',d);
  set('countdown-hours',h);
  set('countdown-minutes',m);
}

async function handleScheduleManualAudit(){
  const dateInput=document.getElementById('manual-audit-date');
  
  // Validation 1: Date selected
  if(!dateInput||!dateInput.value){
    alert('⚠️ Please select an audit date.');
    return;
  }
  
  // Validation 2: Parse date
  let selectedDate;
  try{
    selectedDate=new Date(dateInput.value+'T00:00:00');
  }catch(e){
    alert('❌ Invalid date format.');
    return;
  }
  
  // Validation 3: Not in the past
  const today=new Date();
  today.setHours(0,0,0,0);
  
  if(selectedDate<today){
    alert('❌ Audit date cannot be in the past. Please select today or a future date.');
    return;
  }
  
  // Validation 4: Not too far in the future (1 year max)
  const maxDate=new Date();
  maxDate.setFullYear(maxDate.getFullYear()+1);
  
  if(selectedDate>maxDate){
    alert('❌ Audit date cannot be more than 1 year in the future.');
    return;
  }
  
  showLoader();
  
  try{
    // Call backend API
    await scheduleAudit({
      audit_date:dateInput.value,
      scope:document.getElementById('audit-scope-select')?.value||'full',
      assigned_auditor:document.getElementById('assigned-auditor-select')?.value||'security-team'
    });
    
    // Update countdown
    startCountdown(selectedDate);
    
    // Format date for display
    const dateStr=selectedDate.toLocaleDateString('en-US',{
      weekday:'long',
      year:'numeric',
      month:'long',
      day:'numeric'
    });
    
    alert(`✅ Audit successfully scheduled for ${dateStr}`);
    
    // Clear form
    dateInput.value='';
    
  }catch(e){
    console.error('Schedule error:',e);
    alert('❌ Failed to schedule audit. Please try again.');
  }finally{
    hideLoader();
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload',()=>{
  if(countdownInterval)clearInterval(countdownInterval);
});