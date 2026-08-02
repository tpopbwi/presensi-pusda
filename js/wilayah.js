// KONFIGURASI GLOBAL
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const API_URL = "https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec";
const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 85'%3E%3Crect width='60' height='85' fill='%232e446e'/%3E%3Cpath d='M30 40c5.5 0 10-4.5 10-10s-4.5-10-10-10-10 4.5-10 10 4.5 10 10 10zm0 5c-8 0-20 4-20 12v5h40v-5c0-8-12-12-20-12z' fill='%23ffffff' opacity='0.2'/%3E%3C/svg%3E";

// INISIALISASI PWA MANIFEST
const manifestData = {
    "name": "E-PUSDA Monitoring",
    "short_name": "E-PUSDA",
    "start_url": "/wilayah.html",
    "display": "standalone",
    "background_color": "#0d1b3e",
    "theme_color": "#0d1b3e",
    "icons": [
        { "src": GITHUB_LOGO_URL, "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
        { "src": GITHUB_LOGO_URL, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
    ]
};
const manifestBlob = new Blob([JSON.stringify(manifestData)], {type: 'application/manifest+json'});
document.getElementById('pwaManifest').setAttribute('href', URL.createObjectURL(manifestBlob));

// VARIABEL APLIKASI
let dbE = [], dbP = [], dbK = [], searchTimeout = null, isPolling = false;

// INISIALISASI APLIKASI
window.onload = () => {
    lucide.createIcons();
    const now = new Date();
    document.getElementById('fDate').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    init();
    setInterval(() => { 
        const clockEl = document.getElementById('liveClock');
        if(clockEl) clockEl.innerText = new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}); 
    }, 1000);
    setInterval(() => { if (!document.hidden) init(true); }, 60000);
};

function handleImgError(img) { img.onerror = null; img.src = placeholderImg; }

