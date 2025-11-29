// sidepanel.js - BMKG Reader (Final Fixed Display)

let currentData = null; 
let activeMode = 'simple'; 
let activeChartType = 'suhu'; 
let chartPoints = []; 

// --- 1. FORMATTERS ---
const formatters = {
    clean: (val) => {
        if (val == null) return '-';
        let str = String(val);
        str = str.replace(/Kelembapan:|Kecepatan Angin:|Arah Angin dari:|Jarak Pandang:/yi, "");
        str = str.replace(/[^a-zA-Z0-9\s.,\-:%\u00B0\/<>(),]/g, "");
        return str.replace(/\s+/g, " ").trim();
    },
    suhu: (val) => {
        if (val == null || val === '-' || val === '') return '-';
        return String(val).replace(/[^0-9\u00B0\s-]/g, "").trim();
    },
    getNumber: (val) => {
        if (!val) return 0;
        const match = String(val).match(/[\d,.]+/); 
        return match ? parseFloat(match[0].replace(',', '.')) : 0;
    }
};

// --- 2. UI HELPERS ---
const show = (id) => { const el = document.getElementById(id); if(el) { el.classList.remove('hidden'); el.style.display = 'block'; } };
const hide = (id) => { const el = document.getElementById(id); if(el) { el.classList.add('hidden'); el.style.display = 'none'; } };

function resetUI() {
    const cont = document.getElementById('resultsContainer');
    if(cont) cont.innerHTML = '';
    
    // Sembunyikan elemen UI
    ['downloadJsonBtn','downloadCsvBtn','searchContainer','simpleHeader','detailHeader','chartContainer'].forEach(hide);
    
    if(document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    
    // Reset dropdown chart
    if(document.getElementById('chartType')) {
        document.getElementById('chartType').value = 'suhu';
        activeChartType = 'suhu';
    }

    updateStatus("Pilih mode lalu klik tombol.", false);
}

// --- 3. EVENT LISTENERS ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeMode = e.target.dataset.mode;
        document.getElementById('scrapeBtn').innerText = `Ambil Data (${activeMode === 'simple' ? 'Sederhana' : 'Detail'})`;
        resetUI();
    });
});

document.getElementById('chartType')?.addEventListener('change', (e) => {
    activeChartType = e.target.value;
    if (currentData && activeMode === 'detail') safeRenderChart(currentData.hasil);
});

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    if (currentData) renderResults(currentData, (e.target.value || '').toLowerCase());
});

// --- 4. MAIN SCRAPE LOGIC ---
document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    if (!tab || !tab.url.includes("bmkg.go.id")) {
        updateStatus("Buka halaman BMKG terlebih dahulu!", true); return;
    }

    updateStatus(activeMode === 'detail' ? "Sedang membaca semua tanggal (Auto-Click)..." : "Mengambil data...", false);
    
    // UI Cleanup: Sembunyikan semua saat loading, TERMASUK container hasil
    ['resultsContainer','simpleHeader','detailHeader','chartContainer','searchContainer','downloadJsonBtn','downloadCsvBtn'].forEach(hide);
    document.getElementById('resultsContainer').innerHTML = '';

    chrome.tabs.sendMessage(tab.id, { action: "scrape_weather", mode: activeMode }, (response) => {
        // Error Handling
        if (chrome.runtime.lastError) {
            updateStatus("Gagal koneksi. Refresh halaman web BMKG.", true); return;
        }
        if (!response || response.error) {
            updateStatus(response?.error || "Gagal mengambil data.", true); return;
        }

        // SUCCESS
        currentData = response; 
        
        try {
            // 1. Render Headers
            if (activeMode === 'detail') {
                renderDetailHeader(response.meta);
                show('chartContainer');
                setTimeout(() => safeRenderChart(response.hasil), 50);
            } else {
                renderSimpleHeader(response.meta);
            }

            // 2. Render List
            renderResults(response);
            
            // 3. Tampilkan Elemen (FIX: Show resultsContainer)
            show('resultsContainer'); // <--- INI YANG HILANG SEBELUMNYA
            show('searchContainer'); 
            show('downloadJsonBtn'); 
            show('downloadCsvBtn');
            
            updateStatus(`Selesai. ${response.total_lokasi} grup data ditemukan.`, false);
        } catch (e) {
            console.error(e);
            updateStatus("Terjadi kesalahan saat menampilkan data.", true);
        }
    });
});

// --- 5. DOWNLOADERS ---
const handleDownload = (ext) => {
    if (!currentData || !currentData.meta) return;
    const name = formatters.clean(currentData.meta.kecamatan || "Data").replace(/[^a-zA-Z0-9]/g, '_');
    const content = ext === 'json' ? JSON.stringify(currentData, null, 2) : "\uFEFF"+convertToCSV(currentData);
    const type = ext === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
    
    const blob = new Blob([content], {type});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BMKG_${activeMode}_${name}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
};

