(() => {
  /************************************************************
   * AIVE – Stable Panel + Full UI + Per-Domain Position
   ************************************************************/

  const POSITION_KEY = 'aive-panel-position-v1';
  const SETTINGS_KEY = 'aive-settings-v1';

  const domainKey = location.hostname.replace(/^www\./, '');

  let panel, header, body;
  let video = null;

  let settings = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    sepia: 0,
    hue: 0,
    zoom: 1,
    mirrorH: false,
    mirrorV: false
  };

  /* ----------------------------------------------------------
     UTIL
  ---------------------------------------------------------- */
  function clamp(panel) {
    const r = panel.getBoundingClientRect();
    panel.style.left =
      Math.max(0, Math.min(window.innerWidth - r.width, r.left)) + 'px';
    panel.style.top =
      Math.max(0, Math.min(window.innerHeight - r.height, r.top)) + 'px';
  }

  function savePosition() {
    chrome.storage.local.get(POSITION_KEY, res => {
      const map = res[POSITION_KEY] || {};
      const r = panel.getBoundingClientRect();
      map[domainKey] = { x: r.left, y: r.top };
      chrome.storage.local.set({ [POSITION_KEY]: map });
    });
  }

  function loadPosition() {
    chrome.storage.local.get(POSITION_KEY, res => {
      const map = res[POSITION_KEY] || {};
      const pos = map[domainKey];
      if (!pos) return;
      panel.style.left = pos.x + 'px';
      panel.style.top = pos.y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
  }

  function findVideo() {
    return [...document.querySelectorAll('video')]
      .find(v => v.offsetWidth && v.offsetHeight) || null;
  }

  function applyFilters() {
    if (!video) return;

    video.style.filter = `
      brightness(${settings.brightness})
      contrast(${settings.contrast})
      saturate(${settings.saturate})
      sepia(${settings.sepia})
      hue-rotate(${settings.hue}deg)
    `;

    const sx = (settings.mirrorH ? -1 : 1) * settings.zoom;
    const sy = (settings.mirrorV ? -1 : 1) * settings.zoom;
    video.style.transform = `scale(${sx}, ${sy})`;
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(settings, JSON.parse(raw));
    } catch {}
  }

  /* ----------------------------------------------------------
     UI
  ---------------------------------------------------------- */
  function createPanel() {
    if (document.getElementById('aive-root')) return;

    panel = document.createElement('div');
    panel.id = 'aive-root';
    panel.style.position = 'fixed';
    panel.style.left = '20px';
    panel.style.top = '20px';
    panel.style.zIndex = '2147483647';

    panel.innerHTML = `
      <div class="aive-header">
        <span class="title">AIVE</span>
        <span class="drag">⇕</span>
      </div>
      <div class="aive-body">
        ${slider('Brightness', 'brightness', 0, 2, 0.1)}
        ${slider('Contrast', 'contrast', 0, 2, 0.1)}
        ${slider('Saturation', 'saturate', 0, 2, 0.1)}
        ${slider('Sepia', 'sepia', 0, 1, 0.1)}
        ${slider('Hue', 'hue', -180, 180, 1)}
        ${slider('Zoom', 'zoom', 0.5, 3, 0.1)}

        <div class="buttons">
          <button id="auto">Auto</button>
          <button id="reset">Reset</button>
          <button id="mh">H</button>
          <button id="mv">V</button>
        </div>

        <div class="buttons">
          <button id="disable">Disable site</button>
          <button id="help">?</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    header = panel.querySelector('.aive-header');
    body = panel.querySelector('.aive-body');

    enableDrag();
    loadPosition();
    bindUI();
  }

  function slider(label, key, min, max, step) {
    return `
      <div class="row">
        <label>${label}<span data-val="${key}"></span></label>
        <input type="range"
          min="${min}" max="${max}" step="${step}"
          value="${settings[key]}"
          data-key="${key}">
      </div>
    `;
  }

  function bindUI() {
    panel.querySelectorAll('input[type=range]').forEach(sl => {
      const key = sl.dataset.key;
      updateValue(key, sl.value);

      sl.addEventListener('input', () => {
        settings[key] = Number(sl.value);
        updateValue(key, sl.value);
        saveSettings();
        applyFilters();
      });
    });

    panel.querySelector('#auto').onclick = autoAdjust;
    panel.querySelector('#reset').onclick = resetAll;
    panel.querySelector('#mh').onclick = () => toggleMirror('mirrorH');
    panel.querySelector('#mv').onclick = () => toggleMirror('mirrorV');
  }

  function updateValue(key, val) {
    const span = panel.querySelector(`[data-val="${key}"]`);
    if (span) span.textContent = Number(val).toFixed(2);
  }

  function resetAll() {
    settings = {
      brightness: 1,
      contrast: 1,
      saturate: 1,
      sepia: 0,
      hue: 0,
      zoom: 1,
      mirrorH: false,
      mirrorV: false
    };
    saveSettings();
    panel.querySelectorAll('input[type=range]').forEach(sl => {
      sl.value = settings[sl.dataset.key];
      updateValue(sl.dataset.key, sl.value);
    });
    applyFilters();
  }

  function toggleMirror(k) {
    settings[k] = !settings[k];
    saveSettings();
    applyFilters();
  }

  function autoAdjust() {
    settings.brightness = 1.1;
    settings.contrast = 1.1;
    settings.saturate = 1.05;
    saveSettings();
    panel.querySelectorAll('input[type=range]').forEach(sl => {
      sl.value = settings[sl.dataset.key];
      updateValue(sl.dataset.key, sl.value);
    });
    applyFilters();
  }

  /* ----------------------------------------------------------
     DRAG
  ---------------------------------------------------------- */
  function enableDrag() {
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;

    header.onmousedown = e => {
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = panel.getBoundingClientRect();
      sl = r.left;
      st = r.top;
      document.body.style.userSelect = 'none';
    };

    document.onmousemove = e => {
      if (!dragging) return;
      panel.style.left = sl + (e.clientX - sx) + 'px';
      panel.style.top = st + (e.clientY - sy) + 'px';
    };

    document.onmouseup = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      clamp(panel);
      savePosition();
    };
  }

  /* ----------------------------------------------------------
     INIT
  ---------------------------------------------------------- */
  function init() {
    loadSettings();
    createPanel();

    video = findVideo();
    if (video) applyFilters();

    new MutationObserver(() => {
      video = findVideo();
      applyFilters();
    }).observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
