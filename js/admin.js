// ============================================================
// ADMIN.JS - v2.5.0 (Full dengan Dashboard, Export, Branding Dinamis)
// Fitur: Dashboard Statistik, Export PDF/Excel, Reset Password, Branding Dinamis
// ============================================================

// ============ KONFIGURASI GLOBAL ============
var GITHUB_ASSETS = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/";
var LOGO_INSTANSI = GITHUB_ASSETS + "logo.png";
var API = "https://script.google.com/macros/s/AKfycbxH9YKIi5epf2PvsJL9Whens2URSaZzi1aciTEiyIYitVBvjJP83tNa-B9xaIuN5f-3/exec";
var FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 85'%3E%3Crect width='60' height='85' fill='%232e446e'/%3E%3Cpath d='M30 40c5.5 0 10-4.5 10-10s-4.5-10-10-10-10 4.5-10 10 4.5 10 10 10zm0 5c-8 0-20 4-20 12v5h40v-5c0-8-12-12-20-12z' fill='%23ffffff' opacity='.2'/%3E%3C/svg%3E";

var token = "",
    masterData = { pegawai: [], korlap: [], tools: [], config: {} };
var base64Foto = null,
    logMode = 'edit',
    logsCache = [],
    currentGeoFences = [];
var currentDetailType = '',
    currentDetailId = '',
    currentView = 'list';
var debounceTimer,
    currentLogPage = 1;
var dashboardData = null;
var chartInstance = null;

var APP_CONFIG = {
    IMAGE_MAX_WIDTH: 800,
    IMAGE_QUALITY: 0.75,
    MAX_FILE_SIZE_MB: 3,
    CACHE_DURATION_MS: 5 * 60 * 1000,
    LOGS_PER_PAGE: 50,
    FETCH_TIMEOUT: 15000,
    RETRY_DELAY: 1000
};

// ============ PWA MANIFEST ============
(function initManifest() {
    try {
        var pageUrl = location.origin + location.pathname;
        var scopeUrl = pageUrl.replace(/[^/]*$/, '');
        var mf = {
            name: "E-PUSDA Admin Panel",
            short_name: "E-PUSDA Admin",
            start_url: pageUrl,
            scope: scopeUrl,
            display: "standalone",
            background_color: "#0d1b3e",
            theme_color: "#0d1b3e",
            icons: [
                { src: LOGO_INSTANSI, sizes: "192x192", type: "image/png" },
                { src: LOGO_INSTANSI, sizes: "512x512", type: "image/png", purpose: "any maskable" }
            ]
        };
        var blob = new Blob([JSON.stringify(mf)], { type: 'application/manifest+json' });
        var uri = URL.createObjectURL(blob);
        var el = document.getElementById('pwaManifest');
        if (el) el.setAttribute('href', uri);
        else {
            var l = document.createElement('link');
            l.rel = 'manifest';
            l.href = uri;
            document.head.appendChild(l);
        }
    } catch (e) { console.warn('Manifest init failed:', e); }
})();

// ============ BRAND & WATERMARK CONFIG ============
function getBrandConfig() {
    var config = masterData.config || {};
    return {
        watermark: config.WATERMARK || 'PUSDA',
        singkatan: config.BRAND_SINGKATAN || 'PUSDA',
        part1: config.BRAND_PART1 || 'PU',
        part2: config.BRAND_PART2 || 'SDA',
        sub: config.BRAND_SUB || 'WS BONDOYUDO BARU'
    };
}

function updateBrand() {
    var brand = getBrandConfig();
    
    var part1 = document.getElementById('brandPart1');
    var part2 = document.getElementById('brandPart2');
    var sub = document.getElementById('brandSub');
    var loginPart1 = document.getElementById('loginBrandPart1');
    var loginPart2 = document.getElementById('loginBrandPart2');
    var loginSub = document.getElementById('loginBrandSub');
    
    if (part1) part1.innerText = brand.part1;
    if (part2) part2.innerText = brand.part2;
    if (sub) sub.innerText = brand.sub;
    if (loginPart1) loginPart1.innerText = brand.part1;
    if (loginPart2) loginPart2.innerText = brand.part2;
    if (loginSub) loginSub.innerText = brand.sub;
}

// ============ FETCH DENGAN TIMEOUT & RETRY ============
function fetchWithTimeout(url, opts, timeout) {
    opts = opts || {};
    timeout = timeout || APP_CONFIG.FETCH_TIMEOUT;
    var ctrl = new AbortController();
    var tid = setTimeout(function() { ctrl.abort(new DOMException('Timeout ' + timeout + 'ms', 'AbortError')); }, timeout);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(function() { clearTimeout(tid); });
}

async function safeFetchJSON(url, opts, timeout, retries) {
    opts = opts || {};
    timeout = timeout || APP_CONFIG.FETCH_TIMEOUT;
    retries = retries || 2;
    for (var i = 0; i <= retries; i++) {
        try {
            var res = await fetchWithTimeout(url, opts, timeout);
            if (res.status === 404) {
                throw new Error('Backend tidak ditemukan (404). Deployment GAS mungkin belum di-deploy ulang.');
            }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var txt = await res.text();
            if (!txt || !txt.trim()) throw new Error('Response kosong');
            if (txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) {
                throw new Error('Server return HTML error');
            }
            try { return JSON.parse(txt); } catch (e) { throw new Error('Parse JSON gagal: ' + e.message); }
        } catch (e) {
            var isTimeout = e.name === 'AbortError' || (e.message && e.message.includes('Timeout'));
            var isRetryable = (isTimeout || e.message.includes('Failed to fetch')) && !e.message.includes('404');
            if (isRetryable && i < retries) {
                console.warn('⏱️ Fetch retry ' + (i + 1) + '/' + retries + '...');
                await new Promise(function(r) { setTimeout(r, APP_CONFIG.RETRY_DELAY * (i + 1)); });
                continue;
            }
            if (isTimeout) {
                var err = new Error('Timeout koneksi');
                err.name = 'TimeoutError';
                throw err;
            }
            throw e;
        }
    }
}

// ============ UTILITIES ============
function parseGeoData(rawData) {
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    if (typeof rawData === 'string') {
        var t = rawData.trim();
        if (t === '[]' || t === 'null' || t === '') return [];
        try {
            var p = JSON.parse(t);
            if (Array.isArray(p)) {
                return p.filter(function(i) { return i && 'lat' in i && 'lng' in i; }).map(function(i) {
                    return {
                        nama: i.nama || 'Lokasi',
                        lat: parseFloat(i.lat) || 0,
                        lng: parseFloat(i.lng) || 0,
                        radius: parseInt(i.radius) || 100
                    };
                });
            }
        } catch (e) { console.warn("⚠️ Parse Koordinat_Tugas gagal:", e.message); }
    }
    return [];
}

function sanitizeGeoData(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function(p) {
        var r = p.Koordinat_Tugas || p.koordinat_tugas;
        var parsed = parseGeoData(r);
        p.Koordinat_Tugas = parsed.length > 0 ? JSON.stringify(parsed) : '[]';
        delete p.koordinat_tugas;
        return p;
    });
}

function getLocalDateStr(d) {
    if (!d) return "";
    var dt = new Date(d);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function sanitizeHTML(s) {
    if (s == null) return "";
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function debounce(fn, delay) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, delay);
}

function getQRUrl(n, h) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent((n || 'NAMA') + '_' + (h || 'NOHP'));
}

// ============ GET SMART URL - Support LH3 ============
function extractFileIdFromUrl(url) {
    if (!url) return null;
    if (url.includes('lh3.googleusercontent.com')) {
        var match = url.match(/\/d\/([^\/\?=]+)/);
        if (match && match[1]) return match[1];
    }
    if (url.includes('drive.google.com')) {
        var match = url.match(/\/d\/([^\/\?]+)/);
        if (match && match[1]) return match[1];
        match = url.match(/[?&]id=([^&]+)/);
        if (match && match[1]) return match[1];
    }
    if (url.includes('googleusercontent.com')) {
        var match = url.match(/[?&]id=([^&]+)/);
        if (match && match[1]) return match[1];
    }
    return null;
}

function getSmartUrl(url) {
    if (!url) return FALLBACK_IMAGE;
    if (url === '-') return FALLBACK_IMAGE;
    if (url.includes('lh3.googleusercontent.com')) {
        if (!url.includes('=w')) return url + '=w500-h500';
        return url;
    }
    if (url.includes('drive.google.com') || url.includes('googleusercontent.com')) {
        var fileId = extractFileIdFromUrl(url);
        if (fileId) return 'https://lh3.googleusercontent.com/d/' + fileId + '=w500-h500';
        if (url.includes('googleusercontent')) return url.split('=')[0] + '=s500';
        return url.replace('/view', '/preview');
    }
    return url;
}

// ============ TOAST ============
function showToast(msg, type) {
    type = type || "success";
    var c = document.getElementById('toastContainer');
    if (!c) return;
    var d = document.createElement('div');
    d.className = 'toast ' + type;
    var titles = { success: 'Berhasil', error: 'Gagal', warning: 'Perhatian' };
    var icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle' };
    d.innerHTML =
        '<div class="toast-icon-wrap"><i data-lucide="' + icons[type] + '" size="24"></i></div><div class="toast-content"><div class="toast-title">' + titles[type] + '</div><div class="toast-message">' + sanitizeHTML(msg) + '</div></div><button class="toast-close" onclick="dismissToast(this.parentElement)"><i data-lucide="x" size="16"></i></button><div class="toast-progress"></div>';
    c.appendChild(d);
    lucide.createIcons();
    setTimeout(function() { if (d.parentElement) dismissToast(d); }, 4000);
}

function dismissToast(t) {
    if (!t) return;
    t.style.animation = 'toastOut 0.4s forwards';
    setTimeout(function() { t.remove(); }, 400);
}

// ============ PASSWORD VISIBILITY TOGGLE ============
function togglePasswordVisibility() {
    var input = document.getElementById('adminPass');
    var icon = document.getElementById('eyeIcon');
    if (!input || !icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        icon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
}

// ============ LOGOUT ============
function logoutAdmin() {
    if (!confirm("Yakin ingin keluar dari panel admin?")) return;
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('dashData');
    sessionStorage.removeItem('dashDataTime');
    token = '';
    document.body.classList.remove('logged-in');
    document.body.classList.add('not-logged-in');
    var passInput = document.getElementById('adminPass');
    if (passInput) passInput.value = '';
    showToast("Berhasil logout", "success");
}

// ============ MODAL CONTROLS ============
function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.style.display = 'flex';
    setTimeout(function() { m.classList.add('show'); }, 10);
}

function closeModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.remove('show');
    setTimeout(function() { m.style.display = 'none'; }, 300);
    base64Foto = null;
}

function setLoading(s, t) {
    var o = document.getElementById('sendingOverlay');
    if (!o) return;
    if (t) {
        var txt = document.getElementById('overlayText');
        if (txt) txt.innerText = t;
    }
    if (s) {
        o.style.display = 'flex';
        setTimeout(function() { o.classList.add('show'); }, 10);
    } else {
        o.classList.remove('show');
        setTimeout(function() { o.style.display = 'none'; }, 300);
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === "Escape") {
        var modals = document.querySelectorAll('.modal.show');
        for (var i = 0; i < modals.length; i++) {
            closeModal(modals[i].id);
        }
    }
});

// ============ HELPER: DETEKSI MOBILE ============
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth <= 768 ||
        ('ontouchstart' in window);
}

