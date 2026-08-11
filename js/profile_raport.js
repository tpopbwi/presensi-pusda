// ============================================================
// PROFILE_RAPORT.JS - v4.4.3 (FIXED: Duplicate var hoisting)
// ============================================================
// CHANGELOG v4.4.3:
// ✅ Fixed: var API_BASE hoisting conflict with const in HTML
// ✅ Changed: var → window.X assignment to avoid redeclaration
// ============================================================

// ============================================================
// 0. API CONFIGURATION
// ============================================================
// API_BASE & API dideklarasikan sebagai const di inline <script> HTML.
// Di sini kita hanya set via window property agar tidak konflik.
if (typeof API_BASE === 'undefined') {
    window.API_BASE = "https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec";
    window.API = window.location.protocol === 'file:'
        ? "https://cors-anywhere.herokuapp.com/" + window.API_BASE
        : window.API_BASE;
}

if (typeof GITHUB_LOGO_URL === 'undefined') {
    var GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
}

// ============================================================
// 1. CACHE & CONFIGURATION
// ============================================================
const CACHE_CONFIG = {
    TTL: 5 * 60 * 1000,
    DETAIL_TTL: 10 * 60 * 1000,
    STATS_TTL: 2 * 60 * 1000,
    PAGE_SIZE: 20,
    MAX_RETRIES: 2,
    RETRY_DELAY: 1000,
    TIMEOUT: 15000
};

const cache = new Map();
const detailCache = new Map();
const pendingRequests = new Map();

// ============================================================
// 2. GLOBAL VARIABLES
// ============================================================
const DEBUG_MODE = false;
let currentPegawai = null;
let statsData = null;
let recordsData = [];
let holidays = [];
let currentFilter = 'month';
let currentPage = 0;
let isLoadingMore = false;
let hasMoreData = true;
let isStatsLoading = false;
let isDataLoading = false;

const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%232e446e' rx='20'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%23ffffff' opacity='.15'/%3E%3C/svg%3E";

// ============================================================
// 3. FETCH WITH TIMEOUT & RETRY
// ============================================================
async function fetchWithTimeout(url, options = {}, timeout = CACHE_CONFIG.TIMEOUT) {
    const requestKey = url + JSON.stringify(options);
    
    if (pendingRequests.has(requestKey)) {
        if (DEBUG_MODE) console.log('⏳ Using pending request for:', url);
        return pendingRequests.get(requestKey);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout);
    
    const fetchPromise = fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            ...(options.headers || {})
        }
    }).finally(() => {
        clearTimeout(timeoutId);
        pendingRequests.delete(requestKey);
    });
    
    pendingRequests.set(requestKey, fetchPromise);
    
    try {
        const response = await fetchPromise;
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        pendingRequests.delete(requestKey);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout after ' + timeout + 'ms');
        }
        throw error;
    }
}

