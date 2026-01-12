// ======================================================
// AIVE – CONTENT SCRIPT (FULL WORKING BUILD)
// ======================================================

(() => {
  "use strict";

  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  let ALIVE = true;
  window.addEventListener("pagehide", () => ALIVE = false);
  window.addEventListener("beforeunload", () => ALIVE = false);

  // --------------------------------------------------
  // VIDEO TARGET
  // --------------------------------------------------

  function getVideo() {
    return document.querySelector("video");
  }

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
    v.style.transformOrigin = "center center";
  }

  // --------------------------------------------------
  // ANIMATION CONFIG
  // --------------------------------------------------

  let animDuration = 1200;
  let inertia = 2.4;
  let collapseDelay = 600;

  function easeOut(t) {
    return 1 - Math.pow(1 - t, inertia);
  }

  // --------------------------------------------------
  // PANEL
  // --------------------------------------------------

  function createPanel() {
    const root = document.createElement("div");
    root.id = "aive-root";

    root.innerHTML = `
      <div class="aive-panel">
        <div class="aive-header">AIVE ?</div>

        <div class="aive-clip">
          <div class="aive-body">

            ${slider("Brightness", "brightness", 0, 2, 0.01, 1)}
            ${slider("Contrast", "contrast", 0, 2, 0.01, 1)}
            ${slider("Saturation", "saturation", 0, 2, 0.01, 1)}
            ${slider("Sepia", "sepia", 0, 1, 0.01, 0)}
            ${slider("Zoom", "zoom", 1, 2, 0.01, 1)}

            <div class="aive-row">
              <label>Flip Horizontal</label>
              <button class="aive-flip">Flip</button>
            </div>

            ${slider("Animation Speed", "speed", 100, 3000, 50, animDuration)}
            ${slider("Blind Weight", "inertia", 1, 4, 0.1, inertia)}
            ${slider("Collapse Delay", "delay", 0, 2000, 50, collapseDelay)}

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

    document.body.appendChild(root);

    wireControls(root);
    enableBlind(root);
    makeDraggable(root);
  }

  function slider(label, key, min, max, step, value) {
    return `
      <div class="aive-row">
        <label>${label} <span class="aive-val">${value}</span></label>
        <input type="range"
          data-key="${key}"
          min="${min}" max="${max}" step="${step}" value="${value}">
      </div>
    `;
  }

  // --------------------------------------------------
  // CONTROLS
  // --------------------------------------------------

  function wireControls(root) {
    root.querySelectorAll("input[type=range]").forEach(sl => {
      sl.addEventListener("input", () => {
        const key = sl.dataset.key;
        const val = Number(sl.value);
        sl.previousElementSibling.querySelector(".aive-val").textContent = val;

        if (key in state) {
          state[key] = val;
          applyEffects();
        }

        if (key === "speed") animDuration = val;
        if (key === "inertia") inertia = val;
        if (key === "delay") collapseDelay = val;
      });
    });

    root.querySelector(".aive-flip").onclick = () => {
      state.flip = !state.flip;
      applyEffects();
    };

    root.querySelector(".aive-reset").onclick = () => {
      Object.assign(state, {
        brightness: 1,
        contrast: 1,
        saturation: 1,
        sepia: 0,
        zoom: 1,
        flip: false
      });
      root.querySelectorAll("input[type=range]").forEach(sl => {
        sl.value = sl.getAttribute("value");
        sl.dispatchEvent(new Event("input"));
      });
    };

    root.querySelector(".aive-auto").onclick = () => {
      state.brightness = 1.1;
      state.contrast = 1.1;
      state.saturation = 1.15;
      applyEffects();
    };

    root.querySelector(".aive-disable").onclick = () => {
      root.remove();
    };

    root.querySelector(".aive-blacklist").onclick = () => {
      alert("Blacklist UI coming next step.");
    };
  }

  // --------------------------------------------------
  // BLIND ANIMATION
  // --------------------------------------------------

  function enableBlind(root) {
    const header = root.querySelector(".aive-header");
    const clip = root.querySelector(".aive-clip");
    const body = root.querySelector(".aive-body");

    let expanded = false;
    let animating = false;
    let timer = null;

    function animate(to) {
      if (animating) return;
      animating = true;

      const from = clip.offsetHeight;
      const delta = to - from;
      const start = performance.now();

      function frame(now) {
        const t = Math.min((now - start) / animDuration, 1);
        clip.style.height = from + delta * easeOut(t) + "px";
        if (t < 1) requestAnimationFrame(frame);
        else animating = false;
      }
      requestAnimationFrame(frame);
    }

    header.onmouseenter = () => {
      clearTimeout(timer);
      if (!expanded) {
        expanded = true;
        animate(body.scrollHeight);
      }
    };

    root.onmouseleave = () => {
      if (!expanded) return;
      timer = setTimeout(() => {
        expanded = false;
        animate(0);
      }, collapseDelay);
    };
  }

  // --------------------------------------------------
  // DRAG
  // --------------------------------------------------

  function makeDraggable(root) {
    const h = root.querySelector(".aive-header");
    let ox, oy;

    h.onmousedown = e => {
      ox = e.clientX - root.offsetLeft;
      oy = e.clientY - root.offsetTop;

      document.onmousemove = e =>
        root.style.cssText += `left:${e.clientX - ox}px;top:${e.clientY - oy}px;`;

      document.onmouseup = () => document.onmousemove = null;
    };
  }

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------

  function waitForBody() {
    if (!ALIVE) return;
    if (document.body) createPanel();
    else requestAnimationFrame(waitForBody);
  }

  waitForBody();

})();
