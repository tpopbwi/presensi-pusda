const GITHUB_LOGO_URL="https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png",API_URL="https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec",FALLBACK_IMAGE=GITHUB_LOGO_URL,logsMap=new Map,manifest={name:"E-PUSDA UPT Management",short_name:"E-PUSDA",start_url:"./",display:"standalone",background_color:"#0d1b3e",theme_color:"#1e40af",icons:[{src:GITHUB_LOGO_URL,sizes:"192x192",type:"image/png"},{src:GITHUB_LOGO_URL,sizes:"512x512",type:"image/png",purpose:"any maskable"}]};document.getElementById("pwaManifest").setAttribute("href","data:application/manifest+json,"+encodeURIComponent(JSON.stringify(manifest)));const imageObserver=new IntersectionObserver((e,t)=>{e.forEach(e=>{if(e.isIntersecting){let a=e.target;a.src=a.dataset.src,a.classList.remove("lazy-img"),t.unobserve(a)}})},{rootMargin:"100px"});function getLocalDateString(e){let t=e.getFullYear(),a=String(e.getMonth()+1).padStart(2,"0"),i=String(e.getDate()).padStart(2,"0");return`${t}-${a}-${i}`}function getSmartUrl(e){return e?e.includes("googleusercontent")?e.split("=")[0]+"=s500":e.includes("drive.google.com")?e.replace("/view","/preview"):e:FALLBACK_IMAGE}function initFilters(){let e=new Date,t=new Date(e.getFullYear(),e.getMonth(),1);document.getElementById("startD").value=getLocalDateString(t),document.getElementById("endD").value=getLocalDateString(e)}function toggleLoading(e){let t=document.getElementById("loadingOverlay");e?t.classList.add("active"):t.classList.remove("active")}function buildReportUrl(){let e=document.getElementById("startD").value,t=document.getElementById("endD").value,a=document.getElementById("wilF").value;return`${API_URL}?action=getReportData&start=${e}&end=${t}&region=${a}&detail=true`}async function initApp(){lucide.createIcons(),initFilters(),document.getElementById("printDate").innerText=new Date().toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}),setInterval(()=>{let e=document.getElementById("liveClock");e&&(e.innerText=new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}))},1e3);let e=localStorage.getItem("pusda_raport_cache"),t=!1;if(e)try{let a=JSON.parse(e);Date.now()-a.time<3e5&&(renderCards(a.data),t=!0,toggleLoading(!1))}catch(i){localStorage.removeItem("pusda_raport_cache")}t||toggleLoading(!0),fetchReportDataInBackground(),fetchDashboardDataInBackground()}async function fetchReportDataInBackground(){try{let e=await fetch(buildReportUrl()),t=await e.text(),a;try{a=JSON.parse(t)}catch(i){console.error("Server mengembalikan HTML:",t),localStorage.getItem("pusda_raport_cache")||toggleLoading(!1);return}"success"===a.status?(localStorage.setItem("pusda_raport_cache",JSON.stringify({time:Date.now(),data:a.data})),renderCards(a.data),toggleLoading(!1)):(console.error("Error dari server:",a.message),localStorage.getItem("pusda_raport_cache")||(alert("Error: "+a.message),renderCards([]),toggleLoading(!1)))}catch(r){console.error("Gagal memuat laporan:",r),localStorage.getItem("pusda_raport_cache")||(alert("Gagal memuat laporan: "+r.message),renderCards([]),toggleLoading(!1))}}async function fetchDashboardDataInBackground(){try{let e=await fetch(API_URL+"?action=getDashboardData"),t=await e.json();if("success"===t.status&&t.config?.Logo&&(document.getElementById("sidebarLogo").src=t.config.Logo,document.getElementById("printKopLogo").src=t.config.Logo),"success"===t.status){let a=document.getElementById("wilF"),i=Array.from(a.options).map(e=>e.value),r=[...new Set((t.pegawai||[]).map(e=>e.Wilayah||e.wilayah).filter(e=>e))];r.forEach(e=>{if(!i.includes(e)){let t=document.createElement("option");t.value=e,t.innerText=e,a.appendChild(t)}})}}catch(n){console.error("Gagal memuat dashboard background:",n)}}function triggerReportFetch(){toggleLoading(!0),fetchReportDataInBackground()}function buildCalendarHTML(e,t){let a=new Date(t),i=a.getFullYear(),r=a.getMonth(),n=new Date(i,r+1,0).getDate(),s=new Date(i,r,1),l=s.getDay();l=0===l?6:l-1;let d={};e.forEach(e=>{let t=new Date(e.date);d[t.getDate()]=e});let o='<div class="calendar-wrapper">';o+='<div class="calendar-header">',["Sen","Sel","Rab","Kam","Jum","Sab","Min"].forEach(e=>{o+=`<div>${e}</div>`}),o+="</div>",o+='<div class="calendar-micro-grid">';for(let c=0;c<l;c++)o+='<div class="day-box" style="visibility:hidden;"></div>';for(let g=1;g<=n;g++){let p=new Date(i,r,g),u=p.getDay(),v=0===u||6===u,m=d[g],h="",y="day-box",f="";if(m){let I=(m.status||"").toLowerCase().trim(),L=["hadir","terlambat","terlambat ringan","terlambat berat","izin","sakit","dinas","qr","qr hadir","qr pulang","pulang","quick response","lupa pulang"];if(m.score>0||L.includes(I)){h=`style="background:${m.color}; border-color:${m.color}; color:white;"`;let b=m.ket||m.keterangan||"-";f=`
                    <div class="day-tooltip">
                        <div class="tooltip-status">${m.status||"-"}</div>
                        <div class="tooltip-nilai">Nilai: ${m.score||0}</div>
                        <div class="tooltip-ket">${b}</div>
                    </div>
                `,!v||I.includes("qr")||I.includes("quick")||(y+=" weekend")}else v&&(y+=" weekend")}else v?y+=" weekend":(h='style="background:#fee2e2; color:#dc2626;"',f=`
                    <div class="day-tooltip">
                        <div class="tooltip-status">Alpha (Tidak Hadir)</div>
                        <div class="tooltip-nilai">Nilai: 0</div>
                    </div>
                `);o+=`<div class="${y}" ${h}>${String(g).padStart(2,"0")}${f}</div>`}return o+="</div></div>"}function renderCards(e){let t=document.getElementById("raportGrid");if(!e||0===e.length){t.innerHTML=`
            <div class="empty-state">
                <i data-lucide="file-x" size="48"></i>
                <h3>Tidak Ada Data Kinerja</h3>
                <p>Tidak ditemukan data presensi untuk periode dan wilayah yang dipilih.</p>
            </div>
        `,document.getElementById("printGrid").innerHTML="",lucide.createIcons();return}e.sort((e,t)=>t.score-e.score);let a=document.createDocumentFragment();document.getElementById("startD").value,e.forEach(e=>{let t=document.createElement("div");t.className="pegawai-card",t.dataset.pegawaiId=e.id||e.ID;let i=(e.stats?.telatRingan||0)+(e.stats?.telatBerat||0),r=(e.stats?.izin||0)+(e.stats?.sakit||0)+(e.stats?.dinas||0)+(e.stats?.qrHadir||0)+(e.stats?.qrPulang||0);e.logs&&e.logs.length>0&&logsMap.set(String(e.id||e.ID),e.logs),t.innerHTML=`
            <div class="card-top">
                <div class="photo-frame-pro">
                    <img data-src="${getSmartUrl(e.foto)}" class="lazy-img" src="${FALLBACK_IMAGE}" onerror="this.src='${FALLBACK_IMAGE}'">
                </div>
                <div class="id-group">
                    <h3>${e.nama||"N/A"}</h3>
                    <p>${e.jabatan||"N/A"}</p>
                    <p>${e.wilayah||"N/A"}</p>
                </div>
                <div class="grade-badge">${e.grade||"-"}</div>
            </div>
            <div class="card-body">
                <div class="performance-main">
                    <span>Kinerja Kumulatif</span>
                    <b>${e.score||0}</b>
                    <div class="progress-track">
                        <div class="progress-fill" style="width:${Math.min(e.score||0,100)}%; background:${(e.score||0)>=75?"var(--success)":(e.score||0)>=60?"var(--warning)":"var(--danger)"}"></div>
                    </div>
                </div>
                <div class="stats-summary">
                    <div class="stat-pill stat-hadir"><b>${e.stats?.hadir||0}</b><span>Hadir</span></div>
                    <div class="stat-pill stat-telat"><b>${i}</b><span>Telat</span></div>
                    <div class="stat-pill stat-alpha"><b>${e.stats?.alpha||0}</b><span>Alpha</span></div>
                    <div class="stat-pill stat-sid"><b>${r}</b><span>S/I/D/QR</span></div>
                </div>
            </div>
            <button class="detail-toggle-btn">
                <i data-lucide="chevron-down" size="14"></i> Detail Aktivitas Bulanan
            </button>
            <div class="hidden-calendar-panel"></div>
        `,a.appendChild(t)}),t.innerHTML="",t.appendChild(a),document.querySelectorAll(".lazy-img").forEach(e=>imageObserver.observe(e)),lucide.createIcons(),document.querySelectorAll(".detail-toggle-btn").forEach(e=>{e.addEventListener("click",function(){let e=this.closest(".pegawai-card"),t=e.dataset.pegawaiId;toggleDetail(this,e,t)})})}function toggleDetail(e,t,a){let i=t.querySelector(".hidden-calendar-panel"),r=i.classList.toggle("active");if(r){e.innerHTML='<i data-lucide="chevron-up" size="14"></i> Sembunyikan Aktivitas';let n=logsMap.get(String(a))||[],s=document.getElementById("startD").value;i.innerHTML=buildCalendarHTML(n,s)}else e.innerHTML='<i data-lucide="chevron-down" size="14"></i> Detail Aktivitas Bulanan';lucide.createIcons({node:e})}function openPDFGenerator(){let e=document.getElementById("startD").value,t=document.getElementById("endD").value,a=document.getElementById("wilF").value;window.open(`generate-pdf.html?start=${e}&end=${t}&region=${a}`,"_blank")}window.onbeforeprint=()=>{document.getElementById("printGrid").innerHTML=document.getElementById("raportGrid").innerHTML,lucide.createIcons()},window.onload=initApp;
