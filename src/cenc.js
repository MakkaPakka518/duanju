// Progressive ISO-BMFF CENC playback. Decrypt only the requested byte range;
// offsets and file length remain unchanged, including after moov patching.
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const CHUNK = 512 * 1024;
const MAX_MOOV = 8 * 1024 * 1024;
const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const number64 = (v, p) => {
  const n = Number(v.getBigUint64(p));
  if (!Number.isSafeInteger(n))
    throw new Error("MP4 offset exceeds safe integer");
  return n;
};
function boxes(b, start = 0, end = b.length) {
  const out = [],
    v = view(b);
  for (let p = start; p + 8 <= end;) {
    let size = v.getUint32(p),
      header = 8;
    const type = decoder.decode(b.subarray(p + 4, p + 8));
    if (size === 1) {
      if (p + 16 > end) throw new Error("Truncated MP4 box");
      size = number64(v, p + 8);
      header = 16;
    }
    if (size === 0) size = end - p;
    if (size < header || p + size > end) throw new Error(`Invalid ${type} box`);
    out.push({ type, p, size, body: p + header, end: p + size });
    p += size;
  }
  return out;
}
function child(b, parent, type) {
  return boxes(b, parent.body, parent.end).find((x) => x.type === type);
}
function required(value, name) {
  if (!value) throw new Error(`MP4 missing ${name}`);
  return value;
}
export function parseEncryption(
  moov,
  absoluteOffset = 0,
  totalSize = Infinity,
) {
  const b = new Uint8Array(moov),
    v = view(b),
    root = required(
      boxes(b).find((x) => x.type === "moov"),
      "moov",
    ),
    segments = [];
  const rename = (box, type) => b.set(encoder.encode(type), box.p + 4);
  for (const trak of boxes(b, root.body, root.end).filter(
    (x) => x.type === "trak",
  )) {
    const mdia = required(child(b, trak, "mdia"), "mdia"),
      minf = required(child(b, mdia, "minf"), "minf"),
      stbl = required(child(b, minf, "stbl"), "stbl");
    const table = boxes(b, stbl.body, stbl.end),
      get = (t) => table.find((x) => x.type === t),
      stsd = required(get("stsd"), "stsd");
    let ivSize = 0,
      encrypted = false;
    for (const sample of boxes(b, stsd.body + 8, stsd.end)) {
      if (!["encv", "enca"].includes(sample.type)) continue;
      const offset = sample.type === "encv" ? 78 : 28;
      const extra = boxes(b, sample.body + offset, sample.end),
        sinf = required(
          extra.find((x) => x.type === "sinf"),
          "sinf",
        );
      const frma = required(child(b, sinf, "frma"), "frma"),
        schm = required(child(b, sinf, "schm"), "schm");
      if (decoder.decode(b.subarray(schm.body + 4, schm.body + 8)) !== "cenc")
        throw new Error("Unsupported MP4 encryption scheme");
      const schi = required(child(b, sinf, "schi"), "schi"),
        tenc = required(child(b, schi, "tenc"), "tenc");
      const n = b[tenc.body + 7];
      if (![8, 16].includes(n)) throw new Error("Unsupported CENC IV size");
      if (ivSize && ivSize !== n) throw new Error("Mixed CENC IV sizes");
      ivSize = n;
      rename(sample, decoder.decode(b.subarray(frma.body, frma.body + 4)));
      rename(sinf, "free");
      encrypted = true;
    }
    if (!encrypted) continue;
    const stsz = required(get("stsz"), "stsz"),
      fixed = v.getUint32(stsz.body + 4),
      count = v.getUint32(stsz.body + 8);
    if (count > 1000000) throw new Error("Too many MP4 samples");
    const sizes = Array.from(
      { length: count },
      (_, i) => fixed || v.getUint32(stsz.body + 12 + i * 4),
    );
    const co = required(get("stco") || get("co64"), "chunk offsets"),
      chunks = v.getUint32(co.body + 4);
    const offsets = Array.from({ length: chunks }, (_, i) =>
      co.type === "co64"
        ? number64(v, co.body + 8 + i * 8)
        : v.getUint32(co.body + 8 + i * 4),
    );
    const sc = required(get("stsc"), "stsc"),
      scCount = v.getUint32(sc.body + 4),
      runs = Array.from({ length: scCount }, (_, i) => ({
        first: v.getUint32(sc.body + 8 + i * 12),
        count: v.getUint32(sc.body + 12 + i * 12),
      }));
    const senc = get("senc"),
      aux = [];
    if (senc) {
      const flags = v.getUint32(senc.body) & 0xffffff;
      if (flags & 1) throw new Error("CENC parameter override is unsupported");
      if (v.getUint32(senc.body + 4) !== count)
        throw new Error("CENC sample count mismatch");
      let p = senc.body + 8;
      for (let i = 0; i < count; i++) {
        if (p + ivSize > senc.end) throw new Error("Truncated CENC IV");
        const iv = new Uint8Array(16);
        iv.set(b.subarray(p, p + ivSize));
        p += ivSize;
        const parts = [];
        if (flags & 2) {
          const n = v.getUint16(p);
          p += 2;
          for (let j = 0; j < n; j++) {
            parts.push([v.getUint16(p), v.getUint32(p + 2)]);
            p += 6;
          }
        }
        if (p > senc.end) throw new Error("Truncated CENC subsamples");
        aux.push({ iv, parts });
      }
    } else {
      const saio = required(get("saio"), "saio"),
        saiz = required(get("saiz"), "saiz");
      let a = saio.body + 4,
        z = saiz.body + 4;
      if (v.getUint32(saio.body) & 1) a += 8;
      if (v.getUint32(saiz.body) & 1) z += 8;
      if (v.getUint32(a) !== 1)
        throw new Error("Multiple auxiliary offsets unsupported");
      a += 4;
      let p =
        (b[saio.body] === 1 ? number64(v, a) : v.getUint32(a)) - absoluteOffset;
      const fixedAux = b[z++],
        auxCount = v.getUint32(z);
      z += 4;
      if (auxCount !== count)
        throw new Error("Auxiliary sample count mismatch");
      for (let i = 0; i < count; i++) {
        const length = fixedAux || b[z + i];
        if (p < 0 || p + length > b.length || length < ivSize)
          throw new Error("CENC auxiliary data outside moov");
        const iv = new Uint8Array(16);
        iv.set(b.subarray(p, p + ivSize));
        const parts = [];
        if (length > ivSize) {
          let q = p + ivSize;
          const n = v.getUint16(q);
          q += 2;
          for (let j = 0; j < n; j++) {
            parts.push([v.getUint16(q), v.getUint32(q + 2)]);
            q += 6;
          }
          if (q > p + length) throw new Error("Invalid auxiliary record");
        }
        aux.push({ iv, parts });
        p += length;
      }
    }
    let si = 0,
      run = 0;
    for (let ci = 0; ci < offsets.length; ci++) {
      while (run + 1 < runs.length && runs[run + 1].first <= ci + 1) run++;
      const entry = required(runs[run], "stsc entry");
      let at = offsets[ci];
      for (let j = 0; j < entry.count; j++) {
        if (si >= count) throw new Error("MP4 chunk sample overflow");
        const size = sizes[si],
          { iv, parts } = aux[si++];
        if (at + size > totalSize) throw new Error("MP4 sample out of bounds");
        if (!parts.length)
          segments.push({ start: at, end: at + size, iv, cipherOffset: 0 });
        else {
          let pos = at,
            cipherOffset = 0;
          for (const [clear, encrypted] of parts) {
            pos += clear;
            if (encrypted)
              segments.push({
                start: pos,
                end: pos + encrypted,
                iv,
                cipherOffset,
              });
            pos += encrypted;
            cipherOffset += encrypted;
          }
          if (pos > at + size) throw new Error("CENC subsample overflow");
        }
        at += size;
      }
    }
    if (si !== count) throw new Error("Unmapped MP4 samples");
    for (const box of table)
      if (["senc", "saio", "saiz"].includes(box.type)) rename(box, "free");
  }
  segments.sort((a, b) => a.start - b.start);
  for (let i = 1; i < segments.length; i++)
    if (segments[i].start < segments[i - 1].end)
      throw new Error("Overlapping MP4 samples");
  return { moov: b, offset: absoluteOffset, segments };
}
export async function decryptRange(input, start, metadata, key) {
  const output = new Uint8Array(input),
    end = start + output.length;
  const left = Math.max(start, metadata.offset),
    right = Math.min(end, metadata.offset + metadata.moov.length);
  if (right > left)
    output.set(
      metadata.moov.subarray(left - metadata.offset, right - metadata.offset),
      left - start,
    );
  let lo = 0,
    hi = metadata.segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (metadata.segments[mid].end <= start) lo = mid + 1;
    else hi = mid;
  }
  const jobs = [];
  for (let i = lo; i < metadata.segments.length; i++) {
    const s = metadata.segments[i];
    if (s.start >= end) break;
    const a = Math.max(start, s.start),
      z = Math.min(end, s.end);
    if (z <= a) continue;
    jobs.push(async () => {
      const offset = s.cipherOffset + a - s.start,
        skip = offset % 16,
        counter = s.iv.slice();
      let carry = BigInt(Math.floor(offset / 16));
      for (let j = 15; j >= 0 && carry; j--) {
        carry += BigInt(counter[j]);
        counter[j] = Number(carry & 255n);
        carry >>= 8n;
      }
      const data = new Uint8Array(skip + z - a);
      data.set(output.subarray(a - start, z - start), skip);
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-CTR", counter, length: 128 },
          key,
          data,
        ),
      );
      output.set(plain.subarray(skip), a - start);
    });
  }
  for (let i = 0; i < jobs.length; i += 24)
    await Promise.all(jobs.slice(i, i + 24).map((fn) => fn()));
  return output;
}
async function fetchRange(url, start, end) {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new Error(`Media range HTTP ${response.status}`);
  }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
    response.headers.get("content-range") || "",
  );
  if (!match || Number(match[1]) !== start || Number(match[2]) > end) {
    await response.body?.cancel();
    throw new Error("Invalid upstream Content-Range");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== Number(match[2]) - start + 1)
    throw new Error("Truncated media response");
  return { bytes, total: Number(match[3]) };
}
export async function openMedia(url, keyBytes) {
  let prefix = await fetchRange(url, 0, 262143);
  const total = prefix.total;
  let metadata = null,
    key = null;
  if (keyBytes) {
    let at = 0,
      moov = null;
    while (at < total) {
      const h =
        at + 16 <= prefix.bytes.length
          ? prefix.bytes.subarray(at, at + 16)
          : (await fetchRange(url, at, at + 15)).bytes;
      const v = view(h);
      let size = v.getUint32(0);
      const type = decoder.decode(h.subarray(4, 8));
      if (size === 1) size = number64(v, 8);
      if (size === 0) size = total - at;
      if (size < 8 || at + size > total)
        throw new Error("Invalid top-level MP4 box");
      if (type === "moov") {
        if (size > MAX_MOOV) throw new Error("MP4 metadata too large");
        moov =
          at + size <= prefix.bytes.length
            ? prefix.bytes.slice(at, at + size)
            : (await fetchRange(url, at, at + size - 1)).bytes;
        metadata = parseEncryption(moov, at, total);
        break;
      }
      at += size;
    }
    if (!metadata) throw new Error("MP4 moov not found");
    key = await crypto.subtle.importKey("raw", keyBytes, "AES-CTR", false, [
      "decrypt",
    ]);
  }
  return { url, total, prefix: prefix.bytes, metadata, key };
}
export function parseRange(header, total) {
  if (!header) return { start: 0, end: total - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= total ||
    end < start
  )
    return null;
  return { start, end, status: 206 };
}
export function mediaResponse(request, media) {
  const range = parseRange(request.headers.get("range"), media.total),
    headers = new Headers({
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      "access-control-allow-origin": "*",
      "access-control-expose-headers":
        "Content-Length, Content-Range, Accept-Ranges, Content-Type",
      "cache-control": "private, no-store",
    });
  if (!range) {
    headers.set("content-range", `bytes */${media.total}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end, status } = range;
  headers.set("content-length", String(end - start + 1));
  if (status === 206)
    headers.set("content-range", `bytes ${start}-${end}/${media.total}`);
  let position = start,
    cancelled = false;
  let body =
    request.method === "HEAD"
      ? null
      : new ReadableStream({
          async pull(controller) {
            try {
              const next = Math.min(end, position + CHUNK - 1);
              const data =
                next < media.prefix.length
                  ? media.prefix.slice(position, next + 1)
                  : (await fetchRange(media.url, position, next)).bytes;
              const output = media.metadata
                ? await decryptRange(data, position, media.metadata, media.key)
                : data;
              if (cancelled) return;
              controller.enqueue(output);
              position += data.length;
              if (position > end) controller.close();
            } catch (e) {
              if (!cancelled) controller.error(e);
            }
          },
          cancel() {
            cancelled = true;
          },
        });
  // Workers derives Content-Length from the body, ignoring a manually set
  // value for ordinary streams. Preserve fixed length without buffering.
  // https://developers.cloudflare.com/workers/runtime-apis/response/
  if (body && typeof FixedLengthStream !== "undefined") {
    body = body.pipeThrough(new FixedLengthStream(end - start + 1));
  }
  return new Response(body, { status, headers });
}
