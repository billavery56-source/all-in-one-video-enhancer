// sw.js - MV3 service worker
// Listens for Alt+Shift+B command and tells the active tab to open the blacklist dialog.

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "aive_open_blacklist") return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id) return;

    // Send a message to the content script to open the dialog
    chrome.tabs.sendMessage(tab.id, { type: "AIVE_OPEN_BLACKLIST_DIALOG" }, () => {
      // If the page can't receive messages (chrome:// pages, etc.), ignore silently
      // You could read chrome.runtime.lastError here if you want to log it.
    });
  } catch (e) {
    // ignore
  }
});
