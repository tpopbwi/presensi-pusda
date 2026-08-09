// ============================================================
// PROFILE_RAPORT.JS - v2.0.2 (FIXED - SUPPORT file://)
// ============================================================

// ============================================================
// 1. KONFIGURASI
// ============================================================
const API_BASE = "https://script.google.com/macros/s/AKfycbxH9YKIi5epf2PvsJL9Whens2URSaZzi1aciTEiyIYitVBvjJP83tNa-B9xaIuN5f-3/exec";

// ✅ Deteksi file://
const isLocalFile = window.location.protocol === 'file:';

// ✅ Gunakan proxy jika di file:// (tapi dengan fallback ke cache)
const API = isLocalFile 
    ? "https://cors-anywhere.herokuapp.com/" + API_BASE
    : API_BASE;

// ✅ Tampilkan info di console (bukan toast)
if (isLocalFile) {
    console.warn('⚠️ Aplikasi berjalan di file:// - Menggunakan data cache jika tersedia');
    console.warn('💡 Untuk data terbaru, gunakan Live Server');
}

const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";

let currentPegawai = null;
let dbP = [];
let currentFilter = '7';
let currentPage = 0;
const PAGE_SIZE = 7;
let allRecords = [];
let holidays = [];

// ✅ Placeholder lebih besar untuk pop out
const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%232e446e' rx='20'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%23ffffff' opacity='.15'/%3E%3Ccircle cx='100' cy='100' r='20' fill='%23ffffff' opacity='.08'/%3E%3Crect x='60' y='175' width='80' height='16' rx='8' fill='%23ffffff' opacity='.1'/%3E%3C/svg%3E";

// ============================================================
// 2. HELPER FUNCTIONS - NORMALISASI STATUS
// ============================================================

function normalizeStatus(status) {
    const s = (status || "").toLowerCase().trim();
    
    if (s.includes('qr hadir') || s.includes('qr terlambat') || 
        s.includes('qr terlambat ringan') || s.includes('qr terlambat berat')) {
        return 'qr_hadir';
    }
    
    if (s.includes('hadir') || s.includes('terlambat')) {
        return 'hadir';
    }
    
    if (s.includes('qr pulang')) {
        return 'qr_pulang';
    }
    
    if (s.includes('pulang')) {
        return 'pulang';
    }
    
    if (s.includes('izin')) return 'izin';
    if (s.includes('sakit')) return 'sakit';
    if (s.includes('dinas')) return 'dinas';
    
    return 'unknown';
}

function isHadirStatus(status) {
    const norm = normalizeStatus(status);
    return ['hadir', 'qr_hadir', 'izin', 'sakit', 'dinas'].includes(norm);
}

function isPulangStatus(status) {
    const norm = normalizeStatus(status);
    return ['pulang', 'qr_pulang'].includes(norm);
}

function isSpecialStatus(status) {
    const norm = normalizeStatus(status);
    return ['izin', 'sakit', 'dinas'].includes(norm);
}

// ============================================================
// 3. HELPER FUNCTIONS - LIBUR NASIONAL & HARI KERJA
// ============================================================

async function loadHolidays() {
    try {
        const cached = sessionStorage.getItem('holidays_cache');
        if (cached) {
            const data = JSON.parse(cached);
            if (data && data.length > 0) {
                holidays = data;
                return holidays;
            }
        }
        
        // ✅ Hanya fetch jika bukan file:// atau jika ada koneksi
        if (!isLocalFile) {
            const r = await fetch(API + "?action=getHolidays", {
                redirect: 'follow',
                cache: 'no-cache'
            });
            
            if (r.ok) {
                const data = await r.json();
                if (data.status === 'success' && data.data) {
                    holidays = data.data.map(h => {
                        const d = new Date(h.tanggal || h.date);
                        return d.toISOString().split('T')[0];
                    });
                    sessionStorage.setItem('holidays_cache', JSON.stringify(holidays));
                    return holidays;
                }
            }
        }
        
        holidays = [];
        return holidays;
    } catch (e) {
        console.warn('⚠️ Gagal load data libur:', e);
        holidays = [];
        return holidays;
    }
}

