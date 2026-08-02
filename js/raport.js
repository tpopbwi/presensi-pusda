const GITHUB_LOGO_URL="https://raw.githubusercontent.com/tpopbwi/presensi-pusda/main/assets/logo.png",API_URL="https://script.google.com/macros/s/AKfycbx9QYwnT9Be3vv7wlg1WAcrR-8rxBUvEM4gsPieUj7r19S8eZc-QLKRfxtnxNHxlmSsEQ/exec",FALLBACK_IMAGE=GITHUB_LOGO_URL,logsMap=new Map,manifest={name:"E-PUSDA UPT Management",short_name:"E-PUSDA",start_url:"./",display:"standalone",background_color:"#0d1b3e",theme_color:"#1e40af",icons:[{src:GITHUB_LOGO_URL,sizes:"192x192",type:"image/png"},{src:GITHUB_LOGO_URL,sizes:"512x512",type:"image/png",purpose:"any maskable"}]};document.getElementById("pwaManifest").setAttribute("href","data:application/manifest+json,"+encodeURIComponent(JSON.stringify(manifest)));const imageObserver=new IntersectionObserver((e,t)=>{e.forEach(e=>{if(e.isIntersecting){let a=e.target;a.src=a.dataset.src,a.classList.remove("lazy-img"),t.unobserve(a)}})},{rootMargin:"100px"});function getLocalDateString(e){let t=e.getFullYear(),a=String(e.getMonth()+1).padStart(2,"0"),i=String(e.getDate()).padStart(2,"0");return`${t}-${a}-${i}`}function getSmartUrl(e){return e?e.includes("googleusercontent")?e.split("=")[0]+"=s500":e.includes("drive.google.com")?e.replace("/view","/preview"):e:FALLBACK_IMAGE}function initFilters(){let e=new Date,t=new Date(e.getFullYear(),e.getMonth(),1);document.getElementById("startD").value=getLocalDateString(t),document.getElementById("endD").value=getLocalDateString(e)}function toggleLoading(e){document.getElementById("loadingOverlay");let t=document.getElementById("raportGrid");if(e){let a="";for(let i=0;i<6;i++)a+=`
                <div class="skeleton-card">
                    <div class="skel-top">
                        <div class="skel-photo shimmer"></div>
                        <div class="skel-info">
                            <div class="skel-line w-60 shimmer"></div>
                            <div class="skel-line w-40 shimmer"></div>
                        </div>
                        <div class="skel-grade shimmer"></div>
                    </div>
                    <div class="skel-body">
                        <div class="skel-score shimmer"></div>
                        <div class="skel-stats">
                            <div class="skel-stat-pill shimmer"></div>
                            <div class="skel-stat-pill shimmer"></div>
                            <div class="skel-stat-pill shimmer"></div>
                            <div class="skel-stat-pill shimmer"></div>
                        </div>
                    </div>
                </div>
            `;t.innerHTML=a}}function buildReportUrl(){let e=document.getElementById("startD").value,t=document.getElementById("endD").value,a=document.getElementById("wilF").value,i=document.getElementById("searchName"),s=i?i.value.trim():"";return`${API_URL}?action=getReportData&start=${e}&end=${t}&region=${a}&detail=true&limit=9999&search=${encodeURIComponent(s)}`}async function initApp(){lucide.createIcons(),initFilters(),document.getElementById("printDate").innerText=new Date().toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}),setInterval(()=>{let e=document.getElementById("liveClock");e&&(e.innerText=new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}))},1e3),toggleLoading(!0),fetchReportDataInBackground(),fetchDashboardDataInBackground()}async function fetchReportDataInBackground(){try{let e=await fetch(buildReportUrl()),t=await e.text(),a;try{a=JSON.parse(t)}catch(i){console.error("Server mengembalikan HTML:",t),toggleLoading(!1);return}"success"===a.status?(renderCards(a.data),toggleLoading(!1)):(console.error("Error dari server:",a.message),alert("Error: "+a.message),renderCards([]),toggleLoading(!1))}catch(s){console.error("Gagal memuat laporan:",s),alert("Gagal memuat laporan: "+s.message),renderCards([]),toggleLoading(!1)}}async function fetchDashboardDataInBackground(){try{let e=await fetch(API_URL+"?action=getDashboardData"),t=await e.json();if("success"===t.status&&t.config?.Logo&&(document.getElementById("sidebarLogo").src=t.config.Logo,document.getElementById("printKopLogo").src=t.config.Logo),"success"===t.status){let a=document.getElementById("wilF"),i=Array.from(a.options).map(e=>e.value),s=[...new Set((t.pegawai||[]).map(e=>e.Wilayah||e.wilayah).filter(e=>e))];s.forEach(e=>{if(!i.includes(e)){let t=document.createElement("option");t.value=e,t.innerText=e,a.appendChild(t)}})}}catch(l){console.error("Gagal memuat dashboard background:",l)}}function triggerReportFetch(){toggleLoading(!0),fetchReportDataInBackground()}function buildCalendarHTML(e,t){let a=new Date(t),i=a.getFullYear(),s=a.getMonth(),l=new Date(i,s+1,0).getDate(),r=new Date(i,s,1),n=r.getDay();n=0===n?6:n-1;let d={};e.forEach(e=>{let t=new Date(e.date);d[t.getDate()]=e});let o='<div class="calendar-wrapper">';o+='<div class="calendar-header">',["Sen","Sel","Rab","Kam","Jum","Sab","Min"].forEach(e=>{o+=`<div>${e}</div>`}),o+="</div>",o+='<div class="calendar-micro-grid">';for(let c=0;c<n;c++)o+='<div class="day-box" style="visibility:hidden;"></div>';for(let g=1;g<=l;g++){let p=new Date(i,s,g),v=p.getDay(),m=0===v||6===v,u=d[g],h="",y="day-box",f="";if(u){let b=(u.status||"").toLowerCase().trim(),L=["hadir","terlambat","terlambat ringan","terlambat berat","izin","sakit","dinas","qr","qr hadir","qr pulang","pulang","quick response","lupa pulang"];if(u.score>0||L.includes(b)){h=`style="background:${u.color}; border-color:${u.color}; color:white;"`;let I=u.ket||u.keterangan||"-";f=`
                    <div class="day-tooltip">
                        <div class="tooltip-status">${u.status||"-"}</div>
                        <div class="tooltip-nilai">Nilai: ${u.score||0}</div>
                        <div class="tooltip-ket">${I}</div>
                    </div>
                `,!m||b.includes("qr")||b.includes("quick")||(y+=" weekend")}else m&&(y+=" weekend")}else m?y+=" weekend":(h='style="background:#fee2e2; color:#dc2626;"',f=`
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
        `,document.getElementById("printGrid").innerHTML="",lucide.createIcons();return}e.sort((e,t)=>t.score-e.score);let a=document.createDocumentFragment();document.getElementById("startD").value,e.forEach(e=>{let t=document.createElement("div");t.className="pegawai-card",t.dataset.pegawaiId=e.id||e.ID;let i=(e.stats?.telatRingan||0)+(e.stats?.telatBerat||0),s=(e.stats?.izin||0)+(e.stats?.sakit||0)+(e.stats?.dinas||0)+(e.stats?.qrHadir||0)+(e.stats?.qrPulang||0);e.logs&&e.logs.length>0&&logsMap.set(String(e.id||e.ID),e.logs),t.innerHTML=`
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
                    <div class="stat-pill stat-sid"><b>${s}</b><span>S/I/D/QR</span></div>
                </div>
            </div>
            <button class="detail-toggle-btn">
                <i data-lucide="chevron-down" size="14"></i> Detail Aktivitas Bulanan
            </button>
            <div class="hidden-calendar-panel"></div>
        `,a.appendChild(t)}),t.innerHTML="",t.appendChild(a),document.querySelectorAll(".lazy-img").forEach(e=>imageObserver.observe(e)),lucide.createIcons(),document.querySelectorAll(".detail-toggle-btn").forEach(e=>{e.addEventListener("click",function(){let e=this.closest(".pegawai-card"),t=e.dataset.pegawaiId;toggleDetail(this,e,t)})})}function toggleDetail(e,t,a){let i=t.querySelector(".hidden-calendar-panel"),s=i.classList.toggle("active");if(s){e.innerHTML='<i data-lucide="chevron-up" size="14"></i> Sembunyikan Aktivitas';let l=logsMap.get(String(a))||[],r=document.getElementById("startD").value;i.innerHTML=buildCalendarHTML(l,r)}else e.innerHTML='<i data-lucide="chevron-down" size="14"></i> Detail Aktivitas Bulanan';lucide.createIcons({node:e})}function openPDFGenerator(){let e=document.getElementById("startD").value,t=document.getElementById("endD").value,a=document.getElementById("wilF").value;window.open(`generate-pdf.html?start=${e}&end=${t}&region=${a}`,"_blank")}window.onbeforeprint=()=>{document.getElementById("printGrid").innerHTML=document.getElementById("raportGrid").innerHTML,lucide.createIcons()},window.onload=initApp;
