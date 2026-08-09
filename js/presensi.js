// ============================================================
// PRESENSI.JS - v2.7.0 (FIXED + PROFILE RAPORT)
// ============================================================
// FITUR:
// 1. Presensi Digital dengan Face Detection
// 2. GeoFencing & GPS Validation
// 3. Profile Raport Otomatis
// 4. Auto Refresh Status
// 5. CORS & Offline Handling (Hanya Console Log)
// 6. Voice Recognition
// 7. Camera dengan Face Detection
// 8. Update Warna Tombol Otomatis
// ============================================================

// ============================================================
// 0. CORS & OFFLINE HANDLING (HANYA CONSOLE LOG)
// ============================================================

// Deteksi apakah berjalan di file:// atau http://
const isLocalFile = window.location.protocol === 'file:';
const isLocalhost = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1';

// ✅ HANYA LOG DI CONSOLE - TIDAK ADA TOAST
if (isLocalFile) {
    console.warn('⚠️ Aplikasi berjalan di file://, CORS akan memblokir request.');
    console.warn('💡 Gunakan Live Server atau deploy ke hosting.');
}

// Custom fetch dengan CORS handling
async function fetchWithCors(url, options = {}) {
    const defaultOptions = {
        mode: 'cors',
        credentials: 'omit',
        headers: {
            'Accept': 'application/json',
        }
    };
    
    if (options.body) {
        defaultOptions.headers['Content-Type'] = 'application/json';
    }
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    try {
        const response = await fetch(url, mergedOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    } catch (error) {
        console.error('❌ Fetch error:', error);
        throw error;
    }
}

function fetchWithTimeout(url, options = {}, timeout = 12000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    return fetchWithCors(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

async function fetchWithRetry(url, options = {}, retries = 2, delay = 1500) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetchWithTimeout(url, options);
            if (res.ok) return res;
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            lastError = e;
            if (i === retries) break;
            await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
    }
    throw lastError;
}

// ============================================================
// 1. KONFIGURASI GLOBAL
// ============================================================
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const API = "https://script.google.com/macros/s/AKfycbxH9YKIi5epf2PvsJL9Whens2URSaZzi1aciTEiyIYitVBvjJP83tNa-B9xaIuN5f-3/exec";

// ✅ Fungsi untuk membuat URL API dengan cache busting
function getApiUrl(action, params = {}) {
    const url = new URL(API);
    url.searchParams.append('action', action);
    url.searchParams.append('cb', Date.now());
    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });
    return url.toString();
}

// ✅ Helper format waktu (HH:MM → integer)
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    return (parseInt(parts[0]) || 0) * 100 + (parseInt(parts[1]) || 0);
}

// ✅ Helper format waktu (integer → HH:MM)
function formatTime(timeVal) {
    const hours = String(Math.floor(timeVal / 100)).padStart(2, '0');
    const minutes = String(timeVal % 100).padStart(2, '0');
    return hours + ':' + minutes;
}

let appConfig = { 
    jHadir: "08:00", 
    jTelat: "08:10", 
    jPulang: "16:00" 
};
let activePegawai = null;

// ============================================================
// 2. MANIFEST PWA
// ============================================================
const manifest = {
    "name": "E-PUSDA Presensi Digital",
    "short_name": "E-Presensi",
    "display": "standalone",
    "background_color": "#0d1b3e",
    "theme_color": "#1e40af",
    "icons": [
        { "src": GITHUB_LOGO_URL, "sizes": "192x192", "type": "image/png" },
        { "src": GITHUB_LOGO_URL, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
    ]
};
document.getElementById('pwaManifest').setAttribute('href', URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' })));

// ============================================================
// 3. POLYFILL roundRect
// ============================================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
    };
}

// ============================================================
// 4. VARIABEL GLOBAL
// ============================================================
let isFaceApiLoaded = false;
let isFaceApiLoading = false;
let isInitialMapBound = false;
let _lastFrameTime = 0;
let isFormLoading = false;
let _lastToastKey = '';
let _lastToastTime = 0;

let toastQueue = [];
let isToastShowing = false;

let dbE = [],
    dbF = [],
    dbP = [],
    uIdx = 0,
    map = null,
    marker = null,
    uPos = { lat: 0, lng: 0 },
    cType = '',
    sB64 = null,
    kB64 = null,
    selectedStatus = '',
    calculatedScore = 0;

let isLandmarkReady = false,
    pendingCamType = null,
    currentStream = null;
let lastGoodDetection = null,
    faceDetected = false,
    detectionStableCount = 0;
const STABLE_THRESHOLD = 3;
let detectIntervalId = null,
    laserY = 0,
    laserDirection = 1,
    _activeResizeHandler = null,
    suratB64 = null;

let _canvasW = 0,
    _canvasH = 0;
let _rafRunning = false;

const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 85'%3E%3Crect width='60' height='85' fill='%232e446e'/%3E%3Cpath d='M30 40c5.5 0 10-4.5 10-10s-4.5-10-10-10-10 4.5-10 10 4.5 10 10 10zm0 5c-8 0-20 4-20 12v5h40v-5c0-8-12-12-20-12z' fill='%23fff' opacity='.2'/%3E%3C/svg%3E";

const sndShutter = new Audio('https://assets.mixkit.co/active_storage/sfx/738/738-preview.mp3');
const sndSuccess = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
const sndError = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
const logoCache = new Image();
logoCache.crossOrigin = "anonymous";
logoCache.src = GITHUB_LOGO_URL;

