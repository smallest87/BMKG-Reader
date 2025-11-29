// sidepanel.js - BMKG Reader Extension (Final Version)

let currentData = null; 
let activeMode = 'simple'; 

// --- 1. FORMATTERS (Data Cleaning) ---
const formatters = {
    clean: (val) => {
        if (!val) return '-';
        let str = val.toString();
        // Hapus label dari sumber jika ada
        str = str.replace(/Kelembapan:|Kecepatan Angin:|Arah Angin dari:|Jarak Pandang:/yi, "");
        // Hapus karakter non-ASCII tapi biarkan simbol penting
        str = str.replace(/[^a-zA-Z0-9\s.,\-:%\u00B0\/<>(),]/g, "");
        return str.replace(/\s+/g, " ").trim();
    },
    suhu: (val) => {
        if (!val || val === '-') return '-';
        // Format angka + derajat
        return val.replace(/[^0-9\u00B0\s-]/g, "").trim();
    }
};

// --- 2. UI RESET LOGIC ---
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

// --- 3. TAB SWITCHING ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        activeMode = e.target.dataset.mode;
        
        const btnText = activeMode === 'simple' ? 'Sederhana' : 'Detail';
        document.getElementById('scrapeBtn').innerText = `Ambil Data (${btnText})`;
        
        resetUI();
    });
});

// --- 4. SEARCH / FILTER ---
document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    if (currentData) {
        renderResults(currentData, keyword);
    }
});

// --- 5. MAIN SCRAPE ACTION ---
document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    if (!tab || !tab.url.includes("bmkg.go.id")) {
        updateStatus("Buka halaman BMKG terlebih dahulu!", true);
        return;
    }

    updateStatus(`Mengambil data ${activeMode}...`, false);
    
    // Bersihkan area hasil sebelum load
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('simpleHeader').style.display = 'none';
    document.getElementById('detailHeader').style.display = 'none';
    document.getElementById('chartContainer').style.display = 'none';
    document.getElementById('downloadJsonBtn').style.display = 'none';
    document.getElementById('downloadCsvBtn').style.display = 'none';

    chrome.tabs.sendMessage(tab.id, { action: "scrape_weather", mode: activeMode }, (response) => {
        if (chrome.runtime.lastError) {
            updateStatus("Error: Silakan refresh halaman web BMKG.", true);
            return;
        }
        if (!response) {
            updateStatus("Gagal mengambil data.", true);
            return;
        }
        if (response.error) {
            updateStatus(response.error, true);
            return;
        }

        // -- SUKSES --
        currentData = response; 
        
        if (activeMode === 'detail') {
            renderDetailHeader(response.meta);
            renderChart(response.hasil); // Gambar Grafik
        } else {
            renderSimpleHeader(response.meta);
        }

        renderResults(response); // Render List
        
        // Tampilkan fitur interaktif
        document.getElementById('searchContainer').style.display = 'block';
        document.getElementById('downloadJsonBtn').style.display = 'block';
        document.getElementById('downloadCsvBtn').style.display = 'block';
        
        updateStatus(`Selesai. ${response.total_lokasi} data ditemukan.`, false);
    });
});

// --- 6. DOWNLOADERS ---
document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    if (!currentData) return;
    const safeName = formatters.clean(currentData.meta.kecamatan).replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `BMKG_${activeMode}_${safeName}.json`;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    downloadFile(dataStr, fileName);
});

document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    if (!currentData) return;
    const safeName = formatters.clean(currentData.meta.kecamatan).replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `BMKG_${activeMode}_${safeName}.csv`;
    const csvContent = convertToCSV(currentData);
    const dataStr = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvContent);
    downloadFile(dataStr, fileName);
});

function downloadFile(dataUrl, filename) {
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataUrl);
    dlAnchorElem.setAttribute("download", filename);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
}

function convertToCSV(data) {
    const delimiter = ";";
    let headerArr = ["Waktu/Tanggal", "Wilayah", "Lokasi", "Kondisi", "Suhu", "Kelembapan"];
    
    if (data.meta.mode === 'detail') {
        headerArr.push("Kecepatan Angin", "Arah Angin");
    }
    headerArr.push("Waktu Scraping");

    let csvRows = [headerArr.join(delimiter)];

    data.hasil.forEach(loc => {
        loc.prakiraan.forEach(day => {
            let row = [
                formatters.clean(day.tanggal),
                formatters.clean(data.meta.kecamatan),
                formatters.clean(loc.lokasi),
                formatters.clean(day.kondisi),
                formatters.suhu(day.suhu),
                formatters.clean(day.kelembapan)
            ];

            if (data.meta.mode === 'detail') {
                row.push(formatters.clean(day.angin), formatters.clean(day.arah));
            }

            row.push(data.meta.waktu_ambil);
            csvRows.push(row.join(delimiter));
        });
    });
    return csvRows.join("\n");
}

// --- 7. UI RENDERERS ---

