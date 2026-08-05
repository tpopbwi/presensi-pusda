// ============ KONFIGURASI GLOBAL ============
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const API_URL = "https://script.google.com/macros/s/AKfycbxbQqM8rEC3Y60-T9bJlYcydL5y0XTc9yOml62z9YBrP833Pr0svT9b1d1M0MgADnIt/exec";
const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 85'%3E%3Crect width='60' height='85' fill='%232e446e'/%3E%3Cpath d='M30 40c5.5 0 10-4.5 10-10s-4.5-10-10-10-10 4.5-10 10 4.5 10 10 10zm0 5c-8 0-20 4-20 12v5h40v-5c0-8-12-12-20-12z' fill='%23ffffff' opacity='0.2'/%3E%3C/svg%3E";

// ============ PWA MANIFEST (Data URI base64) ============
try {
    const mf = { name:"E-PUSDA Monitoring", short_name:"E-PUSDA", start_url:"wilayah.html", scope:"./", display:"standalone", background_color:"#0d1b3e", theme_color:"#0d1b3e", icons:[{src:GITHUB_LOGO_URL,sizes:"192x192",type:"image/png",purpose:"any maskable"},{src:GITHUB_LOGO_URL,sizes:"512x512",type:"image/png",purpose:"any maskable"}] };
    const uri = 'data:application/manifest+json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(mf))));
    const el = document.getElementById('pwaManifest');
    if (el) el.setAttribute('href', uri);
    else { const l = document.createElement('link'); l.rel='manifest'; l.href=uri; document.head.appendChild(l); }
} catch(e) { console.warn('Manifest init failed:', e); }

// ============ VARIABEL APLIKASI ============
let dbE = [], dbP = [], dbK = [], searchTimeout = null;
let pegawaiById = new Map(), logsByPegawai = new Map();

// ============ ✅ FETCH DENGAN TIMEOUT DINAMIS ============
function fetchWithTimeout(url, opts = {}, timeout = 15000) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(new DOMException('Timeout ' + timeout + 'ms', 'AbortError')), timeout);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(tid));
}

async function safeFetchJSON(url, opts = {}, timeout = 15000) {
    try {
        const res = await fetchWithTimeout(url, opts, timeout);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const txt = await res.text();
        if (!txt || !txt.trim()) throw new Error('Response kosong');
        if (txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) throw new Error('Server return HTML error');
        try { return JSON.parse(txt); } catch(e) { throw new Error('Parse JSON gagal: ' + e.message); }
    } catch(e) {
        if (e.name === 'AbortError' || (e.message && e.message.includes('Timeout'))) {
            const err = new Error('Timeout koneksi (>' + timeout + 'ms)');
            err.name = 'TimeoutError';
            throw err;
        }
        throw e;
    }
}

// ============ TOAST (NON-BLOCKING) ============
function showToast(msg, type = 'info') {
    let c = document.getElementById('wilToastContainer');
    if (!c) { c = document.createElement('div'); c.id = 'wilToastContainer'; c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100000;display:flex;flex-direction:column;gap:10px;pointer-events:none;'; document.body.appendChild(c); }
    const t = document.createElement('div');
    const colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
    const color = colors[type] || colors.info;
    t.style.cssText = `background:rgba(15,23,42,0.95);backdrop-filter:blur(15px);color:white;padding:14px 20px;border-radius:14px;border-left:4px solid ${color};box-shadow:0 10px 30px rgba(0,0,0,0.4);font-size:0.9rem;font-weight:600;max-width:380px;pointer-events:auto;animation:slideInRight 0.3s ease-out;`;
    t.innerHTML = `<div style="font-weight:800;text-transform:uppercase;font-size:0.7rem;color:${color};margin-bottom:4px;letter-spacing:1px">${type}</div><div>${msg}</div>`;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; setTimeout(() => t.remove(), 400); }, 4000);
}

