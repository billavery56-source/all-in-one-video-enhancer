// scripts/content-minimal.js
console.log("AIVE content script loaded", location.href);

/*
  AIVE – All-in-One Video Enhancer (content-minimal.js)

  SS2 ("classic") panel:
  - Full controls (Help, Target Video select, AutoTune/Reset/Hide, Disable Tab, Blacklist)
  - Quick Zoom (hold Z + wheel/click/right-click/drag)
  - Auto-collapse (unless pinned)
  - Collapsed header docks top/bottom (edge proximity or anchor button)

  Fixes:
  - Avoid running inside typical ad iframes (small / standard ad-slot sizes) but not overly strict
  - Auto video selection prefers visible/large player videos
  - IMPORTANT: Do NOT bail if no video at first paint (watch DOM until video appears)
*/

(() => {
  "use strict";
  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  let ALIVE = true;
  window.addEventListener("pagehide", () => (ALIVE = false), { once: true });
  window.addEventListener("beforeunload", () => (ALIVE = false), { once: true });

  // ----------------------------
  // Frame guard (avoid ad iframes)
  // ----------------------------
  function shouldRunInThisFrame() {
    try {
      // Main page is fine
      if (window.top === window.self) return true;

      // In an iframe: allow only if it looks like a legit embedded player
      const fe = window.frameElement;
      if (!fe) return false;

      const r = fe.getBoundingClientRect();
      const w = Math.round(r.width || window.innerWidth || 0);
      const h = Math.round(r.height || window.innerHeight || 0);

      // Too small to be a real player
      if (w < 420 || h < 240) return false;

      // Common ad slot sizes (tolerance +/- 10px)
      const adSizes = [
        [300, 250],
        [336, 280],
        [728, 90],
        [970, 90],
        [970, 250],
        [160, 600],
        [300, 600],
        [320, 50],
        [468, 60],
        [250, 250],
        [200, 200],
        [180, 150],
        [400, 300]
      ];
      for (const [aw, ah] of adSizes) {
        if (Math.abs(w - aw) <= 10 && Math.abs(h - ah) <= 10) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  if (!shouldRunInThisFrame()) return;

  const STORE =
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.local &&
    typeof chrome.storage.local.get === "function"
      ? chrome.storage.local
      : null;

  const get = (keys) =>
    new Promise((resolve) => {
      if (!STORE) return resolve({});
      try {
        STORE.get(keys, (res) => resolve(res || {}));
      } catch {
        resolve({});
      }
    });

  const set = (obj) =>
    new Promise((resolve) => {
      if (!STORE) return resolve();
      try {
        STORE.set(obj, () => resolve());
      } catch {
        resolve();
      }
    });

  const EDGE = 8;

  const POS_KEY = "__aive_panel_pos__";
  const PIN_KEY = "__aive_panel_pinned__";
  const OPEN_KEY = "__aive_panel_open__";
  const ANCHOR_KEY = "__aive_panel_anchor__";
  const BL_KEY = "__aive_blacklist__";
  const DISABLED_KEY = "__aive_disabled_hosts__";

  let ROOT = null;
  let open = true; // expanded/collapsed
  let pinned = false;
  let anchorMode = "bottom"; // "top" | "bottom"

  const state = {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    sepia: 0,
    sharpen: 0,
    zoom: 0,
    flip: false
  };

  let vSel = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  function formatNum(n) {
    if (!Number.isFinite(n)) return "0";
    const x = Math.round(n * 100) / 100;
    return String(x).replace(/(\.\d*[1-9])0+$|\.0+$/, "$1");
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function toast(msg, ms = 900) {
    try {
      if (!document.body) return;
      let el = document.getElementById("__aive_toast__");
      if (!el) {
        el = document.createElement("div");
        el.id = "__aive_toast__";
        el.style.cssText = `
          position: fixed;
          left: 50%;
          top: 14px;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.82);
          color: #fff;
          padding: 8px 10px;
          border-radius: 10px;
          font: 800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          z-index: 2147483647;
          pointer-events: none;
          opacity: 0;
          transition: opacity 140ms ease;
        `;
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.opacity = "1";
      clearTimeout(el.__t);
      el.__t = setTimeout(() => (el.style.opacity = "0"), ms);
    } catch {}
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  async function getList(key) {
    const res = await get([key]);
    const arr = Array.isArray(res[key]) ? res[key] : [];
    return arr.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
  }

  async function setList(key, list) {
    const clean = (Array.isArray(list) ? list : [])
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim());
    await set({ [key]: clean });
  }

  async function isDisabledHost() {
    const host = hostOf(location.href);
    if (!host) return false;
    const list = await getList(DISABLED_KEY);
    return list.includes(host);
  }

  async function isBlacklistedHost() {
    const host = hostOf(location.href);
    if (!host) return false;
    const list = await getList(BL_KEY);
    return list.includes(host);
  }

  // ----------------------------
  // Video discovery / selection
  // ----------------------------
  let _cachedCandidates = [];
  let _cachedAt = 0;

  function getCandidateVideos() {
    const t = now();
    if (t - _cachedAt < 250) return _cachedCandidates;
    _cachedAt = t;

    const vids = Array.from(document.querySelectorAll("video"));
    const good = [];

    for (const v of vids) {
      try {
        if (!v || !v.getBoundingClientRect) continue;

        const r = v.getBoundingClientRect();

        // Don’t be too strict: real players can be small-ish
        if (r.width < 160 || r.height < 120) continue;

        const cs = getComputedStyle(v);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;

        // Must be at least partly on screen
        const visible =
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < (window.innerHeight || 0) &&
          r.left < (window.innerWidth || 0);
        if (!visible) continue;

        good.push(v);
      } catch {}
    }

    _cachedCandidates = good;
    return good;
  }

  function scoreVideo(v) {
    try {
      const r = v.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0;

      // Prefer: biggest + ready + playing
      const readyBonus = (v.readyState || 0) >= 2 ? 1 : 0;
      const playingBonus = !v.paused ? 1 : 0;

      return (visible ? 1e12 : 0) + area + readyBonus * 1e8 + playingBonus * 1e7;
    } catch {
      return -1;
    }
  }

  function pickAutoVideo() {
    const vids = getCandidateVideos();
    if (!vids.length) return null;

    let best = vids[0];
    let bestScore = scoreVideo(best);
    for (let i = 1; i < vids.length; i++) {
      const s = scoreVideo(vids[i]);
      if (s > bestScore) {
        bestScore = s;
        best = vids[i];
      }
    }
    return best;
  }

  function ensureSelectedVideoStillValid() {
    if (!vSel) return false;
    try {
      if (!document.contains(vSel)) return false;
      const r = vSel.getBoundingClientRect();
      if (r.width < 120 || r.height < 90) return false;
      return true;
    } catch {
      return false;
    }
  }

  function setSelectedVideo(v) {
    vSel = v || null;
    updateTargetStatus();
    applyEffects();
  }

  function cycleVideo(dir) {
    const vids = getCandidateVideos();
    if (!vids.length) return;

    if (!vSel || !vids.includes(vSel)) {
      setSelectedVideo(pickAutoVideo() || vids[0]);
      return;
    }
    const idx = vids.indexOf(vSel);
    setSelectedVideo(vids[(idx + dir + vids.length) % vids.length]);
  }

  // ----------------------------
  // Effects
  // ----------------------------
  function setOriginFromPoint(v, clientX, clientY) {
    const r = v.getBoundingClientRect();
    const ox = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
    const oy = clamp((clientY - r.top) / Math.max(1, r.height), 0, 1);
    v.style.transformOrigin = `${(ox * 100).toFixed(2)}% ${(oy * 100).toFixed(2)}%`;
  }

  function applyEffects() {
    const v = ensureSelectedVideoStillValid() ? vSel : pickAutoVideo();
    if (!v) return;
    if (!vSel) vSel = v;

    const filters = [
      `brightness(${state.brightness})`,
      `contrast(${state.contrast})`,
      `saturate(${state.saturation})`,
      `hue-rotate(${state.hue}deg)`,
      `sepia(${state.sepia})`
    ];

    const sharp = clamp(state.sharpen, 0, 1);
    if (sharp > 0) {
      // mild perceived sharpen
      filters.push(`contrast(${1 + sharp * 0.18})`);
      filters.push(`drop-shadow(0 0 ${sharp * 0.6}px rgba(255,255,255,0.14))`);
    }

    v.style.filter = filters.join(" ");

    const sx = state.flip ? -1 : 1;
    const scale = clamp(1 + state.zoom, 1, 3);

    if (!v.style.transformOrigin) {
      v.style.transformOrigin = "50% 50%";
    }

    if (scale === 1 && sx === 1) {
      v.style.transform = "none";
    } else if (sx === 1) {
      v.style.transform = `scale(${scale})`;
    } else {
      v.style.transform = `scale(${scale}) scaleX(${sx})`;
    }

    v.style.willChange = "transform, filter";
  }

  // ----------------------------
  // CSS
  // ----------------------------
  function injectStyleOnce() {
    if (document.getElementById("__aive_css__")) return;
    const s = document.createElement("style");
    s.id = "__aive_css__";
    s.textContent = `
#aive-root{
  position:fixed;
  left:${EDGE}px;
  top:${EDGE}px;
  width:360px;
  z-index:2147483646;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  user-select:none;
  pointer-events:auto;
  transition: height 180ms ease, top 180ms ease, bottom 180ms ease;
}
#aive-root, #aive-root *{ box-sizing:border-box; }

#aive-root .aive-panel{
  height:100%;
  display:flex;
  flex-direction:column;
  overflow:hidden;
  border-radius:14px;
  border:1px solid rgba(255,255,255,0.14);
  background:rgba(15,17,21,0.92);
  color:#e9eef7;
  box-shadow:0 12px 34px rgba(0,0,0,0.55);
  backdrop-filter: blur(8px);
}

#aive-root .aive-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  padding:7px 10px;
  font-weight:900;
  font-size:12px;
  letter-spacing:0.2px;
  border-bottom:1px solid rgba(255,255,255,0.10);
  background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0));
  cursor:grab;
}
#aive-root .aive-header:active{ cursor:grabbing; }

#aive-root .aive-header-actions{
  display:flex;
  align-items:center;
  gap:7px;
}

#aive-root .aive-pin,
#aive-root .aive-help,
#aive-root .aive-anchor-btn,
#aive-root .aive-blacklist,
#aive-root .aive-close{
  border:1px solid rgba(255,255,255,0.14);
  background:rgba(255,255,255,0.06);
  color:#e9eef7;
  border-radius:999px;
  padding:5px 10px;
  font-weight:900;
  font-size:12px;
  cursor:pointer;
  line-height:1;
}
#aive-root .aive-pin:hover,
#aive-root .aive-help:hover,
#aive-root .aive-anchor-btn:hover,
#aive-root .aive-blacklist:hover,
#aive-root .aive-close:hover{ background:rgba(255,255,255,0.10); }
#aive-root.aive-pinned .aive-pin{ color:#ffd36a; }

#aive-root .aive-body{
  flex:1 1 auto;
  min-height:0;
  overflow:auto;
  padding:8px;
  display:grid;
  gap:6px;
}

#aive-root .aive-row{
  display:grid;
  gap:4px;
  padding:6px 6px;
  border-radius:12px;
  background:rgba(255,255,255,0.02);
  border:1px solid rgba(255,255,255,0.06);
}

#aive-root label{
  font-size:11px;
  font-weight:850;
  color:rgba(233,238,247,0.92);
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap:8px;
  line-height:1.1;
}

#aive-root .aive-val{
  font-size:9.5px;
  font-weight:900;
  color:rgba(233,238,247,0.72);
  border:1px solid rgba(255,255,255,0.08);
  background:rgba(0,0,0,0.25);
  border-radius:999px;
  padding:1px 6px;
}

#aive-root input[type="range"]{
  width:100%;
  margin:0;
  accent-color:#d0645a;
}

#aive-root button{
  border:1px solid rgba(255,255,255,0.14);
  background:rgba(255,255,255,0.06);
  color:#e9eef7;
  border-radius:12px;
  padding:7px 10px;
  font-weight:850;
  font-size:12px;
  cursor:pointer;
  line-height:1;
}
#aive-root button:hover{ background:rgba(255,255,255,0.10); }
#aive-root button:active{ transform:translateY(1px); }

#aive-root .aive-target-controls{
  display:flex;
  gap:6px;
  align-items:center;
  justify-content:space-between;
}
#aive-root .aive-target-controls .aive-target-status{
  margin-left:auto;
  font-size:11px;
  font-weight:900;
  opacity:0.9;
}

#aive-root .aive-buttons{
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:6px;
}

#aive-root .aive-helpbox{
  font-size:11px;
  line-height:1.1;
  color:rgba(233,238,247,0.75);
  padding-top:6px;
  border-top:1px solid rgba(255,255,255,0.06);
}
    `;
    document.documentElement.appendChild(s);
  }

  function slider(label, key, min, max, step, val) {
    const v = Number(val);
    return `
      <div class="aive-row">
        <label>${label} <span class="aive-val">${formatNum(v)}</span></label>
        <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${v}">
      </div>
    `;
  }

  // ----------------------------
  // OPEN/COLLAPSE docking logic
  // ----------------------------
  function getHeaderHeight() {
    if (!ROOT) return 44;
    const h = ROOT.querySelector(".aive-header")?.getBoundingClientRect?.().height;
    return Math.max(38, Math.round(h || 44));
  }

  function getCollapseDock() {
    return anchorMode;
  }

  function setRootExpanded(isExpanded) {
    if (!ROOT) return;

    open = !!isExpanded;
    const headerH = getHeaderHeight();
    const dock = open ? anchorMode : getCollapseDock();

    if (dock === "bottom") {
      ROOT.style.top = "auto";
      ROOT.style.bottom = EDGE + "px";
    } else {
      ROOT.style.top = EDGE + "px";
      ROOT.style.bottom = "auto";
    }

    if (open) {
      ROOT.style.height = "auto";
      ROOT.style.maxHeight = `calc(100vh - ${EDGE * 2}px)`;
      ROOT.style.overflow = "visible";
    } else {
      ROOT.style.height = headerH + "px";
      ROOT.style.maxHeight = headerH + "px";
      ROOT.style.overflow = "hidden";
    }

    persistPosition();
  }

  function ensureLeftClamped() {
    if (!ROOT) return;
    const vw = window.innerWidth || 0;
    let left = parseInt(ROOT.style.left || `${EDGE}`, 10);
    if (!Number.isFinite(left)) left = EDGE;
    const maxLeft = Math.max(EDGE, vw - ROOT.offsetWidth - EDGE);
    ROOT.style.left = clamp(left, EDGE, maxLeft) + "px";
  }

  async function persistPosition() {
    if (!ROOT) return;
    const left = Math.round(ROOT.getBoundingClientRect().left);
    await set({
      [POS_KEY]: { left },
      [PIN_KEY]: !!pinned,
      [OPEN_KEY]: !!open,
      [ANCHOR_KEY]: anchorMode
    });
  }

  async function restorePosition() {
    const res = await get([POS_KEY, PIN_KEY, OPEN_KEY, ANCHOR_KEY]);
    pinned = !!res[PIN_KEY];
    open = res[OPEN_KEY] !== undefined ? !!res[OPEN_KEY] : true;
    anchorMode = res[ANCHOR_KEY] === "top" ? "top" : "bottom";

    const pos = res[POS_KEY];
    const left = pos && typeof pos.left === "number" ? pos.left : EDGE;

    if (!ROOT) return;
    ROOT.style.left = left + "px";
    ensureLeftClamped();

    ROOT.classList.toggle("aive-pinned", pinned);
    const ab = ROOT.querySelector(".aive-anchor-btn");
    if (ab) ab.textContent = anchorMode === "bottom" ? "Bottom" : "Top";

    if (pinned) setRootExpanded(true);
    else setRootExpanded(open);
  }

  // ----------------------------
  // Target status
  // ----------------------------
  function updateTargetStatus() {
    if (!ROOT) return;
    const status = ROOT.querySelector(".aive-target-status");
    const pill = ROOT.querySelector(".aive-target-pill");
    const vids = getCandidateVideos();
    const total = vids.length;

    if (!status || !pill) return;

    if (!total) {
      status.textContent = "None";
      pill.textContent = "None";
      return;
    }

    if (!vSel) {
      status.textContent = `Auto (${total})`;
      pill.textContent = `Auto (${total})`;
      return;
    }

    const idx = vids.indexOf(vSel);
    if (idx >= 0) {
      status.textContent = `Sel ${idx + 1}/${total}`;
      pill.textContent = `Sel ${idx + 1}/${total}`;
    } else {
      status.textContent = `Sel (${total})`;
      pill.textContent = `Sel (${total})`;
    }
  }

  // ----------------------------
  // Presets
  // ----------------------------
  function autoTune() {
    state.brightness = 1.02;
    state.contrast = 1.08;
    state.saturation = 1.06;
    state.hue = 0;
    state.sepia = 0;
    state.sharpen = 0.15;
    state.zoom = clamp(state.zoom, 0, 2);
    applyEffects();
    syncSlidersFromState();
    toast("Auto");
  }

  function resetAll() {
    state.brightness = 1;
    state.contrast = 1;
    state.saturation = 1;
    state.hue = 0;
    state.sepia = 0;
    state.sharpen = 0;
    state.zoom = 0;
    state.flip = false;
    applyEffects();
    syncSlidersFromState();
    toast("Reset");
  }

  function syncSlidersFromState() {
    if (!ROOT) return;
    for (const k of Object.keys(state)) {
      const inp = ROOT.querySelector(`input[data-key="${k}"]`);
      if (!inp) continue;
      inp.value = String(state[k]);
      const val = inp.closest(".aive-row")?.querySelector(".aive-val");
      if (val) val.textContent = formatNum(Number(inp.value));
    }
    const flipVal = ROOT.querySelector(".aive-flip")?.closest(".aive-row")?.querySelector(".aive-val");
    if (flipVal) flipVal.textContent = state.flip ? "On" : "Off";
  }

  // ----------------------------
  // Dialogs
  // ----------------------------
  function openHelpDialog() {
    if (!document.body) return;

    const ovl = document.createElement("div");
    ovl.style.cssText = `
      position:fixed; inset:0;
      background:rgba(0,0,0,0.55);
      z-index:2147483647;
      display:grid; place-items:center;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width:min(760px, 92vw);
      max-height:min(84vh, 900px);
      overflow:auto;
      border-radius:16px;
      border:1px solid rgba(255,255,255,0.14);
      background:#0f1115;
      color:#e9eef7;
      box-shadow:0 18px 54px rgba(0,0,0,0.65);
      padding:12px 14px;
    `;

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <div style="font-weight:900;">AIVE Help</div>
        <button data-x style="border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#e9eef7;border-radius:10px;padding:6px 10px;font-weight:900;cursor:pointer;">✕</button>
      </div>
      <div style="font-size:12px;line-height:1.25;opacity:0.92;display:grid;gap:10px;">
        <div><b>Quick Zoom</b>: hold <b>Z</b> then use wheel/click/right-click/drag on the video.</div>
        <div><b>Auto-collapse</b>: collapses to header when mouse leaves (unless pinned).</div>
        <div><b>Docking</b>: collapsed header docks to top/bottom based on edge proximity or the Top/Bottom button.</div>
        <div><b>Target Video</b>: use ◀/▶ to cycle, Sel to lock to a specific video, Auto to return to auto-pick.</div>
      </div>
    `;
    ovl.appendChild(card);
    document.body.appendChild(ovl);

    const close = () => ovl.remove();
    card.querySelector("[data-x]").onclick = close;
    ovl.addEventListener("click", (e) => {
      if (e.target === ovl) close();
    });
  }

  function openBlacklistDialog() {
    if (!document.body) return;
    const host = hostOf(location.href);

    const ovl = document.createElement("div");
    ovl.style.cssText = `
      position:fixed; inset:0;
      background:rgba(0,0,0,0.55);
      z-index:2147483647;
      display:grid; place-items:center;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width:min(560px, 92vw);
      max-height:min(84vh, 900px);
      overflow:hidden;
      border-radius:16px;
      border:1px solid rgba(255,255,255,0.14);
      background:#0f1115;
      color:#e9eef7;
      box-shadow:0 18px 54px rgba(0,0,0,0.65);
      display:flex; flex-direction:column;
    `;

    const top = document.createElement("div");
    top.style.cssText = `
      padding:10px 12px;
      display:flex; align-items:center; justify-content:space-between;
      border-bottom:1px solid rgba(255,255,255,0.10);
      font-weight:900;
    `;
    top.innerHTML = `<span>Blacklist</span><button data-x style="border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#e9eef7;border-radius:10px;padding:6px 10px;font-weight:900;cursor:pointer;">✕</button>`;

    const body = document.createElement("div");
    body.style.cssText = `padding:12px; display:grid; gap:10px;`;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = `display:flex; gap:8px; flex-wrap:wrap;`;
    btnRow.innerHTML = `
      <button data-add style="flex:1; min-width:180px;">Add current (${host || "unknown"})</button>
      <button data-remove style="flex:1; min-width:180px;">Remove current</button>
    `;

    const ta = document.createElement("textarea");
    ta.spellcheck = false;
    ta.style.cssText = `
      width:100%;
      height:180px;
      resize:vertical;
      background:#171a21;
      color:#e9eef7;
      border:1px solid rgba(255,255,255,0.14);
      border-radius:12px;
      padding:10px;
      font: 700 12px/1.25 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    `;

    const save = document.createElement("button");
    save.textContent = "Save";
    save.style.cssText = `width:100%;`;

    for (const b of [btnRow.querySelector("[data-add]"), btnRow.querySelector("[data-remove]"), save]) {
      if (!b) continue;
      b.style.border = "1px solid rgba(255,255,255,0.14)";
      b.style.background = "rgba(255,255,255,0.06)";
      b.style.color = "#e9eef7";
      b.style.borderRadius = "12px";
      b.style.padding = "10px 12px";
      b.style.fontWeight = "900";
      b.style.cursor = "pointer";
    }

    body.appendChild(btnRow);
    body.appendChild(ta);
    body.appendChild(save);

    card.appendChild(top);
    card.appendChild(body);
    ovl.appendChild(card);
    document.body.appendChild(ovl);

    const close = () => ovl.remove();
    top.querySelector("[data-x]").onclick = close;
    ovl.addEventListener("click", (e) => {
      if (e.target === ovl) close();
    });

    (async () => {
      const list = await getList(BL_KEY);
      ta.value = list.join("\n");
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    })();

    btnRow.querySelector("[data-add]").onclick = async () => {
      if (!host) return;
      const list = await getList(BL_KEY);
      if (!list.includes(host)) list.push(host);
      ta.value = list.join("\n");
      toast("Added");
    };

    btnRow.querySelector("[data-remove]").onclick = async () => {
      if (!host) return;
      const list = await getList(BL_KEY);
      ta.value = list.filter((x) => x !== host).join("\n");
      toast("Removed");
    };

    save.onclick = async () => {
      const lines = ta.value
        .split(/\r?\n/g)
        .map((s) => s.trim())
        .filter(Boolean);
      await setList(BL_KEY, lines);
      toast("Saved");
      close();
    };
  }

  async function disableThisHost() {
    const host = hostOf(location.href);
    if (!host) return;
    const list = await getList(DISABLED_KEY);
    if (!list.includes(host)) list.push(host);
    await setList(DISABLED_KEY, list);
    toast("Disabled on this host");
    removePanel();
  }

  // ----------------------------
  // Panel HTML
  // ----------------------------
  function createPanel() {
    injectStyleOnce();

    ROOT = document.createElement("div");
    ROOT.id = "aive-root";
    if (pinned) ROOT.classList.add("aive-pinned");

    ROOT.innerHTML = `
      <div class="aive-panel">
        <div class="aive-header">
          <span class="aive-title">AIVE</span>
          <span class="aive-header-actions">
            <button class="aive-pin" type="button" title="Pin (stay open)">📌</button>
            <button class="aive-anchor-btn" type="button" title="Dock side">${anchorMode === "bottom" ? "Bottom" : "Top"}</button>
            <button class="aive-help" type="button" title="Help">?</button>
            <button class="aive-blacklist" type="button" title="Blacklist">B</button>
            <button class="aive-close" type="button" title="Close">✕</button>
          </span>
        </div>

        <div class="aive-body">
          ${slider("Brightness", "brightness", 0, 2, 0.01, 1)}
          ${slider("Contrast", "contrast", 0, 2, 0.01, 1)}
          ${slider("Saturation", "saturation", 0, 2, 0.01, 1)}
          ${slider("Hue", "hue", 0, 360, 0.5, 0)}
          ${slider("Sepia", "sepia", 0, 1, 0.01, 0)}
          ${slider("Sharpen", "sharpen", 0, 1, 0.01, 0)}
          ${slider("Zoom", "zoom", 0, 2, 0.01, 0)}

          <div class="aive-row">
            <label>Flip Horizontal <span class="aive-val">${state.flip ? "On" : "Off"}</span></label>
            <button class="aive-flip" type="button">Flip</button>
          </div>

          <div class="aive-row">
            <label>Target Video <span class="aive-val aive-target-pill">Auto</span></label>
            <div class="aive-target-controls">
              <button class="aive-target-prev" type="button" title="Previous">◀</button>
              <button class="aive-target-auto" type="button" title="Auto">Auto</button>
              <button class="aive-target-next" type="button" title="Next">▶</button>
              <button class="aive-target-selector" type="button" title="Select">Sel</button>
              <span class="aive-target-status">Auto</span>
            </div>
          </div>

          <div class="aive-buttons">
            <button class="aive-auto" type="button" title="Auto Tune">Auto</button>
            <button class="aive-reset" type="button" title="Reset">Reset</button>
            <button class="aive-hide" type="button" title="Hide Tab">Hide Tab</button>
          </div>

          <div class="aive-helpbox">
            Quick Zoom: hold <b>Z</b> + wheel/click/right-click/drag on video.<br>
            Blacklist: click <b>B</b> or press <b>Alt+Shift+B</b>.
          </div>

          <div class="aive-buttons" style="grid-template-columns: 1fr 1fr; margin-top:6px;">
            <button class="aive-disable" type="button" title="Disable AIVE on this host">Disable Tab</button>
            <button class="aive-blacklist2" type="button" title="Manage blacklist">Blacklist</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(ROOT);
    wirePanelEvents();
    restorePosition().then(() => {
      ensureLeftClamped();
      setRootExpanded(pinned ? true : open);
      updateTargetStatus();
      applyEffects();
    });
  }

  function removePanel() {
    try {
      ROOT?.remove();
    } catch {}
    ROOT = null;
  }

  function wirePanelEvents() {
    if (!ROOT) return;

    ROOT.querySelector(".aive-close").onclick = () => removePanel();

    ROOT.querySelector(".aive-pin").onclick = async () => {
      pinned = !pinned;
      ROOT.classList.toggle("aive-pinned", pinned);
      if (pinned) setRootExpanded(true);
      await persistPosition();
      toast(pinned ? "Pinned" : "Unpinned");
    };

    ROOT.querySelector(".aive-anchor-btn").onclick = async () => {
      anchorMode = anchorMode === "bottom" ? "top" : "bottom";
      ROOT.querySelector(".aive-anchor-btn").textContent = anchorMode === "bottom" ? "Bottom" : "Top";
      setRootExpanded(open);
      await persistPosition();
      toast(anchorMode === "bottom" ? "Dock: Bottom" : "Dock: Top");
    };

    ROOT.querySelector(".aive-help").onclick = () => openHelpDialog();
    ROOT.querySelector(".aive-blacklist").onclick = () => openBlacklistDialog();
    ROOT.querySelector(".aive-blacklist2").onclick = () => openBlacklistDialog();

    ROOT.querySelector(".aive-flip").onclick = () => {
      state.flip = !state.flip;
      const v = ROOT.querySelector(".aive-flip")?.closest(".aive-row")?.querySelector(".aive-val");
      if (v) v.textContent = state.flip ? "On" : "Off";
      applyEffects();
    };

    ROOT.querySelector(".aive-body").addEventListener("input", (e) => {
      const t = e.target;
      if (!t || t.tagName !== "INPUT") return;
      const k = t.getAttribute("data-key");
      if (!k) return;
      const v = Number(t.value);
      if (!Number.isFinite(v)) return;
      state[k] = v;
      const lab = t.closest(".aive-row")?.querySelector(".aive-val");
      if (lab) lab.textContent = formatNum(v);
      applyEffects();
    });

    ROOT.querySelector(".aive-target-prev").onclick = () => cycleVideo(-1);
    ROOT.querySelector(".aive-target-next").onclick = () => cycleVideo(+1);

    ROOT.querySelector(".aive-target-auto").onclick = () => {
      setSelectedVideo(null);
      applyEffects();
      toast("Target: Auto");
    };

    ROOT.querySelector(".aive-target-selector").onclick = () => {
      const v = ensureSelectedVideoStillValid() ? vSel : pickAutoVideo();
      if (v) {
        setSelectedVideo(v);
        toast("Target: Selected");
      } else {
        toast("No video found");
      }
    };

    ROOT.querySelector(".aive-auto").onclick = () => autoTune();
    ROOT.querySelector(".aive-reset").onclick = () => resetAll();
    ROOT.querySelector(".aive-hide").onclick = () => removePanel();
    ROOT.querySelector(".aive-disable").onclick = () => disableThisHost();

    // drag left/right from header
    const header = ROOT.querySelector(".aive-header");
    let dragging = false;
    let startX = 0;
    let startLeft = 0;

    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest("button")) return;
      dragging = true;
      header.setPointerCapture(e.pointerId);
      const rect = ROOT.getBoundingClientRect();
      startX = e.clientX;
      startLeft = rect.left;
    });

    header.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const vw = window.innerWidth || 0;
      const nextLeft = startLeft + dx;
      const maxLeft = Math.max(EDGE, vw - ROOT.offsetWidth - EDGE);
      ROOT.style.left = clamp(nextLeft, EDGE, maxLeft) + "px";
    });

    header.addEventListener("pointerup", async () => {
      if (!dragging) return;
      dragging = false;
      await persistPosition();
    });

    header.addEventListener("pointercancel", () => {
      dragging = false;
    });

    // Auto-collapse with docking
    let hoverTimer = 0;
    ROOT.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimer);
      setRootExpanded(true);
    });

    ROOT.addEventListener("mouseleave", () => {
      if (pinned) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => setRootExpanded(false), 220);
    });

    header.addEventListener("dblclick", () => {
      if (pinned) return;
      setRootExpanded(!open);
    });

    window.addEventListener("resize", () => {
      ensureLeftClamped();
      setRootExpanded(open);
    });
  }

  // ----------------------------
  // Quick Zoom (hold Z) – no typing
  // ----------------------------
  let zHeld = false;
  let panActive = false;
  let lastMoveTs = 0;

  function suppressIfNeeded(e) {
    if (isEditable(document.activeElement)) return false;
    if (isEditable(e.target)) return false;
    return true;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if ((e.key === "z" || e.key === "Z") && suppressIfNeeded(e)) {
        zHeld = true;
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.altKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        if (ROOT && document.contains(ROOT)) {
          e.preventDefault();
          e.stopPropagation();
          openBlacklistDialog();
        }
      }
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "z" || e.key === "Z") {
        zHeld = false;
        panActive = false;
      }
    },
    true
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (!zHeld) return;
      if (!suppressIfNeeded(e)) return;

      const v = ensureSelectedVideoStillValid() ? vSel : pickAutoVideo();
      if (!v) return;

      e.preventDefault();
      e.stopPropagation();

      setOriginFromPoint(v, e.clientX, e.clientY);

      const dir = e.deltaY < 0 ? 1 : -1;
      state.zoom = clamp(state.zoom + dir * 0.05, 0, 2);
      applyEffects();

      const zSlider = ROOT?.querySelector?.('input[data-key="zoom"]');
      if (zSlider) {
        zSlider.value = String(state.zoom);
        const lab = zSlider.closest(".aive-row")?.querySelector?.(".aive-val");
        if (lab) lab.textContent = formatNum(state.zoom);
      }
    },
    { passive: false, capture: true }
  );

  window.addEventListener(
    "mousedown",
    (e) => {
      if (!zHeld) return;
      if (!suppressIfNeeded(e)) return;

      const v = ensureSelectedVideoStillValid() ? vSel : pickAutoVideo();
      if (!v) return;

      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
      }

      setOriginFromPoint(v, e.clientX, e.clientY);

      if (e.button === 0) state.zoom = clamp(state.zoom + 0.08, 0, 2);
      else if (e.button === 2) state.zoom = clamp(state.zoom - 0.08, 0, 2);
      else return;

      applyEffects();

      const zSlider = ROOT?.querySelector?.('input[data-key="zoom"]');
      if (zSlider) {
        zSlider.value = String(state.zoom);
        const lab = zSlider.closest(".aive-row")?.querySelector?.(".aive-val");
        if (lab) lab.textContent = formatNum(state.zoom);
      }

      panActive = true;
      lastMoveTs = now();
    },
    true
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!zHeld || !panActive) return;

      const v = ensureSelectedVideoStillValid() ? vSel : pickAutoVideo();
      if (!v) return;

      const t = now();
      if (t - lastMoveTs < 12) return;
      lastMoveTs = t;

      setOriginFromPoint(v, e.clientX, e.clientY);
    },
    true
  );

  window.addEventListener("mouseup", () => (panActive = false), true);

  window.addEventListener(
    "contextmenu",
    (e) => {
      if (zHeld && suppressIfNeeded(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  // ----------------------------
  // Observer / boot (THIS is the key fix)
  // ----------------------------
  let booted = false;
  let obsTimer = 0;

  function tryInitPanel() {
    if (!ALIVE || booted) return;
    const v = pickAutoVideo();
    if (!v) return; // keep waiting
    vSel = v;
    createPanel();
    booted = true;
    applyEffects();
    updateTargetStatus();
  }

  function scheduleTryInit() {
    clearTimeout(obsTimer);
    obsTimer = setTimeout(() => {
      if (!ALIVE) return;
      if (!booted) {
        tryInitPanel();
      } else {
        // after boot: recheck selected video validity
        if (vSel && !ensureSelectedVideoStillValid()) vSel = null;
        updateTargetStatus();
        const v = ensureSelectedVideoStillValid() ? vSel : pickAutoVideo();
        if (v) applyEffects();
      }
    }, 200);
  }

  const mo = new MutationObserver(() => scheduleTryInit());

  (async () => {
    if (!ALIVE) return;
    if (await isDisabledHost()) return;
    if (await isBlacklistedHost()) return;

    const waitForBody = () => {
      if (!ALIVE) return;
      if (!document.body) return requestAnimationFrame(waitForBody);

      // Start watching immediately (players often load late)
      try {
        mo.observe(document.documentElement, { childList: true, subtree: true });
      } catch {}

      // Try now and keep trying for a bit (some sites add video without DOM mutations)
      tryInitPanel();
      let tries = 0;
      const iv = setInterval(() => {
        if (!ALIVE || booted) return clearInterval(iv);
        tries++;
        tryInitPanel();
        if (tries >= 60) clearInterval(iv); // ~15 seconds
      }, 250);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") scheduleTryInit();
      });
    };

    waitForBody();
  })();
})();