// sidepanel.js - BMKG Reader

let currentData = null; 
let activeMode = 'simple'; 

// --- FORMATTERS ---
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
    }
};

// --- TAB SWITCHING ---
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

// --- SEARCH LOGIC (BARU) ---
document.getElementById('searchInput').addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase();
    if (currentData) {
        // Render ulang dengan filter
        renderResults(currentData, keyword);
    }
});

function resetUI() {
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('downloadJsonBtn').style.display = 'none';
    document.getElementById('downloadCsvBtn').style.display = 'none';
    document.getElementById('searchContainer').style.display = 'none';
    document.getElementById('searchInput').value = ''; // Reset teks pencarian
    document.getElementById('simpleHeader').style.display = 'none';
    document.getElementById('detailHeader').style.display = 'none';
    updateStatus("Pilih mode lalu klik tombol.", false);
}

// --- MAIN SCRAPING ---
document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    
    if (!tab || !tab.url.includes("bmkg.go.id")) {
        updateStatus("Buka halaman BMKG terlebih dahulu!", true);
        return;
    }

    updateStatus(`Mengambil data ${activeMode}...`, false);
    
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('simpleHeader').style.display = 'none';
    document.getElementById('detailHeader').style.display = 'none';
    document.getElementById('searchContainer').style.display = 'none';
    document.getElementById('downloadJsonBtn').style.display = 'none';
    document.getElementById('downloadCsvBtn').style.display = 'none';

    chrome.tabs.sendMessage(tab.id, { action: "scrape_weather", mode: activeMode }, (response) => {
        if (chrome.runtime.lastError) {
            updateStatus("Error: Refresh halaman web BMKG.", true);
        } else if (!response) {
            updateStatus("Gagal mengambil data.", true);
        } else if (response.error) {
            updateStatus(response.error, true);
        } else {
            currentData = response; 
            
            if (activeMode === 'detail') {
                renderDetailHeader(response.meta);
            } else {
                renderSimpleHeader(response.meta);
            }

            renderResults(response); // Render awal tanpa filter
            
            // Tampilkan elemen interaktif
            document.getElementById('searchContainer').style.display = 'block';
            document.getElementById('downloadJsonBtn').style.display = 'block';
            document.getElementById('downloadCsvBtn').style.display = 'block';
            
            updateStatus(`Selesai. ${response.total_lokasi} lokasi.`, false);
        }
    });
});

// --- DOWNLOADERS ---
document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    if (!currentData) return;
    const cleanName = formatters.clean(currentData.meta.kecamatan).replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `BMKG_${activeMode}_${cleanName}.json`;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
    downloadFile(dataStr, fileName);
});

document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    if (!currentData) return;
    const cleanName = formatters.clean(currentData.meta.kecamatan).replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `BMKG_${activeMode}_${cleanName}.csv`;
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
                row.push(
                    formatters.clean(day.angin),
                    formatters.clean(day.arah)
                );
            }

            row.push(data.meta.waktu_ambil);
            csvRows.push(row.join(delimiter));
        });
    });
    return csvRows.join("\n");
}

// --- UI RENDERERS ---
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

// --- RENDER LIST DENGAN FILTER ---
function renderResults(data, filter = '') {
    const container = document.getElementById('resultsContainer');
    container.innerHTML = ''; // Bersihkan dulu
    const isDetail = data.meta.mode === 'detail';

    const groups = {};
    data.hasil.forEach(loc => {
        loc.prakiraan.forEach(day => {
            const key = formatters.clean(day.tanggal);
            if (!groups[key]) groups[key] = [];
            groups[key].push({
                lokasi: loc.lokasi, 
                ...day
            });
        });
    });

    Object.keys(groups).forEach(key => {
        // FILTERING LOGIC
        // Cek apakah ada setidaknya satu item di dalam grup ini yang cocok
        const filteredItems = groups[key].filter(item => {
            const textToSearch = (
                item.lokasi + ' ' + 
                item.kondisi + ' ' + 
                item.suhu
            ).toLowerCase();
            return textToSearch.includes(filter);
        });

        // Jika tidak ada item yang cocok setelah filter, jangan tampilkan grup ini
        if (filteredItems.length === 0) return;

        // Buat Elemen Grup
        const groupDiv = document.createElement('div');
        groupDiv.className = 'date-group';
        // Jika sedang mencari sesuatu, buka otomatis (hapus class closed)
        // Jika tidak mencari, tutup otomatis agar rapi (opsional, saya biarkan terbuka default)
        
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

        // Click to Collapse
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