// ============ UTILITIES ============
function sanitizeHTML(s) { if (s == null) return ""; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function getLocalDateString(val) {
    if (!val) return "";
    let d = new Date(val);
    if (isNaN(d.getTime()) && typeof val === 'string' && val.includes('/')) { const p = val.split(/[/\s:]/); if (p[0].length === 2) d = new Date(p[2], p[1]-1, p[0]); }
    if (isNaN(d.getTime())) return "";
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function handleImgError(img) { img.onerror = null; img.src = placeholderImg; }

// ============ INDEXING (O(1) lookup) ============
function indexData() {
    pegawaiById.clear(); logsByPegawai.clear();
    dbE.forEach(p => pegawaiById.set(String(p.ID), p));
    const filterDate = document.getElementById('fDate').value;
    dbP.forEach(l => {
        const ts = l.Timestamp || l.timestamp;
        if (!ts || getLocalDateString(ts) !== filterDate) return;
        const pID = String(l['ID Pegawai'] || l.id_pegawai || l.ID);
        if (!logsByPegawai.has(pID)) logsByPegawai.set(pID, []);
        logsByPegawai.get(pID).push(l);
    });
}

// ============ APP INIT ============
window.onload = () => {
    lucide.createIcons();
    const now = new Date();
    document.getElementById('fDate').value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    if (!document.getElementById('wil-toast-style')) { const s = document.createElement('style'); s.id = 'wil-toast-style'; s.innerHTML = '@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}'; document.head.appendChild(s); }
    
    // ✅ STRATEGI CACHE-FIRST
    const cachedDash = localStorage.getItem('wilayah_dashboard_cache');
    if (cachedDash) {
        try {
            const d = JSON.parse(cachedDash);
            dbE = d.pegawai || [];
            dbK = d.korlap || [];
            populateUIFromData(d); // Render cache instan tanpa skeleton
            init(true, false);     // ✅ UBAH: isAuto=false agar timeout jadi 30s, bukan 12s
        } catch(e) {
            init(false, false);    // Cache rusak, load awal dengan skeleton
        }
    } else {
        init(false, false);        // Belum ada cache, load awal dengan skeleton
    }

    setInterval(() => { const c = document.getElementById('liveClock'); if(c) c.innerText = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}); }, 1000);
    // Auto refresh tiap 60 detik (Silent mode, 12s timeout)
    setInterval(() => { if (!document.hidden) init(true, true); }, 60000);
};

// Helper untuk mengisi dropdown dan UI dari data cache/server
function populateUIFromData(d) {
    if (d.config?.Logo) { const sl = document.getElementById('sidebarLogo'); if(sl) sl.src = d.config.Logo; }
    
    const sel = document.getElementById('fWil');
    if (sel && sel.options.length <= 1) {
        [...new Set(dbE.map(p => p.Wilayah).filter(w => w))].sort().forEach(w => { const opt = document.createElement('option'); opt.value = w; opt.innerText = w; sel.appendChild(opt); });
    }
    
    const agnSel = document.getElementById('agnNamaInput');
    if (agnSel) { 
        agnSel.innerHTML = '<option value="" disabled selected>-- Pilih Nama Pegawai --</option>'; 
        dbK.forEach(k => { const opt = document.createElement('option'); opt.value = k.Nama; opt.innerText = k.Nama; agnSel.appendChild(opt); }); 
    }
    
    indexData();
    updateKorlapStats();
    filterData();
}

