// ============================================================
// WILAYAH.JS - v2.1 (OPTIMIZED + BUGFIX)
// ============================================================
// FIX:
// - AbortController race condition di fetchWithTimeout
// - Memory leak di Preview Modal (listener cleanup)
// - WhatsApp broadcast sekarang support multiple dengan delay
// - lucide.createIcons() di-debounce untuk performa
// OPTIMASI:
// - Pre-sort logs di indexData (sekali saja)
// - Cache statistik pegawai
// - Throttle + debounce search
// - Batch DOM updates dengan requestAnimationFrame
// - Lazy cleanup untuk prevent memory leak
// ============================================================

// ============================================================
// 1. KONFIGURASI GLOBAL
// ============================================================
const GITHUB_LOGO_URL = "assets/logo.png";
const API_URL = "https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec";
const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 85'%3E%3Crect width='60' height='85' fill='%232e446e'/%3E%3Cpath d='M30 40c5.5 0 10-4.5 10-10s-4.5-10-10-10-10 4.5-10 10 4.5 10 10 10zm0 5c-8 0-20 4-20 12v5h40v-5c0-8-12-12-20-12z' fill='%23ffffff' opacity='0.2'/%3E%3C/svg%3E";

// ============================================================
// 2. DETEKSI ENVIRONMENT
// ============================================================
const isLocalFile = window.location.protocol === 'file:';
const isHttps = window.location.protocol === 'https:';
const isMobile = window.matchMedia('(max-width: 768px)').matches || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ============================================================
// 3. PWA MANIFEST
// ============================================================
try {
    const mf = {
        name: "E-PUSDA Monitoring",
        short_name: "E-PUSDA",
        start_url: "wilayah.html",
        scope: "./",
        display: "standalone",
        background_color: "#0d1b3e",
        theme_color: "#0d1b3e",
        icons: [
            { src: GITHUB_LOGO_URL, sizes: "192x192", type: "image/png", purpose: "any maskable" },
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
} catch (e) {
    console.warn('Manifest init failed:', e);
}

// ============================================================
// 4. VARIABEL APLIKASI
// ============================================================
let dbE = [], dbP = [], dbK = [];
let pegawaiById = new Map();
let logsByPegawai = new Map();
let pegawaiStatsCache = new Map(); // 🆕 Cache statistik pegawai

// State
let isRefreshing = false;
let isApiDown = false;
let apiRetryCount = 0;
const MAX_API_RETRY = 3;

// Search & debounce
let searchTimeout = null;
let lastFilterTime = 0; // 🆕 Untuk throttle search

// 🆕 Debounce untuk lucide icons
let iconTimeout = null;

// Zoom modal
let currentZoom = 1;
let isDragging = false;
let touchStartX = 0;
let touchStartY = 0;
let lastTouchDist = 0;

// ✅ TOP 5 UPGRADES: State variables
let activeQuickFilter = 'ALL';
let countdown = 60;
let countdownInterval = null;

// ============================================================
// 5. FETCH DENGAN TIMEOUT (🆕 FIX: Local AbortController)
// ============================================================
function fetchWithTimeout(url, opts = {}, timeout = 15000) {
    // 🆕 FIX: Setiap request punya controller sendiri (tidak global)
    const controller = new AbortController();
    const tid = setTimeout(() => {
        controller.abort(new DOMException('Timeout ' + timeout + 'ms', 'AbortError'));
    }, timeout);
    return fetch(url, { ...opts, signal: controller.signal })
        .finally(() => clearTimeout(tid));
}

async function safeFetchJSON(url, opts = {}, timeout = 15000) {
    try {
        const res = await fetchWithTimeout(url, opts, timeout);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const txt = await res.text();
        if (!txt || !txt.trim()) throw new Error('Response kosong');
        if (txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) {
            throw new Error('Server return HTML error');
        }
        try {
            return JSON.parse(txt);
        } catch (e) {
            throw new Error('Parse JSON gagal: ' + e.message);
        }
    } catch (e) {
        if (e.name === 'AbortError' || (e.message && e.message.includes('Timeout'))) {
            const err = new Error('Timeout koneksi (>' + timeout + 'ms)');
            err.name = 'TimeoutError';
            throw err;
        }
        throw e;
    }
}

// ============================================================
// 6. TOAST NOTIFICATION
// ============================================================
function showToast(msg, type = 'info') {
    let c = document.getElementById('wilToastContainer');
    if (!c) {
        c = document.createElement('div');
        c.id = 'wilToastContainer';
        c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:400px;';
        document.body.appendChild(c);
    }
    const t = document.createElement('div');
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    const color = colors[type] || colors.info;
    t.style.cssText = `background:rgba(15,23,42,0.95);backdrop-filter:blur(15px);color:white;padding:14px 20px;border-radius:14px;border-left:4px solid ${color};box-shadow:0 10px 30px rgba(0,0,0,0.4);font-size:0.9rem;font-weight:600;pointer-events:auto;animation:slideInRight 0.3s ease-out;`;
    t.innerHTML = `<div style="font-weight:800;text-transform:uppercase;font-size:0.7rem;color:${color};margin-bottom:4px;letter-spacing:1px">${type}</div><div>${sanitizeHTML(msg)}</div>`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = 'opacity 0.4s';
        setTimeout(() => t.remove(), 400);
    }, 4000);
}

