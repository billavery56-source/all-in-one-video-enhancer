// ======================================================
// AIVE – CONTENT SCRIPT (POSITION RESTORE FINAL FIX)
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
    new Promise(r => STORE ? STORE.get(key, o => r(o[key])) : r(undefined));

  const set = obj =>
    new Promise(r => STORE ? STORE.set(obj, r) : r());

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

  function createPanel(savedPos) {
    ROOT = document.createElement("div");
    ROOT.id = "aive-root";

    ROOT.innerHTML = `
      <div class="aive-panel">
        <div class="aive-header">AIVE ?</div>

        <div class="aive-clip">
          <div class="aive-body">

            ${slider("Brightness","brightness",0,2,0.01,1)}
            ${slider("Contrast","contrast",0,2,0.01,1)}
            ${slider("Saturation","saturation",0,2,0.01,1)}
            ${slider("Sepia","sepia",0,1,0.01,0)}
            ${slider("Zoom","zoom",1,2,0.01,1)}

            <div class="aive-row">
              <label>Flip Horizontal</label>
              <button class="aive-flip">Flip</button>
            </div>

            ${slider("Animation Speed","speed",100,3000,50,animMS)}
            ${slider("Blind Weight","inertia",1,4,0.1,inertia)}
            ${slider("Collapse Delay","delay",0,2000,50,delayMS)}

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

    // ✅ POSITION — JS OWNS IT
    if (savedPos) {
      ROOT.style.left = savedPos.left + "px";
      ROOT.style.top = savedPos.top + "px";
    } else {
      ROOT.style.left = "20px";
      ROOT.style.top = "20px";
    }

    wireControls();
    blind(ROOT);
    drag(ROOT);
  }

  // --------------------------------------------------
  // CONTROLS
  // --------------------------------------------------

  function updateSlider(key, val) {
    const r = ROOT.querySelector(`input[data-key="${key}"]`);
    if (!r) return;
    r.value = val;
    r.previousElementSibling.querySelector(".aive-val").textContent = val;
  }

  function wireControls() {
    ROOT.querySelectorAll("input[type=range]").forEach(r => {
      r.oninput = () => {
        const k = r.dataset.key;
        const v = Number(r.value);
        r.previousElementSibling.querySelector(".aive-val").textContent = v;

        if (k in state) {
          state[k] = v;
          applyEffects();
        }
        if (k === "speed") animMS = v;
        if (k === "inertia") inertia = v;
        if (k === "delay") delayMS = v;
      };
    });

    ROOT.querySelector(".aive-flip").onclick = () => {
      state.flip = !state.flip;
      applyEffects();
    };

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
