// Gera os ícones PNG do PWA sem dependências: três lombadas sobre uma prateleira.
// Uso: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#2F5D4E");
const SHELF = hex("#DCE8E1");
const SPINES = [
  { color: hex("#EEF0EC"), x: 0.27, w: 0.12, h: 0.46 },
  { color: hex("#C9A27E"), x: 0.42, w: 0.14, h: 0.52 },
  { color: hex("#9DB3D9"), x: 0.59, w: 0.1, h: 0.4, tilt: 0.06 },
];

function draw(size, safe) {
  // `safe` < 1 encolhe o desenho para caber na zona segura dos ícones maskable.
  const px = Buffer.alloc(size * size * 4);
  const s = (v) => 0.5 + (v - 0.5) * safe;
  const baseY = s(0.74);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let c = BG;
      if (v >= baseY && v <= baseY + 0.045 * safe && u >= s(0.2) && u <= s(0.8)) c = SHELF;
      for (const sp of SPINES) {
        const shift = sp.tilt ? (baseY - v) * sp.tilt * 2 : 0;
        const left = s(sp.x) + shift;
        if (u >= left && u <= left + sp.w * safe && v <= baseY && v >= baseY - sp.h * safe) c = sp.color;
      }
      const i = (y * size + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", draw(192, 1));
writeFileSync("public/icons/icon-512.png", draw(512, 1));
writeFileSync("public/icons/icon-maskable-512.png", draw(512, 0.78));
writeFileSync("public/icons/apple-touch-icon.png", draw(180, 0.9));
console.log("Ícones gerados em public/icons/");
