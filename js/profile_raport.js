// ============================================================
// PROFILE_RAPORT.JS - v3.0.0 (SYNCED WITH RAPORT.GS)
// ============================================================

const API_BASE = "https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec";
const isLocalFile = window.location.protocol === 'file:';
const API = isLocalFile 
    ? "https://cors-anywhere.herokuapp.com/" + API_BASE
    : API_BASE;

const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";

let currentPegawai = null;
let statsData = null;  // ✅ Baru: simpan stats dari backend
let recordsData = [];  // ✅ Baru: simpan records dari backend
let holidays = [];
let currentFilter = '30';

const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%232e446e' rx='20'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%23ffffff' opacity='.15'/%3E%3C/svg%3E";

// ============================================================
// 1. LOAD DATA - USE NEW ENDPOINT
// ============================================================
async function loadData() {
    const overlay = document.getElementById('loadingOverlay');
    const statusText = document.getElementById('loadStatus');
    
    if (!currentPegawai) {
        showToast('Error', 'Data pegawai tidak ditemukan.', 'error');
        setTimeout(() => goToPresensi(), 2000);
        return;
    }

    overlay.style.display = 'flex';
    statusText.innerText = 'Memuat Profile Raport...';

    try {
        // ✅ LOAD LIBUR
        await loadHolidays();
        
        // ✅ USE NEW ENDPOINT: getPegawaiStats
        const url = `${API}?action=getPegawaiStats&id=${encodeURIComponent(currentPegawai.ID)}&period=${currentFilter}&cb=${Date.now()}`;
        const r = await fetch(url, { redirect: 'follow', cache: 'no-cache' });
        
        if (!r.ok) throw new Error('HTTP ' + r.status);
        
        const data = await r.json();
        
        if (data.status === 'success') {
            statsData = data.stats;
            recordsData = data.records || [];
            holidays = data.holidays || holidays;
            
            console.log('✅ Data loaded:', statsData);
            
            renderProfile();
            renderTodayStatus();
            renderHistory();
            renderStats();
        } else {
            throw new Error(data.message || 'Gagal memuat data');
        }
        
        overlay.style.display = 'none';
        
    } catch (e) {
        console.error("Load data error:", e);
        overlay.style.display = 'none';
        showToast('Error', 'Gagal memuat data: ' + e.message, 'error');
    }
}

async function loadHolidays() {
    try {
        const r = await fetch(API + "?action=getHolidays", { cache: 'no-cache' });
        if (r.ok) {
            const data = await r.json();
            if (data.status === 'success' && data.data) {
                holidays = data.data.map(h => {
                    const d = new Date(h.tanggal || h.date);
                    return d.toISOString().split('T')[0];
                });
            }
        }
    } catch (e) {
        console.warn('⚠️ Gagal load holidays:', e);
    }
}

// ============================================================
// 2. RENDER PROFILE - USE BACKEND STATS
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
    img.style.transition = 'opacity 0.4s ease';
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
    
    // ✅ USE BACKEND STATS
    if (statsData) {
        const totalKehadiran = statsData.hadir + statsData.terlambat + statsData.izin + statsData.sakit + statsData.dinas;
        document.getElementById('totalKehadiran').innerText = totalKehadiran;
        document.getElementById('totalNilai').innerText = statsData.totalNilai || 0;
        
        const persentase = statsData.totalHariKerja > 0 
            ? Math.round((totalKehadiran / statsData.totalHariKerja) * 100) 
            : 0;
        document.getElementById('persentaseKehadiran').innerText = persentase + '%';
    }
    
    lucide.createIcons();
}

// ============================================================
// 3. RENDER TODAY STATUS
// ============================================================
function renderTodayStatus() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    document.getElementById('todayDate').innerText = today.toLocaleDateString('id-ID', { 
        day: 'numeric', month: 'long', year: 'numeric' 
    });
    
    const todayRecords = recordsData.filter(r => r.date === todayStr);
    
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
            hadirTime = r.time || '--:--';
            hadirNilai = nilai;
        } else if (status.includes('pulang') || status.includes('qr pulang')) {
            hasPulang = true;
            pulangTime = r.time || '--:--';
            pulangNilai = nilai;
        }
    });
    
    // Update UI
    document.getElementById('todayHadir').innerText = hadirTime;
    document.getElementById('todayHadirPoint').innerText = hadirNilai + ' pts';
    document.getElementById('todayHadir').style.color = hasHadir ? 'var(--success)' : 'rgba(255,255,255,0.3)';
    
    document.getElementById('todayPulang').innerText = pulangTime;
    document.getElementById('todayPulangPoint').innerText = pulangNilai + ' pts';
    document.getElementById('todayPulang').style.color = hasPulang ? 'var(--pu-blue)' : 'rgba(255,255,255,0.3)';
    
    document.getElementById('todaySpecial').innerText = specialType;
    document.getElementById('todaySpecialPoint').innerText = specialNilai + ' pts';
    document.getElementById('todaySpecial').style.color = hasSpecial ? '#a855f7' : 'rgba(255,255,255,0.3)';
    
    const totalCount = (hasHadir ? 1 : 0) + (hasPulang ? 1 : 0) + (hasSpecial ? 1 : 0);
    document.getElementById('todayTotal').innerText = totalCount;
    document.getElementById('todayTotalPoint').innerText = totalPts + ' pts';
    
    lucide.createIcons();
}

