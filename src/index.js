/** Hongguo catalog and signed media API for Workers. */

import { aesCbcDecrypt, aesCtrDecrypt, canonicalJsonMd5, generateDeviceId, md5, parseMp4Boxes, parseUrlParams, rc4, sm3, toHex } from "./crypto.js";
import { signingEnvelope } from "./signing.js";
import { videoModel, selectMedia } from "./hongguo.js";
import { openMedia, mediaResponse } from "./cenc.js";

const OFFICIAL_ORIGIN = "https://hongguoduanju.com";
const MIRROR_ORIGIN = "https://www.duanjubaike.net";
const SERIES_REF = "hg-series-v1:";
const EPISODE_REF = "hg-episode-v1:";
const CACHE_TTL = 60 * 60 * 6;
const PAGE_SIZE = 40;
// Compatibility fallback for existing installations; deployments may set
// STREAM_SECRET to use their own playback token signing key.
const CATALOG_TOKEN_SECRET = "hongguo-catalog-only";

const RANK_PATHS = Object.freeze({
  "comic-new": "/paihang/manjuxinju.html",
  "comic-hot": "/paihang/manjurebo.html",
  "short-new": "/paihang/xinju.html",
  "short-hot": "/paihang/rebo.html",
  "short-hot-search": "/paihang/reso.html",
  "short-yearly": "/paihang/niandu.html",
});

const CATEGORIES = Object.freeze([
  { id: "comic", title: "漫剧" },
  { id: "short", title: "短剧" },
  { id: "rank", title: "榜单" },
]);

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status >= 400 ? "no-store" : "public, max-age=60",
      "access-control-allow-origin": "*",
      ...extra,
    },
  });
}

function error(message, status = 400, details) {
  return json({ error: message, ...(details ? { details } : {}) }, status);
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function first(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const result = first(...value);
      if (result) return result;
    } else if (value && typeof value === "object") {
      const result = first(
        value.url,
        value.uri,
        value.src,
        value.download_url,
        value.main_url,
        value.backup_url,
        value.play_addr,
        value.url_list,
      );
      if (result) return result;
    } else if (text(value)) {
      return text(value);
    }
  }
  return "";
}

