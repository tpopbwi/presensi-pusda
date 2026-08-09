:root {
    --primary: #1e40af; --bg-dark: #0d1b3e; --glass: rgba(15, 32, 77, 0.85); 
    --glass-border: rgba(255, 255, 255, 0.12); --accent: #f97316;
    --success: #10b981; --danger: #ef4444; --warning: #facc15;
    --pu-blue: #3b82f6; --sda-toska: #2dd4bf; --sidebar-width: 280px;
}

* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; -webkit-tap-highlight-color: transparent; }
html, body { width: 100%; min-height: 100vh; background: var(--bg-dark); overflow-x: hidden; color: #f8fafc; scroll-behavior: smooth; }
body { display: flex; position: relative; width: 100vw; }

.fixed-bg { position: fixed; inset: 0; z-index: -1; background: radial-gradient(circle at top right, #1e40af, #0d1b3e 85%), radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.3), transparent 70%); }

/* SIDEBAR */
.main-content { animation: fadeInUp 0.4s ease-out; }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

.sidebar { width: var(--sidebar-width); height: calc(100vh - 40px); position: fixed; top: 20px; left: 20px; background: rgba(15, 32, 77, 0.95); backdrop-filter: blur(25px); border: 1px solid var(--glass-border); border-radius: 24px; padding: 25px; display: flex; flex-direction: column; z-index: 100; box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid var(--glass-border); }
.brand img { height: 45px; border-radius: 8px; }
.nav-link { padding: 14px 18px; border-radius: 16px; display: flex; align-items: center; gap: 14px; color: rgba(255,255,255,0.6); text-decoration: none; transition: 0.3s; cursor: pointer; font-weight: 600; margin-bottom: 5px; }
.nav-link:hover { background: rgba(255,255,255,0.05); color: white; }
.nav-link.active { background: linear-gradient(135deg, var(--pu-blue), var(--primary)); color: white; box-shadow: 0 10px 20px rgba(30, 64, 175, 0.4); }
.sidebar-clock { margin-top: auto; padding: 20px; background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 22px; text-align: center; backdrop-filter: blur(10px); }
.sidebar-clock p { font-size: 0.6rem; font-weight: 800; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
.sidebar-clock h2 { font-family: 'JetBrains Mono', monospace; font-size: 1.8rem; font-weight: 800; color: var(--sda-toska); }

/* MAIN CONTENT (PADDING SENADA) */
.main-content { flex: 1; margin-left: calc(var(--sidebar-width) + 40px); padding: 30px 40px 120px 20px; min-height: 100vh; display: flex; flex-direction: column; width: calc(100% - var(--sidebar-width) - 40px); }
.dashboard-container { width: 100%; display: flex; flex-direction: column; }
.page-header { margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 20px; }
.page-header h1 { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 800; letter-spacing: -2px; line-height: 1; background: linear-gradient(135deg, #fff, var(--sda-toska)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

/* FILTERS (PADDING MINIM) */
.filter-card { background: var(--glass); border: 1px solid var(--glass-border); border-radius: 28px; padding: 20px 25px; margin-bottom: 30px; display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end; backdrop-filter: blur(30px); }
.filter-group { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 180px; }
.filter-label { font-size: 0.65rem; font-weight: 800; color: var(--sda-toska); text-transform: uppercase; letter-spacing: 2px; }
input, select { background: rgba(0,0,0,0.4); border: 1px solid var(--glass-border); padding: 14px 18px; border-radius: 16px; color: white; outline: none; font-weight: 600; width: 100%; transition: 0.3s; }
input:focus, select:focus { border-color: var(--sda-toska); box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.1); }

/* BUTTONS */
.btn-pro { padding: 14px 25px; border-radius: 16px; border: none; font-weight: 800; cursor: pointer; transition: 0.3s; text-transform: uppercase; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; }
.btn-pro:hover { transform: translateY(-2px); }
.btn-update { background: var(--accent); color: white; box-shadow: 0 10px 25px rgba(249, 115, 22, 0.4); }
.btn-print { background: var(--success); color: white; box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3); }

/* RAPORT GRID & CARDS (GAP DIPERSEMPIT) */
.raport-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; width: 100%; }
.pegawai-card { background: white; border-radius: 28px; overflow: hidden; display: flex; flex-direction: column; transition: 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); box-shadow: 0 20px 40px rgba(0,0,0,0.4); border: 1px solid var(--glass-border); content-visibility: auto; contain-intrinsic-size: 1px 500px; }
.pegawai-card:hover { transform: translateY(-10px); box-shadow: 0 30px 60px rgba(0,0,0,0.5); }

.card-top { background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 25px 20px 20px 20px; display: flex; align-items: center; gap: 18px; color: white; position: relative; border-bottom: 5px solid var(--sda-toska); }
.photo-frame-pro { width: 80px; height: 110px; flex-shrink: 0; display: flex; align-items: flex-end; justify-content: center; overflow: visible; position: relative; }
.photo-frame-pro img { width: 130%; height: auto; max-height: 135px; object-fit: contain; filter: drop-shadow(0 10px 8px rgba(0,0,0,0.4)) drop-shadow(0 20px 20px rgba(0,0,0,0.6)); transform: translateY(2px) scale(1.1); transition: 0.3s ease; }
.pegawai-card:hover .photo-frame-pro img { transform: translateY(-2px) scale(1.15); }
.id-group h3 { font-size: 1.05rem; font-weight: 800; text-transform: uppercase; line-height: 1.2; letter-spacing: -0.5px; }
.id-group p { font-size: 0.65rem; font-weight: 700; opacity: 0.8; text-transform: uppercase; margin-top: 4px; }
.grade-badge { position: absolute; right: 20px; top: 20px; width: 45px; height: 45px; background: rgba(0,0,0,0.25); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 900; border: 2px solid white; font-size: 1.3rem; backdrop-filter: blur(5px); }

.card-body { background: white; padding: 25px 20px; color: #1e293b; display: flex; flex-direction: column; align-items: center; gap: 20px; }
.performance-main { text-align: center; width: 100%; }
.performance-main span { display: block; font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; }
.performance-main b { display: block; font-family: 'JetBrains Mono', monospace; font-size: 3.5rem; font-weight: 800; color: #1e40af; line-height: 1; margin: 8px 0; }
.progress-track { width: 100%; height: 12px; background: #f1f5f9; border-radius: 15px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 15px; transition: 0.4s ease-out; }

.stats-summary { display: grid; grid-template-columns: repeat(4, 1fr); width: 100%; gap: 10px; }
.stat-pill { text-align: center; padding: 15px 5px; border-radius: 18px; border: 1.5px solid #f1f5f9; transition: 0.3s; background: #f8fafc; }
.stat-pill b { display: block; font-size: 1.3rem; font-weight: 800; margin-bottom: 2px; }
.stat-pill span { font-size: 0.55rem; font-weight: 800; text-transform: uppercase; color: #94a3b8; }
.stat-hadir { border-color: var(--success); background: rgba(16, 185, 129, 0.08); } .stat-hadir b { color: var(--success); }
.stat-telat { border-color: var(--warning); background: rgba(234, 179, 8, 0.08); } .stat-telat b { color: var(--warning); }
.stat-alpha { border-color: var(--danger); background: rgba(239, 68, 68, 0.08); } .stat-alpha b { color: var(--danger); }
.stat-sid { border-color: var(--pu-blue); background: rgba(59, 130, 246, 0.08); } .stat-sid b { color: var(--pu-blue); }

.detail-toggle-btn { width: 100%; padding: 14px; border: none; background: #f8fafc; color: var(--pu-blue); font-weight: 800; font-size: 0.65rem; text-transform: uppercase; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border-top: 1px solid #f1f5f9; transition: 0.2s; }
.detail-toggle-btn:hover { background: #f1f5f9; }

.hidden-calendar-panel { max-height: 0; overflow: hidden; transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1); background: #ffffff; padding: 0 20px; }
.hidden-calendar-panel.active { max-height: 800px; padding: 0 20px 20px 20px; }

/* CALENDAR */
.calendar-wrapper { padding-top: 15px; border-top: 1px dashed #f1f5f9; }
.calendar-header { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 6px; }
.calendar-header div { text-align: center; font-size: 0.6rem; font-weight: 800; color: #64748b; text-transform: uppercase; }
.calendar-micro-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; width: 100%; }

.day-box { aspect-ratio: 1/1; border-radius: 8px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: #94a3b8; border: 1px solid transparent; transition: 0.2s; cursor: pointer; position: relative; }
.day-box:hover { transform: scale(1.1); z-index: 10; }
.day-box.weekend { background: #e2e8f0; color: #cbd5e1; }
.day-box.libur { background: #fef3c7; color: #d97706; }

.day-tooltip { display: none; position: absolute; bottom: 110%; left: 50%; transform: translateX(-50%); background: #1e293b; color: white; padding: 8px 12px; border-radius: 8px; font-size: 0.65rem; white-space: nowrap; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.3); pointer-events: none; }
.day-tooltip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: #1e293b; }
.day-box:hover .day-tooltip { display: block; }
.tooltip-status { font-weight: 800; margin-bottom: 2px; }
.tooltip-nilai { color: var(--sda-toska); }
.tooltip-ket { color: #94a3b8; font-style: italic; }

.empty-state { grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.03); border-radius: 35px; border: 1px dashed var(--glass-border); }
.empty-state i { color: var(--sda-toska); opacity: 0.5; margin-bottom: 15px; }
.empty-state h3 { font-size: 1.2rem; margin-bottom: 8px; color: white; }
.empty-state p { opacity: 0.6; font-size: 0.9rem; }

/* LOADING OVERLAY */
.loading-overlay { position: fixed; inset: 0; background: rgba(13, 27, 62, 0.95); backdrop-filter: blur(10px); z-index: 9999; display: none; flex-direction: column; align-items: center; justify-content: center; color: white; }
.loading-overlay.active { display: flex; }
.loader-ring { width: 60px; height: 60px; border: 4px solid rgba(255,255,255,0.1); border-top-color: var(--sda-toska); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* BOTTOM NAV (SENADA) */
.bottom-nav { display: none; position: fixed; bottom: 12px; left: 10px; right: 10px; height: 70px; background: rgba(15, 23, 42, 0.97); border: 1px solid var(--glass-border); border-radius: 30px; z-index: 1000; justify-content: space-around; align-items: center; backdrop-filter: blur(25px); box-shadow: 0 25px 50px rgba(0,0,0,0.8); }
.b-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: rgba(255,255,255,0.4); text-decoration: none; font-size: 0.6rem; font-weight: 700; width: 55px; }
.b-nav-item.active { color: var(--sda-toska) !important; }
.b-nav-fab { width: 58px; height: 58px; background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-top: -50px; border: 4px solid #050a18; color: white; box-shadow: 0 10px 25px rgba(249,115,22,0.6); }

/* PRINT AREA */
#printArea { position: absolute; top: -9999px; left: -9999px; visibility: hidden; width: 210mm; }
@media print {
    @page { size: 215mm 330mm; margin: 15mm; }
    body { background: white !important; color: black !important; }
    .sidebar, .filter-card, .fixed-bg, .main-content, .bottom-nav, .detail-toggle-btn, .loading-overlay { display: none !important; }
    #printArea { position: static !important; visibility: visible !important; display: block !important; width: 100% !important; padding: 0 !important; }
    .kop-header { display: flex !important; align-items: center !important; border-bottom: 3pt double #000 !important; padding-bottom: 15px !important; margin-bottom: 30px !important; }
    .kop-logo { height: 90px !important; margin-right: 25px !important; }
    .kop-text { text-align: center; flex: 1; }
    .kop-text h1 { font-size: 16pt !important; margin: 0 !important; font-weight: 900 !important; color: black !important; -webkit-text-fill-color: black !important; }
    .kop-text h2 { font-size: 13pt !important; margin: 4pt 0 !important; font-weight: 800 !important; color: black !important; }
    .kop-text .sub-kop { font-size: 11pt !important; font-weight: 800 !important; border-top: 1.5pt solid #000 !important; display: inline-block !important; padding-top: 6px !important; margin-top: 10px !important; color: black !important; }
    .raport-grid { grid-template-columns: 1fr 1fr !important; gap: 20pt !important; display: grid !important; }
    .pegawai-card { break-inside: avoid !important; border: 1.5pt solid #000 !important; border-radius: 15pt !important; box-shadow: none !important; content-visibility: visible !important; background: white !important; }
    .card-top { background: #f1f5f9 !important; color: black !important; border-bottom: 2pt solid #000 !important; -webkit-print-color-adjust: exact; }
    .grade-badge { border: 2pt solid #000 !important; color: black !important; background: white !important; }
    .hidden-calendar-panel { max-height: none !important; padding: 0 15pt 15pt 15pt !important; display: block !important; }
    .day-box { border: 0.5pt solid #ccc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .stat-pill { border: 1pt solid #ccc !important; background: white !important; }
}

/* RESPONSIVE (PADDING MINIM MOBILE) */
@media (max-width: 768px) {
    .sidebar { display: none; }
    .main-content { margin-left: 0; width: 100%; padding: 12px 8px 110px 8px; }
    .page-header { flex-direction: column; align-items: flex-start; }
    .raport-grid { grid-template-columns: 1fr; }
    .bottom-nav { display: flex; }
    .filter-card { padding: 15px; gap: 10px; border-radius: 24px; }
}

/* PREMIUM SKELETON LOADING */
.skeleton-card { background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 28px; overflow: hidden; display: flex; flex-direction: column; }
.skel-top { background: rgba(15, 32, 77, 0.6); padding: 25px 20px; display: flex; align-items: flex-end; gap: 18px; border-bottom: 5px solid rgba(255,255,255,0.1); min-height: 140px; }
.skel-photo { width: 80px; height: 110px; border-radius: 12px; flex-shrink: 0; }
.skel-info { flex: 1; display: flex; flex-direction: column; gap: 10px; padding-bottom: 15px; }
.skel-line { height: 12px; border-radius: 6px; }
.skel-line.w-60 { width: 60%; }
.skel-line.w-40 { width: 40%; }
.skel-grade { width: 45px; height: 45px; border-radius: 14px; flex-shrink: 0; margin-bottom: 15px; }
.skel-body { padding: 25px 20px; display: flex; flex-direction: column; align-items: center; gap: 20px; background: rgba(255,255,255,0.02); }
.skel-score { width: 120px; height: 40px; border-radius: 8px; margin-bottom: 10px; }
.skel-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; }
.skel-stat-pill { height: 50px; border-radius: 18px; }

.shimmer { background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%); background-size: 200% 100%; animation: shimmer-animation 1.5s infinite linear; }
@keyframes shimmer-animation { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