// ============================================================
// 7. UTILITIES
// ============================================================
function sanitizeHTML(s) {
    if (s == null) return "";
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function getLocalDateString(val) {
    if (!val) return "";
    let d = new Date(val);
    if (isNaN(d.getTime()) && typeof val === 'string' && val.includes('/')) {
        const p = val.split(/[/\s:]/);
        if (p[0].length === 2) d = new Date(p[2], p[1] - 1, p[0]);
    }
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatTime(dateStr) {
    if (!dateStr) return "--:--";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "--:--";
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return "--:--";
    }
}

function handleImgError(img) {
    img.onerror = null;
    img.src = placeholderImg;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 🆕 Debounced lucide icon creation
function safeCreateIcons() {
    clearTimeout(iconTimeout);
    iconTimeout = setTimeout(() => {
        try { lucide.createIcons(); } catch(e) { console.warn('Icon create failed:', e); }
    }, 50);
}

// ============================================================
// 8. INDEXING DATA (🆕 OPTIMASI: Pre-sort logs sekali saja)
// ============================================================
function indexData() {
    pegawaiById.clear();
    logsByPegawai.clear();
    pegawaiStatsCache.clear(); // 🆕 Reset cache saat re-index
    
    dbE.forEach(p => pegawaiById.set(String(p.ID), p));
    
    const filterDate = document.getElementById('fDate').value;
    const logMap = new Map();
    
    dbP.forEach(l => {
        const ts = l.Timestamp || l.timestamp;
        if (!ts || getLocalDateString(ts) !== filterDate) return;
        const pID = String(l['ID Pegawai'] || l.id_pegawai || l.ID);
        if (!logMap.has(pID)) logMap.set(pID, []);
        logMap.get(pID).push(l);
    });
    
    // 🆕 Pre-sort semua log sekali saja (bukan setiap filter)
    logMap.forEach((logs, pID) => {
        logs.sort((a, b) => new Date(a.Timestamp || a.timestamp) - new Date(b.Timestamp || b.timestamp));
        logsByPegawai.set(pID, logs);
    });
}

// 🆕 Compute dan cache statistik per pegawai
function computePegawaiStats(pID) {
    if (pegawaiStatsCache.has(pID)) return pegawaiStatsCache.get(pID);
    
    const logs = logsByPegawai.get(pID) || [];
    let sid = '', inTime = '-', outTime = '-';
    let sin = null, kin = null, gin = null;
    let sout = null, kout = null, gout = null;
    
    logs.forEach(log => {
        const status = (log.Status || log.status || "").toLowerCase();
        const jam = formatTime(log.Timestamp || log.timestamp);
        const fSelfie = log['Foto_Selfie'] || log['Foto Selfie'] || log.foto_selfie || null;
        const fKerja = log['Foto_Kerja'] || log['Foto Kerja'] || log['Foto Lokasi'] || log.foto_kerja || log.foto_lokasi || null;
        const gpsData = log.GPS || log.gps || null;
        const isSID = status.includes('izin') || status.includes('sakit') || status.includes('dinas');
        const isMorning = status.includes('hadir') || status.includes('terlambat') || status.includes('qr hadir') || status.includes('quick response');
        const isPulang = status.includes('pulang') || status.includes('qr pulang');
        
        if (isSID) {
            sid = log.Status || log.status;
            inTime = jam;
            sin = fSelfie; kin = fKerja; gin = gpsData;
        } else {
            if (isMorning && inTime === "-") {
                inTime = jam;
                sin = fSelfie; kin = fKerja; gin = gpsData;
            }
            if (isPulang) {
                outTime = jam;
                sout = fSelfie; kout = fKerja; gout = gpsData;
            }
        }
    });
    
    const stats = {
        sid, in: inTime, out: outTime,
        sin, kin, gin, sout, kout, gout
    };
    pegawaiStatsCache.set(pID, stats);
    return stats;
}

// ============================================================
// 9. APP INITIALIZATION (🆕 FIXED: Smart sync toast)
// ============================================================
window.onload = () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    const now = new Date();
    const fDateEl = document.getElementById('fDate');
    if (fDateEl) {
        fDateEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }
    
    if (!document.getElementById('wil-toast-style')) {
        const s = document.createElement('style');
        s.id = 'wil-toast-style';
        s.innerHTML = '@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
        document.head.appendChild(s);
    }

    const cachedDash = localStorage.getItem('wilayah_dashboard_cache');
    const selectedDate = fDateEl ? fDateEl.value : '';
    const cachedPresensi = localStorage.getItem('wilayah_presensi_' + selectedDate);

    // 🆕 DETEKSI: Apakah ini cold start (tidak ada cache)?
    const hasCache = cachedDash && cachedPresensi;
    
    if (hasCache) {
        try {
            const d = JSON.parse(cachedDash);
            dbE = d.pegawai || [];
            dbK = d.korlap || [];
            dbP = JSON.parse(cachedPresensi);
            
            populateUIFromData(d);
            indexData();
            updateKorlapStats();
            filterData();
            
            // 🆕 FIXED: Tampilkan "memperbarui" soft indicator, bukan sync toast
            showSoftSyncIndicator();
            
            // Background silent refresh
            loadData(false, false, true); // isSilent = true
        } catch (e) {
            console.warn('Cache corrupt, full reload:', e);
            loadData(false, false, false);
        }
    } else {
        // Cold start - tampilkan skeleton + sync toast penuh
        showSkeletonLoading();
        loadData(false, false, false);
    }

    // Live clock
    setInterval(() => {
        const c = document.getElementById('liveClock');
        if (c) c.innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }, 1000);
    
    startCountdown();
};

// 🆕 HELPER: Soft sync indicator (non-blocking)
function showSoftSyncIndicator() {
    const syncToast = document.getElementById('syncToast');
    if (!syncToast) return;
    
    syncToast.classList.remove('sync-toast--full');
    syncToast.classList.add('sync-toast--soft');
    syncToast.innerHTML = `
        <div class="sync-toast-content">
            <div class="sync-spinner"></div>
            <span>Memperbarui data...</span>
        </div>
    `;
    syncToast.style.display = 'flex';
    
    // 🆕 SAFETY: Auto-hide setelah 30 detik (jika fetch hang)
    setTimeout(() => hideSyncToast(), 30000);
}

// 🆕 HELPER: Show skeleton saat cold start
function showSkeletonLoading() {
    const grid = document.getElementById('gridView');
    if (!grid) return;
    
    const skeletonCount = isMobile ? 2 : 4;
    grid.innerHTML = Array(skeletonCount).fill(`
        <div class="skeleton-card">
            <div class="skeleton-circle"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>
    `).join('');
}

// 🆕 HELPER: Hide sync toast dengan animasi
function hideSyncToast() {
    const syncToast = document.getElementById('syncToast');
    if (!syncToast) return;
    
    syncToast.style.opacity = '0';
    syncToast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
        syncToast.style.display = 'none';
        syncToast.style.opacity = '';
        syncToast.style.transform = '';
    }, 300);
}
// ============================================================
// 10. POPULATE UI FROM DATA
// ============================================================
function populateUIFromData(d) {
    if (d.config?.Logo) {
        const sl = document.getElementById('sidebarLogo');
        if (sl) sl.src = d.config.Logo;
    }
    
    const sel = document.getElementById('fWil');
    if (sel && sel.options.length <= 1) {
        [...new Set(dbE.map(p => p.Wilayah).filter(w => w))].sort().forEach(w => {
            const opt = document.createElement('option');
            opt.value = w;
            opt.innerText = w;
            sel.appendChild(opt);
        });
    }
    
    const agnSel = document.getElementById('agnNamaInput');
    if (agnSel) {
        agnSel.innerHTML = '<option value="" disabled selected>-- Pilih Nama Pegawai --</option>';
        dbK.forEach(k => {
            const opt = document.createElement('option');
            opt.value = k.Nama;
            opt.innerText = k.Nama;
            agnSel.appendChild(opt);
        });
    }
}