// ============================================================
// 5. STATUS CONFIGURATION
// ============================================================
const STATUS_CONFIG = {
    'HADIR': {
        placeholder: 'Tuliskan ringkasan tugas hari ini...',
        title: '✅ HADIR',
        message: '<b>Aturan Waktu:</b><br>• ≤ 08:00 = Poin 50 (Tepat Waktu)<br>• 08:01 - 08:10 = Poin 40 (Terlambat Ringan)<br>• > 08:10 = Poin 25 (Terlambat Berat)',
        icon: 'check-circle',
        color: 'var(--success)',
        borderColor: 'var(--success)',
        actions: []
    },
    'PULANG': {
        placeholder: 'Tuliskan ringkasan hasil kerja hari ini...',
        title: '🌙 PULANG',
        message: 'Absensi pulang tercatat. Selamat beristirahat.',
        icon: 'moon',
        color: 'var(--pu-blue)',
        borderColor: 'var(--pu-blue)',
        actions: []
    },
    'IZIN': {
        placeholder: 'Jelaskan alasan izin (cuti, urusan keluarga, dll)...',
        title: '📝 IZIN',
        message: 'Silahkan hubungi Koordinator / Pimpinan untuk meminta izin. Pastikan alasan izin dijelaskan dengan detail.',
        icon: 'file-text',
        color: '#d8b4fe',
        borderColor: '#a855f7',
        actions: [{ label: 'Lampirkan Surat', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'SAKIT': {
        placeholder: 'Jelaskan kondisi sakit dan lampirkan surat dokter...',
        title: '🏥 SAKIT',
        message: 'Lampirkan foto surat keterangan dokter dan hubungi Koordinator / Pimpinan. Semoga lekas sembuh.',
        icon: 'heart-pulse',
        color: '#fde047',
        borderColor: 'var(--warning)',
        actions: [{ label: 'Lampirkan Surat Dokter', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'DINAS': {
        placeholder: 'Jelaskan lokasi dan tujuan dinas...',
        title: '💼 DINAS',
        message: 'Lampirkan foto surat tugas dinas. Pastikan lokasi dan tujuan dinas dijelaskan dengan detail.',
        icon: 'briefcase',
        color: '#fdba74',
        borderColor: 'var(--accent)',
        actions: [{ label: 'Lampirkan Surat Tugas', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'QUICK RESPONSE': {
        placeholder: 'Tuliskan ringkasan tugas darurat dengan detail...',
        title: '⚡ QUICK RESPONSE',
        message: 'Tuliskan ringkasan tugas hari ini dengan detail. Pastikan lokasi dan kegiatan dijelaskan.',
        icon: 'zap',
        color: '#f9a8d4',
        borderColor: '#ec4899',
        actions: []
    }
};

// ============================================================
// 6. DEVICE PROFILE
// ============================================================
const DeviceProfile = (() => {
    const cores = navigator.hardwareConcurrency || 2,
        ram = navigator.deviceMemory || 2;
    const isSlowNetwork = navigator.connection ? ['slow-2g', '2g', '3g'].includes(navigator.connection.effectiveType) : false;
    let tier = 'low';
    if (ram >= 4 && cores >= 6 && !isSlowNetwork) tier = 'high';
    else if (ram >= 3 && cores >= 4) tier = 'mid';
    const configs = {
        high: {
            enableFaceAPI: true,
            enableLandmarks: true,
            enableShadowBlur: true,
            canvasFPS: 60,
            detectInterval: 200,
            selfieResolution: [600, 800],
            kerjaResolution: [800, 600],
            jpegQuality: 0.5,
            videoConstraints: { width: 1280, height: 960 }
        },
        mid: {
            enableFaceAPI: true,
            enableLandmarks: true,
            enableShadowBlur: false,
            canvasFPS: 30,
            detectInterval: 350,
            selfieResolution: [600, 800],
            kerjaResolution: [800, 600],
            jpegQuality: 0.5,
            videoConstraints: { width: 960, height: 720 }
        },
        low: {
            enableFaceAPI: false,
            enableLandmarks: false,
            enableShadowBlur: false,
            canvasFPS: 30,
            detectInterval: 0,
            selfieResolution: [600, 800],
            kerjaResolution: [800, 600],
            jpegQuality: 0.5,
            videoConstraints: { width: 640, height: 480 }
        }
    };
    return { tier, config: configs[tier], cores, ram };
})();

// ============================================================
// 7. UTILITY FUNCTIONS
// ============================================================

function getJakartaTimeVal() {
    const now = new Date();
    const jakartaString = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaString);
    return (jakartaDate.getHours() * 100) + jakartaDate.getMinutes();
}

function showToast(title, message, type = "info") {
    const payload = { title, message, type };
    if (isToastShowing) {
        toastQueue.push(payload);
        return;
    }
    _showToastInternal(payload);
}

function _showToastInternal({ title, message, type }) {
    isToastShowing = true;
    const modal = document.getElementById('notificationModal');
    const content = document.getElementById('notifModalContent');
    const iconEl = document.getElementById('notifIcon');
    const titleEl = document.getElementById('notifTitle');
    const msgEl = document.getElementById('notifMessage');
    const btnOk = document.getElementById('btnNotifOk');

    content.className = 'notif-modal-content';
    content.classList.add(`notif-${type}`);
    titleEl.innerText = title;
    msgEl.innerText = message;
    btnOk.innerHTML = '<i data-lucide="check" size="18"></i> Mengerti';
    const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
    iconEl.setAttribute('data-lucide', icons[type] || 'info');
    lucide.createIcons();

    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.classList.add('show'); });
    if (type === 'success') sndSuccess.play().catch(() => {});
    else if (type === 'error' || type === 'warning') sndError.play().catch(() => {});

    const cleanup = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            isToastShowing = false;
            if (toastQueue.length > 0) _showToastInternal(toastQueue.shift());
        }, 300);
    };
    const autoCloseTimer = setTimeout(cleanup, 4000);
    btnOk.onclick = () => {
        clearTimeout(autoCloseTimer);
        cleanup();
    };
}

function showToastOnce(key, title, message, type, minInterval = 30000) {
    const now = Date.now();
    if (_lastToastKey === key && (now - _lastToastTime) < minInterval) return;
    _lastToastKey = key;
    _lastToastTime = now;
    showToast(title, message, type);
}

function haptic() {
    if (navigator.vibrate) navigator.vibrate(50);
}

function setupCanvas() {
    const canvas = document.getElementById('faceOverlay');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width),
        h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return;
    if (Math.abs(w - _canvasW) > 3 || Math.abs(h - _canvasH) > 3) {
        canvas.width = w;
        canvas.height = h;
        _canvasW = w;
        _canvasH = h;
    }
}

function startRenderLoop(callback) {
    if (_rafRunning) return;
    _rafRunning = true;
    const targetFPS = DeviceProfile.tier === 'low' ? 24 : 30;
    const frameDelay = 1000 / targetFPS;
    const loop = (time) => {
        if (!_rafRunning) return;
        if (time - _lastFrameTime >= frameDelay) {
            callback(time);
            _lastFrameTime = time;
        }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
}

function stopRenderLoop() {
    _rafRunning = false;
}

function registerResizeHandler() {
    if (_activeResizeHandler) window.removeEventListener('resize', _activeResizeHandler);
    _activeResizeHandler = () => setupCanvas();
    window.addEventListener('resize', _activeResizeHandler);
}

function setLoading(s, t) {
    const o = document.getElementById('sendingOverlay');
    document.getElementById('overlayText').innerText = t;
    o.style.display = s ? 'flex' : 'none';
    o.style.pointerEvents = s ? 'all' : 'none';
}

// ============================================================
// 8. UPDATE WATERMARK CLOCK
// ============================================================
function updateWatermarkClock() {
    const now = new Date();
    const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaStr);
    const timeStr = jakartaDate.toLocaleTimeString('id-ID', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
    const clockEl = document.getElementById('wmClock');
    if (clockEl) {
        clockEl.textContent = timeStr;
    }
}

// ============================================================
// 9. UPDATE WARNA TOMBOL OTOMATIS
// ============================================================
function updateButtonColors() {
    const timeVal = getJakartaTimeVal();
    const jamHadirLimit = parseTime(appConfig.jHadir || "08:00");
    const jamTelatLimit = parseTime(appConfig.jTelat || "08:10");
    
    let btnColor = '#10b981';
    let statusText = 'Tepat Waktu';
    let isLate = false;
    let isHeavyLate = false;
    
    if (timeVal > jamTelatLimit) {
        btnColor = '#ef4444';
        statusText = 'Terlambat Berat';
        isHeavyLate = true;
        isLate = true;
    } else if (timeVal > jamHadirLimit) {
        btnColor = '#facc15';
        statusText = 'Terlambat Ringan';
        isLate = true;
    }
    
    const btnHadir = document.getElementById('btnHadirMain');
    const btnPulang = document.getElementById('btnPulangMain');
    
    if (btnHadir) {
        if (!btnHadir.classList.contains('btn-done') && !btnHadir.classList.contains('active')) {
            btnHadir.style.backgroundColor = btnColor;
            btnHadir.style.color = '#ffffff';
            btnHadir.style.borderColor = btnColor;
            btnHadir.style.boxShadow = `0 8px 20px ${btnColor}66`;
        }
    }
    
    if (btnPulang && !btnPulang.classList.contains('active') && !btnPulang.classList.contains('btn-done')) {
        btnPulang.style.backgroundColor = '';
        btnPulang.style.color = '';
        btnPulang.style.borderColor = '';
        btnPulang.style.boxShadow = '';
    }
    
    if (!selectedStatus || selectedStatus === '') {
        const badgeContainer = document.getElementById('attendanceStatusIndicator');
        if (badgeContainer) {
            if (isLate) {
                const icon = isHeavyLate ? 'alert-octagon' : 'clock';
                const color = isHeavyLate ? '#ef4444' : '#facc15';
                badgeContainer.innerHTML = `
                    <div class="attendance-status-badge ${isHeavyLate ? 'status-late-heavy' : 'status-late-light'}">
                        <div class="badge-icon"><i data-lucide="${icon}" size="18"></i></div>
                        <div class="badge-text">
                            <h4 style="color:${color}">${statusText}</h4>
                            <p>${isHeavyLate ? 'Poin dikurangi menjadi 25.' : 'Poin dikurangi menjadi 40.'}</p>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            } else {
                badgeContainer.innerHTML = `
                    <div class="attendance-status-badge status-ontime">
                        <div class="badge-icon"><i data-lucide="check-circle" size="18"></i></div>
                        <div class="badge-text">
                            <h4 style="color:#10b981">Tepat Waktu</h4>
                            <p>Anda mendapat poin penuh (50).</p>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            }
        }
    }
    
    console.log('🎨 Warna tombol:', btnColor, '| Waktu:', formatTime(timeVal), '| Status:', statusText);
}

// ============================================================
// 10. FACE API
// ============================================================
async function ensureFaceApiLoaded() {
    if (isFaceApiLoaded) return true;
    if (isFaceApiLoading) {
        while (isFaceApiLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return isFaceApiLoaded;
    }
    isFaceApiLoading = true;
    showToast("Memuat AI", "Sedang menyiapkan deteksi wajah...", "info");
    try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
        document.head.appendChild(script);
        const loadPromise = new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
        await Promise.race([loadPromise, timeoutPromise]);
        await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
        isFaceApiLoaded = true;
        isFaceApiLoading = false;
        return true;
    } catch (e) {
        console.error("Face API Load Error:", e);
        isFaceApiLoading = false;
        showToast("Mode AI Gagal", "Menggunakan mode kamera standar", "warning");
        return false;
    }
}

async function loadFaceModels() {
    if (!DeviceProfile.config.enableFaceAPI) return;
    try {
        await faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
        isLandmarkReady = true;
    } catch (e) {
        isLandmarkReady = false;
    }
}

// ============================================================
// 11. GPS & GEOFENCING
// ============================================================
function upLoc(retryCount = 0) {
    const g = document.getElementById('gpsTxt');
    g.innerHTML = '<i data-lucide="refresh-cw" size="14" style="vertical-align:middle;margin-right:5px;animation:spin 1s linear infinite"></i> Mengunci Sinyal...';
    lucide.createIcons();

    if (!navigator.geolocation) {
        g.innerText = "GPS tidak didukung";
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (p) => {
            if (p.coords.accuracy > 250) {
                sndError.play();
                showToastOnce('gps_lemah', "Sinyal Terlalu Lemah", `Akurasi GPS ${p.coords.accuracy.toFixed(0)}m (>250m). Presensi ditolak. Pastikan Anda di luar ruangan.`, "error");
                g.innerHTML = `<i data-lucide="x-circle" size="14" style="vertical-align:middle;margin-right:5px;color:var(--danger)"></i> Sinyal Lemah`;
                lucide.createIcons();
                uPos = { lat: 0, lng: 0 };
                updateWorkflow();
                return;
            }

            if (p.coords.accuracy > 150) {
                showToastOnce('gps_warning', "Peringatan Sinyal", `Akurasi GPS ${p.coords.accuracy.toFixed(0)}m. Presensi diperbolehkan tapi disarankan cari lokasi lebih terbuka.`, "warning");
            }

            uPos = {
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                accuracy: p.coords.accuracy
            };

            g.innerHTML = `<i data-lucide="check-circle" size="14" style="vertical-align:middle;margin-right:5px;color:var(--success)"></i> GPS: ${uPos.lat.toFixed(5)}, ${uPos.lng.toFixed(5)}`;
            lucide.createIcons();

            if (map) {
                map.setView([uPos.lat, uPos.lng], 16);
                marker.setLatLng([uPos.lat, uPos.lng]);
                const mapFrame = document.querySelector('.map-view-frame');
                if (mapFrame) mapFrame.classList.remove('loading');
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (map) map.invalidateSize();
                    });
                });
                tampilkanGeoFence();
            }
            updateWorkflow();
            console.log("📍 GPS terkunci:", uPos.lat, uPos.lng, "akurasi:", p.coords.accuracy);
        },
        (e) => {
            console.warn("⚠️ GPS error:", e.message);
            if (retryCount < 3) {
                g.innerHTML = `<i data-lucide="refresh-cw" size="14" style="vertical-align:middle;margin-right:5px;animation:spin 1s linear infinite"></i> Mencoba ulang (${retryCount + 1}/3)...`;
                lucide.createIcons();
                setTimeout(() => upLoc(retryCount + 1), 2000);
                return;
            }
            if (e.code === 1) {
                showPermissionModal('gps');
            } else {
                showToastOnce('gps_error', "Gagal", "GPS gagal: " + e.message, "error");
            }
        }, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

function hitungJarak(a, b, c, d) {
    if (!a || !b || !c || !d) return 999999;
    const R = 6371000,
        dL = (c - a) * Math.PI / 180,
        dG = (d - b) * Math.PI / 180,
        x = Math.sin(dL / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dG / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function validasiGeoFencing() {
    const p = activePegawai || dbF[uIdx];
    let pts = [];
    if (p.Koordinat_Tugas) try { pts = JSON.parse(p.Koordinat_Tugas); } catch (e) {}
    else if (p.Lat_Kantor) pts = [{ nama: "Lokasi Utama", lat: p.Lat_Kantor, lng: p.Lng_Kantor, radius: p.Radius_Meter }];
    if (!pts.length) return { valid: true, status: 'NO_FENCE', jarak: 0, radius: 0, nama: 'Tanpa Batas' };
    let best = null;
    for (const pt of pts) {
        const j = hitungJarak(uPos.lat, uPos.lng, pt.lat, pt.lng);
        if (j <= (pt.radius + 20)) return { valid: true, status: 'IN_ZONE', jarak: Math.round(j), radius: pt.radius, nama: pt.nama || 'Lokasi' };
        if (!best || j < best.jarak) best = { jarak: Math.round(j), radius: pt.radius, nama: pt.nama || 'Lokasi' };
    }
    return { valid: false, status: 'OUT_ZONE', jarak: best.jarak, radius: best.radius, nama: best.nama };
}

function tampilkanGeoFence() {
    if (!map) return;
    const p = activePegawai || dbF[uIdx];
    let pts = [];
    if (p.Koordinat_Tugas) try { pts = JSON.parse(p.Koordinat_Tugas); } catch (e) {}
    else if (p.Lat_Kantor) pts = [{ lat: p.Lat_Kantor, lng: p.Lng_Kantor, radius: p.Radius_Meter }];
    if (window.fenceCircles) window.fenceCircles.forEach(c => map.removeLayer(c));
    window.fenceCircles = [];
    pts.forEach(pt => {
        if (pt.lat && pt.lng && pt.radius) {
            const c = L.circle([pt.lat, pt.lng], { color: '#2dd4bf', fillColor: '#2dd4bf', fillOpacity: .15, radius: pt.radius, weight: 2 }).addTo(map);
            window.fenceCircles.push(c);
        }
    });
    if (window.fenceCircles.length && !isInitialMapBound) {
        map.fitBounds(new L.featureGroup(window.fenceCircles).getBounds().pad(.2));
        isInitialMapBound = true;
    }
}

// ============================================================
// 12. MAP
// ============================================================
function initMap() {
    if (map) return;
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([-8.13, 113.22], 15);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    marker = L.marker([-8.13, 113.22]).addTo(map);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (map) map.invalidateSize();
        });
    });
}

// ============================================================
// 13. PERMISSION MODAL
// ============================================================
function showPermissionModal(type) {
    const m = document.getElementById('permissionModal'),
        t = document.getElementById('permTitle'),
        d = document.getElementById('permDesc'),
        s = document.getElementById('permSteps'),
        b = document.getElementById('permRetryBtn');
    if (type === 'camera') {
        t.innerText = 'Akses Kamera Dibutuhkan';
        d.innerText = 'Izinkan akses kamera untuk foto presensi.';
        s.innerHTML = '<div class="permission-step"><div class="permission-step-num">1</div><div>Klik <b>Coba Lagi</b></div></div><div class="permission-step"><div class="permission-step-num">2</div><div>Pilih <b>Izinkan</b></div></div><div class="permission-step"><div class="permission-step-num">3</div><div>Jika ditolak: <b>Settings → Site → Camera</b></div></div>';
        b.onclick = () => {
            closePermissionModal();
            triggerCam(pendingCamType);
        };
    } else {
        t.innerText = 'Akses Lokasi Dibutuhkan';
        d.innerText = 'GPS diperlukan untuk verifikasi lokasi.';
        s.innerHTML = '<div class="permission-step"><div class="permission-step-num">1</div><div>Aktifkan <b>GPS HP</b></div></div><div class="permission-step"><div class="permission-step-num">2</div><div>Klik <b>Coba Lagi</b></div></div>';
        b.onclick = () => {
            closePermissionModal();
            upLoc();
        };
    }
    m.classList.add('show');
    lucide.createIcons();
}

function closePermissionModal() {
    document.getElementById('permissionModal').classList.remove('show');
}

// ============================================================
// 14. SURAT MODAL
// ============================================================
function showSuratModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('suratModal');
        const statusText = document.getElementById('modalStatusText');
        const btnAttach = document.getElementById('btnModalAttach');
        const btnSkip = document.getElementById('btnModalSkip');
        statusText.innerText = selectedStatus;
        lucide.createIcons();
        modal.style.display = 'flex';
        requestAnimationFrame(() => { modal.classList.add('show'); });
        const cleanup = () => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
            btnAttach.onclick = null;
            btnSkip.onclick = null;
        };
        btnAttach.onclick = () => {
            cleanup();
            resolve('attach');
        };
        btnSkip.onclick = () => {
            cleanup();
            resolve('skip');
        };
    });
}

// ============================================================
// 15. UI UPDATE FUNCTIONS
// ============================================================

