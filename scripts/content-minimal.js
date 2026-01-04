(() => {
  console.log("AIVE help icon added");

  let panel, video, help;
  let fadeTimer = null;

  const defaults = {
    b: 1, c: 1, s: 1, h: 0, sp: 0, z: 1, px: 0, py: 0
  };

  function findVideo() {
    return document.querySelector("video");
  }

  /* ---------------- PANEL ---------------- */
  function createPanel() {
    if (panel) return;

    panel = document.createElement("div");
    panel.id = "aive-panel";
    panel.style.cssText = `
      position: fixed;
      left: 12px;
      bottom: 12px;
      width: 300px;
      background: #111;
      color: #fff;
      padding: 12px;
      border-radius: 12px;
      z-index: 2147483647;
      font-family: system-ui;
      box-shadow: 0 10px 30px rgba(0,0,0,.6);
      user-select: none;
      opacity: 1;
      transition: opacity 0.35s ease;
    `;

    panel.innerHTML = `
      <div id="hdr"
        style="display:flex;justify-content:space-between;
               align-items:center;font-weight:700;margin-bottom:8px">
        <span style="cursor:move">AIVE</span>
        <button id="helpBtn"
          title="Help"
          style="
            background:none;
            border:none;
            color:#4da3ff;
            font-size:16px;
            cursor:pointer;
            padding:2px 6px;
          ">?</button>
      </div>

      ${slider("Brightness","b",0.5,2,0.05,1)}
      ${slider("Contrast","c",0.5,2,0.05,1)}
      ${slider("Saturate","s",0,3,0.1,1)}
      ${slider("Hue","h",0,360,1,0)}
      ${slider("Sepia","sp",0,1,0.05,0)}

      <hr style="opacity:.2">

      ${slider("Zoom","z",1,3,0.05,1)}
      ${slider("Pan X","px",-50,50,1,0)}
      ${slider("Pan Y","py",-50,50,1,0)}

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px">
        <button data-preset="tl">↖</button>
        <button data-preset="c">●</button>
        <button data-preset="tr">↗</button>
        <button data-preset="bl">↙</button>
        <button data-preset="br">↘</button>
        <button id="reset">Reset</button>
      </div>

      <button id="auto"
        style="margin-top:6px;width:100%;padding:8px;border:none;
               border-radius:8px;background:#00ffd5;color:#002;
               font-weight:700;cursor:pointer">
        Auto
      </button>
    `;

    document.body.appendChild(panel);

    panel.querySelectorAll("input").forEach(i =>
      i.addEventListener("input", applyFilters)
    );

    panel.querySelector("#auto").onclick = autoTune;
    panel.querySelector("#reset").onclick = resetAll;
    panel.querySelector("#helpBtn").onclick = showHelp;

    panel.querySelectorAll("button[data-preset]").forEach(btn => {
      btn.onclick = () => applyPreset(btn.dataset.preset);
      btn.style.cssText = presetBtnStyle();
    });

    panel.querySelector("#reset").style.cssText = presetBtnStyle();

    enableDrag();
    enableFade();
  }

  function slider(label,id,min,max,step,value) {
    return `
      <div style="margin-bottom:8px">
        <label style="font-size:12px;color:#e0c870">
          ${label}
          <span id="v-${id}" style="float:right">${value}</span>
        </label>
        <input id="${id}" type="range"
          min="${min}" max="${max}" step="${step}" value="${value}"
          style="width:100%">
      </div>`;
  }

  function presetBtnStyle() {
    return `
      padding:6px;border:none;border-radius:6px;
      background:#2c3e50;color:#fff;
      font-weight:700;cursor:pointer`;
  }

  function val(id) {
    const v = panel.querySelector(`#${id}`).value;
    panel.querySelector(`#v-${id}`).textContent = v;
    return Number(v);
  }

  function applyFilters() {
    if (!video) return;

    video.style.filter =
      `brightness(${val("b")}) contrast(${val("c")}) saturate(${val("s")})
       hue-rotate(${val("h")}deg) sepia(${val("sp")})`;

    video.style.transform =
      `translate(${val("px")}px, ${val("py")}px) scale(${val("z")})`;
  }

  function autoTune() {
    set("b",1.05); set("c",1.1); set("s",1.1);
    set("h",0); set("sp",0);
    applyFilters();
  }

  function resetAll() {
    Object.entries(defaults).forEach(([k,v]) => set(k,v));
    applyFilters();
  }

  function set(id,val) {
    panel.querySelector(`#${id}`).value = val;
    panel.querySelector(`#v-${id}`).textContent = val;
  }

  function applyPreset(p) {
    const a = 40;
    if (p==="c") setPan(0,0);
    if (p==="tl") setPan(a,a);
    if (p==="tr") setPan(-a,a);
    if (p==="bl") setPan(a,-a);
    if (p==="br") setPan(-a,-a);
    applyFilters();
  }

  function setPan(x,y) {
    set("px",x); set("py",y);
  }

  /* ---------------- HELP ---------------- */
  function showHelp() {
    if (help) return;

    help = document.createElement("div");
    help.style.cssText = `
      position:fixed;inset:0;
      background:rgba(0,0,0,.7);
      z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:system-ui;
    `;

    help.innerHTML = `
      <div style="
        width:460px;max-width:90%;
        background:#111;color:#fff;
        border-radius:14px;padding:20px;
        box-shadow:0 20px 60px rgba(0,0,0,.8);
      ">
        <h2 style="margin-top:0;color:#4da3ff">AIVE Help</h2>

        <p><b>Pin AIVE</b>: Click the Extensions icon and pin AIVE for quick access.</p>

        <p><b>Sliders</b>: Adjust video color and appearance in real time.</p>

        <p><b>Zoom & Pan</b>: Zoom enlarges the video. Pan X/Y moves the zoomed area.</p>

        <p><b>Presets</b>: Jump to corners or center instantly.</p>

        <p><b>Auto</b>: Applies a balanced enhancement.</p>
        <p><b>Reset</b>: Restores default settings.</p>

        <button id="closeHelp"
          style="margin-top:14px;width:100%;
                 padding:10px;border:none;
                 border-radius:10px;
                 background:#00ffd5;color:#002;
                 font-weight:700;cursor:pointer">
          Close
        </button>
      </div>
    `;

    document.body.appendChild(help);

    help.onclick = e => { if (e.target === help) closeHelp(); };
    document.addEventListener("keydown", escHelp);
    help.querySelector("#closeHelp").onclick = closeHelp;
  }

  function closeHelp() {
    help.remove();
    help = null;
    document.removeEventListener("keydown", escHelp);
  }

  function escHelp(e) {
    if (e.key === "Escape") closeHelp();
  }

  /* ---------------- FADE / DRAG ---------------- */
  function enableFade() {
    panel.addEventListener("mouseenter", () => {
      clearTimeout(fadeTimer);
      panel.style.opacity = "1";
    });
    panel.addEventListener("mouseleave", () => {
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => panel.style.opacity = "0.18", 1200);
    });
  }

  function enableDrag() {
    const hdr = panel.querySelector("#hdr");
    let drag=false,sx=0,sy=0;

    hdr.onmousedown = e => {
      drag=true;
      sx=e.clientX-panel.offsetLeft;
      sy=e.clientY-panel.offsetTop;
      e.preventDefault();
    };
    document.onmousemove = e => {
      if (!drag) return;
      panel.style.left=e.clientX-sx+"px";
      panel.style.top=e.clientY-sy+"px";
      panel.style.bottom="auto";
    };
    document.onmouseup = () => drag=false;
  }

  /* ---------------- INIT ---------------- */
  function init() {
    video = findVideo();
    if (!video) return;
    createPanel();
    applyFilters();
  }

  init();
})();
