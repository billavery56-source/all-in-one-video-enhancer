# All-in-One Video Enhancer (AIVE)

Overlay controls for any HTML5 video: filters, zoom, mirroring, reset, hotkeys, auto-fade, and a per-site blacklist.

## Features
- On-page floating panel with sliders for brightness, contrast, saturation, hue, sepia, grayscale, invert, blur
- Gamma and sharpness via SVG filter
- Zoom and mirror (H/V)
- Auto-fade of panel when idle (configurable)
- Per-site blacklist (built-in: yahoo.com) with UI to edit
- Keyboard shortcuts while interacting with the panel:
  - V: Toggle panel visibility
  - H: Toggle horizontal mirror
  - V: Toggle vertical mirror
  - R: Reset all
  - Alt+Shift+S: Temporarily disable/enable AIVE on the current tab (sleep mode)

## Install (Chrome/Edge)
1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select this folder.
4. Pin the extension to your toolbar for quick access.

## Usage
- Open any page with a HTML5 `<video>` element. The panel will appear automatically.
- Click the "Video Enhancer" toggle button if hidden.
- Use the Popup (toolbar icon) to quickly reset everything.
- In the panel:
  - Use "Disable here" to add the current site to the blacklist.
  - "Manage blacklist" lets you edit the domain list.

## Permissions
- `storage`: Save settings and blacklist.
- `tabs`: Allow the popup to send messages to the active tab.
- `host_permissions: <all_urls>`: Inject the content script wherever a video might exist.

## Notes
- Manifest V3.
- Content script: `scripts/content.js`
- Styles injected to pages: `styles/aive/*.css`
- Popup UI: `popup.html` + `scripts/popup.js`
- Icons in `icons/`

If you have issues loading, check the extension's details page for any manifest or script errors and share them.

## Branding (BamaBraves)

This repo now includes a reusable brand mark you can use across all your extensions:

- Master SVG: `icons/bamabraves-logo.svg` (gradient rounded-square, BB monogram, sparkle)
- Monochrome SVG: `icons/bamabraves-logo-mono.svg` (transparent background, solid glyph)

To export PNG sizes commonly used by Chrome extensions and the Web Store:

1. Install the dev dependency (Sharp):
   - Windows PowerShell
     - Optional: ensure Node.js LTS is installed.
   - Then run:
     - `npm install`
2. Generate PNGs into `icons/`:
   - `npm run build:icons`

This will create `icons/brand-16.png`, `brand-32.png`, `brand-48.png`, `brand-128.png`, `brand-256.png`, and `brand-512.png`.

When you're ready, update `manifest.json` to point to the new PNGs:

```jsonc
{
  "icons": {
    "16": "icons/brand-16.png",
    "32": "icons/brand-32.png",
    "48": "icons/brand-48.png",
    "128": "icons/brand-128.png"
  }
}
```

Tip: The `512` size is useful for the Chrome Web Store listing image. You can also export larger sizes (e.g., 1024) by tweaking `scripts/export-icons.js`.

