// ============================================================
// PROFILE_RAPORT.JS - v4.5.1 (FIXED: Duplicate Declaration Error)
// ============================================================
// CHANGELOG v4.5.1:
// ✅ Fixed: "Identifier 'calendarCurrentDate' has already been declared"
// ✅ Fixed: Semua variable menggunakan var (bukan let/const)
// ✅ Fixed: Menghapus deklarasi duplikat
// ============================================================

var API_BASE = "https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec";
var isLocalFile = window.location.protocol === 'file:';
var API = isLocalFile 
    ? "https://cors-anywhere.herokuapp.com/" + API_BASE
    : API_BASE;

var GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";

// ============================================================
// 0. CACHE & CONFIGURATION
// ============================================================
var CACHE_CONFIG = {
    TTL: 5 * 60 * 1000,
    DETAIL_TTL: 10 * 60 * 1000,
    PAGE_SIZE: 20
};

var cache = new Map();
var detailCache = new Map();

function getCached(key, fetchFn, ttl) {
    if (ttl === undefined) ttl = CACHE_CONFIG.TTL;
    if (cache.has(key)) {
        var cached = cache.get(key);
        if (Date.now() - cached.timestamp < ttl) {
            if (DEBUG_MODE) console.log("✅ Cache hit: " + key);
            return cached.data;
        }
        cache.delete(key);
    }
    if (DEBUG_MODE) console.log("🔄 Cache miss: " + key);
    var data = fetchFn();
    cache.set(key, { data: data, timestamp: Date.now() });
    return data;
}

// ============================================================
// 1. GLOBAL VARIABLES
// ============================================================
var DEBUG_MODE = false;
var currentPegawai = null;
var statsData = null;
var recordsData = [];
var holidays = [];
var currentFilter = 'month';
var currentPage = 0;
var isLoadingMore = false;
var hasMoreData = true;

// ✅ Calendar variables (hanya dideklarasikan SEKALI di sini)
var calendarCurrentDate = new Date();
var calendarHolidays = [];

var placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%232e446e' rx='20'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%23ffffff' opacity='.15'/%3E%3C/svg%3E";

