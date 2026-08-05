// ============ KONFIGURASI GLOBAL ============
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec";
let appData = { pegawai: [], korlap: [], tools: [], config: {} }, slideIdx = 0;

// ============ PWA MANIFEST (Data URI) ============
try {
    const mf = { name:"E-PUSDA UPT Management", short_name:"E-PUSDA", start_url:"index.html", scope:"./", display:"standalone", background_color:"#0d1b3e", theme_color:"#1e40af", orientation:"any", icons:[{src:GITHUB_LOGO_URL,sizes:"192x192",type:"image/png"},{src:GITHUB_LOGO_URL,sizes:"512x512",type:"image/png",purpose:"any maskable"}] };
    const uri = 'data:application/manifest+json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(mf))));
    const el = document.getElementById('pwaManifest');
    if (el) el.setAttribute('href', uri);
    else { const l = document.createElement('link'); l.rel='manifest'; l.href=uri; document.head.appendChild(l); }
} catch(e) { console.warn('Manifest init failed:', e); }

// ============ FETCH DENGAN TIMEOUT ============
function fetchWithTimeout(url, opts = {}, timeout = 15000) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(new DOMException('Timeout after ' + timeout + 'ms', 'AbortError')), timeout);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

// ============ SPLASH SCREEN ============
function hideSplashScreen() {
    const ov = document.getElementById('loadingOverlay');
    if (!ov) return;
    ov.style.opacity = '0';
    setTimeout(() => ov.style.display = 'none', 1000);
}

