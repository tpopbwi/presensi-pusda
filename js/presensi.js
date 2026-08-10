// ============================================================
// PRESENSI.JS - v3.1.0 (STRICT PAIRING + MAINTAINABLE)
// ============================================================
// ATURAN BISNIS:
// 1. Sakit  - Max 1x sehari - Tidak perlu pairing
// 2. Izin   - Max 1x sehari - Tidak perlu pairing
// 3. Dinas  - Max 1x sehari - Tidak perlu pairing
// 4. Hadir/Terlambat       - Max 1x - Pairing WAJIB Pulang biasa
// 5. QR Hadir/QR Terlambat - Max 1x - Pairing WAJIB QR Pulang
// 6. Pulang biasa  - HANYA jika Hadir biasa (BUKAN QR)
// 7. QR Pulang     - HANYA jika QR Hadir (BUKAN Hadir biasa)
// 8. Nilai maksimal per hari = 100
//
// CHANGELOG v3.1.0:
// - FIX: checkTodayStatus() dengan multi-field ID detection
// - FIX: updatePulangButton() dengan auto-refresh fallback
// - FIX: forceRefreshAndCheck() untuk manual override
// - FIX: Force refresh setelah submit HADIR
// - REFACTOR: Struktur section konsisten untuk maintainability
// ============================================================

// ============================================================
// SECTION 0: CORS & NETWORK HANDLING
// ============================================================

/**
 * Fetch dengan CORS handling untuk GAS + GitHub Pages
 * @param {string} url - Target URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function fetchWithCors(url, options = {}) {
    const defaultOptions = {
        redirect: 'follow',
        mode: 'cors',
        credentials: 'omit'
    };

    const mergedOptions = { ...defaultOptions, ...options };
    const isPost = mergedOptions.body && mergedOptions.method === 'POST';

    if (isPost) {
        mergedOptions.method = 'POST';
        mergedOptions.headers = {
            'Content-Type': 'text/plain;charset=utf-8'
        };
    } else {
        mergedOptions.method = mergedOptions.method || 'GET';
        if (!mergedOptions.headers) mergedOptions.headers = {};
    }

    console.log('📡 Fetch:', url, mergedOptions.method);

    try {
        const response = await fetch(url, mergedOptions);

        if (response.type === 'opaque') {
            console.warn('⚠️ Opaque response - CORS blocked but request sent');
            return {
                ok: true,
                status: 200,
                json: async () => ({ status: 'success', message: 'Request sent (opaque)' }),
                text: async () => '{"status":"success","message":"Request sent"}'
            };
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
    } catch (error) {
        // Fallback untuk GET yang diblokir CORS
        if (!isPost && (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.message.includes('NetworkError'))) {
            console.warn('⚠️ CORS blocked on GET, retrying with no-cors...');
            try {
                await fetch(url, {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-store'
                });
                return {
                    ok: false,
                    status: 500,
                    json: async () => ({ status: 'error', message: 'CORS blocked by Google redirect' }),
                    text: async () => '{"status":"error","message":"CORS blocked"}'
                };
            } catch (retryError) {
                console.error('❌ Retry with no-cors also failed:', retryError);
                throw error;
            }
        }

        // Fallback untuk POST yang diblokir CORS
        if (isPost && (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.message.includes('NetworkError'))) {
            console.warn('⚠️ CORS blocked on POST, retrying with no-cors...');
            try {
                const noCorsOptions = {
                    ...mergedOptions,
                    mode: 'no-cors'
                };
                await fetch(url, noCorsOptions);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        status: 'success',
                        message: 'Data terkirim (CORS blocked but sent)',
                        statusFix: 'Hadir'
                    }),
                    text: async () => '{"status":"success","message":"Sent via no-cors"}'
                };
            } catch (retryError) {
                console.error('❌ Retry with no-cors also failed:', retryError);
                throw retryError;
            }
        }

        console.error('❌ Fetch error:', error);
        throw error;
    }
}

/**
 * Fetch dengan timeout
 */
function fetchWithTimeout(url, options = {}, timeout = 20000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    return fetchWithCors(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

/**
 * Fetch dengan retry mechanism
 */
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
// SECTION 1: KONFIGURASI GLOBAL
// ============================================================

const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const API = "https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec";

/**
 * Generate API URL dengan action dan params
 */
function getApiUrl(action, params = {}) {
    const url = new URL(API);
    url.searchParams.append('action', action);
    url.searchParams.append('cb', Date.now());
    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });
    return url.toString();
}

/**
 * Parse time string "HH:MM" menjadi number HHMM
 */
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(':');
    return (parseInt(parts[0]) || 0) * 100 + (parseInt(parts[1]) || 0);
}

/**
 * Format number HHMM menjadi string "HH:MM"
 */
function formatTime(timeVal) {
    const hours = String(Math.floor(timeVal / 100)).padStart(2, '0');
    const minutes = String(timeVal % 100).padStart(2, '0');
    return hours + ':' + minutes;
}

let appConfig = { jHadir: "08:00", jTelat: "08:10", jPulang: "16:00" };
let activePegawai = null;

// ============================================================
// SECTION 2: PWA MANIFEST
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

