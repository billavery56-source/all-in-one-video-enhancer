(() => {
  'use strict';

  /**********************************************************
   * HARD GUARDS
   **********************************************************/
  if (window.top !== window) return;
  if (!window.chrome || !chrome.runtime?.id) return;
  if (window.__AIVE_ACTIVE__) return;
  window.__AIVE_ACTIVE__ = true;

  /**********************************************************
   * CONSTANTS & STORAGE
   **********************************************************/
  const DOMAIN = location.hostname;
  const STORAGE = chrome.storage.local;

  const KEYS = {
    BLACKLIST: 'aive_blacklist_domains',
    POSITIONS: 'aive_panel_positions'
  };

  const get = key => new Promise(r => STORAGE.get(key, v => r(v[key])));
  const set = obj => new Promise(r => STORAGE.set(obj, r));

  /**********************************************************
   * CSS (ASSUMES panel.css via manifest)
   **********************************************************/
  // Do NOT inject CSS dynamically. Manifest handles it.

  /**********************************************************
   * PANEL HTML
   **********************************************************/
  const panel = document.createElement('div');
  panel.id = 'aive-root';
  panel.innerHTML = `
    <div id="aive-header">
      <span>AIVE</span>
      <span id="aive-help">?</span>
    </div>

    <div class="aive-body">
      ${slider('Brightness','brightness',0.5,2,0.01,1)}
      ${slider('Contrast','contrast',0.5,2,0.01,1)}
      ${slider('Saturation','saturate',0,3,0.01,1)}
      ${slider('Sepia','sepia',0,1,0.01,0)}
      ${slider('Hue','hue',-180,180,1,0)}
      ${slider('Zoom','zoom',0.5,3,0.01,1)}

      <div class="aive-buttons">
        <button id="aive-auto">Auto</button>
        <button id="aive-reset">Reset</button>
        <button id="aive-h">H</button>
        <button id="aive-v">V</button>
      </div>

      <div class="aive-buttons">
        <button id="aive-disable-tab">Disable Tab</button>
        <button id="aive-blacklist">Blacklist Domain</button>
      </div>
    </div>

    <div id="aive-help-modal">
      <div>
        <h3>AIVE Help</h3>
        <ul>
          <li>Hover header to expand / collapse</li>
          <li>Drag header to move</li>
          <li>Disable Tab = temporary</li>
          <li>Blacklist Domain = permanent</li>
        </ul>
        <button id="aive-help-close">Close</button>
      </div>
    </div>
  `;

  /**********************************************************
   * STATE
   **********************************************************/
  let video = null;
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const state = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    sepia: 0,
    hue: 0,
    zoom: 1,
    mirrorH: false,
    mirrorV: false
  };

  /**********************************************************
   * VIDEO DETECTION
   **********************************************************/
  function findVideo() {
    const v = document.querySelector('video');
    if (v && v !== video) {
      video = v;
      applyFilters();
    }
  }
  setInterval(findVideo, 1000);

  /**********************************************************
   * FILTER APPLICATION
   **********************************************************/
  function applyFilters() {
    if (!video) return;

    video.style.filter = `
      brightness(${state.brightness})
      contrast(${state.contrast})
      saturate(${state.saturate})
      sepia(${state.sepia})
      hue-rotate(${state.hue}deg)
    `.trim();

    const sx = (state.mirrorH ? -1 : 1) * state.zoom;
    const sy = (state.mirrorV ? -1 : 1) * state.zoom;
    video.style.transform = `scale(${sx},${sy})`;
  }

  /**********************************************************
   * SLIDERS
   **********************************************************/
  panel.querySelectorAll('.row input').forEach(input => {
    const key = input.dataset.key;
    const val = input.closest('.row').querySelector('.val');

    input.addEventListener('input', () => {
      state[key] = parseFloat(input.value);
      val.textContent = input.value;
      applyFilters();
    });
  });

  function syncSliders() {
    panel.querySelectorAll('.row').forEach(row => {
      const key = row.querySelector('input').dataset.key;
      row.querySelector('input').value = state[key];
      row.querySelector('.val').textContent = state[key];
    });
    applyFilters();
  }

  /**********************************************************
   * BUTTONS
   **********************************************************/
  panel.querySelector('#aive-auto').onclick = () => {
    state.brightness = 1.05;
    state.contrast = 1.1;
    state.saturate = 1.15;
    syncSliders();
  };

  panel.querySelector('#aive-reset').onclick = () => {
    Object.assign(state, {
      brightness: 1,
      contrast: 1,
      saturate: 1,
      sepia: 0,
      hue: 0,
      zoom: 1,
      mirrorH: false,
      mirrorV: false
    });
    syncSliders();
  };

  panel.querySelector('#aive-h').onclick = () => {
    state.mirrorH = !state.mirrorH;
    applyFilters();
  };

  panel.querySelector('#aive-v').onclick = () => {
    state.mirrorV = !state.mirrorV;
    applyFilters();
  };

  panel.querySelector('#aive-disable-tab').onclick = () => {
    panel.remove();
  };

  panel.querySelector('#aive-blacklist').onclick = async () => {
    const list = await get(KEYS.BLACKLIST) || [];
    if (!list.includes(DOMAIN)) {
      list.push(DOMAIN);
      await set({ [KEYS.BLACKLIST]: list });
    }
    panel.remove();
  };

  /**********************************************************
   * HELP
   **********************************************************/
  const helpModal = panel.querySelector('#aive-help-modal');
  panel.querySelector('#aive-help').onclick = () => helpModal.classList.add('show');
  panel.querySelector('#aive-help-close').onclick = () => helpModal.classList.remove('show');

  document.addEventListener('keydown', e => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'h') {
      helpModal.classList.toggle('show');
    }
  });

  /**********************************************************
   * DRAGGING + PER-DOMAIN POSITION
   **********************************************************/
  const header = panel.querySelector('#aive-header');

  header.addEventListener('mousedown', e => {
    dragging = true;
    dragOffsetX = e.clientX - panel.offsetLeft;
    dragOffsetY = e.clientY - panel.offsetTop;
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left = e.clientX - dragOffsetX + 'px';
    panel.style.top  = e.clientY - dragOffsetY + 'px';
  });

  document.addEventListener('mouseup', async () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';

    const pos = await get(KEYS.POSITIONS) || {};
    pos[DOMAIN] = {
      x: panel.offsetLeft,
      y: panel.offsetTop
    };
    await set({ [KEYS.POSITIONS]: pos });
  });

  /**********************************************************
   * RESTORE POSITION
   **********************************************************/
  get(KEYS.POSITIONS).then(pos => {
    if (pos && pos[DOMAIN]) {
      panel.style.left = pos[DOMAIN].x + 'px';
      panel.style.top  = pos[DOMAIN].y + 'px';
    }
  });

  /**********************************************************
   * BLACKLIST CHECK (FINAL)
   **********************************************************/
  get(KEYS.BLACKLIST).then(list => {
    if (Array.isArray(list) && list.includes(DOMAIN)) return;
    document.body.appendChild(panel);
  });

  /**********************************************************
   * UTIL
   **********************************************************/
  function slider(label, key, min, max, step, def) {
    return `
      <div class="row">
        <label>${label}</label>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${def}" data-key="${key}">
        <span class="val">${def}</span>
      </div>
    `;
  }

})();