function updateAttendanceStatusIndicator() {
    const timeVal = getJakartaTimeVal();
    let badgeContainer = document.getElementById('attendanceStatusIndicator');
    
    if (!badgeContainer) {
        const statusBox = document.getElementById('statusBox1');
        if (statusBox) {
            badgeContainer = document.createElement('div');
            badgeContainer.id = 'attendanceStatusIndicator';
            badgeContainer.style.width = '100%';
            statusBox.parentNode.insertBefore(badgeContainer, statusBox.nextSibling);
        } else { return; }
    }
    
    if (!selectedStatus || selectedStatus === '') {
        updateButtonColors();
        return;
    }
    
    if (selectedStatus === 'PULANG') {
        badgeContainer.innerHTML = `
            <div class="attendance-status-badge status-ontime">
                <div class="badge-icon"><i data-lucide="moon" size="18"></i></div>
                <div class="badge-text">
                    <h4>Absen Pulang</h4>
                    <p>Terima kasih atas kerja keras Anda hari ini.</p>
                </div>
            </div>
        `;
        lucide.createIcons();
        
        const btnHadir = document.getElementById('btnHadirMain');
        if (btnHadir && !btnHadir.classList.contains('btn-done')) {
            btnHadir.style.backgroundColor = '';
            btnHadir.style.color = '';
            btnHadir.style.borderColor = '';
            btnHadir.style.boxShadow = '';
        }
        return;
    }
    
    if (selectedStatus !== 'HADIR') {
        badgeContainer.innerHTML = '';
        return;
    }
    
    const jamHadirLimit = parseTime(appConfig.jHadir);
    const jamTelatLimit = parseTime(appConfig.jTelat);
    
    let statusClass = '', icon = '', title = '', desc = '', btnColor = '#10b981';
    
    if (timeVal <= jamHadirLimit) {
        statusClass = 'status-ontime';
        icon = 'check-circle';
        title = 'Tepat Waktu';
        desc = 'Anda mendapat poin penuh (50).';
        btnColor = '#10b981';
    } else if (timeVal <= jamTelatLimit) {
        statusClass = 'status-late-light';
        icon = 'clock';
        title = 'Terlambat Ringan';
        desc = 'Poin dikurangi menjadi 40.';
        btnColor = '#facc15';
    } else {
        statusClass = 'status-late-heavy';
        icon = 'alert-octagon';
        title = 'Terlambat Berat';
        desc = 'Poin dikurangi menjadi 25.';
        btnColor = '#ef4444';
    }
    
    badgeContainer.innerHTML = `
        <div class="attendance-status-badge ${statusClass}">
            <div class="badge-icon"><i data-lucide="${icon}" size="18"></i></div>
            <div class="badge-text">
                <h4>${title}</h4>
                <p>${desc}</p>
            </div>
        </div>
    `;
    
    const btnHadir = document.getElementById('btnHadirMain');
    if (btnHadir && !btnHadir.classList.contains('btn-done')) {
        btnHadir.style.backgroundColor = btnColor;
        btnHadir.style.color = '#ffffff';
        btnHadir.style.borderColor = btnColor;
        btnHadir.style.boxShadow = `0 8px 20px ${btnColor}66`;
    }
    
    lucide.createIcons();
}

function updateNotesCounter() {
    const notes = document.getElementById('notes'),
        counter = document.getElementById('notesCounter'),
        clearBtn = document.getElementById('notesClear'),
        len = notes.value.length;
    counter.textContent = `${len}/500`;
    counter.classList.remove('warning', 'valid');
    if (len === 0) {
        clearBtn.classList.remove('show');
    } else if (len < 5) {
        counter.classList.add('warning');
        clearBtn.classList.add('show');
    } else {
        counter.classList.add('valid');
        clearBtn.classList.add('show');
    }
    notes.style.height = 'auto';
    notes.style.height = Math.min(notes.scrollHeight, 200) + 'px';
}

function clearNotes() {
    document.getElementById('notes').value = '';
    updateNotesCounter();
    saveAutoRecovery();
}

function updateStatusInfo(status) {
    const info = document.getElementById('statusInfo'),
        badge = document.getElementById('statusBadge'),
        badgeText = document.getElementById('statusBadgeText'),
        textarea = document.getElementById('notes'),
        config = STATUS_CONFIG[status];
    if (!config) {
        info.style.display = 'none';
        badge.classList.remove('show');
        return;
    }
    badge.className = 'status-badge show';
    if (status === 'IZIN') badge.classList.add('badge-izin');
    else if (status === 'SAKIT') badge.classList.add('badge-sakit');
    else if (status === 'DINAS') badge.classList.add('badge-dinas');
    else if (status === 'QUICK RESPONSE') badge.classList.add('badge-qr');
    badgeText.textContent = status;
    info.style.display = 'block';
    info.style.color = config.color;
    info.style.borderLeftColor = config.borderColor;
    let actionsHtml = '';
    if (config.actions.length > 0) {
        actionsHtml = '<div class="info-actions">';
        config.actions.forEach(action => {
            actionsHtml += `<button class="info-action-btn" onclick="${action.action}()"><i data-lucide="${action.icon}" size="12"></i>${action.label}</button>`;
        });
        actionsHtml += '</div>';
    }
    info.innerHTML = `<div class="info-title"><i data-lucide="${config.icon}" size="18"></i><span>${config.title}</span></div><div class="info-body">${config.message}</div>${actionsHtml}`;
    textarea.placeholder = config.placeholder;
    lucide.createIcons();
}

function updateWorkflow() {
    const gpsReady = uPos.lat !== 0,
        statusReady = selectedStatus !== '',
        notesReady = document.getElementById('notes').value.trim().length >= 5;
    document.getElementById('statusBox1').classList.toggle('workflow-locked', !gpsReady);
    document.getElementById('specialStatusHeader').classList.toggle('workflow-locked', !gpsReady);
    document.getElementById('specialStatusGrid').classList.toggle('workflow-locked', !gpsReady);
    document.getElementById('notesBox').classList.toggle('workflow-locked', !statusReady);
    document.getElementById('photoBox').classList.toggle('workflow-locked', !notesReady);
}

function clearHeavyData() {
    sB64 = null;
    kB64 = null;
    suratB64 = null;

    document.getElementById('sImg').src = "";
    document.getElementById('kImg').src = "";
    document.getElementById('sImg').style.display = 'none';
    document.getElementById('kImg').style.display = 'none';
    document.getElementById('sPh').style.display = 'block';
    document.getElementById('kPh').style.display = 'block';

    document.getElementById('specialStatusGrid').classList.remove('show');
    document.getElementById('collapseIcon').setAttribute('data-lucide', 'chevron-down');
    document.getElementById('statusBadge').classList.remove('show');
    document.getElementById('statusInfo').style.display = 'none';
    document.getElementById('attendanceStatusIndicator').innerHTML = '';

    document.getElementById('notes').value = '';
    updateNotesCounter();
    selectedStatus = '';
    document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));

    lucide.createIcons();
    sessionStorage.removeItem('pusda_recovery');
    updateWorkflow();
}

function toggleSpecialStatus() {
    const g = document.getElementById('specialStatusGrid'),
        i = document.getElementById('collapseIcon');
    g.classList.toggle('show');
    i.setAttribute('data-lucide', g.classList.contains('show') ? 'chevron-up' : 'chevron-down');
    lucide.createIcons();
}

function checkAtt(id, st) {
    if (!dbP || dbP.length === 0) {
        console.log("⚠️ dbP kosong, checkAtt returns false");
        return false;
    }

    const targetId = String(id);
    const statusLower = st.toLowerCase();

    const pegawaiRecords = dbP.filter(l => {
        const lid = String(l['ID Pegawai'] || l.id_pegawai || l.ID || '');
        return lid === targetId;
    });

    if (pegawaiRecords.length === 0) {
        console.log(`🔍 checkAtt(${id}, ${st}) = false (no records)`);
        return false;
    }

    console.log(`📋 Status records untuk pegawai ${id}:`);
    pegawaiRecords.forEach(r => {
        console.log(`   - ${r.status} (${r.timestamp})`);
    });

    const result = pegawaiRecords.some(l => {
        const ls = (l.Status || l.status || "").toLowerCase().trim();
        if (statusLower === 'hadir') {
            return ls.includes('hadir') ||
                   ls.includes('terlambat') ||
                   ls.includes('qr hadir') ||
                   ls.includes('qr terlambat');
        }
        if (statusLower === 'pulang') {
            return ls.includes('pulang') ||
                   ls.includes('qr pulang');
        }
        return false;
    });

    console.log(`🔍 checkAtt(${id}, ${st}) = ${result}`);
    return result;
}

function saveAutoRecovery() {
    const data = {
        timestamp: Date.now(),
        notes: document.getElementById('notes').value,
        sB64: sB64 || null,
        kB64: kB64 || null,
        suratB64: suratB64 || null,
        status: selectedStatus
    };
    try {
        sessionStorage.setItem('pusda_recovery', JSON.stringify(data));
    } catch (e) {
        const dataLite = {
            timestamp: Date.now(),
            notes: document.getElementById('notes').value,
            sB64: null,
            kB64: null,
            suratB64: null,
            status: selectedStatus
        };
        try {
            sessionStorage.setItem('pusda_recovery', JSON.stringify(dataLite));
        } catch (e2) {}
    }
}

function loadAutoRecovery() {
    const saved = sessionStorage.getItem('pusda_recovery');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.timestamp && (Date.now() - data.timestamp < 86400000)) {
                document.getElementById('notes').value = data.notes || "";
                if (data.sB64) {
                    sB64 = data.sB64;
                    document.getElementById('sImg').src = sB64;
                    document.getElementById('sImg').style.display = 'block';
                    document.getElementById('sPh').style.display = 'none';
                }
                if (data.kB64) {
                    kB64 = data.kB64;
                    document.getElementById('kImg').src = kB64;
                    document.getElementById('kImg').style.display = 'block';
                    document.getElementById('kPh').style.display = 'none';
                }
                if (data.suratB64) suratB64 = data.suratB64;
                if (data.status) {
                    selectedStatus = data.status;
                    updateStatusInfo(selectedStatus);
                }
                updateNotesCounter();
                updateWorkflow();
            } else {
                sessionStorage.removeItem('pusda_recovery');
            }
        } catch (e) {
            sessionStorage.removeItem('pusda_recovery');
        }
    }
}

// ============================================================
// 16. DATA FETCHING
// ============================================================
function loadFromCache() {
    const c = localStorage.getItem('pusda_pegawai_v1');
    if (c) {
        try {
            dbE = JSON.parse(c);
            dbF = [...dbE];
            renderChips();
            upUI();
            return true;
        } catch (e) {
            localStorage.removeItem('pusda_pegawai_v1');
            return false;
        }
    }
    return false;
}

async function loadData() {
    const statusText = document.getElementById('initStatusText');
    const hasCache = loadFromCache();
    
    if (hasCache) {
        const o = document.getElementById('initialLoadingOverlay');
        if (o) {
            o.style.opacity = '0';
            o.style.pointerEvents = 'none';
            setTimeout(() => o.style.display = 'none', 400);
        }
        silentBackgroundUpdate();
        return;
    }
    
    if (statusText) statusText.innerText = "Menghubungkan ke Server...";
    
    try {
        const [r1, r2] = await Promise.all([
            fetchWithRetry(API + "?action=getDashboardData", { redirect: 'follow', cache: 'no-cache' }, 2, 2000),
            fetchWithRetry(API + "?action=getTodayPresensi", { redirect: 'follow', cache: 'no-cache' }, 2, 2000)
        ]);
        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
        
        dbE = d1.pegawai || [];
        dbF = [...dbE];
        dbP = d2.data || [];
        
        try {
            localStorage.setItem('pusda_pegawai_v1', JSON.stringify(dbE));
        } catch (e) { console.warn('LocalStorage penuh'); }
        
        document.getElementById('sidebarLogo').src = d1.config?.Logo || GITHUB_LOGO_URL;
        const cfg = d1.config || {};
        appConfig.jHadir = cfg.Jam_Hadir || "08:00";
        appConfig.jTelat = cfg.Jam_Terlambat_Ringan || "08:10";
        appConfig.jPulang = cfg.Jam_Pulang || "16:00";
        STATUS_CONFIG.HADIR.message = `<b>Aturan Waktu:</b><br>• ≤ ${appConfig.jHadir} = Poin 50 (Tepat Waktu)<br>• ${appConfig.jTelat} = Poin 40 (Terlambat Ringan)<br>• > ${appConfig.jTelat} = Poin 25 (Terlambat Berat)`;
        
        if (cfg.Teks_Sambutan) {
            const el = document.getElementById('dynamicWelcome');
            if (el) el.innerText = cfg.Teks_Sambutan;
        }
        if (cfg.TeksDeskripsi) {
            const el = document.getElementById('dynamicDesc');
            if (el) el.innerText = cfg.TeksDeskripsi;
        }
        if (cfg.Teks_Tombol_Mulai) {
            const el = document.getElementById('dynamicBtnStart');
            if (el) el.innerHTML = `<i data-lucide="scan-face" size="26"></i> ${cfg.Teks_Tombol_Mulai}`;
            lucide.createIcons();
        }
        if (cfg.URL_Background) {
            const bgEl = document.querySelector('.fixed-bg');
            if (bgEl) bgEl.style.setProperty('--dynamic-bg-url', `url('${cfg.URL_Background}')`);
        }
        
        renderChips();
        applyFilters();
        
    } catch (e) {
        console.error("Load API Error:", e);
        if (statusText) statusText.innerText = "Koneksi Gagal";
        document.getElementById('pName').innerText = "GAGAL MEMUAT";
        document.getElementById('pName').style.color = "var(--danger)";
        document.getElementById('pJob').innerText = "Periksa koneksi internet Anda";
        
        console.warn('⚠️ Gagal terhubung ke server, menggunakan cache jika ada.');
        
        const fallbackCache = loadFromCache();
        if (fallbackCache) {
            console.info('📦 Menggunakan data cache yang tersedia.');
        }
        
    } finally {
        const o = document.getElementById('initialLoadingOverlay');
        if (o) {
            o.style.opacity = '0';
            o.style.pointerEvents = 'none';
            setTimeout(() => o.style.display = 'none', 400);
        }
    }
}

