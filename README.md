# All-in-One Video Enhancer (AIVE)

AIVE adds a floating, on-page control panel for HTML5 video. Use it to tune picture quality, reduce harsh glare, zoom into detail, flip video horizontally, and quickly disable the tool on sites where you do not want it running.

## Features

- Picture sliders:
  - Brightness
  - Contrast
  - Saturation
  - Depth, for washed-out videos with lifted blacks
  - Glare, for overexposed videos with blown highlights
  - Hue
  - Sepia
  - Sharpen
  - Zoom
- Quick Zoom: hold `Z` and use the mouse wheel, left-click to zoom in, Shift+left-click or right-click to zoom out, or drag over the video/player.
- Auto tune: applies a balanced starter setting, including a light depth boost.
- Save as default: stores the current slider values for future pages.
- Target video controls for pages with more than one player.
- Per-site disabled list and blacklist manager.
- Panel docking, pinning, dragging, and auto-collapse.

## Why Depth Exists

Some videos look washed out because the dark parts of the image are lifted toward gray. Saturation does not fix that because it only changes color intensity. AIVE's Depth slider combines a subtle brightness reduction with extra contrast to restore darker shadows and make the picture feel less flat.

## Why Glare Exists

Some videos are overexposed, especially in bright outdoor backgrounds. In those cases, the image is not just flat; the highlights are too hot. AIVE's Glare slider lowers brightness, softens contrast, and slightly calms saturation so harsh white/yellow areas are easier to look at.

## Keyboard Shortcuts

- `Alt+Shift+B`: open the AIVE Lists dialog. This can also be changed at `chrome://extensions/shortcuts`.

## Firefox and Android Notes

AIVE includes a Firefox package path for testing. Build it with:

```powershell
.\tools\package-firefox.ps1
```

The Firefox package uses `manifest.firefox.json`, which adds Firefox-specific settings and opts into Firefox for Android availability metadata. Desktop Firefox is the first compatibility target.

Firefox for Android is experimental for AIVE. The extension's core video filters are content-script based and may work, but some controls are desktop-first:

- `Z` + click, Shift+click, right-click, mouse wheel, and hover behavior depend on desktop input.
- Phone use will need larger touch controls for quick zoom and panel handling.
- Some Firefox for Android extension APIs may differ from desktop Firefox.

For Android testing, start with the Firefox package, then install or load it in Firefox for Android and verify basic slider controls before relying on quick-zoom gestures.

## What AIVE Stores

AIVE uses the browser's local extension storage for local settings only:

- slider defaults
- panel position, open state, pin state, and dock side
- disabled-site and blacklist hostnames

These settings stay in the browser's local extension storage.

## Permissions

- `storage`: saves local settings.
- `activeTab`: lets the extension command message the active tab.
- `host_permissions: ["<all_urls>"]`: lets AIVE find and enhance videos on pages you visit.

## Implementation Notes

AIVE applies effects with CSS filters and transforms:

- `filter`: brightness, contrast, saturate, hue-rotate, sepia, and a sharpen-style contrast/drop-shadow boost
- `transform`: zoom and optional horizontal flip
