// popup.js
// Ensure the content script and CSS are injected even if the site access is "on click".
async function getActiveTab() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve((tabs && tabs[0]) || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function requestOriginPermission(url) {
  try {
    const u = new URL(url);
    const origin = `${u.protocol}//${u.hostname}`;
    const pattern = origin + "/*";
    const has = await chrome.permissions.contains({ origins: [pattern] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function getAllFrames(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.webNavigation.getAllFrames({ tabId }, (frames) => resolve(frames || []));
    } catch {
      resolve([]);
    }
  });
}

async function injectIntoTab(tabId, url) {
  // Try to inject into all frames; request per-origin rights where needed
  const frames = await getAllFrames(tabId);
  const frameIds = frames.map((f) => f.frameId).filter((id) => typeof id === 'number');
  const origins = Array.from(new Set(
    frames
      .map((f) => {
        try { const u = new URL(f.url); return `${u.protocol}//${u.hostname}`; } catch { return null; }
      })
      .filter(Boolean)
  ));
  // Request access for frame origins (optional)
  for (const origin of origins) {
    try { await chrome.permissions.request({ origins: [origin + '/*'] }); } catch {}
  }
  // Always inject top-frame as a baseline (modular CSS)
  const cssFiles = [
    "styles/aive/background.css",
    "styles/aive/fonts.css",
    "styles/aive/content.css",
    "styles/aive/image.css",
  ];
  for (const f of cssFiles) {
    try { await chrome.scripting.insertCSS({ target: { tabId }, files: [f] }); } catch {}
  }
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ["scripts/content.js"] }); } catch {}
  // Then target known frames for stubborn players
  for (const fid of frameIds) {
    for (const f of cssFiles) {
      try { await chrome.scripting.insertCSS({ target: { tabId, frameIds: [fid] }, files: [f] }); } catch {}
    }
    try { await chrome.scripting.executeScript({ target: { tabId, frameIds: [fid] }, files: ["scripts/content.js"] }); } catch {}
  }
}

async function ensureInjected() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  // Try to request origin permission for reliability; even if denied, activeTab lets us inject in the main page
  if (tab.url) await requestOriginPermission(tab.url);
  await injectIntoTab(tab.id, tab.url || "");
  // Force panel to appear (do not toggle to avoid hiding if already visible)
  try { await chrome.tabs.sendMessage(tab.id, { type: "FORCE_SHOW" }); } catch {}
}

// Messaging helpers
function sendToActiveTab(message) {
  getActiveTab().then((tab) => {
    if (tab && tab.id) {
      try { await chrome.tabs.sendMessage(tab.id, message); } catch {}
    }
  });
}

// Wire UI
document.addEventListener("DOMContentLoaded", () => {
  // Auto-inject when popup opens
  ensureInjected();

  document.getElementById("resetAll")?.addEventListener("click", () => {
    sendToActiveTab({ type: "RESET_ALL" });
  });

  document.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    if (k === "h" && !e.shiftKey) sendToActiveTab({ type: "MIRROR_H" });
    if (k === "h" && e.shiftKey) sendToActiveTab({ type: "RESET_MIRROR_H" });
    if (k === "v" && !e.shiftKey) sendToActiveTab({ type: "MIRROR_V" });
    if (k === "v" && e.shiftKey) sendToActiveTab({ type: "RESET_MIRROR_V" });
    if (k === "r") sendToActiveTab({ type: "RESET_ALL" });
  });
});