async function silentBackgroundUpdate() {
    try {
        const [r1, r2] = await Promise.all([
            fetchWithTimeout(API + "?action=getDashboardData", { redirect: 'follow', cache: 'no-cache' }, 15000),
            fetchWithTimeout(API + "?action=getTodayPresensi", { redirect: 'follow', cache: 'no-cache' }, 15000)
        ]);
        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
        dbE = d1.pegawai || [];
        dbF = [...dbE];
        dbP = d2.data || [];
        try {
            localStorage.setItem('pusda_pegawai_v1', JSON.stringify(dbE));
        } catch (e) {}
        const cfg = d1.config || {};
        appConfig.jHadir = cfg.Jam_Hadir || "08:00";
        appConfig.jTelat = cfg.Jam_Terlambat_Ringan || "08:10";
        appConfig.jPulang = cfg.Jam_Pulang || "16:00";
        STATUS_CONFIG.HADIR.message = `<b>Aturan Waktu:</b><br>• ≤ ${appConfig.jHadir} = Poin 50 (Tepat Waktu)<br>• ${appConfig.jTelat} = Poin 40 (Terlambat Ringan)<br>• > ${appConfig.jTelat} = Poin 25 (Terlambat Berat)`;
        renderChips();
        applyFilters();
        if (d1.config?.Logo) document.getElementById('sidebarLogo').src = d1.config.Logo;
        if (cfg.Teks_Sambutan) {
            const el = document.getElementById('dynamicWelcome');
            if (el) el.innerText = cfg.Teks_Sambutan;
        }
        if (cfg.TeksDeskripsi) {
            const el = document.getElementById('dynamicDesc');
            if (el) el.innerText = cfg.TeksDeskripsi;
        }
        if (cfg.URL_Background) {
            const bgEl = document.querySelector('.fixed-bg');
            if (bgEl) bgEl.style.setProperty('--dynamic-bg-url', `url('${cfg.URL_Background}')`);
        }
    } catch (e) {
        console.warn("⚠️ Background update gagal, menggunakan cache:", e.message);
    }
}

// ============================================================
// 17. UI RENDER FUNCTIONS
// ============================================================

function renderChips() {
    const w = ["ALL", ...new Set(dbE.map(p => (p.Wilayah || p.wilayah || "").trim()).filter(x => x))];
    document.getElementById('wilChips').innerHTML = w.map(x =>
        `<div class="chip-pill ${x === 'ALL' ? 'active' : ''}" data-wil="${x}" onclick="setWil('${x}',this)">${x}</div>`
    ).join('');
}

function setWil(w, el) {
    document.querySelectorAll('.chip-pill').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    applyFilters();
}

function applyFilters() {
    const s = document.getElementById('searchInput').value.toLowerCase().trim();
    const activeChip = document.querySelector('.chip-pill.active');
    const w = (activeChip?.getAttribute('data-wil') || 'ALL').toLowerCase();
    const currentPegId = dbF.length > 0 ? (dbF[uIdx]?.ID || dbF[uIdx]?.id) : null;
    dbF = dbE.filter(p => {
        const pw = (p.Wilayah || p.wilayah || "").trim().toLowerCase();
        const pn = (p.Nama || p.nama || "").toLowerCase();
        return (w === 'all' || pw === w) && (!s || pn.includes(s));
    });
    if (currentPegId) {
        const newIdx = dbF.findIndex(p => (p.ID || p.id) === currentPegId);
        uIdx = newIdx !== -1 ? newIdx : 0;
    } else {
        uIdx = 0;
    }
    upUI(w === 'all' ? 'ALL' : w);
}

function upUI(w = "ALL") {
    const p = dbF[uIdx];
    if (!p) {
        document.getElementById('pName').innerText = "TIDAK DITEMUKAN";
        document.getElementById('pImg').src = placeholderImg;
        document.getElementById('pWil').innerText = "WILAYAH: " + (w === 'all' ? 'ALL' : w);
        document.getElementById('pJob').innerText = "Pencarian Nihil";
        return;
    }

    const rawUrl = p.Link_Foto_Profile || p.link_foto_profile || "";
    let finalSrc = placeholderImg;
    if (rawUrl) {
        if (rawUrl.includes('drive.google.com') || rawUrl.includes('googleusercontent.com')) {
            let fileId = "";
            let match = rawUrl.match(/\/d\/([^\/\?]+)/);
            if (match && match[1]) fileId = match[1];
            if (!fileId) {
                match = rawUrl.match(/[?&]id=([^&]+)/);
                if (match && match[1]) fileId = match[1];
            }
            if (fileId) {
                finalSrc = `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
            } else {
                finalSrc = rawUrl;
            }
        } else {
            finalSrc = rawUrl;
        }
    }

    const img = document.getElementById('pImg');
    img.style.transition = 'opacity 0.2s ease';
    img.style.opacity = 0;
    img.src = finalSrc;
    img.onload = () => { img.style.opacity = 1; };
    img.onerror = () => {
        img.onerror = null;
        img.src = placeholderImg;
        img.style.opacity = 1;
    };

    updateWatermarkWilayah(p.Wilayah || p.wilayah || "UPT");

    document.getElementById('pName').innerText = p.Nama || p.nama;
    document.getElementById('pJob').innerText = p.Jabatan || p.jabatan || "STAFF";
    document.getElementById('pWil').innerHTML = `<i data-lucide="map-pin" size="14" style="vertical-align:middle"></i> WILAYAH: ${(p.Wilayah || p.wilayah || "UPT").trim()}`;
    lucide.createIcons();
}

function updateWatermarkWilayah(wilayah) {
    const el = document.getElementById('wmWilayah');
    if (el) {
        el.textContent = wilayah || 'WILAYAH';
    }
}

function navU(d) {
    if (!dbF.length) return;
    uIdx = (uIdx + d + dbF.length) % dbF.length;
    upUI();
}

// ============================================================
// 18. VOICE RECOGNITION
// ============================================================
function startVoice(id, btn) {
    const S = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!S) return;
    const r = new S();
    r.lang = 'id-ID';
    r.onstart = () => {
        btn.classList.add('active');
        haptic();
    };
    r.onresult = e => {
        const t = e.results[0][0].transcript;
        if (id === 'searchInput') {
            document.getElementById('searchInput').value = t;
            applyFilters();
        } else {
            const n = document.getElementById('notes');
            n.value += (n.value ? ' ' : '') + t;
            onNotesInput();
        }
    };
    r.onend = () => btn.classList.remove('active');
    r.start();
}

// ============================================================
// 19. SET STATUS
// ============================================================
function setS(el, st) {
    if (uPos.lat === 0 || !uPos.lat) {
        showToast("GPS Hilang", "Mengambil lokasi ulang...", "warning");
        upLoc();
        setTimeout(() => {
            if (uPos.lat === 0) {
                showToast("GPS Gagal", "Silakan tunggu GPS terkunci.", "error");
            }
        }, 3000);
        return;
    }

    const g = validasiGeoFencing();
    const outside = g.status === 'OUT_ZONE';
    const exc = ['IZIN', 'SAKIT', 'DINAS', 'QUICK RESPONSE'].includes(st);

    if (outside && !exc) {
        sndError.play();
        showToast("Ditolak", `Anda berada di luar area geo-fencing (${g.jarak}m). Silakan mendekat atau gunakan status khusus.`, "error");
        const info = document.getElementById('statusInfo');
        info.style.display = 'block';
        info.style.color = "var(--danger)";
        info.style.borderLeftColor = "var(--danger)";
        info.innerHTML =
            `<div class="info-title"><i data-lucide="alert-triangle" size="18"></i><span>⚠️ GEO-FENCING DITOLAK</span></div><div class="info-body">Anda berada <strong>${g.jarak}m</strong> dari ${g.nama} (radius: ${g.radius}m). Silakan mendekat atau gunakan Status Khusus.</div>`;
        lucide.createIcons();
        return;
    }

    haptic();
    const p = activePegawai || dbF[uIdx];
    const pid = p.ID || p.id;
    const timeVal = getJakartaTimeVal();
    const jamPulangLimit = parseTime(appConfig.jPulang);

    if (st === 'HADIR') {
        if (checkAtt(pid, 'HADIR')) {
            sndError.play();
            showToast("Sudah Absen", "Anda sudah melakukan presensi HADIR hari ini.", "error");
            return;
        }
    } else if (st === 'PULANG') {
        if (checkAtt(pid, 'PULANG')) {
            sndError.play();
            showToast("Sudah Absen", "Anda sudah melakukan presensi PULANG hari ini.", "error");
            return;
        }
        if (!checkAtt(pid, 'HADIR')) {
            showToast("Urutan Salah", "Anda harus melakukan absen HADIR terlebih dahulu sebelum PULANG.", "error");
            return;
        }
    } else if (st === 'QUICK RESPONSE') {
        const isMorning = timeVal < jamPulangLimit;
        if (isMorning) {
            if (checkAtt(pid, 'HADIR')) {
                sndError.play();
                showToast("Sudah Absen", "Anda sudah melakukan presensi HADIR / QR HADIR hari ini.", "error");
                return;
            }
        } else {
            if (checkAtt(pid, 'PULANG')) {
                sndError.play();
                showToast("Sudah Absen", "Anda sudah melakukan presensi PULANG / QR PULANG hari ini.", "error");
                return;
            }
            if (!checkAtt(pid, 'HADIR')) {
                sndError.play();
                showToast("Belum Absen Masuk", "Anda belum absen HADIR / QR HADIR hari ini. Tidak bisa melakukan QR Pulang.", "error");
                return;
            }
        }
    }

    document.getElementById('notes').value = '';
    updateNotesCounter();
    sB64 = null;
    kB64 = null;
    suratB64 = null;
    document.getElementById('sImg').style.display = 'none';
    document.getElementById('kImg').style.display = 'none';
    document.getElementById('sPh').style.display = 'block';
    document.getElementById('kPh').style.display = 'block';

    document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    selectedStatus = st;
    updateStatusInfo(st);
    updateAttendanceStatusIndicator();
    updateWorkflow();
    saveAutoRecovery();

    console.log("📍 Status di-set:", st, "GPS:", uPos.lat, uPos.lng);
}

// ============================================================
// 20. REFRESH PRESENSI DATA
// ============================================================
async function refreshPresensiData() {
    try {
        console.log('🔄 Refreshing presensi data...');
        
        if (!navigator.onLine) {
            console.warn('⚠️ Offline, tidak bisa refresh data');
            return false;
        }
        
        const url = getApiUrl('getTodayPresensi');
        console.log('📡 Fetching:', url);
        
        const r = await fetchWithTimeout(url, { 
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        }, 15000);
        
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}`);
        }
        
        const data = await r.json();
        console.log('📊 Data dari server:', data);
        
        if (data.status === 'success') {
            dbP = data.data || [];
            console.info("✅ dbP refreshed:", dbP.length, "records");
            return true;
        }
        return false;
    } catch (e) {
        console.warn("⚠️ Gagal refresh dbP:", e.message);
        return false;
    }
}