// ============================================================
// 11. LOAD DATA (🆕 FIXED: Smart sync toast + safety timeout)
// ============================================================
async function loadData(isRefresh = false, isAuto = false, isSilent = false, attempt = 1) {
    const syncToast = document.getElementById('syncToast');
    const grid = document.getElementById('gridView');

    if (isApiDown && attempt > 1) {
        if (!isAuto) showToast('⏳ Server sedang sibuk, menggunakan data cache', 'warning');
        if (dbE.length > 0 || dbP.length > 0) {
            indexData();
            updateKorlapStats();
            filterData();
            hideSyncToast();
            return;
        }
    }

    // 🆕 FIXED: Hanya tampilkan sync toast jika:
    // 1. Bukan auto-refresh
    // 2. Bukan silent background refresh
    // 3. Belum ada data (cold start)
    const shouldShowSyncToast = !isAuto && !isSilent && (dbE.length === 0 || isRefresh);
    
    if (shouldShowSyncToast && syncToast) {
        syncToast.classList.remove('sync-toast--soft');
        syncToast.classList.add('sync-toast--full');
        syncToast.innerHTML = `
            <div class="sync-toast-content">
                <div class="sync-spinner"></div>
                <span>${isMobile ? '🔄 Memuat data...' : '🔄 Sinkronisasi Data...'}</span>
            </div>
            <div class="sync-toast-progress"></div>
        `;
        syncToast.style.display = 'flex';
        
        // 🆕 SAFETY: Auto-hide setelah 45 detik
        window._syncToastSafetyTimeout = setTimeout(() => {
            hideSyncToast();
            showToast('⚠️ Sinkronisasi terlalu lama, menggunakan data terakhir', 'warning');
        }, 45000);
    }

    // Tampilkan skeleton hanya saat cold start
    if (!isAuto && isRefresh && grid && dbE.length === 0) {
        showSkeletonLoading();
    }

    try {
        const selectedDate = document.getElementById('fDate').value;
        const timeout = isAuto ? 12000 : 20000;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const dashboardPromise = fetch(API_URL + "?action=getDashboardData", {
            signal: controller.signal
        }).then(res => {
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).catch(err => {
            if (err.name === 'AbortError') {
                const timeoutErr = new Error('Timeout koneksi (>' + timeout + 'ms)');
                timeoutErr.name = 'TimeoutError';
                throw timeoutErr;
            }
            throw err;
        });

        const presensiPromise = fetch(API_URL + `?action=getPresensiByDate&date=${selectedDate}`, {
            signal: controller.signal
        }).then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).catch(err => {
            if (err.name === 'AbortError') {
                const timeoutErr = new Error('Timeout koneksi (>' + timeout + 'ms)');
                timeoutErr.name = 'TimeoutError';
                throw timeoutErr;
            }
            throw err;
        });

        const results = await Promise.allSettled([dashboardPromise, presensiPromise]);

        if (results.some(r => r.status === 'fulfilled')) {
            isApiDown = false;
            apiRetryCount = 0;
        }

        if (results[1].status === 'fulfilled') {
            dbP = results[1].value.data || [];
            try { localStorage.setItem('wilayah_presensi_' + selectedDate, JSON.stringify(dbP)); } catch (e) {}
        } else {
            console.error("Gagal ambil presensi:", results[1].reason.message);
            if (!isAuto && !isSilent && attempt === 1) {
                showToast('⚠️ Gagal memuat presensi, pakai data cache', 'warning');
            }
            const cachedPresensi = localStorage.getItem('wilayah_presensi_' + selectedDate);
            if (cachedPresensi) dbP = JSON.parse(cachedPresensi);
        }

        if (results[0].status === 'fulfilled') {
            const d = results[0].value;
            dbE = d.pegawai || [];
            dbK = d.korlap || [];
            try { localStorage.setItem('wilayah_dashboard_cache', JSON.stringify(d)); } catch (e) {}
            populateUIFromData(d);
        } else {
            console.warn("Dashboard sync gagal, pakai cache lama:", results[0].reason.message);
            if (!isAuto && dbE.length === 0) {
                const cachedDash = localStorage.getItem('wilayah_dashboard_cache');
                if (cachedDash) {
                    const d = JSON.parse(cachedDash);
                    dbE = d.pegawai || [];
                    dbK = d.korlap || [];
                    populateUIFromData(d);
                    if (!isSilent) showToast('📦 Menggunakan data cache', 'info');
                } else {
                    if (!isSilent) showToast('⚠️ Gagal memuat data dashboard', 'warning');
                }
            }
        }

        indexData();
        updateKorlapStats();
        filterData();
        
        // 🆕 Tampilkan toast success jika ini manual refresh
        if (isRefresh && !isSilent && !isAuto) {
            showToast('✅ Data berhasil diperbarui!', 'success');
        }

    } catch (e) {
        const isTimeout = e.name === 'TimeoutError' || (e.message && e.message.includes('Timeout'));
        const isNetwork = e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'));

        console.error(`❌ Gagal memuat data (Percobaan ${attempt}):`, e.message);

        if (isTimeout || isNetwork) isApiDown = true;

        if (!isAuto && attempt < MAX_API_RETRY) {
            hideSyncToast(); // 🆕 Hide dulu sebelum retry
            const delay = attempt * 2000;
            if (!isSilent) showToast(`⏳ Mencoba ulang (${attempt}/${MAX_API_RETRY})...`, 'info');
            setTimeout(() => loadData(isRefresh, isAuto, isSilent, attempt + 1), delay);
            return;
        }

        if (isAuto || isSilent || (dbE.length > 0 && isRefresh)) {
            if (!isAuto && !isSilent && (isTimeout || isNetwork)) {
                showToast('📶 Server lambat, menampilkan data cache', 'warning');
            }
            if (dbE.length > 0 || dbP.length > 0) {
                indexData();
                updateKorlapStats();
                filterData();
            }
            hideSyncToast();
            return;
        }

        if (!isSilent) {
            if (isTimeout) showToast('⏰ Server lambat merespon. Coba lagi nanti.', 'warning');
            else if (isNetwork) showToast('📡 Koneksi internet terputus.', 'error');
            else showToast('❌ Gagal memuat data: ' + e.message, 'error');
        }

        if (grid && dbE.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;color:var(--danger);padding:50px 20px;">
                    <i data-lucide="wifi-off" size="32" style="display:block;margin:0 auto 10px;opacity:0.5"></i>
                    <p style="margin-bottom:15px;font-size:${isMobile ? '0.9rem' : '1rem'}">
                        ${isTimeout ? '⏰ Server lambat merespon' : '📡 Gagal memuat data'}
                    </p>
                    <button onclick="refreshData()" style="margin:0 auto;padding:12px 24px;border-radius:12px;background:var(--pu-blue);color:white;border:none;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:8px;">
                        <i data-lucide="refresh-cw" size="16"></i> Coba Lagi
                    </button>
                </div>
            `;
            safeCreateIcons();
        }
    } finally {
        // 🆕 FIXED: Clear safety timeout dan hide toast
        if (window._syncToastSafetyTimeout) {
            clearTimeout(window._syncToastSafetyTimeout);
            window._syncToastSafetyTimeout = null;
        }
        hideSyncToast();
    }
}

// ============================================================
// 12. REFRESH DATA (Manual)
// ============================================================
async function refreshData() {
    if (isRefreshing) return;
    const btn = document.querySelector('.btn-refresh');
    const icon = btn?.querySelector('i');

    isApiDown = false;
    apiRetryCount = 0;

    try {
        isRefreshing = true;
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('spinning');
        
        // 🆕 FIXED: Tampilkan soft indicator, bukan toast penuh
        showSoftSyncIndicator();
        
        await loadData(true, false, false); // isRefresh=true, isAuto=false, isSilent=false
        
        countdown = 60;
    } catch (e) {
        showToast('❌ Gagal memperbarui data', 'error');
    } finally {
        isRefreshing = false;
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('spinning');
        hideSyncToast();
    }
}

// ============================================================
// 13. FILTERING DATA (🆕 OPTIMASI: Pakai cache stats)
// ============================================================
function filterData() {
    const wil = document.getElementById('fWil').value;
    const search = document.getElementById('fSearch').value.toLowerCase();
    const monitoringMap = {};

    // Step 1: Filter pegawai berdasarkan wilayah + search
    dbE.forEach(p => {
        if ((wil === 'ALL' || p.Wilayah === wil) && (!search || (p.Nama || '').toLowerCase().includes(search))) {
            const pID = String(p.ID);
            const stats = computePegawaiStats(pID);
            monitoringMap[pID] = {
                id: pID,
                nama: p.Nama,
                wil: p.Wilayah,
                foto: p.Link_Foto_Profile,
                hp: String(p.NoHP || p.no_hp || ""),
                ...stats
            };
        }
    });

    let dataArr = Object.values(monitoringMap);
    
    const stats = { total: dataArr.length, hadir: 0, pulang: 0, belum: 0, sid: 0 };
    dataArr.forEach(p => {
        if (p.sid) stats.sid++;
        else if (p.out !== '-') stats.pulang++;
        else if (p.in !== '-') stats.hadir++;
        else stats.belum++;
    });
    
    updateSummaryCards(stats);
    updateChipCounters(stats);
    
    if (activeQuickFilter !== 'ALL') {
        dataArr = dataArr.filter(p => {
            if (activeQuickFilter === 'BELUM') return p.in === '-' && !p.sid;
            if (activeQuickFilter === 'HADIR') return p.in !== '-' && p.out === '-' && !p.sid;
            if (activeQuickFilter === 'PULANG') return p.out !== '-' && !p.sid;
            if (activeQuickFilter === 'SID') return !!p.sid;
            return true;
        });
    }
    
    const gridVisible = document.getElementById('gridView')?.style.display !== 'none';
    const tableVisible = document.getElementById('tableWrapper')?.style.display !== 'none';

    if (gridVisible) renderGridView(dataArr);
    if (tableVisible) renderTableView(dataArr);
    safeCreateIcons();
}

// ============================================================
// 14. EVENT DELEGATION (Preview Modal)
// ============================================================
function attachPreviewListeners(container) {
    container.querySelectorAll('[data-preview]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const { url, name, info, time, gps } = el.dataset;
            if (el.classList.contains('gps-link-btn') && !url) {
                if (gps && gps !== '-' && gps !== 'null' && gps !== 'undefined') {
                    const cleanGps = gps.replace(/\s/g, '');
                    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    const mapsUrl = isMobileDevice ? `geo:${cleanGps}?q=${cleanGps}` : `https://www.google.com/maps?q=${cleanGps}`;
                    window.open(mapsUrl, '_blank');
                    return;
                }
            }
            openPreviewModal(url, name, info, time, gps);
        });
    });
}

