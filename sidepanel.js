// sidepanel.js - BMKG Reader (Final Collapsed & No-Sticky)

let currentData = null; 
let activeMode = 'simple'; 
let activeChartType = 'suhu'; 

const formatters = {
    clean: (val) => {
        if (!val) return '-';
        let str = val.toString();
        str = str.replace(/Kelembapan:|Kecepatan Angin:|Arah Angin dari:|Jarak Pandang:/yi, "");
        str = str.replace(/[^a-zA-Z0-9\s.,\-:%\u00B0\/<>(),]/g, "");
        return str.replace(/\s+/g, " ").trim();
    },
    suhu: (val) => {
        if (!val || val === '-') return '-';
        return val.replace(/[^0-9\u00B0\s-]/g, "").trim();
    },
    getNumber: (val) => {
        if (!val) return 0;
        const match = val.toString().match(/[\d,.]+/); 
        return match ? parseFloat(match[0].replace(',', '.')) : 0;
    }
};

// --- UI LOGIC ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeMode = e.target.dataset.mode;
        document.getElementById('scrapeBtn').innerText = `Ambil Data (${activeMode === 'simple' ? 'Sederhana' : 'Detail'})`;
        resetUI();
    });
});

document.getElementById('chartType').addEventListener('change', (e) => {
    activeChartType = e.target.value;
    if (currentData && activeMode === 'detail') renderChart(currentData.hasil);
});

document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    if (currentData) renderResults(currentData, keyword);
});

function resetUI() {
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('downloadJsonBtn').style.display = 'none';
    document.getElementById('downloadCsvBtn').style.display = 'none';
    document.getElementById('searchContainer').style.display = 'none';
    document.getElementById('searchInput').value = '';
    document.getElementById('simpleHeader').style.display = 'none';
    document.getElementById('detailHeader').style.display = 'none';
    document.getElementById('chartContainer').style.display = 'none';
    updateStatus("Pilih mode lalu klik tombol.", false);
}

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url.includes("bmkg.go.id")) {
        updateStatus("Buka halaman BMKG terlebih dahulu!", true);
        return;
    }
    updateStatus(`Mengambil data ${activeMode}...`, false);
    resetUI();
    document.getElementById('searchContainer').style.display = 'none'; 

    chrome.tabs.sendMessage(tab.id, { action: "scrape_weather", mode: activeMode }, (response) => {
        if (chrome.runtime.lastError || !response || response.error) {
            updateStatus("Gagal mengambil data.", true);
        } else {
            currentData = response; 
            if (activeMode === 'detail') {
                renderDetailHeader(response.meta);
                document.getElementById('chartContainer').style.display = 'block';
                renderChart(response.hasil);
            } else {
                renderSimpleHeader(response.meta);
            }
            renderResults(response);
            document.getElementById('searchContainer').style.display = 'block';
            document.getElementById('downloadJsonBtn').style.display = 'block';
            document.getElementById('downloadCsvBtn').style.display = 'block';
            updateStatus(`Selesai. ${response.total_lokasi} data.`, false);
        }
    });
});

document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    if (!currentData) return;
    const safeName = formatters.clean(currentData.meta.kecamatan).replace(/[^a-zA-Z0-9]/g, '_');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    downloadFile(dataStr, `BMKG_${activeMode}_${safeName}.json`);
});

document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    if (!currentData) return;
    const safeName = formatters.clean(currentData.meta.kecamatan).replace(/[^a-zA-Z0-9]/g, '_');
    const dataStr = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(convertToCSV(currentData));
    downloadFile(dataStr, `BMKG_${activeMode}_${safeName}.csv`);
});

function downloadFile(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
}

function convertToCSV(data) {
    const sep = ";";
    let headers = ["Waktu", "Wilayah", "Lokasi", "Kondisi", "Suhu", "Kelembapan"];
    if (data.meta.mode === 'detail') headers.push("Angin", "Arah");
    let rows = [headers.join(sep)];

    data.hasil.forEach(loc => {
        loc.prakiraan.forEach(day => {
            let r = [
                formatters.clean(day.tanggal), formatters.clean(data.meta.kecamatan),
                formatters.clean(loc.lokasi), formatters.clean(day.kondisi),
                formatters.suhu(day.suhu), formatters.clean(day.kelembapan)
            ];
            if (data.meta.mode === 'detail') {
                r.push(formatters.clean(day.angin), formatters.clean(day.arah));
            }
            rows.push(r.join(sep));
        });
    });
    return rows.join("\n");
}

function renderSimpleHeader(meta) {
    document.getElementById('simpleHeader').style.display = 'block';
    document.getElementById('infoKecamatan').innerText = formatters.clean(meta.kecamatan);
    document.getElementById('infoWaktu').innerText = `Data diambil: ${meta.waktu_ambil}`;
}

function renderDetailHeader(meta) {
    const dh = document.getElementById('detailHeader');
    const info = meta.header_info;
    if (!info) { dh.style.display = 'none'; return; }
    
    dh.style.display = 'block';
    dh.innerHTML = `
        <div class="dh-top">
            <div>
                <div class="dh-temp">${formatters.suhu(info.suhu)}</div>
                <div class="dh-cond">${formatters.clean(info.kondisi)}</div>
            </div>
            <div class="dh-loc">${formatters.clean(meta.kecamatan)}</div>
        </div>
        <div class="dh-grid">
            <div class="dh-item"><strong>RH</strong>${formatters.clean(info.kelembapan)}</div>
            <div class="dh-item"><strong>Angin</strong>${formatters.clean(info.angin)}</div>
            <div class="dh-item"><strong>Arah</strong>${formatters.clean(info.arah)}</div>
            <div class="dh-item"><strong>Jarak</strong>${formatters.clean(info.jarak_pandang)}</div>
        </div>
    `;
}