// ============ AUTH LOGIN ============
async function attemptLogin() {
    var passInput = document.getElementById('adminPass');
    if (!passInput) {
        showToast("Input password tidak ditemukan!", "error");
        return;
    }
    var password = passInput.value.trim();
    if (!password) {
        showToast("Masukkan password terlebih dahulu!", "warning");
        passInput.focus();
        return;
    }
    setLoading(true, "Otentikasi...");
    try {
        var payload = { action: 'loginAdmin', password: password };
        var result = await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }, 15000);
        if (result.status === 'success') {
            token = result.token;
            sessionStorage.setItem('adminToken', token);
            var splitLayout = document.querySelector('.login-split-layout');
            if (splitLayout) splitLayout.classList.add('success');
            setTimeout(function() {
                document.body.classList.remove('not-logged-in');
                document.body.classList.add('logged-in');
                loadDashboard(true);
                showToast("Login Berhasil", "success");
                lucide.createIcons();
            }, 500);
        } else {
            showToast(result.message || "Password salah!", "error");
            passInput.value = '';
            passInput.focus();
        }
    } catch (e) {
        console.error("❌ Login Error:", e);
        showToast("Gagal login: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

// ============ INISIALISASI ============
window.onload = function() {
    lucide.createIcons();
    setInterval(function() {
        var el = document.getElementById('liveClock');
        if (el) el.innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }, 1000);
    var sidebarLogo = document.getElementById('sidebarLogo');
    if (sidebarLogo) sidebarLogo.src = LOGO_INSTANSI;
    var logDateFilter = document.getElementById('logDateFilter');
    if (logDateFilter) logDateFilter.value = new Date().toISOString().split('T')[0];
    var savedToken = sessionStorage.getItem('adminToken');
    if (savedToken) {
        token = savedToken;
        document.body.classList.remove('not-logged-in');
        document.body.classList.add('logged-in');
        loadDashboard(true);
    } else {
        warmUpBackend();
    }
    updateFabVisibility();
    initDashboardTab();
};

// ============ WARM-UP BACKEND ============
function warmUpBackend() {
    fetchWithTimeout(API + "?action=getDashboardData", { redirect: 'follow', cache: 'no-cache' }, 20000)
        .then(function() { console.log('✅ Backend siap'); })
        .catch(function() { /* telan diam-diam */ });
}

// ============ FETCH INITIAL ============
async function fetchInitial() {
    try {
        var data = await safeFetchJSON(API + "?action=getDashboardData", { redirect: 'follow', cache: 'no-cache' }, 25000, 1);
        if (data.status === 'error') throw new Error(data.message);
        masterData = {
            pegawai: sanitizeGeoData(data.pegawai || []),
            korlap: sanitizeGeoData(data.korlap || []),
            tools: data.tools || [],
            config: data.config || {}
        };
        if (masterData.config.Logo) {
            var sidebarLogo = document.getElementById('sidebarLogo');
            if (sidebarLogo) sidebarLogo.src = masterData.config.Logo;
        }
        if (masterData.config.PlayStore_URL) {
            var playStoreLink = document.getElementById('playStoreLink');
            if (playStoreLink) playStoreLink.href = masterData.config.PlayStore_URL;
        }
    } catch (e) {
        console.warn('Fetch initial gagal:', e.message);
        if (document.body.classList.contains('logged-in')) {
            showToast("Gagal Terhubung: " + e.message, "error");
        }
    }
}

// ============ LOAD DASHBOARD ============
async function loadDashboard(forceRefresh) {
    forceRefresh = forceRefresh || false;
    var cached = sessionStorage.getItem('dashData');
    var cacheTime = sessionStorage.getItem('dashDataTime');
    var now = Date.now();
    var isMobile = isMobileDevice();
    var cacheDuration = isMobile ? 30 * 1000 : APP_CONFIG.CACHE_DURATION_MS;
    var useCache = !forceRefresh && cached && cacheTime &&
        (now - parseInt(cacheTime) < cacheDuration) && !isMobile;

    if (useCache) {
        try {
            masterData = JSON.parse(cached);
            renderPegawai();
            renderKorlap();
            renderTools();
            renderConfig();
            renderDashboard();
            updateBrand();
            silentBackgroundRefresh();
            return;
        } catch (e) {
            console.warn('Cache corrupt, fetch ulang');
        }
    }

    setLoading(true, "Sinkronisasi Data...");
    try {
        var timeout = isMobile ? 30000 : 15000;
        var data = await safeFetchJSON(API + "?action=getDashboardData", { redirect: 'follow', cache: 'no-cache' }, timeout);
        masterData = {
            pegawai: sanitizeGeoData(data.pegawai || []),
            korlap: sanitizeGeoData(data.korlap || []),
            tools: data.tools || [],
            config: data.config || {}
        };
        
        // Ambil data presensi hari ini untuk dashboard
        try {
            var presensiToday = await safeFetchJSON(API + "?action=getTodayPresensi", { redirect: 'follow', cache: 'no-cache' }, 10000);
            dashboardData = presensiToday.data || [];
        } catch (e) {
            dashboardData = [];
        }

        var light = {
            pegawai: masterData.pegawai.map(function(p) {
                return {
                    id: p.id,
                    nama: p.nama,
                    wilayah: p.wilayah,
                    status: p.status,
                    jabatan: p.jabatan,
                    nohp: p.nohp,
                    Koordinat_Tugas: p.Koordinat_Tugas
                };
            }),
            korlap: masterData.korlap,
            tools: masterData.tools,
            config: masterData.config,
            dashboard: dashboardData
        };
        try {
            sessionStorage.setItem('dashData', JSON.stringify(light));
            sessionStorage.setItem('dashDataTime', now.toString());
        } catch (e) { console.warn('SessionStorage penuh, lanjut tanpa cache'); }
        
        renderPegawai();
        renderKorlap();
        renderTools();
        renderConfig();
        renderDashboard();
        updateBrand();
    } catch (e) {
        showToast("Gagal memuat data: " + e.message, "error");
        if (cached) {
            try {
                masterData = JSON.parse(cached);
                renderPegawai();
                renderKorlap();
                renderTools();
                renderConfig();
                renderDashboard();
                updateBrand();
                showToast("Menampilkan data cache (offline mode)", "warning");
            } catch (e2) {}
        }
    } finally {
        setLoading(false);
    }
}

async function silentBackgroundRefresh() {
    try {
        var data = await safeFetchJSON(API + "?action=getDashboardData", { redirect: 'follow', cache: 'no-cache' }, 25000);
        masterData = {
            pegawai: sanitizeGeoData(data.pegawai || []),
            korlap: sanitizeGeoData(data.korlap || []),
            tools: data.tools || [],
            config: data.config || {}
        };
        try {
            var presensiToday = await safeFetchJSON(API + "?action=getTodayPresensi", { redirect: 'follow', cache: 'no-cache' }, 10000);
            dashboardData = presensiToday.data || [];
        } catch (e) {
            dashboardData = [];
        }
        var now = Date.now();
        try { sessionStorage.setItem('dashDataTime', now.toString()); } catch (e) {}
        renderPegawai();
        renderKorlap();
        renderTools();
        renderConfig();
        renderDashboard();
        updateBrand();
    } catch (e) {
        console.warn('Background refresh gagal:', e.message);
    }
}

// ============ SWITCH TAB ============
function switchTab(tab) {
    // Sembunyikan semua tab
    var tabs = document.querySelectorAll('.admin-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].style.display = 'none';
    }
    var tabEl = document.getElementById('tab-' + tab);
    if (tabEl) tabEl.style.display = 'block';

    // ✅ UPDATE NAV LINK DI SIDEBAR
    var navLinks = document.querySelectorAll('.sidebar .nav-link');
    for (var j = 0; j < navLinks.length; j++) {
        navLinks[j].classList.remove('active');
    }
    
    // ✅ UPDATE BOTTOM NAV
    var bottomItems = document.querySelectorAll('.bottom-nav-admin .b-nav-item');
    for (var k = 0; k < bottomItems.length; k++) {
        bottomItems[k].classList.remove('active');
    }

    // ✅ AKTIFKAN YANG SESUAI
    var activeSidebar = document.querySelector('.sidebar .nav-link[onclick*="' + tab + '"]');
    if (activeSidebar) activeSidebar.classList.add('active');

    var activeBottom = document.querySelector('.bottom-nav-admin .b-nav-item[onclick*="' + tab + '"]');
    if (activeBottom) activeBottom.classList.add('active');

    // Render konten
    if (tab === 'dashboard') {
        renderDashboard();
    } else if (tab === 'pegawai') {
        renderPegawai();
    } else if (tab === 'korlap') {
        renderKorlap();
    } else if (tab === 'tools') {
        renderTools();
    } else if (tab === 'logs') {
        loadLogs();
    } else if (tab === 'config') {
        renderConfig();
    }

    lucide.createIcons();
    updateFabVisibility();
}

// ============ DASHBOARD ============
function initDashboardTab() {
    // Inisialisasi chart jika Chart.js tersedia
    if (typeof Chart !== 'undefined') {
        var ctx = document.getElementById('kehadiranChart');
        if (ctx) {
            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
                    datasets: [{
                        label: 'Hadir',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: '#10b981',
                        borderWidth: 1
                    }, {
                        label: 'Alpha',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: '#ef4444',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            labels: { color: '#e2e8f0' }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        x: {
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    }
                }
            });
        }
    }
}

function renderDashboard() {
    var pegawai = masterData.pegawai || [];
    var korlap = masterData.korlap || [];
    var logs = dashboardData || [];
    
    var totalPegawai = pegawai.filter(function(p) { return (p.status || 'Aktif') !== 'Nonaktif'; }).length;
    var totalKorlap = korlap.filter(function(p) { return (p.status || 'Aktif') !== 'Nonaktif'; }).length;
    
    var hadir = 0, telat = 0, izin = 0, alpha = 0;
    logs.forEach(function(l) {
        var st = (l.status || l.Status || '').toLowerCase().trim();
        if (!st) return;
        if (st.includes('hadir') && !st.includes('terlambat')) hadir++;
        else if (st.includes('terlambat') || st.includes('qr')) telat++;
        else if (st.includes('izin') || st.includes('sakit') || st.includes('dinas')) izin++;
        else alpha++;
    });
    
    var totalHadir = hadir + telat;
    var totalAlpha = alpha;
    var totalLog = logs.length || 1;
    var persentase = Math.round((totalHadir / totalLog) * 100) || 0;

    // ✅ UPDATE DENGAN FALLBACK - Cek elemen sebelum diisi
    var el = document.getElementById('totalPegawai');
    if (el) el.innerText = totalPegawai;
    
    el = document.getElementById('totalKorlap');
    if (el) el.innerText = totalKorlap;
    
    el = document.getElementById('totalHadir');
    if (el) el.innerText = totalHadir;
    
    el = document.getElementById('totalAlpha');
    if (el) el.innerText = totalAlpha;
    
    el = document.getElementById('persentaseKehadiran');
    if (el) {
        el.innerText = persentase + '%';
        if (persentase >= 80) el.style.color = '#10b981';
        else if (persentase >= 60) el.style.color = '#f59e0b';
        else el.style.color = '#ef4444';
    }

    // ✅ ALPHA LIST
    var alphaList = document.getElementById('alphaList');
    if (alphaList) {
        var pegawaiAlpha = {};
        logs.forEach(function(l) {
            var id = l['ID Pegawai'] || l.id_pegawai || l.id || l.ID;
            var nama = l.nama || l.Nama || id;
            var st = (l.status || l.Status || '').toLowerCase().trim();
            if (!st) return;
            if (!pegawaiAlpha[id]) {
                pegawaiAlpha[id] = { nama: nama, alpha: 0, hadir: 0 };
            }
            if (st.includes('hadir') || st.includes('terlambat') || st.includes('qr')) {
                pegawaiAlpha[id].hadir++;
            } else if (!st.includes('izin') && !st.includes('sakit') && !st.includes('dinas')) {
                pegawaiAlpha[id].alpha++;
            }
        });
        
        var alphaArray = Object.values(pegawaiAlpha);
        alphaArray.sort(function(a, b) { return b.alpha - a.alpha; });
        var topAlpha = alphaArray.slice(0, 5);
        
        if (topAlpha.length === 0 || topAlpha.every(function(p) { return p.alpha === 0; })) {
            alphaList.innerHTML = '<p style="opacity:0.5;text-align:center;padding:20px;">✅ Tidak ada pegawai dengan Alpha</p>';
        } else {
            alphaList.innerHTML = topAlpha.map(function(p, idx) {
                var icon = idx === 0 ? '🔴' : idx === 1 ? '🟠' : '🟡';
                return '<div class="alpha-item">' +
                    '<span class="alpha-rank">' + icon + ' #' + (idx + 1) + '</span>' +
                    '<span class="alpha-name">' + sanitizeHTML(p.nama || 'N/A') + '</span>' +
                    '<span class="alpha-count">Alpha: ' + p.alpha + '</span>' +
                    '</div>';
            }).join('');
        }
    }

    // ✅ CHART
    updateChart(logs);
    lucide.createIcons();
}

function updateChart(logs) {
    if (typeof Chart === 'undefined' || !chartInstance) return;
    
    // Hitung per hari dalam seminggu terakhir
    var days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    var hadirData = [0, 0, 0, 0, 0, 0, 0];
    var alphaData = [0, 0, 0, 0, 0, 0, 0];
    
    var today = new Date();
    var startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1);
    if (today.getDay() === 0) startOfWeek.setDate(today.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);
    
    var endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    logs.forEach(function(l) {
        var ts = l.timestamp || l.Timestamp;
        if (!ts) return;
        var date = new Date(ts);
        if (date >= startOfWeek && date <= endOfWeek) {
            var dayIndex = (date.getDay() + 6) % 7; // Senin=0, Minggu=6
            var st = (l.status || l.Status || '').toLowerCase().trim();
            if (!st) return;
            if (st.includes('hadir') || st.includes('terlambat') || st.includes('qr')) {
                hadirData[dayIndex]++;
            } else if (!st.includes('izin') && !st.includes('sakit') && !st.includes('dinas')) {
                alphaData[dayIndex]++;
            }
        }
    });
    
    chartInstance.data.datasets[0].data = hadirData;
    chartInstance.data.datasets[1].data = alphaData;
    chartInstance.update();
}