function isHoliday(date) {
    const dateStr = date.toISOString().split('T')[0];
    return holidays.includes(dateStr);
}

function isWorkingDay(date) {
    const day = date.getDay();
    if (day < 1 || day > 5) return false;
    return !isHoliday(date);
}

function getWorkingDaysInMonth(year, month) {
    let count = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        if (isWorkingDay(date)) {
            count++;
        }
    }
    return count;
}

function groupRecordsByDate(records) {
    const grouped = {};
    records.forEach(row => {
        const d = new Date(row.timestamp);
        const key = d.toISOString().split('T')[0];
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
    });
    return grouped;
}

// ============================================================
// 4. LOAD DATA FROM URL PARAM
// ============================================================
function getPegawaiFromURL() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const nama = params.get('nama');
    const jabatan = params.get('jabatan');
    const wilayah = params.get('wilayah');
    const foto = params.get('foto');
    const status = params.get('status');
    const msg = params.get('msg');

    if (id) {
        currentPegawai = {
            ID: id,
            Nama: nama || 'Pegawai',
            Jabatan: jabatan || 'PPA',
            Wilayah: wilayah || 'UPT',
            Link_Foto_Profile: foto || ''
        };
        
        if (status === 'success' && msg) {
            showSuccessToast(msg);
        }
        
        return true;
    }
    return false;
}

// ============================================================
// 5. LOAD DATA - OPTIMIZED UNTUK file://
// ============================================================
async function loadData() {
    const overlay = document.getElementById('loadingOverlay');
    const statusText = document.getElementById('loadStatus');
    
    if (!currentPegawai) {
        const saved = sessionStorage.getItem('profile_pegawai');
        if (saved) {
            try {
                currentPegawai = JSON.parse(saved);
            } catch(e) {}
        }
    }
    
    if (!currentPegawai) {
        showToast('Error', 'Data pegawai tidak ditemukan. Silakan pilih dari halaman presensi.', 'error');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }

    overlay.style.display = 'flex';
    statusText.innerText = 'Memuat Profile Raport...';

    try {
        // ✅ LOAD LIBUR (dari cache jika ada)
        await loadHolidays();
        
        // ✅ CEK DATA DI CACHE TERLEBIH DAHULU (seperti versi lama)
        const cacheKey = 'presensi_cache_' + currentPegawai.ID;
        const cachedData = sessionStorage.getItem(cacheKey);
        let hasCache = false;
        
        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData);
                if (parsed && parsed.length > 0) {
                    dbP = parsed;
                    allRecords = [...dbP];
                    hasCache = true;
                    console.log('📦 Data dari cache:', dbP.length, 'records');
                }
            } catch(e) {}
        }
        
        // ✅ JIKA ADA CACHE, TAMPILKAN DULU (seperti versi lama)
        if (hasCache && dbP.length > 0) {
            renderProfile();
            renderTodayStatus();
            renderHistory();
            renderStats();
            
            overlay.style.display = 'none';
            sessionStorage.setItem('profile_pegawai', JSON.stringify(currentPegawai));
            
            // ✅ UPDATE BACKGROUND TANPA MENUNGGU
            if (!isLocalFile) {
                updateDataInBackground();
            }
            
            return;
        }
        
        // ✅ JIKA TIDAK ADA CACHE, AMBIL DARI API
        if (!isLocalFile) {
            const r = await fetch(API + "?action=getPresensiByPegawai&id=" + encodeURIComponent(currentPegawai.ID), {
                redirect: 'follow',
                cache: 'no-cache'
            });
            
            if (r.ok) {
                const data = await r.json();
                if (data.status === 'success' && data.data) {
                    dbP = data.data || [];
                    allRecords = [...dbP];
                    sessionStorage.setItem(cacheKey, JSON.stringify(dbP));
                    console.log('✅ Data dari server:', dbP.length, 'records');
                }
            }
        } else {
            // ✅ Di file://, coba dengan proxy
            try {
                const proxyUrl = "https://cors-anywhere.herokuapp.com/" + API_BASE;
                const r = await fetch(proxyUrl + "?action=getPresensiByPegawai&id=" + encodeURIComponent(currentPegawai.ID), {
                    redirect: 'follow',
                    cache: 'no-cache'
                });
                
                if (r.ok) {
                    const data = await r.json();
                    if (data.status === 'success' && data.data) {
                        dbP = data.data || [];
                        allRecords = [...dbP];
                        sessionStorage.setItem(cacheKey, JSON.stringify(dbP));
                        console.log('✅ Data dari proxy:', dbP.length, 'records');
                    }
                }
            } catch(proxyError) {
                console.warn('⚠️ Proxy gagal, menggunakan cache jika ada');
                // Jika tidak ada cache, tampilkan pesan
                if (!hasCache) {
                    showToast('Info', 'Tidak ada data cache. Lakukan presensi terlebih dahulu.', 'warning');
                }
            }
        }
        
        renderProfile();
        renderTodayStatus();
        renderHistory();
        renderStats();
        
        overlay.style.display = 'none';
        sessionStorage.setItem('profile_pegawai', JSON.stringify(currentPegawai));
        
    } catch (e) {
        console.error("Load data error:", e);
        overlay.style.display = 'none';
        
        // ✅ FALLBACK: Coba load dari cache
        const cacheKey = 'presensi_cache_' + currentPegawai.ID;
        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                dbP = JSON.parse(cachedData);
                allRecords = [...dbP];
                renderProfile();
                renderTodayStatus();
                renderHistory();
                renderStats();
                showToast('Info', 'Menggunakan data cache.', 'info');
                return;
            } catch(e) {}
        }
        
        showToast('Error', 'Gagal memuat data. Periksa koneksi internet.', 'error');
    }
}

