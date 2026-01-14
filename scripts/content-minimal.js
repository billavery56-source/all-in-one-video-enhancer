console.log("AIVE content script loaded", location.href);

// ======================================================
// AIVE – CONTENT SCRIPT (DRAG + SNAP + HELP DIALOG + BLACKLIST HOTKEY)
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
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.local
      ? chrome.storage.local
      : null;

  const get = (key) =>
    new Promise((r) => (STORE ? STORE.get(key, (o) => r(o[key])) : r(undefined)));

  const set = (obj) => new Promise((r) => (STORE ? STORE.set(obj, r) : r()));

  const DOMAIN = location.hostname;
  const POS_KEY = `aive_pos_${DOMAIN}`;

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

    // Inline "critical" styles so the dialog cannot be hidden by page CSS
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

    // Close wiring
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

    // Prevent clicks inside card from closing
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

    const hint = smallMuted("One domain per line. You can paste full URLs too — AIVE will extract the hostname.");
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
    ta.addEventListener("focus", () => (ta.style.borderColor = "rgba(77,163,255,0.55)"));
    ta.addEventListener("blur", () => (ta.style.borderColor = "rgba(255,255,255,0.14)"));

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

  function openHelpDialog() {
    if (!document.body) return;

    const { ovl, titleEl, bodyEl } = makeOverlay(HELP_DIALOG_ID);
    titleEl.textContent = "AIVE Help";

    const sec1 = section("Quick use");
    sec1.h.appendChild(chip("No alerts"));
    sec1.s.appendChild(
      smallMuted(
        "• Hover the header to open the controls.\n" +
        "• Drag the header to move the panel.\n" +
        "• Panel snaps to edges when you release near an edge.\n" +
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

    const sec3 = section("What the sliders do");
    sec3.s.appendChild(
      smallMuted(
        "Brightness – light/dark\n" +
        "Contrast – separation/pop\n" +
        "Saturation – color intensity\n" +
        "Sepia – warm tone\n" +
        "Zoom – scale the video\n\n" +
        "Animation Speed – blind open/close speed\n" +
        "Blind Weight – easing strength\n" +
        "Collapse Delay – how long before it collapses after mouse leaves"
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
    sec4.s.appendChild(smallMuted("Blacklisted sites won’t show the panel/effects, but the blacklist dialog is always available."), openBL);

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
        const typing = tag === "input" || tag === "textarea" || (t && t.isContentEditable);
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

  function snapAndClamp(left, top) {
    const rect = ROOT.getBoundingClientRect();
    const panelW = rect.width || 360;
    const panelH = rect.height || 80;

    const { w: vw, h: vh } = viewportSize();

    left = clamp(left, EDGE_PAD, vw - panelW - EDGE_PAD);
    top = clamp(top, EDGE_PAD, vh - panelH - EDGE_PAD);

    if (left <= SNAP_PX) left = EDGE_PAD;
    if (top <= SNAP_PX) top = EDGE_PAD;

    const distRight = vw - (left + panelW);
    const distBottom = vh - (top + panelH);

    if (distRight <= SNAP_PX) left = vw - panelW - EDGE_PAD;
    if (distBottom <= SNAP_PX) top = vh - panelH - EDGE_PAD;

    return { left, top };
  }

  function setSafePosition(pos) {
    let left = 20, top = 20;
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      left = pos.left;
      top = pos.top;
    }
    const fixed = snapAndClamp(left, top);
    ROOT.style.left = fixed.left + "px";
    ROOT.style.top = fixed.top + "px";
  }

  function createPanel(savedPos) {
    ROOT = document.createElement("div");
    ROOT.id = "aive-root";

    ROOT.innerHTML = `
      <div class="aive-panel">
        <div class="aive-header">
          <span class="aive-title">AIVE</span>
          <button class="aive-help" type="button" title="Help">?</button>
        </div>

        <div class="aive-clip">
          <div class="aive-body">

            ${slider("Brightness","brightness",0,2,0.01,1)}
            ${slider("Contrast","contrast",0,2,0.01,1)}
            ${slider("Saturation","saturation",0,2,0.01,1)}
            ${slider("Sepia","sepia",0,1,0.01,0)}
            ${slider("Zoom","zoom",1,2,0.01,1)}

            <div class="aive-row">
              <label>Flip Horizontal</label>
              <button class="aive-flip" type="button">Flip</button>
            </div>

            ${slider("Animation Speed","speed",100,3000,50,animMS)}
            ${slider("Blind Weight","inertia",1,4,0.1,inertia)}
            ${slider("Collapse Delay","delay",0,2000,50,delayMS)}

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
    setSafePosition(savedPos);

    wireControls();
    blind(ROOT);
    enableDragSnap(ROOT);
  }

  function updateSlider(key, val) {
    const r = ROOT.querySelector(`input[data-key="${key}"]`);
    if (!r) return;
    r.value = val;
    const lab = r.previousElementSibling;
    if (lab) {
      const span = lab.querySelector(".aive-val");
      if (span) span.textContent = val;
    }
  }

  function wireControls() {
    ROOT.querySelectorAll("input[type=range]").forEach((r) => {
      r.oninput = () => {
        const k = r.dataset.key;
        const v = Number(r.value);

        const lab = r.previousElementSibling;
        if (lab) {
          const span = lab.querySelector(".aive-val");
          if (span) span.textContent = v;
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
      // Prevent header drag from hijacking click
      helpBtn.addEventListener("pointerdown", (e) => e.stopPropagation(), true);
      helpBtn.onclick = (e) => {
        e.stopPropagation();
        openHelpDialog();
      };
    }

    ROOT.querySelector(".aive-auto").onclick = () => {
      state.brightness = 1.1;
      state.contrast = 1.1;
      state.saturation = 1.15;

      updateSlider("brightness", state.brightness);
      updateSlider("contrast", state.contrast);
      updateSlider("saturation", state.saturation);
      applyEffects();
    };

    ROOT.querySelector(".aive-reset").onclick = () => {
      Object.assign(state, {
        brightness: 1,
        contrast: 1,
        saturation: 1,
        sepia: 0,
        zoom: 1,
        flip: false
      });
      Object.entries(state).forEach(([k, v]) => updateSlider(k, v));
      applyEffects();
    };

    ROOT.querySelector(".aive-disable").onclick = () => ROOT.remove();

    ROOT.querySelector(".aive-blacklist").onclick = () => openBlacklistDialog();
  }

  function blind(root) {
    const header = root.querySelector(".aive-header");
    const clip = root.querySelector(".aive-clip");
    const body = root.querySelector(".aive-body");

    let open = false,
      anim = false,
      timer;

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
        else anim = false;
      }
      requestAnimationFrame(step);
    }

    header.onmouseenter = () => {
      clearTimeout(timer);
      if (!open) {
        open = true;
        animate(body.scrollHeight);
      }
    };

    root.onmouseleave = () => {
      if (!open) return;
      timer = setTimeout(() => {
        open = false;
        animate(0);
      }, delayMS);
    };
  }

  function enableDragSnap(root) {
    const header = root.querySelector(".aive-header");

    let dragging = false;
    let startX = 0,
      startY = 0;
    let startLeft = 0,
      startTop = 0;

    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;

      // ✅ If user clicked the help button (or any button), do NOT start drag
      if (e.target && e.target.closest && e.target.closest("button")) return;

      dragging = true;
      header.setPointerCapture(e.pointerId);

      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseFloat(root.style.left) || root.offsetLeft || 0;
      startTop = parseFloat(root.style.top) || root.offsetTop || 0;

      e.preventDefault();
    });

    header.addEventListener("pointermove", (e) => {
      if (!dragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const nextLeft = startLeft + dx;
      const nextTop = startTop + dy;

      const fixed = snapAndClamp(nextLeft, nextTop);
      root.style.left = fixed.left + "px";
      root.style.top = fixed.top + "px";
    });

    header.addEventListener("pointerup", async (e) => {
      if (!dragging) return;
      dragging = false;

      try {
        header.releasePointerCapture(e.pointerId);
      } catch {}

      const left = parseFloat(root.style.left) || root.offsetLeft || 0;
      const top = parseFloat(root.style.top) || root.offsetTop || 0;
      const fixed = snapAndClamp(left, top);

      root.style.left = fixed.left + "px";
      root.style.top = fixed.top + "px";

      await set({ [POS_KEY]: { left: fixed.left, top: fixed.top } });
    });

    header.addEventListener("pointercancel", () => {
      dragging = false;
    });
  }

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------

  (async () => {
    // dialogs always work, but skip panel/effects when blacklisted
    if (await isBlacklisted()) return;

    const pos = await get(POS_KEY);

    const wait = () => {
      if (!ALIVE) return;
      if (document.body) createPanel(pos);
      else requestAnimationFrame(wait);
    };
    wait();
  })();
})();