// ============================================================
// 15. RENDER GRID VIEW
// ============================================================
function renderGridView(data) {
    const container = document.getElementById('gridView');
    if (!container) return;
    if (data.length === 0) {
        container.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:50px;opacity:0.5">Belum ada data pada filter ini.</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    data.forEach(p => {
        const cleanHP = p.hp.replace(/[^0-9]/g, '');
        const waUrl = cleanHP ? `https://wa.me/${cleanHP}` : "#";
        const card = document.createElement('div');
        card.className = 'personel-card';
        const sNama = sanitizeHTML(p.nama),
            sWil = sanitizeHTML(p.wil),
            sSid = sanitizeHTML(p.sid);
        
        card.innerHTML = `
            <div class="p-card-top">
                <div class="p-photo-pop"><img src="${p.foto || placeholderImg}" loading="lazy" onerror="handleImgError(this)" alt="${sNama}"></div>
                <div class="p-info">
                    <h3 class="clickable-name" onclick="openProfile('${p.id}')" title="Buka Profile Raport">${sNama}</h3>
                    <p style="font-size:0.7rem;opacity:0.7">${sWil}</p>
                    <div class="sid-badge" style="display:${p.sid ? 'block' : 'none'}">${sSid}</div>
                </div>
                <a href="${waUrl}" target="_blank" class="btn-wa-call" title="Hubungi WA"><i data-lucide="message-circle" size="20"></i></a>
            </div>
            <div class="p-card-body">
                <div class="pres-indicator" style="border-left:4px solid var(--success)">
                    <div class="pres-label"><span>MASUK</span><b>${p.in}</b></div>
                    <div class="thumb-row">
                        <div class="mini-thumb" data-preview data-url="${p.sin || ''}" data-name="${sNama}" data-info="Selfie Masuk" data-time="${p.in}" data-gps="${p.gin || ''}">${p.sin ? `<img src="${p.sin}" loading="lazy">` : `<i data-lucide="camera" size="14"></i>`}</div>
                        <div class="mini-thumb" data-preview data-url="${p.kin || ''}" data-name="${sNama}" data-info="Dokumentasi Masuk" data-time="${p.in}" data-gps="${p.gin || ''}">${p.kin ? `<img src="${p.kin}" loading="lazy">` : `<i data-lucide="image" size="14"></i>`}</div>
                    </div>
                    <button class="gps-link-btn" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Masuk" data-time="${p.in}" data-gps="${p.gin || ''}"><i data-lucide="map-pin" size="14"></i> GPS Pagi</button>
                </div>
                <div class="pres-indicator" style="border-left:4px solid var(--accent)">
                    <div class="pres-label"><span>PULANG</span><b>${p.out}</b></div>
                    <div class="thumb-row">
                        <div class="mini-thumb" data-preview data-url="${p.sout || ''}" data-name="${sNama}" data-info="Selfie Pulang" data-time="${p.out}" data-gps="${p.gout || ''}">${p.sout ? `<img src="${p.sout}" loading="lazy">` : `<i data-lucide="camera" size="14"></i>`}</div>
                        <div class="mini-thumb" data-preview data-url="${p.kout || ''}" data-name="${sNama}" data-info="Dokumentasi Pulang" data-time="${p.out}" data-gps="${p.gout || ''}">${p.kout ? `<img src="${p.kout}" loading="lazy">` : `<i data-lucide="image" size="14"></i>`}</div>
                    </div>
                    <button class="gps-link-btn" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Pulang" data-time="${p.out}" data-gps="${p.gout || ''}"><i data-lucide="map-pin" size="14"></i> GPS Sore</button>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
    attachPreviewListeners(container);
}

// ============================================================
// 16. RENDER TABLE VIEW
// ============================================================
function renderTableView(data) {
    const body = document.getElementById('tableBody');
    if (!body) return;
    if (data.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:50px;opacity:0.5">Belum ada data pada filter ini.</td></tr>';
        return;
    }
    const fragment = document.createDocumentFragment();
    data.forEach(p => {
        const sNama = sanitizeHTML(p.nama),
            sWil = sanitizeHTML(p.wil);
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td style="font-weight:800;text-transform:uppercase">
                <span class="clickable-name" onclick="openProfile('${p.id}')" title="Buka Profile Raport">${sNama}</span>
                ${p.sid ? `<span style="color:#8b5cf6;font-size:0.65rem;margin-left:5px">[${sanitizeHTML(p.sid)}]</span>` : ''}
            </td>
            <td style="opacity:0.6">${sWil}</td>
            <td style="font-family:'JetBrains Mono';font-weight:800;color:${p.in !== '-' ? 'var(--success)' : '#4b5563'}">${p.in}</td>
            <td>
                <div class="proof-icons-container">
                    <div class="table-icon-btn ${p.sin ? 'active-h' : ''}" data-preview data-url="${p.sin || ''}" data-name="${sNama}" data-info="Selfie Masuk" data-time="${p.in}" data-gps="${p.gin || ''}"><i data-lucide="camera" size="16"></i></div>
                    <div class="table-icon-btn ${p.kin ? 'active-h' : ''}" data-preview data-url="${p.kin || ''}" data-name="${sNama}" data-info="Dokumentasi Masuk" data-time="${p.in}" data-gps="${p.gin || ''}"><i data-lucide="briefcase" size="16"></i></div>
                    <div class="table-icon-btn ${p.gin ? 'active-h' : ''}" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Masuk" data-time="${p.in}" data-gps="${p.gin || ''}"><i data-lucide="map-pin" size="16"></i></div>
                </div>
            </td>
            <td style="font-family:'JetBrains Mono';font-weight:800;color:${p.out !== '-' ? 'var(--accent)' : '#4b5563'}">${p.out}</td>
            <td>
                <div class="proof-icons-container">
                    <div class="table-icon-btn ${p.sout ? 'active-p' : ''}" data-preview data-url="${p.sout || ''}" data-name="${sNama}" data-info="Selfie Pulang" data-time="${p.out}" data-gps="${p.gout || ''}"><i data-lucide="camera" size="16"></i></div>
                    <div class="table-icon-btn ${p.kout ? 'active-p' : ''}" data-preview data-url="${p.kout || ''}" data-name="${sNama}" data-info="Dokumentasi Pulang" data-time="${p.out}" data-gps="${p.gout || ''}"><i data-lucide="briefcase" size="16"></i></div>
                    <div class="table-icon-btn ${p.gout ? 'active-p' : ''}" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Pulang" data-time="${p.out}" data-gps="${p.gout || ''}"><i data-lucide="map-pin" size="16"></i></div>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });
    body.innerHTML = '';
    body.appendChild(fragment);
    attachPreviewListeners(body);
}

// ============================================================
// 17. KORLAP STATS
// ============================================================
function updateKorlapStats() {
    const container = document.getElementById('korlapGrid');
    if (!container) return;
    const staffByWilayah = new Map();
    dbE.forEach(p => {
        const w = p.Wilayah;
        if (!staffByWilayah.has(w)) staffByWilayah.set(w, []);
        staffByWilayah.get(w).push(p);
    });
    const html = dbK.map(k => {
        const wilStaff = staffByWilayah.get(k.Wilayah) || [];
        let h = 0, p_out = 0, s = 0;
        wilStaff.forEach(stf => {
            const stats = computePegawaiStats(String(stf.ID));
            if (stats.in !== '-') h++;
            if (stats.out !== '-') p_out++;
            if (stats.sid) s++;
        });
        return `<div class="korlap-card">
            <div class="korlap-header-blue">
                <div class="korlap-foto-wrap"><img src="${k.Link_Foto_Profile || placeholderImg}" onerror="handleImgError(this)" alt="${sanitizeHTML(k.Nama)}"></div>
                <div class="korlap-info">
                    <h2>${sanitizeHTML(k.Nama)}</h2>
                    <p style="font-size:0.7rem;opacity:0.7">Koordinator ${sanitizeHTML(k.Wilayah)}</p>
                    <button class="btn-agenda-pill" onclick="openAgenda('${sanitizeHTML(k.Nama).replace(/'/g, "\\'")}','${sanitizeHTML(k.Jabatan || '').replace(/'/g, "\\'")}')"><i data-lucide="calendar-check-2" size="14"></i> E-Agenda</button>
                </div>
            </div>
            <div class="korlap-stats-row">
                <div class="k-stat-box"><b>${wilStaff.length}</b><span>Total</span></div>
                <div class="k-stat-box"><b style="color:var(--success)">${h}</b><span>Hadir</span></div>
                <div class="k-stat-box"><b style="color:var(--accent)">${p_out}</b><span>Pulang</span></div>
                <div class="k-stat-box"><b style="color:#a855f7">${s}</b><span>SID</span></div>
            </div>
        </div>`;
    }).join('');
    container.innerHTML = html;
    safeCreateIcons();
}

// ============================================================
// 18. MODAL PREVIEW FOTO (🆕 FIX: Memory leak cleanup)
// ============================================================
let modalEventHandlers = null; // 🆕 Track handler references

function openPreviewModal(url, name, info, time, gps) {
    if ((!url || url === '-' || url === 'null' || url === 'undefined') &&
        (!gps || gps === '-' || gps === 'null' || gps === 'undefined')) {
        return;
    }

    const modal = document.getElementById('pModal');
    const imgContainer = document.getElementById('mImgContainer');
    const img = document.getElementById('mImg');
    const nameEl = document.getElementById('mName');
    const infoEl = document.getElementById('mInfo');
    const timeEl = document.getElementById('mTime');
    const gpsBtn = document.getElementById('mGpsBtn');

    currentZoom = 1;
    img.style.transform = 'scale(1)';
    img.style.cursor = 'zoom-in';
    img.classList.remove('zoomed');

    if (url && url !== '-' && url !== 'null' && url !== 'undefined') {
        imgContainer.style.display = 'flex';
        img.src = url;
        img.onerror = function() { this.src = placeholderImg; };
    } else {
        imgContainer.style.display = 'flex';
        img.src = placeholderImg;
    }

    nameEl.textContent = name || 'Tanpa Nama';
    infoEl.textContent = info || 'Dokumentasi';
    timeEl.textContent = time || '--:--';

    if (gps && gps !== '-' && gps !== 'null' && gps !== 'undefined') {
        gpsBtn.style.display = 'flex';
        gpsBtn.onclick = function(e) {
            e.stopPropagation();
            const cleanGps = gps.replace(/\s/g, '');
            const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const mapsUrl = isMobileDevice ? `geo:${cleanGps}?q=${cleanGps}` : `https://www.google.com/maps?q=${cleanGps}`;
            window.open(mapsUrl, '_blank');
        };
        gpsBtn.innerHTML = `<i data-lucide="map-pinned" size="18"></i> BUKA LOKASI GOOGLE MAPS`;
    } else {
        gpsBtn.style.display = 'none';
    }

    // 🆕 FIX: Use addEventListener with stored handlers for proper cleanup
    modalEventHandlers = {
        wheel: (e) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.min(Math.max(1, currentZoom + delta), 3);
            currentZoom = newZoom;
            img.style.transform = `scale(${currentZoom})`;
            img.style.cursor = currentZoom > 1 ? 'zoom-out' : 'zoom-in';
            img.classList.toggle('zoomed', currentZoom > 1);
        },
        touchstart: (e) => {
            if (e.touches.length === 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                lastTouchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            } else if (e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isDragging = true;
            }
        },
        touchmove: (e) => {
            if (e.touches.length === 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                if (lastTouchDist > 0) {
                    const delta = (dist - lastTouchDist) / 100;
                    const newZoom = Math.min(Math.max(1, currentZoom + delta), 3);
                    currentZoom = newZoom;
                    img.style.transform = `scale(${currentZoom})`;
                    img.style.cursor = currentZoom > 1 ? 'zoom-out' : 'zoom-in';
                    img.classList.toggle('zoomed', currentZoom > 1);
                }
                lastTouchDist = dist;
                e.preventDefault();
            }
        },
        touchend: () => {
            lastTouchDist = 0;
            isDragging = false;
        },
        dblclick: (e) => {
            e.preventDefault();
            currentZoom = 1;
            img.style.transform = 'scale(1)';
            img.style.cursor = 'zoom-in';
            img.classList.remove('zoomed');
        }
    };

    img.addEventListener('wheel', modalEventHandlers.wheel, { passive: false });
    img.addEventListener('touchstart', modalEventHandlers.touchstart, { passive: true });
    img.addEventListener('touchmove', modalEventHandlers.touchmove, { passive: false });
    img.addEventListener('touchend', modalEventHandlers.touchend, { passive: true });
    img.addEventListener('dblclick', modalEventHandlers.dblclick);

    modal.onclick = function(e) {
        if (e.target === modal || e.target === imgContainer) closePreviewModal();
    };

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => safeCreateIcons(), 100);
}

