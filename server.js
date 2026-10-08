/**
 * 红果短剧 API — VPS 版服务端
 * 把 Cloudflare Worker 的 fetch 处理函数包成 Node HTTP 服务。
 * 依赖 Node 18+ 自带全局 fetch / Request / Response / crypto.subtle / btoa / atob。
 * 用内存版 Cache 兼容层替代 Cloudflare 的 caches.default（仅缓存模型/页面）。
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------- 1) Cloudflare Cache API 兼容层（内存版） ---------- */
const cacheStore = new Map();
const cacheDefault = {
  async match(request) {
    const key = new URL(request.url).href;
    const hit = cacheStore.get(key);
    if (!hit) return undefined;
    if (hit.expires && hit.expires <= Date.now()) {
      cacheStore.delete(key);
      return undefined;
    }
    return new Response(hit.body, { headers: hit.headers });
  },
  async put(request, response) {
    let body;
    try { body = await response.text(); } catch { return; }
    const headers = {};
    if (response.headers) response.headers.forEach((v, k) => { headers[k] = v; });
    let expires = null;
    const cc = headers["cache-control"] || "";
    const m = cc.match(/max-age=(\d+)/);
    if (m) expires = Date.now() + Number(m[1]) * 1000;
    cacheStore.set(new URL(request.url).href, { body, headers, expires });
    if (cacheStore.size > 256) cacheStore.delete(cacheStore.keys().next().value);
  },
  async delete(request) { return cacheStore.delete(new URL(request.url).href); },
};
if (!globalThis.caches) globalThis.caches = {};
globalThis.caches.default = cacheDefault;

/* ---------- 2) 导入 Worker 处理函数 ---------- */
const worker = (await import(join(__dirname, "src/index.js"))).default;

/* ---------- 3) 配置与上下文 ---------- */
const env = {
  STREAM_SECRET: process.env.STREAM_SECRET || "",
  HONGGUO_MEDIA_HOSTS: process.env.HONGGUO_MEDIA_HOSTS || "",
  STREAM_TOKEN_TTL_SECONDS: process.env.STREAM_TOKEN_TTL_SECONDS || "21600",
};
const ctx = { waitUntil(p) { if (p && typeof p.catch === "function") p.catch(() => {}); } };

const PORT = Number(process.env.PORT || 6666);

/* ---------- 4) Node req/res <-> Web Request/Response 转换 ---------- */
function toWebRequest(req) {
  const host = req.headers.host || "127.0.0.1";
  const url = `http://${host}${req.url}`;
  const headers = {};
  if (req.rawHeaders) {
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers[req.rawHeaders[i]] = req.rawHeaders[i + 1];
  } else if (req.headers) {
    Object.assign(headers, req.headers);
  }
  return new Request(url, { method: req.method, headers });
}

async function toWebRequestWithBody(req) {
  const request = toWebRequest(req);
  if (req.method === "GET" || req.method === "HEAD") return request;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined;
  return new Request(request.url, { method: req.method, headers: request.headers, body: body || undefined });
}

async function writeResponse(res, response, isHead) {
  const status = response.status || 200;
  const headers = {};
  if (response.headers) response.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(status, headers);
  if (isHead) { res.end(); return; }
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        if (value && value.length) {
          const ok = res.write(Buffer.from(value));
          if (!ok) await new Promise((r) => res.once("drain", r));
        }
      }
    } catch { try { res.end(); } catch {} }
  } else {
    res.end();
  }
}

/* ---------- 5) 自动生成的 duanju.js 静态托管 ---------- */
function serveDuanju(res) {
  const p = join(__dirname, "duanju.js");
  if (!existsSync(p)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("duanju.js 尚未生成，请先运行 install.sh 或 node generate-duanju.js");
    return;
  }
  res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
  res.end(readFileSync(p, "utf8"));
}

/* ---------- 5b) 黄果封面解密代理 /cover?url=... ---------- */
const COVER_ALLOWED_HOSTS = new Set(["pic.fisawck.cn", "pic.tuafjz.cn", "expose.eisees.com", "pic.tkzdds.cn", "pic.wirqed.cn"]);
const COVER_MEDIA_KEY = new TextEncoder().encode("f5d965df75336270");
const COVER_MEDIA_IV = new TextEncoder().encode("97b60394abc2fbe1");

function detectImageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "application/octet-stream";
}

async function serveCover(req, res, query) {
  const urlParam = String(query.get("url") || "").trim();
  let sourceUrl;
  try { sourceUrl = new URL(urlParam); } catch { sourceUrl = null; }
  if (!sourceUrl || sourceUrl.protocol !== "https:" || !COVER_ALLOWED_HOSTS.has(sourceUrl.hostname)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
    res.end("Source host is not allowed");
    return;
  }
  try {
    const upstream = await fetch(sourceUrl.toString(), {
      headers: { "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "Referer": "https://huangguoai.com/" }
    });
    if (!upstream.ok) {
      res.writeHead(upstream.status, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
      res.end("Cover request failed");
      return;
    }
    const encrypted = new Uint8Array(await upstream.arrayBuffer());
    if (!encrypted.length || encrypted.length % 16 !== 0) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
      res.end("Invalid encrypted cover");
      return;
    }
    const key = await crypto.subtle.importKey("raw", COVER_MEDIA_KEY, { name: "AES-CBC" }, false, ["decrypt"]);
    const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: COVER_MEDIA_IV }, key, encrypted));
    res.writeHead(200, {
      "content-type": detectImageType(decrypted),
      "content-disposition": "inline",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*"
    });
    res.end(Buffer.from(decrypted));
  } catch {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
    res.end("Cover decrypt failed");
  }
}

/* ---------- 6) 启动服务 ---------- */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const pathname = url.pathname;
  if (pathname === "/duanju.js") return serveDuanju(res);
  if (pathname === "/cover") return serveCover(req, res, url.searchParams);
  try {
    const request = await toWebRequestWithBody(req);
    const response = await worker.fetch(request, env, ctx);
    await writeResponse(res, response, req.method === "HEAD");
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "VPS server error", details: String((e && e.message) || e) }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[duanju] 红果短剧 API 已启动: http://0.0.0.0:${PORT}`);
  console.log(`[duanju] healthz: http://0.0.0.0:${PORT}/healthz`);
  console.log(`[duanju] duanju.js: http://0.0.0.0:${PORT}/duanju.js`);
});
