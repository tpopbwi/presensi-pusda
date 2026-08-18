// ============================================================
// APP.JS - v2.1 (OPTIMIZED + PENGECATAN INTEGRATED)
// Integrated Management System - UPT PUSDA WS Bondoyudo Baru
// ============================================================

// ============================================================
// 1. KONFIGURASI GLOBAL
// ============================================================
const GITHUB_LOGO_URL = "https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec";

let appData = {
    pegawai: [],
    korlap: [],
    tools: [],
    config: {}
};
let slideIdx = 0;

// ============================================================
// 2. PWA MANIFEST (Data URI - Runtime Generated)
// ============================================================
try {
    const manifest = {
        name: "E-PUSDA UPT Management",
        short_name: "E-PUSDA",
        start_url: "index.html",
        scope: "./",
        display: "standalone",
        background_color: "#0d1b3e",
        theme_color: "#1e40af",
        orientation: "any",
        icons: [
            { src: GITHUB_LOGO_URL, sizes: "192x192", type: "image/png" },
            { src: GITHUB_LOGO_URL, sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
    };
    const uri = 'data:application/manifest+json;base64,' + btoa(unescape(encodeURIComponent(JSON.stringify(manifest))));
    const el = document.getElementById('pwaManifest');
    if (el) {
        el.setAttribute('href', uri);
    } else {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = uri;
        document.head.appendChild(link);
    }
} catch (e) {
    console.warn('Manifest init failed:', e);
}

// ============================================================
// 3. UTILITIES
// ============================================================

/**
 * Fetch dengan timeout otomatis (AbortController)
 */
function fetchWithTimeout(url, opts = {}, timeout = 15000) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => {
        ctrl.abort(new DOMException('Timeout after ' + timeout + 'ms', 'AbortError'));
    }, timeout);
    return fetch(url, { ...opts, signal: ctrl.signal })
        .finally(() => clearTimeout(tid));
}

/**
 * Sanitize HTML untuk mencegah XSS
 */
function sanitizeHTML(s) {
    if (s == null) return "";
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

/**
 * Format tanggal ke format Indonesia
 */
function formatTanggal(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

// ============================================================
// 4. SPLASH SCREEN
// ============================================================
function hideSplashScreen() {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 1000);
}

// ============================================================
// 5. TOAST NOTIFICATIONS
// ============================================================

/**
 * Toast error (merah, bottom center)
 */
function showToastError(title, msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
        background: rgba(239, 68, 68, 0.95); color: white; padding: 14px 24px;
        border-radius: 16px; font-size: 0.85rem; font-weight: 700; z-index: 99999;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); max-width: 90%; text-align: center;
        animation: slideUp 0.3s ease-out;
    `;
    toast.innerHTML = `
        <strong>${sanitizeHTML(title)}</strong><br>
        <span style="opacity: 0.85; font-weight: 500; font-size: 0.75rem;">${sanitizeHTML(msg)}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 5000);
}

/**
 * Toast success (hijau, top right)
 */
function showToastSuccess(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 99999;
        background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(15px);
        color: white; padding: 14px 20px; border-radius: 14px;
        border-left: 4px solid #10b981; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        font-size: 0.9rem; font-weight: 600; pointer-events: auto;
        animation: slideInRight 0.3s ease-out;
    `;
    toast.innerHTML = `
        <div style="font-weight: 800; text-transform: uppercase; font-size: 0.7rem;
            color: #10b981; margin-bottom: 4px; letter-spacing: 1px;">SUCCESS</div>
        <div>${sanitizeHTML(message)}</div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ============================================================
// 6. CACHE HELPER
// ============================================================
function loadFromCache() {
    try {
        const cached = localStorage.getItem('dashboard_cache_v1');
        if (cached) {
            appData = JSON.parse(cached);
            return true;
        }
    } catch (e) {
        console.warn('Cache bermasalah:', e);
    }
    return false;
}

function saveToCache() {
    try {
        localStorage.setItem('dashboard_cache_v1', JSON.stringify(appData));
    } catch (e) {
        console.warn('Cache save failed:', e);
    }
}

// ============================================================
// 7. APP INITIALIZATION (CACHE-FIRST STRATEGY)
// ============================================================
window.onload = () => {
    lucide.createIcons();

    const hasCache = loadFromCache();

    if (hasCache) {
        // Mode hangat: render dari cache, lalu background refresh
        initAppUI();
        hideSplashScreen();
        fetchBackgroundData();
    } else {
        // Mode dingin: fetch dari server
        fetchInitialData();
    }

    // Update jam setiap detik
    setInterval(() => {
        const clock = document.getElementById('liveClock');
        if (clock) {
            clock.innerText = new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }, 1000);

    // Safety net: force hide splash jika stuck > 12 detik
    setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay && overlay.style.display !== 'none' && overlay.style.opacity !== '0') {
            console.warn('Safety net: Force hide splash');
            hideSplashScreen();
        }
    }, 12000);

    // Setup tombol upload file custom (Agenda modal)
    setupFileUploadListener();
};

