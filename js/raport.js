// ============================================================
// KONFIGURASI GLOBAL
// ============================================================
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const API_URL = "https://script.google.com/macros/s/AKfycbxH9YKIi5epf2PvsJL9Whens2URSaZzi1aciTEiyIYitVBvjJP83tNa-B9xaIuN5f-3/exec";
const FALLBACK_IMAGE = GITHUB_LOGO_URL;
const logsMap = new Map();
let fetchDebounceTimer = null;
let appConfig = { jPulang: "16:00" };

// ============================================================
// PWA MANIFEST
// ============================================================
try {
    const mf = { 
        name: "E-PUSDA UPT Management", 
        short_name: "E-PUSDA", 
        start_url: "raport.html", 
        scope: "./", 
        display: "standalone", 
        background_color: "#0d1b3e", 
        theme_color: "#1e40af", 
        icons: [
            { src: GITHUB_LOGO_URL, sizes: "192x192", type: "image/png" },
            { src: GITHUB_LOGO_URL, sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ] 
    };
    const uri = 'data:application/manifest+json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(mf))));
    const el = document.getElementById('pwaManifest');
    if (el) el.setAttribute('href', uri);
    else { 
        const l = document.createElement('link'); 
        l.rel = 'manifest'; 
        l.href = uri; 
        document.head.appendChild(l); 
    }
} catch(e) { 
    console.warn('Manifest init failed:', e); 
}

// ============================================================
// LAZY LOAD OBSERVER
// ============================================================
const imageObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => { 
        if (en.isIntersecting) { 
            const img = en.target; 
            if (img.dataset.src) img.src = img.dataset.src; 
            img.classList.remove('lazy-img'); 
            obs.unobserve(img); 
        } 
    });
}, { rootMargin: '200px' });

// Cleanup observer
window.addEventListener('beforeunload', () => {
    if (imageObserver) imageObserver.disconnect();
});

// ============================================================
// FETCH DENGAN TIMEOUT
// ============================================================
function fetchWithTimeout(url, opts = {}, timeout = 30000) {
    const localController = new AbortController();
    const tid = setTimeout(() => localController.abort(new DOMException('Timeout ' + timeout + 'ms', 'AbortError')), timeout);
    return fetch(url, { ...opts, signal: localController.signal }).finally(() => clearTimeout(tid));
}

async function safeFetchJSON(url, opts = {}, timeout = 30000) {
    const res = await fetchWithTimeout(url, opts, timeout);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    if (!txt || !txt.trim()) throw new Error('Response kosong');
    if (txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) throw new Error('Server return HTML error');
    try { return JSON.parse(txt); } catch(e) { throw new Error('Parse JSON gagal: ' + e.message); }
}

// ============================================================
// UTILITIES
// ============================================================
function getLocalDateString(d) { 
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); 
}

function initFilters() { 
    const now = new Date(), 
          firstDay = new Date(now.getFullYear(), now.getMonth(), 1); 
    document.getElementById('startD').value = getLocalDateString(firstDay); 
    document.getElementById('endD').value = getLocalDateString(now); 
}

// ============================================================
// GET SMART URL - Untuk foto Google Drive
// ============================================================
function getSmartUrl(url) {
    if (!url) return FALLBACK_IMAGE;
    if (url.includes("googleusercontent")) return url.split("=")[0] + "=s500";
    if (url.includes("drive.google.com")) {
        let fileId = "";
        const match = url.match(/\/d\/([^\/\?]+)/);
        if (match && match[1]) fileId = match[1];
        if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
        return url.replace("/view", "/preview");
    }
    return url;
}

// ============================================================
// FORMAT SCORE - Hilangkan .0 jika bulat
// ============================================================
function formatScore(score) {
    const num = parseFloat(score);
    if (num === 0) return '0';
    if (Number.isInteger(num)) return num.toString();
    return num.toFixed(1);
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'info') {
    let c = document.getElementById('toastContainer');
    if (!c) { 
        c = document.createElement('div'); 
        c.id = 'toastContainer'; 
        c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:10px;pointer-events:none;'; 
        document.body.appendChild(c); 
    }
    const t = document.createElement('div');
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const color = colors[type] || colors.info;
    t.style.cssText = `background:rgba(15,23,42,0.95);backdrop-filter:blur(15px);color:white;padding:14px 20px;border-radius:14px;border-left:4px solid ${color};box-shadow:0 10px 30px rgba(0,0,0,0.4);font-size:0.9rem;font-weight:600;max-width:380px;pointer-events:auto;animation:slideInRight 0.3s ease-out;`;
    t.innerHTML = `<div style="font-weight:800;text-transform:uppercase;font-size:0.7rem;color:${color};margin-bottom:4px;letter-spacing:1px">${type}</div><div>${msg}</div>`;
    c.appendChild(t);
    setTimeout(() => { 
        t.style.opacity = '0'; 
        t.style.transition = 'opacity 0.4s'; 
        setTimeout(() => t.remove(), 400); 
    }, 4000);
}

