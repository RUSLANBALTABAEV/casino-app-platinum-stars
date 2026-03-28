import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const lottieDir = path.join(projectRoot, 'public', 'lottie', 'treasure-box');
const jsonPath = path.join(lottieDir, 'treasure-box.json');
const imagesDir = path.join(lottieDir, 'images');

function isDataPng(value) {
  return typeof value === 'string' && value.startsWith('data:image/png;base64,');
}

function decodeDataPng(dataUrl) {
  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  return Buffer.from(base64, 'base64');
}

if (!fs.existsSync(jsonPath)) {
  console.error(`Missing Lottie JSON: ${jsonPath}`);
  process.exit(1);
}

fs.mkdirSync(imagesDir, { recursive: true });

const raw = fs.readFileSync(jsonPath, 'utf8');
const data = JSON.parse(raw);

const assets = Array.isArray(data.assets) ? data.assets : [];
let extracted = 0;

for (const asset of assets) {
  if (!asset || typeof asset !== 'object') continue;
  if (!('p' in asset)) continue;
  if (!isDataPng(asset.p)) continue;

  const fileName = `img_${extracted}.png`;
  const outPath = path.join(imagesDir, fileName);
  fs.writeFileSync(outPath, decodeDataPng(asset.p));

  asset.p = fileName;
  asset.u = 'images/';
  extracted += 1;
}

// Also set global images base (some exporters rely on this)
if (extracted > 0) {
  data.u = 'images/';
}

fs.writeFileSync(jsonPath, JSON.stringify(data));

console.log(`Optimized treasure-box Lottie: extracted ${extracted} PNG(s) to ${path.relative(projectRoot, imagesDir)}`);