async function fetchWithRetry(url, options = {}, timeout = CACHE_CONFIG.TIMEOUT, retries = CACHE_CONFIG.MAX_RETRIES) {
    let lastError;
    
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetchWithTimeout(url, options, timeout);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
        } catch (error) {
            lastError = error;
            if (i < retries) {
                if (DEBUG_MODE) console.log(`🔄 Retry ${i + 1}/${retries} for: ${url}`);
                const delay = CACHE_CONFIG.RETRY_DELAY * Math.pow(2, i);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError || new Error('All retries failed');
}

// ============================================================
// 4. LOAD DATA
// ============================================================
async function loadData() {
    if (isDataLoading) {
        if (DEBUG_MODE) console.log('⏳ Data already loading, skipping');
        return;
    }
    
    const overlay = document.getElementById('loadingOverlay');
    const statusText = document.getElementById('loadStatus');
    
    if (!currentPegawai) {
        showToast('Error', 'Data pegawai tidak ditemukan.', 'error');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }

    isDataLoading = true;
    if (overlay) overlay.style.display = 'flex';
    if (statusText) statusText.innerText = 'Memuat Profile Raport...';

    try {
        const pid = currentPegawai.ID || currentPegawai.id;
        const cacheKey = `dashboard_${pid}_${currentFilter}`;
        
        const cachedData = cache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_CONFIG.TTL) {
            if (DEBUG_MODE) console.log('✅ Using cached dashboard data');
            const data = cachedData.data;
            statsData = data.stats;
            statsData.percentages = data.percentages || {};
            statsData.totalHariKerja = data.workingDays || 0;
            recordsData = data.records || [];
            holidays = data.holidays || [];
            
            renderAll();
            if (overlay) overlay.style.display = 'none';
            isDataLoading = false;
            return;
        }

        const url = `${API}?action=getPegawaiStats&id=${encodeURIComponent(pid)}&period=${currentFilter}&cb=${Date.now()}`;
        if (DEBUG_MODE) console.log('📡 Fetching:', url);
        
        let data;
        try {
            const response = await fetchWithRetry(url, {}, 15000, 2);
            data = await response.json();
        } catch (fetchError) {
            console.warn('⚠️ Fetch failed, trying fallback:', fetchError.message);
            if (isLocalFile) {
                const fallbackUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(API_BASE + '?action=getPegawaiStats&id=' + encodeURIComponent(pid) + '&period=' + currentFilter)}`;
                try {
                    const response = await fetchWithRetry(fallbackUrl, {}, 15000, 1);
                    data = await response.json();
                } catch (fallbackError) {
                    throw fallbackError;
                }
            } else {
                throw fetchError;
            }
        }
        
        if (data.status === 'success') {
            statsData = data.stats || {};
            statsData.percentages = data.percentages || {};
            statsData.totalHariKerja = data.workingDays || 0;
            statsData.alpha = Math.max(0, statsData.alpha || 0);
            recordsData = data.records || [];
            holidays = data.holidays || [];
            
            if (DEBUG_MODE) {
                console.log('✅ Data loaded');
                console.log('📊 Working days:', statsData.totalHariKerja);
                console.log('📊 Total Nilai:', statsData.totalNilai);
                console.log('📊 Alpha:', statsData.alpha);
                console.log('📊 Records:', recordsData.length);
            }
            
            cache.set(cacheKey, {
                data: { 
                    stats: statsData, 
                    percentages: statsData.percentages,
                    workingDays: statsData.totalHariKerja,
                    records: recordsData, 
                    holidays: holidays 
                },
                timestamp: Date.now()
            });
            
            renderAll();
        } else {
            throw new Error(data.message || 'Gagal memuat data');
        }
        
        if (overlay) overlay.style.display = 'none';
        
    } catch (e) {
        console.error("❌ Load data error:", e);
        
        const pid = currentPegawai.ID || currentPegawai.id;
        const cacheKey = `dashboard_${pid}_${currentFilter}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            const data = cachedData.data;
            statsData = data.stats;
            statsData.percentages = data.percentages || {};
            statsData.totalHariKerja = data.workingDays || 0;
            recordsData = data.records || [];
            holidays = data.holidays || [];
            renderAll();
            showToast('Info', 'Menampilkan data dari cache (offline mode)', 'info');
        } else {
            useDummyData();
            renderAll();
            showToast('Error', 'Gagal memuat data, menampilkan data contoh', 'error');
        }
        
        if (overlay) overlay.style.display = 'none';
    } finally {
        isDataLoading = false;
    }
}

