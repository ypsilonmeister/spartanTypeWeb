const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgPath = path.join(__dirname, '../public/favicon.svg');
const publicDir = path.join(__dirname, '../public');

const targets = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 }
];

async function generate() {
  if (!fs.existsSync(svgPath)) {
    console.error(`SVG not found at: ${svgPath}`);
    process.exit(1);
  }

  console.log(`Generating PNGs from ${svgPath}...`);
  for (const target of targets) {
    const destPath = path.join(publicDir, target.name);
    await sharp(svgPath)
      .resize(target.size, target.size)
      .png()
      .toFile(destPath);
    console.log(`Created: ${target.name} (${target.size}x${target.size})`);
  }
  console.log('All icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
