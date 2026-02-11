/**
 * generate-icons.mjs
 *
 * Converts resources/icon.svg → PNG (1024x1024), ICO (Windows), ICNS (macOS).
 *
 * Usage:  node scripts/generate-icons.mjs
 * Deps:   npm i -D sharp png-to-ico png2icons
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import png2icons from 'png2icons';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const resources = join(root, 'resources');

const svgPath = join(resources, 'icon.svg');
const pngPath = join(resources, 'icon.png');
const icoPath = join(resources, 'icon.ico');
const icnsPath = join(resources, 'icon.icns');

async function main() {
  console.log('Reading SVG…');
  const svgBuffer = readFileSync(svgPath);

  // SVG → PNG 1024x1024
  console.log('Generating PNG (1024×1024)…');
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(pngPath);
  console.log(`  ✓ ${pngPath}`);

  const pngBuffer = readFileSync(pngPath);

  // PNG → ICO (multi-size: 16, 32, 48, 64, 128, 256)
  console.log('Generating ICO…');
  const icoBuffer = await pngToIco([pngBuffer]);
  writeFileSync(icoPath, icoBuffer);
  console.log(`  ✓ ${icoPath}`);

  // PNG → ICNS
  console.log('Generating ICNS…');
  const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BICUBIC2, 0);
  if (!icnsBuffer) {
    throw new Error('Failed to generate ICNS');
  }
  writeFileSync(icnsPath, icnsBuffer);
  console.log(`  ✓ ${icnsPath}`);

  console.log('\nAll icons generated successfully!');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
