/**
 * Generates the source app icon as a PNG with no image dependencies.
 *
 * Picta's mark is intentionally plain: a dark rounded square with a light frame
 * and a small horizon inside it. Branding is not a v1 concern.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 1024;
const BG = [24, 26, 30, 255];
const FG = [236, 238, 242, 255];

const px = new Uint8Array(SIZE * SIZE * 4);

const roundedRect = (x, y, w, h, r) => (px_, py) => {
  const cx = Math.min(Math.max(px_, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px_ - cx;
  const dy = py - cy;
  return px_ >= x && px_ <= x + w && py >= y && py <= y + h && dx * dx + dy * dy <= r * r + 0.5;
};

const outer = roundedRect(64, 64, 896, 896, 190);
const frameOuter = roundedRect(240, 268, 544, 488, 48);
const frameInner = roundedRect(288, 316, 448, 392, 24);

function set(i, color, coverage) {
  for (let c = 0; c < 3; c += 1) {
    px[i + c] = Math.round(px[i + c] * (1 - coverage) + color[c] * coverage);
  }
  px[i + 3] = Math.round(px[i + 3] * (1 - coverage) + color[3] * coverage);
}

// 3x3 supersampling keeps the curves clean without any drawing library.
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const i = (y * SIZE + x) * 4;
    let bg = 0;
    let frame = 0;
    for (let sy = 0; sy < 3; sy += 1) {
      for (let sx = 0; sx < 3; sx += 1) {
        const fx = x + (sx + 0.5) / 3;
        const fy = y + (sy + 0.5) / 3;
        if (outer(fx, fy)) bg += 1;
        if (frameOuter(fx, fy) && !frameInner(fx, fy)) frame += 1;
        // A horizon line and a sun: enough to read as "a picture" at 16px.
        else if (frameInner(fx, fy)) {
          const horizon = fy > 600 ? 1 : 0;
          const dx = fx - 400;
          const dy = fy - 430;
          const sun = dx * dx + dy * dy <= 62 * 62 ? 1 : 0;
          if (horizon || sun) frame += 1;
        }
      }
    }
    if (bg > 0) set(i, BG, bg / 9);
    if (frame > 0) set(i, FG, frame / 9);
  }
}

// --- minimal PNG encoder ---------------------------------------------------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(new URL('../app-icon.png', import.meta.url), png);
console.log(`wrote app-icon.png (${png.length} bytes)`);