function closePreviewModal() {
    const modal = document.getElementById('pModal');
    const img = document.getElementById('mImg');

    // 🆕 FIX: Properly remove all event listeners
    if (modalEventHandlers && img) {
        img.removeEventListener('wheel', modalEventHandlers.wheel);
        img.removeEventListener('touchstart', modalEventHandlers.touchstart);
        img.removeEventListener('touchmove', modalEventHandlers.touchmove);
        img.removeEventListener('touchend', modalEventHandlers.touchend);
        img.removeEventListener('dblclick', modalEventHandlers.dblclick);
        modalEventHandlers = null;
    }

    currentZoom = 1;
    if (img) {
        img.style.transform = 'scale(1)';
        img.style.cursor = 'zoom-in';
        img.classList.remove('zoomed');
    }

    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function closeModal() {
    closePreviewModal();
}

// ============================================================
// 19. AGENDA KORLAP
// ============================================================
function openAgenda(nama, jabatan) {
    const agnNama = document.getElementById('agnNamaInput');
    if (agnNama) {
        agnNama.value = nama;
        syncJabatan();
    }
    document.getElementById('agnTanggalInput').value = document.getElementById('fDate').value;
    document.getElementById('agendaModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeAgenda() {
    document.getElementById('agendaModal').style.display = 'none';
    document.body.style.overflow = '';
}

function syncJabatan() {
    const nama = document.getElementById('agnNamaInput').value;
    const k = dbK.find(x => x.Nama === nama);
    if (k) document.getElementById('agnJabatanInput').value = k.Jabatan || "Koordinator Lapangan";
}

function startVoice(targetId, btn) {
    const S = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!S) {
        showToast("Browser tidak mendukung fitur suara", "warning");
        return;
    }
    const r = new S();
    r.lang = 'id-ID';
    r.onstart = () => btn.classList.add('active');
    r.onresult = (e) => {
        const el = document.getElementById(targetId);
        if (el) el.value = (el.value ? el.value + ' ' : '') + e.results[0][0].transcript;
    };
    r.onend = () => btn.classList.remove('active');
    r.onerror = () => btn.classList.remove('active');
    r.start();
}

async function compressImage(base64, options = {}) {
    const { maxWidth = 800, maxHeight = 800, quality = 0.5 } = options;
    return new Promise((resolve, reject) => {
        const img = new Image();
        const tid = setTimeout(() => reject(new Error('Timeout')), 10000);
        img.onload = () => {
            clearTimeout(tid);
            const c = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) {
                h = h * (maxWidth / w);
                w = maxWidth;
            }
            if (h > maxHeight) {
                w = w * (maxHeight / h);
                h = maxHeight;
            }
            c.width = w;
            c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => {
            clearTimeout(tid);
            reject(new Error('Gagal memuat gambar'));
        };
        img.src = base64;
    });
}

async function submitAgenda() {
    const btn = document.getElementById('btnSubmitAgenda');
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="loading-spinner"></span> Mengirim...';
    btn.disabled = true;

    const nama = document.getElementById('agnNamaInput').value;
    const tanggal = document.getElementById('agnTanggalInput').value;
    const judul = document.getElementById('agnJudulInput').value;
    const ket = document.getElementById('agnKetInput').value;
    const datang = document.getElementById('agnDatang').value;
    const pulang = document.getElementById('agnPulang').value;

    if (!nama || !tanggal || !judul || !ket || !datang || !pulang) {
        showToast('⚠️ Semua field wajib diisi!', 'error');
        btn.innerHTML = orig;
        btn.disabled = false;
        return;
    }

    let fotoBase64 = null;
    const fi = document.getElementById('agnFoto');
    if (fi && fi.files.length > 0) {
        const file = fi.files[0];
        if (!file.type.startsWith('image/')) {
            showToast("File harus berupa gambar", "error");
            btn.innerHTML = orig;
            btn.disabled = false;
            return;
        }
        try {
            fotoBase64 = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = async (ev) => {
                    try {
                        const compressed = await compressImage(ev.target.result);
                        resolve(compressed);
                    } catch (e) {
                        reject(e);
                    }
                };
                r.onerror = reject;
                r.readAsDataURL(file);
            });
        } catch (e) {
            showToast("Gagal memproses foto: " + e.message, "error");
            btn.innerHTML = orig;
            btn.disabled = false;
            return;
        }
    }

    const payload = {
        action: 'submitAgenda',
        idPegawai: dbK.find(k => k.Nama === nama)?.ID || '',
        nama: nama,
        jabatan: document.getElementById('agnJabatanInput').value,
        tanggal: tanggal,
        jamDatang: datang,
        jamPulang: pulang,
        agenda: judul,
        keterangan: ket,
        foto: fotoBase64
    };

    try {
        const result = await safeFetchJSON(API_URL, { method: 'POST', body: JSON.stringify(payload) }, 20000);
        if (result.status === 'success') {
            showToast("✅ Laporan Agenda berhasil terkirim!", "success");
            closeAgenda();
            ['agnJudulInput', 'agnKetInput', 'agnFoto'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            // ✅ FIXED: Silent refresh setelah submit agenda
            setTimeout(() => loadData(true, false, true), 500);
        } else {
            showToast("Gagal mengirim: " + (result.message || 'Unknown error'), "error");
        }
    } catch (e) {
        showToast("Terjadi kesalahan jaringan: " + e.message, "error");
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
        safeCreateIcons();
    }
}

