// Minimal AIVE - working foundation
(() => {
  console.log('AIVE: minimal script loading');

  // (legacy removal observer disabled to avoid interfering with minimal UI)
  
  const STORAGE_KEY = 'aive-minimal-settings';

  let settings = {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    hue: 0,
    zoom: 1,
    mirrorH: false,
    mirrorV: false,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        settings = Object.assign(settings, parsed);
        console.log('AIVE: loaded settings', settings);
      }
    } catch (e) {
      // suppressed: failed to load settings (may throw DOMException on some pages)
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // suppressed: failed to save settings (storage may be unavailable)
    }
  }
  
  let currentVideo = null;
  
  function findVideo() {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      // Return first visible video
      for (let v of videos) {
        if (v.offsetHeight > 0 && v.offsetWidth > 0) return v;
      }
      return videos[0];
    }
    return null;
  }
  
  function applyFilters(video) {
    if (!video) return;
    const filters = [
      `brightness(${settings.brightness})`,
      `contrast(${settings.contrast})`,
      `saturate(${settings.saturate})`,
      `hue-rotate(${settings.hue}deg)`,
    ];
    video.style.filter = filters.join(' ');
    const sx = (settings.mirrorH ? -1 : 1) * (settings.zoom || 1);
    const sy = (settings.mirrorV ? -1 : 1) * (settings.zoom || 1);
    video.style.transform = `scale(${sx}, ${sy})`;
  }
  
  function createUI() {
    // Check if UI already exists
    if (document.getElementById('aive-minimal-root')) return;
    
    // Hide or remove any old broken UIs
    const oldUIs = document.querySelectorAll('[class*="aive"], [id*="aive"]');
    oldUIs.forEach(el => {
      if (el.id !== 'aive-minimal-root') {
        el.style.display = 'none';
        el.remove();
      }
    });
    
    // Load external minimal stylesheet from the extension so it's editable
    try {
      if (!document.getElementById('aive-minimal-style')) {
        const link = document.createElement('link');
        link.id = 'aive-minimal-style';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('styles/aive/minimal.css');
        document.head.appendChild(link);
      }
    } catch (e) {
      // fallback: inline styles if runtime.getURL not available
      // suppressed: external CSS load failed
    }

    const root = document.createElement('div');
    root.id = 'aive-minimal-root';
    
    let html = '<div class="aive-panel"><div class="aive-title">AIVE</div>';
    
    // Create sliders
    const controls = [
      { label: 'Brightness', key: 'brightness', min: 0, max: 2, step: 0.1 },
      { label: 'Contrast', key: 'contrast', min: 0, max: 2, step: 0.1 },
      { label: 'Saturate', key: 'saturate', min: 0, max: 2, step: 0.1 },
      { label: 'Hue', key: 'hue', min: -180, max: 180, step: 1 },
      { label: 'Zoom', key: 'zoom', min: 0.5, max: 3, step: 0.1 },
    ];
    
    controls.forEach(c => {
      html += `
        <div class="aive-row">
          <label class="aive-label">
            ${c.label}: <span class="aive-value" data-key="${c.key}">${settings[c.key].toFixed(2)}</span>
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
    
    html += `<div style="display:flex;gap:8px"><button id="aive-mirror-h" class="aive-toggle">H</button><button id="aive-mirror-v" class="aive-toggle">V</button><button id="aive-auto" class="aive-reset">Auto</button><button id="aive-reset" class="aive-reset">Reset</button></div>`;
    // Footer inside panel with disable button
    html += `<div style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:space-between"><button id="aive-disable-site" class="aive-toggle" style="flex:1;padding:6px 8px;border-radius:6px;background:rgba(255,20,20,0.06);color:#ffb;">Disable on site</button></div>`;
    html += '</div>';
    
    root.innerHTML = html;
    document.body.appendChild(root);
    
    console.log('AIVE: UI created');
    // Auto-hide behavior: hide after 1s, reappear on hover near panel
    let hideTimer = null;
    let docMoveListener = null;
    function cancelHide() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      if (docMoveListener) { document.removeEventListener('mousemove', docMoveListener); docMoveListener = null; }
    }
    function showPanel() {
      cancelHide();
      root.classList.remove('aive-hidden');
    }
    function hidePanelDelayed(ms = 1000) {
      cancelHide();
      hideTimer = setTimeout(() => {
        root.classList.add('aive-hidden');
        // while hidden, listen for pointer near panel area to re-show
        const panel = root.querySelector('.aive-panel');
        const rect = panel ? panel.getBoundingClientRect() : { left: 20, top: window.innerHeight - 140, right: 280, bottom: window.innerHeight - 20 };
        docMoveListener = function (ev) {
          const x = ev.clientX, y = ev.clientY;
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            showPanel();
          }
        };
        document.addEventListener('mousemove', docMoveListener);
      }, ms);
    }
    // show while interacting
    root.addEventListener('mouseenter', showPanel);
    root.addEventListener('mouseleave', () => hidePanelDelayed(1000));
    // start hidden after one second
    hidePanelDelayed(1000);
    
    // Attach event listeners
    const sliders = root.querySelectorAll('.aive-slider');
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const key = e.target.getAttribute('data-key');
        const val = parseFloat(e.target.value);
        settings[key] = val;
        // persist
        saveSettings();
        
        // Update display
        root.querySelector(`[data-key="${key}"].aive-value`).textContent = val.toFixed(2);
        
        // Apply to video
        const video = currentVideo || findVideo();
        if (video) {
          applyFilters(video);
          console.log(`AIVE: applied ${key}=${val} to video`);
        } else {
          console.log(`AIVE: no video found for ${key}=${val}`);
        }
      });
    });
    
    root.querySelector('#aive-reset').addEventListener('click', () => {
      settings = {
        brightness: 1,
        contrast: 1,
        saturate: 1,
        hue: 0,
        zoom: 1,
      };
      sliders.forEach(s => {
        const key = s.getAttribute('data-key');
        s.value = settings[key];
        root.querySelector(`[data-key="${key}"].aive-value`).textContent = settings[key].toFixed(2);
      });
      const video = currentVideo || findVideo();
      if (video) applyFilters(video);
      // persist reset
      saveSettings();
    });

    // Mirror toggles
    const mH = root.querySelector('#aive-mirror-h');
    const mV = root.querySelector('#aive-mirror-v');
    function updateMirrorButtons() {
      if (mH) mH.classList.toggle('active', !!settings.mirrorH);
      if (mV) mV.classList.toggle('active', !!settings.mirrorV);
    }
    if (mH) {
      mH.addEventListener('click', () => {
        settings.mirrorH = !settings.mirrorH;
        saveSettings();
        const video = currentVideo || findVideo();
        if (video) applyFilters(video);
        updateMirrorButtons();
      });
    }
    if (mV) {
      mV.addEventListener('click', () => {
        settings.mirrorV = !settings.mirrorV;
        saveSettings();
        const video = currentVideo || findVideo();
        if (video) applyFilters(video);
        updateMirrorButtons();
      });
    }
    // Auto-tune button
    const autoBtn = root.querySelector('#aive-auto');
    if (autoBtn) {
      autoBtn.addEventListener('click', async () => {
        autoBtn.disabled = true;
        autoBtn.textContent = 'Auto…';
        try {
          await autoTune();
        } catch (e) {
          // suppressed: autoTune failure
        }
        autoBtn.textContent = 'Auto';
        autoBtn.disabled = false;
      });
    }
    // ensure mirror buttons reflect loaded state
    updateMirrorButtons();

    // Disable-on-site button
    const disableBtn = root.querySelector('#aive-disable-site');
    if (disableBtn) {
      disableBtn.addEventListener('click', async () => {
        const host = window.location.hostname;
        try {
          const listRaw = await new Promise((res) => chrome.storage.local.get(['aive-blacklist-v1'], (r) => res(r || {})));
          const list = Array.isArray(listRaw['aive-blacklist-v1']) ? listRaw['aive-blacklist-v1'] : [];
          if (!list.includes(host)) list.push(host);
          await new Promise((res) => chrome.storage.local.set({ 'aive-blacklist-v1': list }, res));
        } catch (e) {
          // suppressed: failed to write blacklist to chrome.storage
        }
        // remove UI after disabling
        try { root.remove(); } catch (e) {}
        // show small toast with enable option
        showEnableToast(host);
      });
    }
  }

  // Auto-tune: sample a frame and set simple brightness/contrast/saturation
  async function autoTune() {
    const video = currentVideo || findVideo();
    if (!video) {
      console.log('AIVE: autoTune - no video');
      return;
    }
    // Create canvas
    const w = Math.min(video.videoWidth || 640, 640);
    const h = Math.min(video.videoHeight || 360, 360);
    if (w <= 0 || h <= 0) {
      console.log('AIVE: autoTune - video has no frame dimensions');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(video, 0, 0, w, h);
    } catch (e) {
      // suppressed: autoTune drawImage failed (possible CORS)
      return;
    }
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      // suppressed: autoTune getImageData failed (possible CORS)
      return;
    }
    // Sample pixels (subsample for speed)
    let rAcc = 0, gAcc = 0, bAcc = 0, lumAcc = 0, count = 0;
    const stride = 4 * 6; // sample every 6th pixel
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i], g = data[i+1], b = data[i+2];
      rAcc += r; gAcc += g; bAcc += b;
      // luminance
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      lumAcc += lum;
      count++;
    }
    const avgR = rAcc / count;
    const avgG = gAcc / count;
    const avgB = bAcc / count;
    const avgLum = lumAcc / count;

    // Derive simple targets
    // Brightness: aim for average luminance ~ 130
    const desiredLum = 130;
    let brightness = settings.brightness;
    brightness = Math.max(0.5, Math.min(2, 1 + (desiredLum - avgLum) / 160));

    // Contrast: infer from luminance spread (rough heuristic)
    // Compute simple variance (approx)
    let varAcc = 0;
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      const d = lum - avgLum;
      varAcc += d * d;
    }
    const variance = varAcc / Math.max(1, count);
    const std = Math.sqrt(variance);
    // target std ~ 60
    let contrast = Math.max(0.6, Math.min(1.6, 60 / (std || 1)));

    // Saturation: measure colorfulness
    let chromaAcc = 0;
    for (let i = 0; i < data.length; i += stride) {
      const r = data[i], g = data[i+1], b = data[i+2];
      const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
      chromaAcc += (mx - mn);
    }
    const avgChroma = chromaAcc / count;
    // map chroma to saturation multiplier (1.0 baseline)
    let saturate = Math.max(0.5, Math.min(2, 1 + (80 - avgChroma) / 160));

    // Hue: leave as-is
    settings.brightness = Number(brightness.toFixed(2));
    settings.contrast = Number(contrast.toFixed(2));
    settings.saturate = Number(saturate.toFixed(2));

    applyFilters(video);
    saveSettings();
    // update UI values if present
    const root = document.getElementById('aive-minimal-root');
    if (root) {
      ['brightness','contrast','saturate','hue','zoom'].forEach(k => {
        const slider = root.querySelector(`.aive-slider[data-key="${k}"]`);
        const display = root.querySelector(`.aive-value[data-key="${k}"]`);
        if (slider) slider.value = settings[k];
        if (display) display.textContent = (settings[k] || 0).toFixed(2);
      });
    }
    console.log('AIVE: autoTune applied', {brightness, contrast, saturate});
  }
  
  function init() {
    console.log('AIVE: init() called');
    loadSettings();
    createUI();
    
    // Try to find and apply to any video on the page
    currentVideo = findVideo();
    if (currentVideo) {
      console.log('AIVE: found video on init');
      applyFilters(currentVideo);
    } else {
      console.log('AIVE: no video found on init');
    }
    
    // Watch for new videos
    const observer = new MutationObserver(() => {
      if (!currentVideo) {
        currentVideo = findVideo();
        if (currentVideo) {
          console.log('AIVE: found video via mutation');
          applyFilters(currentVideo);
        }
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }
  
  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Listen for messages from popup/background
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        if (!msg || !msg.type) return;
        if (msg.type === 'RESET_ALL') {
          settings = { brightness:1, contrast:1, saturate:1, hue:0, zoom:1, mirrorH:false, mirrorV:false };
          saveSettings();
          const video = currentVideo || findVideo();
          if (video) applyFilters(video);
          // update UI
          const root = document.getElementById('aive-minimal-root');
          if (root) {
            const sliders = root.querySelectorAll('.aive-slider');
            sliders.forEach(s => {
              const k = s.getAttribute('data-key');
              if (k && settings[k] !== undefined) {
                s.value = settings[k];
                const disp = root.querySelector(`.aive-value[data-key="${k}"]`);
                if (disp) disp.textContent = settings[k].toFixed(2);
              }
            });
            // update mirror buttons
            const mh = root.querySelector('#aive-mirror-h');
            const mv = root.querySelector('#aive-mirror-v');
            if (mh) mh.classList.toggle('active', !!settings.mirrorH);
            if (mv) mv.classList.toggle('active', !!settings.mirrorV);
          }
        }
        if (msg.type === 'MIRROR_H') {
          settings.mirrorH = true; saveSettings(); const v = currentVideo || findVideo(); if (v) applyFilters(v); const root = document.getElementById('aive-minimal-root'); if (root) root.querySelector('#aive-mirror-h')?.classList.add('active');
        }
        if (msg.type === 'MIRROR_V') {
          settings.mirrorV = true; saveSettings(); const v = currentVideo || findVideo(); if (v) applyFilters(v); const root = document.getElementById('aive-minimal-root'); if (root) root.querySelector('#aive-mirror-v')?.classList.add('active');
        }
        if (msg.type === 'RESET_MIRROR_H') {
          settings.mirrorH = false; saveSettings(); const v = currentVideo || findVideo(); if (v) applyFilters(v); const root = document.getElementById('aive-minimal-root'); if (root) root.querySelector('#aive-mirror-h')?.classList.remove('active');
        }
        if (msg.type === 'RESET_MIRROR_V') {
          settings.mirrorV = false; saveSettings(); const v = currentVideo || findVideo(); if (v) applyFilters(v); const root = document.getElementById('aive-minimal-root'); if (root) root.querySelector('#aive-mirror-v')?.classList.remove('active');
        }
        if (msg.type === 'FORCE_SHOW') {
          // ensure UI exists and is visible
          createUI();
          const root = document.getElementById('aive-minimal-root');
          if (root) root.style.display = '';
        }
      } catch (e) {
        // suppressed: message handler error
      }
    });
  } catch (e) {
    // not fatal in non-extension environments
  }

  // Small toast to re-enable site after disabling
  function showEnableToast(host) {
    try {
      const id = 'aive-enable-toast';
      if (document.getElementById(id)) return;
      const t = document.createElement('div');
      t.id = id;
      t.innerHTML = `${host} — <button id="aive-enable-site" style="margin-left:8px;padding:6px 8px;border-radius:6px;border:none;background:#00ffd5;color:#002;cursor:pointer">Enable</button>`;
      Object.assign(t.style, {
        position: 'fixed', bottom: '18px', left: '20px', zIndex: 2147483647,
        background: 'rgba(10,10,10,0.95)', color: '#dff', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(0,255,255,0.08)'
      });
      document.body.appendChild(t);
      document.getElementById('aive-enable-site').addEventListener('click', async () => {
        try {
          const raw = await new Promise((res) => chrome.storage.local.get(['aive-blacklist-v1'], (r) => res(r || {})));
          const list = Array.isArray(raw['aive-blacklist-v1']) ? raw['aive-blacklist-v1'] : [];
          const idx = list.indexOf(host);
          if (idx >= 0) list.splice(idx, 1);
          await new Promise((res) => chrome.storage.local.set({ 'aive-blacklist-v1': list }, res));
        } catch (e) {
          // suppressed: failed to remove from blacklist
        }
        try { t.remove(); } catch (e) {}
        // re-create UI immediately
        createUI();
      });
      setTimeout(() => { try { t.remove(); } catch {} }, 12000);
    } catch (e) {}
  }
})();
