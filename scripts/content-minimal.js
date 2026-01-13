// ======================================================
// AIVE – CONTENT SCRIPT (STABLE BLIND + STATE SAFE)
// ======================================================

(() => {
  "use strict";

  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  let ALIVE = true;
  window.addEventListener("pagehide", () => (ALIVE = false));
  window.addEventListener("beforeunload", () => (ALIVE = false));

  // --------------------------------------------------
  // SAFE STORAGE
  // --------------------------------------------------

  const STORE =
    typeof chrome !== "undefined" &&
    chrome.storage &&
    chrome.storage.local
      ? chrome.storage.local
      : null;

  const storageGet = key =>
    new Promise(r => {
      if (!STORE) return r(undefined);
      try { STORE.get(key, o => r(o[key])); }
      catch { r(undefined); }
    });

  const storageSet = obj =>
    new Promise(r => {
      if (!STORE) return r();
      try { STORE.set(obj, r); }
      catch { r(); }
    });

  const DOMAIN = location.hostname;
  const STATE_KEY = `aive_state_${DOMAIN}`;
  const BLACKLIST_KEY = "aive_blacklist";

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

  function saveState() {
    storageSet({ [STATE_KEY]: state });
  }

  // --------------------------------------------------
  // BLIND CONFIG (SINGLE SOURCE OF TRUTH)
  // --------------------------------------------------

  const blindConfig = {
    animMS: 1200,
    inertia: 2.4,
    delayMS: 600
  };

  const ease = t => 1 - Math.pow(1 - t, blindConfig.inertia);

  // --------------------------------------------------
  // PANEL
  // --------------------------------------------------

  let ROOT;

  function slider(label, key, min, max, step, val) {
    return `
      <div class="aive-row">
        <label>${label} <span class="aive-val">${val}</span></label>
        <input type="range" data-key="${key}"
          min="${min}" max="${max}" step="${step}" value="${val}">
      </div>`;
  }

  function createPanel() {
    ROOT = document.createElement("div");
    ROOT.id = "aive-root";

    ROOT.innerHTML = `
      <div class="aive-panel">
        <div class="aive-header">AIVE ?</div>

        <div class="aive-clip">
          <div class="aive-body">

            ${slider("Brightness","brightness",0,2,0.01,state.brightness)}
            ${slider("Contrast","contrast",0,2,0.01,state.contrast)}
            ${slider("Saturation","saturation",0,2,0.01,state.saturation)}
            ${slider("Sepia","sepia",0,1,0.01,state.sepia)}
            ${slider("Zoom","zoom",1,2,0.01,state.zoom)}

            <div class="aive-row">
              <label>Flip Horizontal</label>
              <button class="aive-flip">Flip</button>
            </div>

            ${slider("Animation Speed","speed",100,3000,50,blindConfig.animMS)}
            ${slider("Blind Weight","inertia",1,4,0.1,blindConfig.inertia)}
            ${slider("Collapse Delay","delay",0,2000,50,blindConfig.delayMS)}

            <div class="aive-buttons">
              <button class="aive-auto">Auto</button>
              <button class="aive-reset">Reset</button>
              <button class="aive-disable">Disable Tab</button>
              <button class="aive-blacklist">Blacklist Domain</button>
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.appendChild(ROOT);
    wireControls();
    blind(ROOT);
    drag(ROOT);
    applyEffects();
  }

  // --------------------------------------------------
  // CONTROLS
  // --------------------------------------------------

  function wireControls() {
    ROOT.querySelectorAll("input[type=range]").forEach(r => {
      r.oninput = () => {
        const k = r.dataset.key;
        const v = Number(r.value);
        r.previousElementSibling.querySelector(".aive-val").textContent = v;

        if (k in state) {
          state[k] = v;
          applyEffects();
          saveState();
        }

        if (k === "speed") blindConfig.animMS = v;
        if (k === "inertia") blindConfig.inertia = v;
        if (k === "delay") blindConfig.delayMS = v;
      };
    });

    ROOT.querySelector(".aive-flip").onclick = () => {
      state.flip = !state.flip;
      applyEffects();
      saveState();
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
      updateSliders();
      applyEffects();
      saveState();
    };

    ROOT.querySelector(".aive-auto").onclick = () => {
      state.brightness = 1.1;
      state.contrast = 1.1;
      state.saturation = 1.15;
      updateSliders();
      applyEffects();
      saveState();
    };

    ROOT.querySelector(".aive-disable").onclick = () => ROOT.remove();
    ROOT.querySelector(".aive-blacklist").onclick = blacklistDomain;
  }

  function updateSliders() {
    ROOT.querySelectorAll("input[data-key]").forEach(r => {
      const k = r.dataset.key;
      if (k in state) {
        r.value = state[k];
        r.previousElementSibling.querySelector(".aive-val").textContent = state[k];
      }
    });
  }

  // --------------------------------------------------
  // BLIND ANIMATION (FIXED)
  // --------------------------------------------------

  function blind(root) {
    const header = root.querySelector(".aive-header");
    const clip = root.querySelector(".aive-clip");
    const body = root.querySelector(".aive-body");

    let open = false;
    let anim = false;
    let timer = null;

    function animate(to) {
      if (anim) return;
      anim = true;

      const from = clip.offsetHeight;
      const delta = to - from;
      const start = performance.now();

      function step(now) {
        const t = Math.min((now - start) / blindConfig.animMS, 1);
        clip.style.height = from + delta * ease(t) + "px";
        if (t < 1) requestAnimationFrame(step);
        else anim = false;
      }

      requestAnimationFrame(step);
    }

    header.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      if (!open) {
        open = true;
        animate(body.scrollHeight);
      }
    });

    root.addEventListener("mouseleave", () => {
      if (!open) return;
      timer = setTimeout(() => {
        open = false;
        animate(0);
      }, blindConfig.delayMS);
    });
  }

  // --------------------------------------------------
  // DRAG
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

      document.onmouseup = () => (document.onmousemove = null);
    };
  }

  // --------------------------------------------------
  // BLACKLIST
  // --------------------------------------------------

  function blacklistDomain() {
    storageGet(BLACKLIST_KEY).then(list => {
      const arr = Array.isArray(list) ? list : [];
      if (!arr.includes(DOMAIN)) {
        arr.push(DOMAIN);
        storageSet({ [BLACKLIST_KEY]: arr }).then(() => ROOT.remove());
      }
    });
  }

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------

  Promise.all([
    storageGet(BLACKLIST_KEY),
    storageGet(STATE_KEY)
  ]).then(([blacklist, saved]) => {
    if (Array.isArray(blacklist) && blacklist.includes(DOMAIN)) return;
    if (saved && typeof saved === "object") Object.assign(state, saved);

    const wait = () => {
      if (!ALIVE) return;
      if (document.body) createPanel();
      else requestAnimationFrame(wait);
    };
    wait();
  });

})();