// ============================================================
// 4. RENDER HISTORY - GROUP BY DATE
// ============================================================
function renderHistory() {
    const tbody = document.getElementById('historyBody');
    
    // Group by date
    const grouped = {};
    recordsData.forEach(r => {
        if (!grouped[r.date]) grouped[r.date] = [];
        grouped[r.date].push(r);
    });
    
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    if (sortedDates.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:30px;opacity:0.5;">
                    <i data-lucide="inbox" size="32"></i>
                    <p style="margin-top:8px;">Belum ada data presensi</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }
    
    let html = '';
    sortedDates.forEach(date => {
        const records = grouped[date];
        const dateObj = new Date(date);
        const dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
        
        let masukTime = '-', pulangTime = '-';
        let totalNilai = 0;
        let statusClass = 'alpha', statusDisplay = 'Alpha';
        
        records.forEach(r => {
            const status = (r.status || '').toLowerCase();
            totalNilai += parseInt(r.nilai) || 0;
            
            if (status.includes('hadir') || status.includes('terlambat') || status.includes('qr hadir')) {
                masukTime = r.time || '-';
            }
            if (status.includes('pulang') || status.includes('qr pulang')) {
                pulangTime = r.time || '-';
            }
            
            if (status.includes('izin')) {
                statusClass = 'izin'; statusDisplay = 'Izin';
            } else if (status.includes('sakit')) {
                statusClass = 'sakit'; statusDisplay = 'Sakit';
            } else if (status.includes('dinas')) {
                statusClass = 'dinas'; statusDisplay = 'Dinas';
            } else if (status.includes('terlambat')) {
                statusClass = 'terlambat'; statusDisplay = 'Terlambat';
            } else if (status.includes('hadir') || status.includes('qr')) {
                statusClass = 'hadir'; statusDisplay = 'Hadir';
            }
        });
        
        html += `
            <tr onclick="showDetail('${date}')">
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
    
    document.getElementById('historyCount').innerText = `Menampilkan ${sortedDates.length} data`;
}

// ============================================================
// 5. RENDER STATS - USE BACKEND STATS
// ============================================================
function renderStats() {
    if (!statsData) return;
    
    document.getElementById('statHadir').innerText = statsData.hadir || 0;
    document.getElementById('statTerlambat').innerText = statsData.terlambat || 0;
    document.getElementById('statIzin').innerText = statsData.izin || 0;
    document.getElementById('statSakit').innerText = statsData.sakit || 0;
    document.getElementById('statDinas').innerText = statsData.dinas || 0;
    document.getElementById('statAlpha').innerText = statsData.alpha || 0;
    
    const percentages = {
        hadir: statsData.hadir || 0,
        terlambat: statsData.terlambat || 0,
        izin: statsData.izin || 0,
        sakit: statsData.sakit || 0,
        dinas: statsData.dinas || 0,
        alpha: statsData.alpha || 0
    };
    
    const maxStat = Math.max(...Object.values(percentages), 1);
    
    setTimeout(() => {
        document.getElementById('barHadir').style.width = (percentages.hadir / maxStat * 100) + '%';
        document.getElementById('barTerlambat').style.width = (percentages.terlambat / maxStat * 100) + '%';
        document.getElementById('barIzin').style.width = (percentages.izin / maxStat * 100) + '%';
        document.getElementById('barSakit').style.width = (percentages.sakit / maxStat * 100) + '%';
        document.getElementById('barDinas').style.width = (percentages.dinas / maxStat * 100) + '%';
        document.getElementById('barAlpha').style.width = (percentages.alpha / maxStat * 100) + '%';
    }, 100);
    
    const today = new Date();
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    document.getElementById('monthLabel').innerText = monthNames[today.getMonth()] + ' ' + today.getFullYear();
}

// ============================================================
// 6. SHOW DETAIL - USE NEW ENDPOINT
// ============================================================
async function showDetail(date) {
    const card = document.getElementById('detailCard');
    const content = document.getElementById('detailContent');
    
    content.innerHTML = '<p style="text-align:center;opacity:0.5">Memuat detail...</p>';
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    try {
        const url = `${API}?action=getPresensiDetail&id=${encodeURIComponent(currentPegawai.ID)}&date=${date}&cb=${Date.now()}`;
        const r = await fetch(url, { cache: 'no-cache' });
        const data = await r.json();
        
        if (data.status === 'success') {
            renderDetailContent(data);
        } else {
            content.innerHTML = `<p style="color:var(--danger)">${data.message}</p>`;
        }
    } catch (e) {
        content.innerHTML = `<p style="color:var(--danger)">Gagal memuat detail: ${e.message}</p>`;
    }
}

function renderDetailContent(data) {
    const content = document.getElementById('detailContent');
    const records = data.records;
    
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
    
    if (hadirRecord) {
        html += renderDetailSection('☀️ Absen Hadir', hadirRecord, 'hadir');
    }
    
    if (pulangRecord) {
        html += renderDetailSection('🌙 Absen Pulang', pulangRecord, 'pulang');
    }
    
    if (specialRecord) {
        html += renderDetailSection('📋 Status Khusus', specialRecord, 'special');
    }
    
    if (!hadirRecord && !pulangRecord && !specialRecord) {
        html += '<p style="text-align:center;opacity:0.5">Tidak ada data presensi</p>';
    }
    
    content.innerHTML = html;
    lucide.createIcons();
}

function renderDetailSection(title, record, type) {
    const colors = {
        hadir: 'var(--success)',
        pulang: 'var(--pu-blue)',
        special: '#a855f7'
    };
    
    let html = `
    <div style="margin-bottom:20px;padding:16px;background:rgba(0,0,0,0.3);border-radius:16px;border-left:4px solid ${colors[type]}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h5 style="font-size:0.9rem;font-weight:800">${title}</h5>
            <span style="font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:${colors[type]};font-weight:800">
                ${record.time}
            </span>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Status</div>
            <div class="detail-value">${record.status}</div>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Nilai</div>
            <div class="detail-value" style="color:${colors[type]};font-weight:800">${record.nilai} pts</div>
        </div>
        
        <div class="detail-row">
            <div class="detail-label">Keterangan</div>
            <div class="detail-value">${record.keterangan || '-'}</div>
        </div>
        
        ${record.gps && record.gps !== '-' ? `
        <div class="detail-row">
            <div class="detail-label">GPS</div>
            <div class="detail-value" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem">
                ${record.gps}
            </div>
        </div>` : ''}
        
        <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">`;
    
    if (record.foto_selfie && record.foto_selfie !== '-') {
        html += `
        <div>
            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase">
                Foto Selfie
            </div>
            <img src="${record.foto_selfie}" 
                 alt="Selfie" 
                 style="width:100%;border-radius:12px;cursor:pointer"
                 onclick="openImageModal('${record.foto_selfie}')">
        </div>`;
    }
    
    if (record.foto_kerja && record.foto_kerja !== '-') {
        html += `
        <div>
            <div style="font-size:0.7rem;font-weight:700;opacity:0.6;margin-bottom:6px;text-transform:uppercase">
                Foto Kerja
            </div>
            <img src="${record.foto_kerja}" 
                 alt="Kerja" 
                 style="width:100%;border-radius:12px;cursor:pointer"
                 onclick="openImageModal('${record.foto_kerja}')">
        </div>`;
    }
    
    html += `</div></div>`;
    return html;
}

function openImageModal(url) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:300000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
    modal.onclick = () => modal.remove();
    
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:90%;max-height:90%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.8)';
    
    modal.appendChild(img);
    document.body.appendChild(modal);
}

function formatDateIndo(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', { 
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
    });
}

function closeDetail() {
    document.getElementById('detailCard').style.display = 'none';
}

// ============================================================
// 7. FILTER
// ============================================================
function setFilter(period) {
    currentFilter = period;
    document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
    const filterId = period === 'all' ? 'filterAll' : 'filter' + period;
    const filterBtn = document.getElementById(filterId);
    if (filterBtn) filterBtn.classList.add('active');
    
    loadData();  // ✅ Reload dengan filter baru
}

function toggleFilter() {
    console.log('Toggle filter');
}

function loadMoreHistory() {
    console.log('Load more - not implemented yet');
}

// ============================================================
// 8. NAVIGATION & UTILITIES
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
    document.getElementById('toastMessage').innerText = message;
    toast.style.display = 'flex';
    setTimeout(() => closeToast(), 5000);
}

function closeToast() {
    document.getElementById('successToast').style.display = 'none';
}

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

function updateClock() {
    const now = new Date();
    const jakartaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const jakartaDate = new Date(jakartaStr);
    const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('liveClock').innerText = timeStr;
}

// ============================================================
// 9. INITIALIZATION
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
    await loadData();
    
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
};
