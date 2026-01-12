// ======================================================
// AIVE – CONTENT SCRIPT (BLIND + SPEED + INERTIA + DELAY)
// ======================================================

(() => {
  "use strict";

  // --------------------------------------------------
  // CONTEXT
  // --------------------------------------------------

  let ALIVE = true;
  window.addEventListener("pagehide", () => ALIVE = false);
  window.addEventListener("beforeunload", () => ALIVE = false);

  if (window.__AIVE_LOADED__) return;
  window.__AIVE_LOADED__ = true;

  // --------------------------------------------------
  // CONFIG (LIVE)
// --------------------------------------------------

  let animDuration = 1200;     // ms
  let inertia = 2.4;          // easing weight
  let collapseDelay = 600;    // ms before closing

  // --------------------------------------------------
  // EASING (REAL BLIND FEEL)
  // --------------------------------------------------

  function easeOutWeighted(t) {
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
        <div class="aive-header">
          <div class="aive-title">AIVE ?</div>
        </div>

        <div class="aive-clip">
          <div class="aive-body">

            <div class="aive-row">
              <label>Brightness</label>
              <input type="range">
            </div>

            <div class="aive-row">
              <label>Contrast</label>
              <input type="range">
            </div>

            <div class="aive-row">
              <label>Saturation</label>
              <input type="range">
            </div>

            <div class="aive-row">
              <label>
                Animation Speed
                <span class="aive-val">${animDuration}ms</span>
              </label>
              <input
                type="range"
                min="100"
                max="3000"
                step="50"
                value="${animDuration}"
                class="aive-speed"
              >
            </div>

            <div class="aive-row">
              <label>
                Blind Weight
                <span class="aive-val">${inertia.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="1"
                max="4"
                step="0.1"
                value="${inertia}"
                class="aive-inertia"
              >
            </div>

            <div class="aive-row">
              <label>
                Collapse Delay
                <span class="aive-val">${collapseDelay}ms</span>
              </label>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value="${collapseDelay}"
                class="aive-delay"
              >
            </div>

            <div class="aive-buttons">
              <button>Auto</button>
              <button>Reset</button>
              <button>Disable Tab</button>
              <button>Blacklist Domain</button>
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    enableBlind(root);
    enableControls(root);
    makeDraggable(root);
  }

  // --------------------------------------------------
  // BLIND ANIMATION (WITH DELAY)
  // --------------------------------------------------

  function enableBlind(root) {
    const header = root.querySelector(".aive-header");
    const clip = root.querySelector(".aive-clip");
    const body = root.querySelector(".aive-body");

    let expanded = false;
    let animating = false;
    let collapseTimer = null;

    function animate(toHeight) {
      if (animating) return;
      animating = true;

      const startHeight = clip.offsetHeight;
      const delta = toHeight - startHeight;
      const startTime = performance.now();

      function frame(now) {
        if (!ALIVE) return;

        const rawT = Math.min((now - startTime) / animDuration, 1);
        const t = easeOutWeighted(rawT);

        clip.style.height = startHeight + delta * t + "px";

        if (rawT < 1) {
          requestAnimationFrame(frame);
        } else {
          animating = false;
        }
      }

      requestAnimationFrame(frame);
    }

    header.addEventListener("mouseenter", () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }

      if (expanded) return;
      expanded = true;
      animate(body.scrollHeight);
    });

    root.addEventListener("mouseleave", () => {
      if (!expanded) return;

      collapseTimer = setTimeout(() => {
        expanded = false;
        animate(0);
      }, collapseDelay);
    });
  }

  // --------------------------------------------------
  // CONTROLS
  // --------------------------------------------------

  function enableControls(root) {
    const speed = root.querySelector(".aive-speed");
    const inertiaSlider = root.querySelector(".aive-inertia");
    const delaySlider = root.querySelector(".aive-delay");
    const values = root.querySelectorAll(".aive-val");

    speed.addEventListener("input", () => {
      animDuration = Number(speed.value);
      values[0].textContent = `${animDuration}ms`;
    });

    inertiaSlider.addEventListener("input", () => {
      inertia = Number(inertiaSlider.value);
      values[1].textContent = inertia.toFixed(1);
    });

    delaySlider.addEventListener("input", () => {
      collapseDelay = Number(delaySlider.value);
      values[2].textContent = `${collapseDelay}ms`;
    });
  }

  // --------------------------------------------------
  // DRAG
  // --------------------------------------------------

  function makeDraggable(root) {
    const header = root.querySelector(".aive-header");
    let ox = 0, oy = 0;

    header.addEventListener("mousedown", e => {
      ox = e.clientX - root.offsetLeft;
      oy = e.clientY - root.offsetTop;

      const move = e => {
        root.style.left = e.clientX - ox + "px";
        root.style.top = e.clientY - oy + "px";
      };

      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };

      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------

  function waitForBody(cb) {
    if (!ALIVE) return;
    if (document.body) return cb();
    requestAnimationFrame(() => waitForBody(cb));
  }

  waitForBody(createPanel);

})();
