// CyberGuard - Home Page v5
document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('authToken')) { window.location.href = 'login.html'; return; }
    loadUserToSidebar();
    const user = getCurrentUserLocal();
    const first = user.full_name ? user.full_name.split(' ')[0] : (user.username || 'User');
    const wEl = document.getElementById('welcome-message');
    if (wEl) wEl.textContent = `Welcome back, ${first}!`;
    await loadHomeStats();
    loadCyberAlerts();
});

async function loadHomeStats() {
    try {
        const stats = await getDashboardStats();
        const score = stats.compliance_score || 0;
        const gaps = stats.critical_gaps || 0;
        const scoreEl = document.getElementById('compliance-score-value');
        if (scoreEl) { scoreEl.textContent = score + '%'; scoreEl.style.color = score >= 80 ? 'var(--accent-success)' : score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)'; }
        const gEl = document.getElementById('critical-gaps-count');
        if (gEl) { gEl.textContent = gaps; gEl.style.color = gaps > 0 ? 'var(--accent-danger)' : 'var(--accent-success)'; }
        const hEl = document.getElementById('system-health-status');
        if (hEl) { hEl.textContent = score >= 70 ? 'Operational' : 'Needs Attention'; hEl.style.color = score >= 70 ? 'var(--accent-success)' : 'var(--accent-warning)'; }
        const aEl = document.getElementById('audited-controls-count');
        if (aEl) aEl.textContent = `${stats.audited_controls || 0} / ${stats.total_controls || 10}`;
    } catch (e) { console.error('Home stats error:', e); }
}

