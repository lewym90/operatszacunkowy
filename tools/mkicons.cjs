const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'); const svg = fs.readFileSync(__dirname + '/icon.svg', 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (size, scale, out) => {
    // scale<1: motyw zmniejszony do bezpiecznej strefy (maskable)
    const s = scale === 1 ? svg : svg.replace('<g id="art" transform-origin="256 256">', `<g id="art" transform="translate(256 256) scale(${scale}) translate(-256 -256)">`);
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<body style="margin:0;background:#0B0B0D">${s.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
    await p.screenshot({ path: __dirname + '/../icons/' + out, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await shot(512, 1, 'icon-512.png'); await shot(192, 1, 'icon-192.png'); await shot(180, 1, 'apple-touch-icon.png');
  await shot(512, 0.78, 'icon-maskable-512.png');
  await b.close();
})();
