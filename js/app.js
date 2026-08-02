// KONFIGURASI GLOBAL
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec";
let appData = {}, slideIdx = 0;

// INISIALISASI PWA MANIFEST
const manifest = {
    "name": "E-PUSDA UPT Management",
    "short_name": "E-PUSDA",
    "start_url": "./",
    "display": "standalone",
    "background_color": "#0d1b3e",
    "theme_color": "#1e40af",
    "icons": [
        { "src": GITHUB_LOGO_URL, "sizes": "192x192", "type": "image/png" },
        { "src": GITHUB_LOGO_URL, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
    ]
};
const manifestBlob = new Blob([JSON.stringify(manifest)], {type: 'application/manifest+json'});
document.getElementById('pwaManifest').setAttribute('href', URL.createObjectURL(manifestBlob));

// START APP
window.onload = () => {
    lucide.createIcons();
    fetchData();
    setInterval(() => { 
        const el = document.getElementById('liveClock');
        if(el) el.innerText = new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}); 
    }, 1000);
};

// FETCH DATA DARI GOOGLE APPS SCRIPT
async function fetchData() {
    try {
        const res = await fetch(SCRIPT_URL + '?action=getDashboardData', { redirect: 'follow' });
        appData = await res.json();
        
        const logoToUse = appData.config?.Logo || GITHUB_LOGO_URL;
        document.getElementById('sidebarLogo').src = logoToUse;
        document.getElementById('splashBgLogo').src = logoToUse;
        
        renderMainDashboard();
        populateAgendaDropdown();
        startHeroSlide();
        
        const overlay = document.getElementById('loadingOverlay');
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 1000);
        }, 2000);
    } catch (err) { 
        console.error(err); 
    }
}

