// ============================================================
// PROFILE_RAPORT.JS - v4.4.2 (FIXED: All Issues)
// ============================================================
// CHANGELOG v4.4.2:
// ✅ Fixed: Duplicate variable declarations
// ✅ Fixed: Duplicate loadHolidaysForCalendar function
// ✅ Fixed: DEBUG_MODE declaration order
// ✅ Fixed: Calendar variable initialization
// ============================================================

const API_BASE = "https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec";
const isLocalFile = window.location.protocol === 'file:';
const API = isLocalFile 
    ? "https://cors-anywhere.herokuapp.com/" + API_BASE
    : API_BASE;

const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";

// ============================================================
// 0. CACHE & CONFIGURATION
// ============================================================
const CACHE_CONFIG = {
    TTL: 5 * 60 * 1000,
    DETAIL_TTL: 10 * 60 * 1000,
    PAGE_SIZE: 20
};

const cache = new Map();
const detailCache = new Map();

function getCached(key, fetchFn, ttl = CACHE_CONFIG.TTL) {
    if (cache.has(key)) {
        const { data, timestamp } = cache.get(key);
        if (Date.now() - timestamp < ttl) {
            if (DEBUG_MODE) console.log(`✅ Cache hit: ${key}`);
            return data;
        }
        cache.delete(key);
    }
    if (DEBUG_MODE) console.log(`🔄 Cache miss: ${key}`);
    const data = fetchFn();
    cache.set(key, { data, timestamp: Date.now() });
    return data;
}

// ============================================================
// 1. GLOBAL VARIABLES (FIXED: Move DEBUG_MODE to top)
// ============================================================
const DEBUG_MODE = false;  // ✅ Moved to top
let currentPegawai = null;
let statsData = null;
let recordsData = [];
let holidays = [];
let currentFilter = 'month';
let currentPage = 0;
let isLoadingMore = false;
let hasMoreData = true;

// ✅ Calendar variables - ONLY declare here, NOT in HTML
let calendarCurrentDate = new Date();
let calendarHolidays = [];

const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%232e446e' rx='20'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%23ffffff' opacity='.15'/%3E%3C/svg%3E";

// ============================================================
// 2. FETCH WITH TIMEOUT
// ============================================================
async function fetchWithTimeout(url, options = {}, timeout = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            cache: 'no-store'
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout after ' + timeout + 'ms');
        }
        throw error;
    }
}

// ============================================================
// 3. LOAD DATA
// ============================================================
async function loadData() {
    const overlay = document.getElementById('loadingOverlay');
    const statusText = document.getElementById('loadStatus');
    
    if (!currentPegawai) {
        showToast('Error', 'Data pegawai tidak ditemukan.', 'error');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }

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
            statsData.alpha = Math.max(0, statsData.alpha || 0);
            recordsData = data.records || [];
            holidays = data.holidays || [];
            calendarHolidays = holidays || [];
            
            renderAll();
            if (overlay) overlay.style.display = 'none';
            return;
        }

        const url = `${API}?action=getPegawaiStats&id=${encodeURIComponent(pid)}&period=${currentFilter}&cb=${Date.now()}`;
        if (DEBUG_MODE) console.log('📡 Fetching:', url);
        
        const r = await fetchWithTimeout(url, {}, 25000);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        
        const data = await r.json();
        
        if (data.status === 'success') {
            statsData = data.stats || {};
            statsData.percentages = data.percentages || {};
            statsData.totalHariKerja = data.workingDays || 0;
            statsData.alpha = Math.max(0, statsData.alpha || 0);
            recordsData = data.records || [];
            holidays = data.holidays || [];
            calendarHolidays = holidays || [];
            
            if (DEBUG_MODE) {
                console.log('✅ Data loaded');
                console.log('📊 Working days:', statsData.totalHariKerja);
                console.log('📊 Total Nilai:', statsData.totalNilai);
                console.log('📊 Alpha:', statsData.alpha);
                console.log('📊 Percentages:', statsData.percentages);
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
        if (overlay) overlay.style.display = 'none';
        showToast('Error', 'Gagal memuat data: ' + e.message, 'error');
    }
}

// ============================================================
// 4. RENDER ALL
// ============================================================
function renderAll() {
    renderProfile();
    renderTodayStatus();
    renderHistory();
    renderStats();
    renderSummaryStats();
}

// ============================================================
// 5. RENDER PROFILE
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
// 6. RENDER TODAY STATUS
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
// 7-21. [ALL OTHER FUNCTIONS REMAIN THE SAME]
// ============================================================