function int(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function pageNumber(value) {
  return Math.max(1, int(value, 1));
}

function decodeEntities(value) {
  return text(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeEntities(text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function seriesItem(item) {
  const data = item?.video_data && typeof item.video_data === "object" ? item.video_data : item;
  const id = first(data?.series_id, item?.keyword, item?.id);
  const count = int(first(data?.episode_cnt, item?.episode_cnt), 0);
  return {
    // Keep raw provider IDs; accept prefixed IDs from earlier clients.
    id: id.startsWith(SERIES_REF) ? id.slice(SERIES_REF.length) : id,
    title: first(data?.series_name, data?.series_title, data?.name, item?.name, item?.title) || "未命名短剧",
    mediaType: "tv",
    posterUrl: first(data?.series_cover, data?.cover, data?.cover_url, data?.poster),
    description: first(data?.series_intro, data?.intro, item?.description),
    remark: count ? `全${count}集` : first(data?.episode_right_text),
  };
}

function extractJsonValue(source, key) {
  const marker = `"${key}"`;
  let cursor = 0;
  while (true) {
    const markerAt = source.indexOf(marker, cursor);
    if (markerAt < 0) return undefined;
    let start = markerAt + marker.length;
    while (/\s/.test(source[start] || "")) start += 1;
    if (source[start] !== ":") {
      cursor = markerAt + marker.length;
      continue;
    }
    start += 1;
    while (/\s/.test(source[start] || "")) start += 1;
    const opening = source[start];
    if (opening !== "[" && opening !== "{") {
      cursor = start + 1;
      continue;
    }
    const closing = opening === "[" ? "]" : "}";
    let depth = 0;
    let string = false;
    let escaped = false;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (string) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') string = false;
        continue;
      }
      if (char === '"') {
        string = true;
        continue;
      }
      if (char === opening) depth += 1;
      else if (char === closing && --depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
    cursor = markerAt + marker.length;
  }
}

async function fetchText(url, ctx, ttl = CACHE_TTL, { allowServerErrorDocument = false } = {}) {
  const request = new Request(url, { headers: DEFAULT_HEADERS });
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached.text();
  const response = await fetch(request, { redirect: "follow" });
  const body = await response.text();
  if (!response.ok && !(allowServerErrorDocument && response.status === 500 && body.includes('"searchList"'))) {
    throw new Error(`上游返回 ${response.status}: ${url}`);
  }
  ctx.waitUntil(cache.put(request, new Response(body, {
    headers: {
      "content-type": response.headers.get("content-type") || "text/html; charset=utf-8",
      "cache-control": `public, max-age=${ttl}`,
    },
  })));
  return body;
}

function officialSearch(html) {
  const rows = extractJsonValue(html, "searchList");
  return Array.isArray(rows) ? rows.map(seriesItem).filter((item) => item.id !== SERIES_REF) : [];
}

function officialHome(html) {
  const sections = extractJsonValue(html, "homeSections");
  const rows = [];
  for (const section of Array.isArray(sections) ? sections : []) {
    for (const item of Array.isArray(section?.video_list) ? section.video_list : []) rows.push(item);
  }
  const seen = new Set();
  return rows.map(seriesItem).filter((item) => {
    if (!item.id || item.id === SERIES_REF || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function officialDetail(html, seriesId) {
  const detail = extractJsonValue(html, "seriesDetail");
  if (!detail || typeof detail !== "object") throw new Error("详情页没有 seriesDetail");
  const ids = Array.isArray(detail.vid_list) ? detail.vid_list : [];
  // Only match episode metadata by ID; do not reuse the series title or
  // assume that a partial video list has the same ordering as vid_list.
  const titles = new Map();
  const episodeTitle = (entry) => {
    if (!entry || typeof entry !== "object") return "";
    for (const key of ["episode_title", "video_title", "title", "name"]) {
      if (typeof entry[key] === "string" && entry[key].trim()) return entry[key].trim();
    }
    return "";
  };
  const episodeId = (entry) => entry && typeof entry === "object"
    ? first(entry.vid, entry.video_id, entry.item_id, entry.id) : text(entry);
  for (const source of [detail.video_list, extractJsonValue(html, "videoList")]) {
    if (!source || typeof source !== "object") continue;
    for (const [key, entry] of Object.entries(source)) {
      const id = episodeId(entry) || (!Array.isArray(source) ? key : "");
      const title = episodeTitle(entry);
      if (id && title) titles.set(id, title);
    }
  }
  const episodes = ids.map((entry, index) => {
    const videoId = episodeId(entry);
    return {
      id: `ep-${index + 1}`,
      title: episodeTitle(entry) || titles.get(videoId) || `第${index + 1}集`,
      episodeNumber: index + 1,
      playbackRef: EPISODE_REF + videoId,
    };
  }).filter((episode) => episode.playbackRef !== EPISODE_REF);
  return {
    id: seriesId,
    title: first(detail.series_name, detail.series_title) || "红果短剧",
    mediaType: "tv",
    posterUrl: first(detail.series_cover, detail.cover, detail.cover_url),
    description: first(detail.series_intro, detail.intro),
    seasonCount: 1,
    episodeCount: episodes.length,
    seasons: [{ id: "season-1", title: "全集", seasonNumber: 1, episodes }],
  };
}

function attr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function mirrorCards(html) {
  const cards = [];
  const anchor = /<a\b([^>]*\bclass\s*=\s*["'][^"']*\bcard\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html))) {
    const attrs = match[1];
    const body = match[2];
    const href = attr(attrs, "href");
    const idMatch = href.match(/\/(manju|duanju)\/info-(\d+)\.html/i);
    if (!idMatch) continue;
    const kind = idMatch[1].toLowerCase();
    const id = idMatch[2];
    const image = body.match(/<(?:img|source)\b[^>]*(?:src|data-src|srcset)\s*=\s*["']([^"']+)/i);
    const titleAttr = attr(attrs, "title");
    const plain = stripTags(body);
    const quoted = titleAttr.match(/《([^》]+)》/);
    let title = quoted?.[1] || plain.split("评分", 1)[0];
    title = title.replace(/^(?:漫剧|短剧)\s+/, "").replace(/^\d+(?:\.\d+)?万\w*\s+/, "").replace(/^全\s*\d+\s*集\s+/, "").trim();
    if (!title) continue;
    const count = plain.match(/全\s*([\d,]+)\s*集/);
    cards.push({
      id,
      title,
      mediaType: "tv",
      posterUrl: image ? first(image[1].split(/\s+/)[0]) : "",
      description: "",
      remark: count ? `全${count[1]}集` : "",
      _kind: kind,
      _text: plain,
      _href: new URL(href, MIRROR_ORIGIN).href,
    });
  }
  const seen = new Set();
  return cards.filter((card) => !seen.has(card.id) && seen.add(card.id));
}

function mirrorPageMeta(html, cards) {
  const pages = [...html.matchAll(/[?&]page=(\d+)/gi)].map((match) => int(match[1], 1));
  const sourcePageCount = Math.max(1, ...pages);
  const cardsPerPage = Math.max(1, cards.length);
  const total = sourcePageCount * cardsPerPage;
  return { total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

function matchesFilters(card, params) {
  const source = `${card.title} ${card._text}`.replace(/\s+/g, "").toLowerCase();
  const filters = ["background", "topic", "setting"];
  const labels = {
    background: { modern: "现代", urban: "都市", ancient: "古代", campus: "校园", workplace: "职场" },
    topic: { urban: "都市", fantasy: "奇幻", xuanhuan: "玄幻", suspense: "悬疑", comedy: "喜剧" },
    setting: { rebirth: "重生", transmigration: "穿越", system: "系统", boss: "总裁", sweet: "甜宠" },
  };
  for (const key of filters) {
    const value = text(params.get(key));
    if (!value || value === "all") continue;
    const label = labels[key]?.[value] || value;
    if (!source.includes(label.replace(/\s+/g, "").toLowerCase())) return false;
  }
  const time = text(params.get("time"));
  if (time && time !== "0") {
    // The mirror exposes dates in card text; preserve the runtime's bounded filter behavior.
    const days = { "1": 7, "2": 14, "3": 30, "4": 90 }[time];
    const date = card._text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (!days || !date || Date.parse(`${date[1]}-${date[2]}-${date[3]}T00:00:00Z`) < Date.now() - days * 86400000) return false;
  }
  return true;
}

function publicItems(items) {
  return items.map(({ _kind, _text, _href, ...item }) => item);
}

function pagePayload(items, page, totalPages = 1, total = null) {
  return { items: publicItems(items), page, pageCount: Math.max(1, totalPages), total };
}

function parseSeriesId(value) {
  const raw = text(value).startsWith(SERIES_REF) ? text(value).slice(SERIES_REF.length) : text(value);
  return /^[A-Za-z0-9_.:-]{1,256}$/.test(raw) ? raw : "";
}

function parseEpisodeId(value) {
  const raw = text(value).startsWith(EPISODE_REF) ? text(value).slice(EPISODE_REF.length) : text(value);
  return /^[A-Za-z0-9_.:-]{1,256}$/.test(raw) ? raw : "";
}

function tokenSecret(env) {
  return text(env.STREAM_SECRET) || CATALOG_TOKEN_SECRET;
}

function mediaHosts(env) {
  return text(env.HONGGUO_MEDIA_HOSTS).split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

function allowedMediaUrl(value, env) {
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const hosts = mediaHosts(env);
  const official = url.hostname === "qznovelvod.com" || url.hostname.endsWith(".qznovelvod.com");
  return official || hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unb64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function issueToken(payload, secret) {
  const encoded = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(encoded))));
  return `${encoded}.${signature}`;
}

async function verifyToken(token, secret) {
  const [encoded, supplied] = text(token).split(".", 2);
  if (!encoded || !supplied || !secret) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(supplied), new TextEncoder().encode(encoded));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(encoded)));
    if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// Bound isolate memory; shared Cache API entries contain short-lived upstream models.
const playbackCache = new Map();
async function mediaPlayback(request, env, ctx, episodeRef) {
  const now = Date.now();
  let entry = playbackCache.get(episodeRef);
  if (!entry || entry.expires <= now) {
    if (playbackCache.size >= 12) playbackCache.delete(playbackCache.keys().next().value);
    const promise = (async () => {
      const cacheKey = new Request(`${new URL(request.url).origin}/_internal/media-v2/${episodeRef}`);
      const cache = typeof caches !== "undefined" ? caches.default : null;
      const cached = cache && await cache.match(cacheKey);
      const model = cached ? await cached.json() : await videoModel(episodeRef);
      if (!cached && cache) ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(model), {
        headers: { "content-type": "application/json", "cache-control": "max-age=120" },
      })));
      const media = await selectMedia(model);
      let failure;
      for (const url of media.urls) {
        if (!allowedMediaUrl(url, env)) continue;
        try { return await openMedia(url, media.key); }
        catch (cause) { failure = cause; }
      }
      throw failure || new Error("红果没有返回受信任的媒体地址");
    })();
    entry = { expires: now + 120000, promise };
    playbackCache.set(episodeRef, entry);
    promise.catch(() => { if (playbackCache.get(episodeRef) === entry) playbackCache.delete(episodeRef); });
  }
  return mediaResponse(request, await entry.promise);
}

async function withStreamUrls(detail, env, request) {
  const origin = new URL(request.url).origin;
  const ttl = Math.max(60, int(env.STREAM_TOKEN_TTL_SECONDS, 21600));
  const secret = tokenSecret(env);
  const seasons = [];
  for (const season of detail.seasons) {
    const episodes = [];
    for (const episode of season.episodes) {
      const ref = parseEpisodeId(episode.playbackRef);
      const exp = Math.floor(Date.now() / 1000) + ttl;
      const token = await issueToken({ c: toHex(md5(`${detail.id}:${ref}:${exp}`)), exp, p: "hongguo", q: null, r: ref, s: detail.id }, secret);
      const { playbackRef, ...publicEpisode } = episode;
      episodes.push({ ...publicEpisode, streamUrl: `${origin}/api/v1/stream/${token}` });
    }
    seasons.push({ ...season, episodes });
  }
  return { ...detail, seasons };
}

async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/v1/history" && request.method === "GET") return json({ items: [] });
  if (path === "/api/v1/providers") {
    return json({ providers: [{ id: "hongguo", title: "红果短剧", version: "0.1.0", capabilities: ["browse", "detail", "home", "playback", "search"], categories: CATEGORIES }] });
  }
  if (path === "/api/v1/providers/hongguo/manifest") {
    return json({ id: "hongguo", title: "红果短剧", version: "0.1.0", capabilities: ["browse", "detail", "home", "playback", "search"], categories: CATEGORIES });
  }
  if (path === "/api/v1/providers/hongguo/crypto" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return error("JSON body 无效", 400); }
    const operation = text(body?.operation);
    try {
      if (operation === "md5" || operation === "sm3") return json({ digest: toHex(operation === "md5" ? md5(body.input) : sm3(body.input)) });
      if (operation === "rc4") return json({ data: toHex(rc4(body.input, body.key)) });
      if (operation === "device_id") return json({ deviceId: generateDeviceId(body.seed) });
      if (operation === "url_params") return json(parseUrlParams(body.url));
      if (operation === "json_md5") return json({ digest: canonicalJsonMd5(body.value) });
      if (operation === "signing_envelope") return json(signingEnvelope(body));
      if (operation === "mp4_boxes") return json({ boxes: parseMp4Boxes(body.data).map(({ type, offset, size, header }) => ({ type, offset, size, header })) });
      if (operation === "aes_ctr" || operation === "aes_cbc") {
        const decode = (value) => Uint8Array.from(atob(String(value).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - String(value).length % 4) % 4)), (c) => c.charCodeAt(0));
        const input = decode(body.input); const key = decode(body.key); const iv = decode(body.iv);
        const output = operation === "aes_ctr" ? await aesCtrDecrypt(input, key, iv, int(body.counterLength, 128)) : await aesCbcDecrypt(input, key, iv);
        return json({ data: toHex(output) });
      }
    } catch (cause) { return error("crypto operation failed", 400, text(cause?.message || cause)); }
    return error("未知 crypto operation", 400);
  }
  if (path === "/api/v1/stream" || path.startsWith("/api/v1/stream/")) {
    const token = path.split("/").pop();
    const payload = await verifyToken(token, tokenSecret(env));
    if (!payload || payload.p !== "hongguo" || !parseEpisodeId(payload.r) || !parseSeriesId(payload.s)) return error("播放 token 无效或已过期", 401);
    try {
      return await mediaPlayback(request, env, ctx, parseEpisodeId(payload.r));
    } catch (cause) {
      const message = text(cause?.message || cause);
      return error("红果播放地址获取失败", 502, message);
    }
  }
  const prefix = "/api/v1/providers/hongguo/";
  if (!path.startsWith(prefix)) return error("Not found", 404);
  const operation = path.slice(prefix.length);
  try {
    if (operation === "home") {
      const page = pageNumber(url.searchParams.get("page"));
      const html = await fetchText(`${MIRROR_ORIGIN}/duanju/list.html${page > 1 ? `?page=${page}` : ""}`, ctx);
      const items = mirrorCards(html);
      const meta = mirrorPageMeta(html, items);
      return json(pagePayload(items.slice(0, PAGE_SIZE), page, meta.pageCount, meta.total));
    }
    if (operation === "search") {
      if (!url.searchParams.has("q")) return json({ detail: [{ type: "missing", loc: ["query", "q"], msg: "Field required", input: null }] }, 422);
      const query = text(url.searchParams.get("q") || url.searchParams.get("keyword"));
      if (!query) return json(pagePayload([], 1, 1, 0));
      const page = pageNumber(url.searchParams.get("page"));
      const html = await fetchText(`${OFFICIAL_ORIGIN}/search/${encodeURIComponent(query)}`, ctx, CACHE_TTL, { allowServerErrorDocument: true });
      const items = officialSearch(html);
      return json(pagePayload(items, page, 1, items.length));
    }
    if (operation === "browse") {
      if (!url.searchParams.has("category")) return json({ detail: [{ type: "missing", loc: ["query", "category"], msg: "Field required", input: null }] }, 422);
      const category = text(url.searchParams.get("category"));
      const page = pageNumber(url.searchParams.get("page"));
      const rank = text(url.searchParams.get("rank")) || "comic-new";
      let sourceUrl;
      if (category === "rank") sourceUrl = MIRROR_ORIGIN + (RANK_PATHS[rank] || RANK_PATHS["comic-new"]);
      else if (category === "short") sourceUrl = `${MIRROR_ORIGIN}/duanju/list.html${page > 1 ? `?page=${page}` : ""}`;
      else if (category === "comic") sourceUrl = `${MIRROR_ORIGIN}/manju/list.html${page > 1 ? `?page=${page}` : ""}`;
      else return json(pagePayload([], page, 1, 0));
      const html = await fetchText(sourceUrl, ctx);
      let items = mirrorCards(html).filter((item) => !category || category === "rank" || item._kind === (category === "short" ? "duanju" : "manju"));
      for (const [key, value] of url.searchParams.entries()) if (["background", "topic", "setting", "gender", "time"].includes(key) && value) items = items.filter((item) => matchesFilters(item, url.searchParams));
      const meta = mirrorPageMeta(html, items);
      return json(pagePayload(items.slice(0, PAGE_SIZE), page, meta.pageCount, meta.total));
    }
    const detailMatch = operation.match(/^items\/(.+)$/);
    if (detailMatch) {
      const seriesId = parseSeriesId(decodeURIComponent(detailMatch[1]));
      if (!seriesId) return error("series id 无效", 400);
      const html = await fetchText(`${OFFICIAL_ORIGIN}/detail?series_id=${encodeURIComponent(seriesId)}`, ctx);
      const detail = await withStreamUrls(officialDetail(html, seriesId), env, request);
      return json(detail);
    }
    return error("Not found", 404);
  } catch (cause) {
    return error("红果上游请求失败", 502, text(cause?.message || cause));
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,HEAD,OPTIONS", "access-control-allow-headers": "*" } });
    if (!["GET", "HEAD", "POST"].includes(request.method)) return error("Method Not Allowed", 405);
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return json({ status: "ok", providers: ["hongguo"] });
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, provider: "hongguo", playback: true });
    return handleApi(request, env, ctx);
  },
};

export { extractJsonValue, mirrorCards, officialDetail, officialHome, officialSearch, seriesItem };
