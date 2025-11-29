// Mengizinkan user mengklik icon extension untuk membuka side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));