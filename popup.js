document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Pastikan kita ada di URL yang benar
    if (!tab.url.includes("bmkg.go.id")) {
        document.getElementById('status').innerText = "Bukan halaman BMKG!";
        return;
    }

    document.getElementById('status').innerText = "Sedang mengambil data...";

    // Kirim pesan ke content script untuk mulai scraping
    chrome.tabs.sendMessage(tab.id, { action: "scrape_weather" }, (response) => {
        if (chrome.runtime.lastError) {
            document.getElementById('output').innerText = "Error: Refresh halaman dulu.";
        } else {
            // Tampilkan hasil di popup
            document.getElementById('status').innerText = "Selesai.";
            document.getElementById('output').innerText = JSON.stringify(response, null, 2);
        }
    });
});