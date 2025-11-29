# 🌦️ BMKG Weather Data Reader & Scraper

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)
![Status](https://img.shields.io/badge/Status-Active-green)

Sebuah **Ekstensi Google Chrome** canggih untuk mengambil (scrape), memvisualisasikan, dan mengekspor data prakiraan cuaca dari situs resmi [BMKG](https://bmkg.go.id) secara real-time melalui Side Panel.

> **Catatan:** Ekstensi ini adalah alat bantu pihak ketiga (unofficial) dan tidak berafiliasi dengan BMKG.

---

## ✨ Fitur Utama

Ekstensi ini dirancang untuk kebutuhan analisis data dan pemantauan cuaca dengan fitur:

### 1. Dual Mode Scraping
- **Mode Sederhana:** Mengambil ringkasan prakiraan cuaca dari tabel daftar desa/kelurahan dalam satu kecamatan.
- **Mode Detail (Time Series):** Mengambil data mendalam per jam (Suhu, Kelembapan, Angin, Arah, Jarak Pandang) dari satu lokasi spesifik.

### 2. Visualisasi Data (Chart) 📈
Membaca angka deretan suhu bisa melelahkan. Ekstensi ini merender grafik interaktif menggunakan **HTML5 Canvas** untuk melihat tren:
- Suhu (°C)
- Kelembapan (%)
- Kecepatan Angin (km/jam)
- *Interactive Tooltip* saat grafik disorot mouse.

### 3. Otomatisasi Cerdas (Auto-Click Bot) 🤖
Pada **Mode Detail**, ekstensi secara otomatis menavigasi (mengklik) tombol tanggal yang tersedia di halaman BMKG untuk mengumpulkan dataset lengkap selama beberapa hari ke depan dalam sekali proses.

### 4. Ekspor Data & Manajemen
- **Download CSV:** Format siap pakai untuk Microsoft Excel atau Google Sheets (menggunakan pemisah titik koma `;`).
- **Download JSON:** Format standar untuk pengembang.
- **Pencarian Real-time:** Filter data berdasarkan lokasi atau kondisi cuaca langsung dari panel.

---

## 🚀 Cara Instalasi (Developer Mode)

Karena ekstensi ini belum tersedia di Chrome Web Store, Anda dapat menginstalnya secara manual:

1. **Download atau Clone** repositori ini ke komputer Anda.
   ```bash
   git clone [https://github.com/smallest87/bmkg-weather-reader.git](https://github.com/smallest87/bmkg-weather-reader.git)

 * Buka Google Chrome dan ketik chrome://extensions/ di address bar.
 * Aktifkan Developer mode (tombol di pojok kanan atas).
 * Klik tombol Load unpacked (Muat yang belum dikemas).
 * Pilih folder proyek yang baru saja Anda download.
 * Ekstensi siap digunakan! 🎉

---

## 📖 Cara Penggunaan
 * Buka situs Cuaca BMKG.
 * Navigasikan ke halaman wilayah yang ingin Anda ambil datanya:
   * Halaman Kecamatan (berisi tabel desa) -> Gunakan Mode Sederhana.
   * Halaman Desa/Kelurahan (berisi slider per jam) -> Gunakan Mode Detail.
 * Klik ikon ekstensi di toolbar Chrome untuk membuka Side Panel.
 * Pilih tab mode yang sesuai, lalu klik tombol "Ambil Data".
 * Tunggu proses selesai (Mode Detail akan menjalankan robot klik sejenak).
 * Analisis grafik atau unduh data via tombol CSV/JSON.

---

## 🛠️ Teknologi yang Digunakan
 * JavaScript (Vanilla): Tanpa framework berat, performa tinggi.
 * Chrome Extension Manifest V3: Menggunakan standar keamanan terbaru (Side Panel API, ActiveTab).
 * HTML5 Canvas: Untuk rendering grafik ringan tanpa library eksternal.
 * CSS3 (Flexbox & Grid): Untuk tata letak responsif.

---

## 📂 Struktur Proyek

```
BMKG_Reader/
├── background.js      # Service worker untuk mengaktifkan Side Panel
├── content.js         # Script utama untuk scraping DOM & Auto-click
├── sidepanel.html     # Antarmuka pengguna (UI)
├── sidepanel.js       # Logika UI, Charting, dan Export
├── manifest.json      # Konfigurasi ekstensi
└── icons/             # Aset gambar
```

---

## ⚠️ Disclaimer & Privasi

 * Ekstensi ini berjalan sepenuhnya di sisi klien (lokal). Tidak ada data pengguna yang dikirim ke server eksternal.
 * Penggunaan data hasil scraping harus mematuhi ketentuan layanan yang berlaku di situs sumber. Gunakan dengan bijak.

---

## 🤝 Kontribusi

Ingin menambahkan fitur baru? Silakan buat Pull Request!
 * Fork repositori ini.
 * Buat branch fitur baru (git checkout -b fitur-keren).
 * Commit perubahan Anda (git commit -m 'Menambahkan fitur keren').
 * Push ke branch (git push origin fitur-keren).
 * Buka Pull Request.
Dibuat dengan ❤️ oleh smallest87