(() => {
  'use strict';

  /******************************************************************
   * CONSTANTS
   ******************************************************************/
  const DOMAIN = location.hostname;
  const POS_KEY = `aive-pos:${DOMAIN}`;
  const DISABLE_KEY = `aive-disabled:${DOMAIN}`;
  const BLACKLIST_KEY = 'aive-blacklist';

  const DEFAULTS = {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    sepia: 0,
    hue: 0,
    zoom: 1,
    flipH: false,
    flipV: false
  };

  let state = { ...DEFAULTS };
  let video = null;

  /******************************************************************
   * EARLY EXIT IF DISABLED
   ******************************************************************/
  chrome.storage.local.get([DISABLE_KEY, BLACKLIST_KEY], res => {
    if (res[DISABLE_KEY]) return;
    if ((res[BLACKLIST_KEY] || []).includes(DOMAIN)) return;
    init();
  });

  /******************************************************************
   * INIT
   ******************************************************************/
  function init() {
    injectPanel();
    findVideoLoop();
  }

  /******************************************************************
   * PANEL CREATION
   ******************************************************************/
  function injectPanel() {
    if (document.getElementById('aive-root')) return;

    const root = document.createElement('div');
    root.id = 'aive-root';
    root.className = 'collapsed';

    root.innerHTML = `
      <div class="aive-shell">
        <div class="aive-header">
          <span class="title">AIVE</span>
          <span class="spacer"></span>
          <span class="help" title="Help">?</span>
        </div>

        <div class="aive-body">
          ${sliderRow('Brightness', 'brightness', 0.5, 2, 0.01)}
          ${sliderRow('Contrast', 'contrast', 0.5, 2, 0.01)}
          ${sliderRow('Saturation', 'saturation', 0, 3, 0.01)}
          ${sliderRow('Sepia', 'sepia', 0, 1, 0.01)}
          ${sliderRow('Hue', 'hue', -180, 180, 1)}
          ${sliderRow('Zoom', 'zoom', 0.5, 2, 0.01)}

          <div class="buttons">
            <button id="aive-auto">Auto</button>
            <button id="aive-reset">Reset</button>
            <button id="aive-flip">Flip</button>
            <button id="aive-disable">Disable Site</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    restorePosition(root);
    enableDrag(root);
    enableHover(root);
    wireControls(root);
  }

  function sliderRow(label, key, min, max, step) {
    return `
      <div class="row">
        <label>${label}</label>
        <input type="range"
               data-key="${key}"
               min="${min}"
               max="${max}"
               step="${step}"
               value="${DEFAULTS[key]}">
        <span class="val">${DEFAULTS[key]}</span>
      </div>
    `;
  }

  /******************************************************************
   * VIDEO DETECTION
   ******************************************************************/
  function findVideoLoop() {
    setInterval(() => {
      if (video && !video.isConnected) video = null;
      if (!video) video = document.querySelector('video');
      if (video) applyFilters();
    }, 1000);
  }

  /******************************************************************
   * FILTERS
   ******************************************************************/
  function applyFilters() {
    if (!video) return;

    video.style.filter = `
      brightness(${state.brightness})
      contrast(${state.contrast})
      saturate(${state.saturation})
      sepia(${state.sepia})
      hue-rotate(${state.hue}deg)
    `.trim();

    const sx = state.flipH ? -state.zoom : state.zoom;
    const sy = state.flipV ? -state.zoom : state.zoom;
    video.style.transform = `scale(${sx}, ${sy})`;
    video.style.transformOrigin = 'center center';
  }

  /******************************************************************
   * CONTROLS
   ******************************************************************/
  function wireControls(root) {
    root.querySelectorAll('input[type="range"]').forEach(input => {
      const key = input.dataset.key;
      const val = input.closest('.row').querySelector('.val');

      input.addEventListener('input', () => {
        state[key] = Number(input.value);
        val.textContent = input.value;
        applyFilters();
      });
    });

    root.querySelector('#aive-reset').onclick = () => {
      state = { ...DEFAULTS };
      root.querySelectorAll('input[type="range"]').forEach(i => {
        i.value = state[i.dataset.key];
        i.closest('.row').querySelector('.val').textContent = i.value;
      });
      applyFilters();
    };

    root.querySelector('#aive-auto').onclick = () => {
      state.brightness = 1.05;
      state.contrast = 1.1;
      state.saturation = 1.25;
      updateUI(root);
      applyFilters();
    };

    root.querySelector('#aive-flip').onclick = () => {
      state.flipH = !state.flipH;
      applyFilters();
    };

    root.querySelector('#aive-disable').onclick = () => {
      chrome.storage.local.set({ [DISABLE_KEY]: true });
      root.remove();
    };

    root.querySelector('.help').onclick = () => {
      alert('AIVE\n\nHover to expand\nDrag header to move\nAuto = quick enhancement\nDisable Site = temporary');
    };
  }

  function updateUI(root) {
    root.querySelectorAll('input[type="range"]').forEach(i => {
      i.value = state[i.dataset.key];
      i.closest('.row').querySelector('.val').textContent = i.value;
    });
  }

  /******************************************************************
   * DRAG (NO POLLING, NO TIMERS)
   ******************************************************************/
  function enableDrag(root) {
    const header = root.querySelector('.aive-header');
    if (!header) return;

    let dragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener('pointerdown', e => {
      dragging = true;
      header.setPointerCapture(e.pointerId);

      const r = root.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = r.left;
      startTop = r.top;

      document.body.style.userSelect = 'none';
    });

    header.addEventListener('pointermove', e => {
      if (!dragging) return;
      root.style.left = startLeft + (e.clientX - startX) + 'px';
      root.style.top = startTop + (e.clientY - startY) + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    });

    header.addEventListener('pointerup', e => {
      dragging = false;
      header.releasePointerCapture(e.pointerId);
      document.body.style.userSelect = '';

      const r = root.getBoundingClientRect();
      chrome.storage.local.set({
        [POS_KEY]: { left: r.left, top: r.top }
      });
    });
  }

  function restorePosition(root) {
    chrome.storage.local.get(POS_KEY, res => {
      if (!res[POS_KEY]) return;
      root.style.left = res[POS_KEY].left + 'px';
      root.style.top = res[POS_KEY].top + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    });
  }

  /******************************************************************
   * CSS-ONLY EXPAND / COLLAPSE
   ******************************************************************/
  function enableHover(root) {
    root.addEventListener('mouseenter', () => {
      root.classList.add('expanded');
      root.classList.remove('collapsed');
    });

    root.addEventListener('mouseleave', () => {
      root.classList.remove('expanded');
      root.classList.add('collapsed');
    });
  }

})();