// ============================================================
// 21. SUBMIT PRESENSI
// ============================================================
async function submitWithRetry(attempt = 1, trxId = null) {
    const btn = document.getElementById('btnSubmitPresensi');
    const n = document.getElementById('notes').value.trim();

    if (!selectedStatus) return showToast("Peringatan", "Pilih status presensi!", "warning");
    if (n.length < 5) return showToast("Peringatan", "Keterangan minimal 5 karakter!", "warning");
    if (!sB64) return showToast("Data Belum Lengkap", "Foto selfie wajib!", "warning");
    if (!kB64) return showToast("Data Belum Lengkap", "Foto lokasi wajib!", "warning");

    if (uPos.lat === 0 || !uPos.lat) {
        showToast("GPS Belum Siap", "Mengambil lokasi ulang...", "warning");
        await new Promise((resolve) => {
            upLoc();
            setTimeout(resolve, 3000);
        });
        if (uPos.lat === 0) {
            return showToast("GPS Gagal", "Tidak dapat mengambil lokasi. Coba lagi.", "error");
        }
    }

    const needSurat = ['IZIN', 'SAKIT', 'DINAS'].includes(selectedStatus);
    if (needSurat && !suratB64) {
        const userChoice = await showSuratModal();
        if (userChoice === 'attach') {
            uploadSurat();
            return;
        }
    }

    const statusMapping = {
        'HADIR': 'hadir',
        'PULANG': 'pulang',
        'IZIN': 'izin',
        'SAKIT': 'sakit',
        'DINAS': 'dinas',
        'QUICK RESPONSE': 'quick response'
    };
    const payloadStatus = statusMapping[selectedStatus] || selectedStatus.toLowerCase();

    btn.disabled = true;
    setLoading(true, attempt > 1 ? `Mencoba ulang ${attempt - 1}/3...` : "Mengunggah Data...");
    const p = activePegawai;

    if (!trxId) {
        trxId = `${p.ID}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    const payload = {
        action: 'presensi',
        idPegawai: p.ID,
        nama: p.Nama,
        status: payloadStatus,
        selfie: sB64,
        workPhoto: kB64,
        surat: suratB64 || '-',
        keterangan: n,
        gps: `${uPos.lat},${uPos.lng}`,
        wilayah: p.Wilayah || "-",
        trxId: trxId
    };

    try {
        const r = await fetchWithTimeout(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }, 25000);

        const j = await r.json();

        if (j.status === 'success') {
            setLoading(false);
            btn.disabled = false;
            sndSuccess.play().catch(() => {});
            showToast("Presensi Berhasil!", "Data tersinkronisasi.", "success");

            await refreshPresensiData();

            const btnHadir = document.getElementById('btnHadirMain');
            const btnPulang = document.getElementById('btnPulangMain');

            if (j.statusFix) {
                const statusLower = j.statusFix.toLowerCase();
                if (statusLower.includes('pulang') || statusLower.includes('qr pulang')) {
                    btnPulang.classList.add('btn-done');
                    btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
                    btnPulang.style.pointerEvents = 'none';
                } else {
                    btnHadir.classList.add('btn-done');
                    btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
                    btnHadir.style.pointerEvents = 'none';
                }
            }
            lucide.createIcons();

            document.getElementById('notes').value = '';
            updateNotesCounter();
            clearHeavyData();
            selectedStatus = '';
            document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));
            document.getElementById('statusBadge').classList.remove('show');
            document.getElementById('statusInfo').style.display = 'none';
            document.getElementById('attendanceStatusIndicator').innerHTML = '';
            updateWorkflow();

            btnHadir.style.backgroundColor = '';
            btnHadir.style.color = '';
            btnHadir.style.borderColor = '';
            btnHadir.style.boxShadow = '';
            btnPulang.style.backgroundColor = '';
            btnPulang.style.color = '';
            btnPulang.style.borderColor = '';
            btnPulang.style.boxShadow = '';

            sessionStorage.removeItem('pusda_recovery');

            setTimeout(() => {
                const peg = activePegawai || dbF[uIdx];
                if (peg) {
                    const params = new URLSearchParams({
                        id: peg.ID || peg.id,
                        nama: peg.Nama || peg.nama,
                        jabatan: peg.Jabatan || 'PPA',
                        wilayah: peg.Wilayah || 'UPT',
                        foto: peg.Link_Foto_Profile || '',
                        status: 'success',
                        msg: 'Presensi ' + j.statusFix + ' berhasil! Nilai: ' + j.nilai + ' pts'
                    });
                    window.open('profile_raport.html?' + params.toString(), '_blank');
                }
            }, 1500);

        } else if (j.status === 'error') {
            setLoading(false);
            btn.disabled = false;

            if (j.message.includes('duplikat') || j.message.includes('sudah') || j.message.includes('tercatat')) {
                sndSuccess.play().catch(() => {});
                showToast("Sudah Tercatat", "Data sebelumnya sudah masuk.", "success");
                await refreshPresensiData();
                clearHeavyData();
            } else {
                sndError.play().catch(() => {});
                showToast("Ditolak", j.message || "Gagal menyimpan data.", "error");
            }
        } else {
            throw new Error(j.message || "Format respons tidak dikenal");
        }

    } catch (e) {
        console.error("❌ Submit error:", e);
        if (attempt < 4) {
            showToastOnce('submit_retry', "Menunggu Antrian...", "Mencoba ulang...", "warning");
            setTimeout(() => submitWithRetry(attempt + 1, trxId), 3000);
        } else {
            sndError.play().catch(() => {});
            showToast("Gagal Mengirim", "Koneksi gagal. Coba lagi nanti.", "error");
            btn.disabled = false;
            setLoading(false);
        }
    }
}

// ============================================================
// 22. OPEN / CLOSE FORM
// ============================================================
async function openForm() {
    if (!dbF.length || isFormLoading) return;
    isFormLoading = true;
    activePegawai = dbF[uIdx];
    const targetIdx = uIdx;
    const p = activePegawai;
    const targetId = p.ID || p.id;

    document.getElementById('stepSelector').style.display = 'none';
    document.getElementById('stepForm').style.display = 'flex';

    document.getElementById('statusInfo').style.display = 'none';
    document.getElementById('statusBadge').classList.remove('show');
    document.getElementById('attendanceStatusIndicator').innerHTML = '';
    selectedStatus = '';
    document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));
    document.getElementById('specialStatusGrid').classList.remove('show');
    document.getElementById('notes').value = '';
    updateNotesCounter();
    sB64 = null;
    kB64 = null;
    suratB64 = null;
    document.getElementById('sImg').style.display = 'none';
    document.getElementById('kImg').style.display = 'none';
    document.getElementById('sPh').style.display = 'block';
    document.getElementById('kPh').style.display = 'block';
    lucide.createIcons();

    const rawUrl = p.Link_Foto_Profile || p.link_foto_profile || "";
    let finalSrc = placeholderImg;
    if (rawUrl) {
        if (rawUrl.includes('drive.google.com') || rawUrl.includes('googleusercontent.com')) {
            let fileId = "";
            let match = rawUrl.match(/\/d\/([^\/\?]+)/);
            if (match && match[1]) fileId = match[1];
            if (!fileId) {
                match = rawUrl.match(/[?&]id=([^&]+)/);
                if (match && match[1]) fileId = match[1];
            }
            if (fileId) {
                finalSrc = `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
            } else {
                finalSrc = rawUrl;
            }
        } else {
            finalSrc = rawUrl;
        }
    }
    document.getElementById('formHeroImg').src = finalSrc;

    document.getElementById('formName').innerText = p.Nama || p.nama;
    document.getElementById('formJobWil').innerHTML =
        `<i data-lucide="briefcase" size="14" style="vertical-align:middle"></i> ${p.Jabatan || "PPA"} | <i data-lucide="map-pin" size="14" style="vertical-align:middle"></i> ${p.Wilayah || "UPT"}`;
    lucide.createIcons();

    const btnHadir = document.getElementById('btnHadirMain');
    const btnPulang = document.getElementById('btnPulangMain');
    btnHadir.style.pointerEvents = 'none';
    btnHadir.style.opacity = '0.5';
    btnPulang.style.pointerEvents = 'none';
    btnPulang.style.opacity = '0.5';

    await refreshPresensiData();

    const isFormStillOpen = document.getElementById('stepForm').style.display === 'flex';
    const currentPegawaiId = dbF[uIdx]?.ID || dbF[uIdx]?.id;
    if (!isFormStillOpen || currentPegawaiId !== targetId) {
        isFormLoading = false;
        return;
    }

    btnHadir.classList.remove('btn-done', 'active');
    btnHadir.innerHTML = '<i data-lucide="sun" size="28"></i><span>HADIR</span>';
    btnHadir.style.pointerEvents = '';
    btnHadir.style.opacity = '';
    btnHadir.style.backgroundColor = '';
    btnHadir.style.color = '';
    btnHadir.style.borderColor = '';
    btnHadir.style.boxShadow = '';

    btnPulang.classList.remove('btn-done', 'active');
    btnPulang.innerHTML = '<i data-lucide="moon" size="28"></i><span>PULANG</span>';
    btnPulang.style.pointerEvents = '';
    btnPulang.style.opacity = '';
    btnPulang.style.backgroundColor = '';
    btnPulang.style.color = '';
    btnPulang.style.borderColor = '';
    btnPulang.style.boxShadow = '';

    const pid = p.ID || p.id;
    if (checkAtt(pid, 'HADIR')) {
        btnHadir.classList.add('btn-done');
        btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
        btnHadir.style.pointerEvents = 'none';
    }
    if (checkAtt(pid, 'PULANG')) {
        btnPulang.classList.add('btn-done');
        btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
        btnPulang.style.pointerEvents = 'none';
    }
    lucide.createIcons();

    updateNotesCounter();
    updateWorkflow();
    setTimeout(() => {
        initMap();
        upLoc();
        loadAutoRecovery();
        updateButtonColors();
    }, 300);
    isFormLoading = false;
}

function closeForm() {
    document.getElementById('stepSelector').style.display = 'flex';
    document.getElementById('stepForm').style.display = 'none';
    isFormLoading = false;
    activePegawai = null;
}

function onNotesInput() {
    updateNotesCounter();
    updateWorkflow();
    saveAutoRecovery();
}

// ============================================================
// 23. PROFILE RAPORT NAVIGATION
// ============================================================
function goToProfileRaport() {
    const p = activePegawai || dbF[uIdx];
    if (!p) {
        showToast('Peringatan', 'Pilih pegawai terlebih dahulu.', 'warning');
        return;
    }
    
    const params = new URLSearchParams({
        id: p.ID || p.id,
        nama: p.Nama || p.nama,
        jabatan: p.Jabatan || 'PPA',
        wilayah: p.Wilayah || 'UPT',
        foto: p.Link_Foto_Profile || ''
    });
    
    window.open('profile_raport.html?' + params.toString(), '_blank');
}

// ============================================================
// 24. MANUAL REFRESH STATUS
// ============================================================
async function manualRefreshStatus() {
    const btn = document.querySelector('.btn-refresh-status');
    if (btn) {
        btn.innerHTML = '<i data-lucide="refresh-cw" size="18" style="animation:spin 0.8s linear infinite"></i>';
        lucide.createIcons();
    }
    
    showToast('Memperbarui', 'Mengambil data presensi terbaru...', 'info');
    
    try {
        const success = await refreshPresensiData();
        if (success) {
            updateUIAfterRefresh();
            showToast('Berhasil', 'Status presensi diperbarui.', 'success');
        } else {
            showToast('Peringatan', 'Data presensi kosong atau gagal diambil.', 'warning');
        }
    } catch (e) {
        console.error('❌ Refresh error:', e);
        showToast('Gagal', 'Gagal memperbarui status. Periksa koneksi.', 'error');
    }
    
    if (btn) {
        btn.innerHTML = '<i data-lucide="refresh-cw" size="18"></i>';
        lucide.createIcons();
    }
}

// ============================================================
// 25. FORCE UPDATE STATUS (UNTUK DEBUG)
// ============================================================
async function forceUpdateStatus() {
    console.log('🔄 Force update status...');
    
    const success = await refreshPresensiData();
    
    if (success) {
        updateUIAfterRefresh();
        showToast('Status Diperbarui', 'Status presensi berhasil diperbarui.', 'success');
        console.log('✅ Status updated successfully');
    } else {
        showToast('Gagal', 'Gagal memperbarui status. Coba lagi.', 'error');
        console.log('❌ Status update failed');
    }
}

