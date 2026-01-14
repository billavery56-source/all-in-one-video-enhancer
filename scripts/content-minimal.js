console.log("AIVE content script loaded", location.href);

// ======================================================
// AIVE – CONTENT SCRIPT (DRAG + SNAP + POSITION RESTORE)
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
  // VIDEO
  // --------------------------------------------------

  const getVideo = () => document.querySelector("video");

  // --------------------------------------------------
  // EFFECT STATE
  // --------------------------------------------------

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

  // --------------------------------------------------
  // BLIND CONFIG
  // --------------------------------------------------

  let animMS = 1200;
  let inertia = 2.4;
  let delayMS = 600;
  const ease = (t) => 1 - Math.pow(1 - t, inertia);

  // --------------------------------------------------
  // PANEL
  // --------------------------------------------------

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

  const SNAP_PX = 28;  // how close to edge before snapping
  const EDGE_PAD = 8;  // snapped padding from edge

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function viewportSize() {
    // visualViewport helps on mobile / zoomed pages
    const vv = window.visualViewport;
    if (vv) return { w: vv.width, h: vv.height };
    return { w: window.innerWidth || 1000, h: window.innerHeight || 800 };
  }

  function snapAndClamp(left, top) {
    const rect = ROOT.getBoundingClientRect();
    const panelW = rect.width || 360;
    const panelH = rect.height || 80;

    const { w: vw, h: vh } = viewportSize();

    // clamp
    left = clamp(left, EDGE_PAD, vw - panelW - EDGE_PAD);
    top = clamp(top, EDGE_PAD, vh - panelH - EDGE_PAD);

    // snap
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

    // position after attach (can measure size now)
    setSafePosition(savedPos);

    wireControls();
    blind(ROOT);
    enableDragSnap(ROOT);
  }

  // --------------------------------------------------
  // CONTROLS
  // --------------------------------------------------

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
        alert(
          "AIVE Help:\n\n• Hover header to open\n• Drag header to move\n• Snaps to edges on release"
        );
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

    ROOT.querySelector(".aive-blacklist").onclick = async () => {
      const list = (await get("aive_blacklist")) || [];
      if (!list.includes(DOMAIN)) list.push(DOMAIN);
      await set({ aive_blacklist: list });
      ROOT.remove();
    };
  }

  // --------------------------------------------------
  // BLIND
  // --------------------------------------------------

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

  // --------------------------------------------------
  // DRAG + SNAP (POINTER EVENTS)
  // --------------------------------------------------

  function enableDragSnap(root) {
    const header = root.querySelector(".aive-header");

    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    header.addEventListener("pointerdown", (e) => {
      // ignore right click
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

      // live clamp while moving (keeps it visible)
      const fixed = snapAndClamp(nextLeft, nextTop);
      root.style.left = fixed.left + "px";
      root.style.top = fixed.top + "px";
    });

    header.addEventListener("pointerup", async (e) => {
      if (!dragging) return;
      dragging = false;

      try { header.releasePointerCapture(e.pointerId); } catch {}

      // snap is already applied live; just save
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

  get("aive_blacklist").then((list) => {
    if (Array.isArray(list) && list.includes(DOMAIN)) return;

    get(POS_KEY).then((pos) => {
      const wait = () => {
        if (!ALIVE) return;
        if (document.body) createPanel(pos);
        else requestAnimationFrame(wait);
      };
      wait();
    });
  });
})();
