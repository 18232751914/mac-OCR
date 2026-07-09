#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp, ResizeStrategy } from 'jimp';
import potrace from 'potrace';
import pngToIco from 'png-to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'public', 'Starterkit-Logo.png');
const outputDir = path.join(projectRoot, 'public', 'img', 'favicon');
const icoSizes = [16, 32, 48, 64, 128, 256];

const targets = [
  { name: '16x16.png', width: 16, height: 16 },
  { name: '32x32.png', width: 32, height: 32 },
  { name: '180x180.png', width: 180, height: 180 },
  { name: '192x192.png', width: 192, height: 192 },
  { name: '512x512.png', width: 512, height: 512 },
  { name: 'mstile-70x70.png', width: 70, height: 70 },
  { name: 'mstile-144x144.png', width: 144, height: 144 },
  { name: 'mstile-150x150.png', width: 150, height: 150 },
  { name: 'mstile-310x310.png', width: 310, height: 310 },
  { name: 'mstile-350x150.png', width: 350, height: 150 },
];

const fitWithin = (srcW, srcH, maxW, maxH) => {
  const scale = Math.min(maxW / srcW, maxH / srcH);
  return [Math.round(srcW * scale), Math.round(srcH * scale)];
};

const traceSvg = (input, params) =>
  new Promise((resolve, reject) => {
    potrace.trace(input, params, (error, svg) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(svg);
    });
  });

const renderCanvas = (base, srcW, srcH, width, height) => {
  const [targetW, targetH] = fitWithin(srcW, srcH, width, height);
  const canvas = new Jimp({ width, height, color: 0x00000000 });
  const resized = base
    .clone()
    .resize({ w: targetW, h: targetH, mode: ResizeStrategy.BICUBIC });
  const x = Math.floor((width - targetW) / 2);
  const y = Math.floor((height - targetH) / 2);
  canvas.composite(resized, x, y);
  return canvas;
};

const writePngTargets = async () => {
  const base = await Jimp.read(sourcePath);
  const { width: srcW, height: srcH } = base.bitmap;

  await mkdir(outputDir, { recursive: true });

  for (const { name, width, height } of targets) {
    const canvas = renderCanvas(base, srcW, srcH, width, height);
    const buffer = await canvas.getBuffer('image/png');
    await writeFile(path.join(outputDir, name), buffer);
    console.log(`wrote ${name} (${width}x${height})`);
  }

  return base;
};

const writeFaviconIco = async (base) => {
  const { width: srcW, height: srcH } = base.bitmap;
  const buffers = [];

  for (const size of icoSizes) {
    const canvas = renderCanvas(base, srcW, srcH, size, size);
    buffers.push(await canvas.getBuffer('image/png'));
  }

  const icoBuffer = await pngToIco(buffers);
  const outputPath = path.join(projectRoot, 'public', 'favicon.ico');
  await writeFile(outputPath, icoBuffer);
  console.log('wrote favicon.ico (multi-size)');
};

const writePinnedTab = async () => {
  const svg = await traceSvg(sourcePath, {
    threshold: 128,
    color: '#000000',
    background: '#ffffff',
  });

  const outputPath = path.join(outputDir, 'safari-pinned-tab.svg');
  await writeFile(outputPath, svg);
  console.log('wrote safari-pinned-tab.svg (vector trace)');
};

const run = async () => {
  console.log('Generating favicons from', path.relative(projectRoot, sourcePath));

  const base = await writePngTargets();
  await writeFaviconIco(base);
  await writePinnedTab();

  console.log('Done. Assets written to', path.relative(projectRoot, outputDir));
};

run().catch((error) => {
  console.error('Favicon generation failed:', error);
  process.exitCode = 1;
});
