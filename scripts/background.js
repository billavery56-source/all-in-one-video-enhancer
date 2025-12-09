// MV3 service worker for keyboard shortcuts and context menu injection

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

// Domains where we never want to auto-inject (extra safety)
const STREAMING_DOMAINS = [
  'netflix.com',
  'nflxvideo.net',
  'primevideo.com',
  'amazonvideo.com',
  'disneyplus.com',
  'hulu.com',
  'max.com',
  'hbomax.com',
  'paramountplus.com',
  'peacocktv.com',
  'starz.com',
  'showtime.com',
  'crunchyroll.com',
];

// Synchronous helper for quick streaming checks (for webNavigation + tab.url)
function urlIsStreaming(url) {
  try {
    const u = new URL(url);
    const host = (u.hostname || '').toLowerCase();

    const match = (h, pat) => h === pat || h.endsWith('.' + pat);

    return STREAMING_DOMAINS.some((d) => match(host, d));
  } catch {
    return false;
  }
}

// Read user blacklist and check a URL against it (includes built-in entries)
async function isUrlBlocked(url) {
  try {
    const u = new URL(url);
    const host = (u.hostname || '').toLowerCase();

    const { ['aive-blacklist-v1']: userBlk = [] } = await new Promise((resolve) => {
      try {
        chrome.storage.local.get(['aive-blacklist-v1'], (res) => resolve(res || {}));
      } catch {
        resolve({});
      }
    });

    const builtin = [
      'yahoo.com',
      ...STREAMING_DOMAINS, // all the big streamers are built-in blocked
    ];

    const list = Array.from(new Set([...(userBlk || []), ...builtin]))
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean);

    const match = (h, pat) => {
      if (!pat) return false;
      if (pat.startsWith('*.')) {
        const d = pat.slice(2);
        return h === d || h.endsWith('.' + d);
      }
      return h === pat || h.endsWith('.' + pat);
    };

    return list.some((pat) => match(host, pat));
  } catch {
    return false;
  }
}

// Ping content to see if listener is alive
async function pingTab(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

async function requestOriginPermission(url) {
  try {
    const u = new URL(url);
    const origin = `${u.protocol}//${u.hostname}`;
    const pattern = origin + '/*';
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

async function injectEnhancer(tab) {
  if (!tab || !tab.id) return;

  // Extra safety: if somehow we got here on a streaming site, bail out
  try {
    if (tab.url && urlIsStreaming(tab.url)) {
      return;
    }
  } catch {}

  try {
    if (tab.url) {
      // Skip entirely if URL is blacklisted
      if (await isUrlBlocked(tab.url)) return;
      await requestOriginPermission(tab.url);
    }
  } catch {}

  // If a content listener is already alive, avoid redundant heavy injection
  if (await pingTab(tab.id)) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_SHOW' });
    } catch {}
    return;
  }

  const frames = await getAllFrames(tab.id);
  const frameIds = frames
    .map((f) => f.frameId)
    .filter((id) => typeof id === 'number');

  const origins = Array.from(
    new Set(
      frames
        .map((f) => {
          try {
            const u = new URL(f.url);
            return `${u.protocol}//${u.hostname}`;
          } catch {
            return null;
          }
        })
        .filter(Boolean),
    ),
  );

  for (const origin of origins) {
    try {
      await chrome.permissions.request({ origins: [origin + '/*'] });
    } catch {}
  }

  // Inject the minimal CSS and content script
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['styles/aive/minimal.css'],
    });
  } catch {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/content-minimal.js'],
    });
  } catch {}

  for (const fid of frameIds) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id, frameIds: [fid] },
        files: ['styles/aive/minimal.css'],
      });
    } catch {}

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [fid] },
        files: ['scripts/content-minimal.js'],
      });
    } catch {}
  }

  // Force show after injection — small delay to allow content script to boot
  await new Promise((r) => setTimeout(r, 200));
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_SHOW' });
  } catch {}

  // Minimal visual fallback in case content script injection failed silently
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          const id = 'aive-fallback-banner';
          if (document.getElementById(id)) return;
          const d = document.createElement('div');
          d.id = id;
          d.textContent = 'AIVE: injected';
          Object.assign(d.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            background: '#00e5ff',
            color: '#000',
            padding: '.4rem .7rem',
            borderRadius: '8px',
            border: '2px solid #00ffff',
            zIndex: '2147483647',
            boxShadow: '0 10px 30px rgba(0,0,0,.4)',
          });
          document.documentElement.appendChild(d);
          setTimeout(() => {
            try {
              d.remove();
            } catch {}
          }, 1800);
        } catch {}
      },
    });
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create(
    {
      id: 'aive_inject',
      title: 'Inject Video Enhancer',
      contexts: ['action', 'page'],
    },
    () => {
      if (chrome.runtime.lastError) {
        if (!chrome.runtime.lastError.message.includes('duplicate id')) {
          console.warn('contextMenus.create error:', chrome.runtime.lastError.message);
        }
      }
    },
  );
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'aive_inject') {
    await injectEnhancer(tab);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await getActiveTab();
  if (!tab) return;

  if (command === 'inject_enhancer') {
    await injectEnhancer(tab);
  } else if (command === 'reset_enhancer') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'RESET_ALL' });
    } catch {}
  } else if (command === 'toggle_sleep') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SLEEP' });
    } catch {}
  }
});
// Listen for pings from content script, popup commands, and set an action badge
chrome.runtime.onMessage.addListener((msg, sender) => {
  try {
    if (!msg || !msg.type) return;

    // ----- From popup: force inject on current tab -----
    if (msg.type === 'FORCE_INJECT') {
      (async () => {
        const tab = await getActiveTab();
        if (tab) {
          await injectEnhancer(tab);
        }
      })();
      return;
    }

    // ----- From popup: toggle sleep on current tab -----
    if (msg.type === 'TOGGLE_SLEEP') {
      (async () => {
        const tab = await getActiveTab();
        if (!tab) return;
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SLEEP' });
        } catch {}
      })();
      return;
    }

    // ----- From content script: say hello so we can show badge -----
    if (!sender || !sender.tab || !sender.tab.id) return;
    const tabId = sender.tab.id;

    if (msg.type === 'HELLO') {
      chrome.action.setBadgeText({ tabId, text: 'A' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#00e5ff' });
    }
  } catch {}
});

// Auto-inject on navigation so the button shows without any shortcut/click, throttled per tab
try {
  const lastInject = new Map(); // tabId -> {url, t}
  const COOLDOWN_MS = 1500;

  const injectForTabId = async (tabId) => {
    try {
      const tab = await new Promise((resolve) => chrome.tabs.get(tabId, resolve));
      if (!tab || !tab.id) return;

      // Extra guard: if this looks like a streaming site, do nothing
      if (tab.url && urlIsStreaming(tab.url)) return;

      const now = Date.now();
      const prev = lastInject.get(tab.id) || { url: '', t: 0 };
      if (prev.url === tab.url && now - prev.t < COOLDOWN_MS) return; // throttle duplicate events

      lastInject.set(tab.id, { url: tab.url, t: now });
      await injectEnhancer(tab);
    } catch {}
  };

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;

    // Extra early guard, based on the URL in the event itself
    if (details.url && urlIsStreaming(details.url)) return;

    injectForTabId(details.tabId);
  });
} catch {}