const pwaManifestEl = document.getElementById('pwaManifest');
if (pwaManifestEl) {
    pwaManifestEl.setAttribute('href', URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' })));
}

// ============================================================
// SECTION 3: POLYFILL
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
// SECTION 4: VARIABEL GLOBAL
// ============================================================

// Face API state
let isFaceApiLoaded = false, isFaceApiLoading = false;
let isLandmarkReady = false, pendingCamType = null, currentStream = null;
let lastGoodDetection = null, faceDetected = false, detectionStableCount = 0;
const STABLE_THRESHOLD = 3;
let detectIntervalId = null, laserY = 0, laserDirection = 1;

// UI state
let isInitialMapBound = false, _lastFrameTime = 0;
let isFormLoading = false, _lastToastKey = '', _lastToastTime = 0;
let toastQueue = [], isToastShowing = false;
let map = null, marker = null;
let uPos = { lat: 0, lng: 0 };
let cType = '', sB64 = null, kB64 = null;
let selectedStatus = '', calculatedScore = 0;
let _activeResizeHandler = null, suratB64 = null;
let _canvasW = 0, _canvasH = 0, _rafRunning = false;

// Data state
let dbE = [], dbF = [], dbP = [], uIdx = 0;

// Submit state
let isSubmitting = false;
let lastRefreshTime = 0;
const REFRESH_COOLDOWN = 30000;

// Placeholder image
const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 85'%3E%3Crect width='60' height='85' fill='%232e446e'/%3E%3Cpath d='M30 40c5.5 0 10-4.5 10-10s-4.5-10-10-10-10 4.5-10 10 4.5 10 10 10zm0 5c-8 0-20 4-20 12v5h40v-5c0-8-12-12-20-12z' fill='%23fff' opacity='.2'/%3E%3C/svg%3E";

// ============================================================
// SECTION 5: AUDIO WITH FALLBACK
// ============================================================

function createAudioWithFallback(url) {
    const audio = new Audio();
    audio.src = url;

    const SILENT_AUDIO = 'data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYWGhoaHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eH';

    audio.onerror = () => {
        console.warn('⚠️ Audio failed to load:', url);
        audio.src = SILENT_AUDIO;
        audio.onerror = null;
    };

    return audio;
}

const sndShutter = createAudioWithFallback('https://assets.mixkit.co/active_storage/sfx/738/738-preview.mp3');
const sndSuccess = createAudioWithFallback('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
const sndError = createAudioWithFallback('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');

const logoCache = new Image();
logoCache.crossOrigin = "anonymous";
logoCache.src = GITHUB_LOGO_URL;

// ============================================================
// SECTION 6: STATUS CONFIGURATION
// ============================================================

const STATUS_CONFIG = {
    'HADIR': {
        placeholder: 'Tuliskan ringkasan tugas hari ini...',
        title: '✅ HADIR',
        message: '<b>Aturan Waktu:</b><br>• ≤ 08:00 = Poin 50<br>• 08:01-08:10 = Poin 40<br>• > 08:10 = Poin 25<br><br><b>Pairing:</b> Wajib PULANG biasa',
        icon: 'check-circle',
        color: 'var(--success)',
        borderColor: 'var(--success)',
        actions: []
    },
    'PULANG': {
        placeholder: 'Tuliskan ringkasan hasil kerja hari ini...',
        title: '🌙 PULANG',
        message: 'Absensi pulang tercatat.<br><b>Pairing:</b> Hanya jika Hadir biasa (BUKAN QR)',
        icon: 'moon',
        color: 'var(--pu-blue)',
        borderColor: 'var(--pu-blue)',
        actions: []
    },
    'IZIN': {
        placeholder: 'Jelaskan alasan izin...',
        title: '📝 IZIN',
        message: 'Max 1x sehari. Hubungi Koordinator / Pimpinan.',
        icon: 'file-text',
        color: '#d8b4fe',
        borderColor: '#a855f7',
        actions: [{ label: 'Lampirkan Surat', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'SAKIT': {
        placeholder: 'Jelaskan kondisi sakit...',
        title: '🏥 SAKIT',
        message: 'Max 1x sehari. Lampirkan surat dokter.',
        icon: 'heart-pulse',
        color: '#fde047',
        borderColor: 'var(--warning)',
        actions: [{ label: 'Surat Dokter', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'DINAS': {
        placeholder: 'Jelaskan lokasi dan tujuan dinas...',
        title: '💼 DINAS',
        message: 'Max 1x sehari. Lampirkan surat tugas.',
        icon: 'briefcase',
        color: '#fdba74',
        borderColor: 'var(--accent)',
        actions: [{ label: 'Surat Tugas', icon: 'paperclip', action: 'uploadSurat' }]
    },
    'QUICK RESPONSE': {
        placeholder: 'Tuliskan ringkasan tugas darurat...',
        title: '⚡ QUICK RESPONSE',
        message: '<b>Pagi:</b> QR Hadir (pairing QR Pulang)<br><b>Sore:</b> QR Pulang (hanya jika QR Hadir pagi)',
        icon: 'zap',
        color: '#f9a8d4',
        borderColor: '#ec4899',
        actions: []
    }
};

// ============================================================
// SECTION 7: DEVICE PROFILE
// ============================================================

const DeviceProfile = (() => {
    const cores = navigator.hardwareConcurrency || 2;
    const ram = navigator.deviceMemory || 2;
    const isSlowNetwork = navigator.connection
        ? ['slow-2g', '2g', '3g'].includes(navigator.connection.effectiveType)
        : false;

    let tier = 'low';

    if ((ram >= 8 && !isSlowNetwork) || (ram >= 4 && cores >= 6 && !isSlowNetwork)) {
        tier = 'high';
    } else if (ram >= 3 && cores >= 4) {
        tier = 'mid';
    }

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
// SECTION 8: UTILITY FUNCTIONS
// ============================================================

/**
 * Get waktu Jakarta dalam format HHMM
 */
function getJakartaTimeVal() {
    const now = new Date();
    const jakartaString = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaString);
    return (jakartaDate.getHours() * 100) + jakartaDate.getMinutes();
}

/**
 * Show toast notification
 */
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

    if (!modal || !content) return;

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
    const overlayText = document.getElementById('overlayText');
    if (!o) return;
    if (overlayText) overlayText.innerText = t;
    o.style.display = s ? 'flex' : 'none';
    o.style.pointerEvents = s ? 'all' : 'none';
}

// ============================================================
// SECTION 9: WATERMARK CLOCK
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
// SECTION 10: BUTTON STATE MANAGEMENT (FIXED)
// ============================================================

/**
 * Update warna tombol HADIR berdasarkan waktu
 */
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

/**
 * ✅ FIXED: Check status hari ini dengan multi-field ID detection
 * @param {string|number} pid - ID pegawai
 * @returns {Object} Status flags
 */
function checkTodayStatus(pid) {
    const todayStr = new Date().toISOString().split('T')[0];

    // ✅ FIX 1: Filter dengan multiple field name variations
    const todayRecords = dbP.filter(r => {
        const d = new Date(r.timestamp);
        const recordDateStr = d.toISOString().split('T')[0];

        // ✅ Cek semua kemungkinan field name untuk ID
        const recordId = String(
            r.id_pegawai ||
            r.ID_Pegawai ||
            r.ID ||
            r.id ||
            r['ID Pegawai'] ||
            ''
        ).trim().toLowerCase();

        const targetId = String(pid).trim().toLowerCase();
        const isMatch = recordDateStr === todayStr && recordId === targetId;

        // ✅ DEBUG LOG
        if (recordDateStr === todayStr) {
            console.log(`🔍 Record found for today:`);
            console.log(`   Record ID: "${recordId}"`);
            console.log(`   Target ID: "${targetId}"`);
            console.log(`   Match: ${isMatch}`);
            console.log(`   Status: "${r.status}"`);
        }

        return isMatch;
    });

    console.log(`📊 checkTodayStatus(${pid}):`);
    console.log(`   Today: ${todayStr}`);
    console.log(`   Total records in dbP: ${dbP.length}`);
    console.log(`   Records for today: ${todayRecords.length}`);

    const result = {
        hasHadirBiasa: false,
        hasQRHadir: false,
        hasPulangBiasa: false,
        hasQRPulang: false,
        hasIzin: false,
        hasSakit: false,
        hasDinas: false,
        totalNilaiHariIni: 0,
        records: todayRecords
    };

    todayRecords.forEach(r => {
        // ✅ FIX 2: Convert to lowercase untuk case-insensitive match
        const s = String(r.status || '').toLowerCase().trim();
        const nilai = parseInt(r.nilai) || 0;
        result.totalNilaiHariIni += nilai;

        console.log(`   Processing status: "${s}"`);

        // ✅ Detect Hadir Biasa (case-insensitive)
        if (s === 'hadir' ||
            s === 'terlambat ringan' ||
            s === 'terlambat berat' ||
            (s.includes('hadir') && !s.includes('qr'))) {
            result.hasHadirBiasa = true;
            console.log(`   ✅ Detected: hasHadirBiasa = true`);
        }

        // ✅ Detect QR Hadir
        if (s.includes('qr hadir') || s.includes('qr terlambat')) {
            result.hasQRHadir = true;
            console.log(`   ✅ Detected: hasQRHadir = true`);
        }

        // ✅ Detect Pulang Biasa
        if (s === 'pulang' && !s.includes('qr')) {
            result.hasPulangBiasa = true;
            console.log(`   ✅ Detected: hasPulangBiasa = true`);
        }

        // ✅ Detect QR Pulang
        if (s.includes('qr pulang')) {
            result.hasQRPulang = true;
            console.log(`   ✅ Detected: hasQRPulang = true`);
        }

        // ✅ Detect Special
        if (s.includes('izin')) result.hasIzin = true;
        if (s.includes('sakit')) result.hasSakit = true;
        if (s.includes('dinas')) result.hasDinas = true;
    });

    // Helper flags
    result.hasAnyHadir = result.hasHadirBiasa || result.hasQRHadir;
    result.hasAnyPulang = result.hasPulangBiasa || result.hasQRPulang;
    result.hasSpecial = result.hasIzin || result.hasSakit || result.hasDinas;
    result.specialType = result.hasIzin ? 'izin' : (result.hasSakit ? 'sakit' : (result.hasDinas ? 'dinas' : null));

    console.log(`   Final result:`, result);

    return result;
}

/**
 * ✅ FIXED: Update tombol PULANG dengan auto-refresh fallback
 */
function updatePulangButton() {
    const btnPulang = document.getElementById('btnPulangMain');
    if (!btnPulang) return;

    if (btnPulang.classList.contains('btn-done')) return;

    const timeVal = getJakartaTimeVal();
    const jamPulangLimit = parseTime(appConfig.jPulang || "16:00");
    const p = activePegawai || dbF[uIdx];

    if (!p) return;

    const pid = p.ID || p.id;
    const status = checkTodayStatus(pid);

    console.log(`🔘 updatePulangButton() for ${pid}:`);
    console.log(`   hasAnyHadir: ${status.hasAnyHadir}`);
    console.log(`   hasAnyPulang: ${status.hasAnyPulang}`);
    console.log(`   hasQRHadir: ${status.hasQRHadir}`);

    btnPulang.classList.remove('warning-state');

    // ✅ Sudah PULANG
    if (status.hasAnyPulang) {
        btnPulang.classList.add('btn-done');
        btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
        btnPulang.disabled = true;
        lucide.createIcons();
        return;
    }

    // Hitung sisa waktu
    const jamSekarang = Math.floor(timeVal / 100);
    const menitSekarang = timeVal % 100;
    const jamPulang = Math.floor(jamPulangLimit / 100);
    const menitPulang = jamPulangLimit % 100;

    const totalMenitSekarang = jamSekarang * 60 + menitSekarang;
    const totalMenitPulang = jamPulang * 60 + menitPulang;
    const sisaMenit = totalMenitPulang - totalMenitSekarang;

    if (sisaMenit > 0) {
        // ❌ Belum jam pulang
        const jamSisa = Math.floor(sisaMenit / 60);
        const menitSisa = sisaMenit % 60;

        btnPulang.disabled = true;
        btnPulang.innerHTML = `
            <i data-lucide="clock" size="24"></i>
            <span>PULANG</span>
            <small>${jamSisa > 0 ? jamSisa + 'j ' : ''}${menitSisa}m lagi</small>
        `;
        btnPulang.title = `Pulang tersedia setelah jam ${appConfig.jPulang || '16:00'}`;

    } else if (!status.hasAnyHadir) {
        // ✅ FIX 3: Jika tidak ada record HADIR di dbP, coba force refresh dulu
        console.warn(`⚠️ No HADIR record found, attempting force refresh...`);

        btnPulang.disabled = true;
        btnPulang.classList.add('warning-state');
        btnPulang.innerHTML = `
            <i data-lucide="alert-circle" size="24"></i>
            <span>REFRESH</span>
            <small>Klik untuk refresh</small>
        `;
        btnPulang.title = 'Data HADIR tidak ditemukan. Klik untuk refresh dari server.';

        // ✅ Auto-refresh setiap 10 detik jika masih belum ada HADIR
        setTimeout(() => {
            if (!status.hasAnyHadir) {
                refreshPresensiData().then(success => {
                    if (success) {
                        console.log('✅ Auto-refresh successful, updating button...');
                        updatePulangButton();
                    }
                });
            }
        }, 10000);

    } else if (status.hasQRHadir) {
        // ❌ STRICT: QR Hadir tidak bisa pairing dengan Pulang biasa
        btnPulang.disabled = true;
        btnPulang.classList.add('warning-state');
        btnPulang.innerHTML = `
            <i data-lucide="zap" size="24"></i>
            <span>PAKAI QR</span>
        `;
        btnPulang.title = '❌ Anda QR HADIR pagi ini. Gunakan QUICK RESPONSE untuk QR PULANG';

    } else {
        // ✅ Hadir biasa + sudah jam pulang → ENABLE
        btnPulang.disabled = false;
        btnPulang.innerHTML = `
            <i data-lucide="moon" size="28"></i>
            <span>PULANG</span>
        `;
        btnPulang.title = '✅ Klik untuk absen PULANG';
    }

    lucide.createIcons();
}

/**
 * ✅ NEW: Force refresh and check (manual override)
 */
async function forceRefreshAndCheck() {
    console.log('🔄 Force refresh triggered...');

    showToast('Memperbarui', 'Mengambil data terbaru dari server...', 'info');

    try {
        const success = await refreshPresensiData();

        if (success) {
            console.log('✅ Force refresh successful');
            showToast('Berhasil', 'Data diperbarui. Silakan coba lagi.', 'success');

            updateButtonStates();

            const isFormOpen = document.getElementById('stepForm').style.display === 'flex';
            if (isFormOpen) {
                updateUIAfterRefresh();
            }
        } else {
            console.warn('⚠️ Force refresh failed');
            showToast('Gagal', 'Gagal refresh data. Periksa koneksi.', 'error');
        }
    } catch (e) {
        console.error('❌ Force refresh error:', e);
        showToast('Error', 'Terjadi kesalahan saat refresh.', 'error');
    }
}

/**
 * Update tombol QUICK RESPONSE (STRICT PAIRING)
 */
function updateQRButton() {
    const btnQR = document.querySelector('.btn-qr-status');
    if (!btnQR) return;

    if (btnQR.classList.contains('btn-done')) return;

    const p = activePegawai || dbF[uIdx];
    if (!p) return;

    const pid = p.ID || p.id;
    const status = checkTodayStatus(pid);
    const timeVal = getJakartaTimeVal();
    const jamPulangLimit = parseTime(appConfig.jPulang || "16:00");
    const isMorning = timeVal < jamPulangLimit;

    btnQR.classList.remove('warning-state');

    if (isMorning) {
        // ✅ PAGI: QR HADIR
        if (status.hasAnyHadir) {
            btnQR.disabled = true;
            btnQR.style.opacity = '0.4';
            btnQR.style.pointerEvents = 'none';
            btnQR.title = '❌ Sudah HADIR/QR HADIR hari ini';
        } else if (status.hasSpecial) {
            btnQR.disabled = true;
            btnQR.style.opacity = '0.4';
            btnQR.style.pointerEvents = 'none';
            btnQR.title = '❌ Sudah punya status khusus hari ini';
        } else if (status.hasAnyPulang) {
            btnQR.disabled = true;
            btnQR.style.opacity = '0.4';
            btnQR.style.pointerEvents = 'none';
            btnQR.title = '❌ Sudah PULANG hari ini';
        } else {
            btnQR.disabled = false;
            btnQR.style.opacity = '1';
            btnQR.style.pointerEvents = 'auto';
            btnQR.title = '✅ Klik untuk QR HADIR';
        }
    } else {
        // ✅ SORE: QR PULANG
        if (status.hasAnyPulang) {
            btnQR.disabled = true;
            btnQR.style.opacity = '0.4';
            btnQR.style.pointerEvents = 'none';
            btnQR.title = '❌ Sudah PULANG/QR PULANG hari ini';
        } else if (!status.hasAnyHadir) {
            btnQR.disabled = true;
            btnQR.style.opacity = '0.4';
            btnQR.style.pointerEvents = 'none';
            btnQR.title = '❌ Harap HADIR/QR HADIR terlebih dahulu';
        } else if (status.hasHadirBiasa && !status.hasQRHadir) {
            // ❌ STRICT: Hadir biasa tidak bisa pairing dengan QR Pulang
            btnQR.disabled = true;
            btnQR.classList.add('warning-state');
            btnQR.style.opacity = '0.5';
            btnQR.style.pointerEvents = 'none';
            btnQR.title = '❌ Anda HADIR biasa pagi ini. Gunakan tombol PULANG biasa';
        } else {
            btnQR.disabled = false;
            btnQR.style.opacity = '1';
            btnQR.style.pointerEvents = 'auto';
            btnQR.title = '✅ Klik untuk QR PULANG';
        }
    }
}

/**
 * Update tombol S/I/D (Max 1x sehari)
 */
function updateSpecialButtons() {
    const p = activePegawai || dbF[uIdx];
    if (!p) return;

    const pid = p.ID || p.id;
    const status = checkTodayStatus(pid);

    const specialDisabled = status.hasSpecial || status.hasAnyHadir;

    const btnIzin = document.querySelector('.btn-izin');
    const btnSakit = document.querySelector('.btn-sakit');
    const btnDinas = document.querySelector('.btn-dinas');

    [btnIzin, btnSakit, btnDinas].forEach(btn => {
        if (!btn) return;
        btn.disabled = specialDisabled;
        btn.style.opacity = specialDisabled ? '0.4' : '1';
        btn.style.pointerEvents = specialDisabled ? 'none' : 'auto';

        if (specialDisabled) {
            if (status.hasSpecial) {
                btn.title = `❌ Sudah ${status.specialType.toUpperCase()} hari ini`;
            } else if (status.hasAnyHadir) {
                btn.title = '❌ Sudah HADIR, tidak bisa status khusus';
            }
        } else {
            btn.title = '';
        }
    });
}

/**
 * ✅ Wrapper untuk update semua button states
 */
function updateButtonStates() {
    updateButtonColors();
    updatePulangButton();
    updateQRButton();
    updateSpecialButtons();
}

// ============================================================
// SECTION 11: FACE API
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
// SECTION 12: GPS & GEOFENCING
// ============================================================

function upLoc(retryCount = 0) {
    const g = document.getElementById('gpsTxt');
    if (!g) return;

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
// SECTION 13: MAP
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
// SECTION 14: PERMISSION MODAL
// ============================================================

function showPermissionModal(type) {
    const m = document.getElementById('permissionModal');
    const t = document.getElementById('permTitle');
    const d = document.getElementById('permDesc');
    const s = document.getElementById('permSteps');
    const b = document.getElementById('permRetryBtn');

    if (!m) return;

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
    const m = document.getElementById('permissionModal');
    if (m) m.classList.remove('show');
}

// ============================================================
// SECTION 15: SURAT MODAL
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
// SECTION 16: UI UPDATE FUNCTIONS
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
    if (!notes) return;

    const len = notes.value.length;

    if (counter) {
        counter.textContent = `${len}/500`;
        counter.classList.remove('warning', 'valid');

        if (len === 0) {
            if (clearBtn) clearBtn.classList.remove('show');
        } else if (len < 5) {
            counter.classList.add('warning');
            if (clearBtn) clearBtn.classList.add('show');
        } else {
            counter.classList.add('valid');
            if (clearBtn) clearBtn.classList.add('show');
        }
    }

    notes.style.height = 'auto';
    notes.style.height = Math.min(notes.scrollHeight, 200) + 'px';
}

function clearNotes() {
    const notes = document.getElementById('notes');
    if (notes) notes.value = '';
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
        if (info) info.style.display = 'none';
        if (badge) badge.classList.remove('show');
        return;
    }

    if (badge) {
        badge.className = 'status-badge show';
        if (status === 'IZIN') badge.classList.add('badge-izin');
        else if (status === 'SAKIT') badge.classList.add('badge-sakit');
        else if (status === 'DINAS') badge.classList.add('badge-dinas');
        else if (status === 'QUICK RESPONSE') badge.classList.add('badge-qr');
        badgeText.textContent = status;
    }

    if (info) {
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
    }

    if (textarea) textarea.placeholder = config.placeholder;
    lucide.createIcons();
}

function updateWorkflow() {
    const gpsReady = uPos.lat !== 0;
    const statusReady = selectedStatus !== '';
    const notesEl = document.getElementById('notes');
    const notesReady = notesEl && notesEl.value.trim().length >= 5;

    const statusBox1 = document.getElementById('statusBox1');
    const specialStatusHeader = document.getElementById('specialStatusHeader');
    const specialStatusGrid = document.getElementById('specialStatusGrid');
    const notesBox = document.getElementById('notesBox');
    const photoBox = document.getElementById('photoBox');

    if (statusBox1) statusBox1.classList.toggle('workflow-locked', !gpsReady);
    if (specialStatusHeader) specialStatusHeader.classList.toggle('workflow-locked', !gpsReady);
    if (specialStatusGrid) specialStatusGrid.classList.toggle('workflow-locked', !gpsReady);
    if (notesBox) notesBox.classList.toggle('workflow-locked', !statusReady);
    if (photoBox) photoBox.classList.toggle('workflow-locked', !notesReady);
}

function clearHeavyData() {
    sB64 = null; kB64 = null; suratB64 = null;

    const sImg = document.getElementById('sImg');
    const kImg = document.getElementById('kImg');
    const sPh = document.getElementById('sPh');
    const kPh = document.getElementById('kPh');

    if (sImg) { sImg.src = ""; sImg.style.display = 'none'; }
    if (kImg) { kImg.src = ""; kImg.style.display = 'none'; }
    if (sPh) sPh.style.display = 'block';
    if (kPh) kPh.style.display = 'block';

    const specialStatusGrid = document.getElementById('specialStatusGrid');
    if (specialStatusGrid) specialStatusGrid.classList.remove('show');

    const collapseIcon = document.getElementById('collapseIcon');
    if (collapseIcon) collapseIcon.setAttribute('data-lucide', 'chevron-down');

    const statusBadge = document.getElementById('statusBadge');
    if (statusBadge) statusBadge.classList.remove('show');

    const statusInfo = document.getElementById('statusInfo');
    if (statusInfo) statusInfo.style.display = 'none';

    const attendanceStatusIndicator = document.getElementById('attendanceStatusIndicator');
    if (attendanceStatusIndicator) attendanceStatusIndicator.innerHTML = '';

    const notes = document.getElementById('notes');
    if (notes) notes.value = '';

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
    if (!g || !i) return;
    g.classList.toggle('show');
    i.setAttribute('data-lucide', g.classList.contains('show') ? 'chevron-up' : 'chevron-down');
    lucide.createIcons();
}

// ============================================================
// SECTION 17: AUTO RECOVERY
// ============================================================

function saveAutoRecovery() {
    const notes = document.getElementById('notes');
    const data = {
        timestamp: Date.now(),
        notes: notes ? notes.value : '',
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
            const notes = document.getElementById('notes');
            if (notes) notes.value = data.notes || "";
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
// SECTION 18: DATA FETCHING
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

        const sidebarLogo = document.getElementById('sidebarLogo');
        if (sidebarLogo) sidebarLogo.src = d1.config?.Logo || GITHUB_LOGO_URL;

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

        const pName = document.getElementById('pName');
        const pJob = document.getElementById('pJob');
        if (pName) {
            pName.innerText = "GAGAL MEMUAT";
            pName.style.color = "var(--danger)";
        }
        if (pJob) pJob.innerText = "Periksa koneksi internet";

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
// SECTION 19: UI RENDER
// ============================================================

function renderChips() {
    const w = ["ALL", ...new Set(dbE.map(p => (p.Wilayah || p.wilayah || "").trim()).filter(x => x))];
    const wilChips = document.getElementById('wilChips');
    if (!wilChips) return;
    wilChips.innerHTML = w.map(x =>
        `<div class="chip-pill ${x === 'ALL' ? 'active' : ''}" data-wil="${x}" onclick="setWil('${x}',this)">${x}</div>`
    ).join('');
}

function setWil(w, el) {
    document.querySelectorAll('.chip-pill').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    applyFilters();
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const s = searchInput ? searchInput.value.toLowerCase().trim() : '';
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
    const pName = document.getElementById('pName');
    const pImg = document.getElementById('pImg');
    const pWil = document.getElementById('pWil');
    const pJob = document.getElementById('pJob');

    if (!p) {
        if (pName) pName.innerText = "TIDAK DITEMUKAN";
        if (pImg) pImg.src = placeholderImg;
        if (pWil) pWil.innerText = "WILAYAH: " + (w === 'all' ? 'ALL' : w);
        if (pJob) pJob.innerText = "Pencarian Nihil";
        return;
    }

    const rawUrl = p.Link_Foto_Profile || p.link_foto_profile || "";
    let finalSrc = placeholderImg;

    if (rawUrl && rawUrl !== '-') {
        let fileId = "";
        let match = rawUrl.match(/\/d\/([^\/\?]+)/);
        if (match && match[1]) fileId = match[1];

        if (!fileId) {
            match = rawUrl.match(/[?&]id=([^&]+)/);
            if (match && match[1]) fileId = match[1];
        }

        if (!fileId) {
            match = rawUrl.match(/\/file\/d\/([^\/]+)/);
            if (match && match[1]) fileId = match[1];
        }

        if (fileId) {
            finalSrc = `https://lh3.googleusercontent.com/d/${fileId}=w400-h400`;
        } else if (rawUrl.startsWith('http')) {
            finalSrc = rawUrl;
        }
    }

    if (pImg) {
        pImg.style.transition = 'opacity 0.2s ease';
        pImg.style.opacity = 0;
        pImg.src = finalSrc;
        pImg.onload = () => { pImg.style.opacity = 1; };
        pImg.onerror = () => {
            pImg.onerror = null;
            pImg.src = placeholderImg;
            pImg.style.opacity = 1;
            console.debug('Gagal load foto, pakai placeholder:', finalSrc);
        };
    }

    updateWatermarkWilayah(p.Wilayah || p.wilayah || "UPT");
    if (pName) pName.innerText = p.Nama || p.nama;
    if (pJob) pJob.innerText = p.Jabatan || p.jabatan || "STAFF";
    if (pWil) pWil.innerHTML = `<i data-lucide="map-pin" size="14" style="vertical-align:middle"></i> WILAYAH: ${(p.Wilayah || p.wilayah || "UPT").trim()}`;
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
// SECTION 20: VOICE RECOGNITION
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
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = t;
            applyFilters();
        } else {
            const n = document.getElementById('notes');
            if (n) n.value += (n.value ? ' ' : '') + t;
            onNotesInput();
        }
    };
    r.onend = () => btn.classList.remove('active');
    r.start();
}

// ============================================================
// SECTION 21: SET STATUS (STRICT PAIRING)
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

    const status = checkTodayStatus(pid);
    const timeVal = getJakartaTimeVal();
    const jamPulangLimit = parseTime(appConfig.jPulang);

    // ATURAN 1-3: IZIN / SAKIT / DINAS
    if (st === 'IZIN') {
        if (status.hasIzin) {
            sndError.play();
            showToast("Ditolak", "❌ Anda sudah IZIN hari ini. Hanya boleh 1x sehari.", "error");
            return;
        }
        if (status.hasSpecial) {
            sndError.play();
            showToast("Ditolak", `❌ Anda sudah punya status khusus hari ini (${status.specialType.toUpperCase()}).`, "error");
            return;
        }
        if (status.hasAnyHadir) {
            sndError.play();
            showToast("Ditolak", "❌ Anda sudah HADIR hari ini. Tidak bisa IZIN.", "error");
            return;
        }
    }

    if (st === 'SAKIT') {
        if (status.hasSakit) {
            sndError.play();
            showToast("Ditolak", "❌ Anda sudah SAKIT hari ini. Hanya boleh 1x sehari.", "error");
            return;
        }
        if (status.hasSpecial) {
            sndError.play();
            showToast("Ditolak", `❌ Anda sudah punya status khusus hari ini (${status.specialType.toUpperCase()}).`, "error");
            return;
        }
        if (status.hasAnyHadir) {
            sndError.play();
            showToast("Ditolak", "❌ Anda sudah HADIR hari ini. Tidak bisa SAKIT.", "error");
            return;
        }
    }

    if (st === 'DINAS') {
        if (status.hasDinas) {
            sndError.play();
            showToast("Ditolak", "❌ Anda sudah DINAS hari ini. Hanya boleh 1x sehari.", "error");
            return;
        }
        if (status.hasSpecial) {
            sndError.play();
            showToast("Ditolak", `❌ Anda sudah punya status khusus hari ini (${status.specialType.toUpperCase()}).`, "error");
            return;
        }
        if (status.hasAnyHadir) {
            sndError.play();
            showToast("Ditolak", "❌ Anda sudah HADIR hari ini. Tidak bisa DINAS.", "error");
            return;
        }
    }

    // ATURAN 4: HADIR
    if (st === 'HADIR') {
        if (status.hasAnyHadir) {
            sndError.play();
            showToast("Sudah Absen", "❌ Anda sudah HADIR/QR HADIR hari ini. Hanya boleh 1x.", "error");
            return;
        }
        if (status.hasSpecial) {
            sndError.play();
            showToast("Ditolak", `❌ Anda sudah ${status.specialType.toUpperCase()} hari ini. Tidak bisa HADIR.`, "error");
            return;
        }
        if (status.hasAnyPulang) {
            sndError.play();
            showToast("Ditolak", "❌ Anda sudah PULANG hari ini. Tidak bisa HADIR.", "error");
            return;
        }
    }

    // ATURAN 6: PULANG biasa
    if (st === 'PULANG') {
        if (status.hasAnyPulang) {
            sndError.play();
            showToast("Sudah Absen", "❌ Anda sudah PULANG/QR PULANG hari ini.", "error");
            return;
        }
        if (!status.hasAnyHadir) {
            sndError.play();
            showToast("Urutan Salah", "❌ Harap HADIR terlebih dahulu sebelum PULANG.", "error");
            return;
        }
        if (status.hasQRHadir) {
            sndError.play();
            showToast("Pairing Salah", "❌ Anda QR HADIR pagi ini. Gunakan QUICK RESPONSE untuk QR PULANG.", "warning");
            return;
        }
    }

    // ATURAN 5 & 7: QUICK RESPONSE
    if (st === 'QUICK RESPONSE') {
        const isMorning = timeVal < jamPulangLimit;

        if (isMorning) {
            if (status.hasAnyHadir) {
                sndError.play();
                showToast("Sudah Absen", "❌ Anda sudah HADIR/QR HADIR hari ini. Hanya boleh 1x.", "error");
                return;
            }
            if (status.hasSpecial) {
                sndError.play();
                showToast("Ditolak", `❌ Anda sudah ${status.specialType.toUpperCase()} hari ini.`, "error");
                return;
            }
            if (status.hasAnyPulang) {
                sndError.play();
                showToast("Ditolak", "❌ Anda sudah PULANG hari ini. Tidak bisa QR HADIR.", "error");
                return;
            }
        } else {
            if (status.hasAnyPulang) {
                sndError.play();
                showToast("Sudah Absen", "❌ Anda sudah PULANG/QR PULANG hari ini.", "error");
                return;
            }
            if (!status.hasAnyHadir) {
                sndError.play();
                showToast("Urutan Salah", "❌ Harap HADIR/QR HADIR terlebih dahulu.", "error");
                return;
            }
            if (status.hasHadirBiasa && !status.hasQRHadir) {
                sndError.play();
                showToast("Pairing Salah", "❌ Anda HADIR biasa pagi ini. Gunakan tombol PULANG biasa.", "warning");
                return;
            }
        }
    }

    // Jika semua validasi lolos
    const notes = document.getElementById('notes');
    if (notes) notes.value = '';
    updateNotesCounter();
    sB64 = null; kB64 = null; suratB64 = null;

    const sImg = document.getElementById('sImg');
    const kImg = document.getElementById('kImg');
    const sPh = document.getElementById('sPh');
    const kPh = document.getElementById('kPh');

    if (sImg) sImg.style.display = 'none';
    if (kImg) kImg.style.display = 'none';
    if (sPh) sPh.style.display = 'block';
    if (kPh) kPh.style.display = 'block';

    document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    selectedStatus = st;
    updateStatusInfo(st);
    updateAttendanceStatusIndicator();
    updateWorkflow();
    saveAutoRecovery();
}

// ============================================================
// SECTION 22: REFRESH PRESENSI DATA
// ============================================================

async function refreshPresensiData() {
    try {
        if (!navigator.onLine) return false;

        const url = getApiUrl('getTodayPresensi');
        console.log('📡 Refreshing presensi data:', url);

        const r = await fetchWithTimeout(url, {
            method: 'GET',
            cache: 'no-store'
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
// SECTION 23: SUBMIT PRESENSI (FORCE REFRESH + FIXED)
// ============================================================

async function submitWithRetry(attempt = 1, trxId = null) {
    if (isSubmitting) {
        console.warn('⚠️ Submit already in progress, skipping...');
        showToast('Sedang Memproses', 'Mohon tunggu, data sedang dikirim...', 'warning');
        return;
    }

    isSubmitting = true;
    const btn = document.getElementById('btnSubmitPresensi');
    if (btn) btn.disabled = true;

    const notesEl = document.getElementById('notes');
    const n = notesEl ? notesEl.value.trim() : '';

    try {
        if (!selectedStatus) {
            showToast("Peringatan", "Pilih status presensi!", "warning");
            return;
        }
        if (n.length < 5) {
            showToast("Peringatan", "Keterangan minimal 5 karakter!", "warning");
            return;
        }
        if (!sB64) {
            showToast("Data Belum Lengkap", "Foto selfie wajib!", "warning");
            return;
        }
        if (!kB64) {
            showToast("Data Belum Lengkap", "Foto lokasi wajib!", "warning");
            return;
        }

        if (uPos.lat === 0 || !uPos.lat) {
            showToast("GPS Belum Siap", "Mengambil lokasi ulang...", "warning");
            await new Promise((resolve) => {
                upLoc();
                setTimeout(resolve, 3000);
            });
            if (uPos.lat === 0) {
                showToast("GPS Gagal", "Coba lagi.", "error");
                return;
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
            'HADIR': 'hadir', 'PULANG': 'pulang',
            'IZIN': 'izin', 'SAKIT': 'sakit',
            'DINAS': 'dinas', 'QUICK RESPONSE': 'quick response'
        };

        const payloadStatus = statusMapping[selectedStatus] || selectedStatus.toLowerCase();
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

        console.log('📤 Sending payload:', {
            ...payload,
            selfie: '...[HIDDEN]...',
            workPhoto: '...[HIDDEN]...'
        });

        const r = await fetchWithTimeout(API, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        }, 35000);

        let j;
        const contentType = r.headers.get('content-type') || '';
        const responseText = await r.text();

        console.log('📄 Raw response LENGTH:', responseText.length);
        console.log('📄 Raw response PREVIEW:', responseText.substring(0, 500));
        console.log('📄 Content-Type:', contentType);

        try {
            j = JSON.parse(responseText);
        } catch (e) {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    j = JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    throw new Error('Tidak dapat parse JSON dari response');
                }
            } else {
                throw new Error('Response bukan JSON: ' + responseText.substring(0, 100));
            }
        }

        console.log('📦 Parsed response:', j);

        if (!j || Object.keys(j).length === 0 || !j.status) {
            throw new Error("Server mengembalikan response kosong ({}). Periksa Log Google Apps Script (Backend) Anda.");
        }

        if (j.status === 'success') {
            setLoading(false);
            if (btn) btn.disabled = false;
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

            console.log('✅ Adding new record to dbP:', newRecord);
            dbP = [newRecord, ...dbP];
            console.log('✅ dbP updated, total records:', dbP.length);

            // ✅ FIX: Force refresh dari server dengan retry (IMMEDIATE)
            console.log('🔄 Force refreshing dbP from server...');
            (async () => {
                let refreshAttempts = 0;
                const maxRefreshAttempts = 5;

                while (refreshAttempts < maxRefreshAttempts) {
                    try {
                        const success = await refreshPresensiData();
                        if (success) {
                            console.log('✅ Force refresh successful');
                            updateButtonStates();
                            return;
                        }
                    } catch (e) {
                        console.warn(`⚠️ Force refresh attempt ${refreshAttempts + 1} failed:`, e.message);
                    }
                    refreshAttempts++;
                    if (refreshAttempts < maxRefreshAttempts) {
                        await new Promise(r => setTimeout(r, 800 * refreshAttempts));
                    }
                }

                if (refreshAttempts >= maxRefreshAttempts) {
                    console.warn('⚠️ Force refresh failed, using manual record');
                }
            })();

            const btnHadir = document.getElementById('btnHadirMain');
            const btnPulang = document.getElementById('btnPulangMain');

            const isPulang = j.statusFix && (
                j.statusFix.toLowerCase().includes('pulang') ||
                j.statusFix.toLowerCase().includes('qr pulang')
            );

            if (isPulang) {
                if (btnPulang) {
                    btnPulang.classList.add('btn-done');
                    btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
                    btnPulang.style.pointerEvents = 'none';
                    btnPulang.style.backgroundColor = 'rgba(16,185,129,0.15)';
                    btnPulang.style.borderColor = 'rgba(16,185,129,0.4)';
                    btnPulang.style.color = 'rgba(16,185,129,0.8)';
                }
            } else {
                if (btnHadir) {
                    btnHadir.classList.add('btn-done');
                    btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
                    btnHadir.style.pointerEvents = 'none';
                    btnHadir.style.backgroundColor = 'rgba(16,185,129,0.15)';
                    btnHadir.style.borderColor = 'rgba(16,185,129,0.4)';
                    btnHadir.style.color = 'rgba(16,185,129,0.8)';
                }
            }

            lucide.createIcons();
            updateButtonStates();
            clearHeavyData();
            selectedStatus = '';
            document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));

            const statusBadge = document.getElementById('statusBadge');
            if (statusBadge) statusBadge.classList.remove('show');
            const statusInfo = document.getElementById('statusInfo');
            if (statusInfo) statusInfo.style.display = 'none';
            const attendanceStatusIndicator = document.getElementById('attendanceStatusIndicator');
            if (attendanceStatusIndicator) attendanceStatusIndicator.innerHTML = '';

            updateWorkflow();
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
                    window.location.href = 'profile_raport.html?' + params.toString();
                }
            }, 1500);

        } else if (j.status === 'error') {
            setLoading(false);
            if (btn) btn.disabled = false;
            if (j.message && (j.message.includes('duplikat') || j.message.includes('sudah'))) {
                sndSuccess.play().catch(() => {});
                showToast("Sudah Tercatat", "Data sudah masuk.", "success");
                await refreshPresensiData();
                updateUIAfterRefresh();
                clearHeavyData();
            } else {
                sndError.play().catch(() => {});
                showToast("Ditolak", j.message || "Gagal presensi.", "error");
            }
        } else {
            throw new Error(j.message || "Status response tidak dikenal: " + j.status);
        }
    } catch (e) {
        console.error("❌ Submit error:", e);

        const isServerError = e.message.includes("response kosong") ||
            e.message.includes("GAS Error") ||
            e.message.includes("tidak valid") ||
            e.message.includes("Tidak dapat parse JSON");

        if (isServerError) {
            sndError.play().catch(() => {});
            showToast("Gagal Server", e.message, "error");
            setLoading(false);
            if (btn) btn.disabled = false;
            return;
        }

        if (attempt < 4) {
            showToastOnce('submit_retry', "Menunggu Antrian...", `Mencoba ulang (${attempt}/3)...`, "warning");
            setTimeout(() => submitWithRetry(attempt + 1, trxId), 2000 * Math.pow(1.5, attempt));
        } else {
            sndError.play().catch(() => {});
            showToast("Gagal Mengirim", e.message || "Koneksi gagal. Coba lagi.", "error");
            setLoading(false);
            if (btn) btn.disabled = false;
        }
    } finally {
        isSubmitting = false;
        console.log('🔓 Submit lock released');
    }
}

// ============================================================
// SECTION 24: OPEN / CLOSE FORM
// ============================================================

async function openForm() {
    if (!dbF.length || isFormLoading) return;
    isFormLoading = true;

    activePegawai = dbF[uIdx];
    const targetIdx = uIdx;
    const p = activePegawai;
    const targetId = p.ID || p.id;

    const stepSelector = document.getElementById('stepSelector');
    const stepForm = document.getElementById('stepForm');
    const statusInfo = document.getElementById('statusInfo');
    const statusBadge = document.getElementById('statusBadge');
    const attendanceStatusIndicator = document.getElementById('attendanceStatusIndicator');

    if (stepSelector) stepSelector.style.display = 'none';
    if (stepForm) stepForm.style.display = 'flex';
    if (statusInfo) statusInfo.style.display = 'none';
    if (statusBadge) statusBadge.classList.remove('show');
    if (attendanceStatusIndicator) attendanceStatusIndicator.innerHTML = '';

    selectedStatus = '';
    document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));

    const specialStatusGrid = document.getElementById('specialStatusGrid');
    if (specialStatusGrid) specialStatusGrid.classList.remove('show');

    const notes = document.getElementById('notes');
    if (notes) notes.value = '';
    updateNotesCounter();

    sB64 = null; kB64 = null; suratB64 = null;

    const sImg = document.getElementById('sImg');
    const kImg = document.getElementById('kImg');
    const sPh = document.getElementById('sPh');
    const kPh = document.getElementById('kPh');

    if (sImg) sImg.style.display = 'none';
    if (kImg) kImg.style.display = 'none';
    if (sPh) sPh.style.display = 'block';
    if (kPh) kPh.style.display = 'block';

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

    const formHeroImg = document.getElementById('formHeroImg');
    const formName = document.getElementById('formName');
    const formJobWil = document.getElementById('formJobWil');

    if (formHeroImg) formHeroImg.src = finalSrc;
    if (formName) formName.innerText = p.Nama || p.nama;
    if (formJobWil) formJobWil.innerHTML =
        `<i data-lucide="briefcase" size="14"></i> ${p.Jabatan || "PPA"} | <i data-lucide="map-pin" size="14"></i> ${p.Wilayah || "UPT"}`;

    lucide.createIcons();

    const btnHadir = document.getElementById('btnHadirMain');
    const btnPulang = document.getElementById('btnPulangMain');

    if (btnHadir) {
        btnHadir.style.pointerEvents = 'none';
        btnHadir.style.opacity = '0.5';
    }
    if (btnPulang) {
        btnPulang.style.pointerEvents = 'none';
        btnPulang.style.opacity = '0.5';
    }

    let refreshSuccess = false;
    for (let i = 0; i < 3; i++) {
        try {
            refreshSuccess = await refreshPresensiData();
            if (refreshSuccess) break;
        } catch (e) {
            console.warn(`Refresh attempt ${i + 1} failed:`, e);
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }

    if (!refreshSuccess) {
        console.warn('⚠️ Semua percobaan refresh gagal, menggunakan data cache');
        showToast('Peringatan', 'Gagal refresh data, menggunakan data cache.', 'warning');
    }

    const isFormStillOpen = stepForm && stepForm.style.display === 'flex';
    const currentPegawaiId = dbF[uIdx]?.ID || dbF[uIdx]?.id;
    if (!isFormStillOpen || currentPegawaiId !== targetId) {
        isFormLoading = false;
        return;
    }

    if (btnHadir) {
        btnHadir.classList.remove('btn-done', 'active');
        btnHadir.innerHTML = '<i data-lucide="sun" size="28"></i><span>HADIR</span>';
        btnHadir.style.pointerEvents = '';
        btnHadir.style.opacity = '';
    }

    if (btnPulang) {
        btnPulang.classList.remove('btn-done', 'active');
        btnPulang.innerHTML = '<i data-lucide="moon" size="28"></i><span>PULANG</span>';
        btnPulang.style.pointerEvents = '';
        btnPulang.style.opacity = '';
    }

    const pid = p.ID || p.id;
    console.log('🔍 Checking status for pegawai:', pid);

    const status = checkTodayStatus(pid);
    console.log('📊 Today status:', status);

    if (status.hasAnyHadir && btnHadir) {
        btnHadir.classList.add('btn-done');
        btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
        btnHadir.style.pointerEvents = 'none';
        console.log('✅ Set btnHadir to SUDAH HADIR');
    }

    if (status.hasAnyPulang && btnPulang) {
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
        updateButtonStates();
    }, 300);

    isFormLoading = false;
}

function closeForm() {
    if (isFormLoading) return;

    stopCam();
    stopCurrentStream();

    const stepForm = document.getElementById('stepForm');
    const stepSelector = document.getElementById('stepSelector');

    if (stepForm) stepForm.style.display = 'none';
    if (stepSelector) stepSelector.style.display = 'flex';

    activePegawai = null;
    selectedStatus = '';
    sB64 = null;
    kB64 = null;
    suratB64 = null;

    document.querySelectorAll('.btn-presence-mega,.btn-special-status').forEach(i => i.classList.remove('active'));

    const statusBadge = document.getElementById('statusBadge');
    if (statusBadge) statusBadge.classList.remove('show');
    const statusInfo = document.getElementById('statusInfo');
    if (statusInfo) statusInfo.style.display = 'none';
    const specialStatusGrid = document.getElementById('specialStatusGrid');
    if (specialStatusGrid) specialStatusGrid.classList.remove('show');

    const notes = document.getElementById('notes');
    if (notes) notes.value = '';

    const attendanceStatusIndicator = document.getElementById('attendanceStatusIndicator');
    if (attendanceStatusIndicator) attendanceStatusIndicator.innerHTML = '';

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
// SECTION 25: PROFILE RAPORT
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
// SECTION 26: MANUAL REFRESH
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
// SECTION 27: UPDATE UI AFTER REFRESH
// ============================================================

function updateUIAfterRefresh() {
    console.log('🔄 updateUIAfterRefresh() dipanggil');

    const stepForm = document.getElementById('stepForm');
    const isFormOpen = stepForm && stepForm.style.display === 'flex';

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

    const btnHadir = document.getElementById('btnHadirMain');
    const btnPulang = document.getElementById('btnPulangMain');

    if (!btnHadir || !btnPulang) {
        console.log('⚠️ Tombol tidak ditemukan');
        return;
    }

    const status = checkTodayStatus(pid);

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

    if (status.hasAnyHadir) {
        btnHadir.classList.add('btn-done');
        btnHadir.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH HADIR</span>';
        btnHadir.style.pointerEvents = 'none';
    }

    if (status.hasAnyPulang) {
        btnPulang.classList.add('btn-done');
        btnPulang.innerHTML = '<i data-lucide="check-circle" size="28"></i><span>SUDAH PULANG</span>';
        btnPulang.style.pointerEvents = 'none';
    }

    updateAttendanceStatusIndicator();
    updateButtonStates();
    lucide.createIcons();

    console.log('✅ UI update selesai');
}

// ============================================================
// SECTION 28: DETECT RETURN FROM PROFILE
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
// SECTION 29: CAMERA FUNCTIONS
// ============================================================
// [Catatan: Section 29-31 sama dengan versi sebelumnya - camera, image processing, watermark]
// Untuk menjaga file tetap ringkas, section ini tetap sama persis dengan versi sebelumnya
// Silakan copy section 28-32 dari file sebelumnya (triggerCam, stopCam, stopCurrentStream,
// triggerFallbackCamera, triggerGallery, uploadSurat, compressImage, processGalleryImage,
// processFallbackImage, savePhoto, capturePhoto, checkImageQuality, addWatermark,
// drawMapPinIcon, drawClockIcon, drawCalendarIcon, startSelfieOverlay, startWorkOverlay,
// updateStatusUI, drawCornerBrackets, drawLaserLine, drawFaceGuide, drawFaceWireframe,
// drawRuleOfThirds, drawCrosshair, drawWorkLabel)

async function triggerCam(type) {
    const aiReady = await ensureFaceApiLoaded();
    if (aiReady && !isLandmarkReady) await loadFaceModels();
    const notes = document.getElementById('notes');
    const notesVal = notes ? notes.value.trim() : '';
    if (!selectedStatus) return showToast("Peringatan", "Silakan pilih status presensi terlebih dahulu!", "warning");
    if (notesVal.length < 5) return showToast("Peringatan", "Isi keterangan minimal 5 karakter!", "warning");
    cType = type;
    stopCurrentStream();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        triggerFallbackCamera(type);
        return;
    }
    const peg = activePegawai || dbF[uIdx];
    const scanPegawai = document.getElementById('scanPegawai');
    const scanLogo = document.getElementById('scanLogo');
    const scanHeaderTitle = document.getElementById('scanHeaderTitle');
    const scanHeaderSub = document.getElementById('scanHeaderSub');
    const scanInstrText = document.getElementById('scanInstrText');
    const scanStatus = document.getElementById('scanStatus');
    const scanStatusText = document.getElementById('scanStatusText');

    if (scanPegawai) scanPegawai.innerText = (peg.Nama || peg.nama || "STAFF").toUpperCase();
    if (scanLogo) scanLogo.src = GITHUB_LOGO_URL;

    if (type === 'selfie') {
        if (scanHeaderTitle) scanHeaderTitle.innerText = "SECURE FACE VERIFICATION";
        if (scanHeaderSub) scanHeaderSub.innerText = DeviceProfile.config.enableFaceAPI ? "UPT PUSDA • Face Detection Active" : "UPT PUSDA • Basic Mode";
        if (scanInstrText) scanInstrText.innerText = DeviceProfile.config.enableFaceAPI ? "Posisikan wajah di dalam frame" : "Mode Hemat: Arahkan wajah ke frame";
        if (scanStatus) {
            scanStatus.style.display = 'flex';
            if (!DeviceProfile.config.enableFaceAPI) {
                if (scanStatusText) scanStatusText.innerText = 'BASIC MODE';
                scanStatus.classList.remove('detected');
            }
        }
    } else {
        if (scanHeaderTitle) scanHeaderTitle.innerText = "LOCATION DOCUMENTATION";
        if (scanHeaderSub) scanHeaderSub.innerText = "UPT PUSDA • Work Site Photo";
        if (scanInstrText) scanInstrText.innerText = "Arahkan kamera ke lokasi kerja";
        if (scanStatus) scanStatus.style.display = 'none';
    }
    lucide.createIcons();

    const video = document.getElementById('vStream');
    if (!video) return;

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
        const cameraUI = document.getElementById('cameraUI');
        if (cameraUI) cameraUI.style.display = 'flex';
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
                const cameraUI = document.getElementById('cameraUI');
                if (cameraUI) cameraUI.style.display = 'flex';
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
    const cameraUI = document.getElementById('cameraUI');
    if (cameraUI) cameraUI.style.display = 'none';
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
    if (!inp) return;
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
    const notes = document.getElementById('notes');
    const notesVal = notes ? notes.value.trim() : '';
    if (notesVal.length < 5) return showToast("Peringatan", "Isi keterangan minimal 5 karakter!", "warning");
    const inp = document.getElementById('galleryInput');
    if (!inp) return;
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
    if (!inp) return;
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
// SECTION 30: IMAGE PROCESSING
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
                const kImg = document.getElementById('kImg');
                const kPh = document.getElementById('kPh');
                if (kImg) {
                    kImg.src = d;
                    kImg.style.display = 'block';
                }
                if (kPh) kPh.style.display = 'none';
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
    const sImg = document.getElementById('sImg');
    const kImg = document.getElementById('kImg');
    const sPh = document.getElementById('sPh');
    const kPh = document.getElementById('kPh');

    if (type === 'selfie') {
        if (sImg) {
            sImg.src = d;
            sImg.style.display = 'block';
        }
        if (sPh) sPh.style.display = 'none';
        sB64 = d;
    } else {
        if (kImg) {
            kImg.src = d;
            kImg.style.display = 'block';
        }
        if (kPh) kPh.style.display = 'none';
        kB64 = d;
    }
    showToast("Berhasil", "Foto berhasil diambil dan disimpan", "success");
    saveAutoRecovery();
}

async function capturePhoto() {
    const v = document.getElementById('vStream');
    if (!v || v.readyState !== 4 || v.videoWidth === 0) {
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
    const sImg = document.getElementById('sImg');
    const kImg = document.getElementById('kImg');
    const sPh = document.getElementById('sPh');
    const kPh = document.getElementById('kPh');

    if (cType === 'selfie') {
        if (sImg) {
            sImg.src = d;
            sImg.style.display = 'block';
        }
        if (sPh) sPh.style.display = 'none';
        sB64 = d;
    } else {
        if (kImg) {
            kImg.src = d;
            kImg.style.display = 'block';
        }
        if (kPh) kPh.style.display = 'none';
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

// ============================================================
// SECTION 31: WATERMARK ON PHOTO
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
// SECTION 32: CAMERA OVERLAY FUNCTIONS
// ============================================================

function startSelfieOverlay() {
    const canvas = document.getElementById('faceOverlay'),
        video = document.getElementById('vStream'),
        ctx = canvas ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) return;

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
            if (!currentStream || !video || video.readyState !== 4 || video.videoWidth === 0) return;
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
        const scanTime = document.getElementById('scanTime');
        if (scanTime) scanTime.innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    startRenderLoop(renderFrame);
}

function startWorkOverlay() {
    const canvas = document.getElementById('faceOverlay'),
        ctx = canvas ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) return;

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
        const scanTime = document.getElementById('scanTime');
        if (scanTime) scanTime.innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    startRenderLoop(renderFrame);
}

function updateStatusUI(detected) {
    const st = document.getElementById('scanStatus'),
        stTxt = document.getElementById('scanStatusText'),
        instr = document.getElementById('scanInstrText');
    if (detected) {
        if (st) st.classList.add('detected');
        if (stTxt) stTxt.innerText = 'FACE LOCKED';
        if (instr) {
            instr.innerText = 'Wajah terdeteksi! Tekan shutter';
            instr.style.color = '#10b981';
        }
    } else {
        if (st) st.classList.remove('detected');
        if (stTxt) stTxt.innerText = 'SCANNING';
        if (instr) {
            instr.innerText = 'Posisikan wajah di dalam frame';
            instr.style.color = '#ffffff';
        }
    }
}

// ============================================================
// SECTION 33: CANVAS DRAWING HELPERS
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
    const vStreamEl = document.getElementById('vStream');
    const vW = detection.detection.imageWidth || (vStreamEl ? vStreamEl.videoWidth : 0),
        vH = detection.detection.imageHeight || (vStreamEl ? vStreamEl.videoHeight : 0);
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
// SECTION 34: APP VERSION CHECK
// ============================================================

function checkAppVersion() {
    const currentVersion = "v3.1.0";
    const savedVersion = localStorage.getItem('app_version');
    if (savedVersion && savedVersion !== currentVersion) showUpdateModal();
    localStorage.setItem('app_version', currentVersion);
}

function showUpdateModal() {
    const modal = document.getElementById('notificationModal');
    const content = document.getElementById('notifModalContent');
    if (!modal || !content) return;

    content.className = 'notif-modal-content notif-info';
    const notifIcon = document.getElementById('notifIcon');
    const notifTitle = document.getElementById('notifTitle');
    const notifMessage = document.getElementById('notifMessage');
    const btnOk = document.getElementById('btnNotifOk');

    if (notifIcon) notifIcon.setAttribute('data-lucide', 'download-cloud');
    if (notifTitle) notifTitle.innerText = "Pembaruan Tersedia!";
    if (notifMessage) notifMessage.innerText = "Versi terbaru telah dirilis. Muat ulang untuk mendapatkan fitur terbaru.";
    if (btnOk) btnOk.innerHTML = '<i data-lucide="refresh-cw" size="18"></i> Muat Ulang';

    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.classList.add('show'); });

    if (btnOk) {
        btnOk.onclick = () => {
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(name => caches.delete(name)));
            }
            location.reload();
        };
    }
    lucide.createIcons();
}

