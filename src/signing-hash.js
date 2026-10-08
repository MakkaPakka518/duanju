import { SV2, branch_2_orders, branch_one_b64 } from "./signing-data.js";
export const concat = (...xs) => {
  const a = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let p = 0;
  for (const x of xs) {
    a.set(x, p);
    p += x.length;
  }
  return a;
};
export const utf8 = (x) => new TextEncoder().encode(String(x));
export const hexBytes = (x) =>
  Uint8Array.from(x.match(/../g) || [], (v) => parseInt(v, 16));
export const u32 = (n, le = true) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, le);
  return b;
};
export const u64 = (n, le = true) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt.asUintN(64, BigInt(n)), le);
  return b;
};
export const read32 = (a, p = 0, le = true) =>
  new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(p, le);
export const read64 = (a, p = 0, le = true) =>
  new DataView(a.buffer, a.byteOffset, a.byteLength).getBigUint64(p, le);
export const rol = (a, n) => ((a << (n & 31)) | (a >>> (32 - (n & 31)))) >>> 0;
export const ror = (a, n) => rol(a, 32 - (n & 31));
export const ror64 = (a, n) => {
  n = BigInt(Number(n) & 63);
  return BigInt.asUintN(64, (a >> n) | (a << (64n - n)));
};
export function checksum(a) {
  let c = 0x20220420;
  for (let i = 0; i < 12; i++) {
    const t = (c >>> (i % 2 ? 5 : 3)) ^ c;
    c = ((i % 2 ? ~(a[i] | (c << 11)) : a[i] ^ (c << 7)) ^ t) >>> 0;
  }
  return ((c | 4) ^ 0x1000000) >>> 0;
}
export function getIv(iv, data) {
  for (let i = 0; i < data.length; i++)
    iv =
      (i & 1
        ? ~((iv >>> 7) ^ iv ^ (data[i] | (iv << 12)))
        : (iv >>> 4) ^ iv ^ (iv << 6) ^ data[i]) >>> 0;
  return iv;
}
function digestV3(data, c2, orders, c1) {
  const sv = SV2.map((x) => ror(x, c1));
  const start = [0x79e0f2fb, 0xc8b52570, 0xebc2f8cd, 0x7c104d93].map((x) =>
    ror(x, c2),
  );
  const end = [0x19be4866, 0xe85986b4, 0xe19b326e, 0x71d1d7d4].map((x) =>
    ror(x, c2 + 6),
  );
  let [a, b, c, d] = start;
  const shifts = [
    [7, 12, 17, 22],
    [5, 9, 14, 20],
    [4, 11, 16, 23],
    [6, 10, 15, 21],
  ];
  for (let i = 0; i < 64; i++) {
    const r = i >>> 4;
    const f =
      r === 0
        ? (b & c) | (~b & d)
        : r === 1
          ? (b & d) | (c & ~d)
          : r === 2
            ? b ^ c ^ d
            : c ^ (b | ~d);
    const v =
      (b +
        rol(
          (a + f + read32(data, orders[i] * 4) + sv[i]) >>> 0,
          shifts[r][i & 3],
        )) >>>
      0;
    [a, b, c, d] = [d, v, b, c];
  }
  const result = concat(
    ...[a, b, c, d].map((x, i) => u32(((x + start[i]) ^ end[i]) >>> 0)),
  );
  return concat(result, u32(checksum(result)));
}
function branch2(iv, t, q, b, ts) {
  const n = (iv & 13) * 86;
  const idx = ((n >>> 15) & 255) + ((n >>> 8) & 255);
  const base = [0x8980f29b, 0xeb549c7f, 0xb08726db, 0xd40cb5e6, 0xe8f559e4][
    idx
  ];
  const c2 = (base + t) >>> 0;
  const pad = Uint8Array.from(
    [0x84, 0x96, 0x77, 0x9d, 0xd4, 0x15, 0x0b, 0xf8],
    (v) => ((v * 257) >>> ((c2 + 5) & 7)) & 255,
  );
  return digestV3(
    concat(q, b, ts, pad, hexBytes("a0010000")),
    c2,
    branch_2_orders.slice(idx * 64, idx * 64 + 64),
    (c2 + 1) & 255,
  );
}
const B0K = [
  0xebb64faf, 0x7aadcc2, 0xcf3187bf, 0xe01138ff, 0x6d0bfcff, 0x5a30a3be,
  0xb41ad638, 0x34180eb8, 0xf233eb6f, 0xb1a584cc, 0xccc30dc7, 0x47d1db51,
  0xd55653de, 0x70a84fa1, 0x57473c12, 0xf76f0288, 0x2c077f0a, 0xda0dcad0,
  0xfbb86f6c, 0xfdc4cf00, 0x688a020d, 0xe676c6a6, 0x8cd6338b, 0x1a3c8d0e,
  0xcce8b06b, 0x6ad0ed0b, 0xa0522717, 0xdc71ac83, 0x2285db71, 0xd5b4dda6,
  0x736f8650, 0x6560306c, 0x617ce2a6, 0xe423417e, 0xa40e143, 0x544e4032,
  0x88dffb2a, 0x716c1ae0, 0x4c467a88, 0x5b23bb3, 0xe1d0b866, 0xbaa3dcb8,
  0xae3374d3, 0xc3381a50, 0x1702f75b, 0xfe6da368, 0xf0b4cf48, 0x4e0ffbb8,
  0x72aad10d, 0x26c53a3d, 0xf2bce0f6, 0xb4557581, 0x4a257fdd, 0x8c3182a2,
  0xab0b3b86, 0x3d5dfb14, 0x4f103634, 0xd37b52d7, 0x444eff16, 0xeb0a33d1,
  0x6ca86f6e, 0x284ba7, 0x8387cfa, 0x5fb37586,
];
function branch0(v, t, q, b, ts) {
  const base = [
    0xc4a78580, 0xb3c0fd39, 0xc58c5686, 0xc9aa3ba7, 0xf5a7adf2, 0x963c2ed1,
  ][v];
  const c = (base + t) >>> 0;
  const k = B0K.map((x) => ror(x, c + 1));
  const pad = Uint8Array.from(
    [0xfa, 0x45, 0x61, 0xd7],
    (x) => (x * 257) >>> ((c + 2) & 7),
  );
  const start = [
    0x7aba4fc8, 0x67166507, 0x6403fa00, 0x340f512f, 984304912, 3005047866,
    2874125293, 2152413264,
  ].map((x) => ror(x, c));
  const input = concat(q, b, ts, pad, hexBytes("00000000000001a0"));
  const w = Array.from({ length: 16 }, (_, i) => read32(input, i * 4, false));
  for (let i = 0; i < 112; i++) {
    const a = w[i + 1],
      b = w[i + 14];
    w.push(
      (w[i] +
        w[i + 9] +
        ((rol(a, 14) ^ rol(a, 25) ^ (a >>> 3)) >>> 0) +
        ((rol(b, 13) ^ rol(b, 15) ^ (b >>> 10)) >>> 0)) >>>
        0,
    );
  }
  const config = [
    [101, 5, 7, 6, 3, 2, 1, 0, 5, 4, 3],
    [96, 0, 6, 7, 5, 3, 2, 1, 5, 4, 4],
    [96, 7, 6, 2, 1, 4, 0, 5, 4, 3, 5],
    [99, 3, 6, 2, 4, 5, 1, 0, 0, 7, 6],
    [96, 0, 5, 6, 7, 3, 1, 2, 5, 4, 4],
    [100, 2, 0, 3, 5, 4, 6, 7, 2, 1, 5],
  ][v];
  const [round, x1, x2, x3, x4, x5, x6, x7, x8, x9, x10] = config;
  let d = start.slice();
  for (let i = 0; i < round; i++) {
    const n1 = (((d[x3] ^ d[x4]) & d[x1]) ^ d[x3]) >>> 0;
    const n2 = (rol(d[x1], 26) ^ rol(d[x1], 21) ^ rol(d[x1], 7)) >>> 0;
    const n4 =
      (w[(base + i) & 127] + n1 + n2 + k[(base + i) & 63] + d[x5]) >>> 0;
    const n5 = (rol(d[x2], 30) ^ rol(d[x2], 19) ^ rol(d[x2], 10)) >>> 0;
    const n6 = ((d[x2] & d[x6]) | ((d[x2] | d[x6]) & d[x7])) >>> 0;
    const o = d[x9];
    d = [d[7], ...d.slice(0, 7)];
    d[x10] = (n5 + n6 + n4) >>> 0;
    d[x8] = (o + n4) >>> 0;
  }
  const all = concat(...d.map((x, i) => u32((x + start[i]) >>> 0, false)));
  const ret = all.slice(0, 16).map((x, i) => x ^ all[i + 16]);
  return concat(ret, u32(checksum(ret)));
}
let table;
function branch1(v, t, q, b, ts) {
  if (!table)
    table = Uint8Array.from(atob(branch_one_b64), (c) => c.charCodeAt(0));
  const base = [0x808a9c79, 0xf079807e, 0xbadf79c5, 0xa785d3ff, 0x82d8438c][v];
  const c = ror64(BigInt(t), (base + t) & 255);
  const order = [
    [5, 7, 1, 2, 4, 0, 6, 3],
    [0, 5, 2, 4, 1, 3, 7, 6],
    [5, 7, 2, 4, 1, 6, 3, 0],
    [3, 0, 2, 4, 6, 7, 1, 5],
    [4, 5, 0, 3, 6, 2, 1, 7],
  ][v];
  const keys = [
    0x87aeea5dab37cd6bn,
    0x7ff48becb4f54087n,
    0xb0724c06706bbd5dn,
    0x1fe5dfb1143e328dn,
    0x1a2331d00af4f1f2n,
    0xcaff7131bb1e71ban,
    0x33385e1042752218n,
    0xff01ed65d4a441fbn,
    0xadb1ec8828c80e8n,
    0x62475d12f4e06fe7n,
    0xbd0b238da4fe72n,
  ].map((x) => ror64(x, (base + t + 1) & 63));
  const round = (a) => {
    let out = 0n;
    for (let i = 0; i < 8; i++) {
      const x = Number((a[i] >> BigInt(56 - i * 8)) & 255n);
      out ^= read64(table, (v << 14) + i * 2048 + x * 8);
    }
    return out;
  };
  function swap(src, xor, typ) {
    let h = xor.slice(),
      d = order.map((x, i) => src[x] ^ xor[i]);
    for (let i = 0; i < 10; i++) {
      const next = h.map((_, j) => round([...h.slice(j), ...h.slice(0, j)]));
      next[7] ^= keys[i + 1];
      d = d.map((_, j) => round([...d.slice(j), ...d.slice(0, j)]) ^ next[j]);
      h = next;
    }
    if (!typ) return src.map((x, i) => d[(8 - i) & 7] ^ xor[i] ^ x);
    return [
      d[7] ^ typ[1],
      d[6] ^ typ[2],
      d[5] ^ typ[3],
      d[4] ^ typ[4],
      d[3] ^ typ[5],
      d[2] ^ typ[6],
      d[1] ^ typ[7] ^ src[7],
      d[0] ^ typ[0],
    ];
  }
  const input = concat(q, b, ts, hexBytes("800000000000000000000000"));
  const src = Array.from({ length: 8 }, (_, i) => read64(input, i * 8, false));
  const a = swap(src, Array(8).fill(c));
  const out = swap(
    [0n, 0n, 0n, 0n, 0n, 0n, 0n, 416n],
    [a[4], a[3], a[2], a[1], a[0], a[7], a[6], a[5]],
    a,
  );
  const ret = concat(
    ...out.reverse().map((x) => {
      const b = u64(x);
      return Uint8Array.from([b[1], b[3], b[5], b[6]]);
    }),
  );
  const folded = ret.slice(0, 16).map((x, i) => x ^ ret[i + 16]);
  return concat(folded, u32(checksum(folded)));
}
export function hashF13(q, b, t) {
  const ts = u32(t);
  const iv = getIv(getIv(getIv(0x20230928, q), b), ts);
  const v = ((iv & 15) * 171) >>> 9;
  const branch = (iv & 15) - v * 3;
  return branch === 0
    ? branch0(v, t, q, b, ts)
    : branch === 1
      ? branch1(v, t, q, b, ts)
      : branch2(iv, t, q, b, ts);
}