// ─── Latest Cybersecurity Alerts from NVD (NIST) ─────────────────────────
async function loadCyberAlerts() {
    const grid = document.getElementById('alerts-grid');
    const updatedEl = document.getElementById('alerts-updated');
    if (!grid) return;

    try {
        // NVD API - latest CRITICAL/HIGH CVEs (no API key needed)
        const url = 'https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=CRITICAL&resultsPerPage=6&startIndex=0';
        const controller = new AbortController();
        const _t = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(_t);

        if (!res.ok) throw new Error('NVD API error');
        const data = await res.json();
        const items = data.vulnerabilities || [];

        if (!items.length) throw new Error('No data');

        if (updatedEl) updatedEl.textContent = 'Live from NVD · ' + new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});

        grid.innerHTML = items.map(function(item) {
            var cve    = item.cve || {};
            var cveId  = cve.id || 'CVE-Unknown';
            var desc   = (cve.descriptions || []).find(function(d){ return d.lang === 'en'; });
            var body   = desc ? desc.value : 'No description available.';
            if (body.length > 160) body = body.substring(0, 160) + '…';

            var metrics = cve.metrics || {};
            var cvssData = null;
            if (metrics.cvssMetricV31 && metrics.cvssMetricV31[0]) {
                cvssData = metrics.cvssMetricV31[0].cvssData;
            } else if (metrics.cvssMetricV30 && metrics.cvssMetricV30[0]) {
                cvssData = metrics.cvssMetricV30[0].cvssData;
            }
            var score    = cvssData ? cvssData.baseScore : null;
            var severity = cvssData ? cvssData.baseSeverity : 'HIGH';
            var level    = severity === 'CRITICAL' ? 'critical' : severity === 'HIGH' ? 'warning' : 'info';
            var iconColor= level === 'critical' ? 'rgba(239,68,68,.15)' : level === 'warning' ? 'rgba(245,158,11,.15)' : 'rgba(6,182,212,.15)';
            var iconText = level === 'critical' ? '#ef4444' : level === 'warning' ? '#f59e0b' : '#06b6d4';
            var icon     = level === 'critical' ? 'fa-shield-xmark' : 'fa-triangle-exclamation';

            var published = cve.published ? new Date(cve.published).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';

            return '<div class="alert-card">' +
                '<div class="alert-icon" style="background:' + iconColor + '">' +
                    '<i class="fas ' + icon + '" style="color:' + iconText + '"></i>' +
                '</div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">' +
                        '<span class="alert-badge ' + level + '">' + severity + '</span>' +
                        (score ? '<span style="font-size:11px;color:' + iconText + ';font-weight:700">CVSS ' + score + '</span>' : '') +
                        '<span style="font-size:11px;color:var(--text-muted);font-family:monospace">' + cveId + '</span>' +
                        '<span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + published + '</span>' +
                    '</div>' +
                    '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px">' + cveId + ' — ' + severity + ' Vulnerability</div>' +
                    '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + body + '</div>' +
                    '<a href="https://nvd.nist.gov/vuln/detail/' + cveId + '" target="_blank" style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;font-size:11px;color:var(--accent-primary);text-decoration:none">' +
                        '<i class="fas fa-arrow-up-right-from-square"></i> View on NVD' +
                    '</a>' +
                '</div>' +
            '</div>';
        }).join('');

    } catch (e) {
        console.warn('NVD API unavailable, using fallback alerts:', e.message);
        // Fallback: static ECC-relevant alerts
        grid.innerHTML = [
            {level:'critical', icon:'fa-shield-xmark', score:'9.8', title:'Critical RCE in Enterprise VPN Solutions', body:'Remote code execution vulnerability affects major VPN products. Patch immediately — review ECC Control 1-5 Network Hardening.', source:'CISA', time:'Recent'},
            {level:'warning',  icon:'fa-triangle-exclamation', score:'7.5', title:'IAM Misconfiguration Leading to Privilege Escalation', body:'Improper access controls allow privilege escalation. Review ECC Control 1-6 Identity & Access Management policies.', source:'NVD', time:'Recent'},
            {level:'critical', icon:'fa-shield-xmark', score:'9.1', title:'Ransomware Exploiting Unpatched Windows Systems', body:'Active campaign targeting unpatched Windows servers. Verify ECC Control 1-8 Vulnerability Management is up to date.', source:'NCA', time:'Recent'},
            {level:'warning',  icon:'fa-triangle-exclamation', score:'8.2', title:'SQL Injection in Web Application Frameworks', body:'Critical SQL injection vulnerability in popular frameworks. Validate ECC Control 1-5 application security controls.', source:'NVD', time:'Recent'},
            {level:'info',     icon:'fa-circle-info', score:'6.5', title:'ECC-2023 Framework Clarification Released', body:'NCA released updated guidance on cloud security sub-controls and third-party risk management requirements.', source:'NCA Official', time:'Recent'},
            {level:'warning',  icon:'fa-triangle-exclamation', score:'7.8', title:'Data Exfiltration via Misconfigured S3 Buckets', body:'Cloud storage misconfigurations leading to data exposure. Review ECC Control 1-7 Data Protection requirements.', source:'CISA', time:'Recent'}
        ].map(function(a) {
            var iconColor = a.level==='critical' ? 'rgba(239,68,68,.15)' : a.level==='warning' ? 'rgba(245,158,11,.15)' : 'rgba(6,182,212,.15)';
            var iconText  = a.level==='critical' ? '#ef4444' : a.level==='warning' ? '#f59e0b' : '#06b6d4';
            return '<div class="alert-card">' +
                '<div class="alert-icon" style="background:' + iconColor + '"><i class="fas ' + a.icon + '" style="color:' + iconText + '"></i></div>' +
                '<div style="flex:1;min-width:0">' +
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">' +
                        '<span class="alert-badge ' + a.level + '">' + a.level + '</span>' +
                        '<span style="font-size:11px;color:' + iconText + ';font-weight:700">CVSS ' + a.score + '</span>' +
                        '<span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + a.source + '</span>' +
                    '</div>' +
                    '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px">' + a.title + '</div>' +
                    '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + a.body + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
        if (updatedEl) updatedEl.textContent = 'Cached alerts — NVD unavailable';
    }
}