// ============================================================
// EXPORT FUNCTIONS
// ============================================================

function exportReportPDF() {
    var start = document.getElementById('reportStart')?.value;
    var end = document.getElementById('reportEnd')?.value;
    if (!start || !end) {
        showToast("Pilih rentang tanggal!", "warning");
        return;
    }
    showToast("Membuat PDF...", "info");
    window.open('generate-pdf.html?start=' + start + '&end=' + end + '&region=ALL', '_blank');
}

function exportPegawaiExcel() {
    var data = masterData.pegawai || [];
    if (!data.length) {
        showToast("Tidak ada data pegawai!", "warning");
        return;
    }
    var csv = "ID,Nama,Jabatan,Wilayah,No HP,Status\n";
    data.forEach(function(p) {
        csv += (p.id || '') + ',' +
               (p.nama || '') + ',' +
               (p.jabatan || '') + ',' +
               (p.wilayah || '') + ',' +
               (p.nohp || '') + ',' +
               (p.status || 'Aktif') + '\n';
    });
    var blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Data_Pegawai_" + getLocalDateStr(new Date()) + ".csv");
    link.click();
    showToast("Data berhasil diunduh", "success");
}

// ============ CHANGE PASSWORD ============
function openChangePasswordModal() {
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('confirmPass').value = '';
    openModal('changePasswordModal');
}

