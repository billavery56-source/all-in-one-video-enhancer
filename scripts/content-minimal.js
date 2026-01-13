// ======================================================
// AIVE – CONTENT SCRIPT (STABLE BLIND + CONTROLS)
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
  let BLACKLIST = [];

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
  // BLIND CONFIG (GLOBAL + SAFE)
  // --------------------------------------------------

  let animMS  = 1200;
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
        <label>${label}<span class="aive-val">${val}</span></label>
        <input type="range"
          data-key="${key}"
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
    wireControls();
    blind(ROOT);
    drag(ROOT);
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

    ROOT.querySelector(".aive-reset").onclick = () => {
      state.brightness = 1;
      state.contrast = 1;
      state.saturation = 1;
      state.sepia = 0;
      state.zoom = 1;
      state.flip = false;

      ROOT.querySelectorAll("input[type=range]").forEach(r => {
        const k = r.dataset.key;
        r.value = state[k] ?? r.value;
        r.dispatchEvent(new Event("input"));
      });
    };

    ROOT.querySelector(".aive-auto").onclick = () => {
      state.brightness = 1.1;
      state.contrast = 1.1;
      state.saturation = 1.15;

      ROOT.querySelectorAll("input[type=range]").forEach(r => {
        if (r.dataset.key in state) {
          r.value = state[r.dataset.key];
          r.dispatchEvent(new Event("input"));
        }
      });
    };

    ROOT.querySelector(".aive-disable").onclick = () => ROOT.remove();

    ROOT.querySelector(".aive-blacklist").onclick = openBlacklist;
  }

  // --------------------------------------------------
  // BLIND ANIMATION (FIXED)
  // --------------------------------------------------

  function blind(root) {
    const header = root.querySelector(".aive-header");
    const clip   = root.querySelector(".aive-clip");
    const body   = root.querySelector(".aive-body");

    let open = false;
    let animating = false;
    let timer;

    function animate(to) {
      if (animating) return;
      animating = true;

      const from = clip.offsetHeight;
      const dist = to - from;
      const start = performance.now();

      function step(now) {
        const t = Math.min((now - start) / animMS, 1);
        clip.style.height = from + dist * ease(t) + "px";
        if (t < 1) requestAnimationFrame(step);
        else animating = false;
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
      clearTimeout(timer);
      timer = setTimeout(() => {
        open = false;
        animate(0);
      }, Number.isFinite(delayMS) ? delayMS : 0);
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
        root.style.top  = e.clientY - oy + "px";
      };

      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    };
  }

  // --------------------------------------------------
  // BLACKLIST MODAL (CENTERED)
  // --------------------------------------------------

  function openBlacklist() {
    const overlay = document.createElement("div");
    overlay.id = "aive-bl-overlay";

    overlay.innerHTML = `
      <div class="aive-bl-box">
        <h3>Blacklisted Domains</h3>
        <ul>
          ${BLACKLIST.map(d => `<li>${d} <button data-d="${d}">✕</button></li>`).join("")}
        </ul>
        <button id="aive-add-domain">Add Current Domain</button>
        <button id="aive-close-bl">Close</button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.onclick = e => {
      if (e.target.dataset.d) {
        BLACKLIST = BLACKLIST.filter(x => x !== e.target.dataset.d);
        storageSet({ aive_blacklist: BLACKLIST }).then(() => overlay.remove());
      }
    };

    overlay.querySelector("#aive-add-domain").onclick = () => {
      if (!BLACKLIST.includes(DOMAIN)) {
        BLACKLIST.push(DOMAIN);
        storageSet({ aive_blacklist: BLACKLIST }).then(() => location.reload());
      }
    };

    overlay.querySelector("#aive-close-bl").onclick = () => overlay.remove();
  }

  // --------------------------------------------------
  // SHORTCUTS
  // --------------------------------------------------

  document.addEventListener("keydown", e => {
    if (e.altKey && e.shiftKey && e.code === "KeyB") openBlacklist();
    if (e.altKey && e.shiftKey && e.code === "KeyA") ROOT?.remove();
  });

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------

  storageGet("aive_blacklist").then(list => {
    BLACKLIST = Array.isArray(list) ? list : [];
    if (BLACKLIST.includes(DOMAIN)) return;

    const wait = () => {
      if (!ALIVE) return;
      if (document.body) createPanel();
      else requestAnimationFrame(wait);
    };
    wait();
  });

})();
