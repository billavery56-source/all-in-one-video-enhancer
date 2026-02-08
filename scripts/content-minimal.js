console.log("AIVE content script loaded", location.href);

/*
  AIVE – All-in-One Video Enhancer (content-minimal.js)

  Quick Zoom (no panel needed):
    Hold Z:
      • Wheel = zoom in/out at cursor
      • Left click = zoom in at click point
      • Right click = zoom out at click point (context menu suppressed)
      • Drag = pan the zoom (moves transform-origin)
  Panel:
    • Always clamps into viewport (fixes "no show"/offscreen)
    • Hover header to expand unless pinned
*/

(() => {
  "use strict";
  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  // ----------------------------
  // Storage helpers
  // ----------------------------
  const STORE =
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
      ? chrome.storage.local
      : null;

  const get = (key) =>
    new Promise((r) => (STORE ? STORE.get(key, (o) => r(o[key])) : r(undefined)));

  const set = (obj) => new Promise((r) => (STORE ? STORE.set(obj, r) : r()));

  const DOMAIN = location.hostname;
  const POS_KEY = `aive_pos_${DOMAIN}`;
  const ANCHOR_KEY = `aive_anchor_mode`; // global

  // ----------------------------
  // Blacklist (always available)
  // ----------------------------
  const BL_DIALOG_ID = "aive-blacklist-dialog";

  function closeDialogById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function normalizeDomains(text) {
    const lines = (text || "")
      .split(/\r?\n/g)
      .map((s) => s.trim())
      .filter(Boolean);

    const cleaned = [];
    const seen = new Set();

    for (const line of lines) {
      let d = line;
      try {
        if (/^https?:\/\//i.test(d)) d = new URL(d).hostname;
      } catch {}
      d = d.toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
      if (!d) continue;
      if (!seen.has(d)) {
        seen.add(d);
        cleaned.push(d);
      }
    }
    return cleaned;
  }

  async function isBlacklisted() {
    const list = (await get("aive_blacklist")) || [];
    return Array.isArray(list) && list.includes(DOMAIN);
  }

  async function openBlacklistDialog() {
    if (!document.body) return;

    closeDialogById(BL_DIALOG_ID);

    const ovl = document.createElement("div");
    ovl.id = BL_DIALOG_ID;
    ovl.tabIndex = -1;
    ovl.style.cssText = `
      position:fixed; inset:0; z-index:2147483647;
      display:grid; place-items:center;
      background: rgba(0,0,0,.58);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      width:min(760px, 92vw);
      max-height:min(84vh, 900px);
      overflow:hidden;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.14);
      background:#0f1115;
      color:#e9eef7;
      box-shadow:0 18px 54px rgba(0,0,0,.65);
    `;

    const top = document.createElement("div");
    top.style.cssText = `
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:12px 14px;
      border-bottom:1px solid rgba(255,255,255,.10);
      background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,0));
      font-weight:900;
    `;
    top.innerHTML = `<div>Blacklist Manager</div>`;

    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.style.cssText = `border:none;background:transparent;color:#a7b0c0;font-weight:900;font-size:18px;cursor:pointer;padding:2px 8px;border-radius:10px;`;
    x.onmouseenter = () => (x.style.color = "#e9eef7");
    x.onmouseleave = () => (x.style.color = "#a7b0c0");
    top.appendChild(x);

    const body = document.createElement("div");
    body.style.cssText = `padding:14px; display:grid; gap:10px; overflow:auto; max-height:calc(min(84vh, 900px) - 56px);`;

    const list = (await get("aive_blacklist")) || [];
    const text = Array.isArray(list) ? list.join("\n") : "";

    const hint = document.createElement("div");
    hint.style.cssText = `color:#a7b0c0; font-size:12px; line-height:1.35;`;
    hint.innerHTML = `
      Add domains (one per line). If you add <b>${DOMAIN}</b>, this enhancer will do nothing on this site.
      You can paste full URLs too; it'll extract hostnames.
    `;

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.spellcheck = false;
    ta.style.cssText = `
      width:100%;
      min-height:260px;
      resize:vertical;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.14);
      background:#0b0d11;
      color:#e9eef7;
      padding:10px 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size:12.5px;
      outline:none;
    `;

    const row = document.createElement("div");
    row.style.cssText = `display:flex; gap:10px; justify-content:flex-end; padding-top:4px; flex-wrap:wrap;`;

    function btn(label, primary) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = `
        border-radius:12px;
        padding:9px 12px;
        cursor:pointer;
        font-weight:800;
        border:1px solid rgba(255,255,255,.14);
        background:${primary ? "#1b6bff" : "rgba(255,255,255,.06)"};
        color:${primary ? "#fff" : "#e9eef7"};
      `;
      b.onmouseenter = () => (b.style.filter = "brightness(1.08)");
      b.onmouseleave = () => (b.style.filter = "");
      return b;
    }

    const saveBtn = btn("Save", true);
    const cancelBtn = btn("Close", false);
    const addCurrentBtn = btn(`Add ${DOMAIN}`, false);

    addCurrentBtn.onclick = () => {
      const lines = normalizeDomains(ta.value);
      if (!lines.includes(DOMAIN)) lines.push(DOMAIN);
      ta.value = lines.join("\n");
    };

    saveBtn.onclick = async () => {
      const cleaned = normalizeDomains(ta.value);
      await set({ aive_blacklist: cleaned });
      closeDialogById(BL_DIALOG_ID);
      // If current domain is now blacklisted, remove panel immediately.
      if (cleaned.includes(DOMAIN)) {
        try {
          if (ROOT) ROOT.remove();
          ROOT = null;
        } catch {}
      }
    };

    cancelBtn.onclick = () => closeDialogById(BL_DIALOG_ID);
    x.onclick = cancelBtn.onclick;

    row.appendChild(addCurrentBtn);
    row.appendChild(cancelBtn);
    row.appendChild(saveBtn);

    body.appendChild(hint);
    body.appendChild(ta);
    body.appendChild(row);

    card.appendChild(top);
    card.appendChild(body);
    ovl.appendChild(card);

    ovl.addEventListener("mousedown", (e) => {
      if (e.target === ovl) closeDialogById(BL_DIALOG_ID);
    });
    ovl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDialogById(BL_DIALOG_ID);
    });

    document.body.appendChild(ovl);
    ovl.focus();
  }

  // ----------------------------
  // Video selection (auto)
  // ----------------------------
  let _cachedCandidates = [];
  let _cachedAt = 0;

  function isActuallyVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const st = getComputedStyle(el);
    if (!st) return false;
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;

    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return false;

    // quick occlusion check
    const cx = r.left + Math.min(r.width - 1, Math.max(1, r.width * 0.5));
    const cy = r.top + Math.min(r.height - 1, Math.max(1, r.height * 0.5));
    const topEl = document.elementFromPoint(cx, cy);
    if (!topEl) return true;
    if (topEl === el) return true;
    if (topEl.closest && topEl.closest("video") === el) return true;
    return true;
  }

  const _AIVE_AD_RE = /(\bads?\b|ad-|advert|doubleclick|googlesyndication|sponsor|promoted|promo|banner|outbrain|taboola)/i;

  function isAdLikeNode(el) {
    try {
      const id = (el && el.id) ? String(el.id) : "";
      const cls = (el && el.className) ? String(el.className) : "";
      return _AIVE_AD_RE.test(id) || _AIVE_AD_RE.test(cls);
    } catch { return false; }
  }

  function isLikelyAdVideo(v) {
    try {
      // Walk a few ancestors; many ad videos sit inside obvious ad containers.
      let cur = v;
      for (let i = 0; i < 6 && cur; i++) {
        if (isAdLikeNode(cur)) return true;
        cur = cur.parentElement;
      }
      // Very small videos are usually previews/ads.
      const r = v.getBoundingClientRect();
      if (r.width * r.height < 140 * 90) return true;
      // Tiny corner "floating" ads
      const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
      const frac = (r.width * r.height) / (vw * vh);
      if (frac < 0.02 && (r.right < vw * 0.55 || r.left > vw * 0.45)) return true;
      return false;
    } catch { return false; }
  }

  function inViewport(r) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  }

  function getCandidateVideos() {
    const now = Date.now();
    if (now - _cachedAt < 400 && _cachedCandidates.length) return _cachedCandidates;

    const vids = Array.from(document.querySelectorAll("video"));
    const good = [];

    for (const v of vids) {
      try {
        if (!isActuallyVisible(v)) continue;
        if (v.closest && v.closest("#aive-root")) continue;
        if (isLikelyAdVideo(v)) continue;
        const r = v.getBoundingClientRect();
        if (r.width < 160 || r.height < 100) continue;
        good.push(v);
      } catch {}
    }

    _cachedCandidates = good;
    _cachedAt = now;
    return good;
  }

  function scoreVideo(v) {
    try {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (!area) return -1;

      let score = area;
      if (inViewport(r)) score *= 1.15;

      const playing = !v.paused && !v.ended && Number(v.currentTime || 0) > 0;
      if (playing) score += 1_000_000_000;

      if (v.controls) score += 200_000_000;
      if (!v.muted) score += 80_000_000;

      const previewish = !!(v.muted && v.loop && v.autoplay && !v.controls);
      if (previewish) score *= 0.25;

      if (v.closest && v.closest("a")) score *= 0.6;
      return score;
    } catch {
      return -1;
    }
  }

  function pickBestVideo(cands) {
    let best = null;
    let bestScore = -1;
    for (const v of cands) {
      const s = scoreVideo(v);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }
    return best;
  }

  function getVideo() {
    const cands = getCandidateVideos();
    if (!cands.length) return null;
    return pickBestVideo(cands);
  }

  // ----------------------------
  // Effects
  // ----------------------------
  const state = {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    sepia: 0,
    zoom: 1,
    flip: false
  };

  let zoomOrigin = { x: 50, y: 50 };

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function setOriginFromPoint(v, clientX, clientY) {
    const r = v.getBoundingClientRect();
    const x = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * 100;
    const y = clamp((clientY - r.top) / Math.max(1, r.height), 0, 1) * 100;
    zoomOrigin = { x, y };
  }

  let _observedVideo = null;
  let _styleObserver = null;
  let _applyingStyles = false;
  let _obsDebounce = 0;

  function applyEffects(targetVideo) {
    const v = targetVideo || getVideo();
    if (!v) return;

    const filterStr = `
      brightness(${state.brightness})
      contrast(${state.contrast})
      saturate(${state.saturation})
      hue-rotate(${state.hue}deg)
      sepia(${state.sepia})
    `.trim().replace(/\s+/g, " ");

    const transformStr = `
      scale(${state.zoom})
      scaleX(${state.flip ? -1 : 1})
    `.trim().replace(/\s+/g, " ");

    if (v !== _observedVideo) {
      _observedVideo = v;
      if (_styleObserver) _styleObserver.disconnect();

      _styleObserver = new MutationObserver(() => {
        if (_applyingStyles) return;
        clearTimeout(_obsDebounce);
        _obsDebounce = setTimeout(() => applyEffects(v), 50);
      });

      try {
        _styleObserver.observe(v, { attributes: true, attributeFilter: ["style", "class"] });
      } catch {}
    }

    _applyingStyles = true;
    v.style.filter = filterStr;
    v.style.transform = transformStr;

    if (state.zoom > 1.0001) v.style.transformOrigin = `${zoomOrigin.x}% ${zoomOrigin.y}%`;
    else v.style.transformOrigin = "";

    requestAnimationFrame(() => {
      _applyingStyles = false;
    });
  }

  // ----------------------------
  // Quick Zoom (hold Z)
  // ----------------------------
  const QUICK_ZOOM_HOLD_KEY = "KeyZ";
  const QUICK_ZOOM_STEP = 1.18;
  const QUICK_ZOOM_MIN = 1.0;
  const QUICK_ZOOM_MAX = 3.5;

  const pressed = new Set();
  const isQuickHeld = () => pressed.has(QUICK_ZOOM_HOLD_KEY);

  let dragging = false;
  let dragStart = null;
  let activeZoomVideo = null;

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
  }

  function findVideoFromEvent(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
    let v = null;
    if (el?.tagName?.toLowerCase?.() === "video") v = el;
    else v = el?.closest?.("video") || null;

    // Ignore likely ad/preview videos when selecting under the cursor.
    if (v && isLikelyAdVideo(v)) v = null;

    return v || activeZoomVideo || getVideo();
  }

  function insideVideo(v, ev) {
    const r = v.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  }

  function zoomAt(v, ev, dir) {
    setOriginFromPoint(v, ev.clientX, ev.clientY);
    if (dir > 0) state.zoom = clamp(state.zoom * QUICK_ZOOM_STEP, QUICK_ZOOM_MIN, QUICK_ZOOM_MAX);
    else state.zoom = clamp(state.zoom / QUICK_ZOOM_STEP, QUICK_ZOOM_MIN, QUICK_ZOOM_MAX);

    if (state.zoom <= QUICK_ZOOM_MIN + 1e-6) {
      state.zoom = 1;
      zoomOrigin = { x: 50, y: 50 };
    }
    applyEffects(v);
    if (ROOT) { try { updateSliderUI("zoom"); } catch {} }
  }

  function clearKeys() {
    pressed.clear();
    dragging = false;
    dragStart = null;
    activeZoomVideo = null;
  }

  window.addEventListener("blur", clearKeys, true);
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) clearKeys();
    },
    true
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.code !== QUICK_ZOOM_HOLD_KEY) return;
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      pressed.add(e.code);
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.code !== QUICK_ZOOM_HOLD_KEY) return;
      pressed.delete(e.code);
      dragging = false;
      dragStart = null;
      activeZoomVideo = null;
    },
    true
  );

  window.addEventListener(
    "mousedown",
    (e) => {
      if (!isQuickHeld()) return;
      if (isTypingTarget(e.target)) return;

      const v = findVideoFromEvent(e);
      if (!v || !insideVideo(v, e)) return;

      activeZoomVideo = v;

      if (e.button === 0) {
        zoomAt(v, e, +1);

        dragging = true;
        const r = v.getBoundingClientRect();
        dragStart = {
          x: e.clientX,
          y: e.clientY,
          ox: zoomOrigin.x,
          oy: zoomOrigin.y,
          rw: r.width,
          rh: r.height
        };

        e.preventDefault();
        e.stopPropagation();
      } else if (e.button === 2) {
        activeZoomVideo = v;
        zoomAt(v, e, -1);
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { capture: true, passive: false }
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!dragging || !isQuickHeld() || !dragStart) return;

      const v = activeZoomVideo || findVideoFromEvent(e);
      if (!v) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      const nx = clamp(dragStart.ox - (dx / Math.max(1, dragStart.rw)) * 100, 0, 100);
      const ny = clamp(dragStart.oy - (dy / Math.max(1, dragStart.rh)) * 100, 0, 100);
      zoomOrigin = { x: nx, y: ny };

      applyEffects(activeZoomVideo || v);
      if (ROOT) { try { updateSliderUI("zoom"); } catch {} }

      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true, passive: false }
  );

  window.addEventListener(
    "mouseup",
    () => {
      dragging = false;
      dragStart = null;
    },
    true
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (!isQuickHeld()) return;
      if (isTypingTarget(e.target)) return;

      const v = findVideoFromEvent(e);
      if (!v || !insideVideo(v, e)) return;

      activeZoomVideo = v;
      const dir = e.deltaY < 0 ? +1 : -1;
      zoomAt(v, e, dir);

      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true, passive: false }
  );

  window.addEventListener(
    "contextmenu",
    (e) => {
      if (!isQuickHeld()) return;
      const v = findVideoFromEvent(e);
      if (!v || !insideVideo(v, e)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  // ----------------------------
  // Panel UI (always on-screen)
  // ----------------------------
  let ROOT = null;
  let anchorMode = "bottom";
  let pinned = false;

  const EDGE_PAD = 8;
  const SNAP_PX = 28;

  function viewportSize() {
    const vv = window.visualViewport;
    if (vv) return { w: vv.width, h: vv.height, ox: vv.offsetLeft, oy: vv.offsetTop };
    return { w: window.innerWidth, h: window.innerHeight, ox: 0, oy: 0 };
  }

  function formatNum(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (Math.abs(n) >= 100) return String(Math.round(n));
    return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  function slider(label, key, min, max, step, val) {
    return `
      <div class="aive-row">
        <label>${label} <span class="aive-val">${formatNum(Number(val))}</span></label>
        <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${val}">
      </div>`;
  }

  function createPanel() {
    const root = document.createElement("div");
    root.id = "aive-root";
    root.style.cssText = `
      position: fixed;
      left: ${EDGE_PAD}px;
      bottom: ${EDGE_PAD}px;
      width: 320px;
      z-index: 2147483646;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      user-select: none;
    `;

    const style = document.createElement("style");
    style.textContent = `
      #aive-root *{box-sizing:border-box}
      #aive-root .aive-card{
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(15,17,21,.92);
        color: #e9eef7;
        box-shadow: 0 18px 54px rgba(0,0,0,.55);
        overflow:hidden;
        backdrop-filter: blur(10px);
      }
      #aive-root .aive-header{
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding: 10px 12px;
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,0));
        cursor: move;
      }
      #aive-root .aive-title{font-weight: 900; letter-spacing:.2px;}
      #aive-root .aive-hbtns{display:flex; gap:6px; align-items:center;}
      #aive-root button{
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.06);
        color: #e9eef7;
        font-weight: 900;
        cursor: pointer;
        padding: 6px 8px;
      }
      #aive-root button:hover{filter:brightness(1.08)}
      #aive-root .aive-body{
        padding: 10px 12px 12px;
        display:grid;
        gap:10px;
      }
      #aive-root .aive-row{
        display:grid;
        gap:6px;
      }
      #aive-root label{
        display:flex;
        align-items:baseline;
        justify-content:space-between;
        gap:10px;
        font-size: 12px;
        color:#cdd5e3;
        font-weight: 800;
      }
      #aive-root .aive-val{
        color:#f0e890;
        font-weight: 900;
      }
      #aive-root input[type="range"]{
        width:100%;
        accent-color: #f0a060;
      }
      #aive-root .aive-buttons{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }
      #aive-root .aive-buttons button{
        flex:1 1 auto;
      }
      #aive-root .aive-collapsed .aive-body{display:none;}
    `;

    root.appendChild(style);

    const card = document.createElement("div");
    card.className = "aive-card aive-collapsed";

    card.innerHTML = `
      <div class="aive-header">
        <div class="aive-title">AIVE</div>
        <div class="aive-hbtns">
          <button class="aive-pin" type="button" title="Pin (disable hover collapse)">📌</button>
          <button class="aive-anchor" type="button" title="Toggle anchor">Bottom</button>
          <button class="aive-bl" type="button" title="Blacklist">B</button>
        </div>
      </div>

      <div class="aive-body">
        ${slider("Brightness", "brightness", 0, 2, 0.01, 1)}
        ${slider("Contrast", "contrast", 0, 2, 0.01, 1)}
        ${slider("Saturation", "saturation", 0, 2, 0.01, 1)}
        ${slider("Hue", "hue", 0, 360, 0.5, 0)}
        ${slider("Sepia", "sepia", 0, 1, 0.01, 0)}
        ${slider("Zoom", "zoom", 1, 3.5, 0.01, 1)}

        <div class="aive-row">
          <label>Flip Horizontal <span class="aive-val">${state.flip ? "On" : "Off"}</span></label>
          <button class="aive-flip" type="button">Flip</button>
        </div>

        <div class="aive-row">
          <label>Auto Tune <span class="aive-val aive-autotune-status">Ready</span></label>
          <button class="aive-autotune" type="button" title="Apply a smart preset to the main video on this page">Auto</button>
        </div>

        <div class="aive-row">
          <label>Hide Ads <span class="aive-val aive-ads-status">Off</span></label>
          <button class="aive-ads-toggle" type="button" title="Cosmetic hide: hides common ad containers (not a full ad-blocker)">Toggle</button>
        </div>

        <div class="aive-buttons">
          <button class="aive-reset" type="button">Reset</button>
          <button class="aive-hide" type="button">Hide Tab</button>
        </div>

        <div style="color:#a7b0c0;font-size:11px;line-height:1.35;">
          Quick Zoom: hold <b>Z</b> + wheel/click/right-click/drag on video.
        </div>
      </div>
    `;

    root.appendChild(card);
    return root;
  }

  function ensureInViewHard() {
    if (!ROOT) return;
    const vv = viewportSize();
    const r = ROOT.getBoundingClientRect();

    let left = parseFloat(ROOT.style.left || "0");
    let top = parseFloat(ROOT.style.top || "0");

    // clamp
    left = clamp(left, vv.ox + EDGE_PAD, vv.ox + vv.w - r.width - EDGE_PAD);
    top = clamp(top, vv.oy + EDGE_PAD, vv.oy + vv.h - r.height - EDGE_PAD);

    ROOT.style.left = `${left}px`;
    ROOT.style.top = `${top}px`;
  }

  function snapToEdges(x, y, anchor) {
    const vv = viewportSize();
    const r = ROOT.getBoundingClientRect();

    let left = x;
    let top = y;

    // snap left/right
    if (Math.abs(left - (vv.ox + EDGE_PAD)) <= SNAP_PX) left = vv.ox + EDGE_PAD;
    if (Math.abs((left + r.width) - (vv.ox + vv.w - EDGE_PAD)) <= SNAP_PX) {
      left = vv.ox + vv.w - r.width - EDGE_PAD;
    }

    // snap top/bottom based on anchor
    if (anchor === "top") {
      if (Math.abs(top - (vv.oy + EDGE_PAD)) <= SNAP_PX) top = vv.oy + EDGE_PAD;
    } else {
      if (Math.abs((top + r.height) - (vv.oy + vv.h - EDGE_PAD)) <= SNAP_PX) {
        top = vv.oy + vv.h - r.height - EDGE_PAD;
      }
    }

    // clamp
    left = clamp(left, vv.ox + EDGE_PAD, vv.ox + vv.w - r.width - EDGE_PAD);
    top = clamp(top, vv.oy + EDGE_PAD, vv.oy + vv.h - r.height - EDGE_PAD);

    return { left, top };
  }

  async function persistPosition() {
    if (!ROOT) return;
    const r = ROOT.getBoundingClientRect();
    await set({
      [POS_KEY]: {
        left: r.left,
        top: r.top,
        anchor: anchorMode
      }
    });
  }

  function setCollapsed(collapsed) {
    const card = ROOT.querySelector(".aive-card");
    if (!card) return;
    if (collapsed) card.classList.add("aive-collapsed");
    else card.classList.remove("aive-collapsed");
  }

  function installPanelHandlers() {
    const card = ROOT.querySelector(".aive-card");
    const header = ROOT.querySelector(".aive-header");
    const pinBtn = ROOT.querySelector(".aive-pin");
    const anchorBtn = ROOT.querySelector(".aive-anchor");
    const blBtn = ROOT.querySelector(".aive-bl");

    let draggingPanel = false;
    let dragOff = { x: 0, y: 0 };

    function setAnchorLabel() {
      anchorBtn.textContent = anchorMode === "top" ? "Top" : "Bottom";
    }

    function onEnter() {
      if (!pinned) setCollapsed(false);
    }
    function onLeave() {
      if (!pinned) setCollapsed(true);
    }

    card.addEventListener("mouseenter", onEnter);
    card.addEventListener("mouseleave", onLeave);

    pinBtn.onclick = async () => {
      pinned = !pinned;
      pinBtn.style.filter = pinned ? "brightness(1.2)" : "";
      if (pinned) setCollapsed(false);
      else setCollapsed(true);
      await persistPosition();
    };

    anchorBtn.onclick = async () => {
      anchorMode = anchorMode === "top" ? "bottom" : "top";
      await set({ [ANCHOR_KEY]: anchorMode });
      setAnchorLabel();
      ensureInViewHard();
      await persistPosition();
    };

    blBtn.onclick = () => openBlacklistDialog();

    function updateSliderUI(key) {
      try {
        const input = ROOT.querySelector(`input[type="range"][data-key="${key}"]`);
        if (!input) return;
        input.value = String(state[key]);
        const span = input.previousElementSibling?.querySelector?.(".aive-val");
        if (span) span.textContent = formatNum(Number(state[key]));
      } catch {}
    }

    function updateAllSliders(keys) {
      for (const k of keys) updateSliderUI(k);
    }

    ROOT.querySelectorAll('input[type="range"]').forEach((r) => {
      r.addEventListener("input", () => {
        const k = r.dataset.key;
        const v = Number(r.value);
        const span = r.previousElementSibling?.querySelector?.(".aive-val");
        if (span) span.textContent = formatNum(v);

        if (k in state) {
          state[k] = v;
          if (k === "zoom" && state.zoom <= 1.0001) zoomOrigin = { x: 50, y: 50 };
          applyEffects();
        }
      });
    });

    ROOT.querySelector(".aive-reset").onclick = () => {
      state.brightness = 1;
      state.contrast = 1;
      state.saturation = 1;
      state.hue = 0;
      state.sepia = 0;
      state.zoom = 1;
      state.flip = false;
      zoomOrigin = { x: 50, y: 50 };

      updateAllSliders(["brightness", "contrast", "saturation", "hue", "sepia", "zoom"]);
      const flipVal = ROOT.querySelector(".aive-row .aive-val");
      if (flipVal) flipVal.textContent = "Off";
      applyEffects();
    };

    ROOT.querySelector(".aive-hide").onclick = () => {
      try {
        ROOT.remove();
      } catch {}
      ROOT = null;
    };

    ROOT.querySelector(".aive-flip").onclick = () => {
      state.flip = !state.flip;
      const rows = Array.from(ROOT.querySelectorAll(".aive-row"));
      const flipRow = rows.find((x) => x.textContent.includes("Flip Horizontal"));
      const val = flipRow?.querySelector?.(".aive-val");
      if (val) val.textContent = state.flip ? "On" : "Off";
      applyEffects();
    };

    const autoStatus = ROOT.querySelector(".aive-autotune-status");
    const adsStatus = ROOT.querySelector(".aive-ads-status");

    async function autoTune() {
      const v = getVideo();
      if (!v) { if (autoStatus) autoStatus.textContent = "No video"; return; }

      // "Smart" preset (works everywhere, no cross-origin pixel sampling).
      // Meant to be a safe enhancement, not a heavy-handed filter.
      state.brightness = 1.03;
      state.contrast = 1.10;
      state.saturation = 1.08;
      state.hue = 0;
      state.sepia = 0;
      // leave zoom/flip alone

      updateAllSliders(["brightness", "contrast", "saturation", "hue", "sepia"]);
      applyEffects(v);
      if (autoStatus) {
        autoStatus.textContent = "Applied";
        setTimeout(() => { try { autoStatus.textContent = "Ready"; } catch {} }, 900);
      }
    }

    const ADS_KEY = `aive_hide_ads_${DOMAIN}`;
    function setAdsEnabled(enabled) {
      const id = "aive-hide-ads-style";
      let s = document.getElementById(id);
      if (enabled && !s) {
        s = document.createElement("style");
        s.id = id;
        // Cosmetic hide only (not a network blocker)
        s.textContent = `
          [id*="ad"], [class*="ad"], [class*="ads"], [id*="ads"],
          [class*="Ad"], [id*="Ad"],
          [class*="sponsor"], [id*="sponsor"],
          [class*="promo"], [id*="promo"],
          [class*="banner"], [id*="banner"],
          [class*="outbrain"], [id*="outbrain"],
          [class*="taboola"], [id*="taboola"]{
            display:none !important;
            visibility:hidden !important;
          }
        `;
        document.documentElement.appendChild(s);
      } else if (!enabled && s) {
        s.remove();
      }
    }

    async function refreshAdsUI() {
      const enabled = !!(await get(ADS_KEY));
      setAdsEnabled(enabled);
      if (adsStatus) adsStatus.textContent = enabled ? "On" : "Off";
    }

    ROOT.querySelector(".aive-autotune").onclick = autoTune;

    ROOT.querySelector(".aive-ads-toggle").onclick = async () => {
      const cur = !!(await get(ADS_KEY));
      await set({ [ADS_KEY]: !cur });
      await refreshAdsUI();
    };

    refreshAdsUI();

    // Drag panel
    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      draggingPanel = true;
      const r = ROOT.getBoundingClientRect();
      dragOff = { x: e.clientX - r.left, y: e.clientY - r.top };
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    header.addEventListener("pointermove", (e) => {
      if (!draggingPanel) return;
      const fixed = snapToEdges(e.clientX - dragOff.x, e.clientY - dragOff.y, anchorMode);
      ROOT.style.left = `${fixed.left}px`;
      ROOT.style.top = `${fixed.top}px`;
      e.preventDefault();
    });

    header.addEventListener("pointerup", async (e) => {
      if (!draggingPanel) return;
      draggingPanel = false;
      try { header.releasePointerCapture(e.pointerId); } catch {}
      ensureInViewHard();
      await persistPosition();
    });

    header.addEventListener("pointercancel", () => { draggingPanel = false; });

    setAnchorLabel();
  }

  function restorePosition(pos) {
    const vv = viewportSize();
    let left = vv.ox + EDGE_PAD;
    let top = vv.oy + EDGE_PAD;

    if (pos && typeof pos === "object") {
      if (typeof pos.left === "number") left = pos.left;
      if (typeof pos.top === "number") top = pos.top;
      if (pos.anchor === "top" || pos.anchor === "bottom") anchorMode = pos.anchor;
    }

    ROOT.style.left = `${left}px`;
    ROOT.style.top = `${top}px`;
  }

  // keep panel in view on resize/viewport changes
  window.addEventListener("resize", () => ensureInViewHard(), true);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", ensureInViewHard, true);
    window.visualViewport.addEventListener("scroll", ensureInViewHard, true);
  }

  (async () => {
    if (await isBlacklisted()) return;

    const globalAnchor = (await get(ANCHOR_KEY)) || null;
    if (globalAnchor === "top" || globalAnchor === "bottom") anchorMode = globalAnchor;

    const pos = await get(POS_KEY);

    ROOT = createPanel();
    document.documentElement.appendChild(ROOT);
    restorePosition(pos);
    ensureInViewHard();
    installPanelHandlers();

    // Apply once on load
    applyEffects();

    // Re-apply when videos change a bit (lazy interval)
    setInterval(() => {
      try { applyEffects(); } catch {}
    }, 900);
  })();
})();
