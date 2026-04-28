#!/usr/bin/env node
/**
 * Generates PWA icons (icon-192.png, icon-512.png) into public/icons/
 * using only Node built-ins (zlib, fs) — no external image libs.
 *
 * Renders a rounded-square gradient with "C$" text approximated
 * via pixel stamps. Designed to satisfy Chrome's PWA installability
 * criteria (any & maskable purpose).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(size, drawPixel) {
  // RGBA buffer
  const channels = 4;
  const stride = size * channels;
  const raw = Buffer.alloc(size * (stride + 1));

  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size);
      const off = y * (stride + 1) + 1 + x * channels;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = a;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // color type RGBA
  ihdr[10] = 0;    // compression
  ihdr[11] = 0;    // filter
  ihdr[12] = 0;    // interlace
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// brand-500 -> brand-700 gradient
const C1 = [0x2f, 0x95, 0xff];
const C2 = [0x15, 0x5f, 0xdc];

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255];
}

// 5x7 pixel font for "C$"
const GLYPHS = {
  C: [
    '01110',
    '10001',
    '10000',
    '10000',
    '10000',
    '10001',
    '01110'
  ],
  $: [
    '00100',
    '01111',
    '10100',
    '01110',
    '00101',
    '11110',
    '00100'
  ]
};

function drawGlyphMask(letter, size) {
  const rows = GLYPHS[letter];
  const cols = rows[0].length;
  const mask = new Uint8Array(size * size);
  // place glyph centered, scaled
  const pixel = Math.floor(size / 14); // each glyph dot ~ pixel x pixel
  const totalW = cols * pixel;
  const totalH = rows.length * pixel;
  const startX = Math.floor((size - totalW) / 2);
  const startY = Math.floor((size - totalH) / 2);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (rows[r][c] !== '1') continue;
      for (let py = 0; py < pixel; py++) {
        for (let px = 0; px < pixel; px++) {
          const x = startX + c * pixel + px;
          const y = startY + r * pixel + py;
          if (x >= 0 && y >= 0 && x < size && y < size) mask[y * size + x] = 1;
        }
      }
    }
  }
  return mask;
}

function drawCenteredCS(size) {
  // We render a single combined glyph: "C$" by placing C left, $ right
  const mask = new Uint8Array(size * size);
  const cMask = drawGlyphMask('C', size);
  const dMask = drawGlyphMask('$', size);
  // Shift them apart
  const shift = Math.floor(size * 0.10);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xc = x + shift;
      const xd = x - shift;
      if (xc >= 0 && xc < size && cMask[y * size + xc]) mask[y * size + x] = 1;
      if (xd >= 0 && xd < size && dMask[y * size + xd]) mask[y * size + x] = 1;
    }
  }
  return mask;
}

function inSafeRound(x, y, size, radiusFrac = 0.18) {
  const r = size * radiusFrac;
  const rx = x < r ? r - x : (x > size - r ? x - (size - r) : 0);
  const ry = y < r ? r - y : (y > size - r ? y - (size - r) : 0);
  return rx * rx + ry * ry <= r * r;
}

function generate(size, outPath) {
  const glyph = drawCenteredCS(size);
  const png = makePng(size, (x, y) => {
    if (!inSafeRound(x, y, size)) return [0, 0, 0, 0];
    const t = (x + y) / (2 * size); // diagonal gradient
    const bg = mix(C1, C2, t);
    if (glyph[y * size + x]) return [255, 255, 255, 255];
    return bg;
  });
  fs.writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${png.length} bytes)`);
}

const outDir = path.resolve(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
generate(192, path.join(outDir, 'icon-192.png'));
generate(512, path.join(outDir, 'icon-512.png'));
generate(180, path.join(outDir, 'icon-180.png')); // apple-touch-icon
