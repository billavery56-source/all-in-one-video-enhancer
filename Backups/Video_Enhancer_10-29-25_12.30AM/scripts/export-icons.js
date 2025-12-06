// Export PNG icons in common sizes from the SVG master using Sharp
// Usage: npm run build:icons
// Requires: npm i --save-dev sharp

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const root = __dirname ? path.resolve(__dirname, '..') : process.cwd();
const iconsDir = path.join(root, 'icons');
const inputSvg = path.join(iconsDir, 'bamabraves-logo.svg');
const sizes = [16, 32, 48, 128, 256, 512];

async function run() {
  if (!fs.existsSync(inputSvg)) {
    console.error(`Missing SVG: ${inputSvg}`);
    process.exit(1);
  }
  for (const size of sizes) {
    const out = path.join(iconsDir, `brand-${size}.png`);
    console.log(`→ Rendering ${size}x${size} -> ${path.relative(root, out)}`);
    await sharp(inputSvg)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
  }
  console.log('Done. You can update manifest.json icons to point at icons/brand-*.png when ready.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
