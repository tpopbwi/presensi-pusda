// ============================================================
// PRESENSI.JS - v2.8.0 (STABILITY FIX)
// ============================================================
// PERBAIKAN v2.8.0:
// 1. Timeout dinaikkan (25s init, 35s submit) untuk Cold Start GAS
// 2. Auto-Retry untuk submit presensi (3x dengan backoff)
// 3. Hapus Base64 dari sessionStorage (cegah QuotaExceededError)
// 4. Kompresi gambar lebih agresif (max 400KB)
// 5. Offline handling lebih baik
// 6. Background keepAlive ping ke server
// ============================================================

// ============================================================
// 0. CORS & OFFLINE HANDLING (GAS COMPATIBLE)
// ============================================================
async function fetchWithCors(url, options = {}) {
    const defaultOptions = {
        redirect: 'follow' // WAJIB untuk GAS Web App
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // ✅ PENTING: GAS TIDAK mendukung request OPTIONS (Preflight)
    // Untuk POST, WAJIB gunakan 'text/plain'
    if (mergedOptions.body) {
        mergedOptions.method = 'POST';
        mergedOptions.headers = {
            'Content-Type': 'text/plain;charset=utf-8'
        };
    } else {
        mergedOptions.method = mergedOptions.method || 'GET';
        // ✅ Hapus semua header agar tidak trigger preflight
        mergedOptions.headers = {};
    }

    // ✅ Hapus mode dan credentials agar browser menangani redirect GAS secara native
    delete mergedOptions.mode;
    delete mergedOptions.credentials;

    try {
        console.log('📡 Fetch:', url, mergedOptions.method || 'GET');
        const response = await fetch(url, mergedOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
    } catch (error) {
        console.error('❌ Fetch error:', error);
        throw error;
    }
}

function fetchWithTimeout(url, options = {}, timeout = 20000) {
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

function getApiUrl(action, params = {}) {
    const url = new URL(API);
    url.searchParams.append('action', action);
    url.searchParams.append('cb', Date.now());
    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });
    return url.toString();
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    return (parseInt(parts[0]) || 0) * 100 + (parseInt(parts[1]) || 0);
}

function formatTime(timeVal) {
    const hours = String(Math.floor(timeVal / 100)).padStart(2, '0');
    const minutes = String(timeVal % 100).padStart(2, '0');
    return hours + ':' + minutes;
}

let appConfig = { jHadir: "08:00", jTelat: "08:10", jPulang: "16:00" };
let activePegawai = null;

// ============================================================
// 2. PWA MANIFEST
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
let isFaceApiLoaded = false, isFaceApiLoading = false;
let isInitialMapBound = false, _lastFrameTime = 0;
let isFormLoading = false, _lastToastKey = '', _lastToastTime = 0;
let toastQueue = [], isToastShowing = false;
let dbE = [], dbF = [], dbP = [], uIdx = 0;
let map = null, marker = null;
let uPos = { lat: 0, lng: 0 };
let cType = '', sB64 = null, kB64 = null;
let selectedStatus = '', calculatedScore = 0;
let isLandmarkReady = false, pendingCamType = null, currentStream = null;
let lastGoodDetection = null, faceDetected = false, detectionStableCount = 0;
const STABLE_THRESHOLD = 3;
let detectIntervalId = null, laserY = 0, laserDirection = 1;
let _activeResizeHandler = null, suratB64 = null;
let _canvasW = 0, _canvasH = 0, _rafRunning = false;

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
        message: '<b>Aturan Waktu:</b><br>• ≤ 08:00 = Poin 50<br>• 08:01-08:10 = Poin 40<br>• > 08:10 = Poin 25',
        icon: 'check-circle',
        color: 'var(--success)',
        borderColor: 'var(--success)',
        actions: []
    },
    'PULANG': {
        placeholder: 'Tuliskan ringkasan hasil kerja hari ini...',
        title: '🌙 PULANG',
        message: 'Absensi pulang tercatat.',
        icon: 'moon',
        color: 'var(--pu-blue)',
        borderColor: 'var(--pu-blue)',
        actions: []
    },
    'IZIN': {
        placeholder: 'Jelaskan alasan izin...',
        title: '📝 IZIN',
        message: 'Hubungi Koordinator / Pimpinan.',
        icon: 'file-text',
        color: '#d8b4fe',
        borderColor: '#a855f7',
        actions: [{ label: 'Lampirkan Surat', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'SAKIT': {
        placeholder: 'Jelaskan kondisi sakit...',
        title: '🏥 SAKIT',
        message: 'Lampirkan surat dokter.',
        icon: 'heart-pulse',
        color: '#fde047',
        borderColor: 'var(--warning)',
        actions: [{ label: 'Surat Dokter', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'DINAS': {
        placeholder: 'Jelaskan lokasi dan tujuan dinas...',
        title: '💼 DINAS',
        message: 'Lampirkan surat tugas.',
        icon: 'briefcase',
        color: '#fdba74',
        borderColor: 'var(--accent)',
        actions: [{ label: 'Surat Tugas', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'QUICK RESPONSE': {
        placeholder: 'Tuliskan ringkasan tugas darurat...',
        title: '⚡ QUICK RESPONSE',
        message: 'Tugas darurat dengan detail.',
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
    const cores = navigator.hardwareConcurrency || 2;
    const ram = navigator.deviceMemory || 2;
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
            jpegQuality: 0.4,
            videoConstraints: { width: 1280, height: 960 }
        },
        mid: {
            enableFaceAPI: ram >= 3,
            enableLandmarks: false,
            enableShadowBlur: false,
            canvasFPS: 30,
            detectInterval: 350,
            selfieResolution: [600, 800],
            kerjaResolution: [800, 600],
            jpegQuality: 0.4,
            videoConstraints: { width: 960, height: 720 }
        },
        low: {
            enableFaceAPI: false,
            enableLandmarks: false,
            enableShadowBlur: false,
            canvasFPS: 24,
            detectInterval: 0,
            selfieResolution: [480, 640],
            kerjaResolution: [640, 480],
            jpegQuality: 0.35,
            videoConstraints: { width: 640, height: 480 }
        }
    };
    
    console.info(`📱 Device Profile: ${tier} (RAM: ${ram}GB, Cores: ${cores})`);
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
    const w = Math.round(rect.width), h = Math.round(rect.height);
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

function stopRenderLoop() { _rafRunning = false; }

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
// 8. WATERMARK CLOCK
// ============================================================
function updateWatermarkClock() {
    const now = new Date();
    const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaStr);
    const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const clockEl = document.getElementById('wmClock');
    if (clockEl) clockEl.textContent = timeStr;
}

// ============================================================
// 9. UPDATE WARNA TOMBOL
// ============================================================
function updateButtonColors() {
    const timeVal = getJakartaTimeVal();
    const jamHadirLimit = parseTime(appConfig.jHadir || "08:00");
    const jamTelatLimit = parseTime(appConfig.jTelat || "08:10");
    
    let btnColor = '#10b981', statusText = 'Tepat Waktu';
    let isLate = false, isHeavyLate = false;
    
    if (timeVal > jamTelatLimit) {
        btnColor = '#ef4444'; statusText = 'Terlambat Berat';
        isHeavyLate = true; isLate = true;
    } else if (timeVal > jamHadirLimit) {
        btnColor = '#facc15'; statusText = 'Terlambat Ringan';
        isLate = true;
    }
    
    const btnHadir = document.getElementById('btnHadirMain');
    if (btnHadir && !btnHadir.classList.contains('btn-done') && !btnHadir.classList.contains('active')) {
        btnHadir.style.backgroundColor = btnColor;
        btnHadir.style.color = '#ffffff';
        btnHadir.style.borderColor = btnColor;
        btnHadir.style.boxShadow = `0 8px 20px ${btnColor}66`;
    }
    
    if (!selectedStatus) {
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
                            <p>${isHeavyLate ? 'Poin: 25' : 'Poin: 40'}</p>
                        </div>
                    </div>`;
                lucide.createIcons();
            } else {
                badgeContainer.innerHTML = `
                    <div class="attendance-status-badge status-ontime">
                        <div class="badge-icon"><i data-lucide="check-circle" size="18"></i></div>
                        <div class="badge-text">
                            <h4 style="color:#10b981">Tepat Waktu</h4>
                            <p>Poin: 50</p>
                        </div>
                    </div>`;
                lucide.createIcons();
            }
        }
    }
}

// ============================================================
// 10. FACE API
// ============================================================
async function ensureFaceApiLoaded() {
    if (!DeviceProfile.config.enableFaceAPI) return false;
    if (isFaceApiLoaded) return true;
    if (isFaceApiLoading) {
        while (isFaceApiLoading) await new Promise(r => setTimeout(r, 100));
        return isFaceApiLoaded;
    }
    isFaceApiLoading = true;
    showToast("Memuat AI", "Menyiapkan deteksi wajah...", "info");
    try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
        document.head.appendChild(script);
        
        const loadPromise = new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000));
        await Promise.race([loadPromise, timeoutPromise]);
        await faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
        isFaceApiLoaded = true;
        isFaceApiLoading = false;
        return true;
    } catch (e) {
        console.error("Face API Error:", e);
        isFaceApiLoading = false;
        showToast("Mode AI Gagal", "Menggunakan mode standar", "warning");
        return false;
    }
}

async function loadFaceModels() {
    if (!DeviceProfile.config.enableFaceAPI || !DeviceProfile.config.enableLandmarks) return;
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
                showToastOnce('gps_lemah', "Sinyal Lemah", `Akurasi ${p.coords.accuracy.toFixed(0)}m.`, "error");
                g.innerHTML = `<i data-lucide="x-circle" size="14" style="vertical-align:middle;margin-right:5px;color:var(--danger)"></i> Sinyal Lemah`;
                lucide.createIcons();
                uPos = { lat: 0, lng: 0 };
                updateWorkflow();
                return;
            }
            
            uPos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
            g.innerHTML = `<i data-lucide="check-circle" size="14" style="vertical-align:middle;margin-right:5px;color:var(--success)"></i> GPS: ${uPos.lat.toFixed(5)}, ${uPos.lng.toFixed(5)}`;
            lucide.createIcons();
            
            if (map) {
                map.setView([uPos.lat, uPos.lng], 16);
                marker.setLatLng([uPos.lat, uPos.lng]);
                const mapFrame = document.querySelector('.map-view-frame');
                if (mapFrame) mapFrame.classList.remove('loading');
                tampilkanGeoFence();
            }
            updateWorkflow();
        },
        (e) => {
            if (retryCount < 3) {
                g.innerHTML = `Mencoba ulang (${retryCount + 1}/3)...`;
                setTimeout(() => upLoc(retryCount + 1), 2000);
                return;
            }
            if (e.code === 1) showPermissionModal('gps');
            else showToastOnce('gps_error', "Gagal", "GPS gagal: " + e.message, "error");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function hitungJarak(a, b, c, d) {
    if (!a || !b || !c || !d) return 999999;
    const R = 6371000, dL = (c - a) * Math.PI / 180, dG = (d - b) * Math.PI / 180;
    const x = Math.sin(dL / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dG / 2) ** 2;
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
    requestAnimationFrame(() => { if (map) map.invalidateSize(); });
}

// ============================================================
// 13. PERMISSION MODAL
// ============================================================
function showPermissionModal(type) {
    const m = document.getElementById('permissionModal');
    const t = document.getElementById('permTitle');
    const d = document.getElementById('permDesc');
    const s = document.getElementById('permSteps');
    const b = document.getElementById('permRetryBtn');
    
    if (type === 'camera') {
        t.innerText = 'Akses Kamera Dibutuhkan';
        d.innerText = 'Izinkan akses kamera untuk foto presensi.';
        s.innerHTML = '<div class="permission-step"><div class="permission-step-num">1</div><div>Klik <b>Coba Lagi</b></div></div>';
        b.onclick = () => { closePermissionModal(); triggerCam(pendingCamType); };
    } else {
        t.innerText = 'Akses Lokasi Dibutuhkan';
        d.innerText = 'GPS diperlukan untuk verifikasi lokasi.';
        s.innerHTML = '<div class="permission-step"><div class="permission-step-num">1</div><div>Aktifkan <b>GPS HP</b></div></div>';
        b.onclick = () => { closePermissionModal(); upLoc(); };
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
            setTimeout(() => { modal.style.display = 'none'; }, 300);
            btnAttach.onclick = null;
            btnSkip.onclick = null;
        };
        
        btnAttach.onclick = () => { cleanup(); resolve('attach'); };
        btnSkip.onclick = () => { cleanup(); resolve('skip'); };
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
        } else return;
    }
    
    if (!selectedStatus) { updateButtonColors(); return; }
    
    if (selectedStatus === 'PULANG') {
        badgeContainer.innerHTML = `
            <div class="attendance-status-badge status-ontime">
                <div class="badge-icon"><i data-lucide="moon" size="18"></i></div>
                <div class="badge-text"><h4>Absen Pulang</h4><p>Selamat beristirahat.</p></div>
            </div>`;
        lucide.createIcons();
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
        statusClass = 'status-ontime'; icon = 'check-circle';
        title = 'Tepat Waktu'; desc = 'Poin: 50'; btnColor = '#10b981';
    } else if (timeVal <= jamTelatLimit) {
        statusClass = 'status-late-light'; icon = 'clock';
        title = 'Terlambat Ringan'; desc = 'Poin: 40'; btnColor = '#facc15';
    } else {
        statusClass = 'status-late-heavy'; icon = 'alert-octagon';
        title = 'Terlambat Berat'; desc = 'Poin: 25'; btnColor = '#ef4444';
    }
    
    badgeContainer.innerHTML = `
        <div class="attendance-status-badge ${statusClass}">
            <div class="badge-icon"><i data-lucide="${icon}" size="18"></i></div>
            <div class="badge-text"><h4>${title}</h4><p>${desc}</p></div>
        </div>`;
    
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
    const notes = document.getElementById('notes');
    const counter = document.getElementById('notesCounter');
    const clearBtn = document.getElementById('notesClear');
    const len = notes.value.length;
    
    counter.textContent = `${len}/500`;
    counter.classList.remove('warning', 'valid');
    
    if (len === 0) clearBtn.classList.remove('show');
    else if (len < 5) { counter.classList.add('warning'); clearBtn.classList.add('show'); }
    else { counter.classList.add('valid'); clearBtn.classList.add('show'); }
    
    notes.style.height = 'auto';
    notes.style.height = Math.min(notes.scrollHeight, 200) + 'px';
}

function clearNotes() {
    document.getElementById('notes').value = '';
    updateNotesCounter();
    saveAutoRecovery();
}

function updateStatusInfo(status) {
    const info = document.getElementById('statusInfo');
    const badge = document.getElementById('statusBadge');
    const badgeText = document.getElementById('statusBadgeText');
    const textarea = document.getElementById('notes');
    const config = STATUS_CONFIG[status];
    
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
    const gpsReady = uPos.lat !== 0;
    const statusReady = selectedStatus !== '';
    const notesReady = document.getElementById('notes').value.trim().length >= 5;
    
    document.getElementById('statusBox1').classList.toggle('workflow-locked', !gpsReady);
    document.getElementById('specialStatusHeader').classList.toggle('workflow-locked', !gpsReady);
    document.getElementById('specialStatusGrid').classList.toggle('workflow-locked', !gpsReady);
    document.getElementById('notesBox').classList.toggle('workflow-locked', !statusReady);
    document.getElementById('photoBox').classList.toggle('workflow-locked', !notesReady);
}

function clearHeavyData() {
    sB64 = null; kB64 = null; suratB64 = null;
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
    const g = document.getElementById('specialStatusGrid');
    const i = document.getElementById('collapseIcon');
    g.classList.toggle('show');
    i.setAttribute('data-lucide', g.classList.contains('show') ? 'chevron-up' : 'chevron-down');
    lucide.createIcons();
}

// ============================================================
// ✅ HELPER: checkAtt - SINGLE DEFINITION (FIXED)
// ============================================================
function checkAtt(id, st) {
    if (!dbP || dbP.length === 0) {
        console.warn("⚠️ dbP kosong");
        return false;
    }
    
    const targetId = String(id).trim();
    const statusLower = st.toLowerCase().trim();
    
    const pegawaiRecords = dbP.filter(l => {
        const lid = String(l.id_pegawai || l['ID Pegawai'] || l.ID || '').trim();
        return lid === targetId;
    });
    
    if (pegawaiRecords.length === 0) {
        console.log(`🔍 checkAtt(${id}, ${st}) = false (no records for this pegawai)`);
        return false;
    }
    
    console.log(`📋 Found ${pegawaiRecords.length} records for pegawai ${id}:`);
    pegawaiRecords.forEach(r => {
        console.log(`   - Status: "${r.status}" at ${r.timestamp}`);
    });
    
    const result = pegawaiRecords.some(l => {
        const ls = String(l.status || l.Status || "").toLowerCase().trim();
        
        if (statusLower === 'hadir') {
            return ls === 'hadir' || 
                   ls === 'terlambat ringan' || 
                   ls === 'terlambat berat' ||
                   ls === 'qr hadir' || 
                   ls === 'qr terlambat ringan' || 
                   ls === 'qr terlambat berat' ||
                   ls.includes('hadir') ||
                   ls.includes('terlambat');
        }
        if (statusLower === 'pulang') {
            return ls === 'pulang' || 
                   ls === 'qr pulang' ||
                   ls.includes('pulang');
        }
        return false;
    });
    
    console.log(`🔍 checkAtt(${id}, ${st}) = ${result} (found ${pegawaiRecords.length} records)`);
    if (pegawaiRecords.length > 0) {
        console.log('📋 Records:', pegawaiRecords.map(r => r.status).join(', '));
    }
    return result;
}

// ✅ FIX: Auto-Recovery TIDAK menyimpan Base64 (cegah QuotaExceededError)
function saveAutoRecovery() {
    const data = {
        timestamp: Date.now(),
        notes: document.getElementById('notes').value,
        status: selectedStatus
    };
    try {
        sessionStorage.setItem('pusda_recovery', JSON.stringify(data));
    } catch (e) {
        console.warn('Gagal simpan recovery:', e);
    }
}

function loadAutoRecovery() {
    const saved = sessionStorage.getItem('pusda_recovery');
    if (!saved) return;
    
    try {
        const data = JSON.parse(saved);
        if (data.timestamp && (Date.now() - data.timestamp < 86400000)) {
            document.getElementById('notes').value = data.notes || "";
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
        } catch (e) {
            console.warn('LocalStorage penuh');
        }
        
        document.getElementById('sidebarLogo').src = d1.config?.Logo || GITHUB_LOGO_URL;
        const cfg = d1.config || {};
        appConfig.jHadir = cfg.Jam_Hadir || "08:00";
        appConfig.jTelat = cfg.Jam_Terlambat_Ringan || "08:10";
        appConfig.jPulang = cfg.Jam_Pulang || "16:00";
        
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
        document.getElementById('pJob').innerText = "Periksa koneksi internet";
        
        const fallbackCache = loadFromCache();
        if (fallbackCache) console.info('📦 Menggunakan data cache');
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
            fetchWithTimeout(API + "?action=getDashboardData", { redirect: 'follow', cache: 'no-cache' }, 20000),
            fetchWithTimeout(API + "?action=getTodayPresensi", { redirect: 'follow', cache: 'no-cache' }, 20000)
        ]);
        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
        
        dbE = d1.pegawai || [];
        dbF = [...dbE];
        dbP = d2.data || [];
        
        try { localStorage.setItem('pusda_pegawai_v1', JSON.stringify(dbE)); } catch (e) {}
        
        const cfg = d1.config || {};
        appConfig.jHadir = cfg.Jam_Hadir || "08:00";
        appConfig.jTelat = cfg.Jam_Terlambat_Ringan || "08:10";
        appConfig.jPulang = cfg.Jam_Pulang || "16:00";
        
        renderChips();
        applyFilters();
    } catch (e) {
        console.warn("⚠️ Background update gagal:", e.message);
    }
}

// ============================================================
// 17. UI RENDER
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
            if (fileId) finalSrc = `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
            else finalSrc = rawUrl;
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
    if (el) el.textContent = wilayah || 'WILAYAH';
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
    r.onstart = () => { btn.classList.add('active'); haptic(); };
    r.onresult = e => {
        const t = e.results[0][0].transcript;
        if (id === 'searchInput') {
            document.getElementById('searchInput').value = t;
            applyFilters();
        } else {
            const n = document.getElementById('notes');
            n.value += (n.value ? ' ' : '') + t;
            onNotesInput(); // ✅ Panggil fungsi yang sudah didefinisikan
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
            if (uPos.lat === 0) showToast("GPS Gagal", "Silakan tunggu GPS terkunci.", "error");
        }, 3000);
        return;
    }
    
    const g = validasiGeoFencing();
    const outside = g.status === 'OUT_ZONE';
    const exc = ['IZIN', 'SAKIT', 'DINAS', 'QUICK RESPONSE'].includes(st);
    
    if (outside && !exc) {
        sndError.play();
        showToast("Ditolak", `Anda di luar area geo-fencing (${g.jarak}m).`, "error");
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
            showToast("Sudah Absen", "Anda sudah presensi HADIR.", "error");
            return;
        }
    } else if (st === 'PULANG') {
        if (checkAtt(pid, 'PULANG')) {
            sndError.play();
            showToast("Sudah Absen", "Anda sudah presensi PULANG.", "error");
            return;
        }
        if (!checkAtt(pid, 'HADIR')) {
            showToast("Urutan Salah", "Harus HADIR dulu.", "error");
            return;
        }
    } else if (st === 'QUICK RESPONSE') {
        const isMorning = timeVal < jamPulangLimit;
        if (isMorning) {
            if (checkAtt(pid, 'HADIR')) {
                sndError.play();
                showToast("Sudah Absen", "Sudah presensi HADIR / QR HADIR.", "error");
                return;
            }
        } else {
            if (checkAtt(pid, 'PULANG')) {
                sndError.play();
                showToast("Sudah Absen", "Sudah presensi PULANG / QR PULANG.", "error");
                return;
            }
            if (!checkAtt(pid, 'HADIR')) {
                sndError.play();
                showToast("Belum Absen Masuk", "Belum HADIR / QR HADIR.", "error");
                return;
            }
        }
    }
    
    document.getElementById('notes').value = '';
    updateNotesCounter();
    sB64 = null; kB64 = null; suratB64 = null;
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
}

// ============================================================
// 20. REFRESH PRESENSI DATA (FIXED - CACHE BUSTER)
// ============================================================
async function refreshPresensiData() {
    try {
        if (!navigator.onLine) return false;
        
        const url = getApiUrl('getTodayPresensi') + '&_t=' + Date.now();
        console.log('📡 Refreshing presensi data:', url);
        
        const r = await fetchWithTimeout(url, { 
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        }, 20000);
        
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        
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
// 21. SUBMIT PRESENSI - VERSION 2.8.1 (FIXED)
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
        if (uPos.lat === 0) return showToast("GPS Gagal", "Coba lagi.", "error");
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
        'HADIR': 'hadir', 'PULANG': 'pulang',
        'IZIN': 'izin', 'SAKIT': 'sakit',
        'DINAS': 'dinas', 'QUICK RESPONSE': 'quick response'
    };
    
    const payloadStatus = statusMapping[selectedStatus] || selectedStatus.toLowerCase();
    btn.disabled = true;
    setLoading(true, attempt > 1 ? `Mencoba ulang ${attempt - 1}/3...` : "Mengunggah Data...");
    
    const p = activePegawai;
    if (!trxId) trxId = `${p.ID}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
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
        }, 35000);
        
        const j = await r.json();
        
        if (j.status === 'success') {
            setLoading(false);
            btn.disabled = false;
            sndSuccess.play().catch(() => {});
            showToast("Presensi Berhasil!", "Data tersinkronisasi.", "success");
            
            const newRecord = {
                timestamp: j.timestamp || new Date().toISOString(),
                id_pegawai: String(p.ID).trim(),
                nama: p.Nama,
                status: j.statusFix || payloadStatus,
                nilai: j.nilai || 0,
                keterangan: n,
                trxId: trxId
            };
            
            dbP = [newRecord, ...dbP];
            console.log('✅ dbP updated with new record:', newRecord);
            console.log('✅ dbP length:', dbP.length);
            
            const btnHadir = document.getElementById('btnHadirMain');
            const btnPulang = document.getElementById('btnPulangMain');
            
            const isPulang = j.statusFix && (
                j.statusFix.toLowerCase().includes('pulang') || 
                j.statusFix.toLowerCase().includes('qr pulang')
            );
            
            console.log('📊 Status response:', j.statusFix, 'isPulang:', isPulang);
            
            if (isPulang) {
                btnPulang.classList.add('btn-done');
                btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
                btnPulang.style.pointerEvents = 'none';
                btnPulang.style.backgroundColor = 'rgba(16,185,129,0.15)';
                btnPulang.style.borderColor = 'rgba(16,185,129,0.4)';
                btnPulang.style.color = 'rgba(16,185,129,0.8)';
                
                if (!btnHadir.classList.contains('btn-done')) {
                    const hasHadir = dbP.some(r => {
                        const rid = String(r.id_pegawai || r['ID Pegawai'] || r.ID || '').trim();
                        const rstatus = String(r.status || '').toLowerCase();
                        return rid === String(p.ID).trim() && 
                               (rstatus === 'hadir' || rstatus.includes('terlambat') || rstatus === 'qr hadir');
                    });
                    
                    if (hasHadir) {
                        btnHadir.classList.add('btn-done');
                        btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
                        btnHadir.style.pointerEvents = 'none';
                        btnHadir.style.backgroundColor = 'rgba(16,185,129,0.15)';
                        btnHadir.style.borderColor = 'rgba(16,185,129,0.4)';
                        btnHadir.style.color = 'rgba(16,185,129,0.8)';
                    }
                }
            } else {
                btnHadir.classList.add('btn-done');
                btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
                btnHadir.style.pointerEvents = 'none';
                btnHadir.style.backgroundColor = 'rgba(16,185,129,0.15)';
                btnHadir.style.borderColor = 'rgba(16,185,129,0.4)';
                btnHadir.style.color = 'rgba(16,185,129,0.8)';
                console.log('✅ btnHadir set to SUDAH HADIR');
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
            
            if (!isPulang) {
                btnPulang.style.backgroundColor = '';
                btnPulang.style.color = '';
                btnPulang.style.borderColor = '';
                btnPulang.style.boxShadow = '';
            }
            if (isPulang) {
                btnHadir.style.backgroundColor = '';
                btnHadir.style.color = '';
                btnHadir.style.borderColor = '';
                btnHadir.style.boxShadow = '';
            }
            
            sessionStorage.removeItem('pusda_recovery');
            
            refreshPresensiData().catch(e => console.warn('Background refresh failed:', e));
            
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
            if (j.message.includes('duplikat') || j.message.includes('sudah')) {
                sndSuccess.play().catch(() => {});
                showToast("Sudah Tercatat", "Data sudah masuk.", "success");
                await refreshPresensiData();
                updateUIAfterRefresh();
                clearHeavyData();
            } else {
                sndError.play().catch(() => {});
                showToast("Ditolak", j.message || "Gagal.", "error");
            }
        } else {
            throw new Error(j.message || "Format respons tidak dikenal");
        }
    } catch (e) {
        console.error("❌ Submit error:", e);
        if (attempt < 4) {
            showToastOnce('submit_retry', "Menunggu Antrian...", `Mencoba ulang (${attempt}/3)...`, "warning");
            setTimeout(() => submitWithRetry(attempt + 1, trxId), 2000 * Math.pow(1.5, attempt));
        } else {
            sndError.play().catch(() => {});
            showToast("Gagal Mengirim", "Koneksi gagal. Coba lagi.", "error");
            btn.disabled = false;
            setLoading(false);
        }
    }
}

// ============================================================
// 22. OPEN / CLOSE FORM (FIXED - BETTER STATUS CHECK)
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
    
    sB64 = null; kB64 = null; suratB64 = null;
    document.getElementById('sImg').style.display = 'none';
    document.getElementById('kImg').style.display = 'none';
    document.getElementById('sPh').style.display = 'block';
    document.getElementById('kPh').style.display = 'block';
    lucide.createIcons();
    
    const rawUrl = p.Link_Foto_Profile || p.link_foto_profile || "";
    let finalSrc = placeholderImg;
    if (rawUrl) {
        if (rawUrl.includes('drive.google.com')) {
            let fileId = "";
            let match = rawUrl.match(/\/d\/([^\/\?]+)/);
            if (match && match[1]) fileId = match[1];
            if (!fileId) {
                match = rawUrl.match(/[?&]id=([^&]+)/);
                if (match && match[1]) fileId = match[1];
            }
            if (fileId) finalSrc = `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
            else finalSrc = rawUrl;
        } else finalSrc = rawUrl;
    }
    
    document.getElementById('formHeroImg').src = finalSrc;
    document.getElementById('formName').innerText = p.Nama || p.nama;
    document.getElementById('formJobWil').innerHTML = 
        `<i data-lucide="briefcase" size="14"></i> ${p.Jabatan || "PPA"} | <i data-lucide="map-pin" size="14"></i> ${p.Wilayah || "UPT"}`;
    lucide.createIcons();
    
    const btnHadir = document.getElementById('btnHadirMain');
    const btnPulang = document.getElementById('btnPulangMain');
    
    btnHadir.style.pointerEvents = 'none'; btnHadir.style.opacity = '0.5';
    btnPulang.style.pointerEvents = 'none'; btnPulang.style.opacity = '0.5';
    
    // ✅ FIX: Refresh data dengan retry (3x)
    let refreshSuccess = false;
    for (let i = 0; i < 3; i++) {
        try {
            refreshSuccess = await refreshPresensiData();
            if (refreshSuccess) break;
        } catch (e) {
            console.warn(`Refresh attempt ${i+1} failed:`, e);
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
    
    if (!refreshSuccess) {
        console.warn('⚠️ Semua percobaan refresh gagal, menggunakan data cache');
        showToast('Peringatan', 'Gagal refresh data, menggunakan data cache.', 'warning');
    }
    
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
    
    btnPulang.classList.remove('btn-done', 'active');
    btnPulang.innerHTML = '<i data-lucide="moon" size="28"></i><span>PULANG</span>';
    btnPulang.style.pointerEvents = '';
    btnPulang.style.opacity = '';
    
    const pid = p.ID || p.id;
    console.log('🔍 Checking status for pegawai:', pid);
    console.log('📊 Current dbP:', dbP);
    console.log('📊 dbP length:', dbP.length);
    
    const hadirStatus = checkAtt(pid, 'HADIR');
    const pulangStatus = checkAtt(pid, 'PULANG');
    
    console.log('✅ HADIR status:', hadirStatus);
    console.log('✅ PULANG status:', pulangStatus);
    
    if (hadirStatus) {
        btnHadir.classList.add('btn-done');
        btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
        btnHadir.style.pointerEvents = 'none';
        console.log('✅ Set btnHadir to SUDAH HADIR');
    }
    if (pulangStatus) {
        btnPulang.classList.add('btn-done');
        btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
        btnPulang.style.pointerEvents = 'none';
        console.log('✅ Set btnPulang to SUDAH PULANG');
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

// ============================================================
// 23. PROFILE RAPORT
// ============================================================
function goToProfileRaport() {
    const p = activePegawai || dbF[uIdx];
    if (!p) return showToast('Peringatan', 'Pilih pegawai.', 'warning');
    
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
// 24. MANUAL REFRESH
// ============================================================
async function manualRefreshStatus() {
    const btn = document.querySelector('.btn-refresh-status');
    if (btn) {
        btn.innerHTML = '<i data-lucide="refresh-cw" size="18" style="animation:spin 0.8s linear infinite"></i>';
        lucide.createIcons();
    }
    
    showToast('Memperbarui', 'Mengambil data terbaru...', 'info');
    try {
        const success = await refreshPresensiData();
        if (success) {
            updateUIAfterRefresh();
            showToast('Berhasil', 'Status diperbarui.', 'success');
        } else {
            showToast('Peringatan', 'Gagal refresh.', 'warning');
        }
    } catch (e) {
        showToast('Gagal', 'Gagal memperbarui.', 'error');
    }
    
    if (btn) {
        btn.innerHTML = '<i data-lucide="refresh-cw" size="18"></i>';
        lucide.createIcons();
    }
}

async function forceUpdateStatus() {
    const success = await refreshPresensiData();
    if (success) {
        updateUIAfterRefresh();
        showToast('Status Diperbarui', 'Berhasil.', 'success');
    } else {
        showToast('Gagal', 'Gagal memperbarui.', 'error');
    }
}

// ============================================================
// 25. UPDATE UI AFTER REFRESH
// ============================================================
function updateUIAfterRefresh() {
    const isFormOpen = document.getElementById('stepForm').style.display === 'flex';
    if (!isFormOpen) return;
    
    const p = activePegawai || dbF[uIdx];
    if (!p) return;
    
    const pid = p.ID || p.id;
    const btnHadir = document.getElementById('btnHadirMain');
    const btnPulang = document.getElementById('btnPulangMain');
    
    if (!btnHadir || !btnPulang) return;
    
    const hadirStatus = checkAtt(pid, 'HADIR');
    const pulangStatus = checkAtt(pid, 'PULANG');
    
    btnHadir.classList.remove('active', 'btn-done');
    btnPulang.classList.remove('active', 'btn-done');
    btnHadir.innerHTML = '<i data-lucide="sun" size="28"></i><span>HADIR</span>';
    btnPulang.innerHTML = '<i data-lucide="moon" size="28"></i><span>PULANG</span>';
    btnHadir.style.pointerEvents = ''; btnHadir.style.opacity = '';
    btnPulang.style.pointerEvents = ''; btnPulang.style.opacity = '';
    
    if (hadirStatus) {
        btnHadir.classList.add('btn-done');
        btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
        btnHadir.style.pointerEvents = 'none';
    }
    if (pulangStatus) {
        btnPulang.classList.add('btn-done');
        btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
        btnPulang.style.pointerEvents = 'none';
    }
    
    updateAttendanceStatusIndicator();
    lucide.createIcons();
}

function detectReturnFromProfile() {
    const justReturned = sessionStorage.getItem('return_from_profile');
    if (justReturned === 'true') {
        sessionStorage.removeItem('return_from_profile');
        refreshPresensiData().then((success) => {
            if (success) {
                updateUIAfterRefresh();
                showToast('Data Diperbarui', 'Status diperbarui.', 'success');
            }
        });
    }
}

// ============================================================
// 26. CAMERA FUNCTIONS
// ============================================================
// [CAMERA FUNCTIONS - SAMA SEPERTI SEBELUMNYA, TIDAK DIUBAH]
// ... (triggerCam, stopCam, stopCurrentStream, triggerFallbackCamera, triggerGallery, uploadSurat)

// ============================================================
// 27. IMAGE PROCESSING
// ============================================================
// [IMAGE PROCESSING - SAMA SEPERTI SEBELUMNYA, TIDAK DIUBAH]
// ... (compressImage, processGalleryImage, processFallbackImage, savePhoto)

// ============================================================
// 28. WATERMARK
// ============================================================
// [WATERMARK - SAMA SEPERTI SEBELUMNYA, TIDAK DIUBAH]
// ... (addWatermark, drawMapPinIcon, drawClockIcon)

// ============================================================
// 29. CAMERA OVERLAY
// ============================================================
// [CAMERA OVERLAY - SAMA SEPERTI SEBELUMNYA, TIDAK DIUBAH]
// ... (startSelfieOverlay, startWorkOverlay, capturePhoto, checkImageQuality, updateStatusUI)

// ============================================================
// 30. CANVAS DRAWING HELPERS
// ============================================================
// [CANVAS DRAWING - SAMA SEPERTI SEBELUMNYA, TIDAK DIUBAH]
// ... (drawCornerBrackets, drawLaserLine, drawFaceGuide, drawFaceWireframe, drawRuleOfThirds, drawCrosshair, drawWorkLabel)

// ============================================================
// 31. APP VERSION CHECK
// ============================================================
function checkAppVersion() {
    const currentVersion = "v2.8.0";
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
    document.getElementById('notifMessage').innerText = "Versi terbaru telah dirilis. Muat ulang untuk mendapatkan fitur terbaru.";
    
    const btnOk = document.getElementById('btnNotifOk');
    btnOk.innerHTML = '<i data-lucide="refresh-cw" size="18"></i> Muat Ulang';
    
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
// 32. 🆕 BACKGROUND KEEP-ALIVE (CEGAH COLD START)
// ============================================================
async function keepAlivePing() {
    if (!navigator.onLine) return;
    try {
        await fetchWithTimeout(API + "?action=keepAlive&cb=" + Date.now(), { 
            method: 'GET', 
            cache: 'no-store' 
        }, 10000);
        console.info("🟢 KeepAlive ping OK");
    } catch (e) {
        // Silent fail - keep alive is non-critical
    }
}

// ============================================================
// ✅ 33. onNotesInput - SINGLE DEFINITION
// ============================================================
function onNotesInput() {
    updateNotesCounter();
    updateWorkflow();
    saveAutoRecovery();
}

// ============================================================
// ✅ 34. closeForm - SINGLE DEFINITION
// ============================================================
function closeForm() {
    if (isFormLoading) return;
    
    stopCam();
    stopCurrentStream();
    
    document.getElementById('stepForm').style.display = 'none';
    document.getElementById('stepSelector').style.display = 'flex';
    
    activePegawai = null;
    selectedStatus = '';
    sB64 = null;
    kB64 = null;
    suratB64 = null;
    
    document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));
    document.getElementById('statusBadge').classList.remove('show');
    document.getElementById('statusInfo').style.display = 'none';
    document.getElementById('specialStatusGrid').classList.remove('show');
    document.getElementById('notes').value = '';
    document.getElementById('attendanceStatusIndicator').innerHTML = '';
    updateNotesCounter();
    lucide.createIcons();
    
    if (map) {
        map.remove();
        map = null;
        marker = null;
        isInitialMapBound = false;
    }
    
    uPos = { lat: 0, lng: 0 };
    const gpsTxt = document.getElementById('gpsTxt');
    if (gpsTxt) gpsTxt.innerText = 'Menunggu Koordinat GPS...';
    
    isFormLoading = false;
    isInitialMapBound = false;
    
    sessionStorage.removeItem('pusda_recovery');
}

// ============================================================
// 35. INITIALIZATION
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
        const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
        const liveClock = document.getElementById('liveClock');
        if (liveClock) liveClock.innerText = timeStr;
        updateWatermarkClock();
    }, 1000);
    
    updateWatermarkClock();
    checkAppVersion();
    detectReturnFromProfile();
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('📱 Tab aktif, refresh data...');
            refreshPresensiData().then(() => {
                updateUIAfterRefresh();
                updateButtonColors();
            });
        }
    });
    
    window.addEventListener('focus', () => {
        refreshPresensiData().then(() => {
            updateUIAfterRefresh();
            updateButtonColors();
        });
    });
    
    setInterval(() => {
        const isFormOpen = document.getElementById('stepForm').style.display === 'flex';
        if (isFormOpen) {
            refreshPresensiData().then(() => {
                updateUIAfterRefresh();
                updateButtonColors();
            });
        }
    }, 30000);
    
    setInterval(keepAlivePing, 5 * 60 * 1000);
    
    try {
        if ('serviceWorker' in navigator) {
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:' || 
                (protocol === 'http:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
            
            if (isSecure) {
                navigator.serviceWorker.register('sw.js')
                    .then(() => console.log('✅ Service Worker registered'))
                    .catch(err => console.warn('⚠️ SW registration failed:', err));
            } else {
                console.info('ℹ️ SW skipped - protocol not supported');
            }
        }
    } catch (e) {
        console.warn('⚠️ SW error:', e.message);
    }
};