async function changeAdminPassword() {
    var oldPass = document.getElementById('oldPass').value.trim();
    var newPass = document.getElementById('newPass').value.trim();
    var confirmPass = document.getElementById('confirmPass').value.trim();
    if (!oldPass || !newPass || !confirmPass) {
        showToast("Semua field wajib diisi!", "warning");
        return;
    }
    if (newPass !== confirmPass) {
        showToast("Password baru tidak cocok!", "error");
        return;
    }
    if (newPass.length < 4) {
        showToast("Password minimal 4 karakter!", "warning");
        return;
    }
    setLoading(true, "Mengganti Password...");
    try {
        var result = await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'changePassword',
                token: token,
                oldPassword: oldPass,
                newPassword: newPass
            })
        }, 15000);
        if (result.status === 'success') {
            closeModal('changePasswordModal');
            showToast("Password berhasil diubah!", "success");
        } else {
            throw new Error(result.message || "Gagal mengganti password");
        }
    } catch (e) {
        showToast("Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

// ============ UPDATE QR ============
function updateQRRealtime() {
    var n = document.getElementById('p-nama') ? document.getElementById('p-nama').value.trim() : '';
    var h = document.getElementById('p-nohp') ? document.getElementById('p-nohp').value.trim() : '';
    if (n || h) {
        var qrImg = document.getElementById('p-qr-img');
        if (qrImg) qrImg.src = getQRUrl(n, h);
        var container = document.getElementById('qr-display-container');
        if (container) container.style.display = 'block';
    }
}

// ============ SET VIEW ============
function setView(view) {
    currentView = view;
    
    // Toggle desktop view buttons
    var viewBtns = document.querySelectorAll('.view-toggle button');
    for (var i = 0; i < viewBtns.length; i++) {
        viewBtns[i].classList.remove('active');
    }

    if (view === 'list') {
        // Desktop: tampilkan tabel, sembunyikan card grid
        var btnList = document.getElementById('btnListView');
        var btnListK = document.getElementById('btnListViewKorlap');
        if (btnList) btnList.classList.add('active');
        if (btnListK) btnListK.classList.add('active');
        
        var tables = document.querySelectorAll('.personel-table');
        for (var j = 0; j < tables.length; j++) {
            tables[j].classList.remove('hidden');
        }
        
        var grids = document.querySelectorAll('.desktop-card-grid');
        for (var k = 0; k < grids.length; k++) {
            grids[k].classList.remove('active');
        }
        
        // ✅ MOBILE: Tampilkan mobile grid, sembunyikan tabel
        var mobileGrids = document.querySelectorAll('.mobile-grid-view');
        for (var m = 0; m < mobileGrids.length; m++) {
            mobileGrids[m].classList.add('active');
        }
        
    } else {
        // Desktop: tampilkan card grid, sembunyikan tabel
        var btnCard = document.getElementById('btnCardView');
        var btnCardK = document.getElementById('btnCardViewKorlap');
        if (btnCard) btnCard.classList.add('active');
        if (btnCardK) btnCardK.classList.add('active');
        
        var tables2 = document.querySelectorAll('.personel-table');
        for (var l = 0; l < tables2.length; l++) {
            tables2[l].classList.add('hidden');
        }
        
        var grids2 = document.querySelectorAll('.desktop-card-grid');
        for (var n = 0; n < grids2.length; n++) {
            grids2[n].classList.add('active');
        }
        
        // ✅ MOBILE: Tetap tampilkan mobile grid
        var mobileGrids2 = document.querySelectorAll('.mobile-grid-view');
        for (var o = 0; o < mobileGrids2.length; o++) {
            mobileGrids2[o].classList.add('active');
        }
    }

    renderPegawai();
    renderKorlap();
}

// ============ RENDERING PERSONEL ============
function renderPegawai() {
    var q = (document.getElementById('pegawaiSearch') ? document.getElementById('pegawaiSearch').value : '').toLowerCase();
    var filtered = (masterData.pegawai || []).filter(function(p) {
        return (p.nama || p.Nama || "").toLowerCase().includes(q) ||
            (p.id || p.ID || "").toString().toLowerCase().includes(q) ||
            (p.wilayah || p.Wilayah || "").toLowerCase().includes(q);
    });
    renderPersonelList(filtered, 'pegawaiBody', 'pegawaiGrid', 'pegawaiMobileGrid', 'pegawai');
}

function renderKorlap() {
    var q = (document.getElementById('korlapSearch') ? document.getElementById('korlapSearch').value : '').toLowerCase();
    var filtered = (masterData.korlap || []).filter(function(p) {
        return (p.nama || p.Nama || "").toLowerCase().includes(q) ||
            (p.wilayah || p.Wilayah || "").toLowerCase().includes(q);
    });
    renderPersonelList(filtered, 'korlapBody', 'korlapGrid', 'korlapMobileGrid', 'korlap');
}

function renderPersonelList(list, tableId, gridId, mobileGridId, type) {
    var tE = document.getElementById(tableId);
    var gE = document.getElementById(gridId);
    var mE = document.getElementById(mobileGridId);

    // ✅ AMBIL WATERMARK DARI CONFIG
    var brand = getBrandConfig();
    var watermark = brand.watermark;

    if (!list || list.length === 0) {
        var emptyMsg = '<tr><td colspan="9" style="text-align:center;padding:30px;opacity:.6">Tidak ada data.</td></tr>';
        if (tE) tE.innerHTML = emptyMsg;
        if (gE) gE.innerHTML = '<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:40px 20px;opacity:.5"><i data-lucide="users" size="40"></i><p>Belum ada data</p></div>';
        if (mE) mE.innerHTML = '<div class="empty-state"><i data-lucide="users" size="40"></i><p>Belum ada data</p></div>';
        lucide.createIcons();
        return;
    }

    // ============================================================
    // ✅ RENDER MOBILE GRID - WATERMARK + WILAYAH (VERTIKAL)
    // ============================================================
    if (mE) {
        var mobileHTML = '';
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var id = sanitizeHTML(p.id || p.ID);
            var foto = getSmartUrl(p.urlFoto || p.link_foto_profile || p.Link_Foto_Profile || '');
            var nama = sanitizeHTML(p.nama || p.Nama || '-');
            var jab = sanitizeHTML(p.jabatan || p.Jabatan || '-');
            var wilayah = sanitizeHTML(p.wilayah || p.Wilayah || '-');
            var st = p.status || p.Status || 'Aktif';
            var sc = st === 'Aktif' ? 'aktif' : 'nonaktif';
            var si = st === 'Aktif' ? 'check-circle' : 'x-circle';
            
            mobileHTML += '<div class="premium-card-container" onclick="showDetail(\'' + type + '\',\'' + id + '\')">' +
                '<img class="premium-card-bg" src="' + foto + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' +
                '<div class="premium-card-overlay"></div>' +
                // ✅ WATERMARK + WILAYAH (VERTIKAL)
                '<div class="premium-card-watermark">' +
                    '<div class="watermark-main">' + watermark + '</div>' +
                    '<div class="watermark-sub">' + wilayah + '</div>' +
                '</div>' +
                '<div class="premium-card-info">' +
                '<div class="premium-card-name">' + nama + '</div>' +
                '<div class="premium-card-job">' + jab + '</div>' +
                '<span class="premium-card-status ' + sc + '"><i data-lucide="' + si + '" size="10"></i> ' + sanitizeHTML(st) + '</span>' +
                '</div>' +
                '</div>';
        }
        mE.innerHTML = mobileHTML;
    }

    // ============================================================
    // ✅ RENDER DESKTOP TABLE
    // ============================================================
    if (currentView === 'list') {
        if (tE) {
            var html = '';
            for (var i = 0; i < list.length; i++) {
                var p = list[i];
                var id = sanitizeHTML(p.id || p.ID);
                var qr = p.urlQR || p.link_qr || getQRUrl(p.nama || p.Nama, p.nohp || p.NoHP || 'NOHP');
                var foto = getSmartUrl(p.urlFoto || p.link_foto_profile || p.Link_Foto_Profile || '');
                var nama = sanitizeHTML(p.nama || p.Nama);
                var jab = sanitizeHTML(p.jabatan || p.Jabatan);
                var wil = sanitizeHTML(p.wilayah || p.Wilayah);
                var st = p.status || p.Status || 'Aktif';
                var sc = st === 'Aktif' ? 'badge-aktif' : 'badge-nonaktif';
                var si = st === 'Aktif' ? 'check-circle' : 'x-circle';
                var gc = 0;
                try {
                    var r = p.Koordinat_Tugas || p.koordinat_tugas;
                    if (r) { var j = JSON.parse(r); if (Array.isArray(j)) gc = j.length; }
                } catch (e) {}
                html += '<tr>' +
                    '<td>' + id + '</td>' +
                    '<td><img src="' + getSmartUrl(qr) + '" class="qr-thumb-sm" onclick="window.open(\'' + qr + '\')"></td>' +
                    '<td><div class="foto-pegawai-sm"><img src="' + foto + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"></div></td>' +
                    '<td style="font-weight:800;text-transform:uppercase">' + nama + '</td>' +
                    '<td>' + jab + '</td>' +
                    '<td>' + wil + '</td>' +
                    '<td style="text-align:center">' + (gc > 0 ? '<span class="geo-indicator"><i data-lucide="map-pin" size="12"></i> ' + gc + '</span>' : '-') + '</td>' +
                    '<td><span class="badge-status ' + sc + '"><i data-lucide="' + si + '" size="12"></i> ' + sanitizeHTML(st) + '</span></td>' +
                    '<td><div class="action-cell">' +
                    '<button class="action-icon detail" onclick="showDetail(\'' + type + '\',\'' + id + '\')"><i data-lucide="eye" size="14"></i></button>' +
                    '<button class="action-icon" onclick="editP(\'' + type + '\',\'' + id + '\')"><i data-lucide="edit-3" size="14"></i></button>' +
                    '<button class="action-icon delete" onclick="deleteP(\'' + type + '\',\'' + id + '\')"><i data-lucide="trash-2" size="14"></i></button>' +
                    '</div></td>' +
                    '</tr>';
            }
            tE.innerHTML = html;
        }
    } 
    // ============================================================
    // ✅ RENDER DESKTOP CARD GRID - WATERMARK + WILAYAH (VERTIKAL)
    // ============================================================
    else {
        if (gE) {
            var cardHTML = '';
            for (var i = 0; i < list.length; i++) {
                var p = list[i];
                var id = sanitizeHTML(p.id || p.ID);
                var foto = getSmartUrl(p.urlFoto || p.link_foto_profile || p.Link_Foto_Profile || '');
                var nama = sanitizeHTML(p.nama || p.Nama || '-');
                var jab = sanitizeHTML(p.jabatan || p.Jabatan || '-');
                var wilayah = sanitizeHTML(p.wilayah || p.Wilayah || '-');
                var st = p.status || p.Status || 'Aktif';
                var sc = st === 'Aktif' ? 'aktif' : 'nonaktif';
                var si = st === 'Aktif' ? 'check-circle' : 'x-circle';
                var qr = p.urlQR || p.link_qr || getQRUrl(p.nama || p.Nama, p.nohp || p.NoHP || 'NOHP');
                cardHTML += '<div class="premium-card-container" onclick="showDetail(\'' + type + '\',\'' + id + '\')">' +
                    '<div class="premium-card-actions">' +
                    '<button onclick="event.stopPropagation();editP(\'' + type + '\',\'' + id + '\')"><i data-lucide="edit-3" size="12"></i></button>' +
                    '<button class="delete" onclick="event.stopPropagation();deleteP(\'' + type + '\',\'' + id + '\')"><i data-lucide="trash-2" size="12"></i></button>' +
                    '</div>' +
                    '<div class="premium-card-qr" onclick="event.stopPropagation();window.open(\'' + getSmartUrl(qr) + '\')"><img src="' + getSmartUrl(qr) + '" style="width:100%;height:100%;object-fit:contain"></div>' +
                    '<img class="premium-card-bg" src="' + foto + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' +
                    '<div class="premium-card-overlay"></div>' +
                    // ✅ WATERMARK + WILAYAH (VERTIKAL)
                    '<div class="premium-card-watermark">' +
                        '<div class="watermark-main">' + watermark + '</div>' +
                        '<div class="watermark-sub">' + wilayah + '</div>' +
                    '</div>' +
                    '<div class="premium-card-info">' +
                    '<div class="premium-card-name">' + nama + '</div>' +
                    '<div class="premium-card-job">' + jab + '</div>' +
                    '<span class="premium-card-status ' + sc + '"><i data-lucide="' + si + '" size="10"></i> ' + sanitizeHTML(st) + '</span>' +
                    '</div>' +
                    '</div>';
            }
            gE.innerHTML = cardHTML;
        }
    }
    
    lucide.createIcons();
}

// ============ SHOW DETAIL ============
function showDetail(type, id) {
    currentDetailType = type;
    currentDetailId = id;
    var list = type === 'pegawai' ? masterData.pegawai : masterData.korlap;
    var p = null;
    for (var i = 0; i < list.length; i++) {
        if (String(list[i].id || list[i].ID) === String(id)) { p = list[i]; break; }
    }
    if (!p) return;
    var foto = getSmartUrl(p.urlFoto || p.link_foto_profile || p.Link_Foto_Profile || '');
    var st = p.status || p.Status || 'Aktif';
    var sc = st === 'Aktif' ? 'badge-aktif' : 'badge-nonaktif';
    var si = st === 'Aktif' ? 'check-circle' : 'x-circle';
    var detailImg = document.getElementById('detailImg');
    if (detailImg) {
        detailImg.src = foto;
        detailImg.onerror = function() { this.src = FALLBACK_IMAGE; };
    }

    function setText(id, val) {
        var el = document.getElementById(id);
        if (el) el.innerText = sanitizeHTML(val || '-');
    }
    setText('detailNama', p.nama || p.Nama);
    setText('detailJabatan', p.jabatan || p.Jabatan);
    setText('detailID', p.id || p.ID);
    setText('detailWilayah', p.wilayah || p.Wilayah);
    setText('detailHP', p.nohp || p.NoHP);
    setText('detailLokasi', p.lokasi_kerja || p.Lokasi_Kerja);
    var badgeEl = document.getElementById('detailStatusBadge');
    if (badgeEl) {
        badgeEl.innerHTML = '<span class="badge-status ' + sc + '"><i data-lucide="' + si + '" size="12"></i> ' + sanitizeHTML(st) + '</span>';
    }
    var pts = parseGeoData(p.Koordinat_Tugas || p.koordinat_tugas);
    var geoEl = document.getElementById('detailGeo');
    if (geoEl) {
        if (pts.length > 0) {
            var geoHtml = '';
            for (var j = 0; j < pts.length; j++) {
                geoHtml += '<div style="font-size:0.7rem;opacity:0.7;display:flex;align-items:center;gap:6px;padding:2px 0">' +
                    '<i data-lucide="map-pin" size="12" style="color:var(--sda-toska)"></i> ' +
                    sanitizeHTML(pts[j].nama) + ': ' + pts[j].lat + ', ' + pts[j].lng + ' (' + pts[j].radius + 'm)' +
                    '</div>';
            }
            geoEl.innerHTML = geoHtml;
        } else {
            geoEl.innerHTML = '<span style="opacity:.5">Tidak diatur</span>';
        }
    }
    var qrEl = document.getElementById('detailQR');
    if (qrEl) qrEl.src = getSmartUrl(getQRUrl(p.nama || p.Nama, p.nohp || p.NoHP || 'NOHP'));
    openModal('detailModal');
    lucide.createIcons();
}

function editFromDetail() { closeModal('detailModal');
    setTimeout(function() { editP(currentDetailType, currentDetailId); }, 300); }

function deleteFromDetail() {
    if (!confirm("Hapus data ini?")) return;
    closeModal('detailModal');
    setTimeout(function() { deleteP(currentDetailType, currentDetailId); }, 300);
}

// ============ LOGS ============
async function loadLogs() {
    setLoading(true, "Memuat Data Log...");
    var skeleton = '';
    for (var i = 0; i < 5; i++) {
        skeleton += '<tr><td class="skeleton-cell"><div class="skeleton-line"></div></td>'.repeat(8);
    }
    var logsBody = document.getElementById('logsBody');
    if (logsBody) logsBody.innerHTML = skeleton;
    var selectedDate = (document.getElementById('logDateFilter') ? document.getElementById('logDateFilter').value : '') || new Date().toISOString().split('T')[0];
    currentLogPage = 1;
    try {
        var d = await safeFetchJSON(API + '?action=getPresensiByDate&date=' + selectedDate, { redirect: 'follow', cache: 'no-cache' }, 15000);
        if (d.status === 'error') throw new Error(d.message);
        logsCache = d.data || [];
        renderLogsFiltered(true);
    } catch (e) {
        showToast("Gagal memuat Log: " + e.message, "error");
        if (logsBody) logsBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:50px">Gagal terhubung ke server.</td></tr>';
    } finally {
        setLoading(false);
    }
}

function renderLogsFiltered(resetPage) {
    resetPage = resetPage || false;
    if (resetPage) currentLogPage = 1;
    var fD = document.getElementById('logDateFilter') ? document.getElementById('logDateFilter').value : '';
    var q = (document.getElementById('logSearch') ? document.getElementById('logSearch').value : '').toLowerCase();
    var all = logsCache.filter(function(l) {
        var t = l.timestamp || l.Timestamp;
        return t ? getLocalDateStr(t) === fD : false;
    });
    var s = { h: 0, t: 0, i: 0, a: 0 };
    for (var i = 0; i < all.length; i++) {
        var st = (all[i].status || all[i].Status || '').toLowerCase().trim();
        if (!st) continue;
        if (st.includes('hadir') && !st.includes('terlambat')) s.h++;
        else if (st.includes('terlambat') || st.includes('qr')) s.t++;
        else if (st.includes('izin') || st.includes('sakit') || st.includes('dinas')) s.i++;
        else s.a++;
    }
    var sumHadir = document.getElementById('sumHadir');
    if (sumHadir) sumHadir.innerText = s.h;
    var sumTelat = document.getElementById('sumTelat');
    if (sumTelat) sumTelat.innerText = s.t;
    var sumIzin = document.getElementById('sumIzin');
    if (sumIzin) sumIzin.innerText = s.i;
    var sumAlpha = document.getElementById('sumAlpha');
    if (sumAlpha) sumAlpha.innerText = s.a;
    var filtered = all.filter(function(l) {
        return (l.nama || l.Nama || "").toLowerCase().includes(q);
    });
    var tbody = document.getElementById('logsBody');
    if (filtered.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;opacity:.3;padding:50px">Tidak Ada Aktivitas.<br><span style="font-size:0.8rem; margin-top:10px; display:inline-block;">Coba <a href="#" onclick="document.getElementById(\'logSearch\').value=\'\'; renderLogsFiltered(true);" style="color:var(--sda-toska)">reset pencarian</a>.</span></td></tr>';
        lucide.createIcons();
        return;
    }
    var endIndex = currentLogPage * APP_CONFIG.LOGS_PER_PAGE;
    var paginatedData = filtered.slice(0, endIndex);
    if (tbody) {
        var html = '';
        for (var j = 0; j < paginatedData.length; j++) {
            var l = paginatedData[j];
            var ts = l.timestamp || l.Timestamp;
            var id = l['ID Pegawai'] || l.id_pegawai || l.id || l.ID;
            var fs = l['Foto Selfie'] || l.foto_selfie || l.Foto_Selfie || '-';
            var fk = l['Foto Kerja'] || l['Foto Lokasi'] || l.foto_kerja || l.foto_lokasi || l.Foto_Kerja || '-';
            var n = parseInt(l.nilai || l.Nilai) || 0;
            var sc = n >= 50 ? 'score-high' : n >= 25 ? 'score-mid' : 'score-low';
            var nama = sanitizeHTML(l.nama || l.Nama);
            var status = sanitizeHTML(l.status || l.Status);
            var wil = sanitizeHTML(l.wilayah || l.Wilayah);
            html += '<tr>' +
                '<td>' + new Date(ts).toLocaleTimeString('id-ID') + '</td>' +
                '<td style="font-weight:800;text-transform:uppercase">' + nama + '</td>' +
                '<td>' + status + '</td>' +
                '<td style="text-align:center"><span class="score-badge ' + sc + '">' + n + '</span></td>' +
                '<td>' + wil + '</td>' +
                '<td style="text-align:center">' + (fs !== '-' ? '<button class="action-icon" onclick="window.open(\'' + fs + '\',\'_blank\')"><i data-lucide="user" size="14"></i></button>' : '-') + '</td>' +
                '<td style="text-align:center">' + (fk !== '-' ? '<button class="action-icon" onclick="window.open(\'' + fk + '\',\'_blank\')"><i data-lucide="briefcase" size="14"></i></button>' : '-') + '</td>' +
                '<td><div class="action-cell">' +
                '<button class="action-icon" style="color:var(--warning)" onclick="openLogModal(\'edit\',\'\',\'' + id + '\',\'' + ts + '\',\'' + status + '\',\'' + n + '\')"><i data-lucide="edit-2" size="14"></i></button>' +
                '<button class="action-icon delete" onclick="deleteLog(\'' + id + '\',\'' + ts + '\')"><i data-lucide="trash-2" size="14"></i></button>' +
                '</div></td>' +
                '</tr>';
        }
        tbody.innerHTML = html;
        if (endIndex < filtered.length) {
            tbody.innerHTML += '<tr><td colspan="8" style="text-align:center; padding: 20px;">' +
                '<button class="btn-premium" style="width: auto; margin: 0 auto; height: 40px; font-size: 0.8rem;" onclick="currentLogPage++; renderLogsFiltered(false);">' +
                '<i data-lucide="chevron-down" size="16"></i> Muat Lebih Banyak (' + (filtered.length - endIndex) + ' lagi)' +
                '</button>' +
                '</td></tr>';
        }
    }
    lucide.createIcons();
}

function exportLogsToCSV() {
    var fD = document.getElementById('logDateFilter') ? document.getElementById('logDateFilter').value : '';
    var data = logsCache.filter(function(l) {
        var t = l.timestamp || l.Timestamp;
        return t ? getLocalDateStr(t) === fD : false;
    });
    if (data.length === 0) { showToast("Tidak ada data untuk diekspor", "warning"); return; }
    var csv = "Waktu,Nama,Status,Skor,Wilayah,Keterangan\n";
    for (var i = 0; i < data.length; i++) {
        var l = data[i];
        var ts = new Date(l.timestamp || l.Timestamp).toLocaleString('id-ID');
        var nama = (l.nama || l.Nama || "-").replace(/,/g, ";");
        var status = (l.status || l.Status || "-").replace(/,/g, ";");
        var nilai = l.nilai || l.Nilai || 0;
        var wilayah = (l.wilayah || l.Wilayah || "-").replace(/,/g, ";");
        var ket = (l.keterangan || l.Keterangan || "-").replace(/,/g, ";");
        csv += ts + ',' + nama + ',' + status + ',' + nilai + ',' + wilayah + ',' + ket + '\n';
    }
    var blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Log_Presensi_" + fD + ".csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Data berhasil diunduh", "success");
}

// ============================================================
// TOOLS - RENDER
// ============================================================

function renderTools() {
    var q = (document.getElementById('toolSearch') ? document.getElementById('toolSearch').value : '').toLowerCase();
    var toolsData = Array.isArray(masterData.tools) ? masterData.tools : [];
    
    var filtered = toolsData.filter(function(t) {
        if (!t) return false;
        var n = String(t.Nama || t.nama || "").trim();
        return n !== "" && n.toLowerCase().includes(q);
    });

    // ============================================================
    // ✅ 1. RENDER TABLE (DESKTOP)
    // ============================================================
    var tbody = document.getElementById('toolsBody');
    if (tbody) {
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:50px 20px;">' +
                '<i data-lucide="layout-grid" size="40" style="opacity:0.3;margin-bottom:10px"></i>' +
                '<p style="font-weight:700;margin-bottom:5px">Belum ada layanan digital</p>' +
                '<p style="font-size:0.8rem;opacity:0.6;margin-bottom:20px">Silakan tambahkan layanan baru.</p>' +
                '<button class="btn-premium" style="width:auto;height:40px;font-size:0.8rem;margin:0 auto" onclick="openToolModal()">' +
                '<i data-lucide="plus" size="16"></i> TAMBAH LAYANAN' +
                '</button>' +
                '</td></tr>';
        } else {
            var html = '';
            for (var i = 0; i < filtered.length; i++) {
                var t = filtered[i];
                var nama = sanitizeHTML(t.Nama || t.nama || "-");
                var icon = sanitizeHTML(t.Icon || t.icon || "layers");
                var warna = sanitizeHTML(t.Warna || t.warna || "#3b82f6");
                var url = sanitizeHTML(t.Link_URL || t.link_url || t.URL || t.url || "-");
                var tp = sanitizeHTML(t.Type || t.type || "Folder");
                var safeNama = String(t.Nama || t.nama || "").replace(/'/g, "\\'");
                
                html += '<tr>' +
                    '<td><div style="width:40px;height:40px;background:' + warna + ';display:flex;align-items:center;justify-content:center;border-radius:12px;box-shadow:0 4px 12px ' + warna + '40"><i data-lucide="' + icon + '" size="20" color="white"></i></div></td>' +
                    '<td style="font-weight:700;font-size:0.9rem">' + nama + '</td>' +
                    '<td><span style="font-size:.65rem;font-weight:800;color:' + (tp === 'Direct' ? 'var(--success)' : 'var(--pu-blue)') + ';background:' + (tp === 'Direct' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)') + ';padding:4px 12px;border-radius:12px">' + tp.toUpperCase() + '</span></td>' +
                    '<td><div style="width:20px;height:20px;border-radius:50%;background:' + warna + ';box-shadow:0 0 12px ' + warna + '60;border:2px solid rgba(255,255,255,0.1)"></div></td>' +
                    '<td style="font-family:JetBrains Mono;font-size:.6rem;opacity:.5;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + url + '</td>' +
                    '<td><div class="action-cell">' +
                    '<button class="action-icon" onclick="editTool(\'' + safeNama + '\')" title="Edit"><i data-lucide="edit-3" size="14"></i></button>' +
                    '<button class="action-icon delete" onclick="deleteTool(\'' + safeNama + '\')" title="Hapus"><i data-lucide="trash-2" size="14"></i></button>' +
                    '</div></td>' +
                    '<td>' + (url && url !== '-' && url !== '' ? '<button class="action-icon" onclick="window.open(\'' + url + '\',\'_blank\')" style="background:rgba(45,212,191,0.1);color:var(--sda-toska)" title="Buka Link"><i data-lucide="external-link" size="14"></i></button>' : '<span style="opacity:0.2">-</span>') + '</td>' +
                    '</tr>';
            }
            tbody.innerHTML = html;
        }
    }

    // ============================================================
    // ✅ 2. RENDER CARD GRID (MOBILE)
    // ============================================================
    var grid = document.getElementById('toolsGrid');
    if (grid) {
        if (!filtered.length) {
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px 20px"><i data-lucide="layout-grid" size="40" style="opacity:0.3"></i><p style="margin-top:10px;opacity:0.5">Belum ada layanan</p></div>';
        } else {
            var cardHtml = '';
            for (var i = 0; i < filtered.length; i++) {
                var t = filtered[i];
                var nama = sanitizeHTML(t.Nama || t.nama || "-");
                var icon = sanitizeHTML(t.Icon || t.icon || "layers");
                var warna = sanitizeHTML(t.Warna || t.warna || "#3b82f6");
                var url = sanitizeHTML(t.Link_URL || t.link_url || t.URL || t.url || "-");
                var tp = sanitizeHTML(t.Type || t.type || "Folder");
                var safeNama = String(t.Nama || t.nama || "").replace(/'/g, "\\'");
                
                cardHtml += '<div class="tools-card" onclick="window.open(\'' + url + '\',\'_blank\')">' +
                    '<div class="tools-card-icon" style="background:' + warna + '20;border:2px solid ' + warna + '40">' +
                    '<i data-lucide="' + icon + '" size="24" style="color:' + warna + '"></i>' +
                    '</div>' +
                    '<div class="tools-card-name">' + nama + '</div>' +
                    '<div class="tools-card-type" style="color:' + (tp === 'Direct' ? 'var(--success)' : 'var(--pu-blue)') + '">' + tp.toUpperCase() + '</div>' +
                    '<div class="tools-card-actions">' +
                    '<button onclick="event.stopPropagation();editTool(\'' + safeNama + '\')"><i data-lucide="edit-3" size="14"></i></button>' +
                    '<button class="delete" onclick="event.stopPropagation();deleteTool(\'' + safeNama + '\')"><i data-lucide="trash-2" size="14"></i></button>' +
                    '</div>' +
                    '</div>';
            }
            grid.innerHTML = cardHtml;
        }
    }

    lucide.createIcons();
}

// ============================================================
// TOOLS - MODAL CRUD
// ============================================================

function updateToolPreview() {
    var n = (document.getElementById('t-nama') ? document.getElementById('t-nama').value : '') || 'Nama';
    var i = (document.getElementById('t-ikon') ? document.getElementById('t-ikon').value : '') || 'layers';
    var c = document.getElementById('t-warna') ? document.getElementById('t-warna').value : '#3b82f6';
    
    var previewName = document.getElementById('previewName');
    if (previewName) previewName.innerText = n;
    
    var previewIconBox = document.getElementById('previewIconBox');
    if (previewIconBox) {
        previewIconBox.style.background = c;
        previewIconBox.style.boxShadow = '0 5px 15px ' + c + '40';
        previewIconBox.innerHTML = '<i data-lucide="' + i + '" size="22" color="white"></i>';
    }
    lucide.createIcons();
}

function openToolModal() {
    ['t-old-name', 't-nama', 't-url', 't-desc'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var ikon = document.getElementById('t-ikon');
    if (ikon) ikon.value = 'layers';
    var warna = document.getElementById('t-warna');
    if (warna) warna.value = '#3b82f6';
    var type = document.getElementById('t-type');
    if (type) type.value = 'Folder';
    openModal('toolModal');
    updateToolPreview();
}

function editTool(name) {
    var t = null;
    var tools = masterData.tools || [];
    for (var i = 0; i < tools.length; i++) {
        if (String(tools[i].Nama || tools[i].nama) === String(name)) {
            t = tools[i];
            break;
        }
    }
    if (!t) return;

    function setVal(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val || '';
    }
    setVal('t-old-name', name);
    setVal('t-nama', t.Nama || t.nama || '');
    setVal('t-ikon', t.Icon || t.icon || 'layers');
    setVal('t-warna', t.Warna || t.warna || '#3b82f6');
    setVal('t-type', t.Type || t.type || 'Folder');
    setVal('t-url', t.Link_URL || t.link_url || t.URL || t.url || '');
    setVal('t-desc', t.Deskripsi || t.deskripsi || t.desc || '');
    openModal('toolModal');
    updateToolPreview();
}

async function saveTool() {
    var nama = document.getElementById('t-nama') ? document.getElementById('t-nama').value.trim() : '';
    if (!nama) {
        showToast("Nama layanan wajib diisi!", "warning");
        return;
    }

    var p = {
        token: token,
        action: 'saveTool',
        oldName: document.getElementById('t-old-name') ? document.getElementById('t-old-name').value : '',
        nama: nama,
        icon: document.getElementById('t-ikon') ? document.getElementById('t-ikon').value : 'layers',
        warna: document.getElementById('t-warna') ? document.getElementById('t-warna').value : '#3b82f6',
        url: document.getElementById('t-url') ? document.getElementById('t-url').value : '',
        desc: document.getElementById('t-desc') ? document.getElementById('t-desc').value : ''
    };

    setLoading(true, "Menyimpan Layanan...");
    try {
        var result = await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(p)
        }, 15000);
        
        if (result.status === 'success') {
            closeModal('toolModal');
            await loadDashboard(true);
            showToast("✅ Layanan berhasil disimpan!", "success");
        } else {
            throw new Error(result.message || "Gagal menyimpan layanan");
        }
    } catch (e) {
        showToast("❌ Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

async function deleteTool(name) {
    if (!confirm("Hapus layanan \"" + name + "\"?")) return;
    setLoading(true, "Menghapus Layanan...");
    try {
        var result = await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'deleteTool', token: token, name: name })
        }, 15000);
        
        if (result.status === 'success') {
            await loadDashboard(true);
            showToast("🗑️ Layanan dihapus", "success");
        } else {
            throw new Error(result.message || "Gagal menghapus layanan");
        }
    } catch (e) {
        showToast("❌ Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

// ============================================================
// RENDER CONFIG - VERSI OPTIMAL
// ============================================================
function renderConfig() {
    var q = (document.getElementById('configSearch') ? document.getElementById('configSearch').value : '').toLowerCase();
    var configData = masterData.config || {};
    var keys = Object.keys(configData);
    
    // Filter by search
    var filteredKeys = keys.filter(function(k) {
        return k.toLowerCase().includes(q) || 
               String(configData[k]).toLowerCase().includes(q);
    });
    
    var container = document.getElementById('configContainer');
    if (!container) return;

    if (!filteredKeys.length) {
        container.innerHTML = '<div class="config-empty"><i data-lucide="settings" size="48"></i><h3>Tidak Ditemukan</h3><p>Pengaturan dengan kata kunci "' + sanitizeHTML(q) + '" tidak ditemukan.</p></div>';
        lucide.createIcons();
        return;
    }

    // ============================================================
    // KATEGORI
    // ============================================================
    var categories = {
        '🎨 Branding': {
            keys: ['Logo', 'APP_LOGO', 'NAMA_INSTANSI', 'Instansi', 
                   'WATERMARK', 'BRAND_SINGKATAN', 'BRAND_PART1', 'BRAND_PART2', 'BRAND_SUB'],
            icon: 'palette'
        },
        '📱 Teks & Tampilan': {
            keys: ['Teks_Sambutan', 'TeksDeskripsi', 'Teks_Tombol_Mulai', 'URL_Background'],
            icon: 'text'
        },
        '⏰ Jam Presensi': {
            keys: ['Jam_Hadir', 'Jam_Terlambat_Ringan', 'Jam_Pulang'],
            icon: 'clock'
        },
        '⚡ QR Time Limits': {
            keys: ['QR_Batas_Pagi', 'QR_Mulai_Sore'],
            icon: 'qr-code'
        },
        '📊 Nilai Presensi': {
            keys: ['Nilai_Hadir', 'Nilai_Terlambat_Ringan', 'Nilai_Terlambat_Berat', 
                   'Nilai_Pulang', 'Nilai_QR_Hadir', 'Nilai_QR_Pulang', 
                   'Nilai_Izin', 'Nilai_Sakit', 'Nilai_Dinas'],
            icon: 'award'
        },
        '🔗 Link & Folder': {
            keys: ['PlayStore_URL', 'FOLDER_ID_PRESENSI', 'FOLDER_ID_AGENDA', 
                   'FOLDER_ID_PROFILE', 'FOLDER_E_QRCODE'],
            icon: 'link'
        },
        '📅 Hari Kerja': {
            keys: ['hari_kerja'],
            icon: 'calendar'
        },
        '🔐 Keamanan': {
            keys: ['AdminPassword'],
            icon: 'shield'
        },
        'ℹ️ Info': {
            keys: ['Versi_App'],
            icon: 'info'
        }
    };

    var html = '';
    var catCount = 0;

    for (var catName in categories) {
        if (!categories.hasOwnProperty(catName)) continue;
        var cat = categories[catName];
        
        // Filter keys berdasarkan search
        var catKeys = cat.keys.filter(function(k) {
            return filteredKeys.includes(k);
        });
        
        if (!catKeys.length) continue;
        catCount++;

        // Buat card kategori
        html += '<div class="config-category" data-category="' + catName.replace(/[^a-zA-Z0-9]/g, '') + '">';
        html += '<div class="config-category-header" onclick="toggleConfigCategory(this)">';
        html += '<div class="cat-title">';
        html += '<i data-lucide="' + cat.icon + '" size="18"></i>';
        html += '<span>' + catName + '</span>';
        html += '<span class="cat-count">' + catKeys.length + '</span>';
        html += '</div>';
        html += '<i data-lucide="chevron-down" size="16" class="cat-toggle"></i>';
        html += '</div>';
        html += '<div class="config-category-body">';

        // Render setiap key dalam kategori
        for (var i = 0; i < catKeys.length; i++) {
            var k = catKeys[i];
            var v = configData[k];
            html += renderConfigItem(k, v);
        }

        html += '</div></div>';
    }

    if (catCount === 0) {
        html = '<div class="config-empty"><i data-lucide="search" size="48"></i><h3>Tidak Ditemukan</h3><p>Pengaturan dengan kata kunci "' + sanitizeHTML(q) + '" tidak ditemukan.</p></div>';
    }

    container.innerHTML = html;
    renderSystemHealth();
    lucide.createIcons();
}

// ============================================================
// RENDER CONFIG ITEM
// ============================================================
function renderConfigItem(key, value) {
    var html = '';
    var inputType = 'text';
    var inputExtra = '';
    var labelExtra = '';
    var hint = '';
    
    var keyLower = key.toLowerCase();
    // ============================================================
    // DETEKSI TIPE INPUT
    // ============================================================
    if (keyLower === 'adminpassword') {
        inputType = 'password';
        labelExtra = ' <span class="key-badge">🔒</span>';
    }
    else if (keyLower.includes('color') || keyLower.includes('warna')) {
        inputType = 'color';
    }
    // --- FIXED TIME INPUT HANDLING ---
    else if (keyLower.includes('jam') || keyLower.includes('batas') || keyLower.includes('mulai')) {
        inputType = 'time';
        // Check if the value is a valid time format (HH:mm)
        // If not, set it to an empty string to avoid the "specified value does not conform" error
        if (typeof value === 'string' && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
            console.warn(`⚠️ Invalid time value "${value}" for key "${key}". Setting to empty.`);
            value = ''; // Or set a default like "08:00"
        }
    }
    // --- END FIX ---
    else if (keyLower.includes('nilai')) {
        inputType = 'number';
        inputExtra = ' step="1" min="0" max="100"';
    }
    else if (keyLower.includes('sambutan') || keyLower.includes('deskripsi')) {
        inputType = 'textarea';
    }
    else if (keyLower.includes('url') || keyLower.includes('link') || keyLower.includes('folder')) {
        inputType = 'url';
        hint = ' <span style="font-size:0.5rem;color:rgba(255,255,255,0.2)">🔗 URL atau ID</span>';
    }
    else if (keyLower === 'logo' || keyLower === 'app_logo') {
        inputType = 'imageurl';
    }
    else if (keyLower === 'hari_kerja') {
        inputType = 'text';
        hint = ' <span style="font-size:0.5rem;color:rgba(255,255,255,0.2)">📅 1=Senin, 2=Selasa, ... 7=Minggu</span>';
    }
    else if (keyLower === 'versi_app') {
        inputType = 'readonly';
    }

    // ============================================================
    // BUILD HTML
    // ============================================================
    var safeKey = sanitizeHTML(key);
    var safeValue = sanitizeHTML(String(value || ''));

    html += '<div class="config-item">';
    html += '<label for="c-' + safeKey + '">';
    html += '<i data-lucide="settings-2" size="12" style="opacity:0.3"></i> ' + safeKey.replace(/_/g, ' ') + labelExtra;
    html += '</label>';

    if (inputType === 'textarea') {
        html += '<textarea id="c-' + safeKey + '" rows="2">' + safeValue + '</textarea>';
    } 
    else if (inputType === 'password') {
        html += '<div class="password-wrap">';
        html += '<input type="password" id="c-' + safeKey + '" value="' + safeValue + '" autocomplete="new-password">';
        html += '<button class="password-toggle" onclick="toggleConfigPassword(\'c-' + safeKey + '\', this)" type="button">';
        html += '<i data-lucide="eye" size="14"></i>';
        html += '</button>';
        html += '</div>';
    }
    else if (inputType === 'readonly') {
        html += '<input type="text" id="c-' + safeKey + '" value="' + safeValue + '" readonly style="opacity:0.6;cursor:default">';
    }
    else if (inputType === 'imageurl') {
        html += '<input type="text" id="c-' + safeKey + '" value="' + safeValue + '" placeholder="URL gambar">';
        if (safeValue && safeValue !== '' && safeValue !== '-' && safeValue.startsWith('http')) {
            html += '<div class="image-preview"><img src="' + safeValue + '" onerror="this.style.display=\'none\'" alt="Preview"></div>';
        }
    }
    else if (inputType === 'url') {
        html += '<input type="text" id="c-' + safeKey + '" value="' + safeValue + '" placeholder="https://...">';
        if (safeValue && safeValue !== '' && safeValue !== '-' && safeValue.startsWith('http')) {
            html += '<div class="url-actions">';
            html += '<button onclick="window.open(\'' + safeValue + '\',\'_blank\')"><i data-lucide="external-link" size="12"></i> Buka</button>';
            html += '</div>';
        }
    }
    else if (inputType === 'color') {
        html += '<input type="color" id="c-' + safeKey + '" value="' + (safeValue || '#3b82f6') + '" style="height:44px;padding:4px">';
    }
    else {
        // The value here is already sanitized and, for 'time' inputs, validated.
        html += '<input type="' + inputType + '" id="c-' + safeKey + '" value="' + safeValue + '"' + inputExtra + '>';
    }

    html += hint;
    html += '</div>';

    return html;
}

// ============================================================
// TOGGLE CONFIG CATEGORY
// ============================================================
function toggleConfigCategory(header) {
    var body = header.nextElementSibling;
    var toggle = header.querySelector('.cat-toggle');
    if (body) {
        body.classList.toggle('collapsed');
        if (toggle) {
            toggle.classList.toggle('collapsed');
        }
    }
}

// ============================================================
// TOGGLE CONFIG PASSWORD
// ============================================================
function toggleConfigPassword(inputId, btn) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
        input.type = 'password';
        if (icon) icon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons({ node: btn });
}

// ============================================================
// SAVE CONFIG
// ============================================================
async function saveConfig() {
    var c = {};
    var keys = Object.keys(masterData.config || {});
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var el = document.getElementById('c-' + k);
        if (el) c[k] = el.value;
    }
    
    setLoading(true, "Menyimpan Pengaturan...");
    try {
        await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'updateConfig', token: token, config: c })
        }, 15000);
        await loadDashboard(true);
        showToast("✅ Semua pengaturan berhasil disimpan!", "success");
    } catch (e) {
        showToast("❌ Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

function renderSystemHealth() {
    var box = document.getElementById('sysHealthBox');
    if (!box) {
        var container = document.getElementById('configContainer');
        if (!container) return;
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-bottom:20px;border:1px solid var(--glass-border);border-radius:16px;padding:18px;background:rgba(0,0,0,.2)';
        wrapper.innerHTML = '<h3 style="font-size:.9rem;font-weight:800;margin-bottom:12px;display:flex;align-items:center;gap:8px">' +
            '<i data-lucide="activity" size="16" style="color:var(--sda-toska)"></i> SYSTEM HEALTH (Perangkat Ini)' +
            '</h3><div id="sysHealthBox"><p style="opacity:.6">Memuat...</p></div>';
        container.parentNode.insertBefore(wrapper, container);
        box = document.getElementById('sysHealthBox');
        lucide.createIcons();
    }
    var log = JSON.parse(localStorage.getItem('pusda_perf_log') || '[]');
    if (!log.length) {
        box.innerHTML = '<p style="opacity:.6">Belum ada data performa. Data terisi setelah melakukan absen dari presensi.html.</p>';
        return;
    }
    var times = log.map(function(x) { return x.ms; });
    var avg = times.reduce(function(a, b) { return a + b; }, 0) / times.length;
    var max = Math.max.apply(null, times);
    var min = Math.min.apply(null, times);
    var emoji, label, color;
    if (avg < 5000) { emoji = '🟢';
        label = 'BAIK';
        color = '#10b981'; } else if (avg < 10000) { emoji = '🟡';
        label = 'SEDANG';
        color = '#f59e0b'; } else { emoji = '🔴';
        label = 'LAMBAT';
        color = '#ef4444'; }
    box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;text-align:center">' +
        '<div><div style="font-size:1.3rem;font-weight:800;color:' + color + '">' + (avg / 1000).toFixed(1) + 's</div><div style="font-size:.65rem;opacity:.6">RATA-RATA</div></div>' +
        '<div><div style="font-size:1.3rem;font-weight:800">' + (min / 1000).toFixed(1) + 's</div><div style="font-size:.65rem;opacity:.6">TERCEPAT</div></div>' +
        '<div><div style="font-size:1.3rem;font-weight:800">' + (max / 1000).toFixed(1) + 's</div><div style="font-size:.65rem;opacity:.6">TERLAMBAT</div></div>' +
        '<div><div style="font-size:1.3rem;font-weight:800;color:' + color + '">' + emoji + ' ' + label + '</div><div style="font-size:.65rem;opacity:.6">STATUS</div></div>' +
        '</div>' +
        '<p style="font-size:.65rem;opacity:.5;margin-top:10px">' + log.length + ' sample • Untuk monitoring global 500 user, lihat GAS Executions dashboard.</p>';
}

// ============ GEO-FENCING ============
function renderGeoList() {
    var c = document.getElementById('geo-list');
    if (!c) return;
    if (!currentGeoFences.length) {
        c.innerHTML = '<p style="font-size:.7rem;opacity:.5;text-align:center;padding:10px">Belum ada lokasi</p>';
        return;
    }
    var html = '';
    for (var i = 0; i < currentGeoFences.length; i++) {
        var p = currentGeoFences[i];
        html += '<div class="geo-item">' +
            '<div class="geo-item-info">' +
            '<div class="geo-item-name">' + sanitizeHTML(p.nama || 'Lokasi ' + (i + 1)) + '</div>' +
            '<div class="geo-item-coords">Lat: ' + p.lat + ', Lng: ' + p.lng + ' | ' + p.radius + 'm</div>' +
            '</div>' +
            '<button class="btn-remove-geo" onclick="removeGeoPoint(' + i + ')"><i data-lucide="trash-2" size="14"></i></button>' +
            '</div>';
    }
    c.innerHTML = html;
    lucide.createIcons();
}

function addGeoPoint() {
    if (!Array.isArray(currentGeoFences)) currentGeoFences = [];
    var n = (document.getElementById('geo-nama') ? document.getElementById('geo-nama').value.trim() : '') || 'Lokasi ' + (currentGeoFences.length + 1);
    var la = parseFloat(document.getElementById('geo-lat') ? document.getElementById('geo-lat').value : '');
    var lo = parseFloat(document.getElementById('geo-lng') ? document.getElementById('geo-lng').value : '');
    var r = parseInt(document.getElementById('geo-radius') ? document.getElementById('geo-radius').value : '') || 100;
    if (isNaN(la) || isNaN(lo)) return showToast("Latitude dan Longitude harus angka!", "error");
    if (la < -90 || la > 90) return showToast("Latitude tidak valid!", "error");
    if (lo < -180 || lo > 180) return showToast("Longitude tidak valid!", "error");
    currentGeoFences.push({ nama: n, lat: la, lng: lo, radius: r });
    renderGeoList();
    ['geo-nama', 'geo-lat', 'geo-lng', 'geo-radius'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    showToast("Lokasi geo-fencing ditambahkan", "success");
}

function removeGeoPoint(i) {
    currentGeoFences.splice(i, 1);
    renderGeoList();
}

function fillCurrentLocation() {
    if (!navigator.geolocation) return showToast("GPS tidak didukung", "error");
    setLoading(true, "Mendeteksi GPS...");
    navigator.geolocation.getCurrentPosition(function(p) {
        var lat = document.getElementById('geo-lat');
        var lng = document.getElementById('geo-lng');
        var radius = document.getElementById('geo-radius');
        var nama = document.getElementById('geo-nama');
        if (lat) lat.value = p.coords.latitude.toFixed(6);
        if (lng) lng.value = p.coords.longitude.toFixed(6);
        if (radius && !radius.value) radius.value = 100;
        if (nama && !nama.value) nama.value = "Lokasi Saat Ini";
        setLoading(false);
    }, function(e) {
        setLoading(false);
        showToast("Gagal: " + e.message, "error");
    }, { enableHighAccuracy: true, timeout: 10000 });
}

// ============ PERSONEL CRUD ============
function openPModal(type) {
    var pMode = document.getElementById('p-mode');
    if (pMode) pMode.value = type;
    var pOldId = document.getElementById('p-old-id');
    if (pOldId) pOldId.value = '';
    ['p-id', 'p-nama', 'p-jabatan', 'p-wilayah', 'p-nohp', 'p-lokasi'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    currentGeoFences = [];
    renderGeoList();
    var titleEl = document.getElementById('pModalTitle');
    if (titleEl) titleEl.innerText = type === 'pegawai' ? "Data Pegawai" : "Data Koordinator";
    var qrContainer = document.getElementById('qr-display-container');
    if (qrContainer) qrContainer.style.display = 'none';
    var previewImg = document.getElementById('p-preview-img');
    if (previewImg) previewImg.style.display = 'none';
    var placeholder = document.getElementById('p-placeholder');
    if (placeholder) placeholder.style.display = 'flex';
    openModal('pModal');
}

function editP(type, id) {
    var list = type === 'pegawai' ? masterData.pegawai : masterData.korlap;
    var p = null;
    for (var i = 0; i < list.length; i++) {
        if (String(list[i].id || list[i].ID) === String(id)) { p = list[i]; break; }
    }
    if (!p) return;

    function setVal(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val || '';
    }
    setVal('p-mode', type);
    setVal('p-old-id', id);
    setVal('p-id', id);
    setVal('p-nama', p.nama || p.Nama);
    setVal('p-jabatan', p.jabatan || p.Jabatan);
    setVal('p-wilayah', p.wilayah || p.Wilayah);
    setVal('p-nohp', p.nohp || p.NoHP || "");
    setVal('p-lokasi', p.lokasi_kerja || p.Lokasi_Kerja || "");
    setVal('p-status', p.status || p.Status || 'Aktif');
    currentGeoFences = parseGeoData(p.Koordinat_Tugas || p.koordinat_tugas);
    renderGeoList();
    var img = p.urlFoto || p.link_foto_profile || p.Link_Foto_Profile;
    if (img) {
        var previewImg = document.getElementById('p-preview-img');
        if (previewImg) { previewImg.src = getSmartUrl(img);
            previewImg.style.display = 'block'; }
        var placeholder = document.getElementById('p-placeholder');
        if (placeholder) placeholder.style.display = 'none';
    }
    updateQRRealtime();
    openModal('pModal');
}

async function savePAction() {
    var type = document.getElementById('p-mode') ? document.getElementById('p-mode').value : '';
    var id = document.getElementById('p-id') ? document.getElementById('p-id').value : '';
    var nama = document.getElementById('p-nama') ? document.getElementById('p-nama').value : '';
    if (!id || !nama) return showToast("ID dan Nama Wajib!", "error");
    if (!Array.isArray(currentGeoFences)) currentGeoFences = [];
    var cLat = document.getElementById('geo-lat') ? document.getElementById('geo-lat').value.trim() : '';
    var cLng = document.getElementById('geo-lng') ? document.getElementById('geo-lng').value.trim() : '';
    if (cLat && cLng) addGeoPoint();
    var oldId = document.getElementById('p-old-id') ? document.getElementById('p-old-id').value : '';
    var payload = {
        token: token,
        action: oldId ? (type === 'pegawai' ? 'editPegawai' : 'editKorlap') : (type === 'pegawai' ? 'addPegawai' : 'addKorlap'),
        oldId: oldId,
        id: id,
        nama: nama,
        jabatan: document.getElementById('p-jabatan') ? document.getElementById('p-jabatan').value : '',
        wilayah: document.getElementById('p-wilayah') ? document.getElementById('p-wilayah').value : '',
        noHP: document.getElementById('p-nohp') ? document.getElementById('p-nohp').value : '',
        lokasiKerja: document.getElementById('p-lokasi') ? document.getElementById('p-lokasi').value : '',
        status: document.getElementById('p-status') ? document.getElementById('p-status').value : '',
        koordinatTugas: JSON.stringify(currentGeoFences),
        linkQR: getQRUrl(nama, document.getElementById('p-nohp') ? document.getElementById('p-nohp').value : ''),
        fotoProfile: base64Foto
    };
    setLoading(true, "Menyimpan...");
    try {
        var d = await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }, 20000);
        if (d.status === 'success') {
            closeModal('pModal');
            await loadDashboard(true);
            showToast("Data berhasil disimpan", "success");
        } else {
            throw new Error(d.message || "Terjadi kesalahan pada server");
        }
    } catch (e) {
        console.error("❌ Save Error:", e);
        showToast(e.message.includes('connect') ? "Koneksi internet terputus" : "Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

async function deleteP(type, id) {
    if (!confirm("Hapus数据 ini?")) return;
    setLoading(true, "Menghapus...");
    try {
        await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: type === 'pegawai' ? 'deletePegawai' : 'deleteKorlap', token: token, id: id })
        }, 15000);
        await loadDashboard(true);
        showToast("Data dihapus", "success");
    } catch (e) {
        showToast("Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

// ============ TOOLS CRUD ============
function updateToolPreview() {
    var n = (document.getElementById('t-nama') ? document.getElementById('t-nama').value : '') || 'Nama';
    var i = (document.getElementById('t-ikon') ? document.getElementById('t-ikon').value : '') || 'layers';
    var c = document.getElementById('t-warna') ? document.getElementById('t-warna').value : '';
    var previewName = document.getElementById('previewName');
    if (previewName) previewName.innerText = n;
    var previewIconBox = document.getElementById('previewIconBox');
    if (previewIconBox) {
        previewIconBox.style.background = c;
        previewIconBox.style.boxShadow = '0 5px 15px ' + c + '40';
        previewIconBox.innerHTML = '<i data-lucide="' + i + '" size="22" color="white"></i>';
    }
    lucide.createIcons();
}

function openToolModal() {
    ['t-old-name', 't-nama', 't-url', 't-desc'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var ikon = document.getElementById('t-ikon');
    if (ikon) ikon.value = 'layers';
    var warna = document.getElementById('t-warna');
    if (warna) warna.value = '#3b82f6';
    var type = document.getElementById('t-type');
    if (type) type.value = 'Folder';
    openModal('toolModal');
    updateToolPreview();
}

function editTool(name) {
    var t = null;
    var tools = masterData.tools || [];
    for (var i = 0; i < tools.length; i++) {
        if (String(tools[i].Nama || tools[i].nama) === String(name)) { t = tools[i]; break; }
    }
    if (!t) return;

    function setVal(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val || '';
    }
    setVal('t-old-name', name);
    setVal('t-nama', t.Nama || t.nama || '');
    setVal('t-ikon', t.Icon || t.icon || 'layers');
    setVal('t-warna', t.Warna || t.warna || '#3b82f6');
    setVal('t-type', t.Type || t.type || 'Folder');
    setVal('t-url', t.Link_URL || t.link_url || t.URL || t.url || '');
    setVal('t-desc', t.Deskripsi || t.deskripsi || t.desc || '');
    openModal('toolModal');
    updateToolPreview();
}

async function saveTool() {
    var p = {
        token: token,
        action: 'saveTool',
        oldName: document.getElementById('t-old-name') ? document.getElementById('t-old-name').value : '',
        nama: document.getElementById('t-nama') ? document.getElementById('t-nama').value : '',
        icon: document.getElementById('t-ikon') ? document.getElementById('t-ikon').value : '',
        warna: document.getElementById('t-warna') ? document.getElementById('t-warna').value : '',
        url: document.getElementById('t-url') ? document.getElementById('t-url').value : '',
        desc: document.getElementById('t-desc') ? document.getElementById('t-desc').value : ''
    };
    setLoading(true, "Menyimpan...");
    try {
        await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(p)
        }, 15000);
        closeModal('toolModal');
        await loadDashboard(true);
        showToast("Layanan disimpan", "success");
    } catch (e) {
        showToast("Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

async function deleteTool(name) {
    if (!confirm("Hapus layanan ini?")) return;
    setLoading(true, "Menghapus...");
    try {
        await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'deleteTool', token: token, name: name })
        }, 15000);
        await loadDashboard(true);
        showToast("Layanan dihapus", "success");
    } catch (e) {
        showToast("Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

// ============ LOGS CRUD ============
function openLogModal(mode, n, id, ts, st, ni) {
    logMode = mode;
    var d = document.getElementById('manualLogPegawai');
    if (d) {
        var allPeg = (masterData.pegawai || []).concat(masterData.korlap || []);
        var options = '';
        for (var i = 0; i < allPeg.length; i++) {
            var p = allPeg[i];
            options += '<option value="' + (p.id || p.ID) + '">' + sanitizeHTML(p.nama || p.Nama) + '</option>';
        }
        d.innerHTML = options;
    }
    if (mode === 'add') {
        var editTime = document.getElementById('editLogTime');
        if (editTime) {
            var now = new Date();
            var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
            editTime.value = local.toISOString().slice(0, 16);
        }
        var editStatus = document.getElementById('editLogStatus');
        if (editStatus) editStatus.value = 'Hadir';
        var editNilai = document.getElementById('editLogNilai');
        if (editNilai) editNilai.value = 50;
        var editIdPeg = document.getElementById('editLogIdPeg');
        if (editIdPeg) editIdPeg.value = '';
        var editOrigTs = document.getElementById('editLogOriginalTs');
        if (editOrigTs) editOrigTs.value = '';
    } else {
        if (d) d.value = id;
        var origTs = document.getElementById('editLogIdPeg');
        if (origTs) origTs.value = id;
        var origTime = document.getElementById('editLogOriginalTs');
        if (origTime) origTime.value = ts;
        var editTime2 = document.getElementById('editLogTime');
        if (editTime2 && ts) {
            var date = new Date(ts);
            if (!isNaN(date.getTime())) {
                var local2 = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
                editTime2.value = local2.toISOString().slice(0, 16);
            }
        }
        var editStatus2 = document.getElementById('editLogStatus');
        if (editStatus2) editStatus2.value = (st && st.trim() !== '') ? st : 'Hadir';
        var editNilai2 = document.getElementById('editLogNilai');
        if (editNilai2) editNilai2.value = ni || 50;
    }
    openModal('logEditModal');
}

async function saveLogAction() {
    var id = document.getElementById('manualLogPegawai') ? document.getElementById('manualLogPegawai').value : '';
    var allPeg = (masterData.pegawai || []).concat(masterData.korlap || []);
    var pg = null;
    for (var i = 0; i < allPeg.length; i++) {
        if (String(allPeg[i].id || allPeg[i].ID) === String(id)) { pg = allPeg[i]; break; }
    }
    if (!id || !pg) {
        showToast("Pilih pegawai terlebih dahulu!", "error");
        return;
    }
    var timeInput = document.getElementById('editLogTime') ? document.getElementById('editLogTime').value : '';
    if (!timeInput) {
        showToast("Pilih waktu log!", "error");
        return;
    }
    var timestamp = new Date(timeInput);
    if (isNaN(timestamp.getTime())) {
        showToast("Format waktu tidak valid!", "error");
        return;
    }
    var statusValue = document.getElementById('editLogStatus') ? document.getElementById('editLogStatus').value : '';
    var nilaiValue = parseInt(document.getElementById('editLogNilai') ? document.getElementById('editLogNilai').value : '') || 50;
    if (!statusValue || statusValue.trim() === '') {
        statusValue = 'Hadir';
        var statusDropdown = document.getElementById('editLogStatus');
        if (statusDropdown) statusDropdown.value = 'Hadir';
    }
    var p = { token: token };
    if (logMode === 'add') {
        p.action = 'addLog';
        p.idPegawai = id;
        p.nama = pg.nama || pg.Nama;
        p.wilayah = pg.wilayah || pg.Wilayah;
        p.timestamp = timestamp.toISOString();
        p.status = statusValue;
        p.nilai = nilaiValue;
    } else {
        var origTs = document.getElementById('editLogOriginalTs') ? document.getElementById('editLogOriginalTs').value : '';
        if (!origTs) {
            showToast("Data original timestamp tidak ditemukan!", "error");
            return;
        }
        p.action = 'editLog';
        p.idPegawai = id;
        p.originalTimestamp = origTs;
        p.newTimestamp = timestamp.toISOString();
        p.status = statusValue;
        p.nilai = nilaiValue;
    }
    console.log("📤 Payload Log:", JSON.stringify(p));
    setLoading(true, "Menyimpan Log...");
    try {
        var result = await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(p)
        }, 15000);
        console.log("📥 Response:", result);
        if (result.status === 'success') {
            closeModal('logEditModal');
            await loadLogs();
            showToast("Log berhasil disimpan", "success");
        } else {
            throw new Error(result.message || "Gagal menyimpan log");
        }
    } catch (e) {
        console.error("❌ Save Log Error:", e);
        showToast("Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

async function deleteLog(id, ts) {
    if (!confirm("Hapus log ini? File foto di Drive juga akan dihapus.")) return;
    if (!ts) {
        showToast("Timestamp tidak valid!", "error");
        return;
    }
    setLoading(true, "Menghapus Log...");
    try {
        var payload = {
            action: 'deleteLog',
            token: token,
            id: String(id).trim(),
            ts: ts
        };
        console.log("📤 Delete Payload:", JSON.stringify(payload));
        var result = await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }, 15000);
        console.log("📥 Delete Response:", result);
        if (result.status === 'success') {
            await loadLogs();
            showToast("Log berhasil dihapus", "success");
        } else {
            throw new Error(result.message || "Gagal menghapus log");
        }
    } catch (e) {
        console.error("❌ Delete Log Error:", e);
        showToast("Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

async function saveConfig() {
    var c = {};
    var keys = Object.keys(masterData.config || {});
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var el = document.getElementById('c-' + k);
        if (el) c[k] = el.value;
    }
    setLoading(true, "Menyimpan Pengaturan...");
    try {
        await safeFetchJSON(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'updateConfig', token: token, config: c })
        }, 15000);
        await loadDashboard(true);
        showToast("Pengaturan disimpan", "success");
    } catch (e) {
        showToast("Gagal: " + e.message, "error");
    } finally {
        setLoading(false);
    }
}

// ============ FILE HANDLING ============
function handleFile(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (!file.type.startsWith('image/')) {
        showToast("Hanya file gambar yang diizinkan!", "error");
        input.value = '';
        return;
    }
    if (file.size > APP_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
        showToast("Ukuran file terlalu besar! Maksimal " + APP_CONFIG.MAX_FILE_SIZE_MB + "MB.", "error");
        input.value = '';
        return;
    }
    setLoading(true, "Mengompres Gambar...");
    var r = new FileReader();
    r.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var c = document.createElement('canvas');
            var w = img.width,
                h = img.height;
            if (w > APP_CONFIG.IMAGE_MAX_WIDTH) {
                h = h * (APP_CONFIG.IMAGE_MAX_WIDTH / w);
                w = APP_CONFIG.IMAGE_MAX_WIDTH;
            }
            c.width = w;
            c.height = h;
            var ctx = c.getContext('2d');
            var isPng = file.type === 'image/png';
            var isWebp = file.type === 'image/webp';
            var isGif = file.type === 'image/gif';
            var hasTransparency = isPng || isWebp || isGif;
            if (hasTransparency) {
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                if (isPng) {
                    base64Foto = c.toDataURL('image/png');
                } else if (isWebp) {
                    base64Foto = c.toDataURL('image/webp');
                } else {
                    base64Foto = c.toDataURL('image/png');
                }
                console.log("📸 Gambar dengan transparansi dipertahankan:", file.type);
            } else {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                base64Foto = c.toDataURL('image/jpeg', APP_CONFIG.IMAGE_QUALITY);
            }
            if (base64Foto.length > 3 * 1024 * 1024) {
                setLoading(false);
                showToast("Ukuran gambar masih terlalu besar!", "error");
                return;
            }
            var previewImg = document.getElementById('p-preview-img');
            if (previewImg) { previewImg.src = base64Foto;
                previewImg.style.display = 'block'; }
            var placeholder = document.getElementById('p-placeholder');
            if (placeholder) placeholder.style.display = 'none';
            setLoading(false);
        };
        img.onerror = function() { setLoading(false);
            showToast("Gagal memuat gambar", "error"); };
        img.src = e.target.result;
    };
    r.onerror = function() { setLoading(false);
        showToast("Gagal membaca file", "error"); };
    r.readAsDataURL(file);
}

// ============ UI HELPERS ============
function handleFabClick() {
    var a = document.querySelector('.b-nav-item.active');
    if (!a) return;
    var o = a.getAttribute('onclick') || '';
    if (o.includes("'pegawai'")) openPModal('pegawai');
    else if (o.includes("'korlap'")) openPModal('korlap');
    else if (o.includes("'tools'")) openToolModal();
    else if (o.includes("'logs'")) openLogModal('add');
}

function updateFabVisibility() {
    var f = document.getElementById('fabAdd');
    if (f) f.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
}

window.addEventListener('resize', updateFabVisibility);

// ============================================================
// END OF ADMIN.JS v2.5.0
// ============================================================