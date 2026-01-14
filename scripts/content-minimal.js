console.log("AIVE content script loaded", location.href);

// ======================================================
// AIVE – CONTENT SCRIPT (POSITION RESTORE + OFFSCREEN FIX)
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

  const get = key =>
    new Promise(r => (STORE ? STORE.get(key, o => r(o[key])) : r(undefined)));

  const set = obj =>
    new Promise(r => (STORE ? STORE.set(obj, r) : r()));

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
  const ease = t => 1 - Math.pow(1 - t, inertia);

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

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function setSafePosition(pos) {
    // Default
    let left = 20;
    let top = 20;

    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      left = pos.left;
      top = pos.top;
    }

    // Clamp to viewport so it can't get lost off-screen
    const vw = window.innerWidth || 1000;
    const vh = window.innerHeight || 800;

    // Use a small margin; panel is ~360px wide but we don't need perfect math
    left = clamp(left, 8, vw - 60);
    top = clamp(top, 8, vh - 60);

    ROOT.style.left = left + "px";
    ROOT.style.top = top + "px";
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

    // ✅ POSITION — clamp so it can't disappear off-screen
    setSafePosition(savedPos);

    wireControls();
    blind(ROOT);
    drag(ROOT);

    // Handy: reset position hotkey (Ctrl+Shift+0)
    window.addEventListener("keydown", async (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "0" || e.code === "Digit0")) {
        e.preventDefault();
        ROOT.style.left = "20px";
        ROOT.style.top = "20px";
        await set({ [POS_KEY]: { left: 20, top: 20 } });
      }
    }, { capture: true });
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
    ROOT.querySelectorAll("input[type=range]").forEach(r => {
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
        // simple placeholder help (you can swap this for a real help dialog)
        alert("AIVE Help:\n\n• Hover the header to open controls\n• Drag header to move panel\n• Ctrl+Shift+0 resets position");
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
  // DRAG + SAVE
  // --------------------------------------------------

  function drag(root) {
    const h = root.querySelector(".aive-header");
    let ox, oy;

    h.onmousedown = e => {
      ox = e.clientX - root.offsetLeft;
      oy = e.clientY - root.offsetTop;

      document.onmousemove = e => {
        root.style.left = e.clientX - ox + "px";
        root.style.top = e.clientY - oy + "px";
      };

      document.onmouseup = async () => {
        document.onmousemove = null;
        document.onmouseup = null;

        await set({
          [POS_KEY]: {
            left: root.offsetLeft,
            top: root.offsetTop
          }
        });
      };
    };
  }

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------

  get("aive_blacklist").then(list => {
    if (Array.isArray(list) && list.includes(DOMAIN)) return;

    get(POS_KEY).then(pos => {
      const wait = () => {
        if (!ALIVE) return;
        if (document.body) createPanel(pos);
        else requestAnimationFrame(wait);
      };
      wait();
    });
  });

})();
