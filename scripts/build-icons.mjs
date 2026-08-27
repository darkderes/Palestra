// Rasterize the SVG icons to PNG. Run: node scripts/build-icons.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icon = await readFile(join(root, 'icon.svg'));
const favicon = await readFile(join(root, 'favicon.svg'));

const jobs = [
  { src: icon,    out: 'icon-192.png',          size: 192 },
  { src: icon,    out: 'icon-512.png',          size: 512 },
  { src: icon,    out: 'apple-touch-icon.png',  size: 180, flatten: '#ff4f00' },
  { src: favicon, out: 'favicon-32.png',        size: 32  },
  { src: favicon, out: 'favicon-16.png',        size: 16  },
];

for (const { src, out, size, flatten } of jobs) {
  let pipe = sharp(src, { density: 384 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (flatten) pipe = pipe.flatten({ background: flatten });
  await pipe.png({ compressionLevel: 9 }).toFile(join(root, out));
  console.log('wrote', out, size + 'x' + size);
}

// favicon.ico — PNG-embedded ICO with 16 + 32 px entries
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(
  icoSizes.map(s =>
    sharp(favicon, { density: 384 })
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer()
  )
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);           // type: icon
header.writeUInt16LE(icoSizes.length, 4);

const dir = Buffer.alloc(16 * icoSizes.length);
let offset = 6 + dir.length;
icoSizes.forEach((s, i) => {
  const b = dir.subarray(i * 16);
  b.writeUInt8(s >= 256 ? 0 : s, 0);  // width
  b.writeUInt8(s >= 256 ? 0 : s, 1);  // height
  b.writeUInt8(0, 2);                 // palette
  b.writeUInt8(0, 3);                 // reserved
  b.writeUInt16LE(1, 4);              // color planes
  b.writeUInt16LE(32, 6);             // bpp
  b.writeUInt32LE(pngs[i].length, 8); // data size
  b.writeUInt32LE(offset, 12);        // data offset
  offset += pngs[i].length;
});

await writeFile(join(root, 'favicon.ico'), Buffer.concat([header, dir, ...pngs]));
console.log('wrote favicon.ico', icoSizes.join('/') + 'px');