// FETCH DATA
async function init(isRefresh = false) {
    if (!isRefresh) document.getElementById('syncToast').style.display = 'block';
    
    if (isRefresh) {
        document.getElementById('gridView').innerHTML = Array(4).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton-circle"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>
        `).join('');
    }

    try {
        const selectedDate = document.getElementById('fDate').value;
        const r = await fetch(API_URL + "?action=getDashboardData");
        const d = await r.json();
        dbE = d.pegawai || [];
        dbK = d.korlap || [];
        if (d.config?.Logo) document.getElementById('sidebarLogo').src = d.config.Logo;
        
        const sel = document.getElementById('fWil');
        if (sel && sel.options.length <= 1) {
            [...new Set(dbE.map(p => p.Wilayah).filter(w => w))].sort().forEach(w => {
               const opt = document.createElement('option'); opt.value = w; opt.innerText = w; sel.appendChild(opt);
            });
        }

        const agnSel = document.getElementById('agnNamaInput');
        if (agnSel) {
            agnSel.innerHTML = '<option value="" disabled selected>-- Pilih Nama Pegawai --</option>';
            dbK.forEach(k => { const opt = document.createElement('option'); opt.value = k.Nama; opt.innerText = k.Nama; agnSel.appendChild(opt); });
        }

        const rp = await fetch(API_URL + `?action=getPresensiByDate&date=${selectedDate}`);
        const dp = await rp.json();
        dbP = dp.data || [];
        
        updateKorlapStats();
        filterData();
    } catch (e) { 
        console.error("❌ Gagal memuat data:", e); 
        document.getElementById('gridView').innerHTML = '<p style="grid-column: 1/-1; text-align:center; color:var(--danger); padding:50px;">Gagal memuat data. Periksa koneksi internet.</p>';
    } finally {
        isPolling = false;
        const syncToast = document.getElementById('syncToast');
        if (syncToast) syncToast.style.display = 'none';
    }
}

// UTILITIES
function sanitizeHTML(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getLocalDateString(val) {
    if (!val) return "";
    let d = new Date(val);
    if (isNaN(d.getTime())) {
        if (typeof val === 'string' && val.includes('/')) {
            const p = val.split(/[/\s:]/);
            if (p[0].length === 2) d = new Date(p[2], p[1]-1, p[0]);
        }
    }
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// FILTERING & RENDERING
function filterData() {
    const filterDate = document.getElementById('fDate').value;
    const wil = document.getElementById('fWil').value;
    const search = document.getElementById('fSearch').value.toLowerCase();
    const monitoringMap = {};

    dbE.forEach(p => {
        if ((wil === 'ALL' || p.Wilayah === wil) && (!search || p.Nama.toLowerCase().includes(search))) {
            const pID = String(p.ID);
            monitoringMap[pID] = { 
                id: pID, nama: p.Nama, wil: p.Wilayah, foto: p.Link_Foto_Profile, hp: String(p.NoHP || p.no_hp || ""), 
                in: "-", out: "-", sid: "", 
                sin: null, kin: null, gin: null, 
                sout: null, kout: null, gout: null 
            };
        }
    });

    const sortedLogs = [...dbP].sort((a, b) => new Date(a.Timestamp || a.timestamp) - new Date(b.Timestamp || b.timestamp));
    sortedLogs.forEach(log => {
        const ts = log.Timestamp || log.timestamp;
        if (!ts || getLocalDateString(ts) !== filterDate) return;
        const pID = String(log['ID Pegawai'] || log.id_pegawai || log.ID);
        if (monitoringMap[pID]) {
            const status = (log.Status || log.status || "").toLowerCase();
            const jam = new Date(ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
            
            // ✅ PERBAIKAN: Baca header foto dengan fleksibel ( underscore / spasi )
            const fSelfie = log['Foto_Selfie'] || log['Foto Selfie'] || log.foto_selfie || null;
            const fKerja = log['Foto_Kerja'] || log['Foto Kerja'] || log['Foto Lokasi'] || log.foto_kerja || log.foto_lokasi || null;
            const fSurat = log['Surat'] || log.surat || null;
            const gpsData = log.GPS || log.gps || null;

            // ✅ PERBAIKAN: Klasifikasi Status yang Akurat
            const isSID = status.includes('izin') || status.includes('sakit') || status.includes('dinas');
            const isMorning = status.includes('hadir') || status.includes('terlambat') || status.includes('qr hadir') || status.includes('quick response');
            const isPulang = status.includes('pulang') || status.includes('qr pulang');

            if (isSID) {
                // Jika Izin/Sakit/Dinas, masukkan ke kategori SID beserta fotonya
                monitoringMap[pID].sid = log.Status || log.status;
                monitoringMap[pID].in = jam; 
                monitoringMap[pID].sin = fSelfie;
                monitoringMap[pID].kin = fKerja || fSurat; 
                monitoringMap[pID].gin = gpsData;
            } else {
                if (isMorning && monitoringMap[pID].in === "-") {
                    monitoringMap[pID].in = jam; 
                    monitoringMap[pID].sin = fSelfie; 
                    monitoringMap[pID].kin = fKerja; 
                    monitoringMap[pID].gin = gpsData;
                } 
                if (isPulang) {
                    monitoringMap[pID].out = jam; 
                    monitoringMap[pID].sout = fSelfie; 
                    monitoringMap[pID].kout = fKerja; 
                    monitoringMap[pID].gout = gpsData;
                }
            }
        }
    });

    const dataArr = Object.values(monitoringMap);
    renderGridView(dataArr);
    renderTableView(dataArr);
    lucide.createIcons();
}

function renderGridView(data) {
    const container = document.getElementById('gridView');
    if (!container || container.style.display === 'none') return;
    if (data.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:50px; opacity:0.5;">Belum ada data pada filter ini.</p>';
        return;
    }

    let fullHTML = '';
    data.forEach(p => {
        const cleanHP = p.hp.replace(/[^0-9]/g, '');
        const waUrl = cleanHP ? `https://wa.me/${cleanHP}` : "#";
        fullHTML += `
            <div class="personel-card">
                <div class="p-card-top">
                    <div class="p-photo-pop"><img src="${p.foto || placeholderImg}" loading="lazy" onerror="handleImgError(this)" alt="${sanitizeHTML(p.nama)}"></div>
                    <div class="p-info">
                        <h3>${sanitizeHTML(p.nama)}</h3>
                        <p>${sanitizeHTML(p.wil)}</p>
                        <div class="sid-badge" style="display:${p.sid ? 'block' : 'none'}">${sanitizeHTML(p.sid)}</div>
                    </div>
                    <a href="${waUrl}" target="_blank" class="btn-wa-call" title="Hubungi WA"><i data-lucide="message-circle" size="20"></i></a>
                </div>
                <div class="p-card-body">
                    <div class="pres-indicator" style="border-left: 4px solid var(--success)">
                        <div class="pres-label"><span>MASUK</span><b>${p.in}</b></div>
                        <div class="thumb-row">
                            <div class="mini-thumb" onclick="openPreview('${sanitizeHTML(p.sin)}','${sanitizeHTML(p.nama)}','Selfie Masuk','${p.in}','${sanitizeHTML(p.gin)}')">${p.sin ? `<img src="${p.sin}" loading="lazy">` : `<i data-lucide="camera" size="14"></i>`}</div>
                            <div class="mini-thumb" onclick="openPreview('${sanitizeHTML(p.kin)}','${sanitizeHTML(p.nama)}','Kerja Masuk','${p.in}','${sanitizeHTML(p.gin)}')">${p.kin ? `<img src="${p.kin}" loading="lazy">` : `<i data-lucide="image" size="14"></i>`}</div>
                        </div>
                        <button class="gps-link-btn" onclick="openPreview(null,'${sanitizeHTML(p.nama)}','Lokasi Masuk','${p.in}','${sanitizeHTML(p.gin)}')"><i data-lucide="map-pin" size="14"></i> GPS Pagi</button>
                    </div>
                    <div class="pres-indicator" style="border-left: 4px solid var(--accent)">
                        <div class="pres-label"><span>PULANG</span><b>${p.out}</b></div>
                        <div class="thumb-row">
                            <div class="mini-thumb" onclick="openPreview('${sanitizeHTML(p.sout)}','${sanitizeHTML(p.nama)}','Selfie Pulang','${p.out}','${sanitizeHTML(p.gout)}')">${p.sout ? `<img src="${p.sout}" loading="lazy">` : `<i data-lucide="camera" size="14"></i>`}</div>
                            <div class="mini-thumb" onclick="openPreview('${sanitizeHTML(p.kout)}','${sanitizeHTML(p.nama)}','Kerja Pulang','${p.out}','${sanitizeHTML(p.gout)}')">${p.kout ? `<img src="${p.kout}" loading="lazy">` : `<i data-lucide="image" size="14"></i>`}</div>
                        </div>
                        <button class="gps-link-btn" onclick="openPreview(null,'${sanitizeHTML(p.nama)}','Lokasi Pulang','${p.out}','${sanitizeHTML(p.gout)}')"><i data-lucide="map-pin" size="14"></i> GPS Sore</button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = fullHTML;
}

function renderTableView(data) {
    const body = document.getElementById('tableBody');
    if (!body || document.getElementById('tableWrapper').style.display === 'none') return;
    if (data.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:50px; opacity:0.5;">Belum ada data pada filter ini.</td></tr>';
        return;
    }
    body.innerHTML = data.map(p => `
        <tr>
            <td style="font-weight:800; text-transform:uppercase;">${sanitizeHTML(p.nama)} ${p.sid ? '<span style="color:#8b5cf6; font-size:0.65rem; margin-left:5px;">['+sanitizeHTML(p.sid)+']</span>' : ''}</td>
            <td style="opacity:0.6;">${sanitizeHTML(p.wil)}</td>
            <td style="font-family:'JetBrains Mono'; font-weight:800; color:${p.in!=='-'?'var(--success)':'#4b5563'}">${p.in}</td>
            <td>
                <div class="proof-icons-container">
                    <div class="table-icon-btn ${p.sin?'active-h':''}" onclick="openPreview('${sanitizeHTML(p.sin)}','${sanitizeHTML(p.nama)}','Selfie Masuk','${p.in}','${sanitizeHTML(p.gin)}')"><i data-lucide="camera" size="16"></i></div>
                    <div class="table-icon-btn ${p.kin?'active-h':''}" onclick="openPreview('${sanitizeHTML(p.kin)}','${sanitizeHTML(p.nama)}','Kerja Masuk','${p.in}','${sanitizeHTML(p.gin)}')"><i data-lucide="briefcase" size="16"></i></div>
                    <div class="table-icon-btn ${p.gin?'active-h':''}" onclick="openPreview(null,'${sanitizeHTML(p.nama)}','Lokasi Masuk','${p.in}','${sanitizeHTML(p.gin)}')"><i data-lucide="map-pin" size="16"></i></div>
                </div>
            </td>
            <td style="font-family:'JetBrains Mono'; font-weight:800; color:${p.out!=='-'?'var(--accent)':'#4b5563'}">${p.out}</td>
            <td>
                <div class="proof-icons-container">
                    <div class="table-icon-btn ${p.sout?'active-p':''}" onclick="openPreview('${sanitizeHTML(p.sout)}','${sanitizeHTML(p.nama)}','Selfie Pulang','${p.out}','${sanitizeHTML(p.gout)}')"><i data-lucide="camera" size="16"></i></div>
                    <div class="table-icon-btn ${p.kout?'active-p':''}" onclick="openPreview('${sanitizeHTML(p.kout)}','${sanitizeHTML(p.nama)}','Kerja Pulang','${p.out}','${sanitizeHTML(p.gout)}')"><i data-lucide="briefcase" size="16"></i></div>
                    <div class="table-icon-btn ${p.gout?'active-p':''}" onclick="openPreview(null,'${sanitizeHTML(p.nama)}','Lokasi Pulang','${p.out}','${sanitizeHTML(p.gout)}')"><i data-lucide="map-pin" size="16"></i></div>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateKorlapStats() {
    const filterDate = document.getElementById('fDate').value;
    const container = document.getElementById('korlapGrid');
    if (!container) return;
    const logsByStaff = {};
    dbP.forEach(l => {
        if (getLocalDateString(l.Timestamp || l.timestamp) === filterDate) {
            const pID = String(l['ID Pegawai'] || l.id_pegawai || l.ID);
            if (!logsByStaff[pID]) logsByStaff[pID] = [];
            logsByStaff[pID].push(l);
        }
    });
    container.innerHTML = dbK.map(k => {
        const wilStaff = dbE.filter(p => p.Wilayah === k.Wilayah);
        let h=0, p_out=0, s=0;
        wilStaff.forEach(stf => {
            const logs = logsByStaff[String(stf.ID)] || [];
            // ✅ PERBAIKAN: Gunakan string includes() agar 'Terlambat Ringan' & 'QR Hadir' terhitung
            logs.forEach(l => {
                const st = (l.Status || l.status || "").toLowerCase();
                if (st.includes('hadir') || st.includes('terlambat')) h++;
                if (st.includes('pulang')) p_out++;
                if (st.includes('izin') || st.includes('sakit') || st.includes('dinas')) s++;
            });
        });
        return `
            <div class="korlap-card">
                <div class="korlap-header-blue">
                    <div class="korlap-foto-wrap"><img src="${k.Link_Foto_Profile || placeholderImg}" onerror="handleImgError(this)"></div>
                    <div class="korlap-info">
                        <h2>${sanitizeHTML(k.Nama)}</h2>
                        <p>Koordinator ${sanitizeHTML(k.Wilayah)}</p>
                        <button class="btn-agenda-pill" onclick="openAgenda('${sanitizeHTML(k.Nama)}', '${sanitizeHTML(k.Jabatan)}')"><i data-lucide="calendar-check-2" size="14"></i> E-Agenda</button>
                    </div>
                </div>
                <div class="korlap-stats-row">
                    <div class="k-stat-box"><b>${wilStaff.length}</b><span>Total</span></div>
                    <div class="k-stat-box"><b style="color:var(--success)">${h}</b><span>Hadir</span></div>
                    <div class="k-stat-box"><b style="color:var(--accent)">${p_out}</b><span>Pulang</span></div>
                    <div class="k-stat-box"><b style="color:#a855f7">${s}</b><span>SID</span></div>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

// MODAL & AGENDA FUNCTIONS
function openAgenda(nama, jabatan) {
    const agnNama = document.getElementById('agnNamaInput');
    if (agnNama) { agnNama.value = nama; syncJabatan(); }
    document.getElementById('agnTanggalInput').value = document.getElementById('fDate').value;
    document.getElementById('agendaModal').style.display = 'flex';
}
function closeAgenda() { document.getElementById('agendaModal').style.display = 'none'; }
function syncJabatan() {
    const nama = document.getElementById('agnNamaInput').value;
    const k = dbK.find(x => x.Nama === nama);
    if (k) document.getElementById('agnJabatanInput').value = k.Jabatan || "Koordinator Lapangan";
}
function startVoice(targetId, btn) {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!window.SpeechRecognition) { alert("Browser tidak mendukung fitur suara."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.onstart = () => btn.classList.add('active');
    recognition.onresult = (e) => {
        const el = document.getElementById(targetId);
        el.value = (el.value ? el.value + ' ' : '') + e.results[0][0].transcript;
    };
    recognition.onend = () => btn.classList.remove('active');
    recognition.start();
}

// ✅ PERBAIKAN: Upload Foto Agenda
async function compressImage(base64, options = {}) {
    const { maxWidth = 800, maxHeight = 800, quality = 0.5 } = options;
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = h * (maxWidth / w); w = maxWidth; }
            if (h > maxHeight) { w = w * (maxHeight / h); h = maxHeight; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Gagal memuat gambar'));
        img.src = base64;
    });
}

async function submitAgenda() {
    const btn = document.getElementById('btnSubmitAgenda');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin" size="18"></i> Mengirim...';
    btn.disabled = true;
    lucide.createIcons();

    let fotoBase64 = null;
    const fileInput = document.getElementById('agnFoto');
    
    // Cek dan kompres foto jika ada
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (!file.type.startsWith('image/')) {
            alert("File harus berupa gambar.");
            btn.innerHTML = originalText; btn.disabled = false; lucide.createIcons();
            return;
        }
        try {
            const reader = new FileReader();
            fotoBase64 = await new Promise((resolve, reject) => {
                reader.onload = async (ev) => {
                    try {
                        const compressed = await compressImage(ev.target.result, { maxWidth: 800, maxHeight: 800, quality: 0.5 });
                        resolve(compressed);
                    } catch (err) { reject(err); }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        } catch (e) {
            alert("Gagal memproses foto: " + e.message);
            btn.innerHTML = originalText; btn.disabled = false; lucide.createIcons();
            return;
        }
    }

    const payload = {
        action: 'submitAgenda',
        idPegawai: dbK.find(k => k.Nama === document.getElementById('agnNamaInput').value)?.ID || '',
        nama: document.getElementById('agnNamaInput').value,
        jabatan: document.getElementById('agnJabatanInput').value,
        tanggal: document.getElementById('agnTanggalInput').value,
        jamDatang: document.getElementById('agnDatang').value,
        jamPulang: document.getElementById('agnPulang').value,
        agenda: document.getElementById('agnJudulInput').value,
        keterangan: document.getElementById('agnKetInput').value,
        foto: fotoBase64 // ✅ Kirim base64 foto
    };
    
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
        const result = await res.json();
        if (result.status === 'success') {
            alert("Laporan Agenda berhasil terkirim!");
            closeAgenda();
            document.getElementById('agnJudulInput').value = '';
            document.getElementById('agnKetInput').value = '';
            document.getElementById('agnFoto').value = '';
        } else { alert("Gagal mengirim: " + result.message); }
    } catch (e) { alert("Terjadi kesalahan jaringan."); }
    finally {
        btn.innerHTML = originalText; btn.disabled = false; lucide.createIcons();
    }
}

// UI INTERACTION FUNCTIONS
function onDateChange() { init(true); }
function onSearchInput() { clearTimeout(searchTimeout); searchTimeout = setTimeout(filterData, 300); }
function toggleView(v) {
    document.getElementById('btnG').classList.toggle('active', v === 'grid');
    document.getElementById('btnT').classList.toggle('active', v === 'table');
    document.getElementById('gridView').style.display = v === 'grid' ? 'grid' : 'none';
    document.getElementById('tableWrapper').style.display = v === 'table' ? 'block' : 'none';
    filterData();
}
function openPreview(url, name, info, time, gps) {
    if (time === "-" && !url && !gps) return;
    const m = document.getElementById('pModal'), img = document.getElementById('mImg');
    if (url && url !== '-' && url !== 'null' && url !== 'undefined') {
        img.src = url; document.getElementById('mImgContainer').style.display = 'flex';
    } else { document.getElementById('mImgContainer').style.display = 'none'; }
    document.getElementById('mName').innerText = name;
    document.getElementById('mInfo').innerText = info;
    document.getElementById('mTime').innerText = time;
    const btn = document.getElementById('mGpsBtn');
    if (gps && gps !== '-' && gps !== 'null' && gps !== 'undefined') {
        btn.style.display = 'flex';
        btn.onclick = () => window.open(`https://www.google.com/maps?q=${gps.replace(/\s/g, '')}`, '_blank');
    } else { btn.style.display = 'none'; }
    m.style.display = 'flex';
}
function closeModal() { document.getElementById('pModal').style.display = 'none'; }
