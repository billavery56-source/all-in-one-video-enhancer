(() => {
  /**********************************************************
   * HARD GUARANTEE: PANEL ALWAYS VISIBLE
   **********************************************************/

  // ----------------------------
  // INLINE CSS (NO FILE LOAD)
  // ----------------------------
  const style = document.createElement("style");
  style.textContent = `
    #aive-root {
      position: fixed;
      left: 20px;
      top: 20px;
      z-index: 2147483647;
      width: 260px;
      background: #111;
      color: #fff;
      font-family: system-ui, sans-serif;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.6);
      overflow: hidden;
    }

    #aive-root.collapsed {
      height: 36px;
    }

    #aive-root.expanded {
      height: 360px;
    }

    #aive-root {
      transition: height 400ms ease-in-out;
    }

    #aive-header {
      height: 36px;
      display: flex;
      align-items: center;
      padding: 0 10px;
      cursor: move;
      background: #1a1a1a;
      user-select: none;
    }

    #aive-header .title {
      font-weight: 700;
    }

    #aive-header .spacer {
      flex: 1;
    }

    #aive-header button {
      background: none;
      border: none;
      color: #0af;
      font-size: 16px;
      cursor: pointer;
    }

    #aive-body {
      padding: 10px;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 120px 40px;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 12px;
    }

    .row input[type="range"] {
      width: 100%;
    }

    .value {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .buttons {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }

    .buttons button {
      flex: 1;
      background: #222;
      color: #fff;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 6px;
      cursor: pointer;
    }

    .buttons button:hover {
      background: #333;
    }
  `;
  document.documentElement.appendChild(style);

  // ----------------------------
  // ROOT PANEL
  // ----------------------------
  const root = document.createElement("div");
  root.id = "aive-root";
  root.className = "collapsed";
  document.body.appendChild(root);

  // ----------------------------
  // HEADER
  // ----------------------------
  const header = document.createElement("div");
  header.id = "aive-header";
  header.innerHTML = `
    <span class="title">AIVE</span>
    <span class="spacer"></span>
    <button title="Help">?</button>
  `;
  root.appendChild(header);

  // ----------------------------
  // BODY
  // ----------------------------
  const body = document.createElement("div");
  body.id = "aive-body";
  root.appendChild(body);

  // ----------------------------
  // STATE
  // ----------------------------
  const DEFAULTS = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    sepia: 0,
    hue: 0,
    zoom: 1
  };
  const state = { ...DEFAULTS };
  let video = null;

  // ----------------------------
  // SLIDERS
  // ----------------------------
  function addSlider(key, label, min, max, step) {
    const row = document.createElement("div");
    row.className = "row";

    const lbl = document.createElement("span");
    lbl.textContent = label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = state[key];

    const val = document.createElement("span");
    val.className = "value";
    val.textContent = state[key];

    input.oninput = () => {
      state[key] = parseFloat(input.value);
      val.textContent = input.value;
      applyFilters();
    };

    row.append(lbl, input, val);
    body.appendChild(row);
  }

  addSlider("brightness", "Brightness", 0, 2, 0.01);
  addSlider("contrast", "Contrast", 0, 2, 0.01);
  addSlider("saturate", "Saturation", 0, 3, 0.01);
  addSlider("sepia", "Sepia", 0, 1, 0.01);
  addSlider("hue", "Hue", -180, 180, 1);
  addSlider("zoom", "Zoom", 0.5, 3, 0.01);

  // ----------------------------
  // BUTTONS
  // ----------------------------
  const buttons = document.createElement("div");
  buttons.className = "buttons";

  const autoBtn = document.createElement("button");
  autoBtn.textContent = "Auto";
  autoBtn.onclick = () => {
    Object.assign(state, {
      brightness: 1.05,
      contrast: 1.05,
      saturate: 1.1,
      sepia: 0,
      hue: 0,
      zoom: 1
    });
    sync();
    applyFilters();
  };

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.onclick = () => {
    Object.assign(state, DEFAULTS);
    sync();
    applyFilters();
  };

  buttons.append(autoBtn, resetBtn);
  body.appendChild(buttons);

  // ----------------------------
  // VIDEO HANDLING (NON-BLOCKING)
  // ----------------------------
  function findVideo() {
    const v = document.querySelector("video");
    if (v && v !== video) {
      video = v;
      applyFilters();
    }
  }

  const mo = new MutationObserver(findVideo);
  mo.observe(document.body, { childList: true, subtree: true });
  findVideo();

  function applyFilters() {
    if (!video) return;
    video.style.filter = `
      brightness(${state.brightness})
      contrast(${state.contrast})
      saturate(${state.saturate})
      sepia(${state.sepia})
      hue-rotate(${state.hue}deg)
    `;
    video.style.transform = `scale(${state.zoom})`;
  }

  function sync() {
    body.querySelectorAll(".row").forEach(row => {
      const input = row.querySelector("input");
      const key = Object.keys(state).find(k => input.value == state[k]);
      row.querySelector(".value").textContent = input.value;
    });
  }

  // ----------------------------
  // COLLAPSE / EXPAND (CSS ONLY)
  // ----------------------------
  root.addEventListener("mouseenter", () => {
    root.classList.remove("collapsed");
    root.classList.add("expanded");
  });

  root.addEventListener("mouseleave", () => {
    root.classList.remove("expanded");
    root.classList.add("collapsed");
  });

})();
