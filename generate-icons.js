/**
 * Generates app icon PNGs from the TennCoach tennis ball SVG.
 * Run: node generate-icons.js
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

// The same design as tennis-match/public/favicon.svg, sized for rendering
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <circle cx="32" cy="32" r="30" fill="#ccdd44" stroke="#aabb22" stroke-width="1.5"/>
  <path d="M18 8 Q2 24 2 32 Q2 44 14 54" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <path d="M46 8 Q62 24 62 32 Q62 44 50 54" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
</svg>`;

function generate(size, filename) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const rendered = resvg.render();
  const pngBuffer = rendered.asPng();
  const outPath = path.join(__dirname, 'assets', filename);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`✓ ${filename}  (${size}x${size}px)`);
}

generate(1024, 'icon.png');
generate(1024, 'adaptive-icon.png');
generate(1024, 'splash-icon.png');
generate(48,   'favicon.png');

console.log('\nAll icons written to assets/');