// ============================================================
// 5. DUMMY DATA (FALLBACK)
// ============================================================
function useDummyData() {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    
    statsData = {
        hadir: 15,
        terlambat: 2,
        izin: 1,
        sakit: 1,
        dinas: 2,
        alpha: 0,
        totalNilai: 2100,
        totalHariKerja: 22,
        percentages: {
            hadir: 68.2,
            terlambat: 9.1,
            izin: 4.5,
            sakit: 4.5,
            dinas: 9.1,
            alpha: 0
        }
    };
    
    recordsData = [];
    for (let i = 0; i < 20; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const statuses = ['Hadir', 'Hadir', 'Terlambat', 'Hadir', 'Izin', 'Hadir', 'Sakit', 'Hadir', 'Dinas', 'Hadir'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const nilai = status === 'Hadir' ? 100 : status === 'Terlambat' ? 80 : 100;
        
        recordsData.push({
            date: dateStr,
            time: `${String(7 + Math.floor(Math.random() * 3)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
            status: status,
            nilai: nilai,
            keterangan: '-'
        });
    }
    
    holidays = [];
    if (DEBUG_MODE) console.log('📊 Using dummy data');
}

// ============================================================
// 6. RENDER ALL
// ============================================================
function renderAll() {
    renderProfile();
    renderTodayStatus();
    renderHistory();
    renderStats();
    renderSummaryStats();
}

// ============================================================
// 7. RENDER PROFILE
// ============================================================
function renderProfile() {
    const p = currentPegawai;
    
    const rawUrl = p.Link_Foto_Profile || '';
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
                finalSrc = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
            }
        } else {
            finalSrc = rawUrl;
        }
    }
    
    const img = document.getElementById('profileAvatar');
    if (img) {
        img.onload = null;
        img.onerror = null;
        img.style.transition = 'opacity 0.4s ease';
        img.style.opacity = 0;
        img.src = finalSrc;
        img.onload = () => { img.style.opacity = 1; };
        img.onerror = () => {
            img.onerror = null;
            img.src = placeholderImg;
            img.style.opacity = 1;
        };
    }
    
    const el = (id) => document.getElementById(id);
    if (el('profileName')) el('profileName').innerText = p.Nama || p.nama;
    if (el('profileJob')) el('profileJob').innerHTML = `<i data-lucide="briefcase" size="14"></i> ${p.Jabatan || 'PPA'}`;
    if (el('profileWil')) el('profileWil').innerHTML = `<i data-lucide="map-pin" size="14"></i> ${p.Wilayah || 'UPT'}`;
    if (el('sidebarLogo')) el('sidebarLogo').src = GITHUB_LOGO_URL;
    
    lucide.createIcons();
}

// ============================================================
// 8. RENDER TODAY STATUS
// ============================================================
function renderTodayStatus() {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    
    const el = (id) => document.getElementById(id);
    if (el('todayDate')) {
        el('todayDate').innerText = today.toLocaleDateString('id-ID', { 
            day: 'numeric', month: 'long', year: 'numeric' 
        });
    }
    
    const todayRecords = recordsData.filter(r => {
        if (r.date) return r.date === todayStr;
        if (r.timestamp) {
            const d = new Date(r.timestamp);
            return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === todayStr;
        }
        return false;
    });
    
    let hadirTime = '--:--', pulangTime = '--:--';
    let hadirNilai = 0, pulangNilai = 0, specialNilai = 0;
    let hasHadir = false, hasPulang = false, hasSpecial = false;
    let specialType = '-';
    let totalPts = 0;
    
    todayRecords.forEach(r => {
        const status = (r.status || '').toLowerCase();
        const nilai = parseInt(r.nilai) || 0;
        totalPts += nilai;
        
        if (status.includes('izin') || status.includes('sakit') || status.includes('dinas')) {
            hasSpecial = true;
            specialType = status.charAt(0).toUpperCase() + status.slice(1);
            specialNilai = nilai;
        } else if (status.includes('hadir') || status.includes('terlambat') || status.includes('qr hadir')) {
            hasHadir = true;
            hadirTime = r.time || r.waktu || '--:--';
            hadirNilai = nilai;
        } else if (status.includes('pulang') || status.includes('qr pulang')) {
            hasPulang = true;
            pulangTime = r.time || r.waktu || '--:--';
            pulangNilai = nilai;
        }
    });
    
    if (el('todayHadir')) {
        el('todayHadir').innerText = hadirTime;
        el('todayHadir').style.color = hasHadir ? 'var(--success)' : 'rgba(255,255,255,0.3)';
    }
    if (el('todayHadirPoint')) el('todayHadirPoint').innerText = hadirNilai + ' pts';
    
    if (el('todayPulang')) {
        el('todayPulang').innerText = pulangTime;
        el('todayPulang').style.color = hasPulang ? 'var(--pu-blue)' : 'rgba(255,255,255,0.3)';
    }
    if (el('todayPulangPoint')) el('todayPulangPoint').innerText = pulangNilai + ' pts';
    
    if (el('todaySpecial')) {
        el('todaySpecial').innerText = specialType;
        el('todaySpecial').style.color = hasSpecial ? '#a855f7' : 'rgba(255,255,255,0.3)';
    }
    if (el('todaySpecialPoint')) el('todaySpecialPoint').innerText = specialNilai + ' pts';
    
    const totalCount = (hasHadir ? 1 : 0) + (hasPulang ? 1 : 0) + (hasSpecial ? 1 : 0);
    if (el('todayTotal')) el('todayTotal').innerText = totalCount;
    if (el('todayTotalPoint')) el('todayTotalPoint').innerText = totalPts + ' pts';
    
    lucide.createIcons();
}

// ============================================================
// 9. RENDER HISTORY
// ============================================================
function renderHistory() {
    const tbody = document.getElementById('historyBody');
    if (!tbody) return;
    
    const grouped = recordsData.reduce((acc, r) => {
        const dateKey = r.date || (r.timestamp ? new Date(r.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) : null);
        if (!dateKey) return acc;
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(r);
        return acc;
    }, {});
    
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    
    const start = currentPage * CACHE_CONFIG.PAGE_SIZE;
    const end = start + CACHE_CONFIG.PAGE_SIZE;
    const pageDates = sortedDates.slice(start, end);
    
    hasMoreData = end < sortedDates.length;
    
    if (pageDates.length === 0 && currentPage === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;opacity:0.5">
                    <i data-lucide="inbox" size="48" style="margin-bottom:12px"></i>
                    <p>Belum ada data presensi</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        updateHistoryCount(sortedDates.length);
        return;
    }
    
    const nowD = new Date();
    const todayKey = nowD.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const curMonth = todayKey.slice(0, 7);
    
    let html = '';
    pageDates.forEach(date => {
        const records = grouped[date];
        const dateObj = new Date(date);
        const dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
        
        const rowMonth = date.slice(0, 7);
        let rowClass = '';
        if (date === todayKey) {
            rowClass = 'row-today';
        } else if (rowMonth === curMonth) {
            rowClass = 'row-current';
        } else {
            rowClass = 'row-past';
        }
        
        let masukTime = '-', pulangTime = '-';
        let totalNilai = 0;
        let statuses = [];
        
        records.forEach(r => {
            const status = (r.status || '').toLowerCase();
            totalNilai += parseInt(r.nilai) || 0;
            
            if (status.includes('hadir') || status.includes('terlambat') || status.includes('qr hadir')) {
                masukTime = r.time || r.waktu || '-';
            }
            if (status.includes('pulang') || status.includes('qr pulang')) {
                pulangTime = r.time || r.waktu || '-';
            }
            
            if (status.includes('izin')) {
                if (!statuses.includes('Izin')) statuses.push('Izin');
            } else if (status.includes('sakit')) {
                if (!statuses.includes('Sakit')) statuses.push('Sakit');
            } else if (status.includes('dinas')) {
                if (!statuses.includes('Dinas')) statuses.push('Dinas');
            } else if (status.includes('terlambat')) {
                if (!statuses.includes('Terlambat')) statuses.push('Terlambat');
            } else if (status.includes('hadir') || status.includes('qr')) {
                if (!statuses.includes('Hadir')) statuses.push('Hadir');
            }
        });
        
        let statusClass = 'alpha';
        let statusDisplay = 'Alpha';
        
        if (statuses.length > 1) {
            statusClass = 'multi-status';
            const displayStatuses = statuses.slice(0, 2);
            statusDisplay = displayStatuses.join(' + ');
            if (statuses.length > 2) statusDisplay += ' +';
        } else if (statuses.length === 1) {
            statusClass = statuses[0].toLowerCase();
            statusDisplay = statuses[0];
        }
        
        html += `
            <tr class="${rowClass}" onclick="showDetail('${date}')">
                <td>${dateStr}</td>
                <td>${dayName}</td>
                <td>${masukTime}</td>
                <td>${pulangTime}</td>
                <td style="font-weight:800;color:var(--sda-toska)">${totalNilai}</td>
                <td><span class="status-badge-table ${statusClass}">${statusDisplay}</span></td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    lucide.createIcons();
    updateHistoryCount(sortedDates.length);
}

// ============================================================
// 10. UPDATE HISTORY COUNT
// ============================================================
function updateHistoryCount(total) {
    const el = document.getElementById('historyCount');
    if (el) {
        const start = currentPage * CACHE_CONFIG.PAGE_SIZE + 1;
        const end = Math.min((currentPage + 1) * CACHE_CONFIG.PAGE_SIZE, total);
        if (total > 0) {
            el.innerText = `Menampilkan ${start}-${end} dari ${total} data`;
        } else {
            el.innerText = 'Belum ada data';
        }
    }
    
    const btn = document.getElementById('btnLoadMore');
    if (btn) {
        if (hasMoreData && total > CACHE_CONFIG.PAGE_SIZE) {
            btn.style.display = 'flex';
            btn.innerHTML = '<i data-lucide="chevron-down" size="16"></i> Load More';
        } else {
            btn.style.display = 'none';
        }
        lucide.createIcons();
    }
}

// ============================================================
// 11. LOAD MORE HISTORY
// ============================================================
function loadMoreHistory() {
    if (isLoadingMore || !hasMoreData) return;
    isLoadingMore = true;
    
    const btn = document.getElementById('btnLoadMore');
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader" size="16" style="animation:spin 0.8s linear infinite"></i> Loading...';
        btn.disabled = true;
        lucide.createIcons();
    }
    
    currentPage++;
    
    setTimeout(() => {
        renderHistory();
        isLoadingMore = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="chevron-down" size="16"></i> Load More';
            lucide.createIcons();
        }
    }, 300);
}

// ============================================================
// 12. RENDER STATS
// ============================================================
function renderStats() {
    if (!statsData) return;
    
    const el = (id) => document.getElementById(id);
    
    if (el('statHadir')) el('statHadir').innerText = statsData.hadir || 0;
    if (el('statTerlambat')) el('statTerlambat').innerText = statsData.terlambat || 0;
    if (el('statIzin')) el('statIzin').innerText = statsData.izin || 0;
    if (el('statSakit')) el('statSakit').innerText = statsData.sakit || 0;
    if (el('statDinas')) el('statDinas').innerText = statsData.dinas || 0;
    if (el('statAlpha')) el('statAlpha').innerText = statsData.alpha || 0;
    
    const pct = statsData.percentages || {};
    const setPct = (id, val) => {
        const elPct = document.getElementById(id);
        if (elPct) elPct.innerText = (val || '0.0') + '%';
    };
    setPct('statHadirPct', pct.hadir);
    setPct('statTerlambatPct', pct.terlambat);
    setPct('statIzinPct', pct.izin);
    setPct('statSakitPct', pct.sakit);
    setPct('statDinasPct', pct.dinas);
    setPct('statAlphaPct', pct.alpha);
    
    updateHeroStats(statsData);
    
    const workingDays = statsData.totalHariKerja || 0;
    if (el('totalWorkingDays')) {
        el('totalWorkingDays').innerText = workingDays;
    }
    
    const maxStat = Math.max(
        statsData.hadir || 0,
        statsData.terlambat || 0,
        statsData.izin || 0,
        statsData.sakit || 0,
        statsData.dinas || 0,
        statsData.alpha || 0,
        1
    );
    
    setTimeout(() => {
        const bar = (id, val) => {
            const elBar = document.getElementById(id);
            if (elBar) elBar.style.width = ((val || 0) / maxStat * 100) + '%';
        };
        bar('barHadir', statsData.hadir);
        bar('barTerlambat', statsData.terlambat);
        bar('barIzin', statsData.izin);
        bar('barSakit', statsData.sakit);
        bar('barDinas', statsData.dinas);
        bar('barAlpha', statsData.alpha);
    }, 100);
}

// ============================================================
// 13. UPDATE HERO STATS
// ============================================================
function updateHeroStats(s) {
    const totalKehadiran = (s.hadir || 0) + 
                          (s.terlambat || 0) + 
                          (s.izin || 0) + 
                          (s.sakit || 0) + 
                          (s.dinas || 0);
    
    const alpha = Math.max(0, s.alpha || 0);
    
    const el = (id) => document.getElementById(id);
    if (el('totalKehadiranStats')) {
        el('totalKehadiranStats').innerText = totalKehadiran;
    }
    if (el('totalAlphaStats')) {
        el('totalAlphaStats').innerText = alpha;
    }
    if (el('totalWorkingDaysFooter')) {
        el('totalWorkingDaysFooter').innerText = s.totalHariKerja || 0;
    }
    if (el('totalWorkingDays')) {
        el('totalWorkingDays').innerText = s.totalHariKerja || 0;
    }
    
    if (DEBUG_MODE) {
        console.log('📊 Hero Stats Updated:');
        console.log('  Total Kehadiran:', totalKehadiran);
        console.log('  Alpha:', alpha);
        console.log('  Working Days:', s.totalHariKerja);
    }
}

// ============================================================
// 14. RENDER SUMMARY STATS
// ============================================================
function renderSummaryStats() {
    if (!statsData) return;
    
    const workingDays = statsData.totalHariKerja || 0;
    const totalNilai = statsData.totalNilai || 0;
    const maxPossibleScore = workingDays * 100;
    
    const persentase = maxPossibleScore > 0 
        ? Math.round((totalNilai / maxPossibleScore) * 100) 
        : 0;
    
    const totalKehadiran = (statsData.hadir || 0) + 
                          (statsData.terlambat || 0) + 
                          (statsData.izin || 0) + 
                          (statsData.sakit || 0) + 
                          (statsData.dinas || 0);
    
    const el = (id) => document.getElementById(id);
    if (el('totalKehadiran')) el('totalKehadiran').innerText = totalKehadiran;
    if (el('totalNilai')) el('totalNilai').innerText = totalNilai;
    if (el('persentaseKehadiran')) el('persentaseKehadiran').innerText = persentase + '%';
    if (el('totalWorkingDays')) el('totalWorkingDays').innerText = workingDays;
    
    updateHeroStats(statsData);
    
    if (DEBUG_MODE) {
        console.log('📊 Hero Summary:');
        console.log('  Working Days:', workingDays);
        console.log('  Total Nilai:', totalNilai);
        console.log('  Max Possible:', maxPossibleScore);
        console.log('  Persentase:', persentase + '%');
        console.log('  Total Kehadiran:', totalKehadiran);
        console.log('  Alpha:', statsData.alpha);
    }
}

// ============================================================
// 15. SHOW DETAIL
// ============================================================
async function showDetail(date) {
    const card = document.getElementById('detailCard');
    const content = document.getElementById('detailContent');
    if (!card || !content) return;
    
    const cacheKey = `detail_${currentPegawai.ID}_${date}`;
    if (detailCache.has(cacheKey)) {
        const cached = detailCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_CONFIG.DETAIL_TTL) {
            if (DEBUG_MODE) console.log('✅ Using cached detail');
            renderDetailContent(cached.data);
            card.style.display = 'block';
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        detailCache.delete(cacheKey);
    }
    
    content.innerHTML = '<p style="text-align:center;opacity:0.5">Memuat detail...</p>';
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    try {
        const url = `${API}?action=getPresensiDetail&id=${encodeURIComponent(currentPegawai.ID)}&date=${date}&cb=${Date.now()}`;
        const r = await fetchWithTimeout(url, {}, 15000);
        const data = await r.json();
        
        if (data.status === 'success') {
            detailCache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            renderDetailContent(data);
        } else {
            content.innerHTML = `<p style="color:var(--danger)">${data.message}</p>`;
        }
    } catch (e) {
        console.error('❌ Detail error:', e);
        content.innerHTML = `<p style="color:var(--danger)">Gagal memuat detail: ${e.message}</p>`;
    }
}

// ============================================================
// 16. RENDER DETAIL CONTENT
// ============================================================
function renderDetailContent(data) {
    const content = document.getElementById('detailContent');
    const records = data.records || [];
    
    const hadirRecord = records.find(r => {
        const s = (r.status || '').toLowerCase();
        return s.includes('hadir') || s.includes('terlambat') || s.includes('qr hadir');
    });
    
    const pulangRecord = records.find(r => {
        const s = (r.status || '').toLowerCase();
        return s.includes('pulang') || s.includes('qr pulang');
    });
    
    const specialRecord = records.find(r => {
        const s = (r.status || '').toLowerCase();
        return s.includes('izin') || s.includes('sakit') || s.includes('dinas');
    });
    
    let html = `<h4 style="margin-bottom:16px;color:var(--sda-toska)">📅 ${formatDateIndo(data.date)}</h4>`;
    
    if (hadirRecord) html += renderDetailSection('☀️ Absen Hadir', hadirRecord, 'hadir');
    if (pulangRecord) html += renderDetailSection('🌙 Absen Pulang', pulangRecord, 'pulang');
    if (specialRecord) html += renderDetailSection('📋 Status Khusus', specialRecord, 'special');
    
    if (!hadirRecord && !pulangRecord && !specialRecord) {
        html += '<p style="text-align:center;opacity:0.5">Tidak ada data presensi</p>';
    }
    
    html += `
        <div style="text-align:center;margin-top:20px">
            <button class="btn-close-detail" onclick="closeDetail()">
                <i data-lucide="x" size="20"></i>
            </button>
        </div>
    `;
    
    content.innerHTML = html;
    lucide.createIcons();
}

// ============================================================
// 17. RENDER DETAIL SECTION
// ============================================================
function renderDetailSection(title, record, type) {
    const colors = {
        hadir: 'var(--success)',
        pulang: 'var(--pu-blue)',
        special: '#a855f7'
    };
    
    const escapeHtml = (str) => {
        if (!str) return '-';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };
    
    const status = escapeHtml(record.status);
    const keterangan = escapeHtml(record.keterangan || '-');
    const gps = escapeHtml(record.gps || '-');
    const nilai = record.nilai || 0;
    const time = record.time || '--:--';
    
    let html = `
    <div style="margin-bottom:20px;padding:16px;background:linear-gradient(135deg,rgba(30,64,175,0.92),rgba(15,23,42,0.95));border-radius:16px;border-left:4px solid ${colors[type]};box-shadow:0 8px 24px rgba(30,64,175,0.35)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h5 style="font-size:0.9rem;font-weight:800;color:#ffffff;margin:0">${title}</h5>
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:${colors[type]};font-weight:800">
                ${time}
            </span>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Status</div>
            <div class="detail-value">${status}</div>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Nilai</div>
            <div class="detail-value" style="color:${colors[type]};font-weight:800">${nilai} pts</div>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Keterangan</div>
            <div class="detail-value">${keterangan}</div>
        </div>
        
        ${gps && gps !== '-' ? `
        <div class="detail-row">
            <div class="detail-label">GPS</div>
            <div class="detail-value" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;background:rgba(0,0,0,0.25);padding:6px 10px;border-radius:8px;border:1px solid rgba(96,165,250,0.2)">
                ${gps}
            </div>
        </div>` : ''}
        
        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">`;
    
    if (record.foto_selfie && record.foto_selfie !== '-') {
        html += `
        <div>
            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase;color:rgba(255,255,255,0.7)">
                Foto Selfie
            </div>
            <img src="${record.foto_selfie}" 
                 alt="Selfie" 
                 loading="lazy"
                 style="width:100%;border-radius:12px;cursor:pointer;border:2px solid rgba(96,165,250,0.4)"
                 onclick="openImageModal('${record.foto_selfie}')"
                 onerror="this.style.display='none'">
        </div>`;
    }
    
    if (record.foto_kerja && record.foto_kerja !== '-') {
        html += `
        <div>
            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase;color:rgba(255,255,255,0.7)">
                Foto Kerja
            </div>
            <img src="${record.foto_kerja}" 
                 alt="Kerja" 
                 loading="lazy"
                 style="width:100%;border-radius:12px;cursor:pointer;border:2px solid rgba(96,165,250,0.4)"
                 onclick="openImageModal('${record.foto_kerja}')"
                 onerror="this.style.display='none'">
        </div>`;
    }
    
    html += `</div></div>`;
    return html;
}

// ============================================================
// 18. OPEN IMAGE MODAL
// ============================================================
function openImageModal(url) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:300000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
    modal.onclick = () => modal.remove();
    
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.8);';
    img.loading = 'lazy';
    
    modal.appendChild(img);
    document.body.appendChild(modal);
}

