// scripts/content-minimal.js
console.log("AIVE content script loaded", location.href);

/*
  AIVE – All-in-One Video Enhancer (content-minimal.js)

  SS2 ("classic") panel:
  - Full controls (Help, Target Video select, AutoTune/Reset/Hide, Disable Tab, List)
  - Quick Zoom (hold Z + wheel/click/right-click/drag)
  - Auto-collapse (unless pinned)
  - Collapsed header docks top/bottom (edge proximity or anchor button)

  Chaturbate fix:
  - Chaturbate live stream target is often #TheaterModePlayer, not a <video>
  - AIVE now targets video, #TheaterModePlayer, and #chat-player
*/

(() => {
  "use strict";
  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  let ALIVE = true;
  window.addEventListener("pagehide", () => (ALIVE = false), { once: true });
  window.addEventListener("beforeunload", () => (ALIVE = false), { once: true });

  function shouldRunInThisFrame() {
    try {
      if (window.top === window.self) return true;

      const fe = window.frameElement;
      if (!fe) return false;

      const r = fe.getBoundingClientRect();
      const w = Math.round(r.width || window.innerWidth || 0);
      const h = Math.round(r.height || window.innerHeight || 0);

      if (w < 420 || h < 240) return false;

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

  const IS_CB = /(^|\.)chaturbate\.com$/i.test(location.hostname);

  let ROOT = null;
  let open = true;
  let pinned = false;
  let anchorMode = "bottom";

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
  const VIDEO_STYLE_CACHE = new WeakMap();

  function rememberVideoInlineStyles(v) {
    if (!v || VIDEO_STYLE_CACHE.has(v)) return;

    VIDEO_STYLE_CACHE.set(v, {
      filter: v.style.getPropertyValue("filter") || "",
filterPriority: v.style.getPropertyPriority("filter") || "",
transform: v.style.getPropertyValue("transform") || "",
transformPriority: v.style.getPropertyPriority("transform") || "",
transformOrigin: v.style.getPropertyValue("transform-origin") || "",
      willChange: v.style.getPropertyValue("will-change") || "",
willChangePriority: v.style.getPropertyPriority("will-change") || ""
    });
  }

  function setOrRemoveStyle(el, prop, value, priority = "") {
    if (!el) return;
    if (value) el.style.setProperty(prop, value, priority || "");
    else el.style.removeProperty(prop);
  }

  function restoreVideoInlineStyles(v) {
    if (!v) return;

    const saved = VIDEO_STYLE_CACHE.get(v);

    if (!saved) {
      effectTarget.style.removeProperty("filter");
      effectTarget.style.removeProperty("transform");
      effectTarget.style.removeProperty("transform-origin");
      effectTarget.style.removeProperty("will-change");
      return;
    }

    setOrRemoveStyle(v, "filter", saved.filter, saved.filterPriority);
    setOrRemoveStyle(v, "transform", saved.transform, saved.transformPriority);
    setOrRemoveStyle(v, "transform-origin", saved.transformOrigin, saved.transformOriginPriority);
    setOrRemoveStyle(v, "will-change", saved.willChange, saved.willChangePriority);
  }

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

  let _cachedCandidates = [];
  let _cachedAt = 0;

  function isVisibleTarget(el) {
    try {
      if (!el || !el.isConnected || !el.getBoundingClientRect) return false;

      const r = el.getBoundingClientRect();

      if (r.width < 120 || r.height < 90) return false;

      const cs = getComputedStyle(el);
      if (cs.display === "none") return false;
      if (cs.visibility === "hidden") return false;
      if (Number(cs.opacity) === 0) return false;

      const visible =
        r.bottom > 0 &&
        r.right > 0 &&
        r.top < (window.innerHeight || 0) &&
        r.left < (window.innerWidth || 0);

      return visible;
    } catch {
      return false;
    }
  }

  function getCandidateVideos() {
    const t = now();
    if (t - _cachedAt < 250) return _cachedCandidates;
    _cachedAt = t;

    const good = [];

    if (IS_CB) {
      const theater = document.querySelector("#TheaterModePlayer");
      if (isVisibleTarget(theater)) good.push(theater);

      const chatPlayer = document.querySelector("#chat-player");
      if (isVisibleTarget(chatPlayer)) good.push(chatPlayer);
    }

    const vids = Array.from(document.querySelectorAll("video"));
    for (const v of vids) {
      if (isVisibleTarget(v)) good.push(v);
    }

    _cachedCandidates = [...new Set(good)];
    return _cachedCandidates;
  }

  function scoreVideo(v) {
    try {
      if (!v) return -1;

      if (IS_CB && v.id === "TheaterModePlayer") return 1e15;
      if (IS_CB && v.id === "chat-player") return 9e14;

      const r = v.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0;

      const isVideo = String(v.tagName || "").toLowerCase() === "video";
      const readyBonus = isVideo && (v.readyState || 0) >= 2 ? 1 : 0;
      const playingBonus = isVideo && !v.paused ? 1 : 0;

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
    return isVisibleTarget(vSel);
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

  function setOriginFromPoint(v, clientX, clientY) {
  if (!v) return;

  const target =
    v.id === "TheaterModePlayer"
      ? v.querySelector("#chat-player") || v
      : v;

  rememberVideoInlineStyles(target);

  const r = target.getBoundingClientRect();

  const ox = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
  const oy = clamp((clientY - r.top) / Math.max(1, r.height), 0, 1);

  target.style.setProperty(
    "transform-origin",
    `${(ox * 100).toFixed(2)}% ${(oy * 100).toFixed(2)}%`,
    "important"
  );

  target.dataset.aiveMouseOrigin = "1";
}

  function applyEffects() {
  const best = pickAutoVideo();

  if (best && best !== vSel) {
    const oldScore = vSel ? scoreVideo(vSel) : -1;
    const newScore = scoreVideo(best);

    if (!vSel || !ensureSelectedVideoStillValid() || newScore >= oldScore) {
      if (vSel && vSel !== best) restoreVideoInlineStyles(vSel);
      vSel = best;
      updateTargetStatus();
    }
  }

  const v = ensureSelectedVideoStillValid() ? vSel : best;
  if (!v) return;

  vSel = v;
  rememberVideoInlineStyles(v);

  const filterTarget = v;
  const transformTarget =
    v.id === "TheaterModePlayer"
      ? v.querySelector("#chat-player") || v
      : v;

  rememberVideoInlineStyles(transformTarget);

  if (v.id === "TheaterModePlayer") {
    v.style.setProperty("overflow", "hidden", "important");

    const inner = v.querySelector("#chat-player");
    if (inner) {
      inner.style.setProperty("width", "100%", "important");
      inner.style.setProperty("height", "100%", "important");
      inner.style.setProperty("object-fit", "contain", "important");
    }
  }

  const hasVisualAdjustments =
    state.brightness !== 1 ||
    state.contrast !== 1 ||
    state.saturation !== 1 ||
    state.hue !== 0 ||
    state.sepia !== 0 ||
    state.sharpen > 0;

  const hasTransformAdjustments = state.zoom > 0 || state.flip;

  if (!hasVisualAdjustments && !hasTransformAdjustments) {
    restoreVideoInlineStyles(filterTarget);
    restoreVideoInlineStyles(transformTarget);
    return;
  }

  if (hasVisualAdjustments) {
    const filters = [
      `brightness(${state.brightness})`,
      `contrast(${state.contrast})`,
      `saturate(${state.saturation})`,
      `hue-rotate(${state.hue}deg)`,
      `sepia(${state.sepia})`
    ];

    const sharp = clamp(state.sharpen, 0, 1);

    if (sharp > 0) {
      filters.push(`contrast(${1 + sharp * 0.18})`);
      filters.push(`drop-shadow(0 0 ${sharp * 0.6}px rgba(255,255,255,0.14))`);
    }

    filterTarget.style.setProperty("filter", filters.join(" "), "important");
    filterTarget.style.setProperty("will-change", "filter", "important");
  } else {
    const saved = VIDEO_STYLE_CACHE.get(filterTarget);
    setOrRemoveStyle(filterTarget, "filter", saved ? saved.filter : "", saved ? saved.filterPriority : "");
  }

  if (hasTransformAdjustments) {
    const scale = clamp(1 + state.zoom, 1, 3);
    const transforms = [];

    if (state.flip) transforms.push("scaleX(-1)");
    if (scale !== 1) transforms.push(`scale(${scale})`);

    transformTarget.style.setProperty("transform", transforms.join(" "), "important");
    if (!transformTarget.style.getPropertyValue("transform-origin")) {
  if (transformTarget.dataset.aiveMouseOrigin !== "1") {
  transformTarget.style.setProperty("transform-origin", "50% 50%", "important");
}
}
    transformTarget.style.setProperty("will-change", "transform", "important");
  } else {
    const saved = VIDEO_STYLE_CACHE.get(transformTarget);

    setOrRemoveStyle(transformTarget, "transform", saved ? saved.transform : "", saved ? saved.transformPriority : "");
    setOrRemoveStyle(transformTarget, "transform-origin", saved ? saved.transformOrigin : "", saved ? saved.transformOriginPriority : "");
    setOrRemoveStyle(transformTarget, "will-change", saved ? saved.willChange : "", saved ? saved.willChangePriority : "");
  }
}

  function injectStyleOnce() {
    if (document.getElementById("__aive_css__")) return;

    const s = document.createElement("style");
    s.id = "__aive_css__";
    s.textContent = `
#aive-root{
  position:fixed;
  left:${EDGE}px;
  top:${EDGE}px;
  width:460px;
  z-index:2147483647;
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
    const tag = String(vSel.tagName || "").toLowerCase();
    const id = vSel.id ? `#${vSel.id}` : tag;

    if (idx >= 0) {
      status.textContent = `${id} ${idx + 1}/${total}`;
      pill.textContent = `${id} ${idx + 1}/${total}`;
    } else {
      status.textContent = `${id} (${total})`;
      pill.textContent = `${id} (${total})`;
    }
  }

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
        <div><b>Quick Zoom</b>: hold <b>Z</b> then use wheel/click/right-click/drag on the video/player.</div>
        <div><b>Auto-collapse</b>: collapses to header when mouse leaves unless pinned.</div>
        <div><b>Docking</b>: collapsed header docks to top/bottom based on edge proximity or the Top/Bottom button.</div>
        <div><b>Target Video</b>: use ◀/▶ to cycle, Sel to lock to a specific target, Auto to return to auto-pick.</div>
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
      width:min(640px, 92vw);
      max-height:min(88vh, 900px);
      overflow:auto;
      border-radius:16px;
      border:1px solid rgba(255,255,255,0.14);
      background:#0f1115;
      color:#e9eef7;
      box-shadow:0 18px 54px rgba(0,0,0,0.65);
      display:flex;
      flex-direction:column;
    `;

    card.innerHTML = `
      <div style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.10);font-weight:900;">
        <span>AIVE Lists</span>
        <button data-x style="border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#e9eef7;border-radius:10px;padding:6px 10px;font-weight:900;cursor:pointer;">✕</button>
      </div>

      <div style="padding:12px;display:grid;gap:12px;">
        <div style="font-size:12px;opacity:.8;">
          Edit these from any site where AIVE still opens. One host per line.
        </div>

        <button data-remove-current style="padding:10px;border-radius:12px;font-weight:900;cursor:pointer;">
          Remove current site from BOTH lists (${host || "unknown"})
        </button>

        <label style="font-size:12px;font-weight:900;">Blacklist</label>
        <textarea data-blacklist spellcheck="false" style="height:150px;background:#171a21;color:#e9eef7;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:10px;font:700 12px/1.25 ui-monospace,monospace;"></textarea>

        <label style="font-size:12px;font-weight:900;">Disabled Sites</label>
        <textarea data-disabled spellcheck="false" style="height:150px;background:#171a21;color:#e9eef7;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:10px;font:700 12px/1.25 ui-monospace,monospace;"></textarea>

        <button data-save style="padding:10px;border-radius:12px;font-weight:900;cursor:pointer;">Save Both Lists</button>
      </div>
    `;

    ovl.appendChild(card);
    document.body.appendChild(ovl);

    const close = () => ovl.remove();

    card.querySelector("[data-x]").onclick = close;

    ovl.addEventListener("click", (e) => {
      if (e.target === ovl) close();
    });

    const blTA = card.querySelector("[data-blacklist]");
    const disTA = card.querySelector("[data-disabled]");

    const cleanLines = (value) =>
      value
        .split(/\r?\n/g)
        .map((s) => s.trim())
        .filter(Boolean);

    (async () => {
      blTA.value = (await getList(BL_KEY)).join("\n");
      disTA.value = (await getList(DISABLED_KEY)).join("\n");
    })();

    card.querySelector("[data-remove-current]").onclick = () => {
      if (!host) return;

      const removeMatches = (x) =>
        x !== host &&
        x !== "chaturbate.com" &&
        x !== "www.chaturbate.com";

      blTA.value = cleanLines(blTA.value).filter(removeMatches).join("\n");
      disTA.value = cleanLines(disTA.value).filter(removeMatches).join("\n");

      toast("Removed current site from both lists");
    };

    card.querySelector("[data-save]").onclick = async () => {
      await setList(BL_KEY, cleanLines(blTA.value));
      await setList(DISABLED_KEY, cleanLines(disTA.value));

      toast("Saved both lists");
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
            <button class="aive-blacklist" type="button" title="Lists">B</button>
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
            Quick Zoom: hold <b>Z</b> + wheel/click/right-click/drag on video/player.<br>
            Blacklist: click <b>B</b> or press <b>Alt+Shift+B</b>.
          </div>

          <div class="aive-buttons" style="grid-template-columns: 1fr 1fr; margin-top:6px;">
            <button class="aive-disable" type="button" title="Disable AIVE on this site">Disable Site</button>
            <button class="aive-blacklist2" type="button" title="Manage blacklist">Lists</button>
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
        toast("No target found");
      }
    };

    ROOT.querySelector(".aive-auto").onclick = () => autoTune();
    ROOT.querySelector(".aive-reset").onclick = () => resetAll();
    ROOT.querySelector(".aive-hide").onclick = () => removePanel();

    ROOT.querySelector(".aive-disable").onclick = () => {
      const host = hostOf(location.href) || "this site";

      const ok = confirm(
        `Are you sure you want to disable AIVE on:\n\n${host}\n\n` +
          `This will hide AIVE on this site until you remove it from the disabled list.`
      );

      if (!ok) {
        toast("Disable canceled");
        return;
      }

      disableThisHost();
    };

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
      if ((e.key === "z" || e.key === "Z")) {
  if (suppressIfNeeded(e)) {
    zHeld = true;
    e.preventDefault();
    e.stopPropagation();
  } else {
    zHeld = false;
  }
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

  let booted = false;
  let obsTimer = 0;
  let videoWatchdogTimer = 0;

  function startVideoWatchdog() {
    if (videoWatchdogTimer) return;

    videoWatchdogTimer = setInterval(() => {
      if (!ALIVE) {
        clearInterval(videoWatchdogTimer);
        videoWatchdogTimer = 0;
        return;
      }

      _cachedAt = 0;

      const best = pickAutoVideo();

      if (best && best !== vSel) {
        if (vSel) restoreVideoInlineStyles(vSel);
        vSel = best;
        updateTargetStatus();
      }

      if (vSel) applyEffects();
    }, 1200);
  }

  function tryInitPanel() {
  if (!ALIVE || booted) return;

  const v = pickAutoVideo();

  if (v) {
    vSel = v;
  }

  createPanel();

  booted = true;

  applyEffects();
  updateTargetStatus();
  startVideoWatchdog();
}

  function scheduleTryInit() {
    clearTimeout(obsTimer);

    obsTimer = setTimeout(() => {
      if (!ALIVE) return;

      _cachedAt = 0;

      if (!booted) {
        tryInitPanel();
      } else {
        if (vSel && !ensureSelectedVideoStillValid()) vSel = null;

        updateTargetStatus();

        const v = ensureSelectedVideoStillValid() ? vSel : pickAutoVideo();

        if (v) {
          vSel = v;
          applyEffects();
        }
      }
    }, 120);
  }

  const mo = new MutationObserver(() => scheduleTryInit());

  (async () => {
    if (!ALIVE) return;

    const host = hostOf(location.href);

    if (host === "chaturbate.com" || host.endsWith(".chaturbate.com")) {
      await setList(
        DISABLED_KEY,
        (await getList(DISABLED_KEY)).filter(
          (h) => h !== host && h !== "chaturbate.com" && h !== "www.chaturbate.com"
        )
      );

      await setList(
        BL_KEY,
        (await getList(BL_KEY)).filter(
          (h) => h !== host && h !== "chaturbate.com" && h !== "www.chaturbate.com"
        )
      );
    } else {
      if (await isDisabledHost()) return;
      if (await isBlacklistedHost()) return;
    }

    const waitForBody = () => {
      if (!ALIVE) return;
      if (!document.body) return requestAnimationFrame(waitForBody);

      try {
        mo.observe(document.body, {
          childList: true,
          subtree: false,
          attributes: true,
          attributeFilter: ["id", "class", "style", "src"]
        });
      } catch {}

      tryInitPanel();

      let tries = 0;

      const iv = setInterval(() => {
        if (!ALIVE) return clearInterval(iv);
if (booted) return;

        tries++;
        _cachedAt = 0;
        tryInitPanel();

        if (tries >= 30) clearInterval(iv);
      }, 1200);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") scheduleTryInit();
      });
    };

    waitForBody();
  })();
})();