// content.js - BMKG Reader Extension

// --- UTILITY: PEMBERSIH TEKS (Revised) ---
function cleanText(str) {
    if (!str) return "-";
    
    // 1. PRE-CLEANING: Ganti en-dash (–) dan em-dash (—) menjadi strip biasa (-)
    let fixedStr = str.replace(/[\u2013\u2014]/g, "-");

    // 2. WHITELIST CLEANING
    // Hapus semua kecuali: Huruf, Angka, Spasi, dan simbol (. , - : % ° / < > ( ) )
    let cleaned = fixedStr.replace(/[^a-zA-Z0-9\s.,\-:%\u00B0\/<>(),]/g, "");
    
    return cleaned.replace(/\s+/g, " ").trim();
}

// --- MAIN LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrape_weather") {
        let result;
        if (request.mode === 'detail') {
            result = scrapeDetailData();
        } else {
            result = scrapeSimpleData();
        }
        sendResponse(result);
    }
});

/**
 * FUNGSI 1: SCRAPE MODE SEDERHANA (Tabel)
 */
function scrapeSimpleData() {
    console.log("BMKG Reader: Scraping Mode Sederhana...");
    const weatherData = [];
    
    let kecamatan = "Kecamatan Tidak Terdeteksi";
    const titleEl = document.querySelector('h2.judul-halaman, .breadcrumb li:last-child, h1');
    if (titleEl) {
        kecamatan = cleanText(titleEl.innerText.replace(/Cuaca/i, ''));
    } else {
        kecamatan = cleanText(document.title.split('|')[0]);
    }

    const dateHeaders = [];
    const headerCells = document.querySelectorAll('thead tr th');
    for (let i = 1; i < headerCells.length; i++) {
        dateHeaders.push(cleanText(headerCells[i].innerText));
    }

    const rows = document.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const locationElement = row.querySelector('td:first-child span');
        const locationName = locationElement ? cleanText(locationElement.innerText) : "Unknown";
        
        const dailyForecasts = [];
        const dataCells = row.querySelectorAll('td:not(:first-child)');

        dataCells.forEach((cell, index) => {
            const paragraphs = cell.querySelectorAll('p');
            let kondisi = "-", suhu = "-", kelembapan = "-";

            if (paragraphs.length >= 3) {
                kondisi = paragraphs[0].querySelector('span')?.innerText;
                suhu = paragraphs[1].querySelector('span')?.innerText;
                kelembapan = paragraphs[2].querySelector('span')?.innerText;
            }

            dailyForecasts.push({
                tanggal: dateHeaders[index] || `Hari ke-${index + 1}`,
                kondisi: cleanText(kondisi),
                suhu: cleanText(suhu),
                kelembapan: cleanText(kelembapan),
                angin: '-', 
                arah: '-'
            });
        });

        weatherData.push({
            lokasi: locationName,
            prakiraan: dailyForecasts
        });
    });

    return {
        meta: {
            kecamatan: kecamatan,
            waktu_ambil: new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }),
            mode: 'simple',
            header_info: null 
        },
        total_lokasi: weatherData.length,
        hasil: weatherData
    };
}

/**
 * FUNGSI 2: SCRAPE MODE DETAIL (Slider/Card)
 */
function scrapeDetailData() {
    console.log("BMKG Reader: Scraping Mode Detail...");
    const weatherData = [];

    let lokasiUtama = "Lokasi Detail";
    const h1 = document.querySelector('h1');
    if (h1) {
        lokasiUtama = cleanText(h1.innerText.replace('Prakiraan Cuaca', ''));
    }

    // A. SCRAPE HEADER CARD ("Saat Ini")
    const headerCard = document.querySelector("div[class*='bg-[linear-gradient(151deg']");
    let headerInfo = null;

    if (headerCard) {
        const tempEl = headerCard.querySelector("p.font-bold[class*='text-[40px]'], p.font-bold[class*='text-[56px]']"); 
        const temp = tempEl ? tempEl.innerText : "-";

        const condEl = headerCard.querySelector("p.text-black-primary.font-medium");
        const cond = condEl ? condEl.innerText : "-";

        const grids = headerCard.querySelectorAll(".border-gray-stroke");
        let humidity = "-", wind = "-", dir = "-", vis = "-";

        if (grids.length >= 4) {
             // --- PERBAIKAN UTAMA DI SINI ---
             // Hapus label teks bawaan ("Kelembapan:", "Kecepatan Angin:", dll)
             // sebelum dibersihkan oleh cleanText()
             
             humidity = grids[0].textContent.replace(/Kelembapan:/i, '');
             wind = grids[1].textContent.replace(/Kecepatan Angin:/i, '');
             dir = grids[2].textContent.replace(/Arah Angin dari:/i, '');
             vis = grids[3].textContent.replace(/Jarak Pandang:/i, '');
        }

        headerInfo = {
            suhu: cleanText(temp),
            kondisi: cleanText(cond),
            kelembapan: cleanText(humidity),
            angin: cleanText(wind),
            arah: cleanText(dir),
            jarak_pandang: cleanText(vis)
        };
    }

    // B. SCRAPE SLIDER (Prakiraan Per Jam)
    const slides = document.querySelectorAll('.swiper-slide');
    const detailForecasts = [];

    if (slides.length > 0) {
        slides.forEach(slide => {
            let jam = "??:??";
            const allP = slide.querySelectorAll('p');
            for (let p of allP) {
                if (p.innerText.match(/WI(B|TA|T)/)) {
                    jam = p.innerText.trim();
                    break;
                }
            }

            let suhu = "-";
            const suhuEl = Array.from(allP).find(el => el.innerText.includes('°C'));
            if (suhuEl) suhu = suhuEl.innerText;

            let kondisi = "-";
            if (suhuEl && suhuEl.nextElementSibling) {
                 kondisi = suhuEl.nextElementSibling.innerText;
            }

            const detailsContainer = slide.querySelector('.bg-white-overlay');
            let kelembapan = "-", kecepatanAngin = "-", arahAngin = "-";

            if (detailsContainer && detailsContainer.children.length >= 3) {
                const rows = detailsContainer.children;
                
                const pHum = rows[0].querySelector('p');
                if (pHum) kelembapan = pHum.innerText;

                const pWind = rows[1].querySelector('p');
                if (pWind) kecepatanAngin = pWind.innerText;

                const pDir = rows[2].querySelector('p');
                if (pDir) arahAngin = pDir.innerText;
            }

            let cleanJam = cleanText(jam);
            if (cleanJam !== "??:??" && cleanJam !== "-" && cleanJam !== "") {
                detailForecasts.push({
                    tanggal: cleanJam,
                    kondisi: cleanText(kondisi),
                    suhu: cleanText(suhu),
                    kelembapan: cleanText(kelembapan),
                    angin: cleanText(kecepatanAngin),
                    arah: cleanText(arahAngin)
                });
            }
        });
    }

    weatherData.push({
        lokasi: lokasiUtama,
        prakiraan: detailForecasts
    });

    return {
        meta: {
            kecamatan: cleanText(lokasiUtama),
            waktu_ambil: new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }),
            mode: 'detail',
            header_info: headerInfo
        },
        total_lokasi: weatherData.length,
        hasil: weatherData
    };
}