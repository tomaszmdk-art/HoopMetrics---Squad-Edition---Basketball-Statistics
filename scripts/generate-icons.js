import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Write public/icon.svg
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a192f"/>
      <stop offset="50%" stop-color="#112240"/>
      <stop offset="100%" stop-color="#070d19"/>
    </linearGradient>
    <linearGradient id="ball" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#c2410c"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="512" height="512" rx="104" fill="url(#bg)"/>
  
  <!-- Outer Ring / Shield Accent -->
  <circle cx="256" cy="256" r="210" fill="none" stroke="url(#gold)" stroke-width="8" opacity="0.8"/>
  <circle cx="256" cy="256" r="195" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.25"/>

  <!-- Basketball -->
  <circle cx="256" cy="245" r="145" fill="url(#ball)" stroke="#ffffff" stroke-width="4"/>
  <!-- Basketball Seams -->
  <path d="M 111 245 H 401" stroke="#261005" stroke-width="7" stroke-linecap="round"/>
  <path d="M 256 100 V 390" stroke="#261005" stroke-width="7" stroke-linecap="round"/>
  <path d="M 148 140 C 220 185 220 305 148 350" fill="none" stroke="#261005" stroke-width="7" stroke-linecap="round"/>
  <path d="M 364 140 C 292 185 292 305 364 350" fill="none" stroke="#261005" stroke-width="7" stroke-linecap="round"/>

  <!-- Crown / Star Accent -->
  <polygon points="256,58 268,90 302,93 276,114 284,147 256,128 228,147 236,114 210,93 244,90" fill="url(#gold)"/>

  <!-- Badge Text Banner -->
  <rect x="76" y="380" width="360" height="74" rx="20" fill="#0f172a" stroke="url(#gold)" stroke-width="4"/>
  <text x="256" y="415" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="900" fill="#facc15" text-anchor="middle" letter-spacing="3">BASKET STATS</text>
  <text x="256" y="443" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="800" fill="#38bdf8" text-anchor="middle" letter-spacing="4">PRO MATCH LIVE</text>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), svgContent); // browsers accept svg or we write png

// Helper to create simple solid RGBA PNG buffer with text/graphics or standard PNG chunk encoder
function createPng(width, height, isMaskable = false) {
  // Let's create an uncompressed/deflated raw RGBA PNG
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data: filter byte (0) + width * 4 bytes per scanline
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(scanlineLength * height);

  const cx = width / 2;
  const cy = height / 2;
  const outerR = isMaskable ? width * 0.40 : width * 0.44;
  const ballR = isMaskable ? width * 0.28 : width * 0.32;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter byte 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background navy: [10, 25, 47, 255]
      let r = 10, g = 25, b = 47, a = 255;

      // Outer gold circle ring
      if (Math.abs(dist - outerR) < (width > 200 ? 5 : 2)) {
        r = 250; g = 204; b = 21; a = 255; // Gold ring
      } else if (dist <= ballR) {
        // Orange basketball
        r = 249; g = 115; b = 22; a = 255;
        // Basketball lines
        const isHorizontalSeam = Math.abs(dy) < (width > 200 ? 4 : 2);
        const isVerticalSeam = Math.abs(dx) < (width > 200 ? 4 : 2);
        const isCurvedLeft = Math.abs(Math.sqrt((dx + ballR*0.6)**2 + dy*dy) - ballR*0.8) < (width > 200 ? 3 : 1.5);
        const isCurvedRight = Math.abs(Math.sqrt((dx - ballR*0.6)**2 + dy*dy) - ballR*0.8) < (width > 200 ? 3 : 1.5);

        if (isHorizontalSeam || isVerticalSeam || isCurvedLeft || isCurvedRight) {
          r = 38; g = 16; b = 5;
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  // Compute CRC32
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 implementation
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[i] = c;
}

// Generate the required icons
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));

console.log('Successfully generated PWA icons in /public');
