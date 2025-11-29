// content.js - BMKG Reader (Final Robust Version)

// --- UTILITY ---
function cleanText(str) {
    if (!str) return "-";
    // Bersihkan label, en-dash, dan karakter non-ASCII
    let s = str.toString()
        .replace(/Kelembapan:|Kecepatan Angin:|Arah Angin dari:|Jarak Pandang:/gi, "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[^a-zA-Z0-9\s.,\-:%\u00B0\/<>(),]/g, ""); 
    return s.replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape_weather") {
        (async () => {
            try {
                let result;
                if (request.mode === 'detail') {
                    result = await scrapeDetailData();
                } else {
                    result = scrapeSimpleData();
                }
                sendResponse(result);
            } catch (e) {
                console.error("[BMKG Reader] Error:", e);
                // Kirim pesan error yang bisa dibaca user
                sendResponse({ error: "Gagal mengambil data. Coba refresh halaman web." });
            }
        })();
        return true; 
    }
});

// --- MODE 1: SEDERHANA ---
function scrapeSimpleData() {
    console.log("[BMKG Reader] Scraping Mode Sederhana");
    const weatherData = [];
    let kecamatan = "Wilayah Tidak Terdeteksi";
    
    const titleEl = document.querySelector('h2.judul-halaman, .breadcrumb li:last-child, h1');
    if (titleEl) kecamatan = cleanText(titleEl.innerText.replace(/Cuaca/i, ''));
    
    const dateHeaders = [];
    document.querySelectorAll('thead tr th').forEach((th, i) => {
        if(i > 0) dateHeaders.push(cleanText(th.innerText));
    });

    document.querySelectorAll('tbody tr').forEach(row => {
        const loc = cleanText(row.querySelector('td:first-child span')?.innerText || "Unknown");
        const daily = [];
        row.querySelectorAll('td:not(:first-child)').forEach((cell, i) => {
            const p = cell.querySelectorAll('p');
            if (p.length >= 3) {
                daily.push({
                    waktu: dateHeaders[i] || `Hari ${i+1}`,
                    kondisi: cleanText(p[0].querySelector('span')?.innerText),
                    suhu: cleanText(p[1].querySelector('span')?.innerText),
                    kelembapan: cleanText(p[2].querySelector('span')?.innerText),
                    angin: '-', arah: '-'
                });
            }
        });
        weatherData.push({ lokasi: loc, data: daily });
    });

    return {
        meta: { kecamatan, waktu_ambil: new Date().toLocaleString('id-ID'), mode: 'simple', header_info: null },
        total_lokasi: weatherData.length,
        hasil: weatherData
    };
}

// --- MODE 2: DETAIL (ROBUST) ---
async function scrapeDetailData() {
    console.log("[BMKG Reader] Scraping Mode Detail");
    let lokasiUtama = "Lokasi Detail";
    const h1 = document.querySelector('h1');
    if (h1) lokasiUtama = cleanText(h1.innerText.replace('Prakiraan Cuaca', ''));

    // 1. Scrape Header Card (SEBELUM KLIK TOMBOL)
    // Cari div yang mengandung teks "Saat ini" dan "Pemutakhiran" (Lebih aman daripada class)
    let headerInfo = null;
    const allDivs = document.querySelectorAll('div.rounded-2xl'); // Kartu biasanya rounded
    let headerCard = null;
    
    for (let div of allDivs) {
        if (div.innerText.includes("Saat ini") && div.innerText.includes("Pemutakhiran")) {
            headerCard = div;
            break;
        }
    }

    if (headerCard) {
        // Ambil grid detail (Lembap, Angin, Arah, Jarak)
        // Cari elemen yang punya border (biasanya kotak-kotak kecil itu punya border)
        const grids = headerCard.querySelectorAll("[class*='border']");
        // Filter hanya yang punya teks relevan
        const validGrids = Array.from(grids).filter(el => 
            el.innerText.includes('%') || el.innerText.includes('km/jam') || el.innerText.includes('Angin')
        );

        let h="-", w="-", d="-", v="-";
        if (validGrids.length >= 4) {
             h = cleanText(validGrids[0].textContent);
             w = cleanText(validGrids[1].textContent);
             d = cleanText(validGrids[2].textContent);
             v = cleanText(validGrids[3].textContent);
        }
        
        headerInfo = {
            suhu: cleanText(headerCard.querySelector("p[class*='text-[40px]'], p[class*='text-[56px]']")?.innerText),
            kondisi: cleanText(headerCard.querySelector("p.text-black-primary.font-medium")?.innerText),
            kelembapan: h, angin: w, arah: d, jarak_pandang: v
        };
    }

    // 2. Cari Tombol Tanggal
    const buttonContainer = document.querySelector('.overflow-x-auto.flex.gap-2, .overflow-x-scroll');
    let buttons = buttonContainer ? Array.from(buttonContainer.querySelectorAll('button')) : [];

    if (buttons.length === 0) return { error: "Tombol tanggal tidak ditemukan." };

    let allDailyData = [];

    // 3. Loop Tombol
    for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        btn.click();
        
        // Waktu tunggu diperlama agar data pasti muncul
        await sleep(800); 

        // Ambil Tanggal dari H2 yang aktif
        let dateText = cleanText(btn.innerText);
        const h2Headers = document.querySelectorAll('h2');
        for (let h2 of h2Headers) {
            if (h2.innerText.includes('Prakiraan Cuaca') && h2.innerText.match(/\d{4}/)) {
                dateText = cleanText(h2.innerText.replace('Prakiraan Cuaca', '').split('Pemutakhiran')[0]);
                break;
            }
        }

        // Scrape Slider
        const slides = document.querySelectorAll('.swiper-slide');
        let hourlyData = [];
        
        slides.forEach(slide => {
            // Cek apakah slide punya konten jam
            const pTags = slide.querySelectorAll('p');
            let jam = "-";
            for (let p of pTags) {
                if (p.innerText.match(/WI(B|TA|T)/)) {
                    jam = cleanText(p.innerText); break;
                }
            }
            if (jam === "-" || jam === "") return;

            let suhu = cleanText(Array.from(pTags).find(el => el.innerText.includes('°C'))?.innerText);
            let kondisi = "-";
            const suhuEl = Array.from(pTags).find(el => el.innerText.includes('°C'));
            if (suhuEl && suhuEl.nextElementSibling) kondisi = cleanText(suhuEl.nextElementSibling.innerText);

            // Ambil Detail dari overlay putih
            const details = slide.querySelector('.bg-white-overlay');
            let h="-", w="-", d="-";
            
            if (details && details.children.length > 0) {
                const rows = details.children;
                // Row 0: Lembap, Row 1: Angin, Row 2: Arah
                if (rows[0]) h = cleanText(rows[0].querySelector('p')?.innerText);
                if (rows[1]) w = cleanText(rows[1].querySelector('p')?.innerText);
                if (rows[2]) d = cleanText(rows[2].querySelector('p')?.innerText);
            }

            hourlyData.push({
                waktu: jam, 
                kondisi, suhu, kelembapan: h, angin: w, arah: d
            });
        });

        if (hourlyData.length > 0) {
            allDailyData.push({
                lokasi: dateText, 
                data: hourlyData
            });
        }
    }

    // Kembalikan tombol ke posisi awal
    if (buttons.length > 0) buttons[0].click();

    return {
        meta: { kecamatan: lokasiUtama, waktu_ambil: new Date().toLocaleString('id-ID'), mode: 'detail', header_info: headerInfo },
        total_lokasi: allDailyData.length,
        hasil: allDailyData
    };
}