// ============================================================
// 20. UI INTERACTIONS (🆕 OPTIMASI: Throttle + debounce search)
// ============================================================
function onDateChange() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const newDate = document.getElementById('fDate').value;
        const cachedPresensi = localStorage.getItem('wilayah_presensi_' + newDate);
        if (cachedPresensi) {
            dbP = JSON.parse(cachedPresensi);
            indexData();
            updateKorlapStats();
            filterData();
        }
        // ✅ FIXED: Eksplisit parameter
        loadData(true, false, false);
        countdown = 60;
    }, 300);
}

// 🆕 OPTIMASI: Throttle + debounce hybrid
function onSearchInput() {
    const now = Date.now();
    if (now - lastFilterTime > 800) {
        // Throttle: jika >800ms dari last filter, langsung filter
        filterData();
        lastFilterTime = now;
    } else {
        // Debounce: jika user sedang mengetik cepat, tunggu 400ms
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterData();
            lastFilterTime = Date.now();
        }, 400);
    }
}

function toggleView(v) {
    document.getElementById('btnG').classList.toggle('active', v === 'grid');
    document.getElementById('btnT').classList.toggle('active', v === 'table');
    document.getElementById('gridView').style.display = v === 'grid' ? 'grid' : 'none';
    document.getElementById('tableWrapper').style.display = v === 'table' ? 'block' : 'none';
    localStorage.setItem('wilayah_view_preference', v);
    filterData();
}

