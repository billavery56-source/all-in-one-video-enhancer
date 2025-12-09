# All-in-One Video Enhancer (AIVE)

Overlay controls for any HTML5 video: filters, zoom, mirroring, auto-tune, reset, hotkeys, sleep mode, and a per-site blacklist.

## Features

- On-page floating panel with sliders for:
  - Brightness
  - Contrast
  - Saturation
  - Hue
  - Sepia
  - Zoom
- Mirroring:
  - Horizontal (H)
  - Vertical (V)
- Auto-tune:
  - Samples the current frame and adjusts brightness/contrast/saturation.
- Reset:
  - Returns all sliders to defaults.
- Auto-fade:
  - Panel gently hides when idle and reappears when you move near it.
- Draggable panel:
  - Grab the **AIVE** title and move the panel anywhere on screen.
- Built-in help:
  - Blue **?** icon on the panel opens a centered help dialog explaining pinning, panel controls, and toolbar actions.
- Per-site blacklist:
  - Uses `aive-blacklist-v1` in `chrome.storage.local`.
  - “Disable on site” button in the panel adds the current host.
  - A small toast on the page lets you re-enable the site.
- Sleep mode (per tab):
  - Temporarily disable/enable AIVE on the current tab (video styles are cleared).

### Safety / Streaming

AIVE never runs on major streaming services (for safety and to avoid layout weirdness):

- `netflix.com`, `nflxvideo.net`
- `primevideo.com`, `amazonvideo.com`
- `disneyplus.com`
- `hulu.com`
- `max.com`, `hbomax.com`
- `paramountplus.com`
- `peacocktv.com`
- `starz.com`
- `showtime.com`
- `crunchyroll.com`

These hosts are hard-blocked in the content script and AIVE bails out immediately.

## Keyboard Shortcuts

Configured in `manifest.json`:

- **Alt+Shift+V** – Inject/activate Video Enhancer in the current tab
- **Alt+Shift+R** – Reset all AIVE settings on the current tab
- **Alt+Shift+S** – Toggle sleep mode on the current tab (temporarily disable/enable AIVE)

> Note: The old single-key panel shortcuts (V/H/R, etc.) are not used in this minimal version.

## Install (Chrome/Edge)

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Click the puzzle-piece (Extensions) icon and **pin** “All-in-One Video Enhancer (AIVE)” so the toolbar button is always visible.

## Usage

### Basic

1. Open a page with an HTML5 `<video>` element (e.g. a YouTube watch page).
2. AIVE will inject automatically on navigation.
3. If needed, use:
   - The **toolbar popup** (AIVE icon) to pause/sleep or change site blacklist.
   - The **Alt+Shift+V** shortcut to force-inject on the active tab.

### Panel (on-page UI)

- Use the sliders to adjust **brightness**, **contrast**, **saturation**, **hue**, and **zoom**.
- Use **H** and **V** buttons to mirror horizontally / vertically.
- Click **Auto** to let AIVE smart-tune the picture.
- Click **Reset** to return all sliders to defaults.
- Click and drag the **AIVE** title to move the panel around.
- The panel auto-hides when idle and reappears when your mouse moves near it.
- Click the blue **?** icon on the panel to open a large, centered help dialog with readable text.

### Site Controls (toolbar popup)

From `popup.html` / `popup.js`:

- **Pause AIVE on this tab**  
  Toggles sleep mode on the current tab (clears/restores video filters and transforms).
- **Disable AIVE on this site**  
  Adds the current host to the `aive-blacklist-v1` list and prevents auto-injection.
- **Enable AIVE on this site**  
  Removes the current host from the blacklist so AIVE can run again.

### “Disable on site” (panel button)

- The **“Disable on site”** button in the panel:
  - Adds the current host to `aive-blacklist-v1`.
  - Removes the on-page UI.
  - Shows a small toast with an **Enable** button to quickly remove the site from the blacklist.

## Permissions

- `storage`: Save settings and blacklist.
- `tabs`: Allow the popup and background script to talk to the active tab.
- `scripting`: Inject CSS/JS into the active tab.
- `activeTab`: Shortcuts / context menu injection.
- `webNavigation`: Auto-inject after navigation.
- `host_permissions: ["<all_urls>"]`: Allow AIVE to run anywhere a video might exist (with built-in streaming exceptions).

## Implementation Notes

- Manifest: **V3**
- Content script: `scripts/content-minimal.js`
- Styles injected to pages: `styles/aive/minimal.css`
- Background service worker: `scripts/background.js`
- Popup UI: `popup.html` + `scripts/popup.js`
- Icons in `icons/`

If something fails to load, open the extension’s **Details → Inspect views** (service worker / popup / content script) and check the console for errors.

## Branding (BamaBraves)

This repo includes a reusable brand mark you can use across all your extensions:

- Master SVG: `icons/bamabraves-logo.svg` (gradient rounded-square, BB monogram, sparkle)
- Monochrome SVG: `icons/bamabraves-logo-mono.svg` (transparent background, solid glyph)

To export PNG sizes commonly used by Chrome extensions and the Web Store:

1. Make sure Node.js LTS is installed.
2. In the project folder, run:
   - `npm install`
   - `npm run build:icons`

This will create:

- `icons/brand-16.png`
- `icons/brand-32.png`
- `icons/brand-48.png`
- `icons/brand-128.png`
- `icons/brand-256.png`
- `icons/brand-512.png`

The manifest is already set up to use these:

```jsonc
{
  "icons": {
    "16": "icons/brand-16.png",
    "32": "icons/brand-32.png",
    "48": "icons/brand-48.png",
    "128": "icons/brand-128.png",
    "256": "icons/brand-256.png",
    "512": "icons/brand-512.png"
  }
}
