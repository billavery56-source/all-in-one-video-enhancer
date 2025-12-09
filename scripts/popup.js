// popup.js for All-in-One Video Enhancer (AIVE)

function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve((tabs && tabs[0]) || null);
    });
  });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function loadBlacklist() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["aive-blacklist-v1"], (res) => {
      const list = res["aive-blacklist-v1"];
      resolve(Array.isArray(list) ? list : []);
    });
  });
}

function saveBlacklist(list) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ "aive-blacklist-v1": list }, resolve);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const siteLine = document.getElementById("site-line");
  const statusEl = document.getElementById("status");
  const pauseBtn = document.getElementById("pause-btn");
  const disableBtn = document.getElementById("disable-btn");
  const enableBtn = document.getElementById("enable-btn");
  const helpBtn = document.getElementById("help-btn");
  const helpPanel = document.getElementById("help-panel");

  // Help toggle
  if (helpBtn && helpPanel) {
    helpBtn.addEventListener("click", () => {
      const visible = helpPanel.style.display === "block";
      helpPanel.style.display = visible ? "none" : "block";
    });
  }

  const tab = await getCurrentTab();
  if (!tab || !tab.url) {
    siteLine.textContent = "Site: (no active tab)";
    pauseBtn.disabled = true;
    disableBtn.disabled = true;
    enableBtn.disabled = true;
    statusEl.textContent = "";
    return;
  }

  const host = getHostname(tab.url);
  if (!host) {
    siteLine.textContent = "Site: (unknown)";
  } else {
    siteLine.textContent = `Site: ${host}`;
  }

  let blacklist = await loadBlacklist();

  function updateSiteStatus() {
    if (!host) {
      statusEl.textContent = "";
      disableBtn.disabled = true;
      enableBtn.disabled = true;
      return;
    }
    const blocked = blacklist.includes(host);
    disableBtn.disabled = blocked;
    enableBtn.disabled = !blocked;
    statusEl.textContent = blocked
      ? "AIVE is currently disabled on this site."
      : "AIVE is enabled on this site.";
  }

  updateSiteStatus();

  // Temporarily pause / resume AIVE on this tab
  pauseBtn.addEventListener("click", async () => {
    if (!tab || !tab.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SLEEP" });
      statusEl.textContent = "Toggled AIVE pause for this tab.";
    } catch (e) {
      statusEl.textContent = "AIVE is not active on this page.";
    }
  });

  // Permanently disable AIVE on this site (blacklist)
  disableBtn.addEventListener("click", async () => {
    if (!host) return;
    blacklist = await loadBlacklist();
    if (!blacklist.includes(host)) {
      blacklist.push(host);
      await saveBlacklist(blacklist);
    }
    updateSiteStatus();

    // Optionally also pause effects on the current tab
    if (tab && tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SLEEP" });
      } catch {}
    }
  });

  // Re-enable AIVE for this site (remove from blacklist)
  enableBtn.addEventListener("click", async () => {
    if (!host) return;
    blacklist = await loadBlacklist();
    blacklist = blacklist.filter((h) => h !== host);
    await saveBlacklist(blacklist);
    updateSiteStatus();
  });
});