/**
 * Setup listener untuk upload file di modal agenda
 */
function setupFileUploadListener() {
    const input = document.getElementById('agnFoto');
    if (input) {
        input.addEventListener('change', function () {
            const fileName = this.files[0] ? this.files[0].name : 'Pilih atau Jatuhkan File di Sini';
            const fileText = document.getElementById('fileUploadText');
            if (fileText) fileText.innerText = fileName;
        });
    }
}

// ============================================================
// 8. UI INITIALIZATION
// ============================================================
function initAppUI() {
    updateLogos();
    renderMainDashboard();
    populateAgendaDropdown();
    startHeroSlide();
}

function updateLogos() {
    const logo = appData.config?.Logo || GITHUB_LOGO_URL;
    const sidebarLogo = document.getElementById('sidebarLogo');
    const splashLogo = document.getElementById('splashBgLogo');
    if (sidebarLogo) sidebarLogo.src = logo;
    if (splashLogo) splashLogo.src = logo;
}

// ============================================================
// 9. DATA FETCHING
// ============================================================

/**
 * Fetch data awal (dengan retry)
 */
async function fetchInitialData(attempt = 1) {
    const maxRetries = 2;
    const timeout = attempt === 1 ? 15000 : 20000;

    try {
        const res = await fetchWithTimeout(
            SCRIPT_URL + '?action=getDashboardData',
            { redirect: 'follow', cache: 'no-cache' },
            timeout
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const txt = await res.text();
        if (!txt || !txt.trim() || txt.trim().startsWith('<!DOCTYPE') || txt.trim().startsWith('<html')) {
            throw new Error('Server error - invalid response');
        }

        appData = JSON.parse(txt);
        if (typeof appData !== 'object' || !appData) {
            appData = { pegawai: [], korlap: [], tools: [], config: {} };
        }

        saveToCache();
        initAppUI();
    } catch (err) {
        const isAbort = err?.name === 'AbortError' || err?.message?.includes('Timeout');

        if (isAbort && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000));
            return fetchInitialData(attempt + 1);
        }

        appData = { pegawai: [], korlap: [], tools: [], config: {} };
        updateLogos();
        renderMainDashboard();
        populateAgendaDropdown();

        if (!isAbort) {
            showToastError('Koneksi Terputus', 'Gagal memuat data. Mode offline aktif.');
        }
    } finally {
        setTimeout(() => hideSplashScreen(), 800);
    }
}

/**
 * Background refresh (silent) - tanpa splash
 */
async function fetchBackgroundData() {
    try {
        const res = await fetchWithTimeout(
            SCRIPT_URL + '?action=getDashboardData',
            { redirect: 'follow', cache: 'no-cache' },
            12000
        );
        if (!res.ok) return;

        const txt = await res.text();
        if (!txt || txt.trim().startsWith('<!DOCTYPE')) return;

        const newData = JSON.parse(txt);
        if (typeof newData === 'object' && newData) {
            appData = newData;
            saveToCache();
            initAppUI();
        }
    } catch (e) {
        console.warn('Background update gagal, memakai cache lama');
    }
}