// ============================================================
// LOADING SKELETON
// ============================================================
function toggleLoading(show) {
    const grid = document.getElementById('raportGrid');
    if (!grid) return;
    if (show) {
        let s = '';
        for (let i = 0; i < 6; i++) {
            s += `<div class="skeleton-card">
                    <div class="skel-top">
                        <div class="skel-photo shimmer"></div>
                        <div class="skel-info">
                            <div class="skel-line w-60 shimmer"></div>
                            <div class="skel-line w-40 shimmer"></div>
                        </div>
                        <div class="skel-grade shimmer"></div>
                    </div>
                    <div class="skel-body">
                        <div class="skel-score shimmer"></div>
                        <div class="skel-stats">
                            <div class="skel-stat-pill shimmer"></div>
                            <div class="skel-stat-pill shimmer"></div>
                            <div class="skel-stat-pill shimmer"></div>
                            <div class="skel-stat-pill shimmer"></div>
                        </div>
                    </div>
                </div>`;
        }
        grid.innerHTML = s;
    }
}

function buildReportUrl() {
    const start = document.getElementById('startD').value, 
          end = document.getElementById('endD').value, 
          reg = document.getElementById('wilF').value;
    const searchEl = document.getElementById('searchName'), 
          search = searchEl ? searchEl.value.trim() : '';
    return `${API_URL}?action=getReportData&start=${start}&end=${end}&region=${encodeURIComponent(reg)}&detail=true&limit=9999&search=${encodeURIComponent(search)}`;
}

// ============================================================
// APP INIT
// ============================================================
async function initApp() {
    lucide.createIcons(); 
    initFilters();
    
    const printDate = document.getElementById('printDate');
    if (printDate) {
        printDate.innerText = new Date().toLocaleDateString('id-ID', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
        });
    }
    
    setInterval(() => { 
        const el = document.getElementById('liveClock'); 
        if(el) el.innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); 
    }, 1000);
    
    if (!document.getElementById('raport-toast-style')) {
        const style = document.createElement('style'); 
        style.id = 'raport-toast-style';
        style.innerHTML = '@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
        document.head.appendChild(style);
    }
    
    logsMap.clear();
    triggerReportFetch();
    fetchDashboardDataInBackground();
    
    setTimeout(() => {
        const grid = document.getElementById('raportGrid');
        if (grid && grid.querySelector('.skeleton-card')) {
            console.warn('Safety net: Force hide skeleton');
            renderCards([]);
            showToast('Koneksi lambat. Menggunakan mode offline.', 'warning');
        }
    }, 12000);
}

// ============================================================
// FETCH REPORT (VERSI FINAL)
// ============================================================
async function fetchReportDataInBackground(attempt = 1) {
    const btn = document.querySelector('.btn-update');
    try {
        const result = await safeFetchJSON(buildReportUrl(), {}, 30000);
        if (result.status === 'success' || Array.isArray(result.data)) {
            renderCards(result.data || []);
            toggleLoading(false);
        } else {
            renderCards([]);
            toggleLoading(false);
        }
    } catch(e) {
        const isAbort = e.name === 'AbortError' || (e.message && e.message.includes('Timeout'));
        if (isAbort && attempt < 3) {
            showToast(`Koneksi lambat, mencoba ulang (${attempt}/3)...`, 'warning');
            setTimeout(() => fetchReportDataInBackground(attempt + 1), 1500);
            return;
        }
        if (!isAbort) showToast('Gagal memuat laporan: ' + e.message, 'error');
        else showToast('Koneksi timeout. Periksa jaringan Anda.', 'error');
        renderCards([]);
        toggleLoading(false);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="refresh-cw" size="18"></i> UPDATE';
            lucide.createIcons({ node: btn });
        }
    }
}