function resetFilters() {
    document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('fWil').value = 'ALL';
    document.getElementById('fSearch').value = '';
    setQuickFilter('ALL', document.querySelector('.q-chip[data-filter="ALL"]'));
    showToast('Filter telah direset', 'info');
}

function exportData() {
    const rows = document.querySelectorAll('#tableBody tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].textContent.includes('Belum ada data'))) {
        showToast('⚠️ Tidak ada data untuk diexport!', 'error');
        return;
    }
    let csv = 'Nama,Wilayah,Masuk,Bukti Masuk,Pulang,Bukti Pulang\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const data = Array.from(cells).slice(0, 6).map(cell => {
            let text = cell.textContent.trim().replace(/,/g, ';');
            text = text.replace(/[🔍📷📄🗺️]/g, '').trim();
            return text;
        });
        csv += data.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monitoring_${document.getElementById('fDate').value}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ Data berhasil diexport!', 'success');
}

// ============================================================
// 21. SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('✅ Service Worker registered successfully'))
            .catch(err => console.warn('SW registration failed:', err));
    });
} else if ('serviceWorker' in navigator && window.location.protocol === 'file:') {
    console.info('ℹ️ Service Worker tidak didukung di local file (file://).');
}

// ============================================================
// 22. LOAD VIEW PREFERENCE
// ============================================================
const savedView = localStorage.getItem('wilayah_view_preference') || 'grid';
if (savedView === 'table') {
    setTimeout(() => toggleView('table'), 100);
}