// ============================================================
// 26. UPDATE UI AFTER REFRESH
// ============================================================
function updateUIAfterRefresh() {
    console.log('🔄 updateUIAfterRefresh() dipanggil');
    
    const isFormOpen = document.getElementById('stepForm').style.display === 'flex';
    if (!isFormOpen) {
        console.log('⚠️ Form tidak terbuka, skip update UI');
        return;
    }
    
    const p = activePegawai || dbF[uIdx];
    if (!p) {
        console.log('⚠️ Tidak ada pegawai aktif');
        return;
    }
    
    const pid = p.ID || p.id;
    console.log('🔍 Cek status untuk pegawai:', pid);
    console.log('📊 dbP saat ini:', dbP.length, 'records');
    
    const btnHadir = document.getElementById('btnHadirMain');
    const btnPulang = document.getElementById('btnPulangMain');
    
    if (!btnHadir || !btnPulang) {
        console.log('⚠️ Tombol tidak ditemukan');
        return;
    }
    
    const hadirStatus = checkAtt(pid, 'HADIR');
    const pulangStatus = checkAtt(pid, 'PULANG');
    
    console.log('✅ Status HADIR:', hadirStatus);
    console.log('✅ Status PULANG:', pulangStatus);
    
    btnHadir.classList.remove('active', 'btn-done');
    btnPulang.classList.remove('active', 'btn-done');
    
    btnHadir.innerHTML = '<i data-lucide="sun" size="28"></i><span>HADIR</span>';
    btnHadir.style.pointerEvents = '';
    btnHadir.style.opacity = '';
    btnHadir.style.backgroundColor = '';
    btnHadir.style.color = '';
    btnHadir.style.borderColor = '';
    btnHadir.style.boxShadow = '';
    
    btnPulang.innerHTML = '<i data-lucide="moon" size="28"></i><span>PULANG</span>';
    btnPulang.style.pointerEvents = '';
    btnPulang.style.opacity = '';
    btnPulang.style.backgroundColor = '';
    btnPulang.style.color = '';
    btnPulang.style.borderColor = '';
    btnPulang.style.boxShadow = '';
    
    if (hadirStatus) {
        btnHadir.classList.add('btn-done');
        btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
        btnHadir.style.pointerEvents = 'none';
        console.log('✅ Tombol HADIR diubah menjadi SUDAH HADIR');
    }
    
    if (pulangStatus) {
        btnPulang.classList.add('btn-done');
        btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
        btnPulang.style.pointerEvents = 'none';
        console.log('✅ Tombol PULANG diubah menjadi SUDAH PULANG');
    }
    
    updateAttendanceStatusIndicator();
    lucide.createIcons();
    
    console.log('✅ UI update selesai');
}

// ============================================================
// 27. DETEKSI KEMBALI DARI PROFILE RAPORT
// ============================================================
function detectReturnFromProfile() {
    const justReturned = sessionStorage.getItem('return_from_profile');
    console.log('🔍 Detect return from profile, flag:', justReturned);
    
    if (justReturned === 'true') {
        console.log('🔄 Detected return from profile_raport, refreshing data...');
        sessionStorage.removeItem('return_from_profile');
        
        refreshPresensiData().then((success) => {
            console.log('📊 Refresh result:', success);
            if (success) {
                updateUIAfterRefresh();
                showToast('Data Diperbarui', 'Status presensi telah diperbarui.', 'success');
            } else {
                showToast('Peringatan', 'Gagal refresh data, coba manual.', 'warning');
            }
        }).catch((err) => {
            console.warn('⚠️ Gagal refresh data saat kembali dari profile:', err);
        });
    }
}

// ============================================================
// 28. CAMERA FUNCTIONS
// ============================================================
async function triggerCam(type) {
    const aiReady = await ensureFaceApiLoaded();
    if (aiReady && !isLandmarkReady) await loadFaceModels();
    const notes = document.getElementById('notes').value.trim();
    if (!selectedStatus) return showToast("Peringatan", "Silakan pilih status presensi terlebih dahulu!", "warning");
    if (notes.length < 5) return showToast("Peringatan", "Isi keterangan minimal 5 karakter!", "warning");
    cType = type;
    stopCurrentStream();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        triggerFallbackCamera(type);
        return;
    }
    const peg = activePegawai || dbF[uIdx];
    document.getElementById('scanPegawai').innerText = (peg.Nama || peg.nama || "STAFF").toUpperCase();
    document.getElementById('scanLogo').src = GITHUB_LOGO_URL;
    if (type === 'selfie') {
        document.getElementById('scanHeaderTitle').innerText = "SECURE FACE VERIFICATION";
        document.getElementById('scanHeaderSub').innerText = DeviceProfile.config.enableFaceAPI ? "UPT PUSDA • Face Detection Active" : "UPT PUSDA • Basic Mode";
        document.getElementById('scanInstrText').innerText = DeviceProfile.config.enableFaceAPI ? "Posisikan wajah di dalam frame" : "Mode Hemat: Arahkan wajah ke frame";
        document.getElementById('scanStatus').style.display = 'flex';
        if (!DeviceProfile.config.enableFaceAPI) {
            document.getElementById('scanStatusText').innerText = 'BASIC MODE';
            document.getElementById('scanStatus').classList.remove('detected');
        }
    } else {
        document.getElementById('scanHeaderTitle').innerText = "LOCATION DOCUMENTATION";
        document.getElementById('scanHeaderSub').innerText = "UPT PUSDA • Work Site Photo";
        document.getElementById('scanInstrText').innerText = "Arahkan kamera ke lokasi kerja";
        document.getElementById('scanStatus').style.display = 'none';
    }
    lucide.createIcons();
    const video = document.getElementById('vStream');
    video.setAttribute('playsinline', 'true');
    if (type === 'selfie') video.classList.add('mirror');
    else video.classList.remove('mirror');
    const { width: idealW, height: idealH } = DeviceProfile.config.videoConstraints;
    const constraints = type === 'selfie' ?
        { facingMode: "user", width: { ideal: idealW }, height: { ideal: idealH } } :
        { facingMode: "environment", width: { ideal: idealW }, height: { ideal: idealH } };
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
        currentStream = stream;
        video.srcObject = stream;
        document.getElementById('cameraUI').style.display = 'flex';
        video.onloadedmetadata = () => {
            video.play().then(() => {
                setTimeout(() => {
                    if (type === 'selfie' && isLandmarkReady) startSelfieOverlay();
                    else startWorkOverlay();
                }, 400);
            }).catch(e => {
                showToast("Error Kamera", "Gagal memutar video kamera.", "error");
                stopCam();
            });
        };
    } catch (err) {
        if (err.name === 'OverconstrainedError' || err.name === 'NotSupportedError' || err.name === 'NotFoundError') {
            try {
                const s2 = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                currentStream = s2;
                video.srcObject = s2;
                document.getElementById('cameraUI').style.display = 'flex';
                video.onloadedmetadata = () => {
                    video.play().then(() => {
                        setTimeout(() => {
                            if (type === 'selfie' && isLandmarkReady) startSelfieOverlay();
                            else startWorkOverlay();
                        }, 400);
                    }).catch(e => {
                        triggerFallbackCamera(type);
                    });
                };
                return;
            } catch (e2) {
                triggerFallbackCamera(type);
            }
        }
        if (err.name === 'NotAllowedError') {
            pendingCamType = type;
            showPermissionModal('camera');
        } else {
            triggerFallbackCamera(type);
        }
    }
}

function stopCam() {
    stopCurrentStream();
    const st = document.getElementById('scanStatus');
    if (st) st.classList.remove('detected');
    const stTxt = document.getElementById('scanStatusText');
    if (stTxt) stTxt.innerText = 'SCANNING';
    document.getElementById('cameraUI').style.display = 'none';
}

function stopCurrentStream() {
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
    }
    const v = document.getElementById('vStream');
    if (v && v.srcObject) v.srcObject = null;
    if (v) v.classList.remove('mirror');
    stopRenderLoop();
    if (detectIntervalId) {
        clearInterval(detectIntervalId);
        detectIntervalId = null;
    }
    if (_activeResizeHandler) {
        window.removeEventListener('resize', _activeResizeHandler);
        _activeResizeHandler = null;
    }
    const c = document.getElementById('faceOverlay');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    lastGoodDetection = null;
    faceDetected = false;
    detectionStableCount = 0;
    laserY = 0;
    laserDirection = 1;
    _canvasW = 0;
    _canvasH = 0;
}

function triggerFallbackCamera(type) {
    const inp = document.getElementById('fallbackCameraInput');
    inp.setAttribute('capture', type === 'selfie' ? 'user' : 'environment');
    inp.value = '';
    pendingCamType = type;
    const h = e => {
        const f = e.target.files[0];
        if (!f) return;
        if (!f.type.startsWith('image/')) {
            showToast("Format Salah", "File harus berupa gambar", "error");
            return;
        }
        const r = new FileReader();
        r.onload = ev => processFallbackImage(ev.target.result, pendingCamType);
        r.readAsDataURL(f);
        inp.removeEventListener('change', h);
    };
    inp.addEventListener('change', h);
    inp.click();
}

function triggerGallery() {
    if (!selectedStatus) return showToast("Peringatan", "Silakan pilih status presensi terlebih dahulu!", "warning");
    if (document.getElementById('notes').value.trim().length < 5) return showToast("Peringatan", "Isi keterangan minimal 5 karakter!", "warning");
    const inp = document.getElementById('galleryInput');
    inp.value = '';
    const handler = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast("Format Salah", "File harus berupa gambar", "error");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showToast("Ukuran Melebihi Batas", "Maksimal 10MB", "error");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => processGalleryImage(ev.target.result);
        reader.readAsDataURL(file);
        inp.removeEventListener('change', handler);
    };
    inp.addEventListener('change', handler);
    inp.click();
}

function uploadSurat() {
    const inp = document.getElementById('suratInput');
    inp.value = '';
    const handler = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast("Format Salah", "File harus berupa gambar (JPG/PNG)", "error");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast("Ukuran Melebihi Batas", "Maksimal 5MB", "error");
            return;
        }
        setLoading(true, "Mengompresi surat...");
        try {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const compressed = await compressImage(ev.target.result, { maxWidth: 800, maxHeight: 800, quality: 0.5 });
                    suratB64 = compressed;
                    setLoading(false);
                    showToast("Berhasil", `Surat terkompresi (${Math.round((compressed.length * 0.75) / 1024)}KB)`, "success");
                    saveAutoRecovery();
                } catch (err) {
                    setLoading(false);
                    showToast("Gagal", "Gagal mengompresi surat", "error");
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            setLoading(false);
            showToast("Error", err.message, "error");
        }
        inp.removeEventListener('change', handler);
    };
    inp.addEventListener('change', handler);
    inp.click();
}

