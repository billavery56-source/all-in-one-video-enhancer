// Minimal AIVE with streaming kill-switch + sleep support + draggable panel + modal help
(() => {
  // --- Never run AIVE on big streaming services ---
  try {
    const host = (location.hostname || "").toLowerCase();
    const blocked = [
      "netflix.com",
      "nflxvideo.net",
      "primevideo.com",
      "amazonvideo.com",
      "disneyplus.com",
      "hulu.com",
      "max.com",
      "hbomax.com",
      "paramountplus.com",
      "peacocktv.com",
      "starz.com",
      "showtime.com",
      "crunchyroll.com"
    ];
    const match = (h, pat) => h === pat || h.endsWith("." + pat);
    if (blocked.some((d) => match(host, d))) {
      return;
    }
  } catch {}

  console.log("AIVE: minimal script loading");

  const STORAGE_KEY = "aive-minimal-settings";

  let settings = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    hue: 0,
    sepia: 0,
    zoom: 1,
    mirrorH: false,
    mirrorV: false
  };

  let sleepMode = false; // when true, AIVE does nothing on this tab
  let currentVideo = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        settings = Object.assign(settings, parsed);
      }
    } catch (e) {}
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  function findVideo() {
    const videos = document.querySelectorAll("video");
    if (videos.length > 0) {
      for (let v of videos) {
        if (v.offsetHeight > 0 && v.offsetWidth > 0) return v;
      }
      return videos[0];
    }
    return null;
  }

  function applyFilters(video) {
    if (!video) return;

    if (sleepMode) {
      video.style.filter = "";
      video.style.transform = "";
      return;
    }

    const filters = [
      `brightness(${settings.brightness})`,
      `contrast(${settings.contrast})`,
      `saturate(${settings.saturate})`,
      `hue-rotate(${settings.hue}deg)`,
      `sepia(${settings.sepia})`
    ];

    video.style.filter = filters.join(" ");
    const sx = (settings.mirrorH ? -1 : 1) * (settings.zoom || 1);
    const sy = (settings.mirrorV ? -1 : 1) * (settings.zoom || 1);
    video.style.transform = `scale(${sx}, ${sy})`;
  }

  // ------------------ HELP MODAL ------------------

  function openHelpModal() {
    if (document.getElementById("aive-help-backdrop")) return;

    const backdrop = document.createElement("div");
    backdrop.id = "aive-help-backdrop";
    backdrop.className = "aive-help-backdrop";

    backdrop.innerHTML = `
      <div class="aive-help-modal">
        <button class="aive-help-close" title="Close">✕</button>
        <div class="aive-help-title">All-in-One Video Enhancer</div>
        <div class="aive-help-body">
          <h3>Pin AIVE to the toolbar</h3>
          <ul>
            <li>Click the puzzle-piece icon (Extensions) in the browser toolbar.</li>
            <li>Find “All-in-One Video Enhancer (AIVE)”.</li>
            <li>Click the pin icon so the AIVE button always stays visible.</li>
          </ul>
          <h3>Using the AIVE panel</h3>
          <ul>
            <li>Sliders adjust <b>brightness</b>, <b>contrast</b>, <b>saturation</b>, <b>hue</b> and <b>zoom</b> of the video.</li>
            <li><b>H</b> / <b>V</b> mirror the video horizontally or vertically.</li>
            <li><b>Auto</b> tries to smart-tune the picture based on the current frame.</li>
            <li><b>Reset</b> returns everything to default.</li>
          </ul>
          <h3>Site controls (toolbar popup)</h3>
          <ul>
            <li><b>Pause AIVE on this tab</b> – temporarily toggles AIVE on/off for the current tab.</li>
            <li><b>Disable AIVE on this site</b> – adds this site to AIVE’s blocklist.</li>
            <li><b>Enable AIVE on this site</b> – removes this site from the blocklist.</li>
          </ul>
        </div>
      </div>
    `;

    const close = () => {
      try { backdrop.remove(); } catch (e) {}
    };

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    const closeBtn = backdrop.querySelector(".aive-help-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
    }

    document.body.appendChild(backdrop);
  }

  // ------------------ UI CREATION ------------------

  function createUI() {
    if (document.getElementById("aive-minimal-root")) return;

    const oldUIs = document.querySelectorAll('[class*="aive"], [id*="aive"]');
    oldUIs.forEach((el) => {
      if (el.id !== "aive-minimal-root") {
        el.style.display = "none";
        el.remove();
      }
    });

    try {
      if (!document.getElementById("aive-minimal-style")) {
        const link = document.createElement("link");
        link.id = "aive-minimal-style";
        link.rel = "stylesheet";
        link.href = chrome.runtime.getURL("styles/aive/minimal.css");
        document.head.appendChild(link);
      }
    } catch (e) {}

    const root = document.createElement("div");
    root.id = "aive-minimal-root";

    let html =
      '<div class="aive-panel">' +
      '<div class="aive-header">' +
      '<div class="aive-title">AIVE</div>' +
      '<button id="aive-help-btn" class="aive-help-btn" title="How AIVE works">?</button>' +
      "</div>";

    const controls = [
      { label: "Brightness", key: "brightness", min: 0, max: 2, step: 0.1 },
      { label: "Contrast", key: "contrast", min: 0, max: 2, step: 0.1 },
      { label: "Saturate", key: "saturate", min: 0, max: 2, step: 0.1 },
      { label: "Hue", key: "hue", min: -180, max: 180, step: 1 },
      { label: "Sepia", key: "sepia", min: 0, max: 1, step: 0.1 },
      { label: "Zoom", key: "zoom", min: 0.5, max: 3, step: 0.1 }
    ];

    controls.forEach((c) => {
      html += `
        <div class="aive-row">
          <label class="aive-label">
            ${c.label}: <span class="aive-value" data-key="${c.key}">${settings[
        c.key
      ].toFixed(2)}</span>
          </label>
          <input
            type="range"
            class="aive-slider"
            data-key="${c.key}"
            min="${c.min}"
            max="${c.max}"
            step="${c.step}"
            value="${settings[c.key]}"
          />
        </div>
      `;
    });

    html += `
      <div style="display:flex;gap:8px">
        <button id="aive-mirror-h" class="aive-toggle">H</button>
        <button id="aive-mirror-v" class="aive-toggle">V</button>
        <button id="aive-auto" class="aive-reset">Auto</button>
        <button id="aive-reset" class="aive-reset">Reset</button>
      </div>
    `;

    html += `
      <div style="margin-top:10px;display:flex;">
        <button id="aive-disable-site" class="aive-toggle"
          style="flex:1;background:rgba(255,20,20,0.06);color:#ffb;">
          Disable on site
        </button>
      </div>
    `;

    html += "</div>"; // .aive-panel
    root.innerHTML = html;
    document.body.appendChild(root);

    // Help icon -> modal
    const helpBtn = root.querySelector("#aive-help-btn");
    if (helpBtn) {
      helpBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openHelpModal();
      });
    }

    // ----- DRAG SUPPORT (by title) -----
    const titleEl = root.querySelector(".aive-title");
    if (titleEl) {
      let dragState = null;
      titleEl.style.cursor = "move";

      const onMove = (ev) => {
        if (!dragState) return;
        const w = root.offsetWidth || 0;
        const h = root.offsetHeight || 0;
        let x = ev.clientX - dragState.offsetX;
        let y = ev.clientY - dragState.offsetY;
        x = Math.max(0, Math.min(window.innerWidth - w, x));
        y = Math.max(0, Math.min(window.innerHeight - h, y));
        root.style.left = x + "px";
        root.style.top = y + "px";
        root.style.right = "auto";
        root.style.bottom = "auto";
      };

      const onUp = () => {
        if (!dragState) return;
        dragState = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      titleEl.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const rect = root.getBoundingClientRect();
        dragState = {
          offsetX: ev.clientX - rect.left,
          offsetY: ev.clientY - rect.top
        };
        root.style.left = rect.left + "px";
        root.style.top = rect.top + "px";
        root.style.right = "auto";
        root.style.bottom = "auto";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    // ----- Auto-hide behavior -----
    let hideTimer = null;
    let docMoveListener = null;

    function cancelHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (docMoveListener) {
        document.removeEventListener("mousemove", docMoveListener);
        docMoveListener = null;
      }
    }

    function showPanel() {
      cancelHide();
      root.classList.remove("aive-hidden");
    }

    function hidePanelDelayed(ms = 1000) {
      cancelHide();
      hideTimer = setTimeout(() => {
        root.classList.add("aive-hidden");
        const panel = root.querySelector(".aive-panel");
        const r = panel
          ? panel.getBoundingClientRect()
          : {
              left: 20,
              top: window.innerHeight - 140,
              right: 280,
              bottom: window.innerHeight - 20
            };
        docMoveListener = (ev) => {
          const x = ev.clientX,
            y = ev.clientY;
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            showPanel();
          }
        };
        document.addEventListener("mousemove", docMoveListener);
      }, ms);
    }

    root.addEventListener("mouseenter", showPanel);
    root.addEventListener("mouseleave", () => hidePanelDelayed(1000));
    hidePanelDelayed(1000);

    // ----- Sliders wiring -----
    const sliders = root.querySelectorAll(".aive-slider");
    sliders.forEach((slider) => {
      slider.addEventListener("input", (e) => {
        const key = e.target.getAttribute("data-key");
        const val = parseFloat(e.target.value);
        settings[key] = val;
        saveSettings();
        const display = root.querySelector(
          `[data-key="${key}"].aive-value`
        );
        if (display) display.textContent = val.toFixed(2);
        const video = currentVideo || findVideo();
        if (video) applyFilters(video);
      });
    });

    // ----- Reset -----
    const resetBtn = root.querySelector("#aive-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        settings = {
          brightness: 1,
          contrast: 1,
          saturate: 1,
          hue: 0,
          zoom: 1,
          mirrorH: settings.mirrorH,
          mirrorV: settings.mirrorV
        };
        sliders.forEach((s) => {
          const key = s.getAttribute("data-key");
          s.value = settings[key];
          const disp = root.querySelector(
            `[data-key="${key}"].aive-value`
          );
          if (disp) disp.textContent = settings[key].toFixed(2);
        });
        const video = currentVideo || findVideo();
        if (video) applyFilters(video);
        saveSettings();
      });
    }

    // ----- Mirror buttons -----
    const mH = root.querySelector("#aive-mirror-h");
    const mV = root.querySelector("#aive-mirror-v");

    function updateMirrorButtons() {
      if (mH) mH.classList.toggle("active", !!settings.mirrorH);
      if (mV) mV.classList.toggle("active", !!settings.mirrorV);
    }

    if (mH) {
      mH.addEventListener("click", () => {
        settings.mirrorH = !settings.mirrorH;
        saveSettings();
        const v = currentVideo || findVideo();
        if (v) applyFilters(v);
        updateMirrorButtons();
      });
    }

    if (mV) {
      mV.addEventListener("click", () => {
        settings.mirrorV = !settings.mirrorV;
        saveSettings();
        const v = currentVideo || findVideo();
        if (v) applyFilters(v);
        updateMirrorButtons();
      });
    }

    updateMirrorButtons();

    // ----- Auto button -----
    const autoBtn = root.querySelector("#aive-auto");
    if (autoBtn) {
      autoBtn.addEventListener("click", async () => {
        autoBtn.disabled = true;
        autoBtn.textContent = "Auto…";
        try {
          await autoTune();
        } catch (e) {}
        autoBtn.textContent = "Auto";
        autoBtn.disabled = false;
      });
    }

    // ----- Disable-on-site -----
    const disableBtn = root.querySelector("#aive-disable-site");
    if (disableBtn) {
      disableBtn.addEventListener("click", async () => {
        const host = window.location.hostname.toLowerCase();
        try {
          const raw = await new Promise((res) =>
            chrome.storage.local.get(["aive-blacklist-v1"], (r) => res(r || {}))
          );
          const list = Array.isArray(raw["aive-blacklist-v1"])
            ? raw["aive-blacklist-v1"]
            : [];
          if (!list.includes(host)) list.push(host);
          await new Promise((res) =>
            chrome.storage.local.set({ "aive-blacklist-v1": list }, res)
          );
        } catch (e) {}
        try {
          root.remove();
        } catch (e) {}
        showEnableToast(host);
      });
    }
  }

  // ------------------ AUTO-TUNE ------------------

  async function autoTune() {
    const video = currentVideo || findVideo();
    if (!video) return;

    const w = Math.min(video.videoWidth || 640, 640);
    const h = Math.min(video.videoHeight || 360, 360);
    if (w <= 0 || h <= 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    try {
      ctx.drawImage(video, 0, 0, w, h);
    } catch (e) {
      return;
    }

    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      return;
    }

    let rAcc = 0,
      gAcc = 0,
      bAcc = 0,
      lumAcc = 0,
      count = 0;
    const stride = 4 * 6;

    for (let i = 0; i < data.length; i += stride) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      rAcc += r;
      gAcc += g;
      bAcc += b;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumAcc += lum;
      count++;
    }

    const avgLum = lumAcc / Math.max(1, count);
    let brightness = settings.brightness;
    brightness = Math.max(0.5, Math.min(2, 1 + (130 - avgLum) / 160));

    let varAcc = 0;
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const d = lum - avgLum;
      varAcc += d * d;
    }
    const variance = varAcc / Math.max(1, count);
    const std = Math.sqrt(variance);
    let contrast = Math.max(0.6, Math.min(1.6, 60 / (std || 1)));

    let chromaAcc = 0;
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      chromaAcc += Math.max(r, g, b) - Math.min(r, g, b);
    }
    const avgChroma = chromaAcc / Math.max(1, count);
    let saturate = Math.max(0.5, Math.min(2, 1 + (80 - avgChroma) / 160));

    settings.brightness = Number(brightness.toFixed(2));
    settings.contrast = Number(contrast.toFixed(2));
    settings.saturate = Number(saturate.toFixed(2));

    applyFilters(video);
    saveSettings();

    const root = document.getElementById("aive-minimal-root");
    if (root) {
      ["brightness", "contrast", "saturate", "hue", "zoom"].forEach((k) => {
        const s = root.querySelector(`.aive-slider[data-key="${k}"]`);
        const d = root.querySelector(`.aive-value[data-key="${k}"]`);
        if (s) s.value = settings[k];
        if (d) d.textContent = (settings[k] || 0).toFixed(2);
      });
    }
  }

  // ------------------ INIT ------------------

  function init() {
    loadSettings();
    createUI();

    currentVideo = findVideo();
    if (currentVideo) applyFilters(currentVideo);

    const observer = new MutationObserver(() => {
      if (!currentVideo) {
        currentVideo = findVideo();
        if (currentVideo) applyFilters(currentVideo);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ------------------ MESSAGE HANDLER ------------------

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === "FORCE_SHOW") {
        createUI();
        const root = document.getElementById("aive-minimal-root");
        if (root) root.style.display = "";
        return;
      }

      if (msg.type === "TOGGLE_SLEEP") {
        sleepMode = !sleepMode;
        const v = currentVideo || findVideo();
        if (v) applyFilters(v);
        return;
      }

      if (msg.type === "RESET_ALL") {
        settings = {
          brightness: 1,
          contrast: 1,
          saturate: 1,
          hue: 0,
          zoom: 1,
          mirrorH: false,
          mirrorV: false
        };
        saveSettings();
        const v = currentVideo || findVideo();
        if (v) applyFilters(v);

        const root = document.getElementById("aive-minimal-root");
        if (root) {
          const sliders = root.querySelectorAll(".aive-slider");
          sliders.forEach((s) => {
            const k = s.getAttribute("data-key");
            s.value = settings[k];
            const disp = root.querySelector(
              `.aive-value[data-key="${k}"]`
            );
            if (disp) disp.textContent = settings[k].toFixed(2);
          });
          const mh = root.querySelector("#aive-mirror-h");
          const mv = root.querySelector("#aive-mirror-v");
          if (mh) mh.classList.remove("active");
          if (mv) mv.classList.remove("active");
        }
      }
    });
  } catch (e) {}

  // ------------------ ENABLE TOAST ------------------

  function showEnableToast(host) {
    try {
      const id = "aive-enable-toast";
      if (document.getElementById(id)) return;

      const t = document.createElement("div");
      t.id = id;
      t.innerHTML = `${host} — <button id="aive-enable-site" style="margin-left:8px;padding:6px 8px;border-radius:6px;border:none;background:#00ffd5;color:#002;cursor:pointer">Enable</button>`;

      Object.assign(t.style, {
        position: "fixed",
        bottom: "18px",
        left: "20px",
        zIndex: 2147483647,
        background: "rgba(10,10,10,0.95)",
        color: "#dff",
        padding: "8px 10px",
        borderRadius: "8px",
        border: "1px solid rgba(0,255,255,0.08)"
      });

      document.body.appendChild(t);

      document
        .getElementById("aive-enable-site")
        .addEventListener("click", async () => {
          try {
            const raw = await new Promise((res) =>
              chrome.storage.local.get(["aive-blacklist-v1"], (r) =>
                res(r || {})
              )
            );
            const list = Array.isArray(raw["aive-blacklist-v1"])
              ? raw["aive-blacklist-v1"]
              : [];
            const idx = list.indexOf(host);
            if (idx >= 0) list.splice(idx, 1);
            await new Promise((res) =>
              chrome.storage.local.set({ "aive-blacklist-v1": list }, res)
            );
          } catch (e) {}

          try {
            t.remove();
          } catch (e) {}

          createUI();
        });

      setTimeout(() => {
        try {
          t.remove();
        } catch (e) {}
      }, 12000);
    } catch (e) {}
  }
})();
