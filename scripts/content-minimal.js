// ======================================================
// AIVE – CONTENT SCRIPT (STABLE + CENTERED BLACKLIST)
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
      try {
        STORE.get(key, o => r(o[key]));
      } catch {
        r(undefined);
      }
    });

  const storageSet = obj =>
    new Promise(r => {
      if (!STORE) return r();
      try {
        STORE.set(obj, r);
      } catch {
        r();
      }
    });

  const DOMAIN = location.hostname;
  const BLACKLIST_KEY = "aive_blacklist";

  let BLACKLIST = [];
  let TAB_DISABLED = false;
  let ROOT = null;

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

    v.style.transform = `scale(${state.zoom}) scaleX(${state.flip ? -1 : 1})`;
  }

  // --------------------------------------------------
  // PANEL
  // --------------------------------------------------
  function slider(label, key, min, max, step, val) {
    return `
      <div class="aive-row">
        <label>${label} <span class="aive-val">${val}</span></label>
        <input type="range" data-key="${key}"
          min="${min}" max="${max}" step="${step}" value="${val}">
      </div>`;
  }

  function createPanel() {
    if (ROOT || TAB_DISABLED) return;

    ROOT = document.createElement("div");
    ROOT.id = "aive-root";

    ROOT.innerHTML = `
      <div class="aive-panel">
        <div class="aive-header">AIVE</div>

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

  function destroyPanel() {
    if (ROOT) {
      ROOT.remove();
      ROOT = null;
    }
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
      };
    });

    ROOT.querySelector(".aive-flip").onclick = () => {
      state.flip = !state.flip;
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
      ROOT.querySelectorAll("input[type=range]").forEach(r =>
        r.dispatchEvent(new Event("input"))
      );
    };

    ROOT.querySelector(".aive-auto").onclick = () => {
      state.brightness = 1.1;
      state.contrast = 1.1;
      state.saturation = 1.15;
      applyEffects();
    };

    ROOT.querySelector(".aive-disable").onclick = () => {
      TAB_DISABLED = true;
      destroyPanel();
    };

    ROOT.querySelector(".aive-blacklist").onclick = async () => {
      if (!BLACKLIST.includes(DOMAIN)) {
        BLACKLIST.push(DOMAIN);
        await storageSet({ [BLACKLIST_KEY]: BLACKLIST });
      }
      destroyPanel();
    };
  }

  // --------------------------------------------------
  // BLIND (NO CHANGES)
  // --------------------------------------------------
  function blind(root) {
    const header = root.querySelector(".aive-header");
    const clip = root.querySelector(".aive-clip");
    const body = root.querySelector(".aive-body");

    header.onmouseenter = () => {
      clip.style.height = body.scrollHeight + "px";
    };

    root.onmouseleave = () => {
      clip.style.height = "0px";
    };
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
    if (document.getElementById("aive-bl-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "aive-bl-overlay";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.6);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const box = document.createElement("div");
    box.style.cssText = `
      background: #111;
      color: #fff;
      padding: 16px 20px;
      border-radius: 12px;
      width: 420px;
      max-height: 70vh;
      overflow: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,.7);
      font-family: system-ui;
    `;

    box.innerHTML = `
      <h3 style="margin-top:0">Blacklisted Domains</h3>
      <ul style="padding-left:16px">
        ${BLACKLIST.map(
          d => `<li>${d} <button data-d="${d}">✕</button></li>`
        ).join("")}
      </ul>
      <div style="margin-top:12px;text-align:right">
        <button id="aive-bl-close">Close</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.onclick = e => {
      if (e.target === overlay) overlay.remove();
      if (e.target.dataset?.d) {
        BLACKLIST = BLACKLIST.filter(x => x !== e.target.dataset.d);
        storageSet({ [BLACKLIST_KEY]: BLACKLIST });
        overlay.remove();
        openBlacklist();
      }
    };

    box.querySelector("#aive-bl-close").onclick = () => overlay.remove();
  }

  // --------------------------------------------------
  // SHORTCUTS
  // --------------------------------------------------
  document.addEventListener("keydown", e => {
    if (e.altKey && e.shiftKey && e.code === "KeyB") openBlacklist();
  });

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------
  storageGet(BLACKLIST_KEY).then(list => {
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
