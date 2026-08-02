// KONFIGURASI GLOBAL
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const API_URL = "https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec";
const FALLBACK_IMAGE = GITHUB_LOGO_URL;

const logsMap = new Map();

// INISIALISASI PWA MANIFEST
const manifest = {
    "name": "E-PUSDA UPT Management",
    "short_name": "E-PUSDA",
    "start_url": "./",
    "display": "standalone",
    "background_color": "#0d1b3e",
    "theme_color": "#1e40af",
    "icons": [
        { "src": GITHUB_LOGO_URL, "sizes": "192x192", "type": "image/png" },
        { "src": GITHUB_LOGO_URL, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
    ]
};
document.getElementById('pwaManifest').setAttribute('href', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest)));

// LAZY LOAD IMAGE OBSERVER
const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy-img');
            observer.unobserve(img);
        }
    });
}, { rootMargin: '100px' });

// UTILITY FUNCTIONS
function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getSmartUrl(url) {
    if (!url) return FALLBACK_IMAGE;
    if (url.includes("googleusercontent")) return url.split("=")[0] + "=s500";
    if (url.includes("drive.google.com")) return url.replace("/view", "/preview");
    return url;
}

function initFilters() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('startD').value = getLocalDateString(firstDay);
    document.getElementById('endD').value = getLocalDateString(now);
}

function toggleLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if(show) overlay.classList.add('active');
    else overlay.classList.remove('active');
}

function buildReportUrl() {
    const start = document.getElementById('startD').value;
    const end = document.getElementById('endD').value;
    const reg = document.getElementById('wilF').value;
    return `${API_URL}?action=getReportData&start=${start}&end=${end}&region=${reg}&detail=true`;
}

// APP INITIALIZATION
async function initApp() {
    lucide.createIcons();
    initFilters();
    document.getElementById('printDate').innerText = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    setInterval(() => {
        const el = document.getElementById('liveClock');
        if (el) el.innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }, 1000);

    const cached = localStorage.getItem('pusda_raport_cache');
    let cacheValid = false;
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.time < 300000) {
                renderCards(parsed.data);
                cacheValid = true;
                toggleLoading(false);
            }
        } catch(e) {
            localStorage.removeItem('pusda_raport_cache');
        }
    }

    if (!cacheValid) toggleLoading(true);

    fetchReportDataInBackground();
    fetchDashboardDataInBackground();
}

async function fetchReportDataInBackground() {
    try {
        const res = await fetch(buildReportUrl());
        const text = await res.text();
        let result;
        try { result = JSON.parse(text); } catch (e) {
            console.error("Server mengembalikan HTML:", text);
            if (!localStorage.getItem('pusda_raport_cache')) toggleLoading(false);
            return;
        }
        
        if (result.status === 'success') {
            localStorage.setItem('pusda_raport_cache', JSON.stringify({ time: Date.now(), data: result.data }));
            renderCards(result.data);
            toggleLoading(false);
        } else {
            console.error("Error dari server:", result.message);
            if (!localStorage.getItem('pusda_raport_cache')) {
                alert("Error: " + result.message);
                renderCards([]);
                toggleLoading(false);
            }
        }
    } catch (e) {
        console.error("Gagal memuat laporan:", e);
        if (!localStorage.getItem('pusda_raport_cache')) {
            alert("Gagal memuat laporan: " + e.message);
            renderCards([]);
            toggleLoading(false);
        }
    }
}

async function fetchDashboardDataInBackground() {
    try {
        const res = await fetch(API_URL + "?action=getDashboardData");
        const dashData = await res.json();
        if (dashData.status === 'success' && dashData.config?.Logo) {
            document.getElementById('sidebarLogo').src = dashData.config.Logo;
            document.getElementById('printKopLogo').src = dashData.config.Logo;
        }
        if (dashData.status === 'success') {
            const sel = document.getElementById('wilF');
            const currentOptions = Array.from(sel.options).map(o => o.value);
            const wilayahList = [...new Set((dashData.pegawai || []).map(p => p.Wilayah || p.wilayah).filter(w => w))];
            wilayahList.forEach(w => {
                if (!currentOptions.includes(w)) {
                    const opt = document.createElement('option'); opt.value = w; opt.innerText = w;
                    sel.appendChild(opt);
                }
            });
        }
    } catch (e) { console.error("Gagal memuat dashboard background:", e); }
}

function triggerReportFetch() {
    toggleLoading(true);
    fetchReportDataInBackground();
}

