(() => {
  const STORAGE_KEY_SETTINGS = "aive-settings-v1_7_2";
  const STORAGE_KEY_BLACKLIST = "aive-blacklist-v1";
  const ROOT_ID = "aive-root";
  const PANEL_ID = "aive-panel";
  const SVG_FILTER_ID = "aive-filters";
  const BUILTIN_BLACKLIST = ["yahoo.com"]; // blocks all subdomains

  const getHost = () => location.hostname.toLowerCase();
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();

  function isHostBlocked(host, list) {
    if (!host) return false;
    host = host.toLowerCase();
    for (const raw of list || []) {
      const pat = norm(raw);
      if (!pat) continue;
      if (pat.startsWith("*.")) {
        const d = pat.slice(2);
        if (host === d || host.endsWith("." + d)) return true;
      } else {
        if (host === pat || host.endsWith("." + pat)) return true;
      }
    }
    return false;
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      } catch {
        resolve({});
      }
    });
  }
  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, resolve);
      } catch {
        resolve();
      }
    });
  }

  async function boot() {
    const host = getHost();
    const { [STORAGE_KEY_BLACKLIST]: userBlk = [] } = await storageGet([
      STORAGE_KEY_BLACKLIST,
    ]);
    const effectiveBlk = Array.from(
      new Set([...(userBlk || []), ...BUILTIN_BLACKLIST])
    );
    if (isHostBlocked(host, effectiveBlk)) {
      console.log("AIVE: site is blacklisted → not injecting UI on", host);
      return;
    }
    // Notify background that content script is alive on this tab/frame
    try { chrome.runtime.sendMessage({ type: 'HELLO' }); } catch {}
    run();
  }

  let settings = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    hue: 0,
    sepia: 0,
    grayscale: 0,
    invert: 0,
    blur: 0,
    gamma: 1,
    sharpness: 0,
    zoom: 1,
    mirrorH: 0,
    mirrorV: 0,
    fadeMs: 1000,
  };
  const defaults = () => ({
    brightness: 1,
    contrast: 1,
    saturate: 1,
    hue: 0,
    sepia: 0,
    grayscale: 0,
    invert: 0,
    blur: 0,
    gamma: 1,
    sharpness: 0,
    zoom: 1,
    mirrorH: 0,
    mirrorV: 0,
    fadeMs: 1000,
  });

  const debounce = (fn, ms = 120) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const save = debounce(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {}
  }, 120);
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (raw) Object.assign(settings, JSON.parse(raw));
    } catch {}
  };

  const visible = (el) =>
    !!el &&
    el.getClientRects().length &&
    getComputedStyle(el).visibility !== "hidden" &&
    getComputedStyle(el).display !== "none";
  const area = (el) => (el?.offsetWidth || 0) * (el?.offsetHeight || 0);

  // Deep selector across open shadow roots
  function deepQueryAll(selector, root = document) {
    const out = new Set();
    const visit = (node) => {
      try {
        if (node && node.querySelectorAll) {
          node.querySelectorAll(selector).forEach((el) => out.add(el));
          // Walk all elements to find open shadow roots
          node.querySelectorAll("*").forEach((el) => {
            if (el.shadowRoot) visit(el.shadowRoot);
          });
        } else if (node && node.childNodes) {
          node.childNodes.forEach((n) => visit(n));
        }
      } catch {}
    };
    visit(root);
    return Array.from(out);
  }

  function findTarget() {
    // Include iframes as potential targets; filters/transform can apply to the iframe box itself
    const nodes = deepQueryAll("video, canvas, iframe");
    if (!nodes.length) return null;
    // Prefer playing/visible videos, else largest visible node
    const videos = nodes.filter((n) => n.tagName === "VIDEO");
    const playing = videos.filter(
      (v) => visible(v) && !(v.paused || v.ended)
    );
    let pool = playing.length ? playing : nodes.filter(visible);
    if (!pool.length) pool = nodes;
    pool.sort((a, b) => area(b) - area(a));
    return pool[0] || nodes[0];
  }

  function ensureSvgFilters() {
    let existing = document.getElementById(SVG_FILTER_ID);
    if (existing) {
      return {
        feConvolve: existing.querySelector("feConvolveMatrix"),
        feR: existing.querySelector("feComponentTransfer > feFuncR"),
        feG: existing.querySelector("feComponentTransfer > feFuncG"),
        feB: existing.querySelector("feComponentTransfer > feFuncB"),
      };
    }
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "absolute";
    const defs = document.createElementNS(svgNS, "defs");
    const filter = document.createElementNS(svgNS, "filter");
    filter.setAttribute("id", SVG_FILTER_ID);

    const feConvolve = document.createElementNS(svgNS, "feConvolveMatrix");
    feConvolve.setAttribute("order", "3");
    feConvolve.setAttribute("kernelMatrix", "0 0 0 0 1 0 0 0 0");
    feConvolve.setAttribute("preserveAlpha", "true");
    filter.appendChild(feConvolve);

    const feCT = document.createElementNS(svgNS, "feComponentTransfer");
    const mk = (ch) => {
      const n = document.createElementNS(svgNS, "feFunc" + ch);
      n.setAttribute("type", "gamma");
      n.setAttribute("amplitude", "1");
      n.setAttribute("exponent", "1");
      n.setAttribute("offset", "0");
      return n;
    };
    const feR = mk("R"),
      feG = mk("G"),
      feB = mk("B");
    feCT.appendChild(feR);
    feCT.appendChild(feG);
    feCT.appendChild(feB);
    filter.appendChild(feCT);

    defs.appendChild(filter);
    svg.appendChild(defs);
    document.documentElement.appendChild(svg);
    return { feConvolve, feR, feG, feB };
  }

  const sliderRow = (label, key, min, max, step, value) => {
    const id = "aive-" + key;
    return `
      <div class="aive-row">
        <label for="${id}">${label}</label>
        <input type="range" id="${id}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
        <output id="${id}-out"></output>
      </div>`;
  };

  const selectRow = (label, key) => {
    const id = "aive-" + key;
    return `
      <div class="aive-row aive-row--select">
        <label for="${id}">${label}</label>
        <select id="${id}" data-key="${key}">
          <option value="0">Off</option>
          <option value="1000">1s</option>
          <option value="2500">2.5s</option>
          <option value="5000">5s</option>
        </select>
      </div>`;
  };

  const mirrorRow = () => `
    <div class="aive-row aive-row--mirror">
      <label>Mirror</label>
      <div class="aive-mirror">
        <div class="aive-mirror-item">
          <span class="aive-mirror-letter">H</span>
          <button id="aive-mirrorH-btn" class="aive-light aive-off" aria-pressed="false"></button>
        </div>
        <div class="aive-mirror-item">
          <span class="aive-mirror-letter">V</span>
          <button id="aive-mirrorV-btn" class="aive-light aive-off" aria-pressed="false"></button>
        </div>
      </div>
      <output></output>
    </div>`;

  function buildUI(video) {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "aive-root";

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "aive-panel";

    panel.innerHTML = [
      `<div class="aive-header">
        <div class="aive-title">🎛️ All-in-One Video Enhancer</div>
        <div class="aive-actions" style="display:flex; gap:.5rem;">
          <button class="aive-btn" id="aive-fullscreen">Fullscreen</button>
          <button class="aive-btn" id="aive-pick">Pick target</button>
          <button class="aive-btn" id="aive-disable-site">Disable here</button>
          <button class="aive-btn" id="aive-manage-blacklist">Manage blacklist</button>
          <button class="aive-btn" id="aive-close">Hide</button>
        </div>
      </div>`,
      `<div class="aive-body">
        ${sliderRow("Brightness", "brightness", 0, 3, 0.01, 1)}
        ${sliderRow("Contrast", "contrast", 0, 3, 0.01, 1)}
        ${sliderRow("Saturation", "saturate", 0, 5, 0.01, 1)}
        ${sliderRow("Hue", "hue", -180, 180, 1, 0)}
        ${sliderRow("Sepia", "sepia", 0, 1, 0.01, 0)}
        ${sliderRow("Grayscale", "grayscale", 0, 1, 0.01, 0)}
        ${sliderRow("Invert", "invert", 0, 1, 0.01, 0)}
        ${sliderRow("Blur", "blur", 0, 10, 0.1, 0)}
        ${sliderRow("Gamma", "gamma", 0.2, 3, 0.01, 1)}
        ${sliderRow("Sharpness", "sharpness", 0, 2, 0.01, 0)}
        ${sliderRow("Zoom", "zoom", 1, 5, 0.01, 1)}
        ${mirrorRow()}
        ${selectRow("Fade delay", "fadeMs")}
      </div>`,
      `<div class="aive-footer">
        <button class="aive-btn" id="aive-reset">Reset All (R)</button>
        <button class="aive-btn" id="aive-show">Show</button>
        <button class="aive-btn" id="aive-snap">Snap to video</button>
      </div>`,
    ].join("");

    root.appendChild(panel);
    document.documentElement.appendChild(root);

    // Dragging
    let dragging = false,
      sx = 0,
      sy = 0,
      sl = 0,
      st = 0;
    const header = panel.querySelector(".aive-header");
    header.addEventListener("mousedown", (e) => {
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = panel.getBoundingClientRect();
      sl = r.left;
      st = r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      panel.style.position = "fixed";
      panel.style.left = Math.max(8, sl + dx) + "px";
      panel.style.top = Math.max(8, st + dy) + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
    });

    // Buttons
    panel
      .querySelector("#aive-close")
      .addEventListener("click", () => panel.classList.add("aive-hidden"));
    panel
      .querySelector("#aive-show")
      .addEventListener("click", () => panel.classList.remove("aive-hidden"));
    panel.querySelector("#aive-snap").addEventListener("click", () => {
      const tgt = currentTarget || video;
      if (!tgt) return;
      const r = tgt.getBoundingClientRect();
      panel.style.left = r.left + 12 + "px";
      panel.style.top = Math.max(8, r.top + 12) + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    panel.querySelector("#aive-fullscreen").addEventListener("click", () => {
      try {
        const target = currentTarget || video;
        const fsTarget =
          (target && target.requestFullscreen && target) ||
          (target && target.parentElement && target.parentElement.requestFullscreen && target.parentElement) ||
          document.documentElement;
        if (!document.fullscreenElement) fsTarget.requestFullscreen && fsTarget.requestFullscreen();
        else document.exitFullscreen && document.exitFullscreen();
      } catch {}
    });

    // Element picker to select target element manually
    function startPicker() {
      if (document.getElementById('aive-picker-mask')) return;
      const mask = document.createElement('div');
      mask.id = 'aive-picker-mask';
      Object.assign(mask.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483646',
        cursor: 'crosshair',
        background: 'transparent',
        pointerEvents: 'auto'
      });
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'fixed',
        border: '2px solid #00ffff',
        boxShadow: '0 0 10px rgba(0,255,255,.6)',
        pointerEvents: 'none',
      });
      document.documentElement.appendChild(mask);
      document.documentElement.appendChild(box);

      const isOurUI = (el) => !!el && (el.closest && el.closest('#'+ROOT_ID));

      function highlightAt(x, y) {
        const prev = mask.style.pointerEvents;
        mask.style.pointerEvents = 'none';
        let el = document.elementFromPoint(x, y);
        mask.style.pointerEvents = prev || 'auto';
        if (!el || isOurUI(el)) {
          box.style.display = 'none';
          return null;
        }
        const r = el.getBoundingClientRect();
        box.style.display = 'block';
        box.style.left = r.left + 'px';
        box.style.top = r.top + 'px';
        box.style.width = r.width + 'px';
        box.style.height = r.height + 'px';
        return el;
      }

      function cleanup() {
        try { mask.remove(); } catch {}
        try { box.remove(); } catch {}
        window.removeEventListener('mousemove', onMove, true);
        window.removeEventListener('mousedown', onDown, true);
        window.removeEventListener('keydown', onKey, true);
      }

      function onMove(e) {
        highlightAt(e.clientX, e.clientY);
      }
      function onDown(e) {
        e.preventDefault();
        e.stopPropagation();
        const el = highlightAt(e.clientX, e.clientY);
        if (el) {
          currentTarget = el;
          apply(currentTarget);
        }
        cleanup();
      }
      function onKey(e) {
        if ((e.key||'').toLowerCase() === 'escape') {
          e.preventDefault();
          cleanup();
        }
      }
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mousedown', onDown, true);
      window.addEventListener('keydown', onKey, true);
    }

    panel.querySelector('#aive-pick').addEventListener('click', () => startPicker());

    // Disable here
    panel
      .querySelector("#aive-disable-site")
      .addEventListener("click", async () => {
        const host = getHost();
        const { [STORAGE_KEY_BLACKLIST]: blk = [] } = await storageGet([
          STORAGE_KEY_BLACKLIST,
        ]);
        if (!isHostBlocked(host, blk)) {
          blk.push(host);
          await storageSet({ [STORAGE_KEY_BLACKLIST]: blk });
        }
        try {
          root.remove();
        } catch {}
        console.log("AIVE: disabled on", host);
      });

    // Manage blacklist
    panel
      .querySelector("#aive-manage-blacklist")
      .addEventListener("click", async () => {
        const { [STORAGE_KEY_BLACKLIST]: blk = [] } = await storageGet([
          STORAGE_KEY_BLACKLIST,
        ]);
        const current = (blk || []).join("\n");
        const edited = prompt(
          "AIVE blacklist:\n\n• One entry per line\n• Use domains like example.com or *.example.com\n\nEdit and click OK to save:",
          current
        );
        if (edited === null) return;
        const next = edited.split("\n").map(norm).filter(Boolean);
        await storageSet({
          [STORAGE_KEY_BLACKLIST]: Array.from(new Set(next)),
        });
        alert("AIVE: blacklist saved.");
      });

    return root;
  }

  function bindSliders(panel, video) {
    const inputs = panel.querySelectorAll('input[type="range"][data-key]');
    inputs.forEach((inp) => {
      const key = inp.getAttribute("data-key");
      inp.value = settings[key];
      const out = panel.querySelector(`#aive-${key}-out`);
      const unit = key === "hue" ? "°" : key === "blur" ? "px" : "";
      if (out) out.textContent = settings[key] + unit;

      inp.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const step = Number(inp.step || "1");
          let d = (e.deltaY > 0 ? 1 : -1) * step;
          if (e.shiftKey) d *= 0.2;
          const min = Number(inp.min),
            max = Number(inp.max);
          const next = Math.min(max, Math.max(min, Number(inp.value) - d));
          inp.value = String(next);
          settings[key] = next;
          if (out) out.textContent = next + unit;
          apply(video);
          save();
        },
        { passive: false }
      );

      inp.addEventListener("input", () => {
        const v = Number(inp.value);
        settings[key] = v;
        if (out) out.textContent = v + unit;
        apply(video);
        save();
      });
    });
  }

  function updateMirrorBtnVisual(btn, val) {
    const on = Number(val) >= 1;
    btn.classList.toggle("aive-on", on);
    btn.classList.toggle("aive-off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function bindMirror(panel, video) {
    [
      ["mirrorH", "aive-mirrorH-btn"],
      ["mirrorV", "aive-mirrorV-btn"],
    ].forEach(([key, id]) => {
      const btn = panel.querySelector("#" + id);
      updateMirrorBtnVisual(btn, settings[key]);
      btn.addEventListener("click", () => {
        const current = Number(settings[key]) >= 1;
        settings[key] = current ? 0 : 1;
        updateMirrorBtnVisual(btn, settings[key]);
        apply(video);
        save();
      });
    });
  }

  function doReset(panel, video) {
    settings = defaults();
    try {
      localStorage.removeItem(STORAGE_KEY_SETTINGS);
    } catch {}
    panel.querySelectorAll('input[type="range"][data-key]').forEach((inp) => {
      const k = inp.getAttribute("data-key");
      inp.value = settings[k];
      const out = panel.querySelector(`#aive-${k}-out`);
      const unit = k === "hue" ? "°" : k === "blur" ? "px" : "";
      if (out) out.textContent = settings[k] + unit;
    });
    const bH = panel.querySelector("#aive-mirrorH-btn");
    const bV = panel.querySelector("#aive-mirrorV-btn");
    if (bH) updateMirrorBtnVisual(bH, 0);
    if (bV) updateMirrorBtnVisual(bV, 0);
    apply(video);
    save();
  }

  function apply(video) {
    if (!video) return;
    const filters = [
      `brightness(${settings.brightness})`,
      `contrast(${settings.contrast})`,
      `saturate(${settings.saturate})`,
      `hue-rotate(${settings.hue}deg)`,
      `sepia(${settings.sepia})`,
      `grayscale(${settings.grayscale})`,
      `invert(${settings.invert})`,
      `blur(${settings.blur}px)`,
    ];
    const needsSvg =
      Number(settings.gamma) !== 1 || Number(settings.sharpness) > 0;
    if (needsSvg) filters.unshift(`url(#${SVG_FILTER_ID})`);
    video.style.filter = filters.join(" ");
    video.style.transformOrigin = "center center";
    const sx = (Number(settings.mirrorH) >= 1 ? -1 : 1) * settings.zoom;
    const sy = (Number(settings.mirrorV) >= 1 ? -1 : 1) * settings.zoom;
    video.style.transform = `scale(${sx}, ${sy})`;
    if (needsSvg) {
      const svg = ensureSvgFilters();
      const s = Math.max(0, Number(settings.sharpness));
      const a = s,
        center = 1 + 4 * a;
      const k = [0, -a, 0, -a, center, -a, 0, -a, 0].join(" ");
      svg.feConvolve && svg.feConvolve.setAttribute("kernelMatrix", k);
      const g = Math.max(0.2, Number(settings.gamma));
      svg.feR && svg.feR.setAttribute("exponent", String(g));
      svg.feG && svg.feG.setAttribute("exponent", String(g));
      svg.feB && svg.feB.setAttribute("exponent", String(g));
    }
  }

  let currentPanel = null;
  let currentTarget = null;

  function ensureUI() {
    load();
    const video = findTarget();
    const root = buildUI(video || undefined);
    const panel = root.querySelector("#" + PANEL_ID);
    currentPanel = panel;
    currentTarget = video || null;
    ensureSvgFilters();

    let isHovered = false,
      fadeTimer = null;
    const scheduleFade = () => {
      clearTimeout(fadeTimer);
      if (Number(settings.fadeMs) <= 0) {
        panel.classList.remove("aive-faded");
        return;
      }
      fadeTimer = setTimeout(() => {
        if (!isHovered && !panel.classList.contains("aive-hidden"))
          panel.classList.add("aive-faded");
      }, Number(settings.fadeMs));
    };
    const wake = () => {
      clearTimeout(fadeTimer);
      panel.classList.remove("aive-faded");
      scheduleFade();
    };

    panel.addEventListener(
      "mouseenter",
      () => {
        isHovered = true;
        wake();
      },
      true
    );
    panel.addEventListener(
      "mouseleave",
      () => {
        isHovered = false;
        scheduleFade();
      },
      true
    );
    panel.addEventListener("input", wake, true);
    panel.addEventListener("click", wake, true);
    panel.addEventListener("keydown", wake, true);

    bindSliders(panel, currentTarget || video);
    bindMirror(panel, currentTarget || video);

    const sel = panel.querySelector("#aive-fadeMs");
    if (sel) {
      sel.value = String(settings.fadeMs);
      sel.addEventListener("change", () => {
        settings.fadeMs = Number(sel.value);
        save();
        wake();
        scheduleFade();
      });
    }

    panel
      .querySelector("#aive-reset")
      .addEventListener("click", () => doReset(panel, currentTarget || video));

    window.addEventListener(
      "keydown",
      (e) => {
        const k = (e.key || "").toLowerCase();
        if (k === "v" && !e.repeat) {
          e.preventDefault();
          panel.classList.toggle("aive-hidden");
          return;
        }
        if (!panel.matches(":hover")) return; // only while interacting with the panel
        if (k === "h" || k === "v") {
          e.preventDefault();
          const key = k === "h" ? "mirrorH" : "mirrorV";
          settings[key] = Number(settings[key]) ? 0 : 1;
          const btn = panel.querySelector(`#aive-${key}-btn`);
          if (btn) updateMirrorBtnVisual(btn, settings[key]);
          apply(currentTarget || video);
          save();
        }
        if (k === "r") {
          e.preventDefault();
          doReset(panel, currentTarget || video);
        }
      },
      true
    );

    if (video) apply(video);
    // Small toast to confirm injection
    try {
      const t = document.createElement('div');
      t.textContent = 'AIVE ready';
      Object.assign(t.style, {
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#00e5ff',
        color: '#000',
        padding: '.4rem .7rem',
        font: '800 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        borderRadius: '8px',
        border: '2px solid #00ffff',
        boxShadow: '0 10px 30px rgba(0,0,0,.4), 0 0 16px rgba(0,255,255,.9)',
        zIndex: '2147483647',
        opacity: '0.98'
      });
      document.documentElement.appendChild(t);
      setTimeout(() => { try { t.remove(); } catch {} }, 1600);
    } catch {}
    scheduleFade();
  }

  function run() {
    // Always build the UI so users can pick a target manually
    ensureUI();
    // Observe DOM and open shadow roots for late-added media
    const mo = new MutationObserver(() => {
      const vv = findTarget();
      if (vv) {
        mo.disconnect();
        ensureUI();
      }
    });
    const observeTree = (root) => {
      try { mo.observe(root, { childList: true, subtree: true }); } catch {}
      try {
        root.querySelectorAll && root.querySelectorAll("*").forEach((el) => {
          if (el.shadowRoot) observeTree(el.shadowRoot);
        });
      } catch {}
    };
    // Hook attachShadow to watch future open shadows
    try {
      const orig = Element.prototype.attachShadow;
      if (typeof orig === "function" && !Element.prototype.__aiveHooked) {
        Element.prototype.attachShadow = function (init) {
          const sr = orig.call(this, init);
          observeTree(sr);
          return sr;
        };
        Object.defineProperty(Element.prototype, "__aiveHooked", { value: true });
      }
    } catch {}
    observeTree(document);
  }

  boot();

  // Listen for messages from the popup to control the current page's video/panel
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      const type = msg && msg.type;
      const panel = currentPanel;
      const video = currentTarget || findTarget();
      if (!video) return;

      switch (type) {
        case "FORCE_SHOW": {
          // Ensure UI is present and visible regardless of blacklist or initial detection
          try { ensureUI(); } catch {}
          if (panel) panel.classList.remove("aive-hidden");
          break;
        }
        case "RESET_ALL": {
          if (panel) doReset(panel, video);
          else {
            settings = defaults();
            apply(video);
            save();
          }
          break;
        }
        case "TOGGLE_PANEL": {
          if (panel) panel.classList.toggle("aive-hidden");
          break;
        }
        case "MIRROR_H": {
          settings.mirrorH = 1;
          const btn = panel && panel.querySelector('#aive-mirrorH-btn');
          if (btn) updateMirrorBtnVisual(btn, settings.mirrorH);
          apply(video);
          save();
          break;
        }
        case "RESET_MIRROR_H": {
          settings.mirrorH = 0;
          const btn = panel && panel.querySelector('#aive-mirrorH-btn');
          if (btn) updateMirrorBtnVisual(btn, settings.mirrorH);
          apply(video);
          save();
          break;
        }
        case "MIRROR_V": {
          settings.mirrorV = 1;
          const btn = panel && panel.querySelector('#aive-mirrorV-btn');
          if (btn) updateMirrorBtnVisual(btn, settings.mirrorV);
          apply(video);
          save();
          break;
        }
        case "RESET_MIRROR_V": {
          settings.mirrorV = 0;
          const btn = panel && panel.querySelector('#aive-mirrorV-btn');
          if (btn) updateMirrorBtnVisual(btn, settings.mirrorV);
          apply(video);
          save();
          break;
        }
        default:
          break;
      }
    });
  } catch {}
})();