// ✅ UPDATE DATA DI BACKGROUND (tanpa block UI)
async function updateDataInBackground() {
    try {
        const cacheKey = 'presensi_cache_' + currentPegawai.ID;
        const r = await fetch(API + "?action=getPresensiByPegawai&id=" + encodeURIComponent(currentPegawai.ID), {
            redirect: 'follow',
            cache: 'no-cache'
        });
        
        if (r.ok) {
            const data = await r.json();
            if (data.status === 'success' && data.data && data.data.length > 0) {
                dbP = data.data || [];
                allRecords = [...dbP];
                sessionStorage.setItem(cacheKey, JSON.stringify(dbP));
                console.log('🔄 Background update berhasil:', dbP.length, 'records');
                
                // ✅ Refresh UI jika ada perubahan
                renderTodayStatus();
                renderHistory();
                renderStats();
                renderProfile();
            }
        }
    } catch(e) {
        console.warn('⚠️ Background update gagal:', e);
    }
}

// ============================================================
// 6. RENDER PROFILE - POP OUT TANPA FRAME
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
    img.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    img.style.opacity = 0;
    img.src = finalSrc;
    img.onload = () => { img.style.opacity = 1; };
    img.onerror = () => {
        img.onerror = null;
        img.src = placeholderImg;
        img.style.opacity = 1;
    };
    
    document.getElementById('profileName').innerText = p.Nama || p.nama;
    document.getElementById('profileJob').innerHTML = `<i data-lucide="briefcase" size="14"></i> ${p.Jabatan || 'PPA'}`;
    document.getElementById('profileWil').innerHTML = `<i data-lucide="map-pin" size="14"></i> ${p.Wilayah || 'UPT'}`;
    document.getElementById('sidebarLogo').src = GITHUB_LOGO_URL;
    
    // ✅ PERHITUNGAN KEHAHADIRAN PER HARI
    const today = new Date();
    const recordsByDate = groupRecordsByDate(dbP);
    
    let totalHadirDays = 0;
    let totalPulangDays = 0;
    let totalSpecialDays = 0;
    let totalKomplitDays = 0;
    
    Object.keys(recordsByDate).forEach(key => {
        const records = recordsByDate[key];
        let hasHadir = false;
        let hasPulang = false;
        let hasSpecial = false;
        
        records.forEach(r => {
            const norm = normalizeStatus(r.status);
            if (['hadir', 'qr_hadir'].includes(norm)) hasHadir = true;
            if (['pulang', 'qr_pulang'].includes(norm)) hasPulang = true;
            if (['izin', 'sakit', 'dinas'].includes(norm)) hasSpecial = true;
        });
        
        if (hasSpecial) totalSpecialDays++;
        else if (hasHadir) totalHadirDays++;
        if (hasPulang) totalPulangDays++;
        if (hasHadir && hasPulang) totalKomplitDays++;
    });
    
    const totalKehadiran = totalHadirDays + totalSpecialDays;
    document.getElementById('totalKehadiran').innerText = totalKehadiran;
    
    // Total nilai bulan ini
    const monthRecords = dbP.filter(row => {
        const d = new Date(row.timestamp);
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    });
    let totalNilai = 0;
    monthRecords.forEach(r => {
        totalNilai += parseInt(r.nilai) || 0;
    });
    document.getElementById('totalNilai').innerText = totalNilai;
    
    // Persentase kehadiran
    const workingDays = getWorkingDaysInMonth(today.getFullYear(), today.getMonth());
    let totalHadirBulan = 0;
    const monthRecordsByDate = groupRecordsByDate(monthRecords);
    Object.keys(monthRecordsByDate).forEach(key => {
        const records = monthRecordsByDate[key];
        const date = new Date(key);
        if (isWorkingDay(date)) {
            let hasHadir = false, hasSpecial = false;
            records.forEach(r => {
                const norm = normalizeStatus(r.status);
                if (['hadir', 'qr_hadir'].includes(norm)) hasHadir = true;
                if (['izin', 'sakit', 'dinas'].includes(norm)) hasSpecial = true;
            });
            if (hasHadir || hasSpecial) totalHadirBulan++;
        }
    });
    const persentase = workingDays > 0 ? Math.round((totalHadirBulan / workingDays) * 100) : 0;
    document.getElementById('persentaseKehadiran').innerText = persentase + '%';
    
    lucide.createIcons();
}