function renderChart(dataHasil) {
    const canvas = document.getElementById('weatherChart');
    const ctx = canvas.getContext('2d');
    let dataPoints = []; let labels = [];
    
    if (dataHasil.length > 0 && dataHasil[0].prakiraan) {
        dataHasil[0].prakiraan.forEach(day => {
            let val = 0;
            if (activeChartType === 'suhu') val = formatters.getNumber(day.suhu);
            else if (activeChartType === 'kelembapan') val = formatters.getNumber(day.kelembapan);
            else if (activeChartType === 'angin') val = formatters.getNumber(day.angin);
            
            if (!isNaN(val)) {
                dataPoints.push(val);
                labels.push(day.tanggal.split(' ')[0]);
            }
        });
    }

    if (dataPoints.length === 0) return;

    const config = {
        suhu: { color: '#d63384', bg: 'rgba(214, 51, 132, 0.1)' },
        kelembapan: { color: '#0d6efd', bg: 'rgba(13, 110, 253, 0.1)' },
        angin: { color: '#198754', bg: 'rgba(25, 135, 84, 0.1)' }
    };
    const style = config[activeChartType];

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width; const height = rect.height;
    const padLeft = 30; const padBottom = 20;
    const graphW = width - padLeft - 10; const graphH = height - padBottom - 10;

    let minVal = Math.min(...dataPoints);
    let maxVal = Math.max(...dataPoints);
    if (minVal === maxVal) { minVal -= 5; maxVal += 5; }
    else { const r = maxVal - minVal; minVal -= r * 0.2; maxVal += r * 0.2; }

    const getX = (i) => padLeft + (i / (dataPoints.length - 1)) * graphW;
    const getY = (v) => 10 + graphH - ((v - minVal) / (maxVal - minVal)) * graphH;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';

    for (let i = 0; i <= 4; i++) {
        const val = minVal + (i / 4) * (maxVal - minVal);
        const y = getY(val);
        ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(width, y); ctx.stroke();
        ctx.fillText(Math.round(val), padLeft - 5, y);
    }

    ctx.beginPath(); ctx.strokeStyle = style.color; ctx.lineWidth = 2;
    dataPoints.forEach((val, i) => {
        const x = getX(i); const y = getY(val);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.lineTo(getX(dataPoints.length - 1), height - padBottom);
    ctx.lineTo(getX(0), height - padBottom);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, style.bg); gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient; ctx.fill();

    ctx.fillStyle = '#666'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const step = Math.ceil(labels.length / 6);
    labels.forEach((lbl, i) => {
        if (i % step === 0 || i === labels.length - 1) {
            ctx.fillText(lbl, getX(i), height - padBottom + 5);
        }
    });

    dataPoints.forEach((val, i) => {
        const x = getX(i); const y = getY(val);
        ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.strokeStyle = style.color; ctx.lineWidth = 2;
        ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
}

// --- RENDER LIST (DEFAULT CLOSED) ---
function renderResults(data, filter = '') {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';
    const isDetail = data.meta.mode === 'detail';

    const groups = {};
    data.hasil.forEach(loc => {
        loc.prakiraan.forEach(day => {
            const key = formatters.clean(day.tanggal);
            if (!groups[key]) groups[key] = [];
            groups[key].push({ lokasi: loc.lokasi, ...day });
        });
    });

    Object.keys(groups).forEach(key => {
        const filtered = groups[key].filter(item => 
            (item.lokasi + item.kondisi + item.suhu).toLowerCase().includes(filter)
        );
        if (filtered.length === 0) return;

        const grp = document.createElement('div');
        // SET DEFAULT CLASS MENJADI 'closed' AGAR TERTUTUP
        grp.className = 'date-group closed';
        
        const hdr = document.createElement('div');
        hdr.className = 'date-header';
        hdr.innerHTML = `<span>${key}</span><svg class="chevron" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/></svg>`;
        hdr.onclick = () => grp.classList.toggle('closed');
        
        const content = document.createElement('div');
        content.className = 'group-content';

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'location-item';
            
            let detailInfo = '';
            if (isDetail) {
                detailInfo = `<div style="margin-top:6px; font-size:10px; color:#666; display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                    <span style="background:#f1f5f9; padding:2px 6px; border-radius:3px;">Angin: ${formatters.clean(item.angin)}</span>
                    <span style="background:#f1f5f9; padding:2px 6px; border-radius:3px;">Arah: ${formatters.clean(item.arah)}</span>
                </div>`;
            }

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <span class="loc-name" style="margin:0; font-size:12px;">${isDetail ? 'Per Jam' : formatters.clean(item.lokasi)}</span>
                    <span style="font-weight:bold; color:#d63384; font-size:13px;">${formatters.suhu(item.suhu)}</span>
                </div>
                <div class="loc-data" style="margin-top:4px;">
                    <span style="font-weight:500;">${formatters.clean(item.kondisi)}</span>
                    <span style="color:#0d6efd; font-weight:500;">RH: ${formatters.clean(item.kelembapan)}</span>
                </div>
                ${detailInfo}
            `;
            content.appendChild(div);
        });

        grp.appendChild(hdr);
        grp.appendChild(content);
        container.appendChild(grp);
    });
}

function updateStatus(msg, isError) {
    const el = document.getElementById('status');
    el.innerText = msg;
    el.style.color = isError ? '#dc3545' : '#666';
}