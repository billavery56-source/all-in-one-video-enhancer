document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("openBlacklist");
  if (!openBtn) return;

  openBtn.addEventListener("click", () => {
    // Ask background to open blacklist WITH current site
    chrome.runtime.sendMessage({ type: "OPEN_BLACKLIST" });
    window.close();
  });
});