// ============================================================
// 7. RENDER TODAY STATUS
// ============================================================
function renderTodayStatus() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    document.getElementById('todayDate').innerText = today.toLocaleDateString('id-ID', { 
        day: 'numeric', month: 'long', year: 'numeric' 
    });
    
    const todayRecords = dbP.filter(row => {
        const d = new Date(row.timestamp);
        return d.toISOString().split('T')[0] === todayStr;
    });
    
    let hasHadir = false, hasQRHadir = false;
    let hasPulang = false, hasQRPulang = false;
    let hasSpecial = false;
    let specialType = '';
    let totalPts = 0;
    let hadirTime = '--:--';
    let pulangTime = '--:--';
    let hadirNilai = 0;
    let pulangNilai = 0;
    let specialNilai = 0;
    
    todayRecords.forEach(r => {
        const norm = normalizeStatus(r.status);
        const nilai = parseInt(r.nilai) || 0;
        const time = new Date(r.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        if (norm === 'hadir') {
            hasHadir = true;
            hadirTime = time;
            hadirNilai = nilai;
        } else if (norm === 'qr_hadir') {
            hasQRHadir = true;
            hadirTime = time + ' (QR)';
            hadirNilai = nilai;
        } else if (norm === 'pulang') {
            hasPulang = true;
            pulangTime = time;
            pulangNilai = nilai;
        } else if (norm === 'qr_pulang') {
            hasQRPulang = true;
            pulangTime = time + ' (QR)';
            pulangNilai = nilai;
        } else if (['izin', 'sakit', 'dinas'].includes(norm)) {
            hasSpecial = true;
            specialType = norm.charAt(0).toUpperCase() + norm.slice(1);
            specialNilai = nilai;
        }
        totalPts += nilai;
    });
    
    // Update UI
    const hadirEl = document.getElementById('todayHadir');
    const hadirPointEl = document.getElementById('todayHadirPoint');
    if (hasHadir || hasQRHadir) {
        hadirEl.innerText = hadirTime;
        hadirPointEl.innerText = hadirNilai + ' pts';
        hadirEl.style.color = 'var(--success)';
    } else {
        hadirEl.innerText = '--:--';
        hadirPointEl.innerText = '0 pts';
        hadirEl.style.color = 'rgba(255,255,255,0.3)';
    }
    
    const pulangEl = document.getElementById('todayPulang');
    const pulangPointEl = document.getElementById('todayPulangPoint');
    if (hasPulang || hasQRPulang) {
        pulangEl.innerText = pulangTime;
        pulangPointEl.innerText = pulangNilai + ' pts';
        pulangEl.style.color = 'var(--pu-blue)';
    } else {
        pulangEl.innerText = '--:--';
        pulangPointEl.innerText = '0 pts';
        pulangEl.style.color = 'rgba(255,255,255,0.3)';
    }
    
    const specialEl = document.getElementById('todaySpecial');
    const specialPointEl = document.getElementById('todaySpecialPoint');
    if (hasSpecial) {
        specialEl.innerText = specialType;
        specialPointEl.innerText = specialNilai + ' pts';
        specialEl.style.color = '#a855f7';
    } else {
        specialEl.innerText = '-';
        specialPointEl.innerText = '0 pts';
        specialEl.style.color = 'rgba(255,255,255,0.3)';
    }
    
    const totalEl = document.getElementById('todayTotal');
    const totalPointEl = document.getElementById('todayTotalPoint');
    const totalCount = (hasHadir || hasQRHadir ? 1 : 0) + (hasPulang || hasQRPulang ? 1 : 0) + (hasSpecial ? 1 : 0);
    totalEl.innerText = totalCount;
    totalPointEl.innerText = totalPts + ' pts';
    
    lucide.createIcons();
}