// ============================================================
// 29. IMAGE PROCESSING
// ============================================================
async function compressImage(base64, options = {}) {
    const { maxWidth = 1024, maxHeight = 1024, quality = 0.5, outputWidth = null, outputHeight = null } = options;
    return new Promise((resolve, reject) => {
        const img = new Image();
        const timeoutId = setTimeout(() => reject(new Error('Gagal memuat gambar (Timeout)')), 10000);
        img.onload = () => {
            clearTimeout(timeoutId);
            const canvas = document.createElement('canvas');
            let w = img.width,
                h = img.height;
            if (outputWidth && outputHeight) {
                canvas.width = outputWidth;
                canvas.height = outputHeight;
                const targetRatio = outputWidth / outputHeight,
                    sourceRatio = w / h;
                let sx, sy, sw, sh;
                if (sourceRatio > targetRatio) {
                    sh = h;
                    sw = h * targetRatio;
                    sx = (w - sw) / 2;
                    sy = 0;
                } else {
                    sw = w;
                    sh = w / targetRatio;
                    sx = 0;
                    sy = (h - sh) / 2;
                }
                canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
            } else {
                if (w > maxWidth) {
                    h = h * (maxWidth / w);
                    w = maxWidth;
                }
                if (h > maxHeight) {
                    w = w * (maxHeight / h);
                    h = maxHeight;
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            }
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            img.onload = null;
            img.onerror = null;
            img.src = '';
            resolve(dataUrl);
        };
        img.onerror = () => {
            clearTimeout(timeoutId);
            reject(new Error('Gagal memuat gambar'));
        };
        img.src = base64;
    });
}

async function processGalleryImage(url) {
    const img = new Image();
    img.onload = async () => {
        setLoading(true, "Mengompresi foto...");
        try {
            const compressed = await compressImage(url, { outputWidth: 600, outputHeight: 800, quality: 0.4 });
            const c = document.createElement('canvas');
            c.width = 600;
            c.height = 800;
            const tempImg = new Image();
            tempImg.onload = () => {
                c.getContext('2d').drawImage(tempImg, 0, 0, 600, 800);
                addWatermark(c);
                const d = c.toDataURL('image/jpeg', 0.4);
                document.getElementById('kImg').src = d;
                document.getElementById('kImg').style.display = 'block';
                document.getElementById('kPh').style.display = 'none';
                kB64 = d;
                setLoading(false);
                sndShutter.play();
                showToast("Berhasil", `Foto lokasi tersimpan (${Math.round((d.length * 0.75) / 1024)}KB)`, "success");
                saveAutoRecovery();
                img.onload = null;
                img.src = '';
                tempImg.onload = null;
                tempImg.src = '';
            };
            tempImg.src = compressed;
        } catch (err) {
            setLoading(false);
            showToast("Gagal", "Gagal mengompresi foto", "error");
        }
    };
    img.src = url;
}

function processFallbackImage(url, type) {
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        const [w, h] = type === 'selfie' ? DeviceProfile.config.selfieResolution : DeviceProfile.config.kerjaResolution;
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (type === 'selfie') {
            ctx.translate(c.width, 0);
            ctx.scale(-1, 1);
        }
        const tr = c.width / c.height,
            sr = img.width / img.height;
        let sx, sy, sw, sh;
        if (sr > tr) {
            sh = img.height;
            sw = sh * tr;
            sx = (img.width - sw) / 2;
            sy = 0;
        } else {
            sw = img.width;
            sh = sw / tr;
            sx = 0;
            sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (type === 'selfie' && isFaceApiLoaded) {
            faceapi.detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: .3 })).then(d => {
                if (!d) {
                    sndError.play();
                    showToast("Gagal Deteksi", "Wajah tidak terdeteksi!", "error");
                    return;
                }
                addWatermark(c);
                savePhoto(c, type);
            }).catch(() => {
                addWatermark(c);
                savePhoto(c, type);
            });
        } else {
            addWatermark(c);
            savePhoto(c, type);
        }
        img.onload = null;
        img.onerror = null;
        img.src = '';
    };
    img.src = url;
}

function savePhoto(c, type) {
    const d = c.toDataURL('image/jpeg', DeviceProfile.config.jpegQuality);
    sndShutter.play();
    if (type === 'selfie') {
        document.getElementById('sImg').src = d;
        document.getElementById('sImg').style.display = 'block';
        document.getElementById('sPh').style.display = 'none';
        sB64 = d;
    } else {
        document.getElementById('kImg').src = d;
        document.getElementById('kImg').style.display = 'block';
        document.getElementById('kPh').style.display = 'none';
        kB64 = d;
    }
    showToast("Berhasil", "Foto berhasil diambil dan disimpan", "success");
    saveAutoRecovery();
}

// ============================================================
// 30. WATERMARK ON PHOTO
// ============================================================
function addWatermark(c) {
    const ctx = c.getContext('2d');
    const W = c.width,
        H = c.height;
    const baseSize = Math.min(W, H);
    const margin = baseSize * 0.04;
    const nameFontSize = Math.round(baseSize * 0.032),
        jobFontSize = Math.round(baseSize * 0.022),
        infoFontSize = Math.round(baseSize * 0.020),
        footerFontSize = Math.round(baseSize * 0.018),
        iconSize = Math.round(baseSize * 0.025),
        logoSize = Math.round(baseSize * 0.09);
    const logoX = margin,
        logoY = H - margin - logoSize;
    if (logoCache.complete && logoCache.naturalWidth > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.strokeStyle = 'rgba(45,212,191,0.5)';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
        ctx.beginPath();
        ctx.roundRect(logoX, logoY, logoSize, logoSize, logoSize * 0.18);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.restore();
        const logoInnerPad = logoSize * 0.12;
        ctx.drawImage(logoCache, logoX + logoInnerPad, logoY + logoInnerPad, logoSize - logoInnerPad * 2, logoSize - logoInnerPad * 2);
    }
    const textStart = logoX + logoSize + baseSize * 0.02,
        textAreaWidth = W - textStart - margin;
    const p = activePegawai || dbF[uIdx];
    const nama = (p.Nama || p.nama || "STAFF").toUpperCase(),
        jabatan = (p.Jabatan || "PPA").toUpperCase();
    const shadowConfig = { shadowColor: 'rgba(0,0,0,0.85)', shadowBlur: 8, shadowOffsetX: 2, shadowOffsetY: 2 },
        line1Y = logoY + logoSize * 0.28;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.shadowColor = shadowConfig.shadowColor;
    ctx.shadowBlur = shadowConfig.shadowBlur;
    ctx.shadowOffsetX = shadowConfig.shadowOffsetX;
    ctx.shadowOffsetY = shadowConfig.shadowOffsetY;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${nameFontSize}px 'Plus Jakarta Sans'`;
    let displayName = nama,
        metrics = ctx.measureText(displayName + ' • ' + jabatan);
    if (metrics.width > textAreaWidth) {
        const ratio = textAreaWidth / metrics.width;
        displayName = nama.substring(0, Math.floor(nama.length * ratio * 0.9)) + '...';
    }
    ctx.fillText(displayName, textStart, line1Y);
    const nameWidth = ctx.measureText(displayName).width;
    ctx.fillStyle = '#2dd4bf';
    ctx.font = `600 ${jobFontSize}px 'Plus Jakarta Sans'`;
    ctx.fillText(' • ' + jabatan, textStart + nameWidth + 6, line1Y);
    ctx.restore();
    const line2Y = logoY + logoSize * 0.58,
        iconColor = '#2dd4bf',
        textColor = '#ffffff';
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.shadowColor = shadowConfig.shadowColor;
    ctx.shadowBlur = shadowConfig.shadowBlur;
    ctx.shadowOffsetX = shadowConfig.shadowOffsetX;
    ctx.shadowOffsetY = shadowConfig.shadowOffsetY;
    drawMapPinIcon(ctx, textStart, line2Y - iconSize / 2, iconSize, iconColor);
    const gpsStr = `${uPos.lat.toFixed(4)}, ${uPos.lng.toFixed(4)}`;
    ctx.fillStyle = textColor;
    ctx.font = `500 ${infoFontSize}px 'JetBrains Mono'`;
    ctx.fillText(gpsStr, textStart + iconSize + 8, line2Y);
    const timeX = textStart + iconSize + 8 + ctx.measureText(gpsStr).width + 20;
    if (timeX + iconSize + 80 < W - margin) {
        drawClockIcon(ctx, timeX, line2Y - iconSize / 2, iconSize, iconColor);
        const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        ctx.fillStyle = textColor;
        ctx.fillText(timeStr, timeX + iconSize + 8, line2Y);
        const dateX = timeX + iconSize + 8 + ctx.measureText(timeStr).width + 20;
        if (dateX + iconSize + 100 < W - margin) {
            drawCalendarIcon(ctx, dateX, line2Y - iconSize / 2, iconSize, iconColor);
            const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            ctx.fillStyle = textColor;
            ctx.fillText(dateStr, dateX + iconSize + 8, line2Y);
        }
    }
    ctx.restore();
    const line3Y = logoY + logoSize * 0.88;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.shadowColor = shadowConfig.shadowColor;
    ctx.shadowBlur = shadowConfig.shadowBlur;
    ctx.shadowOffsetX = shadowConfig.shadowOffsetX;
    ctx.shadowOffsetY = shadowConfig.shadowOffsetY;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 ${footerFontSize}px 'Plus Jakarta Sans'`;
    ctx.fillText('UPT PUSDA WS BONDOYUDO BARU', textStart, line3Y);
    ctx.restore();
}

function drawMapPinIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = 'transparent';
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = x + size / 2,
        cy = y + size * 0.4,
        r = size * 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.85, cy + r * 0.5);
    ctx.lineTo(cx, y + size * 0.95);
    ctx.lineTo(cx + r * 0.85, cy + r * 0.5);
    ctx.stroke();
    ctx.restore();
}

function drawClockIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = x + size / 2,
        cy = y + size / 2,
        r = size * 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.7);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.6, cy);
    ctx.stroke();
    ctx.restore();
}

function drawCalendarIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.09;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pad = size * 0.12,
        w = size - pad * 2,
        h = size - pad * 2,
        rx = x + pad,
        ry = y + pad;
    ctx.beginPath();
    ctx.roundRect(rx, ry, w, h, size * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx, ry + h * 0.28);
    ctx.lineTo(rx + w, ry + h * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rx + w * 0.28, ry - pad * 0.5);
    ctx.lineTo(rx + w * 0.28, ry + pad * 0.5);
    ctx.moveTo(rx + w * 0.72, ry - pad * 0.5);
    ctx.lineTo(rx + w * 0.72, ry + pad * 0.5);
    ctx.stroke();
    ctx.restore();
}

// ============================================================
// 31. CAMERA OVERLAY FUNCTIONS
// ============================================================
function startSelfieOverlay() {
    const canvas = document.getElementById('faceOverlay'),
        video = document.getElementById('vStream'),
        ctx = canvas.getContext('2d');
    lastGoodDetection = null;
    faceDetected = false;
    detectionStableCount = 0;
    laserY = 0;
    laserDirection = 1;
    _canvasW = 0;
    _canvasH = 0;
    setupCanvas();
    registerResizeHandler();
    if (DeviceProfile.config.enableFaceAPI && DeviceProfile.config.detectInterval > 0) {
        const runDetection = async () => {
            if (!currentStream || video.readyState !== 4 || video.videoWidth === 0) return;
            try {
                const options = new faceapi.TinyFaceDetectorOptions({ inputSize: DeviceProfile.tier === 'high' ? 416 : 320, scoreThreshold: 0.4 });
                const det = await faceapi.detectSingleFace(video, options).withFaceLandmarks();
                if (det) {
                    lastGoodDetection = det;
                    detectionStableCount++;
                    if (detectionStableCount >= STABLE_THRESHOLD && !faceDetected) {
                        faceDetected = true;
                        updateStatusUI(true);
                    }
                } else {
                    if (faceDetected) {
                        faceDetected = false;
                        lastGoodDetection = null;
                        updateStatusUI(false);
                    }
                    detectionStableCount = 0;
                }
            } catch (e) {}
        };
        detectIntervalId = setInterval(runDetection, DeviceProfile.config.detectInterval);
    }
    const renderFrame = () => {
        if (!currentStream) return;
        const W = canvas.width,
            H = canvas.height;
        if (W <= 0 || H <= 0) return;
        ctx.clearRect(0, 0, W, H);
        const mainColor = faceDetected ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)',
            glowColor = faceDetected ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
        drawCornerBrackets(ctx, W, H, mainColor, glowColor);
        drawLaserLine(ctx, W, H, mainColor);
        if (faceDetected && lastGoodDetection) drawFaceWireframe(ctx, lastGoodDetection, W, H, mainColor);
        else drawFaceGuide(ctx, W, H, mainColor, glowColor);
        document.getElementById('scanTime').innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    startRenderLoop(renderFrame);
}

function startWorkOverlay() {
    const canvas = document.getElementById('faceOverlay'),
        ctx = canvas.getContext('2d');
    lastGoodDetection = null;
    faceDetected = false;
    detectionStableCount = 0;
    laserY = 0;
    laserDirection = 1;
    _canvasW = 0;
    _canvasH = 0;
    setupCanvas();
    registerResizeHandler();
    detectIntervalId = null;
    const renderFrame = () => {
        if (!currentStream) return;
        const W = canvas.width,
            H = canvas.height;
        if (W <= 0 || H <= 0) return;
        ctx.clearRect(0, 0, W, H);
        const cyan = 'rgba(34,211,238,0.9)',
            cyanGlow = 'rgba(34,211,238,0.5)';
        drawCornerBrackets(ctx, W, H, cyan, cyanGlow);
        drawLaserLine(ctx, W, H, cyan);
        drawRuleOfThirds(ctx, W, H);
        drawCrosshair(ctx, W, H, cyan);
        drawWorkLabel(ctx, W, H);
        document.getElementById('scanTime').innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    startRenderLoop(renderFrame);
}

async function capturePhoto() {
    const v = document.getElementById('vStream');
    if (v.readyState !== 4 || v.videoWidth === 0) {
        showToast("Peringatan", "Kamera belum siap...", "warning");
        return;
    }
    const c = document.createElement('canvas');
    const [w, h] = cType === 'selfie' ? DeviceProfile.config.selfieResolution : DeviceProfile.config.kerjaResolution;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (cType === 'selfie') {
        ctx.translate(c.width, 0);
        ctx.scale(-1, 1);
    }
    const vW = v.videoWidth,
        vH = v.videoHeight,
        tr = c.width / c.height,
        sr = vW / vH;
    let sx, sy, sw, sh;
    if (sr > tr) {
        sh = vH;
        sw = sh * tr;
        sx = (vW - sw) / 2;
        sy = 0;
    } else {
        sw = vW;
        sh = sw / tr;
        sx = 0;
        sy = (vH - sh) / 2;
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (cType === 'selfie' && isFaceApiLoaded) {
        setLoading(true, "Memindai Wajah...");
        try {
            const d = await faceapi.detectSingleFace(c, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: .3 }));
            if (!d) {
                setLoading(false);
                sndError.play();
                showToast("Gagal Deteksi", "Wajah tidak terdeteksi!", "error");
                return;
            }
            const quality = checkImageQuality(c);
            if (!quality.valid) {
                setLoading(false);
                sndError.play();
                showToast("Kualitas Foto Buruk", quality.msg, "error");
                return;
            }
        } catch (e) {}
        setLoading(false);
    }
    sndShutter.play();
    addWatermark(c);
    const d = c.toDataURL('image/jpeg', DeviceProfile.config.jpegQuality);
    if (cType === 'selfie') {
        document.getElementById('sImg').src = d;
        document.getElementById('sImg').style.display = 'block';
        document.getElementById('sPh').style.display = 'none';
        sB64 = d;
    } else {
        document.getElementById('kImg').src = d;
        document.getElementById('kImg').style.display = 'block';
        document.getElementById('kPh').style.display = 'none';
        kB64 = d;
    }
    saveAutoRecovery();
    stopCam();
}