// ============ ✅ PARALLEL FETCH (SEPARATED PROMISES) ============
async function init(isRefresh = false, isAuto = false, attempt = 1) {
    const syncToast = document.getElementById('syncToast');
    const grid = document.getElementById('gridView');
    
    if (!isAuto && syncToast) syncToast.style.display = 'block';
    
    if (!isAuto && isRefresh && grid && dbE.length === 0) {
        grid.innerHTML = Array(4).fill('<div class="skeleton-card"><div class="skeleton-circle"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>').join('');
    }

    try {
        const selectedDate = document.getElementById('fDate').value;
        const tOut = isAuto ? 12000 : 30000; 
        
        // ✅ Pisahkan promise agar tidak saling menunggu
        const dashPromise = safeFetchJSON(API_URL + "?action=getDashboardData", {}, tOut);
        const presensiPromise = safeFetchJSON(API_URL + `?action=getPresensiByDate&date=${selectedDate}`, {}, tOut);
        
        // Ambil data presensi terlebih dahulu (ini yang sering lambat)
        try {
            const dp = await presensiPromise;
            dbP = dp.data || [];
        } catch (presensiErr) {
            console.error("Gagal ambil presensi:", presensiErr.message);
            throw presensiErr; // Lempar ke catch utama untuk retry
        }

        // Ambil data dashboard (jika gagal, biarkan pakai cache yang sudah ada)
        try {
            const d = await dashPromise;
            dbE = d.pegawai || [];
            dbK = d.korlap || [];
            try { localStorage.setItem('wilayah_dashboard_cache', JSON.stringify(d)); } catch(e) {}
            populateUIFromData(d);
        } catch (dashErr) {
            console.warn("Dashboard sync gagal, pakai cache lama:", dashErr.message);
            // Lanjut render dengan data pegawai lama + data presensi baru
            indexData();
            updateKorlapStats();
            filterData();
        }
        
    } catch(e) {
        const isTimeout = e.name === 'TimeoutError' || (e.message && e.message.includes('Timeout'));
        const isNetwork = e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'));
        const is404 = e.message && e.message.includes('HTTP 404');
        
        console.error(`❌ Gagal memuat data (Percobaan ${attempt}):`, e.message);
        
        // Auto-retry untuk cold start
        if (!isAuto && attempt < 3) {
            if (syncToast) syncToast.style.display = 'none';
            setTimeout(() => init(isRefresh, isAuto, attempt + 1), 3000);
            return;
        }

        if (isAuto || (dbE.length > 0 && isRefresh)) {
            if (!isAuto && (is404 || isTimeout)) showToast('Server sibuk, menampilkan data sebelumnya.', 'warning');
            return; 
        }

        if (isTimeout) showToast('Server lambat merespon. Coba lagi dalam beberapa saat.', 'warning');
        else if (isNetwork) showToast('Koneksi internet terputus. Periksa jaringan Anda.', 'error');
        else showToast('Gagal memuat data: ' + e.message, 'error');
        
        if (grid && dbE.length === 0) {
            grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--danger);padding:50px">
                <i data-lucide="wifi-off" size="32" style="margin-bottom:10px;opacity:0.5"></i><br>
                ${isTimeout ? 'Server lambat merespon' : 'Gagal memuat data'}<br>
                <button onclick="init(false, false)" style="margin-top:15px;padding:8px 16px;border-radius:10px;background:var(--pu-blue);color:white;border:none;cursor:pointer;font-weight:700">
                    <i data-lucide="refresh-cw" size="14" style="vertical-align:middle"></i> Coba Lagi
                </button>
            </p>`;
            lucide.createIcons();
        }
    } finally {
        if (syncToast) syncToast.style.display = 'none';
    }
}
// ============ FILTERING (pakai index) ============
function filterData() {
    const wil = document.getElementById('fWil').value;
    const search = document.getElementById('fSearch').value.toLowerCase();
    const monitoringMap = {};

    dbE.forEach(p => {
        if ((wil === 'ALL' || p.Wilayah === wil) && (!search || (p.Nama||'').toLowerCase().includes(search))) {
            const pID = String(p.ID);
            monitoringMap[pID] = { id:pID, nama:p.Nama, wil:p.Wilayah, foto:p.Link_Foto_Profile, hp:String(p.NoHP||p.no_hp||""), in:"-", out:"-", sid:"", sin:null, kin:null, gin:null, sout:null, kout:null, gout:null };
        }
    });

    Object.keys(monitoringMap).forEach(pID => {
        const logs = logsByPegawai.get(pID) || [];
        logs.sort((a,b) => new Date(a.Timestamp||a.timestamp) - new Date(b.Timestamp||b.timestamp));
        logs.forEach(log => {
            const status = (log.Status||log.status||"").toLowerCase();
            const jam = new Date(log.Timestamp||log.timestamp).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
            const fSelfie = log['Foto_Selfie']||log['Foto Selfie']||log.foto_selfie||null;
            const fKerja = log['Foto_Kerja']||log['Foto Kerja']||log['Foto Lokasi']||log.foto_kerja||log.foto_lokasi||null;
            const fSurat = log['Surat']||log.surat||null;
            const gpsData = log.GPS||log.gps||null;
            const isSID = status.includes('izin')||status.includes('sakit')||status.includes('dinas');
            const isMorning = status.includes('hadir')||status.includes('terlambat')||status.includes('qr hadir')||status.includes('quick response');
            const isPulang = status.includes('pulang')||status.includes('qr pulang');
            if (isSID) { monitoringMap[pID].sid = log.Status||log.status; monitoringMap[pID].in = jam; monitoringMap[pID].sin = fSelfie; monitoringMap[pID].kin = fKerja||fSurat; monitoringMap[pID].gin = gpsData; }
            else {
                if (isMorning && monitoringMap[pID].in === "-") { monitoringMap[pID].in = jam; monitoringMap[pID].sin = fSelfie; monitoringMap[pID].kin = fKerja; monitoringMap[pID].gin = gpsData; }
                if (isPulang) { monitoringMap[pID].out = jam; monitoringMap[pID].sout = fSelfie; monitoringMap[pID].kout = fKerja; monitoringMap[pID].gout = gpsData; }
            }
        });
    });

    const dataArr = Object.values(monitoringMap);
    const gridVisible = document.getElementById('gridView')?.style.display !== 'none';
    const tableVisible = document.getElementById('tableWrapper')?.style.display !== 'none';
    if (gridVisible) renderGridView(dataArr);
    if (tableVisible) renderTableView(dataArr);
    lucide.createIcons();
}

// ============ EVENT DELEGATION ============
function attachPreviewListeners(container) {
    container.querySelectorAll('[data-preview]').forEach(el => {
        el.addEventListener('click', () => {
            const { url, name, info, time, gps } = el.dataset;
            openPreview(url, name, info, time, gps);
        });
    });
}

function renderGridView(data) {
    const container = document.getElementById('gridView');
    if (!container) return;
    if (data.length === 0) { container.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:50px;opacity:0.5">Belum ada data pada filter ini.</p>'; return; }
    
    const fragment = document.createDocumentFragment();
    data.forEach(p => {
        const cleanHP = p.hp.replace(/[^0-9]/g, '');
        const waUrl = cleanHP ? `https://wa.me/${cleanHP}` : "#";
        const card = document.createElement('div');
        card.className = 'personel-card';
        const sNama = sanitizeHTML(p.nama), sWil = sanitizeHTML(p.wil), sSid = sanitizeHTML(p.sid);
        card.innerHTML = `
            <div class="p-card-top">
                <div class="p-photo-pop"><img src="${p.foto||placeholderImg}" loading="lazy" onerror="handleImgError(this)" alt="${sNama}"></div>
                <div class="p-info">
                    <h3>${sNama}</h3>
                    <p>${sWil}</p>
                    <div class="sid-badge" style="display:${p.sid?'block':'none'}">${sSid}</div>
                </div>
                <a href="${waUrl}" target="_blank" class="btn-wa-call" title="Hubungi WA"><i data-lucide="message-circle" size="20"></i></a>
            </div>
            <div class="p-card-body">
                <div class="pres-indicator" style="border-left:4px solid var(--success)">
                    <div class="pres-label"><span>MASUK</span><b>${p.in}</b></div>
                    <div class="thumb-row">
                        <div class="mini-thumb" data-preview data-url="${p.sin||''}" data-name="${sNama}" data-info="Selfie Masuk" data-time="${p.in}" data-gps="${p.gin||''}">${p.sin?`<img src="${p.sin}" loading="lazy">`:`<i data-lucide="camera" size="14"></i>`}</div>
                        <div class="mini-thumb" data-preview data-url="${p.kin||''}" data-name="${sNama}" data-info="Kerja Masuk" data-time="${p.in}" data-gps="${p.gin||''}">${p.kin?`<img src="${p.kin}" loading="lazy">`:`<i data-lucide="image" size="14"></i>`}</div>
                    </div>
                    <button class="gps-link-btn" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Masuk" data-time="${p.in}" data-gps="${p.gin||''}"><i data-lucide="map-pin" size="14"></i> GPS Pagi</button>
                </div>
                <div class="pres-indicator" style="border-left:4px solid var(--accent)">
                    <div class="pres-label"><span>PULANG</span><b>${p.out}</b></div>
                    <div class="thumb-row">
                        <div class="mini-thumb" data-preview data-url="${p.sout||''}" data-name="${sNama}" data-info="Selfie Pulang" data-time="${p.out}" data-gps="${p.gout||''}">${p.sout?`<img src="${p.sout}" loading="lazy">`:`<i data-lucide="camera" size="14"></i>`}</div>
                        <div class="mini-thumb" data-preview data-url="${p.kout||''}" data-name="${sNama}" data-info="Kerja Pulang" data-time="${p.out}" data-gps="${p.gout||''}">${p.kout?`<img src="${p.kout}" loading="lazy">`:`<i data-lucide="image" size="14"></i>`}</div>
                    </div>
                    <button class="gps-link-btn" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Pulang" data-time="${p.out}" data-gps="${p.gout||''}"><i data-lucide="map-pin" size="14"></i> GPS Sore</button>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
    attachPreviewListeners(container);
}

function renderTableView(data) {
    const body = document.getElementById('tableBody');
    if (!body) return;
    if (data.length === 0) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:50px;opacity:0.5">Belum ada data pada filter ini.</td></tr>'; return; }
    
    const fragment = document.createDocumentFragment();
    data.forEach(p => {
        const sNama = sanitizeHTML(p.nama), sWil = sanitizeHTML(p.wil);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:800;text-transform:uppercase">${sNama} ${p.sid?`<span style="color:#8b5cf6;font-size:0.65rem;margin-left:5px">[${sanitizeHTML(p.sid)}]</span>`:''}</td>
            <td style="opacity:0.6">${sWil}</td>
            <td style="font-family:'JetBrains Mono';font-weight:800;color:${p.in!=='-'?'var(--success)':'#4b5563'}">${p.in}</td>
            <td>
                <div class="proof-icons-container">
                    <div class="table-icon-btn ${p.sin?'active-h':''}" data-preview data-url="${p.sin||''}" data-name="${sNama}" data-info="Selfie Masuk" data-time="${p.in}" data-gps="${p.gin||''}"><i data-lucide="camera" size="16"></i></div>
                    <div class="table-icon-btn ${p.kin?'active-h':''}" data-preview data-url="${p.kin||''}" data-name="${sNama}" data-info="Kerja Masuk" data-time="${p.in}" data-gps="${p.gin||''}"><i data-lucide="briefcase" size="16"></i></div>
                    <div class="table-icon-btn ${p.gin?'active-h':''}" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Masuk" data-time="${p.in}" data-gps="${p.gin||''}"><i data-lucide="map-pin" size="16"></i></div>
                </div>
            </td>
            <td style="font-family:'JetBrains Mono';font-weight:800;color:${p.out!=='-'?'var(--accent)':'#4b5563'}">${p.out}</td>
            <td>
                <div class="proof-icons-container">
                    <div class="table-icon-btn ${p.sout?'active-p':''}" data-preview data-url="${p.sout||''}" data-name="${sNama}" data-info="Selfie Pulang" data-time="${p.out}" data-gps="${p.gout||''}"><i data-lucide="camera" size="16"></i></div>
                    <div class="table-icon-btn ${p.kout?'active-p':''}" data-preview data-url="${p.kout||''}" data-name="${sNama}" data-info="Kerja Pulang" data-time="${p.out}" data-gps="${p.gout||''}"><i data-lucide="briefcase" size="16"></i></div>
                    <div class="table-icon-btn ${p.gout?'active-p':''}" data-preview data-url="" data-name="${sNama}" data-info="Lokasi Pulang" data-time="${p.out}" data-gps="${p.gout||''}"><i data-lucide="map-pin" size="16"></i></div>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    });
    body.innerHTML = '';
    body.appendChild(fragment);
    attachPreviewListeners(body);
}

// ============ KORLAP STATS (pre-indexed) ============
function updateKorlapStats() {
    const container = document.getElementById('korlapGrid');
    if (!container) return;
    
    const staffByWilayah = new Map();
    dbE.forEach(p => { const w = p.Wilayah; if (!staffByWilayah.has(w)) staffByWilayah.set(w, []); staffByWilayah.get(w).push(p); });
    
    const html = dbK.map(k => {
        const wilStaff = staffByWilayah.get(k.Wilayah) || [];
        let h=0, p_out=0, s=0;
        wilStaff.forEach(stf => {
            const logs = logsByPegawai.get(String(stf.ID)) || [];
            logs.forEach(l => {
                const st = (l.Status||l.status||"").toLowerCase();
                if (st.includes('hadir')||st.includes('terlambat')) h++;
                if (st.includes('pulang')) p_out++;
                if (st.includes('izin')||st.includes('sakit')||st.includes('dinas')) s++;
            });
        });
        return `<div class="korlap-card">
            <div class="korlap-header-blue">
                <div class="korlap-foto-wrap"><img src="${k.Link_Foto_Profile||placeholderImg}" onerror="handleImgError(this)"></div>
                <div class="korlap-info">
                    <h2>${sanitizeHTML(k.Nama)}</h2>
                    <p>Koordinator ${sanitizeHTML(k.Wilayah)}</p>
                    <button class="btn-agenda-pill" onclick="openAgenda('${sanitizeHTML(k.Nama).replace(/'/g,"\\'")}','${sanitizeHTML(k.Jabatan||'').replace(/'/g,"\\'")}')"><i data-lucide="calendar-check-2" size="14"></i> E-Agenda</button>
                </div>
            </div>
            <div class="korlap-stats-row">
                <div class="k-stat-box"><b>${wilStaff.length}</b><span>Total</span></div>
                <div class="k-stat-box"><b style="color:var(--success)">${h}</b><span>Hadir</span></div>
                <div class="k-stat-box"><b style="color:var(--accent)">${p_out}</b><span>Pulang</span></div>
                <div class="k-stat-box"><b style="color:#a855f7">${s}</b><span>SID</span></div>
            </div>
        </div>`;
    }).join('');
    container.innerHTML = html;
    lucide.createIcons();
}

// ============ AGENDA & MODAL ============
function openAgenda(nama, jabatan) {
    const agnNama = document.getElementById('agnNamaInput');
    if (agnNama) { agnNama.value = nama; syncJabatan(); }
    document.getElementById('agnTanggalInput').value = document.getElementById('fDate').value;
    document.getElementById('agendaModal').style.display = 'flex';
}
function closeAgenda() { document.getElementById('agendaModal').style.display = 'none'; }
function syncJabatan() { const nama = document.getElementById('agnNamaInput').value; const k = dbK.find(x => x.Nama === nama); if(k) document.getElementById('agnJabatanInput').value = k.Jabatan||"Koordinator Lapangan"; }

function startVoice(targetId, btn) {
    const S = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!S) { showToast("Browser tidak mendukung fitur suara", "warning"); return; }
    const r = new S(); r.lang = 'id-ID';
    r.onstart = () => btn.classList.add('active');
    r.onresult = (e) => { const el = document.getElementById(targetId); if(el) el.value = (el.value?el.value+' ':'')+e.results[0][0].transcript; };
    r.onend = () => btn.classList.remove('active');
    r.onerror = () => btn.classList.remove('active');
    r.start();
}

// ============ IMAGE COMPRESSION ============
async function compressImage(base64, options = {}) {
    const { maxWidth=800, maxHeight=800, quality=0.5 } = options;
    return new Promise((resolve, reject) => {
        const img = new Image();
        const tid = setTimeout(() => reject(new Error('Timeout')), 10000);
        img.onload = () => {
            clearTimeout(tid);
            const c = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = h*(maxWidth/w); w = maxWidth; }
            if (h > maxHeight) { w = w*(maxHeight/h); h = maxHeight; }
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => { clearTimeout(tid); reject(new Error('Gagal memuat gambar')); };
        img.src = base64;
    });
}

// ============ SUBMIT AGENDA ============
async function submitAgenda() {
    const btn = document.getElementById('btnSubmitAgenda');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin" size="18"></i> Mengirim...';
    btn.disabled = true;
    lucide.createIcons();
    
    let fotoBase64 = null;
    const fi = document.getElementById('agnFoto');
    if (fi && fi.files.length > 0) {
        const file = fi.files[0];
        if (!file.type.startsWith('image/')) { showToast("File harus berupa gambar", "error"); btn.innerHTML = orig; btn.disabled = false; lucide.createIcons(); return; }
        try {
            fotoBase64 = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = async (ev) => { try { resolve(await compressImage(ev.target.result)); } catch(e) { reject(e); } };
                r.onerror = reject;
                r.readAsDataURL(file);
            });
        } catch(e) { showToast("Gagal memproses foto: " + e.message, "error"); btn.innerHTML = orig; btn.disabled = false; lucide.createIcons(); return; }
    }
    
    const payload = {
        action:'submitAgenda',
        idPegawai: dbK.find(k => k.Nama === document.getElementById('agnNamaInput').value)?.ID || '',
        nama: document.getElementById('agnNamaInput').value,
        jabatan: document.getElementById('agnJabatanInput').value,
        tanggal: document.getElementById('agnTanggalInput').value,
        jamDatang: document.getElementById('agnDatang').value,
        jamPulang: document.getElementById('agnPulang').value,
        agenda: document.getElementById('agnJudulInput').value,
        keterangan: document.getElementById('agnKetInput').value,
        foto: fotoBase64
    };
    
    try {
        const result = await safeFetchJSON(API_URL, { method:'POST', body:JSON.stringify(payload) }, 20000);
        if (result.status === 'success') {
            showToast("Laporan Agenda berhasil terkirim!", "success");
            closeAgenda();
            ['agnJudulInput','agnKetInput','agnFoto'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
        } else showToast("Gagal mengirim: " + (result.message||'Unknown error'), "error");
    } catch(e) { showToast("Terjadi kesalahan jaringan: " + e.message, "error"); }
    finally { btn.innerHTML = orig; btn.disabled = false; lucide.createIcons(); }
}

// ============ UI INTERACTIONS ============
function onDateChange() {
    clearTimeout(searchTimeout);
    // ✅ Saat ganti tanggal, jangan langsung hapus data. Biarkan init() memproses di background.
    searchTimeout = setTimeout(() => init(true, false), 300);
}
function onSearchInput() { clearTimeout(searchTimeout); searchTimeout = setTimeout(filterData, 300); }
function toggleView(v) {
    document.getElementById('btnG').classList.toggle('active', v==='grid');
    document.getElementById('btnT').classList.toggle('active', v==='table');
    document.getElementById('gridView').style.display = v==='grid' ? 'grid' : 'none';
    document.getElementById('tableWrapper').style.display = v==='table' ? 'block' : 'none';
    filterData();
}

function openPreview(url, name, info, time, gps) {
    if (time === "-" && !url && !gps) return;
    const m = document.getElementById('pModal'), img = document.getElementById('mImg');
    if (url && url !== '-' && url !== 'null' && url !== 'undefined') { img.src = url; document.getElementById('mImgContainer').style.display = 'flex'; }
    else document.getElementById('mImgContainer').style.display = 'none';
    document.getElementById('mName').innerText = name;
    document.getElementById('mInfo').innerText = info;
    document.getElementById('mTime').innerText = time;
    const btn = document.getElementById('mGpsBtn');
    if (gps && gps !== '-' && gps !== 'null' && gps !== 'undefined') { btn.style.display = 'flex'; btn.onclick = () => window.open(`https://www.google.com/maps?q=${gps.replace(/\s/g,'')}`, '_blank'); }
    else btn.style.display = 'none';
    m.style.display = 'flex';
}
function closeModal() { document.getElementById('pModal').style.display = 'none'; }
