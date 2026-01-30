console.log("AIVE content script loaded", location.href);

// ======================================================
// AIVE – CONTENT SCRIPT
// - Anchor toggle: TOP/BOTTOM
// - Double-click header toggles anchor
// - Pin mode (📌): keeps panel open (no auto-collapse)
// - Collapsed mode: shrinks to header-only bar (AIVE + 📌 + ?)
// - Auto-tune analyzes video pixels when allowed; falls back when blocked
// - Help + Blacklist dialogs always work (even when blacklisted)
// ======================================================

(() => {
  "use strict";

  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  let ALIVE = true;
  window.addEventListener("pagehide", () => (ALIVE = false));
  window.addEventListener("beforeunload", () => (ALIVE = false));

  // --------------------------------------------------
  // STORAGE
  // --------------------------------------------------

  const STORE =
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
      ? chrome.storage.local
      : null;

  const get = (key) =>
    new Promise((r) =>
      STORE ? STORE.get(key, (o) => r(o[key])) : r(undefined)
    );

  const set = (obj) => new Promise((r) => (STORE ? STORE.set(obj, r) : r()));

  const DOMAIN = location.hostname;
  const POS_KEY = `aive_pos_${DOMAIN}`;
  const ANCHOR_KEY = `aive_anchor_mode`; // global

  // --------------------------------------------------
  // DIALOGS (HELP + BLACKLIST) — WORK EVERYWHERE
  // --------------------------------------------------

  const BL_DIALOG_ID = "aive-blacklist-dialog";
  const HELP_DIALOG_ID = "aive-help-dialog";

  function closeDialogById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function makeOverlay(id) {
    closeDialogById(id);

    const ovl = document.createElement("div");
    ovl.id = id;
    ovl.tabIndex = -1;

    ovl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      pointer-events: auto;
    `;

    const backdrop = document.createElement("div");
    backdrop.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.58);
    `;

    const card = document.createElement("div");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.style.cssText = `
      position: relative;
      width: min(760px, 92vw);
      max-height: min(84vh, 900px);
      overflow: hidden;

      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.14);
      background: #0f1115;
      color: #e9eef7;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
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
      font-weight: 950;
      letter-spacing: 0.2px;
    `;

    const title = document.createElement("div");
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

    top.appendChild(title);
    top.appendChild(x);

    const body = document.createElement("div");
    body.style.cssText = `
      padding: 14px;
      display: grid;
      gap: 12px;
      overflow: auto;
      max-height: calc(min(84vh, 900px) - 56px);
    `;

    const close = () => ovl.remove();

    backdrop.addEventListener("click", close);
    x.addEventListener("click", close);

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

    card.addEventListener("click", (e) => e.stopPropagation());

    card.appendChild(top);
    card.appendChild(body);

    ovl.appendChild(backdrop);
    ovl.appendChild(card);

    return { ovl, titleEl: title, bodyEl: body };
  }

  function smallMuted(text) {
    const p = document.createElement("div");
    p.textContent = text;
    p.style.cssText = `
      color: #a7b0c0;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
    `;
    return p;
  }

  function chip(text) {
    const c = document.createElement("span");
    c.textContent = text;
    c.style.cssText = `
      display: inline-flex;
      align-items: center;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.04);
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 850;
      color: #e9eef7;
      white-space: nowrap;
    `;
    return c;
  }

  function section(titleText) {
    const s = document.createElement("div");
    s.style.cssText = `
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.03);
      border-radius: 14px;
      padding: 12px;
      display: grid;
      gap: 8px;
    `;

    const h = document.createElement("div");
    h.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-weight: 950;
      font-size: 13px;
      letter-spacing: 0.15px;
    `;

    const t = document.createElement("div");
    t.textContent = titleText;

    h.appendChild(t);
    s.appendChild(h);

    return { s, h };
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

  async function openBlacklistDialog() {
    if (!document.body) return;

    const { ovl, titleEl, bodyEl } = makeOverlay(BL_DIALOG_ID);
    titleEl.textContent = "Blacklist Manager";

    const list = (await get("aive_blacklist")) || [];
    const text = Array.isArray(list) ? list.join("\n") : "";

    const sec = section("Domains");
    sec.h.appendChild(chip("Alt + Shift + B"));

    const hint = smallMuted(
      "One domain per line. You can paste full URLs too — AIVE will extract the hostname."
    );

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
    ta.addEventListener(
      "focus",
      () => (ta.style.borderColor = "rgba(77,163,255,0.55)")
    );
    ta.addEventListener(
      "blur",
      () => (ta.style.borderColor = "rgba(255,255,255,0.14)")
    );

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
        background: ${
          kind === "secondary"
            ? "transparent"
            : kind === "danger"
            ? "#7a2b2b"
            : "#2a3140"
        };
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

    cancelBtn.onclick = () => ovl.remove();

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
      ovl.remove();
    };

    btnRow.append(saveBtn, cancelBtn, addBtn, removeBtn);

    const current = smallMuted(`Current site: ${DOMAIN}`);

    sec.s.append(hint, ta, btnRow, current);
    bodyEl.appendChild(sec.s);

    document.body.appendChild(ovl);
    ovl.focus();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function openHelpDialog(anchorMode, pinned) {
    if (!document.body) return;

    const { ovl, titleEl, bodyEl } = makeOverlay(HELP_DIALOG_ID);
    titleEl.textContent = "AIVE Help";

    const sec1 = section("Quick use");
    sec1.h.appendChild(chip(`Anchor: ${anchorMode.toUpperCase()}`));
    sec1.h.appendChild(chip(pinned ? "Pinned" : "Auto-collapse"));
    sec1.s.appendChild(
      smallMuted(
        "• Hover the header to open the controls.\n" +
          "• When collapsed, AIVE shrinks to a little bar (AIVE + 📌 + ?).\n" +
          "• Drag the header to move the panel.\n" +
          "• Double-click the header to toggle TOP/BOTTOM anchor.\n" +
          "• Click 📌 to pin it open.\n" +
          "• Effects apply to the page’s first <video> element."
      )
    );

    const sec2 = section("Hotkey");
    sec2.h.appendChild(chip("Alt + Shift + B"));
    sec2.s.appendChild(
      smallMuted(
        "Opens the Blacklist Manager on any normal website (even if the site is blacklisted).\n" +
          "If it doesn’t fire, check chrome://extensions/shortcuts."
      )
    );

    const sec3 = section("Auto (important)");
    sec3.s.appendChild(
      smallMuted(
        "Auto tries to sample video pixels to pick settings.\n" +
          "Some sites block pixel sampling (cross-origin video). On those sites, Auto falls back to a gentle preset."
      )
    );

    const sec4 = section("Blacklist");
    const openBL = document.createElement("button");
    openBL.type = "button";
    openBL.textContent = "Open Blacklist Manager";
    openBL.style.cssText = `
      border: 1px solid rgba(255,255,255,0.14);
      background: #2a3140;
      color: #e9eef7;
      border-radius: 12px;
      padding: 10px 10px;
      font-weight: 850;
      cursor: pointer;
      width: min(280px, 100%);
    `;
    openBL.onclick = () => {
      ovl.remove();
      openBlacklistDialog();
    };
    sec4.s.appendChild(
      smallMuted(
        "Blacklisted sites won’t show the panel/effects, but the blacklist dialog is always available."
      ),
      openBL
    );

    bodyEl.append(sec1.s, sec2.s, sec3.s, sec4.s);

    document.body.appendChild(ovl);
    ovl.focus();
  }

  // Always listen for SW message (even if blacklisted)
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "AIVE_OPEN_BLACKLIST_DIALOG") {
        openBlacklistDialog();
      }
    });
  }

  // Fallback hotkey (less reliable than Chrome command)
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        const t = e.target;
        const tag = t && t.tagName ? t.tagName.toLowerCase() : "";
        const typing =
          tag === "input" || tag === "textarea" || (t && t.isContentEditable);
        if (!typing) {
          e.preventDefault();
          openBlacklistDialog();
        }
      }
    },
    true
  );

  async function isBlacklisted() {
    const list = (await get("aive_blacklist")) || [];
    return Array.isArray(list) && list.includes(DOMAIN);
  }

  // --------------------------------------------------
  // PANEL + EFFECTS (ONLY WHEN NOT BLACKLISTED)
  // --------------------------------------------------

  const getVideo = () => document.querySelector("video");

  const state = {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    sepia: 0,
    zoom: 1,
    flip: false
  };

  function applyEffects() {
    const v = getVideo();
    if (!v) return;

    v.style.filter = `
      brightness(${state.brightness})
      contrast(${state.contrast})
      saturate(${state.saturation})
      hue-rotate(${state.hue}deg)
      sepia(${state.sepia})
    `;

    v.style.transform = `
      scale(${state.zoom})
      scaleX(${state.flip ? -1 : 1})
    `;
  }

  let animMS = 1200;
  let inertia = 2.4;
  let delayMS = 600;
  const ease = (t) => 1 - Math.pow(1 - t, inertia);

  let ROOT;

  // posStore (new format):
  // { anchor, pinned, top:{left,top}, bottom:{left,bottom} }
  let posStore = { anchor: null, pinned: false, top: null, bottom: null };
  let anchorMode = "bottom";
  let pinned = false;

  function slider(label, key, min, max, step, val) {
    return `
      <div class="aive-row">
        <label>${label} <span class="aive-val">${val}</span></label>
        <input type="range"
          data-key="${key}"
          min="${min}" max="${max}" step="${step}" value="${val}">
      </div>`;
  }

  const SNAP_PX = 28;
  const EDGE_PAD = 8;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function viewportSize() {
    const vv = window.visualViewport;
    if (vv) return { w: vv.width, h: vv.height };
    return { w: window.innerWidth || 1000, h: window.innerHeight || 800 };
  }

  function normalizeSavedPos(raw) {
    if (raw && typeof raw === "object") {
      // New format
      if (raw.top || raw.bottom || "pinned" in raw || "anchor" in raw) {
        return {
          anchor:
            raw.anchor === "top" || raw.anchor === "bottom" ? raw.anchor : null,
          pinned: !!raw.pinned,
          top: raw.top || null,
          bottom: raw.bottom || null
        };
      }

      // Legacy formats:
      // {left, top} or {left, bottom}
      const left = Number.isFinite(raw.left) ? raw.left : 20;

      if (Number.isFinite(raw.bottom)) {
        return { anchor: "bottom", pinned: false, top: null, bottom: { left, bottom: raw.bottom } };
      }
      if (Number.isFinite(raw.top)) {
        return { anchor: "top", pinned: false, top: { left, top: raw.top }, bottom: null };
      }
    }

    return { anchor: null, pinned: false, top: null, bottom: null };
  }

  function currentLeft() {
    const v = parseFloat(ROOT.style.left);
    if (Number.isFinite(v)) return v;
    return ROOT.getBoundingClientRect().left || 0;
  }

  function currentTop() {
    const v = parseFloat(ROOT.style.top);
    if (Number.isFinite(v)) return v;
    return ROOT.getBoundingClientRect().top || 0;
  }

  function currentBottom() {
    const v = parseFloat(ROOT.style.bottom);
    if (Number.isFinite(v)) return v;
    const rect = ROOT.getBoundingClientRect();
    const { h: vh } = viewportSize();
    return vh - rect.bottom;
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
    ROOT.style.left = left + "px";

    if (anchor === "bottom") {
      ROOT.style.bottom = offset + "px";
      ROOT.style.top = "auto";
    } else {
      ROOT.style.top = offset + "px";
      ROOT.style.bottom = "auto";
    }
  }

  function ensureInView() {
    if (!ROOT) return;

    const left = currentLeft();

    if (anchorMode === "bottom") {
      const bottom = currentBottom();
      const fixed = snapAndClamp(left, bottom, "bottom");
      setPosition(fixed.left, fixed.bottom, "bottom");
    } else {
      const top = currentTop();
      const fixed = snapAndClamp(left, top, "top");
      setPosition(fixed.left, fixed.top, "top");
    }
  }

  async function persistPosition() {
    if (!ROOT) return;

    const rect = ROOT.getBoundingClientRect();
    const left = rect.left;
    const { h: vh } = viewportSize();

    posStore.pinned = !!pinned;

    if (anchorMode === "bottom") {
      const bottom = vh - rect.bottom;
      posStore.bottom = snapAndClamp(left, bottom, "bottom");
      posStore.anchor = "bottom";
      setPosition(posStore.bottom.left, posStore.bottom.bottom, "bottom");
    } else {
      const top = rect.top;
      posStore.top = snapAndClamp(left, top, "top");
      posStore.anchor = "top";
      setPosition(posStore.top.left, posStore.top.top, "top");
    }

    await set({ [POS_KEY]: posStore, [ANCHOR_KEY]: anchorMode });
  }

  async function setAnchorMode(nextMode) {
    if (nextMode !== "top" && nextMode !== "bottom") return;
    if (nextMode === anchorMode) return;

    // Save current spot into current anchor bucket first
    await persistPosition();

    anchorMode = nextMode;
    posStore.anchor = nextMode;

    ROOT.classList.toggle("aive-anchor-top", anchorMode === "top");
    ROOT.classList.toggle("aive-anchor-bottom", anchorMode === "bottom");

    // Restore last-known position for that anchor, else convert from current rect
    const rect = ROOT.getBoundingClientRect();
    const { h: vh } = viewportSize();

    if (anchorMode === "bottom") {
      const saved = posStore.bottom;
      const bottom = saved?.bottom ?? vh - rect.bottom;
      const left = saved?.left ?? rect.left;
      const fixed = snapAndClamp(left, bottom, "bottom");
      setPosition(fixed.left, fixed.bottom, "bottom");
      posStore.bottom = { left: fixed.left, bottom: fixed.bottom };
    } else {
      const saved = posStore.top;
      const top = saved?.top ?? rect.top;
      const left = saved?.left ?? rect.left;
      const fixed = snapAndClamp(left, top, "top");
      setPosition(fixed.left, fixed.top, "top");
      posStore.top = { left: fixed.left, top: fixed.top };
    }

    const b = ROOT.querySelector(".aive-anchor-btn");
    if (b) b.textContent = anchorMode === "bottom" ? "Bottom" : "Top";

    await set({ [POS_KEY]: posStore, [ANCHOR_KEY]: anchorMode });
    ensureInView();
  }

  function formatNum(n) {
    return Number.isFinite(n)
      ? (Math.round(n * 100) / 100).toFixed(2)
      : String(n);
  }

  function updateSlider(key, val) {
    const r = ROOT.querySelector(`input[data-key="${key}"]`);
    if (!r) return;
    r.value = val;

    const lab = r.previousElementSibling;
    if (lab) {
      const span = lab.querySelector(".aive-val");
      if (span) span.textContent = formatNum(Number(val));
    }
  }

  let TOAST_TIMER;
  function toast(text, ms = 2200) {
    try {
      if (!ROOT || !document.body) return;

      let el = document.getElementById("aive-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "aive-toast";
        el.style.cssText = `
          position: fixed;
          z-index: 2147483647;
          left: 0;
          top: auto;
          bottom: auto;
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

      el.textContent = text;
      el.style.opacity = "1";

      const rect = ROOT.getBoundingClientRect();
      const margin = 10;

      if (anchorMode === "bottom") {
        const maxLeft = window.innerWidth - el.offsetWidth - margin;
        const left = clamp(rect.left, margin, Math.max(margin, maxLeft));
        const bottom = clamp(
          window.innerHeight - rect.top + margin,
          margin,
          window.innerHeight - margin
        );
        el.style.left = left + "px";
        el.style.bottom = bottom + "px";
        el.style.top = "auto";
      } else {
        const maxLeft = window.innerWidth - el.offsetWidth - margin;
        const left = clamp(rect.left, margin, Math.max(margin, maxLeft));
        const top = clamp(rect.bottom + margin, margin, window.innerHeight - margin);
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.bottom = "auto";
      }

      clearTimeout(TOAST_TIMER);
      TOAST_TIMER = setTimeout(() => {
        if (el) el.style.opacity = "0";
      }, ms);
    } catch {
      // ignore
    }
  }

  // --------------------------------------------------
  // PANEL CREATION
  // --------------------------------------------------

  function createPanel() {
    ROOT = document.createElement("div");
    ROOT.id = "aive-root";

    ROOT.innerHTML = `
      <div class="aive-panel">
        <div class="aive-header">
          <span class="aive-title">AIVE</span>
          <span class="aive-header-actions">
            <button class="aive-pin" type="button" title="Pin (keep open)">📌</button>
            <button class="aive-help" type="button" title="Help">?</button>
          </span>
        </div>

        <div class="aive-clip">
          <div class="aive-body">

            ${slider("Brightness", "brightness", 0, 2, 0.01, 1)}
            ${slider("Contrast", "contrast", 0, 2, 0.01, 1)}
            ${slider("Saturation", "saturation", 0, 2, 0.01, 1)}
            ${slider("Hue", "hue", 0, 360, 0.5, 0)}
            ${slider("Sepia", "sepia", 0, 1, 0.01, 0)}
            ${slider("Zoom", "zoom", 1, 2, 0.01, 1)}

            <div class="aive-row aive-inline">
              <label>Anchor</label>
              <button class="aive-anchor-btn" type="button">Bottom</button>
            </div>

            <div class="aive-row aive-inline">
              <label>Flip Horizontal</label>
              <button class="aive-flip" type="button">Flip</button>
            </div>

            ${slider("Animation Speed", "speed", 100, 3000, 50, animMS)}
            ${slider("Blind Weight", "inertia", 1, 4, 0.1, inertia)}
            ${slider("Collapse Delay", "delay", 0, 2000, 50, delayMS)}

            <div class="aive-buttons">
              <button class="aive-auto" type="button">Auto</button>
              <button class="aive-reset" type="button">Reset</button>
              <button class="aive-disable" type="button">Disable Tab</button>
              <button class="aive-blacklist" type="button">Blacklist Domain</button>
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.appendChild(ROOT);
  }

  // --------------------------------------------------
  // AUTO-TUNE
  // --------------------------------------------------

  function clampRange(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function waitForEvent(target, event, timeoutMs = 2000) {
    return new Promise((resolve) => {
      let done = false;
      const on = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(true);
      };
      const cleanup = () => {
        try {
          target.removeEventListener(event, on);
        } catch {}
      };
      target.addEventListener(event, on, { once: true });
      setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        resolve(false);
      }, timeoutMs);
    });
  }

  async function ensureVideoReady(v) {
    if (!v) return false;
    if (v.readyState >= 2) return true;
    await waitForEvent(v, "loadeddata", 2200);
    return v.readyState >= 2;
  }

  async function sampleVideoMetrics(v, samples = 2) {
    const W = 72;
    const H = 40;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let sumL = 0;
    let sumStd = 0;
    let sumS = 0;
    let frames = 0;

    const takeOne = async () => {
      if (typeof v.requestVideoFrameCallback === "function") {
        await new Promise((r) => v.requestVideoFrameCallback(() => r()));
      } else {
        await new Promise((r) => setTimeout(r, 50));
      }

      ctx.drawImage(v, 0, 0, W, H);
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const px = d.length / 4;

      let l = 0;
      let l2 = 0;
      let s = 0;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];

        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        l += lum;
        l2 += lum * lum;

        const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
        const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        s += sat;
      }

      const meanL = l / px;
      const meanS = s / px;
      const varL = l2 / px - meanL * meanL;
      const stdL = Math.sqrt(Math.max(0, varL));

      sumL += meanL;
      sumStd += stdL;
      sumS += meanS;
      frames += 1;
    };

    for (let i = 0; i < samples; i++) await takeOne();

    if (!frames) return { meanL: 128, stdL: 70, meanS: 0.35 };

    return {
      meanL: sumL / frames,
      stdL: sumStd / frames,
      meanS: sumS / frames
    };
  }

  function suggestFromMetrics({ meanL, stdL, meanS }) {
    const targetL = 132;
    const targetStd = 72;
    const targetS = 0.38;

    let b = meanL ? targetL / meanL : 1.1;
    let c = stdL ? targetStd / stdL : 1.1;
    let s = meanS ? targetS / meanS : 1.12;

    b = clampRange(b, 0.85, 1.35);
    c = clampRange(c, 0.9, 1.35);
    s = clampRange(s, 0.9, 1.5);

    const blend = (v) => 0.55 * v + 0.45 * 1;

    return {
      brightness: blend(b),
      contrast: blend(c),
      saturation: blend(s)
    };
  }

  async function autoTune() {
    const v = getVideo();
    if (!v) return toast("Auto: no <video> found on this page");

    const ready = await ensureVideoReady(v);
    if (!ready) return toast("Auto: video not ready yet (try again in a second)");

    try {
      const m = await sampleVideoMetrics(v, 2);
      const sug = suggestFromMetrics(m);

      state.brightness = sug.brightness;
      state.contrast = sug.contrast;
      state.saturation = sug.saturation;

      updateSlider("brightness", state.brightness);
      updateSlider("contrast", state.contrast);
      updateSlider("saturation", state.saturation);
      applyEffects();

      toast(
        `Auto: B ${formatNum(state.brightness)}  C ${formatNum(
          state.contrast
        )}  S ${formatNum(state.saturation)}`
      );
    } catch (err) {
      state.brightness = 1.1;
      state.contrast = 1.1;
      state.saturation = 1.15;

      updateSlider("brightness", state.brightness);
      updateSlider("contrast", state.contrast);
      updateSlider("saturation", state.saturation);
      applyEffects();

      const msg = String(err && err.name ? err.name : err);
      const blocked = /SecurityError|tainted|cross-origin/i.test(msg);
      toast(
        blocked
          ? "Auto: site blocks pixel sampling (cross-origin). Using a gentle preset."
          : "Auto: couldn’t sample the video. Using a gentle preset."
      );
    }
  }

  // --------------------------------------------------
  // BLIND (PIN SUPPORT)
  // --------------------------------------------------

  function blind(root) {
    const header = root.querySelector(".aive-header");
    const clip = root.querySelector(".aive-clip");
    const body = root.querySelector(".aive-body");

    let open = false;
    let anim = false;
    let timer;

    const setCollapsed = (isCollapsed) => {
      root.classList.toggle("aive-collapsed", isCollapsed);
      requestAnimationFrame(() => ensureInView());
    };

    function maxClipHeight() {
      const { h: vh } = viewportSize();
      const headerH = header.getBoundingClientRect().height || 44;
      return Math.max(0, vh - EDGE_PAD * 2 - headerH);
    }

    function openTarget() {
      return Math.min(body.scrollHeight, maxClipHeight());
    }

    function animate(to) {
      if (anim) return;
      anim = true;

      const from = clip.offsetHeight;
      const delta = to - from;
      const start = performance.now();

      function step(t) {
        const p = Math.min((t - start) / animMS, 1);
        clip.style.height = from + delta * ease(p) + "px";

        if (p < 1) requestAnimationFrame(step);
        else {
          anim = false;
          if (to === 0) setCollapsed(true);
        }
      }

      requestAnimationFrame(step);
    }

    function openNow() {
      clearTimeout(timer);
      open = true;
      setCollapsed(false);
      animate(openTarget());
    }

    function closeLater() {
      if (pinned) return; // ✅ pinned means never auto-collapse
      timer = setTimeout(() => {
        open = false;
        animate(0);
      }, delayMS);
    }

    header.onmouseenter = () => {
      if (!open) openNow();
      else clearTimeout(timer);
    };

    root.onmouseleave = () => {
      if (!open) return;
      closeLater();
    };

    // Expose helpers for pin toggles / resize refresh
    return {
      openNow,
      closeNow: () => {
        open = false;
        animate(0);
      },
      refreshOpenHeight: () => {
        if (!open || pinned === false) return;
        // If pinned/open, keep it fit to viewport on resizes
        clip.style.height = openTarget() + "px";
      }
    };
  }

  function enableDragSnap(root) {
    const header = root.querySelector(".aive-header");

    let dragging = false;
    let startX = 0,
      startY = 0;
    let startLeft = 0;
    let startOffset = 0;

    const readOffset = () => (anchorMode === "bottom" ? currentBottom() : currentTop());

    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest("button")) return;

      dragging = true;
      header.setPointerCapture(e.pointerId);

      startX = e.clientX;
      startY = e.clientY;
      startLeft = currentLeft();
      startOffset = readOffset();

      e.preventDefault();
    });

    header.addEventListener("pointermove", (e) => {
      if (!dragging) return;

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
      if (!dragging) return;
      dragging = false;

      try {
        header.releasePointerCapture(e.pointerId);
      } catch {}

      await persistPosition();
    });

    header.addEventListener("pointercancel", () => {
      dragging = false;
    });
  }

  // --------------------------------------------------
  // WIRING
  // --------------------------------------------------

  function setPinned(next) {
    pinned = !!next;
    posStore.pinned = pinned;
    ROOT.classList.toggle("aive-pinned", pinned);

    // If pinned, force open and stay open
    if (pinned) {
      if (ROOT.__blindApi) ROOT.__blindApi.openNow();
      toast("Pinned: stays open");
    } else {
      toast("Unpinned: auto-collapse enabled");
    }

    // Persist asap
    set({ [POS_KEY]: posStore });
  }

  function wireControls() {
    ROOT.querySelectorAll("input[type=range]").forEach((r) => {
      r.oninput = () => {
        const k = r.dataset.key;
        const v = Number(r.value);

        const lab = r.previousElementSibling;
        if (lab) {
          const span = lab.querySelector(".aive-val");
          if (span) span.textContent = formatNum(v);
        }

        if (k in state) {
          state[k] = v;
          applyEffects();
        }
        if (k === "speed") animMS = v;
        if (k === "inertia") inertia = v;
        if (k === "delay") delayMS = v;
      };
    });

    const flipBtn = ROOT.querySelector(".aive-flip");
    if (flipBtn) {
      flipBtn.onclick = () => {
        state.flip = !state.flip;
        applyEffects();
      };
    }

    const helpBtn = ROOT.querySelector(".aive-help");
    if (helpBtn) {
      helpBtn.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
      helpBtn.onclick = (e) => {
        e.stopPropagation();
        openHelpDialog(anchorMode, pinned);
      };
    }

    const pinBtn = ROOT.querySelector(".aive-pin");
    if (pinBtn) {
      pinBtn.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
      pinBtn.onclick = async (e) => {
        e.stopPropagation();
        setPinned(!pinned);
        await persistPosition();
      };
    }

    const anchorBtn = ROOT.querySelector(".aive-anchor-btn");
    if (anchorBtn) {
      anchorBtn.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
      anchorBtn.onclick = async (e) => {
        e.stopPropagation();
        await setAnchorMode(anchorMode === "bottom" ? "top" : "bottom");
        toast(`Anchor: ${anchorMode.toUpperCase()}`);
      };
    }

    // Double-click header toggles anchor
    const header = ROOT.querySelector(".aive-header");
    if (header) {
      header.addEventListener("dblclick", async (e) => {
        if (e.target && e.target.closest && e.target.closest("button")) return;
        await setAnchorMode(anchorMode === "bottom" ? "top" : "bottom");
        toast(`Anchor: ${anchorMode.toUpperCase()}`);
      });
    }

    ROOT.querySelector(".aive-auto").onclick = () => autoTune();

    ROOT.querySelector(".aive-reset").onclick = () => {
      Object.assign(state, {
        brightness: 1,
        contrast: 1,
        saturation: 1,
        hue: 0,
        sepia: 0,
        zoom: 1,
        flip: false
      });
      Object.entries(state).forEach(([k, v]) => updateSlider(k, v));
      applyEffects();
      toast("Reset: back to defaults");
    };

    ROOT.querySelector(".aive-disable").onclick = () => {
      ROOT.remove();
      toast("AIVE disabled for this tab (reload to bring it back)");
    };

    ROOT.querySelector(".aive-blacklist").onclick = () => openBlacklistDialog();
  }

  function applySavedPosition() {
    ROOT.classList.toggle("aive-anchor-top", anchorMode === "top");
    ROOT.classList.toggle("aive-anchor-bottom", anchorMode === "bottom");

    const defLeft = 20;

    if (anchorMode === "bottom") {
      const saved = posStore.bottom;
      const left = saved?.left ?? defLeft;
      const bottom = saved?.bottom ?? 20;
      const fixed = snapAndClamp(left, bottom, "bottom");
      setPosition(fixed.left, fixed.bottom, "bottom");
      posStore.bottom = { left: fixed.left, bottom: fixed.bottom };
    } else {
      const saved = posStore.top;
      const left = saved?.left ?? defLeft;
      const top = saved?.top ?? 20;
      const fixed = snapAndClamp(left, top, "top");
      setPosition(fixed.left, fixed.top, "top");
      posStore.top = { left: fixed.left, top: fixed.top };
    }

    // Start collapsed unless pinned
    ROOT.classList.toggle("aive-collapsed", !pinned);
    ROOT.classList.toggle("aive-pinned", pinned);
  }

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------

  (async () => {
    if (await isBlacklisted()) return;

    posStore = normalizeSavedPos(await get(POS_KEY));
    pinned = !!posStore.pinned;

    const globalAnchor = (await get(ANCHOR_KEY)) || null;

    anchorMode =
      posStore.anchor ||
      (globalAnchor === "top" || globalAnchor === "bottom"
        ? globalAnchor
        : "bottom");

    const wait = () => {
      if (!ALIVE) return;
      if (!document.body) return requestAnimationFrame(wait);

      createPanel();

      // Set anchor button label
      const b = ROOT.querySelector(".aive-anchor-btn");
      if (b) b.textContent = anchorMode === "bottom" ? "Bottom" : "Top";

      // Apply stored position + pin state
      applySavedPosition();

      wireControls();

      // Setup blind + keep API reference
      ROOT.__blindApi = blind(ROOT);

      enableDragSnap(ROOT);

      // If pinned, open immediately
      if (pinned) ROOT.__blindApi.openNow();

      // clamp on resize / zoom changes
      const onResize = () => {
        ensureInView();
        if (ROOT.__blindApi) ROOT.__blindApi.refreshOpenHeight();
      };

      window.addEventListener("resize", onResize, { passive: true });
      window.visualViewport?.addEventListener?.("resize", onResize, {
        passive: true
      });

      // Persist normalized format (migration)
      set({ [POS_KEY]: posStore, [ANCHOR_KEY]: anchorMode });

      applyEffects();
    };

    wait();
  })();
})();
