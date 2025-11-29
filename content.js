// content.js - BMKG Reader Extension (Final Fix for Detail Mode)

function cleanText(str) {
    if (!str) return "-";
    let s = str.toString();
    // Hapus label statis (Case insensitive)
    s = s.replace(/Kelembapan|Kecepatan Angin|Arah Angin dari|Jarak Pandang/gi, "");
    // Ganti dash
    s = s.replace(/[\u2013\u2014]/g, "-");
    // Whitelist karakter: Huruf, Angka, Spasi, titik, koma, %, °, /, <, >
    s = s.replace(/[^a-zA-Z0-9\s.,\-:%\u00B0\/<>]/g, ""); 
    return s.replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
                console.error("BMKG Scraper Error:", e);
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

    const dateHeaders = [];
    document.querySelectorAll('thead tr th').forEach((th, i) => {
        if(i > 0) dateHeaders.push(cleanText(th.innerText));
    });

    document.querySelectorAll('tbody tr').forEach(row => {
        const loc = cleanText(row.querySelector('td:first-child span')?.innerText || "Unknown");
        const daily = [];
        
        row.querySelectorAll('td:not(:first-child)').forEach((cell, i) => {
            // Strategi fallback untuk mengambil teks kondisi
            let kondisi = "-", suhu = "-", kelembapan = "-";
            const ps = cell.querySelectorAll('p');
            
            if (ps.length >= 3) {
                kondisi = cleanText(ps[0].innerText);
                suhu = cleanText(ps[1].innerText);
                kelembapan = cleanText(ps[2].innerText);
            } else {
                // Coba split text jika p tidak terdeteksi
                const lines = cell.innerText.split('\n').filter(t => t.trim().length > 0);
                if (lines.length >= 3) {
                    kondisi = cleanText(lines[0]);
                    suhu = cleanText(lines[1]);
                    kelembapan = cleanText(lines[2]);
                }
            }

            daily.push({
                waktu: dateHeaders[i] || `Hari ${i+1}`,
                kondisi, suhu, kelembapan,
                // Mode sederhana tidak punya data angin, tapi kita isi '-' agar struktur sama
                angin: '-', arah: '-' 
            });
        });
        
        if (daily.length > 0) {
            weatherData.push({ lokasi: loc, data: daily });
        }
    });

    return {
        meta: { kecamatan, waktu_ambil: new Date().toLocaleString('id-ID'), mode: 'simple', header_info: null },
        total_lokasi: weatherData.length,
        hasil: weatherData
    };
}

// --- MODE 2: DETAIL (FIXED SLIDER SCRAPING) ---
async function scrapeDetailData() {
    console.log("Scraping: Detail");
    
    let lokasiUtama = "Lokasi Detail";
    const h1 = document.querySelector('h1');
    if (h1) lokasiUtama = cleanText(h1.innerText.replace('Prakiraan Cuaca', ''));

    // 1. HEADER INFO (KARTU BIRU)
    let headerInfo = null;
    // Cari div yang mengandung teks spesifik (lebih aman daripada class)
    const allDivs = document.querySelectorAll('div');
    let headerCard = null;
    for(let d of allDivs) {
        // Ciri khas header card: ada teks 'Saat ini' dan 'Pemutakhiran'
        if(d.innerText.includes("Saat ini") && d.innerText.includes("Pemutakhiran")) {
            headerCard = d; break;
        }
    }

    if (headerCard) {
        // Ambil kotak-kotak kecil di bawahnya (biasanya punya border)
        const grids = headerCard.querySelectorAll("[class*='border-gray-stroke']");
        let h="-", w="-", d="-", v="-";
        
        // Kita cari berdasarkan konten teksnya agar tidak tertukar
        grids.forEach(g => {
            const txt = g.innerText;
            if (txt.includes("Kelembapan")) h = cleanText(txt);
            else if (txt.includes("Kecepatan Angin")) w = cleanText(txt);
            else if (txt.includes("Arah Angin")) d = cleanText(txt);
            else if (txt.includes("Jarak Pandang")) v = cleanText(txt);
        });

        const tEl = headerCard.querySelector("p[class*='text-[40px]'], p[class*='text-[56px]']");
        const cEl = headerCard.querySelector("p.text-black-primary.font-medium");

        headerInfo = {
            suhu: cleanText(tEl?.innerText),
            kondisi: cleanText(cEl?.innerText),
            kelembapan: h, angin: w, arah: d, jarak_pandang: v
        };
    }

    // 2. NAVIGASI TANGGAL
    const btnContainer = document.querySelector('.overflow-x-auto.flex.gap-2, .overflow-x-scroll');
    const buttons = btnContainer ? Array.from(btnContainer.querySelectorAll('button')) : [];
    
    if (buttons.length === 0) return { error: "Tombol navigasi tanggal tidak ditemukan." };

    let allDailyData = [];

    // Loop Tombol
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].click();
        await sleep(800); // Tunggu render DOM

        // Ambil Header Tanggal H2
        let dateText = cleanText(buttons[i].innerText);
        const h2s = document.querySelectorAll('h2');
        for(let h2 of h2s) {
            if(h2.innerText.includes("Prakiraan Cuaca") && h2.innerText.match(/\d{4}/)) {
                dateText = cleanText(h2.innerText.replace('Prakiraan Cuaca', '').split('Pemutakhiran')[0]);
                break;
            }
        }

        // 3. SCRAPE SLIDER (BAGIAN PENTING YANG DIPERBAIKI)
        const slides = document.querySelectorAll('.swiper-slide');
        let hourlyData = [];

        slides.forEach(slide => {
            // Cek Jam
            const pTags = slide.querySelectorAll('p');
            let jam = "-";
            for (let p of pTags) {
                if (p.innerText.match(/WI(B|TA|T)/)) {
                    jam = cleanText(p.innerText); break;
                }
            }
            if (jam === "-" || jam === "") return; // Skip jika bukan slide cuaca

            // Cek Suhu
            let suhu = "-";
            const suhuEl = Array.from(pTags).find(el => el.innerText.includes('°C'));
            if (suhuEl) suhu = cleanText(suhuEl.innerText);

            // Cek Kondisi (Sibling dari suhu atau cari teks bold)
            let kondisi = "-";
            if (suhuEl && suhuEl.nextElementSibling) {
                kondisi = cleanText(suhuEl.nextElementSibling.innerText);
            }

            // Cek Detail (Grid Putih Transparan)
            const detailsContainer = slide.querySelector('.bg-white-overlay');
            let hum="-", wind="-", dir="-";

            if (detailsContainer && detailsContainer.children.length > 0) {
                // PERBAIKAN: Ambil textContent dari masing-masing baris (div anak)
                // Index 0: Kelembapan, Index 1: Angin, Index 2: Arah
                const rows = detailsContainer.children;
                
                if(rows[0]) hum = cleanText(rows[0].textContent);
                if(rows[1]) wind = cleanText(rows[1].textContent);
                if(rows[2]) dir = cleanText(rows[2].textContent);
            }

            hourlyData.push({
                waktu: jam, kondisi, suhu, 
                kelembapan: hum, angin: wind, arah: dir
            });
        });

        if (hourlyData.length > 0) {
            allDailyData.push({ lokasi: dateText, data: hourlyData });
        }
    }

    // Reset ke tab pertama
    if(buttons.length > 0) buttons[0].click();

    return {
        meta: { kecamatan: lokasiUtama, waktu_ambil: new Date().toLocaleString('id-ID'), mode: 'detail', header_info: headerInfo },
        total_lokasi: allDailyData.length,
        hasil: allDailyData
    };
}