// ============================================================
// 2. FETCH WITH TIMEOUT
// ============================================================
async function fetchWithTimeout(url, options, timeout) {
    if (options === undefined) options = {};
    if (timeout === undefined) timeout = 30000;
    var controller = new AbortController();
    var timeoutId = setTimeout(function() { controller.abort(); }, timeout);
    
    try {
        var response = await fetch(url, {
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
    var overlay = document.getElementById('loadingOverlay');
    var statusText = document.getElementById('loadStatus');
    
    if (!currentPegawai) {
        showToast('Error', 'Data pegawai tidak ditemukan.', 'error');
        setTimeout(function() { goToPresensi(); }, 2000);
        return;
    }

    if (overlay) overlay.style.display = 'flex';
    if (statusText) statusText.innerText = 'Memuat Profile Raport...';

    try {
        var pid = currentPegawai.ID || currentPegawai.id;
        var cacheKey = 'dashboard_' + pid + '_' + currentFilter;
        
        var cachedData = cache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_CONFIG.TTL) {
            if (DEBUG_MODE) console.log('✅ Using cached dashboard data');
            var data = cachedData.data;
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

        var url = API + '?action=getPegawaiStats&id=' + encodeURIComponent(pid) + '&period=' + currentFilter + '&cb=' + Date.now();
        if (DEBUG_MODE) console.log('📡 Fetching:', url);
        
        var r = await fetchWithTimeout(url, {}, 25000);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        
        var data = await r.json();
        
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
    var p = currentPegawai;
    
    var rawUrl = p.Link_Foto_Profile || '';
    var finalSrc = placeholderImg;
    if (rawUrl) {
        if (rawUrl.includes('drive.google.com') || rawUrl.includes('googleusercontent.com')) {
            var fileId = "";
            var match = rawUrl.match(/\/d\/([^\/\?]+)/);
            if (match && match[1]) fileId = match[1];
            if (!fileId) {
                match = rawUrl.match(/[?&]id=([^&]+)/);
                if (match && match[1]) fileId = match[1];
            }
            if (fileId) {
                finalSrc = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';
            }
        } else {
            finalSrc = rawUrl;
        }
    }
    
    var img = document.getElementById('profileAvatar');
    if (img) {
        img.onload = null;
        img.onerror = null;
        img.style.transition = 'opacity 0.4s ease';
        img.style.opacity = 0;
        img.src = finalSrc;
        img.onload = function() { img.style.opacity = 1; };
        img.onerror = function() {
            img.onerror = null;
            img.src = placeholderImg;
            img.style.opacity = 1;
        };
    }
    
    var el = function(id) { return document.getElementById(id); };
    if (el('profileName')) el('profileName').innerText = p.Nama || p.nama;
    if (el('profileJob')) el('profileJob').innerHTML = '<i data-lucide="briefcase" size="14"></i> ' + (p.Jabatan || 'PPA');
    if (el('profileWil')) el('profileWil').innerHTML = '<i data-lucide="map-pin" size="14"></i> ' + (p.Wilayah || 'UPT');
    if (el('sidebarLogo')) el('sidebarLogo').src = GITHUB_LOGO_URL;
    
    lucide.createIcons();
}

// ============================================================
// 6. RENDER TODAY STATUS
// ============================================================
function renderTodayStatus() {
    var today = new Date();
    var todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    
    var el = function(id) { return document.getElementById(id); };
    if (el('todayDate')) {
        el('todayDate').innerText = today.toLocaleDateString('id-ID', { 
            day: 'numeric', month: 'long', year: 'numeric' 
        });
    }
    
    var todayRecords = recordsData.filter(function(r) {
        if (r.date) return r.date === todayStr;
        if (r.timestamp) {
            var d = new Date(r.timestamp);
            return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === todayStr;
        }
        return false;
    });
    
    var hadirTime = '--:--', pulangTime = '--:--';
    var hadirNilai = 0, pulangNilai = 0, specialNilai = 0;
    var hasHadir = false, hasPulang = false, hasSpecial = false;
    var specialType = '-';
    var totalPts = 0;
    
    todayRecords.forEach(function(r) {
        var status = (r.status || '').toLowerCase();
        var nilai = parseInt(r.nilai) || 0;
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
    
    var totalCount = (hasHadir ? 1 : 0) + (hasPulang ? 1 : 0) + (hasSpecial ? 1 : 0);
    if (el('todayTotal')) el('todayTotal').innerText = totalCount;
    if (el('todayTotalPoint')) el('todayTotalPoint').innerText = totalPts + ' pts';
    
    lucide.createIcons();
}

// ============================================================
// 7. RENDER HISTORY
// ============================================================
function renderHistory() {
    var tbody = document.getElementById('historyBody');
    if (!tbody) return;
    
    var grouped = recordsData.reduce(function(acc, r) {
        var dateKey = r.date || (r.timestamp ? new Date(r.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) : null);
        if (!dateKey) return acc;
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(r);
        return acc;
    }, {});
    
    var sortedDates = Object.keys(grouped).sort(function(a, b) { return b.localeCompare(a); });
    
    var start = currentPage * CACHE_CONFIG.PAGE_SIZE;
    var end = start + CACHE_CONFIG.PAGE_SIZE;
    var pageDates = sortedDates.slice(start, end);
    
    hasMoreData = end < sortedDates.length;
    
    if (pageDates.length === 0 && currentPage === 0) {
        tbody.innerHTML = '\n            <tr>\n                <td colspan="6" style="text-align:center;padding:40px;opacity:0.5">\n                    <i data-lucide="inbox" size="48" style="margin-bottom:12px"></i>\n                    <p>Belum ada data presensi</p>\n                </td>\n            </tr>\n        ';
        lucide.createIcons();
        updateHistoryCount(sortedDates.length);
        return;
    }
    
    var nowD = new Date();
    var todayKey = nowD.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    var curMonth = todayKey.slice(0, 7);
    
    var html = '';
    pageDates.forEach(function(date) {
        var records = grouped[date];
        var dateObj = new Date(date);
        var dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        var dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
        
        var rowMonth = date.slice(0, 7);
        var rowClass = '';
        if (date === todayKey) {
            rowClass = 'row-today';
        } else if (rowMonth === curMonth) {
            rowClass = 'row-current';
        } else {
            rowClass = 'row-past';
        }
        
        var masukTime = '-', pulangTime = '-';
        var totalNilai = 0;
        var statuses = [];
        
        records.forEach(function(r) {
            var status = (r.status || '').toLowerCase();
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
        
        var statusClass = 'alpha';
        var statusDisplay = 'Alpha';
        
        if (statuses.length > 1) {
            statusClass = 'multi-status';
            var displayStatuses = statuses.slice(0, 2);
            statusDisplay = displayStatuses.join(' + ');
            if (statuses.length > 2) statusDisplay += ' +';
        } else if (statuses.length === 1) {
            statusClass = statuses[0].toLowerCase();
            statusDisplay = statuses[0];
        }
        
        html += '\n            <tr class="' + rowClass + '" onclick="showDetail(\'' + date + '\')">\n                <td>' + dateStr + '</td>\n                <td>' + dayName + '</td>\n                <td>' + masukTime + '</td>\n                <td>' + pulangTime + '</td>\n                <td style="font-weight:800;color:var(--sda-toska)">' + totalNilai + '</td>\n                <td><span class="status-badge-table ' + statusClass + '">' + statusDisplay + '</span></td>\n            </tr>\n        ';
    });
    
    tbody.innerHTML = html;
    lucide.createIcons();
    updateHistoryCount(sortedDates.length);
}

// ============================================================
// 8. UPDATE HISTORY COUNT
// ============================================================
function updateHistoryCount(total) {
    var el = document.getElementById('historyCount');
    if (el) {
        var start = currentPage * CACHE_CONFIG.PAGE_SIZE + 1;
        var end = Math.min((currentPage + 1) * CACHE_CONFIG.PAGE_SIZE, total);
        if (total > 0) {
            el.innerText = 'Menampilkan ' + start + '-' + end + ' dari ' + total + ' data';
        } else {
            el.innerText = 'Belum ada data';
        }
    }
    
    var btn = document.getElementById('btnLoadMore');
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
// 9. LOAD MORE HISTORY
// ============================================================
function loadMoreHistory() {
    if (isLoadingMore || !hasMoreData) return;
    isLoadingMore = true;
    
    var btn = document.getElementById('btnLoadMore');
    if (btn) {
        btn.innerHTML = '<i data-lucide="loader" size="16" style="animation:spin 0.8s linear infinite"></i> Loading...';
        btn.disabled = true;
        lucide.createIcons();
    }
    
    currentPage++;
    
    setTimeout(function() {
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
// 10. RENDER STATS
// ============================================================
function renderStats() {
    if (!statsData) return;
    
    var el = function(id) { return document.getElementById(id); };
    
    // ✅ Tampilkan angka di stats card
    if (el('statHadir')) el('statHadir').innerText = statsData.hadir || 0;
    if (el('statTerlambat')) el('statTerlambat').innerText = statsData.terlambat || 0;
    if (el('statIzin')) el('statIzin').innerText = statsData.izin || 0;
    if (el('statSakit')) el('statSakit').innerText = statsData.sakit || 0;
    if (el('statDinas')) el('statDinas').innerText = statsData.dinas || 0;
    
    var alpha = Math.max(0, statsData.alpha || 0);
    if (el('statAlpha')) el('statAlpha').innerText = alpha;
    
    // ✅ Tampilkan persentase
    var pct = statsData.percentages || {};
    var setPct = function(id, val) {
        var elPct = document.getElementById(id);
        if (elPct) elPct.innerText = (val || '0.0') + '%';
    };
    setPct('statHadirPct', pct.hadir);
    setPct('statTerlambatPct', pct.terlambat);
    setPct('statIzinPct', pct.izin);
    setPct('statSakitPct', pct.sakit);
    setPct('statDinasPct', pct.dinas);
    setPct('statAlphaPct', pct.alpha);
    
    // ✅ Update footer
    updateHeroStats(statsData);
    
    // ✅ Working days di header
    var workingDays = statsData.totalHariKerja || 0;
    if (el('totalWorkingDays')) {
        el('totalWorkingDays').innerText = workingDays;
    }
    
    // ✅ Bar chart
    var maxStat = Math.max(
        statsData.hadir || 0,
        statsData.terlambat || 0,
        statsData.izin || 0,
        statsData.sakit || 0,
        statsData.dinas || 0,
        alpha || 0,
        1
    );
    
    setTimeout(function() {
        var bar = function(id, val) {
            var elBar = document.getElementById(id);
            if (elBar) elBar.style.width = ((val || 0) / maxStat * 100) + '%';
        };
        bar('barHadir', statsData.hadir);
        bar('barTerlambat', statsData.terlambat);
        bar('barIzin', statsData.izin);
        bar('barSakit', statsData.sakit);
        bar('barDinas', statsData.dinas);
        bar('barAlpha', alpha);
    }, 100);
}

// ============================================================
// 11. UPDATE HERO STATS
// ============================================================
function updateHeroStats(s) {
    var totalKehadiran = (s.hadir || 0) + 
                          (s.terlambat || 0) + 
                          (s.izin || 0) + 
                          (s.sakit || 0) + 
                          (s.dinas || 0);
    
    var totalHariKerjaBulan = s.totalHariKerja || 0;
    
    var el = function(id) { return document.getElementById(id); };
    if (el('totalKehadiranStats')) {
        el('totalKehadiranStats').innerText = totalKehadiran;
    }
    if (el('totalAlphaStats')) {
        el('totalAlphaStats').innerText = totalHariKerjaBulan;
    }
    
    if (DEBUG_MODE) {
        console.log('📊 Hero Stats Updated:');
        console.log('  Total Kehadiran:', totalKehadiran);
        console.log('  Hari Kerja (Bulan):', totalHariKerjaBulan);
        console.log('  Alpha (Stats Card):', s.alpha);
    }
}

// ============================================================
// 12. RENDER SUMMARY STATS (HERO)
// ============================================================
function renderSummaryStats() {
    if (!statsData) return;
    
    var workingDays = statsData.totalHariKerja || 0;
    var totalNilai = statsData.totalNilai || 0;
    var maxPossibleScore = workingDays * 100;
    
    var persentase = maxPossibleScore > 0 
        ? Math.round((totalNilai / maxPossibleScore) * 100) 
        : 0;
    
    var totalKehadiran = (statsData.hadir || 0) + 
                          (statsData.terlambat || 0) + 
                          (statsData.izin || 0) + 
                          (statsData.sakit || 0) + 
                          (statsData.dinas || 0);
    
    var el = function(id) { return document.getElementById(id); };
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
    }
}

// ============================================================
// 13. SHOW DETAIL (FIXED - Dengan Retry 3x)
// ============================================================
async function showDetail(date) {
    var card = document.getElementById('detailCard');
    var content = document.getElementById('detailContent');
    if (!card || !content) return;
    
    var cacheKey = 'detail_' + currentPegawai.ID + '_' + date;
    if (detailCache.has(cacheKey)) {
        var cached = detailCache.get(cacheKey);
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
    
    var lastError = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
        try {
            var url = API + '?action=getPresensiDetail&id=' + encodeURIComponent(currentPegawai.ID) + '&date=' + date + '&cb=' + Date.now();
            if (DEBUG_MODE) console.log('📡 Fetching detail (attempt ' + attempt + '):', url);
            
            var r = await fetchWithTimeout(url, {}, 30000);
            var data = await r.json();
            
            if (data.status === 'success') {
                detailCache.set(cacheKey, {
                    data: data,
                    timestamp: Date.now()
                });
                renderDetailContent(data);
                return;
            } else {
                content.innerHTML = '<p style="color:var(--danger)">' + data.message + '</p>';
                return;
            }
        } catch (e) {
            lastError = e;
            console.warn('⚠️ Detail attempt ' + attempt + ' failed:', e.message);
            if (attempt < 3) {
                content.innerHTML = '<p style="text-align:center;opacity:0.5">Mencoba ulang (' + attempt + '/3)...</p>';
                await new Promise(function(r) { setTimeout(r, 1500 * attempt); });
            }
        }
    }
    
    console.error('❌ Detail error after 3 attempts:', lastError);
    content.innerHTML = '<p style="color:var(--danger)">Gagal memuat detail: ' + lastError.message + '. Silakan coba lagi.</p>';
}

// ============================================================
// 14. RENDER DETAIL CONTENT
// ============================================================
function renderDetailContent(data) {
    var content = document.getElementById('detailContent');
    var records = data.records || [];
    
    var hadirRecord = records.find(function(r) {
        var s = (r.status || '').toLowerCase();
        return s.includes('hadir') || s.includes('terlambat') || s.includes('qr hadir');
    });
    
    var pulangRecord = records.find(function(r) {
        var s = (r.status || '').toLowerCase();
        return s.includes('pulang') || s.includes('qr pulang');
    });
    
    var specialRecord = records.find(function(r) {
        var s = (r.status || '').toLowerCase();
        return s.includes('izin') || s.includes('sakit') || s.includes('dinas');
    });
    
    var html = '<h4 style="margin-bottom:16px;color:var(--sda-toska)">📅 ' + formatDateIndo(data.date) + '</h4>';
    
    if (hadirRecord) html += renderDetailSection('☀️ Absen Hadir', hadirRecord, 'hadir');
    if (pulangRecord) html += renderDetailSection('🌙 Absen Pulang', pulangRecord, 'pulang');
    if (specialRecord) html += renderDetailSection('📋 Status Khusus', specialRecord, 'special');
    
    if (!hadirRecord && !pulangRecord && !specialRecord) {
        html += '<p style="text-align:center;opacity:0.5">Tidak ada data presensi</p>';
    }
    
    html += '\n        <div style="text-align:center;margin-top:20px">\n            <button class="btn-close-detail" onclick="closeDetail()">\n                <i data-lucide="x" size="20"></i>\n            </button>\n        </div>\n    ';
    
    content.innerHTML = html;
    lucide.createIcons();
}

// ============================================================
// 15. RENDER DETAIL SECTION
// ============================================================
function renderDetailSection(title, record, type) {
    var colors = {
        hadir: 'var(--success)',
        pulang: 'var(--pu-blue)',
        special: '#a855f7'
    };
    
    var escapeHtml = function(str) {
        if (!str) return '-';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };
    
    var status = escapeHtml(record.status);
    var keterangan = escapeHtml(record.keterangan || '-');
    var gps = escapeHtml(record.gps || '-');
    var nilai = record.nilai || 0;
    var time = record.time || '--:--';
    
    var html = '\n    <div style="margin-bottom:20px;padding:16px;background:linear-gradient(135deg,rgba(30,64,175,0.92),rgba(15,23,42,0.95));border-radius:16px;border-left:4px solid ' + colors[type] + ';box-shadow:0 8px 24px rgba(30,64,175,0.35)">\n        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">\n            <h5 style="font-size:0.9rem;font-weight:800;color:#ffffff;margin:0">' + title + '</h5>\n            <span style="font-family:\'JetBrains Mono\',monospace;font-size:0.85rem;color:' + colors[type] + ';font-weight:800">\n                ' + time + '\n            </span>\n        </div>\n        \n        <div class="detail-row">\n            <div class="detail-label">Status</div>\n            <div class="detail-value">' + status + '</div>\n        </div>\n        \n        <div class="detail-row">\n            <div class="detail-label">Nilai</div>\n            <div class="detail-value" style="color:' + colors[type] + ';font-weight:800">' + nilai + ' pts</div>\n        </div>\n        \n        <div class="detail-row">\n            <div class="detail-label">Keterangan</div>\n            <div class="detail-value">' + keterangan + '</div>\n        </div>\n        \n        ' + (gps && gps !== '-' ? '\n        <div class="detail-row">\n            <div class="detail-label">GPS</div>\n            <div class="detail-value" style="font-family:\'JetBrains Mono\',monospace;font-size:0.75rem;background:rgba(0,0,0,0.25);padding:6px 10px;border-radius:8px;border:1px solid rgba(96,165,250,0.2)">\n                ' + gps + '\n            </div>\n        </div>' : '') + '\n        \n        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    
    if (record.foto_selfie && record.foto_selfie !== '-') {
        html += '\n        <div>\n            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase;color:rgba(255,255,255,0.7)">\n                Foto Selfie\n            </div>\n            <img src="' + record.foto_selfie + '" \n                 alt="Selfie" \n                 loading="lazy"\n                 style="width:100%;border-radius:12px;cursor:pointer;border:2px solid rgba(96,165,250,0.4)"\n                 onclick="openImageModal(\'' + record.foto_selfie + '\')"\n                 onerror="this.style.display=\'none\'">\n        </div>';
    }
    
    if (record.foto_kerja && record.foto_kerja !== '-') {
        html += '\n        <div>\n            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase;color:rgba(255,255,255,0.7)">\n                Foto Kerja\n            </div>\n            <img src="' + record.foto_kerja + '" \n                 alt="Kerja" \n                 loading="lazy"\n                 style="width:100%;border-radius:12px;cursor:pointer;border:2px solid rgba(96,165,250,0.4)"\n                 onclick="openImageModal(\'' + record.foto_kerja + '\')"\n                 onerror="this.style.display=\'none\'">\n        </div>';
    }
    
    html += '\n    </div></div>';
    return html;
}

// ============================================================
// 16. OPEN IMAGE MODAL
// ============================================================
function openImageModal(url) {
    var modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:300000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
    modal.onclick = function() { modal.remove(); };
    
    var img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.8);';
    img.loading = 'lazy';
    
    modal.appendChild(img);
    document.body.appendChild(modal);
}

// ============================================================
// 17. FORMAT DATE
// ============================================================
function formatDateIndo(dateStr) {
    var date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { 
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
    });
}

function closeDetail() {
    var card = document.getElementById('detailCard');
    if (card) card.style.display = 'none';
}

// ============================================================
// 18. FILTER
// ============================================================
function setFilter(period) {
    currentFilter = period;
    currentPage = 0;
    document.querySelectorAll('.btn-filter').forEach(function(btn) { btn.classList.remove('active'); });
    
    var filterId = '';
    if (period === 'all') filterId = 'filterAll';
    else if (period === '7') filterId = 'filter7';
    else if (period === '30') filterId = 'filter30';
    else if (period === 'month') filterId = 'filterMonth';
    
    var filterBtn = document.getElementById(filterId);
    if (filterBtn) filterBtn.classList.add('active');
    
    cache.clear();
    detailCache.clear();
    loadData();
}

// ============================================================
// 19. MONTH SELECTOR
// ============================================================
function initStatsMonthSelect() {
    var sel = document.getElementById('statsMonthSelect');
    if (!sel) return;
    
    var now = new Date();
    var html = '';
    for (var i = 0; i < 6; i++) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        var label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        html += '<option value="' + val + '" ' + (i === 0 ? 'selected' : '') + '>' + (i === 0 ? '📅 ' : '') + label + '</option>';
    }
    sel.innerHTML = html;
}

// ============================================================
// 20. LOAD STATS FOR MONTH
// ============================================================
async function onStatsMonthChange(monthStr) {
    if (!currentPegawai) return;
    await loadStatsForMonth(monthStr);
}

async function loadStatsForMonth(monthStr) {
    if (!currentPegawai) return;
    
    var pid = currentPegawai.ID || currentPegawai.id;
    var cacheKey = 'stats_' + pid + '_' + monthStr;
    
    if (cache.has(cacheKey)) {
        var cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_CONFIG.TTL) {
            if (DEBUG_MODE) console.log('✅ Using cached stats');
            updateStatsUI(cached.data);
            updateHeroStats(cached.data);
            return;
        }
        cache.delete(cacheKey);
    }
    
    try {
        var url = API + '?action=getPegawaiStats&id=' + encodeURIComponent(pid) + '&month=' + monthStr + '&cb=' + Date.now();
        var r = await fetchWithTimeout(url, {}, 20000);
        var d = await r.json();
        
        if (d.status !== 'success') return;
        var s = d.stats || {};
        var p = d.percentages || {};
        
        s.alpha = Math.max(0, s.alpha || 0);
        s.percentages = p;
        s.totalHariKerja = d.workingDays || 0;
        
        cache.set(cacheKey, {
            data: s,
            timestamp: Date.now()
        });
        
        updateStatsUI(s);
        updateHeroStats(s);
        
        var parts = monthStr.split('-').map(Number);
        var y = parts[0], m = parts[1];
        var label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        var title = document.getElementById('statsTitleText');
        if (title) title.textContent = 'Statistik ' + label;
        
        // ✅ Update kalender
        calendarCurrentDate = new Date(y, m - 1, 1);
        renderCalendar(calendarCurrentDate);
        
    } catch (e) {
        console.warn('⚠️ Gagal load statistik bulan:', e);
    }
}

// ============================================================
// 21. UPDATE STATS UI
// ============================================================
function updateStatsUI(s) {
    var set = function(id, v) { 
        var el = document.getElementById(id); 
        if (el) el.textContent = v; 
    };
    set('statHadir', s.hadir || 0);
    set('statTerlambat', s.terlambat || 0);
    set('statIzin', s.izin || 0);
    set('statSakit', s.sakit || 0);
    set('statDinas', s.dinas || 0);
    set('statAlpha', s.alpha || 0);
    
    var pct = s.percentages || {};
    var setPct = function(id, val) {
        var el = document.getElementById(id);
        if (el) el.textContent = (val || '0.0') + '%';
    };
    setPct('statHadirPct', pct.hadir);
    setPct('statTerlambatPct', pct.terlambat);
    setPct('statIzinPct', pct.izin);
    setPct('statSakitPct', pct.sakit);
    setPct('statDinasPct', pct.dinas);
    setPct('statAlphaPct', pct.alpha);

    var max = Math.max(s.hadir || 0, s.terlambat || 0, s.izin || 0, s.sakit || 0, s.dinas || 0, s.alpha || 0, 1);
    var bar = function(id, v) { 
        var el = document.getElementById(id); 
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
// 22. NAVIGATION & UTILITIES
// ============================================================
function getPegawaiFromURL() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    
    if (id) {
        currentPegawai = {
            ID: id,
            Nama: params.get('nama') || 'Pegawai',
            Jabatan: params.get('jabatan') || 'PPA',
            Wilayah: params.get('wilayah') || 'UPT',
            Link_Foto_Profile: params.get('foto') || ''
        };
        
        var status = params.get('status');
        var msg = params.get('msg');
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
    var toast = document.getElementById('successToast');
    var msgEl = document.getElementById('toastMessage');
    if (toast && msgEl) {
        msgEl.innerText = message;
        toast.style.display = 'flex';
        setTimeout(function() { closeToast(); }, 5000);
    }
}

function closeToast() {
    var toast = document.getElementById('successToast');
    if (toast) toast.style.display = 'none';
}

function showToast(title, message, type) {
    if (type === undefined) type = "info";
    var modal = document.getElementById('notificationModal');
    var content = document.getElementById('notifModalContent');
    var iconEl = document.getElementById('notifIcon');
    var titleEl = document.getElementById('notifTitle');
    var msgEl = document.getElementById('notifMessage');
    var btnOk = document.getElementById('btnNotifOk');
    
    if (!modal || !content) return;

    content.className = 'notif-modal-content';
    content.classList.add('notif-' + type);
    titleEl.innerText = title;
    msgEl.innerText = message;
    btnOk.innerHTML = '<i data-lucide="check" size="18"></i> Mengerti';
    
    var icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
    iconEl.setAttribute('data-lucide', icons[type] || 'info');
    lucide.createIcons();

    modal.style.display = 'flex';
    requestAnimationFrame(function() { modal.classList.add('show'); });

    btnOk.onclick = function() {
        modal.classList.remove('show');
        setTimeout(function() { modal.style.display = 'none'; }, 300);
    };
}

function updateClock() {
    var now = new Date();
    var jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    var jakartaDate = new Date(jakartaStr);
    var timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    var clockEl = document.getElementById('liveClock');
    if (clockEl) clockEl.innerText = timeStr;
}

// ============================================================
// 23. KALENDER FUNCTIONS
// ============================================================
function toggleCalendar() {
    var dropdown = document.getElementById('calendarDropdown');
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
    var year = date.getFullYear();
    var month = date.getMonth();
    
    var monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    var titleEl = document.getElementById('calendarMonthTitle');
    var labelEl = document.getElementById('calendarMonthLabel');
    if (titleEl) titleEl.textContent = monthNames[month] + ' ' + year;
    if (labelEl) labelEl.textContent = monthNames[month] + ' ' + year;
    
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var daysInPrevMonth = new Date(year, month, 0).getDate();
    
    var today = new Date();
    var todayStr = today.toISOString().split('T')[0];
    
    var gridHtml = '';
    
    var dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    for (var d = 0; d < dayNames.length; d++) {
        gridHtml += '<div class="day-name">' + dayNames[d] + '</div>';
    }
    
    var startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (var i = startOffset - 1; i >= 0; i--) {
        var day = daysInPrevMonth - i;
        gridHtml += '<div class="day-cell other-month">' + day + '</div>';
    }
    
    for (var i = 1; i <= daysInMonth; i++) {
        var dateObj = new Date(year, month, i);
        var dateStr = dateObj.toISOString().split('T')[0];
        var dayOfWeek = dateObj.getDay();
        var isToday = dateStr === todayStr;
        var isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        var isHoliday = false;
        var holidayName = '';
        
        for (var h = 0; h < calendarHolidays.length; h++) {
            if (calendarHolidays[h].tanggal === dateStr) {
                isHoliday = true;
                holidayName = calendarHolidays[h].keterangan || 'Hari Libur';
                break;
            }
        }
        
        var classes = 'day-cell';
        if (isToday) classes += ' today';
        if (isWeekend) classes += ' weekend';
        if (isHoliday) classes += ' holiday';
        
        gridHtml += '<div class="' + classes + '" onclick="selectDate(\'' + dateStr + '\')" title="' + (isHoliday ? holidayName : '') + '">' + i + '</div>';
    }
    
    var totalCells = startOffset + daysInMonth;
    var remainingCells = (7 - (totalCells % 7)) % 7;
    for (var i = 1; i <= remainingCells; i++) {
        gridHtml += '<div class="day-cell other-month">' + i + '</div>';
    }
    
    var gridEl = document.getElementById('calendarGrid');
    if (gridEl) gridEl.innerHTML = gridHtml;
    
    // Holidays
    var monthHolidays = [];
    for (var h = 0; h < calendarHolidays.length; h++) {
        var hDate = new Date(calendarHolidays[h].tanggal);
        if (hDate.getMonth() === month && hDate.getFullYear() === year) {
            monthHolidays.push(calendarHolidays[h]);
        }
    }
    
    var holidaysHtml = '';
    if (monthHolidays.length > 0) {
        for (var h = 0; h < monthHolidays.length; h++) {
            holidaysHtml += '<div class="holiday-item">\n                        <span class="holiday-dot"></span>\n                        <span>' + monthHolidays[h].tanggal + ': <span class="holiday-name">' + (monthHolidays[h].keterangan || 'Hari Libur') + '</span></span>\n                    </div>';
        }
    } else {
        holidaysHtml = '<div style="text-align:center;font-size:0.7rem;color:var(--text-muted);padding:4px 0;">Tidak ada hari libur</div>';
    }
    
    var holidaysEl = document.getElementById('calendarHolidays');
    if (holidaysEl) {
        holidaysEl.innerHTML = '\n                <div style="font-size:0.6rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Hari Libur</div>\n                ' + holidaysHtml + '\n            ';
    }
    
    // Close on outside click
    setTimeout(function() {
        document.addEventListener('click', closeCalendarOutside);
    }, 100);
}

function closeCalendarOutside(e) {
    var wrapper = document.querySelector('.calendar-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        var dropdown = document.getElementById('calendarDropdown');
        if (dropdown) dropdown.style.display = 'none';
        document.removeEventListener('click', closeCalendarOutside);
    }
}

function selectDate(dateStr) {
    var dropdown = document.getElementById('calendarDropdown');
    if (dropdown) dropdown.style.display = 'none';
    
    var parts = dateStr.split('-');
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]);
    var monthStr = year + '-' + String(month).padStart(2, '0');
    
    var monthSelect = document.getElementById('statsMonthSelect');
    if (monthSelect) {
        monthSelect.value = monthStr;
        onStatsMonthChange(monthStr);
    }
    
    showToast('Kalender', 'Menampilkan data untuk ' + formatDateIndo(dateStr), 'info');
}

// ============================================================
// 24. LOAD HOLIDAYS FOR CALENDAR
// ============================================================
async function loadHolidaysForCalendar() {
    try {
        var response = await fetch(API + '?action=getHolidays&cb=' + Date.now());
        var data = await response.json();
        if (data.status === 'success') {
            calendarHolidays = data.data || [];
        }
    } catch (e) {
        console.warn('⚠️ Gagal load holidays:', e);
    }
}

// ============================================================
// 25. INITIALIZATION
// ============================================================
window.onload = async function() {
    lucide.createIcons();
    
    var hasParam = getPegawaiFromURL();
    
    if (!hasParam) {
        var saved = sessionStorage.getItem('profile_pegawai');
        if (saved) {
            try {
                currentPegawai = JSON.parse(saved);
            } catch(e) {}
        }
    }
    
    if (!currentPegawai) {
        showToast('Peringatan', 'Data pegawai tidak ditemukan.', 'warning');
        setTimeout(function() { goToPresensi(); }, 2000);
        return;
    }
    
    sessionStorage.setItem('profile_pegawai', JSON.stringify(currentPegawai));
    
    // ✅ Load holidays untuk kalender
    await loadHolidaysForCalendar();
    
    initStatsMonthSelect();
    await loadData();
    
    var now = new Date();
    var currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    await loadStatsForMonth(currentMonth);
    
    setInterval(updateClock, 1000);
    updateClock();
    
    try {
        if ('serviceWorker' in navigator) {
            var protocol = window.location.protocol;
            var isSecure = protocol === 'https:' ||
                (protocol === 'http:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));
            if (isSecure) {
                navigator.serviceWorker.register('sw.js').catch(function() {});
            }
        }
    } catch (e) {}
    
    window.addEventListener('beforeunload', function() {
        cache.clear();
        detailCache.clear();
    });
    
    if (DEBUG_MODE) {
        console.log('✅ Profile Raport v4.5.1 loaded');
        console.log('📊 Stats:', statsData);
        console.log('📊 Records:', recordsData.length);
    }
};

// ============================================================
// END OF PROFILE_RAPORT.JS v4.5.1
// ============================================================