// ============================================================
// 23. ✅ TOP 5 UPGRADES
// ============================================================

function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdown = 60;
    
    countdownInterval = setInterval(() => {
        countdown--;
        const timerEl = document.getElementById('countdownTimer');
        if (timerEl) {
            timerEl.innerText = countdown + 's';
            if (countdown <= 10) timerEl.setAttribute('data-urgent', 'true');
            else timerEl.removeAttribute('data-urgent');
        }
        
        if (countdown <= 0) {
            countdown = 60;
            // ✅ FIXED: Silent auto-refresh (jangan ganggu user)
            if (!document.hidden) loadData(true, true, true);
        }
    }, 1000);
}

// 🆕 OPTIMASI: Batch DOM updates dengan requestAnimationFrame
function updateSummaryCards(stats) {
    const animateValue = (id, end, duration = 600) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        const start = parseInt(el.textContent) || 0;
        if (start === end) return;
        
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + (end - start) * eased);
            el.textContent = current;
            if (progress < 1) window.requestAnimationFrame(step);
            else el.textContent = end;
        };
        window.requestAnimationFrame(step);
    };
    
    requestAnimationFrame(() => {
        animateValue('sumTotal', stats.total);
        animateValue('sumHadir', stats.hadir);
        animateValue('sumPulang', stats.pulang);
        animateValue('sumBelum', stats.belum);
    });
}

function updateChipCounters(stats) {
    requestAnimationFrame(() => {
        const updates = [
            { filter: 'ALL', count: stats.total },
            { filter: 'BELUM', count: stats.belum },
            { filter: 'HADIR', count: stats.hadir },
            { filter: 'PULANG', count: stats.pulang },
            { filter: 'SID', count: stats.sid }
        ];
        
        updates.forEach(({ filter, count }) => {
            const chip = document.querySelector(`.q-chip[data-filter="${filter}"]`);
            if (!chip) return;
            
            const oldCounter = chip.querySelector('.chip-count');
            if (oldCounter) oldCounter.remove();
            
            const counterEl = document.createElement('span');
            counterEl.className = 'chip-count';
            counterEl.textContent = count;
            chip.appendChild(counterEl);
        });
    });
}

function setQuickFilter(filter, el) {
    activeQuickFilter = filter;
    
    document.querySelectorAll('.q-chip').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-pressed', 'false');
    });
    if (el) {
        el.classList.add('active');
        el.setAttribute('aria-pressed', 'true');
    }
    
    countdown = 60;
    filterData();
}

// 🆕 FIX: WhatsApp broadcast dengan multi-contact dan delay
async function sendWABroadcast() {
    const wil = document.getElementById('fWil').value;
    const search = document.getElementById('fSearch').value.toLowerCase();
    const selectedDate = document.getElementById('fDate').value;
    
    const belumPresensi = [];
    dbE.forEach(p => {
        if ((wil === 'ALL' || p.Wilayah === wil) && 
            (!search || (p.Nama || '').toLowerCase().includes(search))) {
            const stats = computePegawaiStats(String(p.ID));
            if (!stats || (stats.in === '-' && !stats.sid)) {
                const hp = String(p.NoHP || p.no_hp || '').replace(/[^0-9]/g, '');
                if (hp) belumPresensi.push({
                    nama: p.Nama, hp: hp, wilayah: p.Wilayah
                });
            }
        }
    });
    
    if (belumPresensi.length === 0) {
        showToast('✅ Semua pegawai sudah presensi! Tidak ada yang perlu diingatkan.', 'success');
        return;
    }
    
    // 🆕 Batasi jumlah untuk menghindari pop-up spam
    if (belumPresensi.length > 10) {
        showToast(`⚠️ Terlalu banyak (${belumPresensi.length}) nomor. Filter wilayah dulu.`, 'warning');
        return;
    }
    
    const confirmMsg = `Akan mengirim reminder ke ${belumPresensi.length} pegawai yang belum presensi.\n\nLanjutkan?`;
    if (!confirm(confirmMsg)) return;
    
    const dateFormatted = new Date(selectedDate).toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    
    const pesanTemplate = 
        `🔔 *REMINDER PRESENSI*\n\n` +
        `Yth. {nama},\n\n` +
        `Mohon segera melakukan presensi hari ini (${dateFormatted}).\n\n` +
        `📍 _Sistem Monitoring UPT PUSDA WS Bondoyudo Baru_\n\n` +
        `🔗 ${window.location.origin}/presensi.html`;
    
    // 🆕 Buka link satu per satu dengan delay
    let opened = 0;
    for (const p of belumPresensi) {
        const pesan = encodeURIComponent(pesanTemplate.replace('{nama}', p.nama));
        const waUrl = `https://wa.me/${p.hp}?text=${pesan}`;
        window.open(waUrl, '_blank');
        opened++;
        if (opened < belumPresensi.length) {
            await new Promise(r => setTimeout(r, 1500)); // Delay 1.5s
        }
    }
    
    showToast(`✅ Membuka ${opened} reminder WhatsApp. Cek tab baru!`, 'success');
}

function openProfile(pegawaiId) {
    const pegawai = pegawaiById.get(String(pegawaiId));
    if (!pegawai) {
        showToast('❌ Data pegawai tidak ditemukan', 'error');
        return;
    }
    
    const params = new URLSearchParams({
        id: pegawai.ID || pegawaiId,
        nama: pegawai.Nama || '',
        jabatan: pegawai.Jabatan || 'PPA',
        wilayah: pegawai.Wilayah || 'UPT',
        foto: pegawai.Link_Foto_Profile || ''
    });
    
    sessionStorage.setItem('return_from_profile', 'true');
    window.open('profile_raport.html?' + params.toString(), '_blank');
}

// ============================================================
// END OF WILAYAH.JS v2.1
// ============================================================
