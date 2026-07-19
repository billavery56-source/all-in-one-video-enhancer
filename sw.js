// sw.js - MV3 service worker
// Listens for Alt+Shift+B command and tells the active tab to open the blacklist dialog.

const EXT =
  typeof browser !== "undefined"
    ? browser
    : typeof chrome !== "undefined"
      ? chrome
      : null;

function queryTabs(query) {
  return new Promise((resolve) => {
    if (!EXT || !EXT.tabs || typeof EXT.tabs.query !== "function") {
      resolve([]);
      return;
    }

    try {
      const maybePromise = EXT.tabs.query(query, (tabs) => resolve(tabs || []));
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then((tabs) => resolve(tabs || [])).catch(() => resolve([]));
      }
    } catch {
      resolve([]);
    }
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    if (!EXT || !EXT.tabs || typeof EXT.tabs.sendMessage !== "function") {
      resolve();
      return;
    }

    try {
      const maybePromise = EXT.tabs.sendMessage(tabId, message, () => resolve());
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(() => resolve()).catch(() => resolve());
      }
    } catch {
      resolve();
    }
  });
}

if (EXT && EXT.commands && EXT.commands.onCommand) {
  EXT.commands.onCommand.addListener(async (command) => {
  if (command !== "aive_open_blacklist") return;

  try {
    const [tab] = await queryTabs({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id) return;

    // Send a message to the content script to open the dialog
    await sendTabMessage(tab.id, { type: "AIVE_OPEN_BLACKLIST_DIALOG" });
  } catch (e) {
    // ignore
  }
  });
}