// ============================================================
// SECTION 35: BACKGROUND KEEP-ALIVE
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
        // Silent fail
    }
}

// ============================================================
// SECTION 36: NOTES INPUT
// ============================================================

function onNotesInput() {
    updateNotesCounter();
    updateWorkflow();
    saveAutoRecovery();
}

// ============================================================
// SECTION 37: INITIALIZATION
// ============================================================

window.onload = () => {
    lucide.createIcons();
    loadData();
    updateAttendanceStatusIndicator();
    updateButtonStates();

    // Update button states setiap detik
    setInterval(updateAttendanceStatusIndicator, 60000);
    setInterval(updateButtonStates, 1000);

    // Clock update
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

    // Visibility change handler
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('📱 Tab aktif, refresh data...');
            refreshPresensiData().then(() => {
                updateUIAfterRefresh();
                updateButtonStates();
            });
        }
    });

    // Focus handler
    window.addEventListener('focus', () => {
        refreshPresensiData().then(() => {
            updateUIAfterRefresh();
            updateButtonStates();
        });
    });

    // Auto refresh setiap 30 detik jika form terbuka
    setInterval(() => {
        const stepForm = document.getElementById('stepForm');
        const isFormOpen = stepForm && stepForm.style.display === 'flex';
        if (isFormOpen) {
            refreshPresensiData().then(() => {
                updateUIAfterRefresh();
                updateButtonStates();
            });
        }
    }, 30000);

    // Keep-alive setiap 5 menit
    setInterval(keepAlivePing, 5 * 60 * 1000);

    // Service Worker registration
    try {
        if ('serviceWorker' in navigator) {
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:' ||
                (protocol === 'http:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

            if (isSecure) {
                navigator.serviceWorker.getRegistration('./sw.js').then(reg => {
                    if (!reg) {
                        navigator.serviceWorker.register('./sw.js')
                            .then((registration) => {
                                console.log('✅ Service Worker registered:', registration.scope);
                            })
                            .catch(err => console.warn('⚠️ SW registration failed:', err));
                    } else {
                        console.log('ℹ️ SW already registered, checking for updates...');
                        reg.update().then(() => {
                            console.log('✅ SW update check complete');
                        }).catch(err => {
                            console.warn('⚠️ SW update failed:', err);
                        });
                    }
                }).catch(err => {
                    console.warn('⚠️ SW getRegistration failed:', err);
                });
            } else {
                console.info('ℹ️ SW skipped - protocol not supported');
            }
        }
    } catch (e) {
        console.warn('⚠️ SW error:', e.message);
    }
};