// ============================================================
// 19. FORMAT DATE
// ============================================================
function formatDateIndo(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { 
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
    });
}

function closeDetail() {
    const card = document.getElementById('detailCard');
    if (card) card.style.display = 'none';
}

// ============================================================
// 20. FILTER
// ============================================================
function setFilter(period) {
    currentFilter = period;
    currentPage = 0;
    document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
    
    let filterId = '';
    if (period === 'all') filterId = 'filterAll';
    else if (period === '7') filterId = 'filter7';
    else if (period === '30') filterId = 'filter30';
    else if (period === 'month') filterId = 'filterMonth';
    
    const filterBtn = document.getElementById(filterId);
    if (filterBtn) filterBtn.classList.add('active');
    
    cache.clear();
    detailCache.clear();
    loadData();
}

// ============================================================
// 21. MONTH SELECTOR
// ============================================================
function initStatsMonthSelect() {
    const sel = document.getElementById('statsMonthSelect');
    if (!sel) return;
    
    const now = new Date();
    let html = '';
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        html += `<option value="${val}" ${i === 0 ? 'selected' : ''}>${i === 0 ? '📅 ' : ''}${label}</option>`;
    }
    sel.innerHTML = html;
}

// ============================================================
// 22. LOAD STATS FOR MONTH
// ============================================================
async function onStatsMonthChange(monthStr) {
    if (!currentPegawai || isStatsLoading) return;
    await loadStatsForMonth(monthStr);
}

