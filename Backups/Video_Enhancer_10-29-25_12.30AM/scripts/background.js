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

async function injectEnhancer(tab) {
	if (!tab || !tab.id) return;
	try {
		if (tab.url) await requestOriginPermission(tab.url);
	} catch {}
	const frames = await getAllFrames(tab.id);
	const frameIds = frames.map((f) => f.frameId).filter((id) => typeof id === 'number');
	const origins = Array.from(new Set(
		frames
			.map((f) => { try { const u = new URL(f.url); return `${u.protocol}//${u.hostname}`; } catch { return null; } })
			.filter(Boolean)
	));
	for (const origin of origins) {
		try { await chrome.permissions.request({ origins: [origin + '/*'] }); } catch {}
	}
	// Inject our modular CSS (top frame)
	const cssFiles = [
		"styles/aive/background.css",
		"styles/aive/fonts.css",
		"styles/aive/content.css",
		"styles/aive/image.css",
	];
	for (const f of cssFiles) {
		try { await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: [f] }); } catch {}
	}
	try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["scripts/content.js"] }); } catch {}
	for (const fid of frameIds) {
		for (const f of cssFiles) {
			try { await chrome.scripting.insertCSS({ target: { tabId: tab.id, frameIds: [fid] }, files: [f] }); } catch {}
		}
		try { await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [fid] }, files: ["scripts/content.js"] }); } catch {}
	}
	// Force show after injection
	try { await chrome.tabs.sendMessage(tab.id, { type: "FORCE_SHOW" }); } catch {}

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
						position: 'fixed', top: '10px', right: '10px',
						background: '#00e5ff', color: '#000',
						padding: '.4rem .7rem', borderRadius: '8px',
						border: '2px solid #00ffff', zIndex: '2147483647',
						boxShadow: '0 10px 30px rgba(0,0,0,.4)'
					});
					document.documentElement.appendChild(d);
					setTimeout(() => { try { d.remove(); } catch {} }, 1800);
				} catch {}
			}
		});
	} catch {}
}

chrome.runtime.onInstalled.addListener(() => {
	try {
		chrome.contextMenus.create({ id: "aive_inject", title: "Inject Video Enhancer", contexts: ["action", "page"] });
	} catch {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === "aive_inject") {
		await injectEnhancer(tab);
	}
});

chrome.commands.onCommand.addListener(async (command) => {
	const tab = await getActiveTab();
	if (!tab) return;
	if (command === "inject_enhancer") {
		await injectEnhancer(tab);
	} else if (command === "reset_enhancer") {
		try { await chrome.tabs.sendMessage(tab.id, { type: "RESET_ALL" }); } catch {}
	}
});

// Listen for pings from content script and set an action badge
chrome.runtime.onMessage.addListener((msg, sender) => {
	try {
		if (!sender || !sender.tab || !sender.tab.id) return;
		const tabId = sender.tab.id;
		if (msg && msg.type === 'HELLO') {
			chrome.action.setBadgeText({ tabId, text: 'A' });
			chrome.action.setBadgeBackgroundColor({ tabId, color: '#00e5ff' });
		}
	} catch {}
});

// Auto-inject on navigation so the button shows without any shortcut/click
try {
	const injectForTabId = async (tabId) => {
		try {
			const tab = await new Promise((resolve) => chrome.tabs.get(tabId, resolve));
			if (tab && tab.id) await injectEnhancer(tab);
		} catch {}
	};
	chrome.webNavigation.onCommitted.addListener((details) => {
		if (details.frameId === 0) injectForTabId(details.tabId);
	});
	chrome.webNavigation.onCompleted.addListener((details) => {
		if (details.frameId === 0) injectForTabId(details.tabId);
	});
} catch {}