// XSS PROTECTION
function sanitizeHTML(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// HERO SLIDER
function startHeroSlide() {
    const update = () => {
        if(!appData.korlap || appData.korlap.length === 0) return;
        const p = appData.korlap[slideIdx % appData.korlap.length];
        const img = document.getElementById('heroImage');
        if(img) {
            const imgUrl = p.link_foto_profile || p.Link_Foto_Profile;
            img.src = (imgUrl && imgUrl.includes('googleusercontent.com')) ? imgUrl.split('=')[0] + '=s500' : GITHUB_LOGO_URL;
            img.onerror = function() { this.src = GITHUB_LOGO_URL; };
        }
        slideIdx++;
    };
    update(); 
    setInterval(update, 6000);
}

// RENDER DASHBOARD MENU
function renderMainDashboard() {
    const container = document.getElementById('mainTools');
    const fullMenu = [
        {n:'E-Presensi', i:'fingerprint', c:'#2563eb', u:'presensi.html'},
        {n:'E-Raport', i:'file-bar-chart', c:'#059669', u:'raport.html'},
        {n:'Maps', i:'map', c:'#ea580c', u:'wilayah.html'},
        {n:'E-Agenda', i:'calendar', c:'#7c3aed', m:'agendaModal'},
        {n:'Lapor', i:'megaphone', c:'#db2777', ext:'https://www.lapor.go.id/'},
        {n:'Smopi', i:'waves', c:'#dc2625', ext:'https://smopi.info/'},
        {n:'LAPKIN', i:'layout-dashboard', c:'#10b981', m:'lapkinModal'}
    ];
    
    container.innerHTML = fullMenu.map(item => `
        <div class="tool-card" onclick="${item.u ? `location.href='${item.u}'` : item.ext ? `window.open('${item.ext}','_blank')` : `openModal('${item.m}')`}">
            <div class="tool-icon-box" style="background:${item.c}"><i data-lucide="${item.i}"></i></div>
            <div class="tool-name">${sanitizeHTML(item.n)}</div>
        </div>
    `).join('');
    
    renderLapkinPortal();
    lucide.createIcons();
}

// RENDER LAPKIN MODAL
function renderLapkinPortal() {
    const container = document.getElementById('lapkinContainer');
    const dbTools = (appData.tools || []).filter(t => {
        const name = t.Nama || t.nama || t['Nama Tool'] || t['nama tool'];
        return name && String(name).toLowerCase().trim() !== 'nama';
    }).map(t => ({
        n: t.Nama || t.nama || t['Nama Tool'] || t['nama tool'] || 'Tanpa Nama',
        i: t.Icon || t.icon || 'external-link',
        c: t.Warna || t.warna || '#333',
        l: t.Link_URL || t.link_url || t.URL || t.url || '#'
    }));

    if(dbTools.length === 0) { 
        container.innerHTML = `
            <div style="text-align:center; opacity:0.5; grid-column:1/-1; padding:30px;">
                <i data-lucide="database" size="32" style="margin-bottom:10px; opacity:0.5;"></i>
                <p>Belum ada data di sheet <b>TOOLS</b>.<br>
                Pastikan header kolom: <b>Icon, Nama, Warna, Link_URL</b></p>
            </div>`; 
        lucide.createIcons();
        return; 
    }

    container.innerHTML = dbTools.map(item => `
        <div class="lapkin-card" onclick="window.open('${item.l}','_blank')">
            <div class="icon-box" style="background:${item.c}"><i data-lucide="${item.i}"></i></div>
            <span>${sanitizeHTML(item.n)}</span>
        </div>
    `).join('');
    lucide.createIcons();
}

// AGENDA FORM LOGIC
function populateAgendaDropdown() {
    const s = document.getElementById('agnNama');
    if(!s) return;
    s.innerHTML = '<option value="" disabled selected>-- Pilih Personel --</option>';
    [...(appData.pegawai || []), ...(appData.korlap || [])].forEach(p => {
        const name = sanitizeHTML(p.nama || p.Nama);
        const id = p.id || p.ID;
        s.insertAdjacentHTML('beforeend', `<option value="${id}">${name}</option>`);
    });
}

function updateAgendaFields() {
    const id = document.getElementById('agnNama').value;
    const p = [...(appData.pegawai || []), ...(appData.korlap || [])].find(x => String(x.id || x.ID) === String(id));
    if(p) document.getElementById('agnJabatan').value = sanitizeHTML(p.jabatan || p.Jabatan || "Staff Operasional");
}

async function submitAgendaAction() {
    const btn = document.getElementById('btnSendAgenda');
    const id = document.getElementById('agnNama').value;
    const judul = document.getElementById('agnJudul').value;
    
    if(!id || !judul) return alert("Harap lengkapi Nama dan Judul Agenda!");

    const p = [...(appData.pegawai || []), ...(appData.korlap || [])].find(x => String(x.id || x.ID) === String(id));
    const payload = {
        action: 'submitAgenda', 
        idPegawai: id, 
        nama: p ? (p.nama || p.Nama) : '',
        jabatan: document.getElementById('agnJabatan').value,
        tanggal: document.getElementById('agnTanggal').value,
        jamDatang: document.getElementById('agnDatang').value,
        jamPulang: document.getElementById('agnPulang').value,
        agenda: judul,
        keterangan: document.getElementById('agnKet').value,
        foto: null 
    };

    const originalBtnText = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i data-lucide="loader-2" class="spin" size="18"></i> MENGIRIM...';
    lucide.createIcons();

    const fileInput = document.getElementById('agnFoto');
    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            payload.foto = e.target.result;
            await sendAgendaRequest(payload, btn, originalBtnText);
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        await sendAgendaRequest(payload, btn, originalBtnText);
    }
}

async function sendAgendaRequest(payload, btn, originalBtnText) {
    try {
        const r = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        const d = await r.json();
        if(d.status === 'success') { 
            alert("Agenda berhasil terkirim!"); 
            closeModal('agendaModal'); 
            document.getElementById('agnNama').selectedIndex = 0;
            document.getElementById('agnJabatan').value = '';
            document.getElementById('agnTanggal').value = '';
            document.getElementById('agnDatang').value = '';
            document.getElementById('agnPulang').value = '';
            document.getElementById('agnJudul').value = '';
            document.getElementById('agnKet').value = '';
            document.getElementById('agnFoto').value = '';
        } else { 
            alert("Gagal mengirim: " + d.message); 
        }
    } catch(e) { 
        alert("Terjadi kesalahan jaringan."); 
    } finally {
        btn.disabled = false; 
        btn.innerHTML = originalBtnText; 
        lucide.createIcons();
    }
}

// VOICE TO TEXT
function startMic(tid, btn) {
    const S = window.SpeechRecognition || window.webkitSpeechRecognition; 
    if(!S) return alert("Browser Anda tidak mendukung fitur suara.");
    const r = new S(); r.lang = 'id-ID';
    r.onstart = () => btn.classList.add('active');
    r.onresult = (e) => { 
        const txt = e.results[0][0].transcript; 
        const el = document.getElementById(tid); 
        el.value = (el.value ? el.value + ' ' : '') + txt;
    };
    r.onend = () => btn.classList.remove('active'); r.start();
}

// MODAL CONTROLS
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