// RENDERING FUNCTIONS
function buildCalendarHTML(logs, startDateStr) {
    const startDate = new Date(startDateStr);
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const firstDayDate = new Date(year, month, 1);
    let firstDayOfWeek = firstDayDate.getDay();
    firstDayOfWeek = (firstDayOfWeek === 0) ? 6 : firstDayOfWeek - 1;
    
    const logMap = {};
    logs.forEach(l => {
        const d = new Date(l.date);
        logMap[d.getDate()] = l;
    });

    let html = '<div class="calendar-wrapper">';
    html += '<div class="calendar-header">';
    ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].forEach(day => {
        html += `<div>${day}</div>`;
    });
    html += '</div>';
    
    html += '<div class="calendar-micro-grid">';
    
    for (let i = 0; i < firstDayOfWeek; i++) {
        html += '<div class="day-box" style="visibility:hidden;"></div>';
    }
    
    for (let i = 1; i <= totalDays; i++) {
        const currentDate = new Date(year, month, i);
        const dayOfWeek = currentDate.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const log = logMap[i];
        
        let style = "";
        let className = "day-box";
        let tooltipHTML = "";
        
        if (log) {
            const status = (log.status || "").toLowerCase().trim();
            const validStatuses = ['hadir', 'terlambat', 'terlambat ringan', 'terlambat berat', 'izin', 'sakit', 'dinas', 'qr', 'qr hadir', 'qr pulang', 'pulang', 'quick response', 'lupa pulang'];
            
            if (log.score > 0 || validStatuses.includes(status)) {
                style = `style="background:${log.color}; border-color:${log.color}; color:white;"`;
                
                const ket = log.ket || log.keterangan || '-';
                tooltipHTML = `
                    <div class="day-tooltip">
                        <div class="tooltip-status">${log.status || '-'}</div>
                        <div class="tooltip-nilai">Nilai: ${log.score || 0}</div>
                        <div class="tooltip-ket">${ket}</div>
                    </div>
                `;
                
                if (isWeekend && !status.includes('qr') && !status.includes('quick')) {
                    className += " weekend";
                }
            } else if (isWeekend) {
                className += " weekend";
            }
        } else {
            if (isWeekend) {
                className += " weekend";
            } else {
                style = 'style="background:#fee2e2; color:#dc2626;"';
                tooltipHTML = `
                    <div class="day-tooltip">
                        <div class="tooltip-status">Alpha (Tidak Hadir)</div>
                        <div class="tooltip-nilai">Nilai: 0</div>
                    </div>
                `;
            }
        }
        
        html += `<div class="${className}" ${style}>${String(i).padStart(2,'0')}${tooltipHTML}</div>`;
    }
    
    html += '</div></div>';
    return html;
}

function renderCards(data) {
    const container = document.getElementById('raportGrid');
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="file-x" size="48"></i>
                <h3>Tidak Ada Data Kinerja</h3>
                <p>Tidak ditemukan data presensi untuk periode dan wilayah yang dipilih.</p>
            </div>
        `;
        document.getElementById('printGrid').innerHTML = '';
        lucide.createIcons();
        return;
    }

    data.sort((a, b) => b.score - a.score);
    
    const fragment = document.createDocumentFragment();
    const startDate = document.getElementById('startD').value;

    data.forEach(p => {
        const card = document.createElement('div');
        card.className = 'pegawai-card';
        card.dataset.pegawaiId = p.id || p.ID;

        const telatTotal = (p.stats?.telatRingan || 0) + (p.stats?.telatBerat || 0);
        const sidTotal = (p.stats?.izin||0) + (p.stats?.sakit||0) + (p.stats?.dinas||0) + (p.stats?.qrHadir||0) + (p.stats?.qrPulang||0);

        if (p.logs && p.logs.length > 0) {
            logsMap.set(String(p.id || p.ID), p.logs);
        }

        card.innerHTML = `
            <div class="card-top">
                <div class="photo-frame-pro">
                    <img data-src="${getSmartUrl(p.foto)}" class="lazy-img" src="${FALLBACK_IMAGE}" onerror="this.src='${FALLBACK_IMAGE}'">
                </div>
                <div class="id-group">
                    <h3>${p.nama || 'N/A'}</h3>
                    <p>${p.jabatan || 'N/A'}</p>
                    <p>${p.wilayah || 'N/A'}</p>
                </div>
                <div class="grade-badge">${p.grade || '-'}</div>
            </div>
            <div class="card-body">
                <div class="performance-main">
                    <span>Kinerja Kumulatif</span>
                    <b>${p.score || 0}</b>
                    <div class="progress-track">
                        <div class="progress-fill" style="width:${Math.min(p.score || 0, 100)}%; background:${(p.score || 0) >= 75 ? 'var(--success)' : ((p.score || 0) >= 60 ? 'var(--warning)' : 'var(--danger)')}"></div>
                    </div>
                </div>
                <div class="stats-summary">
                    <div class="stat-pill stat-hadir"><b>${p.stats?.hadir || 0}</b><span>Hadir</span></div>
                    <div class="stat-pill stat-telat"><b>${telatTotal}</b><span>Telat</span></div>
                    <div class="stat-pill stat-alpha"><b>${p.stats?.alpha || 0}</b><span>Alpha</span></div>
                    <div class="stat-pill stat-sid"><b>${sidTotal}</b><span>S/I/D/QR</span></div>
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
            const pegawaiId = card.dataset.pegawaiId;
            toggleDetail(this, card, pegawaiId);
        });
    });
}

function toggleDetail(btn, card, pegawaiId) {
    const panel = card.querySelector('.hidden-calendar-panel');
    const isActive = panel.classList.toggle('active');
    
    if (isActive) {
        btn.innerHTML = `<i data-lucide="chevron-up" size="14"></i> Sembunyikan Aktivitas`;
        
        const logs = logsMap.get(String(pegawaiId)) || [];
        const startDate = document.getElementById('startD').value;
        
        panel.innerHTML = buildCalendarHTML(logs, startDate);
    } else {
        btn.innerHTML = `<i data-lucide="chevron-down" size="14"></i> Detail Aktivitas Bulanan`;
    }
    lucide.createIcons({ node: btn });
}

// PRINT LOGIC
window.onbeforeprint = () => {
    document.getElementById('printGrid').innerHTML = document.getElementById('raportGrid').innerHTML;
    lucide.createIcons();
};

// START APP
window.onload = initApp;

// ✅ FUNGSI BUKA HALAMAN PDF DI TAB BARU
function openPDFGenerator() {
    const start = document.getElementById('startD').value;
    const end = document.getElementById('endD').value;
    const reg = document.getElementById('wilF').value;
    
    // Buka halaman generate-pdf.html di tab baru beserta parameternya
    window.open(`generate-pdf.html?start=${start}&end=${end}&region=${reg}`, '_blank');
}