// ============================================================
// 10. HERO SLIDER (Auto Slide dari Kanan)
// ============================================================
function startHeroSlide() {
    if (!appData.korlap || !appData.korlap.length) return;
    const img = document.getElementById('heroImage');
    if (!img) return;

    const loadNext = () => {
        const p = appData.korlap[slideIdx % appData.korlap.length];
        const u = p.link_foto_profile || p.Link_Foto_Profile;
        const nextSrc = (u && u.includes('googleusercontent.com'))
            ? u.split('=')[0] + '=s500'
            : GITHUB_LOGO_URL;

        const tempImg = new Image();
        tempImg.onload = () => {
            img.classList.remove('slide-in-right');
            void img.offsetWidth; // Force reflow
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

// ============================================================
// 11. RENDER MAIN DASHBOARD (🆕 UPDATED: Pengecatan + Badge)
// ============================================================
// ============ RENDER MAIN DASHBOARD (🆕 Support logo image) ============
function renderMainDashboard() {
    const container = document.getElementById('mainTools');
    if (!container) return;

    // 🆕 Item SuKMa-e ditambahkan di paling akhir
    const menu = [
        { n: 'E-Presensi',  i: 'fingerprint',      c: '#2563eb', u: 'presensi.html' },
        { n: 'E-Raport',    i: 'file-bar-chart',   c: '#059669', u: 'raport.html' },
        { n: 'Maps',        i: 'map',              c: '#ea580c', u: 'wilayah.html' },
        { n: 'Pengecatan',  i: 'paintbrush',       c: '#f97316', u: 'pengecatan.html', badge: 'NEW' },
        { n: 'E-Agenda',    i: 'calendar',         c: '#7c3aed', m: 'agendaModal' },
        { n: 'Lapor',       i: 'megaphone',        c: '#db2777', ext: 'https://www.lapor.go.id/' },
        { n: 'Smopi',       i: 'waves',            c: '#dc2625', ext: 'https://smopi.info/' },
        { n: 'LAPKIN',      i: 'layout-dashboard', c: '#10b981', m: 'lapkinModal' },
        // 🆕 TAMBAHAN: SuKMa-e Jatim (logo image, bukan Lucide icon)
        {
            n: 'SuKMa-e',
            logo: 'https://sukma.jatimprov.go.id/landing/img/logo/f-logo.png',
            c: '#1e40af',
            ext: 'https://sukma.jatimprov.go.id/home',
            title: 'Survei Kepuasan Masyarakat Jatim'
        }
    ];

    container.innerHTML = menu.map(item => {
        // Determine action (internal link / external link / modal)
        let action;
        if (item.u)        action = `location.href='${item.u}'`;
        else if (item.ext) action = `window.open('${item.ext}','_blank')`;
        else               action = `openModal('${item.m}')`;

        // 🆕 Support icon Lucide ATAU logo image
        let iconHTML;
        if (item.logo) {
            iconHTML = `<img src="${sanitizeHTML(item.logo)}" class="tool-logo-img" alt="${sanitizeHTML(item.n)}">`;
        } else {
            iconHTML = `<i data-lucide="${item.i}"></i>`;
        }

        // Badge HTML (hanya jika properti badge ada)
        const badgeHTML = item.badge
            ? `<span class="tool-badge-new">${sanitizeHTML(item.badge)}</span>`
            : '';

        // Tooltip dari title
        const titleAttr = item.title ? `title="${sanitizeHTML(item.title)}"` : '';

        // Class tambahan untuk tile yang di-highlight
        const extraClass = item.badge ? 'tool-card-highlight' : '';

        return `
            <div class="tool-card ${extraClass}" onclick="${action}" ${titleAttr} role="button" tabindex="0">
                ${badgeHTML}
                <div class="tool-icon-box" style="background:${item.c}">
                    ${iconHTML}
                </div>
                <div class="tool-name">${sanitizeHTML(item.n)}</div>
            </div>
        `;
    }).join('');

    renderLapkinPortal();
    lucide.createIcons();

    // Enable keyboard navigation (Enter/Space untuk click)
    container.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });
}

// ============================================================
// 12. LAPKIN PORTAL
// ============================================================
function renderLapkinPortal() {
    const container = document.getElementById('lapkinContainer');
    if (!container) return;

    const tools = (appData.tools || [])
        .filter(t => {
            const name = t.Nama || t.nama || t['Nama Tool'] || t['nama tool'];
            return name && String(name).toLowerCase().trim() !== 'nama';
        })
        .map(t => ({
            n: t.Nama || t.nama || t['Nama Tool'] || 'Tanpa Nama',
            i: t.Icon || t.icon || 'external-link',
            c: t.Warna || t.warna || '#333',
            l: t.Link_URL || t.link_url || '#'
        }));

    if (!tools.length) {
        container.innerHTML = `
            <div style="text-align: center; opacity: 0.5; grid-column: 1/-1; padding: 30px;">
                <i data-lucide="database" size="32" style="margin-bottom: 10px; opacity: 0.5;"></i>
                <p>Belum ada data di sheet <b>TOOLS</b>.<br>
                Header: <b>Icon, Nama, Warna, Link_URL</b></p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = tools.map(tool => `
        <div class="lapkin-card" onclick="window.open('${tool.l}', '_blank')" role="button" tabindex="0">
            <div class="icon-box" style="background: ${tool.c}">
                <i data-lucide="${tool.i}"></i>
            </div>
            <span>${sanitizeHTML(tool.n)}</span>
        </div>
    `).join('');

    lucide.createIcons();
}

// ============================================================
// 13. E-AGENDA LOGIC
// ============================================================

/**
 * Populate dropdown nama personel
 */
function populateAgendaDropdown() {
    const select = document.getElementById('agnNama');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>-- Pilih Personel --</option>';

    const allStaff = [...(appData.pegawai || []), ...(appData.korlap || [])];
    allStaff.forEach(person => {
        const id = person.id || person.ID;
        const name = person.nama || person.Nama;
        select.insertAdjacentHTML('beforeend',
            `<option value="${id}">${sanitizeHTML(name)}</option>`
        );
    });
}

/**
 * Update field jabatan saat nama dipilih
 */
function updateAgendaFields() {
    const id = document.getElementById('agnNama').value;
    const allStaff = [...(appData.pegawai || []), ...(appData.korlap || [])];
    const person = allStaff.find(p => String(p.id || p.ID) === String(id));

    if (person) {
        const jabatan = person.jabatan || person.Jabatan || "Staff Operasional";
        document.getElementById('agnJabatan').value = sanitizeHTML(jabatan);
    }
}

/**
 * Submit agenda ke backend
 */
async function submitAgendaAction() {
    const btn = document.getElementById('btnSendAgenda');
    const id = document.getElementById('agnNama').value;
    const judul = document.getElementById('agnJudul').value;

    // Validasi
    if (!id || !judul) {
        alert("⚠️ Harap lengkapi Nama dan Judul Agenda!");
        return;
    }

    // Cari data personel
    const allStaff = [...(appData.pegawai || []), ...(appData.korlap || [])];
    const person = allStaff.find(p => String(p.id || p.ID) === String(id));

    // Build payload
    const payload = {
        action: 'submitAgenda',
        idPegawai: id,
        nama: person ? (person.nama || person.Nama) : '',
        jabatan: document.getElementById('agnJabatan').value,
        tanggal: document.getElementById('agnTanggal').value,
        jamDatang: document.getElementById('agnDatang').value,
        jamPulang: document.getElementById('agnPulang').value,
        agenda: judul,
        keterangan: document.getElementById('agnKet').value,
        foto: null
    };

    // Show loading state
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin" size="18"></i> MENGIRIM...';
    lucide.createIcons();

    // Handle foto
    const fileInput = document.getElementById('agnFoto');
    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            payload.foto = e.target.result;
            await sendAgenda(payload, btn, originalHTML);
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        await sendAgenda(payload, btn, originalHTML);
    }
}

/**
 * Kirim payload agenda ke server
 */
async function sendAgenda(payload, btn, originalHTML) {
    try {
        const response = await fetchWithTimeout(
            SCRIPT_URL,
            { method: 'POST', body: JSON.stringify(payload) },
            20000
        );

        const txt = await response.text();
        let data;
        try {
            data = JSON.parse(txt);
        } catch (e) {
            throw new Error('Response invalid');
        }

        if (data.status === 'success') {
            showToastSuccess("✅ Agenda berhasil terkirim!");
            closeModal('agendaModal');
            resetAgendaForm();
        } else {
            alert("❌ Gagal: " + (data.message || 'Unknown error'));
        }
    } catch (e) {
        alert("⚠️ Error jaringan: " + (e.message || 'Timeout'));
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }
}

/**
 * Reset form agenda setelah submit
 */
function resetAgendaForm() {
    ['agnNama', 'agnJabatan', 'agnTanggal', 'agnDatang', 'agnPulang', 'agnJudul', 'agnKet', 'agnFoto']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

    const fileText = document.getElementById('fileUploadText');
    if (fileText) fileText.innerText = 'Pilih atau Jatuhkan File di Sini';

    const namaSelect = document.getElementById('agnNama');
    if (namaSelect) namaSelect.selectedIndex = 0;
}

// ============================================================
// 14. VOICE TO TEXT (Speech Recognition)
// ============================================================
function startMic(targetId, btn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("⚠️ Browser tidak mendukung fitur suara. Gunakan Chrome/Edge.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => btn.classList.add('active');
    recognition.onresult = (event) => {
        const target = document.getElementById(targetId);
        if (target) {
            const transcript = event.results[0][0].transcript;
            target.value = (target.value ? target.value + ' ' : '') + transcript;
        }
    };
    recognition.onend = () => btn.classList.remove('active');
    recognition.onerror = (event) => {
        btn.classList.remove('active');
        console.warn('Voice recognition error:', event.error);
    };

    recognition.start();
}

// ============================================================
// 15. MODAL CONTROLS
// ============================================================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// Close modal saat klik di luar konten
document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('modal-overlay')) {
        e.target.style.display = 'none';
        document.body.style.overflow = '';
    }
});

// Close modal dengan Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            if (modal.style.display === 'flex') {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }
});