async function fetchDashboardDataInBackground() {
    try {
        const dashData = await safeFetchJSON(API_URL + "?action=getDashboardData", {}, 10000);
        if (dashData && dashData.config) {
            appConfig = dashData.config;
            const sl = document.getElementById('sidebarLogo'), 
                  pl = document.getElementById('printKopLogo');
            if(sl) sl.src = dashData.config.Logo; 
            if(pl) pl.src = dashData.config.Logo;
        }
        if (dashData && Array.isArray(dashData.pegawai)) {
            const sel = document.getElementById('wilF');
            if (sel) {
                const currentOptions = Array.from(sel.options).map(o => o.value);
                const wilayahList = [...new Set(dashData.pegawai.map(p => p.Wilayah || p.wilayah).filter(w => w))];
                wilayahList.forEach(w => { 
                    if (!currentOptions.includes(w)) { 
                        const opt = document.createElement('option'); 
                        opt.value = w; 
                        opt.innerText = w; 
                        sel.appendChild(opt); 
                    } 
                });
            }
        }
    } catch(e) { 
        console.warn('Dashboard fetch gagal:', e.message); 
    }
}

// ============================================================
// DEBOUNCE TRIGGER (VERSI FINAL)
// ============================================================
function triggerReportFetch() {
    const btn = document.querySelector('.btn-update');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" size="18" class="spin"></i> MEMUAT...';
        lucide.createIcons({ node: btn });
    }
    
    clearTimeout(fetchDebounceTimer);
    fetchDebounceTimer = setTimeout(() => {
        logsMap.clear();
        toggleLoading(true);
        fetchReportDataInBackground();
    }, 300);
}

