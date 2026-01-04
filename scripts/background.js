const BLACKLIST_KEY = "aive-blacklist-v1";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "AIVE_BLACKLIST_ADD") return;

  const domain = msg.domain;
  if (!domain) return;

  chrome.storage.local.get([BLACKLIST_KEY], res => {
    const list = new Set(res[BLACKLIST_KEY] || []);
    list.add(domain);

    const sorted = [...list].sort((a, b) => a.localeCompare(b));

    chrome.storage.local.set({ [BLACKLIST_KEY]: sorted }, () => {
      sendResponse({ ok: true });
    });
  });

  return true; // async response
});
