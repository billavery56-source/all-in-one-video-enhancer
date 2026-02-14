console.log("AIVE content script loaded", location.href);

/*
  AIVE – All-in-One Video Enhancer (content-minimal.js)

  What this build includes (matches your SS1 feature set):
  - Panel UI with: Brightness, Contrast, Saturation, Hue, Sepia, Sharpen, Zoom, Flip
  - Buttons: Pin, Anchor (Top/Bottom), Blacklist (B), Close (X)
  - Bottom buttons: Auto, Reset, Hide Tab
  - Blacklist manager overlay:
      • Click "B" on the panel OR press Alt+Shift+B
      • Add/Remove current site buttons included
  - Quick Zoom (hold Z):
      • Wheel = zoom in/out at cursor
      • Left click = zoom in at click point
      • Right click = zoom out at click point (context menu suppressed)
      • Drag = pan the zoom (moves transform-origin)
*/

(() => {
  "use strict";
  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  let ALIVE = true;
  window.addEventListener("pagehide", () => (ALIVE = false), { once: true });
  window.addEventListener("beforeunload", () => (ALIVE = false), { once: true });

  // ======================================================
  // STORAGE
  // ======================================================
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
  const VIDEO_PREF_KEY = `aive_video_pref_${DOMAIN}`; // per-domain

  // ======================================================
  // UTILS
  // ======================================================
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
  }

  function formatNum(n) {
    return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : String(n);
  }

  // ======================================================
  // BLACKLIST DIALOG (WORKS EVEN IF BLACKLISTED)
  // ======================================================
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

  // ======================================================
  // TOAST (small notifications)
  // ======================================================
  let ROOT = null;
  let TOAST_TIMER = 0;

  function toast(text, ms = 1800) {
    try {
      if (!document.body) return;
      let el = document.getElementById("aive-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "aive-toast";
        el.style.cssText = `
          position: fixed;
          z-index: 2147483647;
          max-width: min(420px, 92vw);
          background: rgba(15,17,21,0.92);
          color: #e9eef7;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          padding: 10px 12px;
          font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          box-shadow: 0 12px 34px rgba(0,0,0,0.55);
          pointer-events: none;
          opacity: 0;
          transition: opacity 160ms ease;
        `;
        document.body.appendChild(el);
      }
      el.textContent = String(text ?? "");
      el.style.opacity = "1";

      const margin = 10;
      let left = margin;
      let top = margin;

      if (ROOT && ROOT.isConnected) {
        const rect = ROOT.getBoundingClientRect();
        left = clamp(
          rect.left,
          margin,
          Math.max(margin, window.innerWidth - el.offsetWidth - margin)
        );
        top = clamp(rect.bottom + margin, margin, window.innerHeight - margin);
      }

      el.style.left = left + "px";
      el.style.top = top + "px";
      el.style.bottom = "auto";

      clearTimeout(TOAST_TIMER);
      TOAST_TIMER = setTimeout(() => {
        if (el) el.style.opacity = "0";
      }, ms);
    } catch {}
  }

  async function openBlacklistDialog() {
    if (!document.body) return;

    closeDialogById(BL_DIALOG_ID);

    const ovl = document.createElement("div");
    ovl.id = BL_DIALOG_ID;
    ovl.tabIndex = -1;
    ovl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      background: rgba(0,0,0,0.58);
      pointer-events: auto;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    `;

    const card = document.createElement("div");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.style.cssText = `
      width: min(760px, 92vw);
      max-height: min(84vh, 900px);
      overflow: hidden;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.14);
      background: #0f1115;
      color: #e9eef7;
      box-shadow: 0 18px 54px rgba(0,0,0,0.65);
    `;

    const top = document.createElement("div");
    top.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.10);
      background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0));
      font-weight: 900;
      letter-spacing: 0.2px;
    `;

    const title = document.createElement("div");
    title.textContent = "Blacklist Manager";

    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.title = "Close";
    x.style.cssText = `
      border: none;
      background: transparent;
      color: #a7b0c0;
      font-weight: 900;
      font-size: 18px;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 10px;
    `;
    x.addEventListener("mouseenter", () => (x.style.color = "#e9eef7"));
    x.addEventListener("mouseleave", () => (x.style.color = "#a7b0c0"));
    top.append(title, x);

    const body = document.createElement("div");
    body.style.cssText = `
      padding: 14px;
      display: grid;
      gap: 10px;
      overflow: auto;
      max-height: calc(min(84vh, 900px) - 56px);
    `;

    const list = (await get("aive_blacklist")) || [];
    const text = Array.isArray(list) ? list.join("\n") : "";

    const hint = document.createElement("div");
    hint.textContent =
      "One domain per line. You can paste full URLs too — AIVE will extract the hostname.";
    hint.style.cssText = "color:#a7b0c0;font-size:12px;line-height:1.4;";

    const ta = document.createElement("textarea");
    ta.spellcheck = false;
    ta.value = text;
    ta.placeholder = "youtube.com\nexample.com";
    ta.style.cssText = `
      width: 100%;
      min-height: 240px;
      max-height: 44vh;
      resize: vertical;
      background: #10131a;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 12px;
      padding: 10px;
      color: #e9eef7;
      outline: none;
      font-size: 13px;
      line-height: 1.35;
    `;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 8px;
      margin-top: 2px;
    `;

    function mkBtn(label, kind = "normal") {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText = `
        border: 1px solid rgba(255,255,255,0.14);
        background: ${kind === "secondary" ? "transparent" : kind === "danger" ? "#7a2b2b" : "#2a3140"};
        color: #e9eef7;
        border-radius: 12px;
        padding: 10px 10px;
        font-weight: 850;
        cursor: pointer;
      `;
      return b;
    }

    const saveBtn = mkBtn("Save");
    const cancelBtn = mkBtn("Cancel", "secondary");
    const addBtn = mkBtn("Add This Site");
    const removeBtn = mkBtn("Remove This Site", "danger");

    function close() {
      ovl.remove();
    }

    x.onclick = close;
    cancelBtn.onclick = close;

    ovl.addEventListener("click", (e) => {
      if (e.target === ovl) close();
    });

    ovl.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      },
      true
    );

    addBtn.onclick = () => {
      const domains = normalizeDomains(ta.value);
      const d = DOMAIN.toLowerCase();
      if (!domains.includes(d)) domains.push(d);
      ta.value = domains.join("\n");
      ta.focus();
    };

    removeBtn.onclick = () => {
      const d = DOMAIN.toLowerCase();
      const domains = normalizeDomains(ta.value).filter((x) => x !== d);
      ta.value = domains.join("\n");
      ta.focus();
    };

    saveBtn.onclick = async () => {
      const domains = normalizeDomains(ta.value);
      await set({ aive_blacklist: domains });
      close();
      toast("Blacklist saved");
    };

    btnRow.append(saveBtn, cancelBtn, addBtn, removeBtn);

    const current = document.createElement("div");
    current.textContent = `Current site: ${DOMAIN}`;
    current.style.cssText = "color:#a7b0c0;font-size:12px;";

    body.append(hint, ta, btnRow, current);
    card.append(top, body);
    ovl.append(card);
    document.body.appendChild(ovl);

    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  // Listen for SW message (if you wire a command in the extension)
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "AIVE_OPEN_BLACKLIST_DIALOG") openBlacklistDialog();
    });
  }

  // Fallback hotkey (works without chrome://extensions/shortcuts)
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        openBlacklistDialog();
      }
    },
    true
  );

  // ======================================================
  // VIDEO TARGETING
  // ======================================================
  let videoPref = { mode: "auto", index: 0 };
  let _cachedCandidates = [];
  let _cachedAt = 0;

  function isActuallyVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const st = getComputedStyle(el);
    if (!st || st.display === "none" || st.visibility === "hidden") return false;
    if (Number(st.opacity || "1") < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }

  function inViewport(r) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return r.bottom > 0 && r.right > 0 && r.left < vw && r.top < vh;
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
        const r = v.getBoundingClientRect();
        if (r.width < 120 || r.height < 80) continue;
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
    // Selector override (strongest)
    if (videoPref && videoPref.mode === "selector" && videoPref.selector) {
      try {
        const sel = String(videoPref.selector || "").trim();
        if (sel) {
          const vSel = document.querySelector(sel);
          if (vSel && vSel.tagName && vSel.tagName.toLowerCase() === "video") return vSel;
        }
      } catch {}
    }

    const cands = getCandidateVideos();
    if (!cands.length) return null;

    if (videoPref && videoPref.mode === "index") {
      const idxRaw = Number(videoPref.index);
      const idx = Math.max(0, Math.min(cands.length - 1, Number.isFinite(idxRaw) ? idxRaw : 0));
      return cands[idx] || pickBestVideo(cands);
    }

    return pickBestVideo(cands);
  }

  // ======================================================
  // EFFECTS
  // ======================================================
  const state = {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    sepia: 0,
    sharpen: 0,
    zoom: 1,
    flip: false
  };

  // Zoom origin (transform-origin)
  let zoomOrigin = { x: 50, y: 50 };

  function setOriginFromPoint(v, clientX, clientY) {
    const r = v.getBoundingClientRect();
    const x = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * 100;
    const y = clamp((clientY - r.top) / Math.max(1, r.height), 0, 1) * 100;
    zoomOrigin = { x, y };
  }

  // --- Sharpen filter (SVG feConvolveMatrix) ---
  const SHARP_ID = "aive-sharpen-filter";
  function ensureSharpenFilter() {
    if (document.getElementById(SHARP_ID)) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "aive-svg-filters");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "fixed";
    svg.style.left = "-9999px";
    svg.style.top = "-9999px";
    svg.innerHTML = `
      <filter id="${SHARP_ID}" x="-20%" y="-20%" width="140%" height="140%">
        <feConvolveMatrix id="${SHARP_ID}-matrix"
          order="3"
          preserveAlpha="true"
          kernelMatrix="0 0 0 0 1 0 0 0 0" />
      </filter>
    `;
    document.documentElement.appendChild(svg);
  }

  function updateSharpenKernel(amount01) {
    ensureSharpenFilter();
    const m = document.getElementById(`${SHARP_ID}-matrix`);
    if (!m) return;

    const s = clamp(Number(amount01) || 0, 0, 1);
    // 0..1 -> 0..0.35 (safe-ish range)
    const k = 0.35 * s;

    // 3x3 kernel:
    //  0  -k  0
    // -k  1+4k -k
    //  0  -k  0
    const center = 1 + 4 * k;
    const kernel = `0 ${-k} 0 ${-k} ${center} ${-k} 0 ${-k} 0`;
    m.setAttribute("kernelMatrix", kernel);
  }

  // Sticky observer (some sites reset styles)
  let _observedVideo = null;
  let _styleObserver = null;
  let _applyingStyles = false;
  let _obsDebounce = 0;

  function applyEffects() {
    const v = getVideo();
    if (!v) return;

    const filterParts = [];

    if (state.sharpen > 0.001) {
      updateSharpenKernel(state.sharpen);
      filterParts.push(`url(#${SHARP_ID})`);
    }

    filterParts.push(
      `brightness(${state.brightness})`,
      `contrast(${state.contrast})`,
      `saturate(${state.saturation})`,
      `hue-rotate(${state.hue}deg)`,
      `sepia(${state.sepia})`
    );

    const filterStr = filterParts.join(" ");
    const transformStr = `scale(${state.zoom}) scaleX(${state.flip ? -1 : 1})`;

    if (v !== _observedVideo) {
      _observedVideo = v;
      if (_styleObserver) _styleObserver.disconnect();

      _styleObserver = new MutationObserver(() => {
        if (_applyingStyles) return;
        clearTimeout(_obsDebounce);
        _obsDebounce = setTimeout(() => applyEffects(), 50);
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

  // ======================================================
  // QUICK ZOOM (HOLD Z)
  // ======================================================
  const QUICK_ZOOM_HOLD_KEY = "KeyZ";
  const QUICK_ZOOM_STEP = 1.18;
  const QUICK_ZOOM_MIN = 1.0;
  const QUICK_ZOOM_MAX = 3.5;

  let quickHeld = false;
  let zoomDragging = false;
  let dragStart = null;

  function findVideoFromEvent(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
    if (el && el.tagName && el.tagName.toLowerCase() === "video") return el;
    const v = el && el.closest ? el.closest("video") : null;
    return v || getVideo();
  }

  function insideVideo(v, ev) {
    const r = v.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  }

  function updateZoomSlider() {
    if (!ROOT) return;
    const r = ROOT.querySelector('input[data-key="zoom"]');
    if (!r) return;
    r.value = String(state.zoom);
    const span = r.previousElementSibling?.querySelector?.(".aive-val");
    if (span) span.textContent = formatNum(state.zoom);
  }

  function zoomAt(v, ev, dir) {
    setOriginFromPoint(v, ev.clientX, ev.clientY);

    if (dir > 0) state.zoom = clamp(state.zoom * QUICK_ZOOM_STEP, QUICK_ZOOM_MIN, QUICK_ZOOM_MAX);
    else state.zoom = clamp(state.zoom / QUICK_ZOOM_STEP, QUICK_ZOOM_MIN, QUICK_ZOOM_MAX);

    if (state.zoom <= QUICK_ZOOM_MIN + 1e-6) {
      state.zoom = 1;
      zoomOrigin = { x: 50, y: 50 };
    }

    applyEffects();
    updateZoomSlider();
  }

  window.addEventListener("blur", () => {
    quickHeld = false;
    zoomDragging = false;
    dragStart = null;
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.code !== QUICK_ZOOM_HOLD_KEY) return;
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      quickHeld = true;
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.code !== QUICK_ZOOM_HOLD_KEY) return;
      quickHeld = false;
      zoomDragging = false;
      dragStart = null;
    },
    true
  );

  window.addEventListener(
    "mousedown",
    (e) => {
      if (!quickHeld) return;
      if (isTypingTarget(e.target)) return;

      const v = findVideoFromEvent(e);
      if (!v) return;
      if (!insideVideo(v, e)) return;

      if (e.button === 0) {
        zoomAt(v, e, +1);

        zoomDragging = true;
        const rect = v.getBoundingClientRect();
        dragStart = {
          x: e.clientX,
          y: e.clientY,
          ox: zoomOrigin.x,
          oy: zoomOrigin.y,
          vw: rect.width,
          vh: rect.height
        };

        e.preventDefault();
        e.stopPropagation();
      } else if (e.button === 2) {
        zoomAt(v, e, -1);
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!quickHeld || !zoomDragging || !dragStart) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      const nx = clamp(dragStart.ox - (dx / Math.max(1, dragStart.vw)) * 100, 0, 100);
      const ny = clamp(dragStart.oy - (dy / Math.max(1, dragStart.vh)) * 100, 0, 100);
      zoomOrigin = { x: nx, y: ny };

      if (state.zoom > 1.0001) applyEffects();

      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  window.addEventListener(
    "mouseup",
    () => {
      if (!zoomDragging) return;
      zoomDragging = false;
      dragStart = null;
    },
    true
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (!quickHeld) return;
      if (isTypingTarget(e.target)) return;

      const v = findVideoFromEvent(e);
      if (!v) return;
      if (!insideVideo(v, e)) return;

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
      if (!quickHeld) return;
      const v = findVideoFromEvent(e);
      if (!v) return;
      if (!insideVideo(v, e)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  // ======================================================
  // PANEL UI
  // ======================================================
  let anchorMode = "bottom";
  let pinned = false;

  const EDGE_PAD = 8;
  const SNAP_PX = 28;

  function viewportSize() {
    const vv = window.visualViewport;
    if (vv) return { w: vv.width, h: vv.height };
    return { w: window.innerWidth || 1000, h: window.innerHeight || 800 };
  }

  function snapAndClamp(left, offset, anchor) {
    const rect = ROOT.getBoundingClientRect();
    const panelW = rect.width || 360;
    const panelH = rect.height || 80;

    const { w: vw, h: vh } = viewportSize();

    left = clamp(left, EDGE_PAD, vw - panelW - EDGE_PAD);

    if (anchor === "bottom") {
      let bottom = clamp(offset, EDGE_PAD, vh - panelH - EDGE_PAD);

      if (left <= SNAP_PX) left = EDGE_PAD;
      if (bottom <= SNAP_PX) bottom = EDGE_PAD;

      const distRight = vw - (left + panelW);
      const distTop = vh - (bottom + panelH);

      if (distRight <= SNAP_PX) left = vw - panelW - EDGE_PAD;
      if (distTop <= SNAP_PX) bottom = vh - panelH - EDGE_PAD;

      return { left, bottom };
    } else {
      let top = clamp(offset, EDGE_PAD, vh - panelH - EDGE_PAD);

      if (left <= SNAP_PX) left = EDGE_PAD;
      if (top <= SNAP_PX) top = EDGE_PAD;

      const distRight = vw - (left + panelW);
      const distBottom = vh - (top + panelH);

      if (distRight <= SNAP_PX) left = vw - panelW - EDGE_PAD;
      if (distBottom <= SNAP_PX) top = vh - panelH - EDGE_PAD;

      return { left, top };
    }
  }

  function setPosition(left, offset, anchor) {
    const { w: vw, h: vh } = viewportSize();
    left = clamp(left, EDGE_PAD, vw - EDGE_PAD);

    ROOT.style.left = left + "px";
    if (anchor === "bottom") {
      ROOT.style.bottom = clamp(offset, EDGE_PAD, vh - EDGE_PAD) + "px";
      ROOT.style.top = "auto";
    } else {
      ROOT.style.top = clamp(offset, EDGE_PAD, vh - EDGE_PAD) + "px";
      ROOT.style.bottom = "auto";
    }
  }

  function ensureInViewHard() {
    if (!ROOT) return;
    const rect = ROOT.getBoundingClientRect();
    const { w: vw, h: vh } = viewportSize();

    let left = rect.left;
    if (left < EDGE_PAD) left = EDGE_PAD;
    if (left + rect.width > vw - EDGE_PAD) left = Math.max(EDGE_PAD, vw - rect.width - EDGE_PAD);

    if (anchorMode === "bottom") {
      const bottom = Math.max(EDGE_PAD, vh - rect.bottom);
      const fixed = snapAndClamp(left, bottom, "bottom");
      setPosition(fixed.left, fixed.bottom, "bottom");
    } else {
      const top = Math.max(EDGE_PAD, rect.top);
      const fixed = snapAndClamp(left, top, "top");
      setPosition(fixed.left, fixed.top, "top");
    }
  }

  function slider(label, key, min, max, step, val) {
    const v = Number(val);
    return `
      <div class="aive-row">
        <label>${label} <span class="aive-val">${formatNum(v)}</span></label>
        <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${v}">
      </div>`;
  }

  function createPanel() {
    ROOT = document.createElement("div");
    ROOT.id = "aive-root";
    ROOT.style.cssText = `
      position: fixed;
      z-index: 2147483646;
      left: ${EDGE_PAD}px;
      bottom: ${EDGE_PAD}px;
      top: auto;
      width: 360px;
      user-select: none;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    `;

    ROOT.innerHTML = `
      <style>
        #aive-root .aive-panel{
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(15,17,21,0.92);
          color: #e9eef7;
          border-radius: 14px;
          box-shadow: 0 12px 34px rgba(0,0,0,0.55);
          overflow: hidden;
          backdrop-filter: blur(8px);
        }
        #aive-root .aive-header{
          display:flex; align-items:center; justify-content:space-between;
          padding: 10px 10px;
          font-weight: 900;
          cursor: grab;
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0));
          border-bottom: 1px solid rgba(255,255,255,0.10);
          gap: 10px;
        }
        #aive-root .aive-header:active{ cursor: grabbing; }
        #aive-root .aive-title{ letter-spacing: 0.2px; }
        #aive-root .aive-actions{ display:flex; gap:8px; }
        #aive-root button{
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: #e9eef7;
          border-radius: 10px;
          padding: 6px 10px;
          font-weight: 850;
          cursor: pointer;
          line-height: 1;
        }
        #aive-root button:hover{ background: rgba(255,255,255,0.10); }
        #aive-root .aive-body{
          padding: 10px 10px;
          display: grid;
          gap: 10px;
          max-height: min(70vh, 560px);
          overflow: auto;
        }
        #aive-root .aive-row{ display:grid; gap:6px; }
        #aive-root label{
          font-size: 12px;
          color:#a7b0c0;
          display:flex;
          justify-content:space-between;
          gap: 12px;
        }
        #aive-root input[type=range]{ width:100%; }
        #aive-root .aive-buttons-3{
          display:grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-top: 2px;
        }
        #aive-root .aive-collapsed .aive-body{ display:none; }
        #aive-root .aive-pill{ min-width: 68px; text-align:center; }
      </style>

      <div class="aive-panel aive-collapsed">
        <div class="aive-header">
          <div class="aive-title">AIVE</div>
          <div class="aive-actions">
            <button class="aive-pin aive-pill" type="button" title="Pin">📌</button>
            <button class="aive-anchor aive-pill" type="button" title="Toggle anchor">Bottom</button>
            <button class="aive-bl aive-pill" type="button" title="Blacklist">B</button>
            <button class="aive-close aive-pill" type="button" title="Close">✕</button>
          </div>
        </div>

        <div class="aive-body">
          ${slider("Brightness", "brightness", 0, 2, 0.01, state.brightness)}
          ${slider("Contrast", "contrast", 0, 2, 0.01, state.contrast)}
          ${slider("Saturation", "saturation", 0, 2, 0.01, state.saturation)}
          ${slider("Hue", "hue", 0, 360, 0.5, state.hue)}
          ${slider("Sepia", "sepia", 0, 1, 0.01, state.sepia)}
          ${slider("Sharpen", "sharpen", 0, 1, 0.01, state.sharpen)}
          ${slider("Zoom", "zoom", 1, QUICK_ZOOM_MAX, 0.01, state.zoom)}

          <div class="aive-row">
            <label>Flip Horizontal <span class="aive-val">${state.flip ? "On" : "Off"}</span></label>
            <button class="aive-flip" type="button">Flip</button>
          </div>

          <div class="aive-row">
            <label>Target Video <span class="aive-val aive-target-status">Auto</span></label>
            <div style="display:flex; gap:8px;">
              <button class="aive-target-prev" type="button">◀</button>
              <button class="aive-target-auto" type="button">Auto</button>
              <button class="aive-target-next" type="button">▶</button>
              <button class="aive-target-sel" type="button">Sel</button>
            </div>
          </div>

          <div class="aive-buttons-3">
            <button class="aive-auto" type="button">Auto</button>
            <button class="aive-reset" type="button">Reset</button>
            <button class="aive-hide" type="button">Hide Tab</button>
          </div>

          <div style="color:#a7b0c0;font-size:11px;line-height:1.35;">
            Quick Zoom: hold <b>Z</b> + wheel/click/right-click/drag on video.<br>
            Blacklist: click <b>B</b> or press <b>Alt+Shift+B</b>.
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(ROOT);

    const panel = ROOT.querySelector(".aive-panel");
    const header = ROOT.querySelector(".aive-header");

    let open = false;

    function setCollapsed(collapsed) {
      panel.classList.toggle("aive-collapsed", collapsed);
      ensureInViewHard();
    }

    header.addEventListener("mouseenter", () => {
      if (pinned) return;
      if (!open) {
        open = true;
        setCollapsed(false);
      }
    });

    panel.addEventListener("mouseleave", () => {
      if (pinned) return;
      if (open) {
        open = false;
        setCollapsed(true);
      }
    });

    // Drag header
    let draggingPanel = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startOffset = 0;

    const readOffset = () => {
      const rect = ROOT.getBoundingClientRect();
      const { h: vh } = viewportSize();
      return anchorMode === "bottom" ? vh - rect.bottom : rect.top;
    };

    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest("button")) return;
      draggingPanel = true;
      header.setPointerCapture(e.pointerId);

      const rect = ROOT.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startOffset = readOffset();

      e.preventDefault();
    });

    header.addEventListener("pointermove", (e) => {
      if (!draggingPanel) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const nextLeft = startLeft + dx;

      if (anchorMode === "bottom") {
        const nextBottom = startOffset - dy;
        const fixed = snapAndClamp(nextLeft, nextBottom, "bottom");
        setPosition(fixed.left, fixed.bottom, "bottom");
      } else {
        const nextTop = startOffset + dy;
        const fixed = snapAndClamp(nextLeft, nextTop, "top");
        setPosition(fixed.left, fixed.top, "top");
      }
    });

    header.addEventListener("pointerup", async (e) => {
      if (!draggingPanel) return;
      draggingPanel = false;
      try { header.releasePointerCapture(e.pointerId); } catch {}
      await persistPosition();
    });

    header.addEventListener("pointercancel", () => {
      draggingPanel = false;
    });

    // Buttons
    const pinBtn = ROOT.querySelector(".aive-pin");
    const anchorBtn = ROOT.querySelector(".aive-anchor");
    const blBtn = ROOT.querySelector(".aive-bl");
    const closeBtn = ROOT.querySelector(".aive-close");
    const flipBtn = ROOT.querySelector(".aive-flip");
    const resetBtn = ROOT.querySelector(".aive-reset");
    const hideBtn = ROOT.querySelector(".aive-hide");
    const autoBtn = ROOT.querySelector(".aive-auto");

    if (closeBtn) closeBtn.onclick = () => ROOT.remove();
    if (blBtn) blBtn.onclick = () => openBlacklistDialog();

    if (pinBtn) {
      pinBtn.onclick = async () => {
        pinned = !pinned;
        pinBtn.style.background = pinned ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
        if (pinned) {
          open = true;
          panel.classList.remove("aive-collapsed");
        }
        await persistPosition();
        toast(pinned ? "Pinned" : "Unpinned");
      };
    }

    if (anchorBtn) {
      anchorBtn.onclick = async () => {
        anchorMode = anchorMode === "bottom" ? "top" : "bottom";
        anchorBtn.textContent = anchorMode === "bottom" ? "Bottom" : "Top";
        await set({ [ANCHOR_KEY]: anchorMode });
        ensureInViewHard();
        await persistPosition();
      };
    }

    header.addEventListener("dblclick", async (e) => {
      if (e.target && e.target.closest && e.target.closest("button")) return;
      anchorMode = anchorMode === "bottom" ? "top" : "bottom";
      if (anchorBtn) anchorBtn.textContent = anchorMode === "bottom" ? "Bottom" : "Top";
      await set({ [ANCHOR_KEY]: anchorMode });
      ensureInViewHard();
      await persistPosition();
    });

    if (flipBtn) {
      flipBtn.onclick = () => {
        state.flip = !state.flip;
        applyEffects();
        const lab = flipBtn.parentElement?.querySelector?.("label .aive-val");
        if (lab) lab.textContent = state.flip ? "On" : "Off";
      };
    }

    if (resetBtn) {
      resetBtn.onclick = () => {
        Object.assign(state, {
          brightness: 1,
          contrast: 1,
          saturation: 1,
          hue: 0,
          sepia: 0,
          sharpen: 0,
          zoom: 1,
          flip: false
        });
        zoomOrigin = { x: 50, y: 50 };

        ROOT.querySelectorAll('input[type="range"]').forEach((r) => {
          const k = r.dataset.key;
          if (k && Object.prototype.hasOwnProperty.call(state, k)) {
            r.value = String(state[k]);
            const span = r.previousElementSibling?.querySelector?.(".aive-val");
            if (span) span.textContent = formatNum(Number(r.value));
          }
        });

        const flipLab = ROOT.querySelector(".aive-flip")?.parentElement?.querySelector?.("label .aive-val");
        if (flipLab) flipLab.textContent = "Off";

        applyEffects();
        toast("Reset");
      };
    }

    if (hideBtn) {
      hideBtn.onclick = () => {
        ROOT.remove();
        toast("Panel hidden (reload tab to restore)");
      };
    }

    if (autoBtn) {
      autoBtn.onclick = () => {
        const map = { brightness: 1.1, contrast: 1.1, saturation: 1.15 };
        state.brightness = map.brightness;
        state.contrast = map.contrast;
        state.saturation = map.saturation;

        for (const [k, v] of Object.entries(map)) {
          const r = ROOT.querySelector(`input[data-key="${k}"]`);
          if (r) {
            r.value = String(v);
            const span = r.previousElementSibling?.querySelector?.(".aive-val");
            if (span) span.textContent = formatNum(v);
          }
        }

        applyEffects();
        toast("Auto preset applied");
      };
    }

    // Sliders
    ROOT.querySelectorAll('input[type="range"]').forEach((r) => {
      r.addEventListener("input", () => {
        const k = r.dataset.key;
        const v = Number(r.value);

        const span = r.previousElementSibling?.querySelector?.(".aive-val");
        if (span) span.textContent = formatNum(v);

        if (k && Object.prototype.hasOwnProperty.call(state, k)) {
          state[k] = v;

          if (k === "zoom" && state.zoom <= 1.0001) zoomOrigin = { x: 50, y: 50 };
          if (k === "sharpen") updateSharpenKernel(state.sharpen);

          applyEffects();
        }
      });
    });

    // Target video controls
    const status = ROOT.querySelector(".aive-target-status");

    function updateTargetUI() {
      const cands = getCandidateVideos();
      if (!cands.length) {
        if (status) status.textContent = "No video";
        return;
      }
      if (!status) return;

      if (videoPref.mode === "index") status.textContent = `${(videoPref.index | 0) + 1}/${cands.length}`;
      else if (videoPref.mode === "selector") status.textContent = `Sel (${cands.length})`;
      else status.textContent = `Auto (${cands.length})`;
    }

    const setVideoIndex = async (idx) => {
      const cands = getCandidateVideos();
      if (!cands.length) return;
      const n = cands.length;
      const next = ((Number(idx) || 0) % n + n) % n;
      videoPref = { mode: "index", index: next };
      await set({ [VIDEO_PREF_KEY]: videoPref });
      updateTargetUI();
      applyEffects();
      toast(`Target: ${next + 1}/${n}`);
    };

    const prevBtn = ROOT.querySelector(".aive-target-prev");
    const nextBtn = ROOT.querySelector(".aive-target-next");
    const autoPickBtn = ROOT.querySelector(".aive-target-auto");
    const selBtn = ROOT.querySelector(".aive-target-sel");

    if (prevBtn) prevBtn.onclick = async () => setVideoIndex((videoPref.index || 0) - 1);
    if (nextBtn) nextBtn.onclick = async () => setVideoIndex((videoPref.index || 0) + 1);

    if (autoPickBtn) {
      autoPickBtn.onclick = async () => {
        videoPref = { mode: "auto", index: 0 };
        await set({ [VIDEO_PREF_KEY]: videoPref });
        updateTargetUI();
        applyEffects();
        toast("Target: Auto");
      };
    }

    if (selBtn) {
      selBtn.onclick = async () => {
        const entered = prompt(
          "CSS selector for the target <video> on this site:",
          videoPref.mode === "selector" && videoPref.selector ? String(videoPref.selector) : "video"
        );
        if (entered === null) return;

        const sel = String(entered).trim();
        if (!sel) videoPref = { mode: "auto", index: 0 };
        else videoPref = { mode: "selector", selector: sel, index: 0 };

        await set({ [VIDEO_PREF_KEY]: videoPref });
        updateTargetUI();
        applyEffects();
        toast(videoPref.mode === "selector" ? "Target: Selector" : "Target: Auto");
      };
    }

    updateTargetUI();
    const uiTimer = setInterval(() => {
      if (!ALIVE) return clearInterval(uiTimer);
      if (!ROOT || !ROOT.isConnected) return clearInterval(uiTimer);
      updateTargetUI();
    }, 1500);

    requestAnimationFrame(() => {
      ensureInViewHard();
      const rect = ROOT.getBoundingClientRect();
      if (
        rect.right < 10 ||
        rect.bottom < 10 ||
        rect.left > window.innerWidth - 10 ||
        rect.top > window.innerHeight - 10
      ) {
        setPosition(EDGE_PAD, EDGE_PAD, "bottom");
        ensureInViewHard();
      }
    });
  }

  async function persistPosition() {
    if (!ROOT) return;

    const rect = ROOT.getBoundingClientRect();
    const { h: vh } = viewportSize();

    const store = { pinned: !!pinned, anchor: anchorMode };

    if (anchorMode === "bottom") {
      const bottom = vh - rect.bottom;
      store.bottom = snapAndClamp(rect.left, bottom, "bottom");
    } else {
      store.top = snapAndClamp(rect.left, rect.top, "top");
    }

    await set({ [POS_KEY]: store, [ANCHOR_KEY]: anchorMode });
  }

  function applySavedPosition(pos) {
    if (!ROOT) return;
    const defLeft = EDGE_PAD;

    if (pos && pos.anchor === "top") anchorMode = "top";
    else if (pos && pos.anchor === "bottom") anchorMode = "bottom";

    pinned = !!(pos && pos.pinned);

    if (anchorMode === "bottom") {
      const saved = pos && pos.bottom ? pos.bottom : null;
      const left = saved && Number.isFinite(saved.left) ? saved.left : defLeft;
      const bottom = saved && Number.isFinite(saved.bottom) ? saved.bottom : EDGE_PAD;
      const fixed = snapAndClamp(left, bottom, "bottom");
      setPosition(fixed.left, fixed.bottom, "bottom");
    } else {
      const saved = pos && pos.top ? pos.top : null;
      const left = saved && Number.isFinite(saved.left) ? saved.left : defLeft;
      const top = saved && Number.isFinite(saved.top) ? saved.top : EDGE_PAD;
      const fixed = snapAndClamp(left, top, "top");
      setPosition(fixed.left, fixed.top, "top");
    }
  }

  // ======================================================
  // INIT
  // ======================================================
  (async () => {
    // IMPORTANT: blacklist stops the panel, but the dialog still works via hotkey
    if (await isBlacklisted()) return;

    const vp = await get(VIDEO_PREF_KEY);
    if (vp && typeof vp === "object") {
      const mode = vp.mode === "index" || vp.mode === "selector" ? vp.mode : "auto";
      videoPref = { mode, index: Number(vp.index) || 0, selector: vp.selector };
    } else {
      videoPref = { mode: "auto", index: 0 };
    }

    const globalAnchor = (await get(ANCHOR_KEY)) || null;
    if (globalAnchor === "top" || globalAnchor === "bottom") anchorMode = globalAnchor;

    const pos = await get(POS_KEY);

    const wait = () => {
      if (!ALIVE) return;
      if (!document.body) return requestAnimationFrame(wait);

      createPanel();
      applySavedPosition(pos);

      const anchorBtn = ROOT.querySelector(".aive-anchor");
      if (anchorBtn) anchorBtn.textContent = anchorMode === "bottom" ? "Bottom" : "Top";

      const pinBtn = ROOT.querySelector(".aive-pin");
      if (pinBtn) {
        pinBtn.style.background = pinned ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
      }

      if (pinned) {
        const panel = ROOT.querySelector(".aive-panel");
        if (panel) panel.classList.remove("aive-collapsed");
      }

      ensureInViewHard();
      applyEffects();

      const onResize = () => ensureInViewHard();
      window.addEventListener("resize", onResize, { passive: true });
      window.visualViewport?.addEventListener?.("resize", onResize, { passive: true });

      persistPosition();
    };

    wait();
  })();
})();