// ============================================================
// 8. RENDER HISTORY (SAMA SEPERTI SEBELUMNYA)
// ============================================================
function renderHistory() {
    const tbody = document.getElementById('historyBody');
    
    let filtered = [...allRecords];
    const today = new Date();
    
    if (currentFilter === '7') {
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - 7);
        filtered = filtered.filter(r => new Date(r.timestamp) >= cutoff);
    } else if (currentFilter === '30') {
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - 30);
        filtered = filtered.filter(r => new Date(r.timestamp) >= cutoff);
    }
    
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const start = currentPage * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const pageData = filtered.slice(start, end);
    
    if (pageData.length === 0 && currentPage === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:30px;opacity:0.5;">
                    <i data-lucide="inbox" size="32"></i>
                    <p style="margin-top:8px;">Belum ada data presensi</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        document.getElementById('historyCount').innerText = 'Menampilkan 0 data';
        document.querySelector('.btn-load-more').style.display = 'none';
        return;
    }
    
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    const grouped = {};
    pageData.forEach(r => {
        const d = new Date(r.timestamp);
        const key = d.toISOString().split('T')[0];
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
    });
    
    let html = '';
    const sortedKeys = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    sortedKeys.forEach(key => {
        const records = grouped[key];
        const date = new Date(key);
        const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const dayName = dayNames[date.getDay()];
        
        const isLiburNasional = isHoliday(date);
        const isWeekend = !isWorkingDay(date) && !isLiburNasional;
        
        let hasHadir = false, hasQRHadir = false;
        let hasPulang = false, hasQRPulang = false;
        let specialType = '';
        let totalNilai = 0;
        let masukTime = '-';
        let pulangTime = '-';
        let firstTrxId = '';
        
        records.forEach(r => {
            const norm = normalizeStatus(r.status);
            totalNilai += parseInt(r.nilai) || 0;
            if (!firstTrxId) firstTrxId = r.trxId;
            
            if (norm === 'hadir') {
                hasHadir = true;
                masukTime = new Date(r.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            }
            if (norm === 'qr_hadir') {
                hasQRHadir = true;
                masukTime = new Date(r.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' (QR)';
            }
            if (norm === 'pulang') {
                hasPulang = true;
                pulangTime = new Date(r.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            }
            if (norm === 'qr_pulang') {
                hasQRPulang = true;
                pulangTime = new Date(r.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' (QR)';
            }
            if (['izin', 'sakit', 'dinas'].includes(norm)) {
                specialType = norm.charAt(0).toUpperCase() + norm.slice(1);
            }
        });
        
        let statusClass = 'alpha';
        let statusDisplay = 'Alpha';
        const isWorking = isWorkingDay(date);
        
        if (specialType) {
            statusClass = specialType.toLowerCase();
            statusDisplay = specialType;
        } else if (hasHadir || hasQRHadir) {
            const isQR = hasQRHadir && !hasHadir;
            statusClass = 'hadir';
            statusDisplay = (isQR ? 'QR ' : '') + 'Hadir';
            if (hasPulang || hasQRPulang) {
                statusDisplay += ' + Pulang';
            }
        } else if (hasPulang || hasQRPulang) {
            statusClass = 'hadir';
            statusDisplay = 'Pulang';
        }
        
        if (!isWorking && statusDisplay === 'Alpha') {
            if (isLiburNasional) {
                statusDisplay = 'Libur Nasional';
                statusClass = 'alpha';
            } else if (isWeekend) {
                statusDisplay = 'Weekend';
                statusClass = 'alpha';
            }
        }
        
        html += `
            <tr onclick="showDetail('${firstTrxId}')">
                <td>${dateStr}</td>
                <td>${dayName}</td>
                <td>${masukTime}</td>
                <td>${pulangTime}</td>
                <td>${totalNilai}</td>
                <td><span class="status-badge-table ${statusClass}">${statusDisplay}</span></td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    lucide.createIcons();
    
    document.getElementById('historyCount').innerText = `Menampilkan ${Math.min(end, filtered.length)} dari ${filtered.length} data`;
    
    const loadMoreBtn = document.querySelector('.btn-load-more');
    if (end >= filtered.length) {
        loadMoreBtn.style.display = 'none';
    } else {
        loadMoreBtn.style.display = 'flex';
    }
}

// ============================================================
// 9. RENDER STATS
// ============================================================
function renderStats() {
    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();
    
    const recordsByDate = {};
    dbP.forEach(row => {
        const d = new Date(row.timestamp);
        if (d.getMonth() === month && d.getFullYear() === year) {
            const key = d.toISOString().split('T')[0];
            if (!recordsByDate[key]) recordsByDate[key] = [];
            recordsByDate[key].push(row);
        }
    });
    
    const stats = {
        hadir: 0,
        qrHadir: 0,
        pulang: 0,
        izin: 0,
        sakit: 0,
        dinas: 0,
        alpha: 0,
        komplit: 0,
        totalHariKerja: 0
    };
    
    const workingDaysInMonth = getWorkingDaysInMonth(year, month);
    stats.totalHariKerja = workingDaysInMonth;
    
    Object.keys(recordsByDate).forEach(key => {
        const records = recordsByDate[key];
        const date = new Date(key);
        const isWorking = isWorkingDay(date);
        
        let hasHadir = false;
        let hasQRHadir = false;
        let hasPulang = false;
        let hasQRPulang = false;
        let hasSpecial = false;
        let specialType = '';
        
        records.forEach(r => {
            const norm = normalizeStatus(r.status);
            if (norm === 'hadir') hasHadir = true;
            if (norm === 'qr_hadir') hasQRHadir = true;
            if (norm === 'pulang') hasPulang = true;
            if (norm === 'qr_pulang') hasQRPulang = true;
            if (['izin', 'sakit', 'dinas'].includes(norm)) {
                hasSpecial = true;
                specialType = norm;
            }
        });
        
        if (hasSpecial) {
            stats[specialType] = (stats[specialType] || 0) + 1;
        } else if (hasHadir || hasQRHadir) {
            if (hasQRHadir) stats.qrHadir++;
            else stats.hadir++;
        }
        
        if (hasPulang) stats.pulang++;
        if (hasQRPulang) stats.pulang++;
        
        if ((hasHadir || hasQRHadir) && (hasPulang || hasQRPulang)) {
            stats.komplit++;
        }
        
        if (isWorking) {
            const hasAnyStatus = hasHadir || hasQRHadir || hasPulang || hasQRPulang || hasSpecial;
            if (!hasAnyStatus) {
                stats.alpha++;
            }
        }
    });
    
    document.getElementById('statHadir').innerText = stats.hadir + stats.qrHadir;
    document.getElementById('statTerlambat').innerText = '0';
    document.getElementById('statIzin').innerText = stats.izin;
    document.getElementById('statSakit').innerText = stats.sakit;
    document.getElementById('statDinas').innerText = stats.dinas;
    document.getElementById('statAlpha').innerText = stats.alpha;
    
    const maxStat = Math.max(
        stats.hadir + stats.qrHadir, 
        stats.izin, 
        stats.sakit, 
        stats.dinas, 
        stats.alpha, 
        1
    );
    
    document.getElementById('barHadir').style.width = ((stats.hadir + stats.qrHadir) / maxStat * 100) + '%';
    document.getElementById('barTerlambat').style.width = '0%';
    document.getElementById('barIzin').style.width = (stats.izin / maxStat * 100) + '%';
    document.getElementById('barSakit').style.width = (stats.sakit / maxStat * 100) + '%';
    document.getElementById('barDinas').style.width = (stats.dinas / maxStat * 100) + '%';
    document.getElementById('barAlpha').style.width = (stats.alpha / maxStat * 100) + '%';
    
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    document.getElementById('monthLabel').innerText = monthNames[month] + ' ' + year;
}

// ============================================================
// 10. SHOW DETAIL
// ============================================================
function showDetail(trxId) {
    const record = dbP.find(r => r.trxId === trxId);
    if (!record) {
        const alt = allRecords.find(r => r.trxId === trxId);
        if (!alt) return;
        showDetailContent(alt);
        return;
    }
    showDetailContent(record);
}

function showDetailContent(record) {
    const card = document.getElementById('detailCard');
    const content = document.getElementById('detailContent');
    
    const date = new Date(record.timestamp);
    const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let photoHtml = '';
    if (record.foto_selfie && record.foto_selfie !== '-') {
        photoHtml += `<div style="margin-top:8px;"><img src="${record.foto_selfie}" alt="Selfie" loading="lazy"></div>`;
    }
    if (record.foto_kerja && record.foto_kerja !== '-') {
        photoHtml += `<div style="margin-top:8px;"><img src="${record.foto_kerja}" alt="Foto Kerja" loading="lazy"></div>`;
    }
    if (record.surat && record.surat !== '-') {
        photoHtml += `<div style="margin-top:8px;"><img src="${record.surat}" alt="Surat" loading="lazy"></div>`;
    }
    
    const statusClass = getStatusClass(record.status);
    
    content.innerHTML = `
        <div class="detail-row">
            <span class="detail-label">Tanggal</span>
            <span class="detail-value">${dateStr}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Waktu</span>
            <span class="detail-value">${timeStr}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="status-badge-table ${statusClass}">${record.status || '-'}</span></span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Nilai</span>
            <span class="detail-value">${record.nilai || 0} pts</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Keterangan</span>
            <span class="detail-value">${record.keterangan || '-'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">GPS</span>
            <span class="detail-value">${record.gps || '-'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Wilayah</span>
            <span class="detail-value">${record.wilayah || '-'}</span>
        </div>
        ${photoHtml ? `<div class="detail-row"><span class="detail-label">Foto</span><span class="detail-value">${photoHtml}</span></div>` : ''}
    `;
    
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getStatusClass(status) {
    const norm = normalizeStatus(status);
    if (['hadir', 'qr_hadir'].includes(norm)) return 'hadir';
    if (['pulang', 'qr_pulang'].includes(norm)) return 'hadir';
    if (norm === 'izin') return 'izin';
    if (norm === 'sakit') return 'sakit';
    if (norm === 'dinas') return 'dinas';
    return 'alpha';
}

function closeDetail() {
    document.getElementById('detailCard').style.display = 'none';
}

// ============================================================
// 11. FILTER & PAGINATION
// ============================================================
function setFilter(days) {
    currentFilter = days;
    currentPage = 0;
    
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    if (days === '7') document.getElementById('filter7').classList.add('active');
    else if (days === '30') document.getElementById('filter30').classList.add('active');
    else if (days === 'all') document.getElementById('filterAll').classList.add('active');
    
    renderHistory();
}

function toggleFilter() {
    const controls = document.querySelector('.filter-controls');
    controls.classList.toggle('expanded');
}

function loadMoreHistory() {
    currentPage++;
    renderHistory();
}

// ============================================================
// 12. REFRESH DATA
// ============================================================
async function refreshData() {
    const btn = document.querySelector('.btn-refresh');
    if (btn) {
        btn.innerHTML = '<i data-lucide="refresh-cw" size="18" style="animation:spin 0.8s linear infinite"></i>';
        lucide.createIcons();
    }
    
    try {
        await loadHolidays();
        
        if (!isLocalFile) {
            const r = await fetch(API + "?action=getPresensiByPegawai&id=" + encodeURIComponent(currentPegawai.ID), {
                redirect: 'follow',
                cache: 'no-cache'
            });
            const data = await r.json();
            dbP = data.data || [];
            allRecords = [...dbP];
            sessionStorage.setItem('presensi_cache_' + currentPegawai.ID, JSON.stringify(dbP));
        } else {
            // Di file://, coba proxy
            try {
                const proxyUrl = "https://cors-anywhere.herokuapp.com/" + API_BASE;
                const r = await fetch(proxyUrl + "?action=getPresensiByPegawai&id=" + encodeURIComponent(currentPegawai.ID), {
                    redirect: 'follow',
                    cache: 'no-cache'
                });
                const data = await r.json();
                dbP = data.data || [];
                allRecords = [...dbP];
                sessionStorage.setItem('presensi_cache_' + currentPegawai.ID, JSON.stringify(dbP));
            } catch(proxyError) {
                showToast('Info', 'Gunakan Live Server untuk refresh data terbaru.', 'warning');
            }
        }
        
        renderTodayStatus();
        renderHistory();
        renderStats();
        renderProfile();
        
        showToast('Berhasil', 'Data raport diperbarui.', 'success');
    } catch (e) {
        console.error('Refresh error:', e);
        showToast('Error', 'Gagal refresh data.', 'error');
    }
    
    if (btn) {
        btn.innerHTML = '<i data-lucide="refresh-cw" size="18"></i>';
        lucide.createIcons();
    }
}

// ============================================================
// 13. NAVIGATION (DENGAN FLAG KEMBALI)
// ============================================================
function goBack() {
    sessionStorage.setItem('return_from_profile', 'true');
    window.history.back();
}

function goToPresensi() {
    sessionStorage.setItem('return_from_profile', 'true');
    window.location.href = 'presensi.html';
}

// ============================================================
// 14. SUCCESS TOAST
// ============================================================
function showSuccessToast(message) {
    const toast = document.getElementById('successToast');
    document.getElementById('toastMessage').innerText = message || 'Data presensi Anda telah tercatat.';
    toast.style.display = 'flex';
    
    setTimeout(() => {
        closeToast();
    }, 5000);
}

function closeToast() {
    document.getElementById('successToast').style.display = 'none';
}

// ============================================================
// 15. NOTIFICATION MODAL
// ============================================================
function showToast(title, message, type = "info") {
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

    btnOk.onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    };
}

// ============================================================
// 16. CLOCK
// ============================================================
function updateClock() {
    const now = new Date();
    const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaStr);
    const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('liveClock').innerText = timeStr;
}

// ============================================================
// 17. INITIALIZATION
// ============================================================
window.onload = async () => {
    lucide.createIcons();
    
    const hasParam = getPegawaiFromURL();
    
    if (!hasParam) {
        const saved = sessionStorage.getItem('profile_pegawai');
        if (saved) {
            try {
                currentPegawai = JSON.parse(saved);
                await loadData();
                return;
            } catch(e) {}
        }
        
        showToast('Peringatan', 'Data pegawai tidak ditemukan. Silakan pilih dari halaman presensi.', 'warning');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }
    
    await loadData();
    
    setInterval(updateClock, 1000);
    updateClock();
    
    try {
        if ('serviceWorker' in navigator) {
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:' ||
                protocol === 'http:' &&
                (window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1');
            if (isSecure) {
                navigator.serviceWorker.register('sw.js').catch(() => {});
            }
        }
    } catch (e) {}
};

// ============================================================
// END OF PROFILE_RAPORT.JS
// ============================================================