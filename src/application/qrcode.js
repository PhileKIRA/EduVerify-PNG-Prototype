/* ============================================================
   APPLICATION TIER — real QR code encoder (ISO/IEC 18004).
   Self-contained byte-mode encoder (versions 1–10, ECC level M)
   producing a boolean module matrix, plus an SVG renderer.
   Replaces the old decorative "fake QR" — codes generated here
   scan correctly with any standard QR reader.
   ============================================================ */

/* ---------- capacity / error-correction tables (QR spec, ECC level M) ---------- */
const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS_M   = [-1,  1,  1,  1,  2,  2,  4,  4,  4,  5,  5];

function totalCodewords(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return Math.floor(result / 8);
}
const dataCodewordsM = (ver) => totalCodewords(ver) - ECC_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver];

/* ---------- GF(256) Reed–Solomon ---------- */
function rsMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree) {
  const result = new Array(degree - 1).fill(0).concat([1]);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= rsMultiply(coef, factor); });
  }
  return result;
}

/* ---------- matrix construction ---------- */
function alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function buildMatrix(ver, dataBits) {
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

  /* timing patterns */
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  /* finder patterns + separators */
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  /* alignment patterns */
  const align = alignmentPositions(ver);
  for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  /* reserve format info areas (values drawn later) */
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { isFunction[8][i] = true; isFunction[i][8] = true; }
    isFunction[8][8] = true;
    if (i < 8) { isFunction[8][size - 1 - i] = true; isFunction[size - 1 - i][8] = true; }
  }
  set(8, size - 8, true); // dark module

  /* version information (required for versions >= 7) */
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vbits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((vbits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  /* zig-zag placement of data bits */
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x]) {
          modules[y][x] = bitIndex < dataBits.length ? dataBits[bitIndex] === 1 : false;
          bitIndex++;
        }
      }
    }
  }
  return { modules, isFunction, size };
}

function applyMask(mask, modules, isFunction, size) {
  const fns = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ][mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
    if (!isFunction[y][x] && fns(x, y)) modules[y][x] = !modules[y][x];
}

function drawFormatBits(mask, modules, size) {
  /* ECC level M = 0b00 */
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => ((bits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
  modules[7][8] = bit(6); modules[8][8] = bit(7); modules[8][7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bit(i);
  modules[size - 8][8] = true;
}

function penaltyScore(modules, size) {
  let result = 0;
  /* rows & columns: runs and finder-like patterns */
  for (let axis = 0; axis < 2; axis++) {
    for (let a = 0; a < size; a++) {
      let runColor = false, runLen = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      const addHistory = (len) => { history.shift(); history.push(len); };
      const finderPenalty = () => {
        const n = history[1];
        const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
        return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
      };
      for (let b = 0; b < size; b++) {
        const color = axis === 0 ? modules[a][b] : modules[b][a];
        if (color === runColor) {
          runLen++;
          if (runLen === 5) result += 3; else if (runLen > 5) result++;
        } else {
          addHistory(runLen);
          if (!runColor) result += finderPenalty() * 40;
          runColor = color; runLen = 1;
        }
      }
      addHistory(runColor ? runLen : runLen + size); // pad light run at edge
      if (runColor) addHistory(size);
      result += finderPenalty() * 40;
    }
  }
  /* 2x2 blocks */
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = modules[y][x];
    if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += 3;
  }
  /* dark/light balance */
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * 10;
  return result;
}

/* ---------- main: encode text (byte mode, ECC M) → boolean matrix ---------- */
function encodeQR(text) {
  const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text)
    : Uint8Array.from(String(text).split("").map((c) => c.charCodeAt(0) & 0xff));

  /* pick the smallest version that fits */
  let ver = 0;
  for (let v = 1; v <= 10; v++) {
    const capacityBits = dataCodewordsM(v) * 8;
    const needed = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    if (needed <= capacityBits) { ver = v; break; }
  }
  if (!ver) throw new Error("QR payload too long (max ~200 bytes at version 10, ECC M)");

  /* bit stream: mode(0100) + count + data + terminator + padding */
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacity = dataCodewordsM(ver) * 8;
  push(0, Math.min(4, capacity - bits.length));
  if (bits.length % 8 !== 0) push(0, 8 - (bits.length % 8));
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);

  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) dataCw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  /* split into blocks, compute Reed–Solomon ECC, interleave */
  const numBlocks = NUM_BLOCKS_M[ver], eccLen = ECC_PER_BLOCK_M[ver];
  const rawCw = totalCodewords(ver);
  const numShort = numBlocks - (rawCw % numBlocks);
  const shortLen = Math.floor(rawCw / numBlocks); // total length (data+ecc) of a short block
  const blocks = [];
  const divisor = rsDivisor(eccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = dataCw.slice(k, k + dataLen); k += dataLen;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0); // pad so every block is the same length; skipped when interleaving
    blocks.push(dat.concat(ecc));
  }
  const interleaved = [];
  for (let i = 0; i < blocks[0].length; i++)
    for (let j = 0; j < blocks.length; j++)
      if (i !== shortLen - eccLen || j >= numShort) interleaved.push(blocks[j][i]);

  const allBits = [];
  for (const cw of interleaved) for (let i = 7; i >= 0; i--) allBits.push((cw >>> i) & 1);

  /* build matrix, choose best mask */
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const { modules, isFunction, size } = buildMatrix(ver, allBits);
    applyMask(mask, modules, isFunction, size);
    drawFormatBits(mask, modules, size);
    const score = penaltyScore(modules, size);
    if (!best || score < best.score) best = { modules, size, score, mask };
  }
  return { modules: best.modules, size: best.size, version: ver };
}

/* ---------- renderers ---------- */
/* SVG string (for embedding in downloadable certificate HTML) */
function qrToSvgString(text, pixelSize = 190) {
  const { modules, size } = encodeQR(text);
  const quiet = 4, dim = size + quiet * 2;
  let rects = "";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (modules[y][x]) rects += `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${pixelSize}" height="${pixelSize}" style="background:#fff;border-radius:6px" shape-rendering="crispEdges"><g fill="#14110C">${rects}</g></svg>`;
}

export { encodeQR, qrToSvgString };