// ============ TOAST ERROR ============
function showToastError(title, msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.95);color:white;padding:14px 24px;border-radius:16px;font-size:0.85rem;font-weight:700;z-index:99999;box-shadow:0 10px 30px rgba(0,0,0,0.3);max-width:90%;text-align:center;animation:slideUp 0.3s ease-out;';
    t.innerHTML = `<strong>${title}</strong><br><span style="opacity:0.85;font-weight:500;font-size:0.75rem;">${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.5s'; setTimeout(() => t.remove(), 500); }, 5000);
}

// ============ CACHE HELPER ============
function loadFromCache() {
    try {
        const c = localStorage.getItem('dashboard_cache_v1');
        if (c) {
            appData = JSON.parse(c);
            return true;
        }
    } catch(e) { console.warn('Cache bermasalah'); }
    return false;
}
function saveToCache() {
    try { localStorage.setItem('dashboard_cache_v1', JSON.stringify(appData)); } catch(e) {}
}

// ============ START APP (CACHE-FIRST STRATEGY) ============
window.onload = () => {
    lucide.createIcons(); 
    
    const hasCache = loadFromCache();
    if (hasCache) {
        initAppUI();
        hideSplashScreen();
        fetchBackgroundData();
    } else {
        fetchInitialData();
    }

    // Update jam setiap detik
    setInterval(() => { const el = document.getElementById('liveClock'); if(el) el.innerText = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}); }, 1000);
    
    // Safety net hide splash
    setTimeout(() => { const ov = document.getElementById('loadingOverlay'); if(ov && ov.style.display !== 'none' && ov.style.opacity !== '0') { console.warn('Safety net: Force hide splash'); hideSplashScreen(); } }, 12000);

    // ✅ Logika tombol Upload File Custom
    const agnFotoInput = document.getElementById('agnFoto');
    if (agnFotoInput) {
        agnFotoInput.addEventListener('change', function() {
            const fileName = this.files[0] ? this.files[0].name : 'Pilih atau Jatuhkan File di Sini';
            const fileText = document.getElementById('fileUploadText');
            if (fileText) fileText.innerText = fileName;
        });
    }
};

// ============ INIT UI ============
function initAppUI() {
    updateLogos();
    renderMainDashboard(); 
    populateAgendaDropdown(); 
    startHeroSlide();
}

function updateLogos() {
    const logo = appData.config?.Logo || GITHUB_LOGO_URL;
    const sl = document.getElementById('sidebarLogo'), spl = document.getElementById('splashBgLogo');
    if (sl) sl.src = logo; 
    if (spl) spl.src = logo;
}

// ============ FETCH DATA AWAL ============
async function fetchInitialData(attempt = 1) {
    const maxRetries = 2;
    const timeout = attempt === 1 ? 15000 : 20000;
    
    try {
        const res = await fetchWithTimeout(SCRIPT_URL + '?action=getDashboardData', { redirect: 'follow', cache: 'no-cache' }, timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const txt = await res.text();
        if (!txt || !txt.trim() || txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) throw new Error('Server error');
        
        appData = JSON.parse(txt);
        if (typeof appData !== 'object' || !appData) appData = { pegawai: [], korlap: [], tools: [], config: {} };
        
        saveToCache();
        initAppUI(); 
    } catch(err) {
        const isAbort = err?.name === 'AbortError' || err?.message?.includes('Timeout');
        if (isAbort && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000));
            return fetchInitialData(attempt + 1);
        }
        appData = { pegawai: [], korlap: [], tools: [], config: {} };
        updateLogos();
        renderMainDashboard(); 
        populateAgendaDropdown();
        if (!isAbort) showToastError('Koneksi Terputus', 'Gagal memuat data. Mode offline aktif.');
    } finally { 
        setTimeout(() => hideSplashScreen(), 800); 
    }
}

// ============ FETCH DATA BACKGROUND ============
async function fetchBackgroundData() {
    try {
        const res = await fetchWithTimeout(SCRIPT_URL + '?action=getDashboardData', { redirect: 'follow', cache: 'no-cache' }, 12000);
        if (!res.ok) return;
        const txt = await res.text();
        if (!txt || txt.trim().startsWith('<!DOCTYPE')) return;
        
        const newData = JSON.parse(txt);
        if (typeof newData === 'object' && newData) {
            appData = newData;
            saveToCache();
            initAppUI(); 
        }
    } catch(e) {
        console.warn('Background update gagal, memakai cache lama');
    }
}

// ============ SANITIZE ============
function sanitizeHTML(s) { if (s == null) return ""; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

// ============ HERO SLIDER (SLIDE FROM RIGHT) ============
function startHeroSlide() {
    if (!appData.korlap || !appData.korlap.length) return;
    const img = document.getElementById('heroImage');
    if (!img) return;

    const loadNext = () => {
        const p = appData.korlap[slideIdx % appData.korlap.length];
        const u = p.link_foto_profile || p.Link_Foto_Profile;
        const nextSrc = (u && u.includes('googleusercontent.com')) ? u.split('=')[0] + '=s500' : GITHUB_LOGO_URL;

        const tempImg = new Image();
        tempImg.onload = () => {
            img.classList.remove('slide-in-right');
            void img.offsetWidth; 
            img.src = nextSrc;
            img.classList.add('slide-in-right');
        };
        tempImg.onerror = () => {
            img.classList.remove('slide-in-right');
            void img.offsetWidth;
            img.src = GITHUB_LOGO_URL;
            img.classList.add('slide-in-right');
        };
        tempImg.src = nextSrc;
        slideIdx++;
    };

    loadNext(); 
    setInterval(loadNext, 8000); 
}

// ============ RENDER DASHBOARD ============
function renderMainDashboard() {
    const c = document.getElementById('mainTools'); 
    if (!c) return;
    const menu = [
        {n:'E-Presensi',i:'fingerprint',c:'#2563eb',u:'presensi.html'},
        {n:'E-Raport',i:'file-bar-chart',c:'#059669',u:'raport.html'},
        {n:'Maps',i:'map',c:'#ea580c',u:'wilayah.html'},
        {n:'E-Agenda',i:'calendar',c:'#7c3aed',m:'agendaModal'},
        {n:'Lapor',i:'megaphone',c:'#db2777',ext:'https://www.lapor.go.id/'},
        {n:'Smopi',i:'waves',c:'#dc2625',ext:'https://smopi.info/'},
        {n:'LAPKIN',i:'layout-dashboard',c:'#10b981',m:'lapkinModal'}
    ];
    c.innerHTML = menu.map(i => `<div class="tool-card" onclick="${i.u?`location.href='${i.u}'`:i.ext?`window.open('${i.ext}','_blank')`:`openModal('${i.m}')`}"><div class="tool-icon-box" style="background:${i.c}"><i data-lucide="${i.i}"></i></div><div class="tool-name">${sanitizeHTML(i.n)}</div></div>`).join('');
    
    renderLapkinPortal(); 
    lucide.createIcons();
}

// ============ LAPKIN PORTAL ============
function renderLapkinPortal() {
    const c = document.getElementById('lapkinContainer'); 
    if (!c) return;
    const tools = (appData.tools || []).filter(t => { const n = t.Nama||t.nama||t['Nama Tool']||t['nama tool']; return n && String(n).toLowerCase().trim() !== 'nama'; }).map(t => ({ n: t.Nama||t.nama||t['Nama Tool']||'Tanpa Nama', i: t.Icon||t.icon||'external-link', c: t.Warna||t.warna||'#333', l: t.Link_URL||t.link_url||'#' }));
    if (!tools.length) { 
        c.innerHTML = `<div style="text-align:center;opacity:0.5;grid-column:1/-1;padding:30px;"><i data-lucide="database" size="32" style="margin-bottom:10px;opacity:0.5;"></i><p>Belum ada data di sheet <b>TOOLS</b>.<br>Header: <b>Icon, Nama, Warna, Link_URL</b></p></div>`; 
        return; 
    }
    c.innerHTML = tools.map(i => `<div class="lapkin-card" onclick="window.open('${i.l}','_blank')"><div class="icon-box" style="background:${i.c}"><i data-lucide="${i.i}"></i></div><span>${sanitizeHTML(i.n)}</span></div>`).join('');
}

// ============ AGENDA LOGIC ============
function populateAgendaDropdown() {
    const s = document.getElementById('agnNama'); 
    if (!s) return;
    s.innerHTML = '<option value="" disabled selected>-- Pilih Personel --</option>';
    [...(appData.pegawai||[]),...(appData.korlap||[])].forEach(p => { s.insertAdjacentHTML('beforeend', `<option value="${p.id||p.ID}">${sanitizeHTML(p.nama||p.Nama)}</option>`); });
}

function updateAgendaFields() {
    const id = document.getElementById('agnNama').value;
    const p = [...(appData.pegawai||[]),...(appData.korlap||[])].find(x => String(x.id||x.ID) === String(id));
    if (p) document.getElementById('agnJabatan').value = sanitizeHTML(p.jabatan||p.Jabatan||"Staff Operasional");
}

async function submitAgendaAction() {
    const btn = document.getElementById('btnSendAgenda'), id = document.getElementById('agnNama').value, judul = document.getElementById('agnJudul').value;
    if (!id || !judul) return alert("Harap lengkapi Nama dan Judul Agenda!");
    const p = [...(appData.pegawai||[]),...(appData.korlap||[])].find(x => String(x.id||x.ID) === String(id));
    const payload = { action:'submitAgenda', idPegawai:id, nama: p?(p.nama||p.Nama):'', jabatan:document.getElementById('agnJabatan').value, tanggal:document.getElementById('agnTanggal').value, jamDatang:document.getElementById('agnDatang').value, jamPulang:document.getElementById('agnPulang').value, agenda:judul, keterangan:document.getElementById('agnKet').value, foto:null };
    
    const orig = btn.innerHTML; 
    btn.disabled = true; 
    btn.innerHTML = '<i data-lucide="loader-2" class="spin" size="18"></i> MENGIRIM...'; 
    lucide.createIcons();
    
    const fi = document.getElementById('agnFoto');
    if (fi.files.length > 0) { 
        const r = new FileReader(); 
        r.onload = async (e) => { payload.foto = e.target.result; await sendAgenda(payload, btn, orig); }; 
        r.readAsDataURL(fi.files[0]); 
    } else {
        await sendAgenda(payload, btn, orig);
    }
}

async function sendAgenda(payload, btn, orig) {
    try {
        const r = await fetchWithTimeout(SCRIPT_URL, { method:'POST', body:JSON.stringify(payload) }, 20000);
        const txt = await r.text(); 
        let d; 
        try { d = JSON.parse(txt); } catch(e) { throw new Error('Response invalid'); }
        
        if (d.status === 'success') { 
            alert("Agenda berhasil terkirim!"); 
            closeModal('agendaModal'); 
            ['agnNama','agnJabatan','agnTanggal','agnDatang','agnPulang','agnJudul','agnKet','agnFoto'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; }); 
            
            // ✅ Reset teks tombol upload custom
            const fileText = document.getElementById('fileUploadText');
            if (fileText) fileText.innerText = 'Pilih atau Jatuhkan File di Sini';
            
            document.getElementById('agnNama').selectedIndex = 0; 
        } else {
            alert("Gagal: " + (d.message || 'Unknown error'));
        }
    } catch(e) { 
        alert("Error jaringan: " + (e.message || 'Timeout')); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = orig; 
        lucide.createIcons(); 
    }
}

// ============ VOICE TO TEXT ============
function startMic(tid, btn) {
    const S = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!S) return alert("Browser tidak mendukung fitur suara.");
    const r = new S(); 
    r.lang = 'id-ID';
    r.onstart = () => btn.classList.add('active');
    r.onresult = (e) => { const el = document.getElementById(tid); if(el) el.value = (el.value ? el.value + ' ' : '') + e.results[0][0].transcript; };
    r.onend = () => btn.classList.remove('active');
    r.onerror = () => btn.classList.remove('active');
    r.start();
}

// ============ MODAL CONTROLS ============
function openModal(id) { const el = document.getElementById(id); if(el) el.style.display = 'flex'; }
function closeModal(id) { const el = document.getElementById(id); if(el) el.style.display = 'none'; }
