# All-in-One Video Enhancer (AIVE)

A floating, on-page control panel for **any HTML5 video**. Tweak the picture with CSS filters (brightness/contrast/saturation/**hue**/sepia), zoom in, flip horizontally, and use **Auto** to smart-tune.

## Features

- On-page floating panel with sliders for:
  - Brightness
  - Contrast
  - Saturation
  - **Hue (0–360° wrap, 0.5° steps)**
  - Sepia
  - Zoom
- Layout / behavior controls:
  - **Anchor** the panel to the **Top** or **Bottom** of the viewport
  - **Pin** to keep the panel expanded (otherwise it can auto-collapse)
  - Tune auto-collapse feel with **Animation Speed**, **Blind Weight**, and **Collapse Delay**
- One-click actions:
  - **Auto**: samples the current video frame (when allowed) and adjusts the picture
  - **Reset**: returns sliders to defaults
  - **Flip Horizontal**: mirror the video
- Built-in help:
  - Blue **?** opens a centered help dialog with quick, readable tips
- Per-site blacklist:
  - Disable AIVE on sites where you never want it running

### Notes on Auto

Some videos can’t be sampled due to browser security rules (cross-origin / DRM). If sampling is blocked, Auto will fall back gracefully (it won’t crash the page).

## Keyboard Shortcuts

- **Alt+Shift+B** — Open the **Blacklist Manager** (also configurable at `chrome://extensions/shortcuts`)

## Install (Chrome/Edge)

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `all-in-one-video-enhancer` folder.
4. (Optional) Pin the AIVE extension icon to your toolbar.

## Usage

### Basic

1. Open a page with an HTML5 `<video>` element.
2. AIVE injects automatically (unless the site is blacklisted).
3. Use the on-page panel to adjust the picture.

### Panel (on-page UI)

- Use sliders to adjust **brightness**, **contrast**, **saturation**, **hue**, **sepia**, and **zoom**.
- Use **Anchor** to stick the panel to the top/bottom of your viewport.
- Use **Flip** to mirror the video horizontally.
- Click **Auto** to smart-tune the image.
- Click **Reset** to return everything to defaults.
- Drag the **AIVE** header to move the panel.
- Use the **📌 pin** to keep the panel expanded (otherwise it may collapse when idle).
- Click the blue **?** for the built-in help dialog.

### Blacklist Manager

- Press **Alt+Shift+B** to open the blacklist dialog.
- Add or remove domains to control where AIVE runs.

## What AIVE Stores

AIVE uses `chrome.storage.local` for a few small settings:

- `aive_blacklist` — array of hostnames where AIVE is disabled
- `aive_pos_<hostname>` — saved panel position for that site
- `aive_anchor_mode` — your preferred anchor mode (top/bottom)

## Permissions

- `storage` — save blacklist + panel position/anchor
- `activeTab` — talk to the currently active tab when you use the shortcut
- `scripting` — allows MV3 scripts to interact as needed
- `host_permissions: ["<all_urls>"]` — lets the content script run on pages with videos

## Implementation Notes

AIVE applies effects via CSS:

- `filter:` brightness/contrast/saturate/**hue-rotate**/sepia
- `transform:` scale (zoom) + optional horizontal flip

## Branding (BamaBraves)

Icons live in `icons/` and are referenced by `manifest.json`.