async function loadStatsForMonth(monthStr) {
    if (!currentPegawai) return;
    if (isStatsLoading) {
        if (DEBUG_MODE) console.log('⏳ Stats already loading, skipping');
        return;
    }
    
    const pid = currentPegawai.ID || currentPegawai.id;
    const cacheKey = `stats_${pid}_${monthStr}`;
    
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_CONFIG.STATS_TTL) {
            if (DEBUG_MODE) console.log('✅ Using cached stats');
            updateStatsUI(cached.data);
            updateHeroStats(cached.data);
            return;
        }
        cache.delete(cacheKey);
    }
    
    isStatsLoading = true;
    
    const statsSection = document.querySelector('.stats-section');
    if (statsSection) {
        statsSection.style.opacity = '0.5';
        statsSection.style.pointerEvents = 'none';
    }
    
    try {
        const url = API + '?action=getPegawaiStats&id=' + encodeURIComponent(pid) + '&month=' + monthStr + '&cb=' + Date.now();
        if (DEBUG_MODE) console.log('📡 Fetching stats for month:', monthStr);
        
        let data;
        try {
            const response = await fetchWithRetry(url, {}, 10000, 1);
            data = await response.json();
        } catch (fetchError) {
            console.warn('⚠️ Stats fetch failed:', fetchError.message);
            if (isLocalFile) {
                const fallbackUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(API_BASE + '?action=getPegawaiStats&id=' + encodeURIComponent(pid) + '&month=' + monthStr)}`;
                const response = await fetchWithRetry(fallbackUrl, {}, 10000, 1);
                data = await response.json();
            } else {
                throw fetchError;
            }
        }
        
        if (data.status !== 'success') {
            throw new Error(data.message || 'Gagal memuat statistik');
        }
        
        const s = data.stats || {};
        const p = data.percentages || {};
        
        s.alpha = Math.max(0, s.alpha || 0);
        s.percentages = p;
        s.totalHariKerja = data.workingDays || 0;
        
        cache.set(cacheKey, {
            data: s,
            timestamp: Date.now()
        });
        
        updateStatsUI(s);
        updateHeroStats(s);
        
        const [y, m] = monthStr.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const title = document.getElementById('statsTitleText');
        if (title) title.textContent = 'Statistik ' + label;
        
    } catch (e) {
        console.warn('⚠️ Gagal load statistik bulan:', e);
        
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (cached && cached.data) {
                updateStatsUI(cached.data);
                updateHeroStats(cached.data);
                showToast('Info', 'Menampilkan data statistik dari cache', 'info');
            } else if (statsData) {
                updateStatsUI(statsData);
                updateHeroStats(statsData);
            }
        } else if (statsData) {
            updateStatsUI(statsData);
            updateHeroStats(statsData);
        } else {
            showToast('Error', 'Gagal memuat statistik: ' + e.message, 'error');
        }
    } finally {
        isStatsLoading = false;
        if (statsSection) {
            statsSection.style.opacity = '1';
            statsSection.style.pointerEvents = 'auto';
        }
    }
}

// ============================================================
// 23. UPDATE STATS UI
// ============================================================
function updateStatsUI(s) {
    if (!s) return;
    
    const set = (id, v) => { 
        const el = document.getElementById(id); 
        if (el) el.textContent = v; 
    };
    set('statHadir', s.hadir || 0);
    set('statTerlambat', s.terlambat || 0);
    set('statIzin', s.izin || 0);
    set('statSakit', s.sakit || 0);
    set('statDinas', s.dinas || 0);
    set('statAlpha', s.alpha || 0);
    
    const pct = s.percentages || {};
    const setPct = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val || '0.0') + '%';
    };
    setPct('statHadirPct', pct.hadir);
    setPct('statTerlambatPct', pct.terlambat);
    setPct('statIzinPct', pct.izin);
    setPct('statSakitPct', pct.sakit);
    setPct('statDinasPct', pct.dinas);
    setPct('statAlphaPct', pct.alpha);

    const max = Math.max(s.hadir || 0, s.terlambat || 0, s.izin || 0, s.sakit || 0, s.dinas || 0, s.alpha || 0, 1);
    const bar = (id, v) => { 
        const el = document.getElementById(id); 
        if (el) el.style.width = ((v || 0) / max * 100) + '%'; 
    };
    bar('barHadir', s.hadir);
    bar('barTerlambat', s.terlambat);
    bar('barIzin', s.izin);
    bar('barSakit', s.sakit);
    bar('barDinas', s.dinas);
    bar('barAlpha', s.alpha);
    
    updateHeroStats(s);
}

// ============================================================
// 24. NAVIGATION & UTILITIES
// ============================================================
function getPegawaiFromURL() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    if (id) {
        currentPegawai = {
            ID: id,
            Nama: params.get('nama') || 'Pegawai',
            Jabatan: params.get('jabatan') || 'PPA',
            Wilayah: params.get('wilayah') || 'UPT',
            Link_Foto_Profile: params.get('foto') || ''
        };
        
        const status = params.get('status');
        const msg = params.get('msg');
        if (status === 'success' && msg) {
            showSuccessToast(msg);
        }
        
        return true;
    }
    return false;
}

function goBack() {
    sessionStorage.setItem('return_from_profile', 'true');
    window.location.href = 'presensi.html';
}

function goToPresensi() {
    sessionStorage.setItem('return_from_profile', 'true');
    window.location.href = 'presensi.html';
}

function showSuccessToast(message) {
    const toast = document.getElementById('successToast');
    const msgEl = document.getElementById('toastMessage');
    if (toast && msgEl) {
        msgEl.innerText = message;
        toast.style.display = 'flex';
        setTimeout(() => closeToast(), 5000);
    }
}

function closeToast() {
    const toast = document.getElementById('successToast');
    if (toast) toast.style.display = 'none';
}

function showToast(title, message, type = "info") {
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

    btnOk.onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    };
}

function updateClock() {
    const now = new Date();
    const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaStr);
    const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const clockEl = document.getElementById('liveClock');
    if (clockEl) clockEl.innerText = timeStr;
}

// ============================================================
// 25. INITIALIZATION
// ============================================================
window.onload = async () => {
    lucide.createIcons();
    
    const hasParam = getPegawaiFromURL();
    
    if (!hasParam) {
        const saved = sessionStorage.getItem('profile_pegawai');
        if (saved) {
            try {
                currentPegawai = JSON.parse(saved);
            } catch(e) {}
        }
    }
    
    if (!currentPegawai) {
        showToast('Peringatan', 'Data pegawai tidak ditemukan.', 'warning');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }
    
    sessionStorage.setItem('profile_pegawai', JSON.stringify(currentPegawai));
    
    initStatsMonthSelect();
    await loadData();
    
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    await loadStatsForMonth(currentMonth);
    
    setInterval(updateClock, 1000);
    updateClock();
    
    try {
        if ('serviceWorker' in navigator) {
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:' ||
                (protocol === 'http:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
            if (isSecure) {
                navigator.serviceWorker.register('sw.js').catch(() => {});
            }
        }
    } catch (e) {}
    
    window.addEventListener('beforeunload', () => {
        cache.clear();
        detailCache.clear();
    });
    
    if (DEBUG_MODE) {
        console.log('✅ Profile Raport v4.4.2 loaded');
        console.log('📊 Stats:', statsData);
        console.log('📊 Records:', recordsData.length);
    }
};

// ============================================================
// END OF PROFILE_RAPORT.JS v4.4.2
// ============================================================
