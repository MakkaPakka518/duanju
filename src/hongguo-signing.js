import { md5, sm3, toHex } from "./crypto.js";
import { s_box } from "./signing-data.js";
import {
  concat,
  utf8,
  hexBytes,
  u32,
  u64,
  read64,
  ror64,
  hashF13,
} from "./signing-hash.js";
export const base64 = (a) => {
  let s = "";
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s);
};
const random = (lo, hi) =>
  lo + (crypto.getRandomValues(new Uint32Array(1))[0] % (hi - lo + 1));
const rotate8 = (x, n) => ((x << n) | (x >>> (8 - n))) & 255;
export function helios(t, r = random(1, 0xffffffff)) {
  const key = utf8(toHex(md5(concat(u32(r), utf8("8662")))));
  let a = read64(key),
    b = read64(key, 8);
  const queue = [read64(key, 16), read64(key, 24)],
    rounds = [a];
  for (let i = 0; i < 34; i++) {
    const x = BigInt.asUintN(64, (ror64(b, 8) + a) ^ BigInt(i));
    queue.push(x);
    a = BigInt.asUintN(64, x ^ ror64(a, 61));
    rounds.push(a);
    b = queue.shift();
  }
  const src = utf8(`${t}-1588093228-8662`),
    pad = 16 - (src.length % 16),
    input = concat(src, new Uint8Array(pad).fill(pad)),
    blocks = [u32(r)];
  for (let off = 0; off < input.length; off += 16) {
    let a = read64(input, off),
      b = read64(input, off + 8);
    for (let i = 0; i < 34; i++) {
      b = BigInt.asUintN(64, rounds[i] ^ (a + ror64(b, 8)));
      a = BigInt.asUintN(64, b ^ ror64(a, 61));
    }
    blocks.push(u64(a), u64(b));
  }
  return base64(concat(...blocks));
}
export function gorgon(query, body, t, r = random(0, 65535)) {
  const input = concat(
    md5(query).slice(0, 4),
    body ? md5(body).slice(0, 4) : new Uint8Array(4),
    new Uint8Array(4),
    u32(67503104),
    u32(t, false),
  );
  const key = [0x4a, 0x40, 0x16, r >>> 8, 0x47, 0x6c, 1, r & 255];
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % 8]) & 255;
    s[i] = s[j];
  }
  j = 0;
  const out = input.map((v, k) => {
    const i = k + 1;
    j += s[i];
    const y = s[j & 255];
    s[i] = y;
    return v ^ s[(y + y) & 255];
  });
  for (let i = 0; i < out.length; i++) {
    out[i] = rotate8(out[i], 4);
    let a = (i + 1 < out.length ? out[i + 1] : out[0]) ^ out[i],
      rev = 0;
    for (let k = 0; k < 8; k++) {
      rev = (rev << 1) | (a & 1);
      a >>>= 1;
    }
    out[i] = ~(rev ^ 20) & 255;
  }
  return (
    "8404" + toHex(Uint8Array.from([r & 255, r >>> 8, 0x40, 1])) + toHex(out)
  );
}
function varint(v) {
  v = BigInt(v);
  const b = [];
  do {
    let x = Number(v & 127n);
    v >>= 7n;
    b.push(x | (v ? 128 : 0));
  } while (v);
  return Uint8Array.from(b);
}
function proto(fields) {
  const out = [];
  for (const [n, v, type = "s"] of fields) {
    if (v == null || v === "" || v === 0 || v.length === 0) continue;
    let wire, data;
    if (type === "i") {
      const x = BigInt(v);
      wire = 0;
      data = varint(x >= 0 ? x * 2n : -x * 2n - 1n);
    } else if (type === "f") {
      wire = 5;
      data = new Uint8Array(4);
      new DataView(data.buffer).setFloat32(0, v, true);
    } else {
      wire = 2;
      const bytes = type === "b" ? v : utf8(v);
      data = concat(varint(bytes.length), bytes);
    }
    out.push(varint(n * 8 + wire), data);
  }
  return concat(...out);
}
function deviceProto(d) {
  const model = d.device_model,
    brand = d.device_brand;
  return proto([
    [1, 1, "i"],
    [2, 2, "i"],
    [3, "8662"],
    [4, d.device_id],
    [5, d.device_sec_device_token || ""],
    [6, "!noperm!"],
    [7, -888888, "i"],
    [8, -888888, "i"],
    [9, 3, "i"],
    [10, -888888, "i"],
    [11, "!notset!"],
    [12, "Asia/Shanghai,8"],
    [13, "zh_CN"],
    [14, 4, "i"],
    [16, 255.24993896484375, "f"],
    [17, 35.58599090576172, "f"],
    [18, 3.467449188232422, "f"],
    [19, 3.467449188232422, "f"],
    [20, 255.1754913330078, "f"],
    [21, 42.17544174194336, "f"],
    [22, d.os_version],
    [23, 41, "i"],
    [24, 36, "i"],
    [25, 1728388016635, "i"],
    [26, 1728388016635, "i"],
    [27, 1728388016635, "i"],
    [28, 1728388016637, "i"],
    [29, -1, "i"],
    [30, model],
    [31, brand],
    [32, model],
    [33, model],
    [34, d.device_manufacturer || brand],
    [35, brand],
    [36, brand],
    [38, 31, "i"],
  ]);
}
export function medusaProto(query, body, t, d, rng = random, reportTime = t) {
  const q = sm3(query),
    b = body ? md5(body) : new Uint8Array(16),
    hash = hashF13(q, b, t);
  const rand = rng(0, 0xffffffff),
    launch = rng(100, 120),
    pid = rng(10001, 12000);
  const report = proto([
    [1, d.report_time || reportTime, "i"],
    [2, -2, "i"],
    [4, 200, "i"],
  ]);
  const env = proto([
    [1, launch, "i"],
    [2, 146331399, "i"],
    [3, 146331396, "i"],
    [5, 7, "i"],
    [6, "v04.06.04.03-bugfix"],
    [7, pid, "i"],
    [12, deviceProto(d), "b"],
    [13, report, "b"],
    [14, d.version_name],
  ]);
  const data = proto([
    [1, hexBytes("f7e85ffad7d7dc3bd62ac87057cf6118"), "b"],
    [2, 3, "i"],
    [3, rand, "i"],
    [4, "8662"],
    [5, d.device_id],
    [6, "1588093228"],
    [7, d.version_name],
    [8, "v04.06.04-ml-android"],
    [9, 67503104, "i"],
    [10, u64(320), "b"],
    [12, t, "i"],
    [13, hash, "b"],
    [14, q.slice(0, 6), "b"],
    [
      15,
      proto([
        [1, 111, "i"],
        [2, 10, "i"],
        [3, 694367, "i"],
        [5, 586952199, "i"],
      ]),
      "b",
    ],
    [16, d.sec_device_token || ""],
    [17, t, "i"],
    [19, sm3(concat(utf8(query), b, utf8("none"))), "b"],
    [20, "none"],
    [21, 312, "i"],
    [23, env, "b"],
    [
      24,
      '{"cmr":16777216,"cmr2":16777216,"un_h":1879194040,"vpn":0,"kd":0,"fkd":3672518972,"pd":-1872573247,"dyn":"","do":0,"tk":true}',
    ],
  ]);
  return { data, queryHash: q, bodyHash: hash };
}
function scramble(src, key) {
  const data = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const idx = (i * 4) & 28,
      a = key[idx],
      b = key[idx + 1];
    let x = ~((rotate8(src[i], 4) + a) ^ b) & 255;
    x = (rotate8(x, 3) + b) & 255;
    data[src.length - i - 1] = ~(x ^ a) & 255;
  }
  const last = data.at(-1) ^ data.at(-2),
    first = data[0];
  data[0] = ~last + data[0];
  data[1] = (data[0] ^ data.at(-1) ^ 254) + data[1];
  data[2] += (last - first) ^ rotate8(data[1], 3) ^ 2;
  for (let i = 0; i < data.length - 4; i++)
    data[i + 3] += ~(rotate8(data[i + 2], 3) ^ data[i + 1] ^ (i + 3));
  data[data.length - 1] ^= data.at(-2);
  let sum = 0;
  for (let i = 1; i < data.length; i++) sum += data[i];
  data[0] = (data[0] ^ data[1]) + sum;
  return data;
}
function aesV3(data, t) {
  const w = t & 3,
    sbox = s_box.slice(w * 256, w * 256 + 256);
  const con = [
    [1, 0, 2, 3],
    [2, 0, 3, 1],
    [0, 1, 3, 2],
    [1, 0, 2, 3],
  ][w];
  const order = [
    [0, 9, 14, 11, 4, 13, 2, 7, 8, 1, 6, 15, 12, 5, 10, 3],
    [0, 9, 14, 15, 4, 13, 2, 7, 8, 1, 6, 3, 12, 5, 10, 11],
    [0, 9, 14, 7, 4, 13, 2, 11, 8, 1, 6, 3, 12, 5, 10, 15],
    [0, 9, 14, 11, 4, 13, 2, 7, 8, 1, 6, 15, 12, 5, 10, 3],
  ][w];
  const init = [0xca025ddc, 0x823dc546, 0xc9420583, 0xc298225f][w];
  const key = hexBytes("f1593376766ea98d34f31b057a9d5be4"),
    mk = new Uint8Array(48);
  for (let i = 0; i < 16; i++) mk[i] = u32(init)[i % 4] ^ key[i];
  let rounds = 8;
  for (let i = 4; i < 12; i++) {
    const idx = 4 * (i - 1);
    let [a, b, c, d] = mk.slice(idx, idx + 4);
    if ((i & 3) === 0)
      [a, b, c, d] = [
        ((init >>> (rounds & 24)) ^ sbox[b]) & 255,
        sbox[c],
        sbox[d],
        sbox[a],
      ];
    rounds += 2;
    mk.set(
      [a ^ mk[idx - 12], b ^ mk[idx - 11], c ^ mk[idx - 10], d ^ mk[idx - 9]],
      idx + 4,
    );
  }
  const xt = (x) => ((x << 1) ^ (x & 128 ? 0x1b : 0)) & 255;
  function block(input) {
    let s = Array.from(input);
    const add = (off, perm) => {
      s = s.map((x, i) => x ^ mk[off + (i & ~3) + (perm ? con[i & 3] : i & 3)]);
    };
    add(0, true);
    for (let round = 1; round <= 2; round++) {
      s = s.map((x) => sbox[x]);
      s = s.map((_, i) => s[con[i >>> 2] * 4 + (i & 3)]);
      s = order.map((i) => s[i]);
      if (round === 1) {
        s = s.map((_, i) => s[(i & ~3) + con[i & 3]]);
        for (let col = 0; col < 4; col++) {
          const a = [s[col], s[4 + col], s[8 + col], s[12 + col]],
            z = a.reduce((v, x) => v ^ x, 0);
          for (let row = 0; row < 4; row++)
            s[row * 4 + col] = a[row] ^ z ^ xt(a[row] ^ a[(row + 1) & 3]);
        }
      }
      add(round * 16, true);
    }
    add(16, false);
    return Uint8Array.from(s);
  }
  if (data.length < 248) throw new Error("Medusa payload is too short");
  const bits = new Uint8Array(32);
  for (let i = 0; i < 31; i++) {
    const p = i * 8;
    bits[i] =
      ((data[p] >>> 4) & 2) |
      (data[p + 1] & 64) |
      ((data[p + 2] >>> 2) & 1) |
      ((data[p + 3] << 3) & 128) |
      ((data[p + 4] >>> 1) & 4) |
      ((data[p + 5] << 3) & 16) |
      ((data[p + 6] << 5) & 32) |
      ((data[p + 7] >>> 4) & 8);
  }
  bits[31] = 1;
  const iv = hexBytes("1fe109a4125283f418de9e051a969e12");
  const b1 = block(bits.slice(0, 16).map((x, i) => x ^ iv[i])),
    b2 = block(bits.slice(16).map((x, i) => x ^ b1[i])),
    k = concat(b1, b2),
    out = data.slice();
  for (let i = 0; i < 31; i++) {
    const p = i * 8,
      v = k[i];
    out[p] = (out[p] & ~32) | ((v << 4) & 32);
    out[p + 1] = (out[p + 1] & ~64) | (v & 64);
    out[p + 2] = (out[p + 2] & ~4) | ((v << 2) & 4);
    out[p + 3] = (out[p + 3] & ~16) | ((v >>> 3) & 16);
    out[p + 4] = (out[p + 4] & ~8) | ((v << 1) & 8);
    out[p + 5] = (out[p + 5] & ~2) | ((v >>> 3) & 2);
    out[p + 6] = (out[p + 6] & ~1) | ((v >>> 5) & 1);
    out[p + 7] = (out[p + 7] & 127) | ((v << 4) & 128);
  }
  return concat(k.slice(-1), out);
}
export function medusa(query, body, t, d, rng = random, reportTime = t) {
  const p = medusaProto(query, body, t, d, rng, reportTime);
  const hr = rng(0, 0xffffffff) || rng(1, 0xffffffff),
    xr = rng(0, 0xffffffff) || rng(1, 0xffffffff);
  const signKey = hexBytes(
    "8ebdfa3806ecc5cee79423e6029ed82540bc2218bb7eaef71cb691f7aa8aa2f5",
  );
  const key = sm3(concat(signKey, u32(hr), signKey));
  const d1 = (hr >>> 16) & 255,
    seed = u32(~(((d1 << 11) | (hr >>> 24)) ^ (d1 >>> 5) ^ d1));
  let data = concat(u64(320), scramble(p.data, key))
    .reverse()
    .map((x, i) => x ^ seed[~i & 3]);
  const hb = u32(hr),
    check =
      ((p.queryHash[0] & 63) << 14) | 0x18000001 | ((p.bodyHash[0] & 63) << 8);
  data = concat(Uint8Array.of(0x35), u32(xr), u32(check), data, hb.slice(2));
  data = aesV3(data, t);
  const version = concat(
    ...[3, 0xfa5fe8f7, 0x3bdcd7d7, 0x70c82ad6, 0x1861cf57].map((x) =>
      u32(x ^ t),
    ),
  );
  return base64(concat(version, hb.slice(0, 2), Uint8Array.of(0, 1), data));
}
export function signRequest(query, body, t, d, rng = random) {
  return {
    "x-ladon": base64(u32(t, false)),
    "x-khronos": String(t),
    "x-argus": base64(u32(t)),
    "x-gorgon": gorgon(query, body, t, rng(0, 65535)),
    "x-helios": helios(t, rng(1, 0xffffffff)),
    "x-medusa": medusa(query, body, t, d, rng),
    "x-ss-stub": toHex(md5(body)).toUpperCase(),
    "user-agent": d.ua,
    "x-tt-dt": d.x_tt_dt || "",
  };
}