function checkImageQuality(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width,
        h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let sumBrightness = 0,
        sumBrightnessSq = 0,
        count = 0;
    for (let i = 0; i < data.length; i += 40) {
        const brightness = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        sumBrightness += brightness;
        sumBrightnessSq += brightness * brightness;
        count++;
    }
    const avgBrightness = sumBrightness / count;
    const variance = (sumBrightnessSq / count) - (avgBrightness * avgBrightness);
    if (avgBrightness < 30) return { valid: false, msg: "Foto terlalu gelap. Arahkan ke tempat terang." };
    if (avgBrightness > 235) return { valid: false, msg: "Foto terlalu silau/terang." };
    if (variance < 10) return { valid: false, msg: "Foto terdeteksi blur/kabur. Pegang kamera dengan stabil." };
    return { valid: true };
}

function updateStatusUI(detected) {
    const st = document.getElementById('scanStatus'),
        stTxt = document.getElementById('scanStatusText'),
        instr = document.getElementById('scanInstrText');
    if (detected) {
        st.classList.add('detected');
        stTxt.innerText = 'FACE LOCKED';
        instr.innerText = 'Wajah terdeteksi! Tekan shutter';
        if (instr) instr.style.color = '#10b981';
    } else {
        st.classList.remove('detected');
        stTxt.innerText = 'SCANNING';
        instr.innerText = 'Posisikan wajah di dalam frame';
        if (instr) instr.style.color = '#ffffff';
    }
}

// ============================================================
// 32. CANVAS DRAWING HELPERS
// ============================================================
function drawCornerBrackets(ctx, W, H, color, glowColor) {
    const p = Math.min(W, H) * .08,
        l = Math.min(W, H) * .08;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (DeviceProfile.config.enableShadowBlur) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 5;
    }
    ctx.beginPath();
    ctx.moveTo(p, p + l);
    ctx.lineTo(p, p);
    ctx.lineTo(p + l, p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - p - l, p);
    ctx.lineTo(W - p, p);
    ctx.lineTo(W - p, p + l);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p, H - p - l);
    ctx.lineTo(p, H - p);
    ctx.lineTo(p + l, H - p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W - p - l, H - p);
    ctx.lineTo(W - p, H - p);
    ctx.lineTo(W - p, H - p - l);
    ctx.stroke();
    ctx.restore();
}

function drawLaserLine(ctx, W, H, color) {
    laserY += laserDirection * 3;
    if (laserY >= H * .85) laserDirection = -1;
    if (laserY <= H * .15) laserDirection = 1;
    const g = ctx.createLinearGradient(0, laserY, W, laserY);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(.2, color);
    g.addColorStop(.5, color);
    g.addColorStop(.8, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    if (DeviceProfile.config.enableShadowBlur) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, laserY);
    ctx.lineTo(W, laserY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, laserY);
    ctx.lineTo(W, laserY);
    ctx.stroke();
    ctx.restore();
}

function drawFaceGuide(ctx, W, H, color, glowColor) {
    const cx = W / 2,
        cy = H * 0.40,
        rx = Math.min(W, H) * .25,
        ry = Math.min(W, H) * .32,
        t = performance.now() / 1000;
    ctx.save();
    ctx.setLineDash([15, 10]);
    ctx.lineDashOffset = -t * 40;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    if (DeviceProfile.config.enableShadowBlur) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    const cs = 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - cs, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + cs, cy);
    ctx.moveTo(cx, cy - cs);
    ctx.lineTo(cx, cy - 5);
    ctx.moveTo(cx, cy + 5);
    ctx.lineTo(cx, cy + cs);
    ctx.stroke();
    [{ x: cx, y: cy - ry }, { x: cx + rx, y: cy }, { x: cx, y: cy + ry }, { x: cx - rx, y: cy }].forEach(p => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawFaceWireframe(ctx, detection, W, H, color) {
    const pos = detection.landmarks.positions,
        box = detection.detection.box;
    const vW = detection.detection.imageWidth || document.getElementById('vStream').videoWidth,
        vH = detection.detection.imageHeight || document.getElementById('vStream').videoHeight;
    if (!vW || !vH) return;
    const vRatio = vW / vH,
        cRatio = W / H;
    let dW, dH, oX, oY;
    if (vRatio > cRatio) {
        dH = H;
        dW = H * vRatio;
        oX = (W - dW) / 2;
        oY = 0;
    } else {
        dW = W;
        dH = W / vRatio;
        oX = 0;
        oY = (H - dH) / 2;
    }
    const sX = dW / vW,
        sY = dH / vH,
        isMirror = cType === 'selfie';
    const tx = (vx) => {
            let x = vx * sX + oX;
            return isMirror ? W - x : x;
        },
        ty = (vy) => vy * sY + oY;
    let bx = tx(box.x),
        by = ty(box.y),
        bw = box.width * sX,
        bh = box.height * sY;
    if (isMirror) bx = bx - bw;
    ctx.save();
    ctx.strokeStyle = color.replace('0.9', '0.4');
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(bx - 10, by - 10, bw + 20, bh + 20);
    ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (DeviceProfile.config.enableShadowBlur) {
        ctx.shadowColor = color.replace('0.9', '0.5');
        ctx.shadowBlur = 5;
    }
    ctx.strokeRect(bx, by, bw, bh);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(12, W * .018)}px 'JetBrains Mono'`;
    ctx.fillText(`FACE • ${(detection.detection.score * 100).toFixed(0)}%`, bx, by - 15);
    const sp = pos.map(p => ({ x: tx(p.x), y: ty(p.y) })),
        groups = [
            [0, 16, 0],
            [17, 21, 0],
            [22, 26, 0],
            [27, 30, 0],
            [31, 35, 0],
            [36, 41, 1],
            [42, 47, 1],
            [48, 67, 1]
        ];
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color.replace('0.9', '0.7');
    groups.forEach(([s, e, c]) => {
        ctx.beginPath();
        for (let i = s; i <= e; i++) {
            if (!sp[i]) continue;
            i === s ? ctx.moveTo(sp[i].x, sp[i].y) : ctx.lineTo(sp[i].x, sp[i].y);
        }
        if (c && sp[s]) ctx.lineTo(sp[s].x, sp[s].y);
        ctx.stroke();
    });
    if (DeviceProfile.tier !== 'low') {
        sp.forEach(p => {
            if (!p) return;
            ctx.fillStyle = color.replace('0.9', '0.4');
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    ctx.restore();
}

function drawRuleOfThirds(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(W / 3, 0);
    ctx.lineTo(W / 3, H);
    ctx.moveTo(2 * W / 3, 0);
    ctx.lineTo(2 * W / 3, H);
    ctx.moveTo(0, H / 3);
    ctx.lineTo(W, H / 3);
    ctx.moveTo(0, 2 * H / 3);
    ctx.lineTo(W, 2 * H / 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawCrosshair(ctx, W, H, color) {
    const cx = W / 2,
        cy = H / 2,
        outer = 25,
        gap = 4;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (DeviceProfile.config.enableShadowBlur) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.moveTo(cx - outer, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + outer, cy);
    ctx.moveTo(cx, cy - outer);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + outer);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawWorkLabel(ctx, W, H) {
    ctx.save();
    const label = 'WORK SITE',
        fontSize = Math.max(11, Math.round(W * 0.022));
    ctx.font = `800 ${fontSize}px 'JetBrains Mono',monospace`;
    const textW = ctx.measureText(label).width,
        padX = 12,
        padY = 6,
        x = 20,
        y = H * 0.12,
        bw = textW + padX * 2,
        bh = fontSize + padY * 2;
    ctx.fillStyle = 'rgba(34,211,238,0.15)';
    ctx.strokeStyle = 'rgba(34,211,238,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(34,211,238,0.95)';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + padX, y + bh / 2);
    ctx.restore();
}

// ============================================================
// 33. APP VERSION CHECK
// ============================================================
function checkAppVersion() {
    const currentVersion = "v2.7.0";
    const savedVersion = localStorage.getItem('app_version');
    if (savedVersion && savedVersion !== currentVersion) showUpdateModal();
    localStorage.setItem('app_version', currentVersion);
}

function showUpdateModal() {
    const modal = document.getElementById('notificationModal');
    const content = document.getElementById('notifModalContent');
    content.className = 'notif-modal-content notif-info';
    document.getElementById('notifIcon').setAttribute('data-lucide', 'download-cloud');
    document.getElementById('notifTitle').innerText = "Pembaruan Tersedia!";
    document.getElementById('notifMessage').innerText = "Versi terbaru aplikasi E-PUSDA telah dirilis. Muat ulang halaman untuk mendapatkan fitur terbaru dan performa yang lebih cepat.";
    const btnOk = document.getElementById('btnNotifOk');
    btnOk.innerHTML = '<i data-lucide="refresh-cw" size="18"></i> Muat Ulang Sekarang';
    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.classList.add('show'); });
    btnOk.onclick = () => {
        if ('caches' in window) {
            caches.keys().then(names => names.forEach(name => caches.delete(name)));
        }
        location.reload();
    };
    lucide.createIcons();
}

// ============================================================
// 34. INITIALIZATION
// ============================================================
window.onload = () => {
    lucide.createIcons();
    loadData();
    updateAttendanceStatusIndicator();
    updateButtonColors();
    
    setInterval(updateAttendanceStatusIndicator, 60000);
    setInterval(updateButtonColors, 60000);
    
    setInterval(() => {
        const now = new Date();
        const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
        const jakartaDate = new Date(jakartaStr);
        const timeStr = jakartaDate.toLocaleTimeString('id-ID', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false 
        });
        const liveClock = document.getElementById('liveClock');
        if (liveClock) liveClock.innerText = timeStr;
        updateWatermarkClock();
    }, 1000);
    
    updateWatermarkClock();
    checkAppVersion();
    
    detectReturnFromProfile();
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('📱 Tab menjadi aktif, refresh data presensi...');
            refreshPresensiData().then(() => {
                updateUIAfterRefresh();
                updateButtonColors();
            });
        }
    });
    
    window.addEventListener('focus', () => {
        console.log('🔄 Window mendapat focus, refresh data presensi...');
        refreshPresensiData().then(() => {
            updateUIAfterRefresh();
            updateButtonColors();
        });
    });
    
    setInterval(() => {
        const isFormOpen = document.getElementById('stepForm').style.display === 'flex';
        if (isFormOpen) {
            console.log('⏰ Auto refresh status (30 detik)...');
            refreshPresensiData().then(() => {
                updateUIAfterRefresh();
                updateButtonColors();
            });
        }
    }, 30000);
    
    try {
        if ('serviceWorker' in navigator) {
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:' ||
                protocol === 'http:' &&
                (window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1');
            if (isSecure) {
                navigator.serviceWorker.register('sw.js')
                    .then(() => console.log('✅ Service Worker registered successfully'))
                    .catch(err => console.warn('⚠️ Service Worker registration failed:', err));
            } else {
                console.info('ℹ️ Service Worker skipped - protocol "' + protocol + '" not supported');
            }
        }
    } catch (e) {
        console.warn('⚠️ Service Worker error:', e.message);
    }
};

// ============================================================
// END OF PRESENSI.JS
// ============================================================