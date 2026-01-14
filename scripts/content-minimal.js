console.log("AIVE content script loaded", location.href);

// ======================================================
// AIVE – CONTENT SCRIPT (DRAG + SNAP + BLACKLIST DIALOG HOTKEY)
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
  // BLACKLIST DIALOG (WORKS EVEN IF SITE IS BLACKLISTED)
  // --------------------------------------------------

  const DIALOG_ID = "aive-blacklist-dialog";

  function ensureDialogStyles() {
    if (document.getElementById("aive-blacklist-style")) return;
    const st = document.createElement("style");
    st.id = "aive-blacklist-style";
    st.textContent = `
      #${DIALOG_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        pointer-events: auto;
      }
      #${DIALOG_ID} .aive-bl-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.55);
      }
      #${DIALOG_ID} .aive-bl-card {
        position: relative;
        width: min(720px, 92vw);
        max-height: min(82vh, 900px);
        overflow: hidden;

        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.12);
        background: #0f1115;
        color: #e9eef7;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        box-shadow: 0 18px 50px rgba(0,0,0,0.6);
      }
      #${DIALOG_ID} .aive-bl-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;

        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0));
        font-weight: 900;
        letter-spacing: 0.2px;
      }
      #${DIALOG_ID} .aive-bl-x {
        border: none;
        background: transparent;
        color: #a7b0c0;
        font-weight: 900;
        font-size: 18px;
        cursor: pointer;
        padding: 2px 6px;
      }
      #${DIALOG_ID} .aive-bl-x:hover { color: #e9eef7; }

      #${DIALOG_ID} .aive-bl-body {
        padding: 12px 14px;
        display: grid;
        gap: 10px;
      }

      #${DIALOG_ID} .aive-bl-hint {
        color: #a7b0c0;
        font-size: 12px;
        line-height: 1.35;
      }

      #${DIALOG_ID} textarea {
        width: 100%;
        min-height: 240px;
        max-height: 46vh;
        resize: vertical;

        background: #10131a;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        padding: 10px;
        color: #e9eef7;
        outline: none;
        font-size: 13px;
        line-height: 1.35;
      }
      #${DIALOG_ID} textarea:focus {
        border-color: rgba(77,163,255,0.55);
      }

      #${DIALOG_ID} .aive-bl-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr;
        gap: 8px;
        margin-top: 4px;
      }

      #${DIALOG_ID} .aive-bl-btn {
        border: 1px solid rgba(255,255,255,0.12);
        background: #2a3140;
        color: #e9eef7;
        border-radius: 12px;
        padding: 10px 10px;
        font-weight: 850;
        cursor: pointer;
      }
      #${DIALOG_ID} .aive-bl-btn:hover {
        border-color: rgba(77,163,255,0.35);
        filter: brightness(1.05);
      }
      #${DIALOG_ID} .aive-bl-btn.secondary { background: transparent; }
      #${DIALOG_ID} .aive-bl-btn.danger { background: #7a2b2b; }

      #${DIALOG_ID} .aive-bl-footer {
        padding: 10px 14px 14px 14px;
        border-top: 1px solid rgba(255,255,255,0.10);
        color: #a7b0c0;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }
      #${DIALOG_ID} .aive-bl-kbd {
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        border-radius: 999px;
        padding: 2px 10px;
        color: #e9eef7;
        font-weight: 850;
      }
    `;
    document.documentElement.appendChild(st);
  }

  function normalizeDomains(text) {
    const lines = (text || "")
      .split(/\r?\n/g)
      .map((s) => s.trim())
      .filter(Boolean);

    const cleaned = [];
    const seen = new Set();

    for (const line of lines) {
      // Strip protocol/path if user pasted a URL
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

    // If already open, just focus it
    const existing = document.getElementById(DIALOG_ID);
    if (existing) return;

    ensureDialogStyles();

    const list = (await get("aive_blacklist")) || [];
    const text = Array.isArray(list) ? list.join("\n") : "";

    const wrap = document.createElement("div");
    wrap.id = DIALOG_ID;

    wrap.innerHTML = `
      <div class="aive-bl-backdrop"></div>
      <div class="aive-bl-card" role="dialog" aria-modal="true">
        <div class="aive-bl-header">
          <div>Blacklist Manager</div>
          <button class="aive-bl-x" type="button" title="Close">✕</button>
        </div>

        <div class="aive-bl-body">
          <div class="aive-bl-hint">
            One domain per line. Example: <b>youtube.com</b><br>
            This dialog opens anywhere (even on blacklisted sites).
          </div>

          <textarea spellcheck="false" class="aive-bl-textarea" placeholder="example.com&#10;another-site.com">${text}</textarea>

          <div class="aive-bl-buttons">
            <button class="aive-bl-btn" type="button" data-act="save">Save</button>
            <button class="aive-bl-btn secondary" type="button" data-act="cancel">Cancel</button>
            <button class="aive-bl-btn" type="button" data-act="addCurrent">Add This Site</button>
            <button class="aive-bl-btn danger" type="button" data-act="removeCurrent">Remove This Site</button>
          </div>
        </div>

        <div class="aive-bl-footer">
          <div>Current site: <b>${DOMAIN}</b></div>
          <div class="aive-bl-kbd">Alt + Shift + B</div>
        </div>
      </div>
    `;

    const close = () => wrap.remove();

    // backdrop click closes
    wrap.querySelector(".aive-bl-backdrop").addEventListener("click", close);

    // X closes
    wrap.querySelector(".aive-bl-x").addEventListener("click", close);

    // Esc closes
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    const ta = wrap.querySelector(".aive-bl-textarea");

    wrap.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-act");

        if (act === "cancel") return close();

        if (act === "addCurrent") {
          const domains = normalizeDomains(ta.value);
          if (!domains.includes(DOMAIN.toLowerCase())) domains.push(DOMAIN.toLowerCase());
          ta.value = domains.join("\n");
          ta.focus();
          return;
        }

        if (act === "removeCurrent") {
          const domains = normalizeDomains(ta.value).filter((d) => d !== DOMAIN.toLowerCase());
          ta.value = domains.join("\n");
          ta.focus();
          return;
        }

        if (act === "save") {
          const domains = normalizeDomains(ta.value);
          await set({ aive_blacklist: domains });
          close();
          return;
        }
      });
    });

    document.body.appendChild(wrap);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  // ✅ Always listen for the command message, even if site is blacklisted
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "AIVE_OPEN_BLACKLIST_DIALOG") {
        openBlacklistDialog();
      }
    });
  }

  // Fallback: page-level hotkey (not as reliable as Chrome command, but helps)
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        // Don’t trigger while typing in inputs/textareas/contenteditable
        const t = e.target;
        const tag = t && t.tagName ? t.tagName.toLowerCase() : "";
        const typing =
          tag === "input" ||
          tag === "textarea" ||
          (t && t.isContentEditable);

        if (!typing) {
          e.preventDefault();
          openBlacklistDialog();
        }
      }
    },
    true
  );

  // --------------------------------------------------
  // IF THIS SITE IS BLACKLISTED, STOP HERE (BUT HOTKEY STILL WORKS)
  // --------------------------------------------------

  async function isBlacklisted() {
    const list = (await get("aive_blacklist")) || [];
    return Array.isArray(list) && list.includes(DOMAIN);
  }

  // --------------------------------------------------
  // THE REST: PANEL + EFFECTS (ONLY WHEN NOT BLACKLISTED)
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
      helpBtn.onclick = () => {
        openBlacklistDialog(); // or swap to a real help dialog later
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

    let open = false, anim = false, timer;

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
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    header.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
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

      try { header.releasePointerCapture(e.pointerId); } catch {}

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

  // INIT
  (async () => {
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