document.getElementById('downloadJsonBtn').addEventListener('click', () => handleDownload('json'));
document.getElementById('downloadCsvBtn').addEventListener('click', () => handleDownload('csv'));

function convertToCSV(data) {
    const sep = ";";
    let headers = ["Grup/Tanggal", "Waktu/Lokasi", "Kondisi", "Suhu", "Kelembapan"];
    if (data.meta.mode === 'detail') headers.push("Angin", "Arah");
    headers.push("Waktu Scraping");
    let rows = [headers.join(sep)];

    if (data.hasil && Array.isArray(data.hasil)) {
        data.hasil.forEach(g => {
            if (g.data && Array.isArray(g.data)) {
                g.data.forEach(i => {
                    let r = [
                        formatters.clean(g.lokasi), formatters.clean(i.waktu),
                        formatters.clean(i.kondisi), formatters.suhu(i.suhu),
                        formatters.clean(i.kelembapan)
                    ];
                    if (data.meta.mode === 'detail') r.push(formatters.clean(i.angin), formatters.clean(i.arah));
                    r.push(data.meta.waktu_ambil);
                    rows.push(r.join(sep));
                });
            }
        });
    }
    return rows.join("\n");
}

// --- 6. RENDERERS ---
function renderSimpleHeader(meta) {
    if (!meta) return;
    show('simpleHeader');
    const k = document.getElementById('infoKecamatan'); if(k) k.innerText = formatters.clean(meta.kecamatan);
    const w = document.getElementById('infoWaktu'); if(w) w.innerText = `Data: ${meta.waktu_ambil}`;
}

function renderDetailHeader(meta) {
    if (!meta || !meta.header_info) { hide('detailHeader'); return; }
    show('detailHeader');
    const i = meta.header_info;
    const el = document.getElementById('detailHeader');
    el.innerHTML = `
        <div class="dh-top">
            <div><div class="dh-temp">${formatters.suhu(i.suhu)}</div><div class="dh-cond">${formatters.clean(i.kondisi)}</div></div>
            <div class="dh-loc">${formatters.clean(meta.kecamatan)}</div>
        </div>
        <div class="dh-grid">
            <div class="dh-item"><strong>RH</strong>${formatters.clean(i.kelembapan)}</div>
            <div class="dh-item"><strong>Angin</strong>${formatters.clean(i.angin)}</div>
            <div class="dh-item"><strong>Arah</strong>${formatters.clean(i.arah)}</div>
            <div class="dh-item"><strong>Jarak</strong>${formatters.clean(i.jarak_pandang)}</div>
        </div>
        <div style="margin-top:8px; font-size:10px; text-align:right; color:#64748b;">Update: ${meta.waktu_ambil}</div>`;
}

function safeRenderChart(data) {
    try { renderChart(data); } catch (e) { console.error("Chart Error", e); hide('chartContainer'); }
}

function renderChart(data) {
    const cvs = document.getElementById('weatherChart');
    if(!cvs || cvs.offsetParent === null) return;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
        hide('chartContainer'); return;
    }

    const ctx = cvs.getContext('2d');
    let pts = [], lbls = []; chartPoints = [];

    data.forEach(g => {
        if (g.data && Array.isArray(g.data)) {
            g.data.forEach(i => {
                let v = 0;
                if (activeChartType === 'suhu') v = formatters.getNumber(i.suhu);
                else if (activeChartType === 'kelembapan') v = formatters.getNumber(i.kelembapan);
                else if (activeChartType === 'angin') v = formatters.getNumber(i.angin);
                
                if (!isNaN(v)) {
                    const tglP = g.lokasi ? g.lokasi.split(' ').slice(0,2).join(' ') : '';
                    const jam = i.waktu ? i.waktu.split(' ')[0] : '-';
                    lbls.push({t:jam, f:`${i.waktu} (${tglP})`});
                    pts.push(v);
                }
            });
        }
    });

    if (pts.length === 0) { hide('chartContainer'); return; }

    const cfg = {
        suhu: { c: '#d63384', b: 'rgba(214, 51, 132, 0.1)', u: '°C' },
        kelembapan: { c: '#0d6efd', b: 'rgba(13, 110, 253, 0.1)', u: '%' },
        angin: { c: '#198754', b: 'rgba(25, 135, 84, 0.1)', u: 'km/h' }
    };
    const st = cfg[activeChartType];

    const dpr = window.devicePixelRatio || 1;
    const rect = cvs.getBoundingClientRect();
    cvs.width = rect.width * dpr; cvs.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height, pL = 30, pB = 20;

    let min = Math.min(...pts), max = Math.max(...pts);
    if (min===max) { min-=5; max+=5; } else { const r=max-min; min-=r*0.2; max+=r*0.2; }
    
    const GX=i=>pL+(i/(pts.length-1))*(W-pL-10), GY=v=>10+(H-pB-10)-((v-min)/(max-min))*(H-pB-10);

    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#eee'; ctx.lineWidth=1; ctx.fillStyle='#888'; ctx.textAlign='right';
    for(let i=0;i<=4;i++){ const v=min+(i/4)*(max-min), y=GY(v); ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(W,y);ctx.stroke();ctx.fillText(Math.round(v),pL-5,y); }

    ctx.beginPath(); ctx.strokeStyle=st.c; ctx.lineWidth=2;
    pts.forEach((v,i)=>{ const x=GX(i), y=GY(v); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); });
    ctx.stroke();
    ctx.lineTo(GX(pts.length-1), H-pB); ctx.lineTo(GX(0), H-pB); ctx.closePath();
    const grd = ctx.createLinearGradient(0,0,0,H);
    grd.addColorStop(0,st.b); grd.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle=grd; ctx.fill();
    ctx.fillStyle='#666'; ctx.textAlign='center'; const stp=Math.ceil(pts.length/6);
    lbls.forEach((l,i)=>{ if(i%stp===0 || i===lbls.length-1) ctx.fillText(l.t,GX(i),H-pB+12); });
    pts.forEach((v,i)=>{
        const x=GX(i), y=GY(v);
        ctx.beginPath(); ctx.fillStyle='#fff'; ctx.strokeStyle=st.c; ctx.lineWidth=2;
        ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); ctx.stroke();
        chartPoints.push({x,y,val:v,label:lbls[i].f,unit:st.u});
    });
}