// ============================================================
// CALENDAR BUILDER
// ============================================================
function buildCalendarHTML(logs, startDateStr) {
    const startDate = new Date(startDateStr), 
          year = startDate.getFullYear(), 
          month = startDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const firstDayDate = new Date(year, month, 1);
    let firstDayOfWeek = firstDayDate.getDay();
    firstDayOfWeek = (firstDayOfWeek === 0) ? 6 : firstDayOfWeek - 1;
    
    const logMap = {};
    (logs || []).forEach(l => { 
        const d = new Date(l.date); 
        if (!isNaN(d)) logMap[d.getDate()] = l; 
    });
    
    // Ambil hari libur dari config (jika ada)
    const liburDates = [];
    // ... bisa ditambahkan dari config jika ada
    
    const frag = document.createDocumentFragment();
    const wrap = document.createElement('div'); 
    wrap.className = 'calendar-wrapper';
    
    const header = document.createElement('div'); 
    header.className = 'calendar-header';
    ['Sen','Sel','Rab','Kam','Jum','Sab','Min'].forEach(d => { 
        const el = document.createElement('div'); 
        el.textContent = d; 
        header.appendChild(el); 
    });
    wrap.appendChild(header);
    
    const grid = document.createElement('div'); 
    grid.className = 'calendar-micro-grid';
    
    for (let i = 0; i < firstDayOfWeek; i++) { 
        const el = document.createElement('div'); 
        el.className = 'day-box'; 
        el.style.visibility = 'hidden'; 
        grid.appendChild(el); 
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jamPulang = parseInt(appConfig?.Jam_Pulang?.split(':')[0] || 16);
    
    for (let i = 1; i <= totalDays; i++) {
        const currentDate = new Date(year, month, i);
        const dayOfWeek = currentDate.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const isLibur = liburDates.includes(i);
        const log = logMap[i];
        const box = document.createElement('div');
        box.className = 'day-box';
        
        const numEl = document.createElement('span');
        numEl.className = 'day-num';
        numEl.textContent = String(i).padStart(2, '0');
        box.appendChild(numEl);
        
        const indEl = document.createElement('span');
        indEl.className = 'day-indicator';
        
        // HARI LIBUR
        if (isLibur) {
            box.classList.add('libur');
            indEl.textContent = 'L';
            const tooltip = document.createElement('div'); 
            tooltip.className = 'day-tooltip';
            tooltip.innerHTML = '<div class="tooltip-status">Hari Libur</div>';
            box.appendChild(tooltip);
        }
        // HARI DENGAN LOG
        else if (log) {
            const status = (log.status || "").toLowerCase().trim();
            const isValid = (log.score > 0) || log.color;
            
            if (isValid) {
                box.style.color = 'white';
                indEl.style.color = 'rgba(255,255,255,0.9)';
                
                if (status.includes('hadir 100%')) {
                    box.style.background = '#16a34a'; 
                    indEl.textContent = '100%';
                } else if (status.includes('hadir 50%')) {
                    box.style.background = 'linear-gradient(to top, #bbf7d0 50%, #ffffff 50%)'; 
                    box.style.color = '#1f2937'; 
                    indEl.style.color = '#1f2937'; 
                    indEl.textContent = '50%';
                } else if (status.includes('qr 100%')) {
                    box.style.background = '#7c3aed'; 
                    indEl.textContent = 'QR';
                } else if (status.includes('qr 50%')) {
                    box.style.background = 'linear-gradient(to top, #ddd6fe 50%, #ffffff 50%)'; 
                    box.style.color = '#1f2937'; 
                    indEl.style.color = '#1f2937'; 
                    indEl.textContent = 'QR';
                } else if (status.includes('telat ringan')) {
                    box.style.background = '#facc15'; 
                    box.style.color = '#1f2937'; 
                    indEl.style.color = '#1f2937'; 
                    indEl.textContent = 'TR';
                } else if (status.includes('telat berat')) {
                    box.style.background = '#f97316'; 
                    indEl.textContent = 'TB';
                } else if (status.includes('izin')) {
                    box.style.background = '#9333ea'; 
                    indEl.textContent = 'I';
                } else if (status.includes('sakit')) {
                    box.style.background = '#2563eb'; 
                    indEl.textContent = 'S';
                } else if (status.includes('dinas')) {
                    box.style.background = '#d97706'; 
                    indEl.textContent = 'D';
                }
                
                const ket = log.ket || log.keterangan || '-';
                const tooltip = document.createElement('div'); 
                tooltip.className = 'day-tooltip';
                tooltip.innerHTML = `<div class="tooltip-status">${log.status || '-'}</div><div class="tooltip-nilai">Nilai: ${log.score || 0}</div><div class="tooltip-ket">${ket}</div>`;
                box.appendChild(tooltip);
                
                if (isWeekend) box.classList.add('weekend');
            } else if (isWeekend) {
                box.classList.add('weekend');
            }
        } 
        // HARI KOSONG (TANPA LOG)
        else {
            if (isWeekend) {
                box.classList.add('weekend');
            } else {
                const cellDate = new Date(year, month, i);
                cellDate.setHours(0, 0, 0, 0);

                if (cellDate.getTime() === today.getTime()) {
                    // HARI INI
                    if (new Date().getHours() >= jamPulang) {
                        box.style.background = '#dc2626'; 
                        indEl.textContent = 'A';
                        const tooltip = document.createElement('div'); 
                        tooltip.className = 'day-tooltip';
                        tooltip.innerHTML = '<div class="tooltip-status">Alpha (Terlewat)</div><div class="tooltip-nilai">Nilai: 0</div>';
                        box.appendChild(tooltip);
                    } else {
                        box.style.background = '#f3f4f6'; 
                        box.style.color = '#9ca3af'; 
                        indEl.style.color = '#9ca3af';
                        indEl.textContent = '⌛';
                        const tooltip = document.createElement('div'); 
                        tooltip.className = 'day-tooltip';
                        tooltip.innerHTML = '<div class="tooltip-status">Menunggu Absensi</div><div class="tooltip-nilai">Nilai: 0</div>';
                        box.appendChild(tooltip);
                    }
                } else if (cellDate < today) {
                    // HARI LAMPAU
                    box.style.background = '#dc2626'; 
                    indEl.textContent = 'A';
                    const tooltip = document.createElement('div'); 
                    tooltip.className = 'day-tooltip';
                    tooltip.innerHTML = '<div class="tooltip-status">Alpha (Tidak Hadir)</div><div class="tooltip-nilai">Nilai: 0</div>';
                    box.appendChild(tooltip);
                } else {
                    // HARI MENDATANG
                    box.style.background = '#f9fafb'; 
                    box.style.color = '#d1d5db';
                }
            }
        }
        box.appendChild(indEl);
        grid.appendChild(box);
    }
    
    wrap.appendChild(grid);
    frag.appendChild(wrap);
    
    const temp = document.createElement('div'); 
    temp.appendChild(frag);
    return temp.innerHTML;
}

// ============================================================
// RENDER CARDS
// ============================================================
function renderCards(data) {
    const container = document.getElementById('raportGrid');
    if (!container) return;
    
    try {
        if (!data || !data.length) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="file-x" size="48"></i><h3>Tidak Ada Data Kinerja</h3><p>Tidak ditemukan data presensi untuk periode dan wilayah yang dipilih.</p></div>`;
            const printGrid = document.getElementById('printGrid');
            if (printGrid) printGrid.innerHTML = '';
            lucide.createIcons();
            return;
        }
        
        data.sort((a, b) => (b.score || 0) - (a.score || 0));
        const fragment = document.createDocumentFragment();
        
        data.forEach(p => {
            const card = document.createElement('div');
            card.className = 'pegawai-card';
            card.dataset.pegawaiId = p.id || p.ID;
            
            const telatTotal = (p.stats?.telatRingan || 0) + (p.stats?.telatBerat || 0);
            const sidTotal = (p.stats?.izin || 0) + (p.stats?.sakit || 0) + (p.stats?.dinas || 0);
            const hadirQrTotal = (p.stats?.hadir || 0) + (p.stats?.qrHadir || 0);
            const alpha = p.stats?.alpha || 0;
            
            if (p.logs && p.logs.length > 0) logsMap.set(String(p.id || p.ID), p.logs);
            const scoreColor = (p.score || 0) >= 75 ? 'var(--success)' : ((p.score || 0) >= 60 ? 'var(--warning)' : 'var(--danger)');
            
            card.innerHTML = `
                <div class="card-top">
                    <div class="photo-frame-pro">
                        <img data-src="${getSmartUrl(p.foto)}" class="lazy-img" src="${FALLBACK_IMAGE}" onerror="this.src='${FALLBACK_IMAGE}'">
                    </div>
                    <div class="id-group">
                        <h3>${p.nama || 'N/A'}</h3>
                        <p>${p.jabatan || 'N/A'} | ${p.wilayah || 'N/A'}</p>
                    </div>
                    <div class="grade-badge">${p.grade || '-'}</div>
                </div>
                <div class="card-body">
                    <div class="performance-main">
                        <span>Kinerja Kumulatif</span>
                        <b>${formatScore(p.score)}</b>
                        <div class="progress-track">
                            <div class="progress-fill" style="width:${Math.min(p.score || 0, 100)}%;background:${scoreColor}"></div>
                        </div>
                    </div>
                    <div class="stats-summary">
                        <div class="stat-pill stat-hadir">
                            <b>${hadirQrTotal}</b>
                            <span>Hadir/QR</span>
                        </div>
                        <div class="stat-pill stat-telat">
                            <b>${telatTotal}</b>
                            <span>Telat</span>
                        </div>
                        <div class="stat-pill stat-alpha ${alpha > 0 ? 'bad' : 'good'}">
                            <b>${alpha}</b>
                            <span>Alpha</span>
                        </div>
                        <div class="stat-pill stat-sid">
                            <b>${sidTotal}</b>
                            <span>S/I/D</span>
                        </div>
                    </div>
                </div>
                <button class="detail-toggle-btn">
                    <i data-lucide="chevron-down" size="14"></i> Detail Aktivitas Bulanan
                </button>
                <div class="hidden-calendar-panel"></div>
            `;
            fragment.appendChild(card);
        });
        
        container.innerHTML = '';
        container.appendChild(fragment);
        document.querySelectorAll('.lazy-img').forEach(img => imageObserver.observe(img));
        lucide.createIcons();
        
        document.querySelectorAll('.detail-toggle-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const card = this.closest('.pegawai-card');
                toggleDetail(this, card, card.dataset.pegawaiId);
            });
        });
    } catch(e) {
        console.error('Render error:', e);
        container.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle" size="48"></i><h3>Error Render</h3><p>${e.message}</p></div>`;
        lucide.createIcons();
    }
}

function toggleDetail(btn, card, pegawaiId) {
    const panel = card.querySelector('.hidden-calendar-panel');
    const isActive = panel.classList.toggle('active');
    if (isActive) {
        btn.innerHTML = '<i data-lucide="chevron-up" size="14"></i> Sembunyikan Aktivitas';
        const logs = logsMap.get(String(pegawaiId)) || [];
        const startDate = document.getElementById('startD').value;
        panel.innerHTML = buildCalendarHTML(logs, startDate);
    } else {
        btn.innerHTML = '<i data-lucide="chevron-down" size="14"></i> Detail Aktivitas Bulanan';
    }
    lucide.createIcons({ node: btn });
}

// ============================================================
// PRINT & PDF
// ============================================================
window.onbeforeprint = () => { 
    const pg = document.getElementById('printGrid'); 
    if (pg) { 
        pg.innerHTML = document.getElementById('raportGrid').innerHTML; 
        lucide.createIcons(); 
    } 
};

function openPDFGenerator() { 
    const start = document.getElementById('startD').value, 
          end = document.getElementById('endD').value;
    if (!start || !end) {
        showToast('Pilih rentang tanggal terlebih dahulu!', 'warning');
        return;
    }
    try {
        const reg = document.getElementById('wilF').value; 
        window.open(`generate-pdf.html?start=${start}&end=${end}&region=${encodeURIComponent(reg)}`, '_blank');
    } catch(e) {
        window.print();
    }
}

// ============================================================
// START
// ============================================================
window.onload = initApp;