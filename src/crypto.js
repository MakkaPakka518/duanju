const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const add = (...values) => values.reduce((a, b) => (a + b) >>> 0, 0);
const bytes = (value) => value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
const hex = (value) => Array.from(value, (x) => x.toString(16).padStart(2, "0")).join("");

export function md5(input) {
  const data = bytes(input); const bitLength = data.length * 8;
  const paddedLength = ((data.length + 9 + 63) >> 6) << 6; const buffer = new Uint8Array(paddedLength); buffer.set(data); buffer[data.length] = 0x80;
  const view = new DataView(buffer.buffer); view.setUint32(paddedLength - 8, bitLength >>> 0, true); view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]; const constants = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    const m = Array.from({ length: 16 }, (_, i) => view.getUint32(offset + i * 4, true)); let a = a0; let b = b0; let c = c0; let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f; let g; if (i < 16) { f = (b & c) | (~b & d); g = i; } else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; } else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; } else { f = c ^ (b | ~d); g = (7 * i) & 15; }
      const next = add(a, f, constants[i], m[g]); a = d; d = c; c = b; b = add(b, rotl(next, shifts[(i >> 4) * 4 + (i & 3)]));
    }
    a0 = add(a0, a); b0 = add(b0, b); c0 = add(c0, c); d0 = add(d0, d);
  }
  const out = new Uint8Array(16); const result = new DataView(out.buffer); result.setUint32(0, a0, true); result.setUint32(4, b0, true); result.setUint32(8, c0, true); result.setUint32(12, d0, true); return out;
}

export function sm3(input) {
  const data = bytes(input); const bitLength = data.length * 8; const paddedLength = ((data.length + 9 + 63) >> 6) << 6; const buffer = new Uint8Array(paddedLength); buffer.set(data); buffer[data.length] = 0x80;
  const view = new DataView(buffer.buffer); view.setUint32(paddedLength - 4, bitLength >>> 0, false); view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  let v = [0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600, 0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e]; const p0 = (x) => x ^ rotl(x, 9) ^ rotl(x, 17); const p1 = (x) => x ^ rotl(x, 15) ^ rotl(x, 23);
  for (let off = 0; off < paddedLength; off += 64) {
    const w = new Array(68); for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false); for (let j = 16; j < 68; j += 1) w[j] = (p1(w[j - 16] ^ w[j - 9] ^ rotl(w[j - 3], 15)) ^ rotl(w[j - 13], 7) ^ w[j - 6]) >>> 0;
    let [a, b, c, d, e, f, g, h] = v;
    for (let j = 0; j < 64; j += 1) { const tj = j < 16 ? 0x79cc4519 : 0x7a879d8a; const ss1 = rotl(add(rotl(a, 12), e, rotl(tj, j)), 7); const ss2 = ss1 ^ rotl(a, 12); const ff = j < 16 ? a ^ b ^ c : (a & b) | (a & c) | (b & c); const gg = j < 16 ? e ^ f ^ g : (e & f) | (~e & g); const tt1 = add(ff, d, ss2, w[j] ^ w[j + 4]); const tt2 = add(gg, h, ss1, w[j]); d = c; c = rotl(b, 9); b = a; a = tt1; h = g; g = rotl(f, 19); f = e; e = p0(tt2); }
    v = v.map((x, i) => (x ^ [a, b, c, d, e, f, g, h][i]) >>> 0);
  }
  const out = new Uint8Array(32); const result = new DataView(out.buffer); v.forEach((x, i) => result.setUint32(i * 4, x, false)); return out;
}

export function rc4(input, key) { const data = bytes(input); const k = bytes(key); const s = Array.from({ length: 256 }, (_, i) => i); let j = 0; for (let i = 0; i < 256; i += 1) { j = (j + s[i] + k[i % k.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; } const out = new Uint8Array(data.length); let i = 0; j = 0; for (let n = 0; n < data.length; n += 1) { i = (i + 1) & 255; j = (j + s[i]) & 255; [s[i], s[j]] = [s[j], s[i]]; out[n] = data[n] ^ s[(s[i] + s[j]) & 255]; } return out; }
export function parseUrlParams(value) { const result = {}; for (const [key, val] of new URL(String(value)).searchParams) result[key] = val; return result; }
export function canonicalJsonMd5(value) { return hex(md5(typeof value === "string" ? value : JSON.stringify(value))); }
export function generateDeviceId(seed = crypto.randomUUID()) { let value = 0n; for (const byte of md5(seed)) value = (value << 8n) | BigInt(byte); return (value % 9000000000000000000n + 1000000000000000000n).toString(); }
export async function aesCtrDecrypt(input, key, iv, counterLength = 128) { const cryptoKey = await crypto.subtle.importKey("raw", bytes(key), "AES-CTR", false, ["decrypt"]); return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CTR", counter: bytes(iv), length: counterLength }, cryptoKey, bytes(input))); }
export async function aesCbcDecrypt(input, key, iv) { const cryptoKey = await crypto.subtle.importKey("raw", bytes(key), "AES-CBC", false, ["decrypt"]); return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: bytes(iv) }, cryptoKey, bytes(input))); }
export function parseMp4Boxes(input) { const data = bytes(input); const view = new DataView(data.buffer, data.byteOffset, data.byteLength); const boxes = []; for (let offset = 0; offset + 8 <= data.length;) { let size = view.getUint32(offset, false); const type = new TextDecoder().decode(data.slice(offset + 4, offset + 8)); let header = 8; if (size === 1) { if (offset + 16 > data.length) break; size = Number(view.getBigUint64(offset + 8, false)); header = 16; } if (!size || offset + size > data.length) break; boxes.push({ type, offset, size, header, body: data.slice(offset + header, offset + size) }); offset += size; } return boxes; }
export const toHex = hex;