function renderSimpleHeader(meta) {
    const infoHeader = document.getElementById('simpleHeader');
    document.getElementById('infoKecamatan').innerText = formatters.clean(meta.kecamatan);
    document.getElementById('infoWaktu').innerText = `Data diambil: ${meta.waktu_ambil}`;
    infoHeader.style.display = 'block';
}

function renderDetailHeader(meta) {
    const dh = document.getElementById('detailHeader');
    const info = meta.header_info;

    if (!info) {
        dh.innerHTML = `<div style="text-align:center; font-size:11px;">Info Detail tidak tersedia</div>`;
        dh.style.display = 'block';
        return;
    }

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
        <div style="margin-top:8px; font-size:10px; text-align:right; color:#64748b;">
            Update: ${meta.waktu_ambil}
        </div>
    `;
    dh.style.display = 'block';
}

// Fungsi Render Chart (Canvas)
function renderChart(dataHasil) {
    const canvas = document.getElementById('weatherChart');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('chartContainer');
    
    let dataPoints = [];

    if (dataHasil.length > 0 && dataHasil[0].prakiraan) {
        dataHasil[0].prakiraan.forEach(day => {
            const val = parseInt(day.suhu.replace(/\D/g, '')); 
            if (!isNaN(val)) {
                dataPoints.push(val);
            }
        });
    }

    if (dataPoints.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Setup Canvas High-DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = 15;

    const minVal = Math.min(...dataPoints) - 1;
    const maxVal = Math.max(...dataPoints) + 1;
    const range = maxVal - minVal;

    const getY = (val) => height - padding - ((val - minVal) / range) * (height - (padding * 2));
    const getX = (idx) => padding + (idx / (dataPoints.length - 1)) * (width - (padding * 2));

    ctx.clearRect(0, 0, width, height);

    // Garis
    ctx.beginPath();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    dataPoints.forEach((val, i) => {
        const x = getX(i);
        const y = getY(val);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Area
    ctx.lineTo(getX(dataPoints.length - 1), height);
    ctx.lineTo(getX(0), height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(0, 123, 255, 0.2)");
    gradient.addColorStop(1, "rgba(0, 123, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fill();

    // Titik & Label
    dataPoints.forEach((val, i) => {
        const x = getX(i);
        const y = getY(val);

        ctx.beginPath();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#007bff'; ctx.lineWidth = 2;
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Label (Hanya tampilkan jika tidak terlalu rapat)
        if (dataPoints.length < 15 || i % 2 === 0) {
            ctx.fillStyle = '#333'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
            const textY = (i > 0 && val < dataPoints[i-1]) ? y + 14 : y - 7;
            ctx.fillText(val, x, textY);
        }
    });
}

// Fungsi Render List (Collapsible & Filtered)
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
        // Filter Items
        const filteredItems = groups[key].filter(item => {
            const searchStr = (item.lokasi + ' ' + item.kondisi + ' ' + item.suhu).toLowerCase();
            return searchStr.includes(filter);
        });

        if (filteredItems.length === 0) return;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'date-group';
        
        // Header
        const headerHTML = `
            <div class="date-header">
                <span>${key}</span>
                <svg class="chevron" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </div>
        `;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'group-content';

        filteredItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'location-item';
            
            let extraInfo = '';
            if (isDetail) {
                // Layout Grid untuk detail
                extraInfo = `
                    <div style="margin-top:6px; font-size:10px; color:#666; display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                        <span style="background:#f1f5f9; padding:2px 4px; border-radius:3px;">
                           Angin: ${formatters.clean(item.angin)}
                        </span>
                        <span style="background:#f1f5f9; padding:2px 4px; border-radius:3px;">
                           Arah: ${formatters.clean(item.arah)}
                        </span>
                    </div>
                `;
            }

            itemDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="loc-name" style="margin-bottom:0; font-size:12px;">
                        ${isDetail ? 'Per Jam' : formatters.clean(item.lokasi)}
                    </span>
                    <span style="font-weight:bold; color:#d63384; font-size:13px;">
                        ${formatters.suhu(item.suhu)}
                    </span>
                </div>
                <div class="loc-data" style="margin-top:4px;">
                    <span style="font-weight:500;">${formatters.clean(item.kondisi)}</span>
                    <span style="color:#0d6efd; font-weight:500;">
                        RH: ${formatters.clean(item.kelembapan)}
                    </span>
                </div>
                ${extraInfo}
            `;
            contentDiv.appendChild(itemDiv);
        });

        groupDiv.innerHTML = headerHTML;
        groupDiv.appendChild(contentDiv);

        // Collapse Event
        groupDiv.querySelector('.date-header').addEventListener('click', () => {
            groupDiv.classList.toggle('closed');
        });

        container.appendChild(groupDiv);
    });
}

function updateStatus(msg, isError) {
    const statusEl = document.getElementById('status');
    statusEl.innerText = msg;
    statusEl.style.color = isError ? '#dc3545' : '#666';
}