// ... (semua fungsi dari renderHistory sampai updateStatsUI tetap sama) ...

// ============================================================
// 22. KALENDER FUNCTIONS
// ============================================================

function toggleCalendar() {
    const dropdown = document.getElementById('calendarDropdown');
    if (!dropdown) return;
    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
        dropdown.style.display = 'block';
        renderCalendar(calendarCurrentDate);
    } else {
        dropdown.style.display = 'none';
    }
}

function changeMonth(delta) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
    renderCalendar(calendarCurrentDate);
}

function renderCalendar(date) {
    if (!date) date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                       'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const titleEl = document.getElementById('calendarMonthTitle');
    const labelEl = document.getElementById('calendarMonthLabel');
    if (titleEl) titleEl.textContent = monthNames[month] + ' ' + year;
    if (labelEl) labelEl.textContent = monthNames[month] + ' ' + year;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let gridHtml = '';
    
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    dayNames.forEach(name => {
        gridHtml += `<div class="day-name">${name}</div>`;
    });
    
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = startOffset - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        gridHtml += `<div class="day-cell other-month">${day}</div>`;
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const dateObj = new Date(year, month, i);
        const dateStr = dateObj.toISOString().split('T')[0];
        const dayOfWeek = dateObj.getDay();
        const isToday = dateStr === todayStr;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = calendarHolidays.some(h => h.tanggal === dateStr);
        
        let classes = 'day-cell';
        if (isToday) classes += ' today';
        if (isWeekend) classes += ' weekend';
        if (isHoliday) classes += ' holiday';
        
        gridHtml += `<div class="${classes}" onclick="selectDate('${dateStr}')">${i}</div>`;
    }
    
    const totalCells = startOffset + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remainingCells; i++) {
        gridHtml += `<div class="day-cell other-month">${i}</div>`;
    }
    
    const gridEl = document.getElementById('calendarGrid');
    if (gridEl) gridEl.innerHTML = gridHtml;
    
    // Holidays
    const monthHolidays = calendarHolidays.filter(h => {
        const hDate = new Date(h.tanggal);
        return hDate.getMonth() === month && hDate.getFullYear() === year;
    });
    
    let holidaysHtml = '';
    if (monthHolidays.length > 0) {
        monthHolidays.forEach(h => {
            holidaysHtml += `
                <div class="holiday-item">
                    <span class="holiday-dot"></span>
                    <span>${h.tanggal}: <span class="holiday-name">${h.keterangan || 'Hari Libur'}</span></span>
                </div>
            `;
        });
    } else {
        holidaysHtml = '<div style="text-align:center;font-size:0.7rem;color:var(--text-muted);padding:4px 0;">Tidak ada hari libur</div>';
    }
    
    const holidaysEl = document.getElementById('calendarHolidays');
    if (holidaysEl) {
        holidaysEl.innerHTML = `
            <div style="font-size:0.6rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Hari Libur</div>
            ${holidaysHtml}
        `;
    }
    
    setTimeout(() => {
        document.addEventListener('click', closeCalendarOutside);
    }, 100);
}

function closeCalendarOutside(e) {
    const wrapper = document.querySelector('.calendar-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        const dropdown = document.getElementById('calendarDropdown');
        if (dropdown) dropdown.style.display = 'none';
        document.removeEventListener('click', closeCalendarOutside);
    }
}

function selectDate(dateStr) {
    const dropdown = document.getElementById('calendarDropdown');
    if (dropdown) dropdown.style.display = 'none';
    
    const parts = dateStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const monthStr = year + '-' + String(month).padStart(2, '0');
    
    const monthSelect = document.getElementById('statsMonthSelect');
    if (monthSelect) {
        monthSelect.value = monthStr;
        onStatsMonthChange(monthStr);
    }
    
    showToast('Kalender', 'Menampilkan data untuk ' + formatDateIndo(dateStr), 'info');
}

// ============================================================
// 23. LOAD HOLIDAYS FOR CALENDAR (ONLY ONE VERSION)
// ============================================================
async function loadHolidaysForCalendar() {
    try {
        const response = await fetch(API + '?action=getHolidays&cb=' + Date.now());
        const data = await response.json();
        if (data.status === 'success') {
            calendarHolidays = data.data || [];
        }
    } catch (e) {
        console.warn('⚠️ Gagal load holidays:', e);
    }
}

// ============================================================
// 24-26. NAVIGATION & INITIALIZATION
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
// 26. INITIALIZATION
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
    
    // Load holidays untuk kalender
    await loadHolidaysForCalendar();
    
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
