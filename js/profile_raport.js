// ============================================================
// PROFILE_RAPORT.JS - v4.0.0 (FINAL FIXED)
// ============================================================

const API_BASE = "https://script.google.com/macros/s/AKfycbxfANwhLfJnT1uDqC_4xIFpCvMDLbM0rZcrFPXqLuFc-u0juCrsTgb7v9yGMUedlWiF/exec";
const isLocalFile = window.location.protocol === 'file:';
const API = isLocalFile 
    ? "https://cors-anywhere.herokuapp.com/" + API_BASE
    : API_BASE;

const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";

let currentPegawai = null;
let statsData = null;
let recordsData = [];
let holidays = [];
let currentFilter = '7';

const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 280'%3E%3Crect width='200' height='280' fill='%232e446e' rx='20'/%3E%3Ccircle cx='100' cy='100' r='50' fill='%23ffffff' opacity='.15'/%3E%3C/svg%3E";

// ============================================================
// 1. LOAD DATA
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
        await loadHolidays();
        
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
        
        if (overlay) overlay.style.display = 'none';
        
    } catch (e) {
        console.error("Load data error:", e);
        if (overlay) overlay.style.display = 'none';
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
// 2. RENDER PROFILE
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
    
    if (statsData) {
        const totalKehadiran = statsData.hadir + statsData.terlambat + statsData.izin + statsData.sakit + statsData.dinas;
        if (el('totalKehadiran')) el('totalKehadiran').innerText = totalKehadiran;
        if (el('totalNilai')) el('totalNilai').innerText = statsData.totalNilai || 0;
        
        const persentase = statsData.totalHariKerja > 0 
            ? Math.round((totalKehadiran / statsData.totalHariKerja) * 100) 
            : 0;
        if (el('persentaseKehadiran')) el('persentaseKehadiran').innerText = persentase + '%';
    }
    
    lucide.createIcons();
}

// ============================================================
// 3. RENDER TODAY STATUS
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
// 4. RENDER HISTORY - FIXED WITH ROW COLORING
// ============================================================
function renderHistory() {
    const tbody = document.getElementById('historyBody');
    if (!tbody) return;
    
    const grouped = {};
    recordsData.forEach(r => {
        if (!grouped[r.date]) grouped[r.date] = [];
        grouped[r.date].push(r);
    });
    
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    // ✅ FIXED: Empty state - no broken code inside
    if (sortedDates.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;opacity:0.5">
                    <i data-lucide="inbox" size="48" style="margin-bottom:12px"></i>
                    <p>Belum ada data presensi</p>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }
    
    // ✅ FIXED: Get today's date for row coloring
    const nowD = new Date();
    const todayKey = nowD.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const curMonth = todayKey.slice(0, 7);
    
    let html = '';
    sortedDates.forEach(date => {
        const records = grouped[date];
        const dateObj = new Date(date);
        const dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
        
        // ✅ FIXED: Determine row class for coloring
        const rowMonth = date.slice(0, 7);
        let rowClass = '';
        if (date === todayKey) {
            rowClass = 'row-today';  // Hijau untuk hari ini
        } else if (rowMonth === curMonth) {
            rowClass = 'row-current';  // Normal untuk bulan ini
        } else {
            rowClass = 'row-past';  // Abu-abu untuk bulan lalu
        }
        
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
    
    const countEl = document.getElementById('historyCount');
    if (countEl) countEl.innerText = `Menampilkan ${sortedDates.length} data`;
}

// ============================================================
// 5. RENDER STATS - USES DROPDOWN NOW
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
// 6. SHOW DETAIL
// ============================================================
async function showDetail(date) {
    const card = document.getElementById('detailCard');
    const content = document.getElementById('detailContent');
    if (!card || !content) return;
    
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
    
    if (hadirRecord) html += renderDetailSection('☀️ Absen Hadir', hadirRecord, 'hadir');
    if (pulangRecord) html += renderDetailSection('🌙 Absen Pulang', pulangRecord, 'pulang');
    if (specialRecord) html += renderDetailSection('📋 Status Khusus', specialRecord, 'special');
    
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
    const card = document.getElementById('detailCard');
    if (card) card.style.display = 'none';
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
    
    loadData();
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
// 9. MONTH SELECTOR UNTUK STATISTIK - FIXED
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

function onStatsMonthChange(monthStr) {
    loadStatsForMonth(monthStr);
}

// ✅ FIXED: Replace fetchWithTimeout with fetch (since it's not defined)
async function loadStatsForMonth(monthStr) {
    if (!currentPegawai) return;
    
    const pid = currentPegawai.ID || currentPegawai.id;
    try {
        const url = API + '?action=getPegawaiStats&id=' + encodeURIComponent(pid) + '&month=' + monthStr + '&cb=' + Date.now();
        const r = await fetch(url, { cache: 'no-store' });
        const d = await r.json();
        
        if (d.status !== 'success') return;
        const s = d.stats;

        const set = (id, v) => { 
            const el = document.getElementById(id); 
            if (el) el.textContent = v; 
        };
        set('statHadir', s.hadir);
        set('statTerlambat', s.terlambat);
        set('statIzin', s.izin);
        set('statSakit', s.sakit);
        set('statDinas', s.dinas);
        set('statAlpha', s.alpha);

        const max = Math.max(s.hadir, s.terlambat, s.izin, s.sakit, s.dinas, s.alpha, 1);
        const bar = (id, v) => { 
            const el = document.getElementById(id); 
            if (el) el.style.width = (v / max * 100) + '%'; 
        };
        bar('barHadir', s.hadir);
        bar('barTerlambat', s.terlambat);
        bar('barIzin', s.izin);
        bar('barSakit', s.sakit);
        bar('barDinas', s.dinas);
        bar('barAlpha', s.alpha);

        const [y, m] = monthStr.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const title = document.getElementById('statsTitleText');
        if (title) title.textContent = 'Statistik ' + label;
        
    } catch (e) {
        console.warn('⚠️ Gagal load statistik bulan:', e);
    }
}

// ============================================================
// 10. INITIALIZATION - FIXED
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
    
    // ✅ FIXED: Only load data once, no duplicate
    await loadData();

    // ✅ Initialize month selector
    initStatsMonthSelect();
    
    // ✅ Load stats for current month (this will update the stats display)
    const _now = new Date();
    const currentMonth = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0');
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
};
