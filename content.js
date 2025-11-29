// content.js - BMKG Reader

function cleanText(str) {
    if (!str) return "-";
    let s = str.toString();
    // Hapus label statis yang mungkin ikut terambil
    s = s.replace(/Kelembapan|Kecepatan Angin|Arah Angin dari|Jarak Pandang/gi, "");
    s = s.replace(/[\u2013\u2014]/g, "-");
    s = s.replace(/[^a-zA-Z0-9\s.,\-:%\u00B0\/<>(),]/g, "");
    return s.replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape_weather") {
        (async () => {
            try {
                const result = request.mode === 'detail' ? await scrapeDetailData() : scrapeSimpleData();
                sendResponse(result);
            } catch (e) {
                console.error(e);
                sendResponse({ error: e.message });
            }
        })();
        return true; 
    }
});

// --- MODE 1: SEDERHANA ---
function scrapeSimpleData() {
    console.log("Scraping: Sederhana");
    const weatherData = [];
    
    let kecamatan = "Wilayah";
    const titleEl = document.querySelector('h2.judul-halaman, .breadcrumb li:last-child, h1');
    if (titleEl) kecamatan = cleanText(titleEl.innerText.replace(/Cuaca/i, ''));

    const dateHeaders = Array.from(document.querySelectorAll('thead tr th')).slice(1).map(th => cleanText(th.innerText));

    document.querySelectorAll('tbody tr').forEach(row => {
        const loc = cleanText(row.querySelector('td:first-child span')?.innerText || "Unknown");
        const daily = [];
        
        row.querySelectorAll('td:not(:first-child)').forEach((cell, i) => {
            // Ambil semua teks dalam sel, pisahkan berdasarkan baris baru atau elemen blok
            // Biasanya: Kondisi \n Suhu \n Kelembapan
            const lines = cell.innerText.split('\n').map(t => cleanText(t)).filter(t => t.length > 0);
            
            // Fallback logic jika struktur HTML berubah
            let [kondisi, suhu, kelembapan] = ["-", "-", "-"];
            
            if (lines.length >= 3) {
                kondisi = lines[0];
                suhu = lines[1];
                kelembapan = lines[2];
            } else {
                // Coba selector p jika split gagal
                const ps = cell.querySelectorAll('p');
                if (ps.length >= 3) {
                    kondisi = cleanText(ps[0].innerText);
                    suhu = cleanText(ps[1].innerText);
                    kelembapan = cleanText(ps[2].innerText);
                }
            }

            daily.push({
                waktu: dateHeaders[i] || `Hari ${i+1}`,
                kondisi, suhu, kelembapan,
                angin: '-', arah: '-' // Data tidak tersedia di tabel sederhana
            });
        });
        weatherData.push({ lokasi: loc, data: daily });
    });

    return {
        meta: { kecamatan, waktu_ambil: new Date().toLocaleString('id-ID'), mode: 'simple', header_info: null },
        total_lokasi: weatherData.length,
        hasil: weatherData
    };
}

// --- MODE 2: DETAIL ---
async function scrapeDetailData() {
    console.log("Scraping: Detail");
    
    let lokasiUtama = "Lokasi Detail";
    const h1 = document.querySelector('h1');
    if (h1) lokasiUtama = cleanText(h1.innerText.replace('Prakiraan Cuaca', ''));

    // 1. Header Card
    let headerInfo = null;
    const headerCard = document.querySelector("div[class*='bg-[linear-gradient(151deg']");
    if (headerCard) {
        const grids = headerCard.querySelectorAll(".border-gray-stroke");
        let h="-", w="-", d="-", v="-";
        if (grids.length >= 4) {
            // Ambil textContent (semua teks di dalam) agar aman
            h = cleanText(grids[0].textContent);
            w = cleanText(grids[1].textContent);
            d = cleanText(grids[2].textContent);
            v = cleanText(grids[3].textContent);
        }
        headerInfo = {
            suhu: cleanText(headerCard.querySelector("p[class*='text-[40px]'], p[class*='text-[56px]']")?.innerText),
            kondisi: cleanText(headerCard.querySelector("p.text-black-primary.font-medium")?.innerText),
            kelembapan: h, angin: w, arah: d, jarak_pandang: v
        };
    }

    // 2. Tombol & Slider
    const btnContainer = document.querySelector('.overflow-x-auto.flex.gap-2, .overflow-x-scroll');
    const buttons = btnContainer ? Array.from(btnContainer.querySelectorAll('button')) : [];
    if (buttons.length === 0) return { error: "Tombol tanggal tidak ditemukan." };

    let allDailyData = [];

    for (let i = 0; i < buttons.length; i++) {
        buttons[i].click();
        await sleep(800); // Tunggu render

        // Ambil tanggal dari H2 aktif
        let dateText = cleanText(buttons[i].innerText);
        const h2Headers = document.querySelectorAll('h2');
        for (let h2 of h2Headers) {
            if (h2.innerText.includes('Prakiraan Cuaca') && h2.innerText.match(/\d{4}/)) {
                dateText = cleanText(h2.innerText.replace('Prakiraan Cuaca', '').split('Pemutakhiran')[0]);
                break;
            }
        }

        // Scrape Slider Items
        const slides = document.querySelectorAll('.swiper-slide');
        let hourlyData = [];

        slides.forEach(slide => {
            const pTags = slide.querySelectorAll('p');
            let jam = "-";
            
            // Cari Jam (WIB/WITA/WIT)
            for (let p of pTags) {
                if (p.innerText.match(/WI(B|TA|T)/)) {
                    jam = cleanText(p.innerText); break;
                }
            }
            if (jam === "-" || jam === "") return;

            // Cari Suhu & Kondisi
            let suhu = "-", kondisi = "-";
            const suhuEl = Array.from(pTags).find(el => el.innerText.includes('°C'));
            if (suhuEl) {
                suhu = cleanText(suhuEl.innerText);
                if (suhuEl.nextElementSibling) kondisi = cleanText(suhuEl.nextElementSibling.innerText);
            }

            // Cari Detail (Angin, dll) di dalam kotak putih overlay
            const details = slide.querySelector('.bg-white-overlay');
            let hum="-", wind="-", dir="-";
            
            if (details && details.children.length > 0) {
                const rows = details.children;
                // Gunakan textContent pada container baris untuk menangkap semua teks
                // Row 0 = Lembap, 1 = Angin, 2 = Arah
                if(rows[0]) hum = cleanText(rows[0].textContent);
                if(rows[1]) wind = cleanText(rows[1].textContent);
                if(rows[2]) dir = cleanText(rows[2].textContent);
            }

            hourlyData.push({
                waktu: jam, kondisi, suhu, kelembapan: hum, angin: wind, arah: dir
            });
        });

        if (hourlyData.length > 0) {
            allDailyData.push({ lokasi: dateText, data: hourlyData });
        }
    }

    if(buttons.length > 0) buttons[0].click();

    return {
        meta: { kecamatan: lokasiUtama, waktu_ambil: new Date().toLocaleString('id-ID'), mode: 'detail', header_info: headerInfo },
        total_lokasi: allDailyData.length,
        hasil: allDailyData
    };
}