// Tooltip
const chartCvs = document.getElementById('weatherChart');
const tooltip = document.getElementById('chartTooltip');
if (chartCvs) {
    chartCvs.addEventListener('mousemove', (e) => {
        if(!chartPoints.length) return;
        const r=e.target.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
        let closest = null, minD = 20;
        chartPoints.forEach(p => { const d=Math.sqrt((mx-p.x)**2+(my-p.y)**2); if(d<minD) { minD=d; closest=p; } });
        if(closest) {
            tooltip.style.display='block'; tooltip.style.left=closest.x+'px'; tooltip.style.top=closest.y+'px';
            tooltip.innerHTML=`<strong>${closest.label}</strong><br>${closest.val} ${closest.unit}`;
            chartCvs.style.cursor='pointer';
        } else { tooltip.style.display='none'; chartCvs.style.cursor='default'; }
    });
    chartCvs.addEventListener('mouseleave', () => { if(tooltip) tooltip.style.display='none'; });
}

function renderResults(data, filter = '') {
    const cont = document.getElementById('resultsContainer');
    cont.innerHTML = '';
    const isDetail = data.meta.mode === 'detail';
    
    if (!data.hasil || !Array.isArray(data.hasil)) {
        cont.innerHTML = '<div style="text-align:center; padding:10px;">Data kosong.</div>';
        return;
    }

    data.hasil.forEach(g => {
        if (!g.data || !Array.isArray(g.data)) return;
        const items = g.data.filter(i => 
            (String(g.lokasi)+String(i.waktu)+String(i.kondisi)+String(i.suhu)).toLowerCase().includes(filter)
        );
        if(items.length === 0) return;

        const grp = document.createElement('div');
        grp.className = 'date-group closed';
        grp.innerHTML = `<div class="date-header"><span>${formatters.clean(g.lokasi)}</span><svg class="chevron" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg></div>`;
        
        const content = document.createElement('div');
        content.className = 'group-content';

        items.forEach(i => {
            const div = document.createElement('div');
            div.className = 'location-item';
            
            const angin = formatters.clean(i.angin);
            const arah = formatters.clean(i.arah);
            let extra = '';

            // Logic Baru: Tampilkan Detail jika data valid
            if (angin !== '-' && angin !== '' && arah !== '-' && arah !== '') {
                extra = `
                <div style="margin-top:6px; font-size:10px; color:#666; display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                    <span style="background:#f1f5f9; padding:2px 6px; border-radius:3px;">Kecepatan Angin: ${angin}</span>
                    <span style="background:#f1f5f9; padding:2px 6px; border-radius:3px;">Arah: ${arah}</span>
                </div>`;
            }

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <span class="loc-name" style="margin:0; font-size:12px;">${formatters.clean(i.waktu)}</span>
                    <span style="font-weight:bold; color:#d63384; font-size:13px;">${formatters.suhu(i.suhu)}</span>
                </div>
                <div class="loc-data" style="margin-top:4px;">
                    <span style="font-weight:500;">${formatters.clean(i.kondisi)}</span>
                    <span style="color:#0d6efd; font-weight:500;">RH: ${formatters.clean(i.kelembapan)}</span>
                </div>
                ${extra}
            `;
            content.appendChild(div);
        });

        grp.appendChild(content);
        grp.querySelector('.date-header').onclick = () => grp.classList.toggle('closed');
        cont.appendChild(grp);
    });
}

function updateStatus(msg, isError) {
    const el = document.getElementById('status');
    if(el) { el.innerText = msg; el.style.color = isError ? '#dc3545' : '#666'; }
}