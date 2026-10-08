/**
 * 红果 · 黄果 短剧 聚合模块
 * - 红果短剧：走后端 API（signing+CENC 解密），需配置「红果 API 地址」
 * - 黄果短剧：直连 huangguoai.com 抓取，封面需经「黄果封面代理」解密
 * apiBase / coverWorker 由 generate-duanju.js 自动填充。
 */
WidgetMetadata = {
  id: "makka.duanju.merged",
  title: "红果·黄果 短剧",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "红果短剧（短剧/漫剧/榜单）与黄果短剧（推荐/上新/AI/专题/榜单）聚合",
  author: "",
  site: "https://t.me/MakkaPakkaOvO",
  detailCacheDuration: 180,
  globalParams: [
    { name: "apiBase", title: "红果 API 地址", type: "input", value: "__API_BASE__" },
    { name: "coverWorker", title: "黄果封面代理地址", type: "input", value: "__COVER_BASE__" }
  ],
  modules: [
    {
      id: "rg_list",
      title: "红果短剧",
      description: "红果短剧 / 漫剧 / 榜单（走后端 API，无需 WebView）",
      functionName: "loadHongguoList",
      cacheDuration: 300,
      params: [
        {
          name: "tid",
          title: "分类",
          type: "enumeration",
          value: "short",
          enumOptions: [
            { title: "短剧", value: "short" },
            { title: "漫剧", value: "comic" },
            { title: "榜单", value: "rank" }
          ]
        },
        { name: "page", title: "页码", type: "page" }
      ]
    },
    {
      id: "uh_list",
      title: "黄果短剧",
      description: "黄果 推荐/上新/AI短剧/AI漫剧/AI换脸/AI魔改/专题/排行榜（直连 huangguoai.com）",
      requiresWebView: true,
      functionName: "loadHuangguoList",
      cacheDuration: 0,
      params: [
        {
          name: "section",
          title: "频道",
          type: "enumeration",
          value: "recommend",
          enumOptions: [
            { title: "热门推荐", value: "recommend" },
            { title: "最近上新", value: "newest" },
            { title: "AI短剧", value: "aiDuanju" },
            { title: "AI漫剧", value: "aiManju" },
            { title: "AI换脸", value: "aiHuanlian" },
            { title: "AI魔改", value: "aiMogai" },
            { title: "专题", value: "topics" },
            { title: "排行榜", value: "ranking" }
          ]
        },
        {
          name: "channel",
          title: "排序",
          type: "enumeration",
          value: "latest",
          belongTo: { paramName: "section", value: ["aiDuanju", "aiManju", "aiHuanlian", "aiMogai"] },
          enumOptions: [
            { title: "最新更新", value: "latest" },
            { title: "当前热播", value: "hot" },
            { title: "独家原创", value: "original" },
            { title: "随机推荐", value: "random" }
          ]
        },
        {
          name: "topic",
          title: "专题",
          type: "enumeration",
          value: "hot-aiduanju",
          belongTo: { paramName: "section", value: ["topics"] },
          enumOptions: [
            { title: "精品高分短剧专辑", value: "hot-aiduanju" },
            { title: "家庭伦理短剧专辑", value: "luanlun-aiduanju" },
            { title: "灵异诡事短剧专辑", value: "paranormal-aiduanju" },
            { title: "欧美精选短剧专辑", value: "oumei-duanju" },
            { title: "精选魔改电视剧专辑", value: "magic-drama" },
            { title: "热门明星换脸专辑", value: "mingxing-huanlian" }
          ]
        },
        {
          name: "ranking",
          title: "榜单",
          type: "enumeration",
          value: "hot",
          belongTo: { paramName: "section", value: ["ranking"] },
          enumOptions: [
            { title: "热播榜", value: "hot" },
            { title: "推荐榜", value: "recommend" },
            { title: "潜力榜", value: "potential" }
          ]
        },
        { name: "page", title: "页码", type: "page" }
      ]
    },
    {
      id: "loadResource",
      title: "播放资源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索",
    functionName: "searchDuanju",
    params: [
      {
        name: "source",
        title: "数据源",
        type: "enumeration",
        value: "hongguo",
        enumOptions: [
          { title: "红果", value: "hongguo" },
          { title: "黄果", value: "huangguo" }
        ]
      },
      { name: "keyword", title: "关键词", type: "input" },
      { name: "page", title: "页码", type: "page" }
    ]
  }
};

// ============ 红果（后端 API 源） ============
const Hongguo = (() => {
function t(v) {
  return String(v == null ? "" : v).trim();
}
function cfg(params) {
  params = params || {};
  var base = t(params.apiBase).replace(/\/+$/, "");
  if (!base) throw new Error("请先在插件设置中填写 API 地址");
  if (!/^https?:\/\/[^/?#\s]+(?:\/[^?#\s]*)?$/i.test(base)) {
    throw new Error("API 地址须为完整的 HTTP 或 HTTPS 地址，不能包含查询参数");
  }
  return base;
}
function qs(obj) {
  var parts = [];
  Object.keys(obj || {}).forEach(function (k) {
    if (obj[k] == null || obj[k] === "") return;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(obj[k])));
  });
  return parts.length ? "?" + parts.join("&") : "";
}
async function httpJson(url) {
  var res = await Widget.http.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*"
    }
  });
  var d = res && res.data;
  if (typeof d === "string") {
    try { d = JSON.parse(d); } catch (e) {}
  }
  if (!d || typeof d !== "object") throw new Error("API 未返回有效的 JSON 数据");
  if (d.error) throw new Error(t(d.error) + (d.details && typeof d.details === "string" ? "：" + d.details : ""));
  return d;
}

function toItem(base, it) {
  if (!it || !it.id) return null;
  var cover = t(it.posterUrl || "");
  return {
    id: "hguo:" + t(it.id),
    type: "detail",
    title: t(it.title) || it.id,
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    description: t(it.description || ""),
    remark: t(it.remark || ""),
    mediaType: "tv",
    link: makeLink(base, it.id)
  };
}

async function loadList(params) {
  params = params || {};
  var base = cfg(params);
  var page = Number(params.page || 1) || 1;
  var tid = t(params.tid) || "short";
  var data = await httpJson(
    base + "/api/v1/providers/hongguo/browse" + qs({ category: tid, page: page })
  );
  var items = (data && data.items) || [];
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var item = toItem(base, items[i]);
    if (item) out.push(item);
  }
  return out;
}

async function search(params) {
  params = params || {};
  var base = cfg(params);
  var kw = t(params.keyword);
  if (!kw) return [];
  var page = Number(params.page || 1) || 1;
  var data = await httpJson(
    base + "/api/v1/providers/hongguo/search" + qs({ q: kw, page: page })
  );
  var items = (data && data.items) || [];
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var item = toItem(base, items[i]);
    if (item) out.push(item);
  }
  return out;
}

function extractLink(v) {
  // 兼容字符串 / {link}/{id} 对象两种传参
  if (v && typeof v === "object") return t(v.link || v.videoUrl || v.id || v.url || "");
  return t(v);
}
// Stable series URL and distinct episode URLs carrying season/episode.
// Expiring playback tokens appear only in videoUrl, never in id or link.
function makeLink(base, sid, episode, season) {
  var url = base + "/api/v1/providers/hongguo/items/" + encodeURIComponent(t(sid));
  return episode ? url + "#s=" + (season || 1) + "&e=" + episode : url;
}
function number(v) {
  var n = Number(v);
  return isFinite(n) && n > 0 && Math.floor(n) === n ? n : 0;
}
function parseLink(link) {
  var s = t(link).replace(/^hongguo:/, "hguo:");
  var match = s.match(/^(https?:\/\/.+?)\/api\/v1\/providers\/hongguo\/items\/([^/?#]+)(?:#s=(\d+)&e=(\d+))?$/i);
  if (match) return { sid: decodeURIComponent(match[2]), apiBase: match[1], season: number(match[3]), episode: number(match[4]), streamUrl: "" };
  // Read earlier saved links; newly returned items always use stable URLs.
  if (s.indexOf("hguo:v2:") === 0) {
    try {
      var value = JSON.parse(decodeURIComponent(s.slice(8)));
      return { sid: t(value.sid), apiBase: t(value.apiBase), streamUrl: t(value.streamUrl) };
    } catch (e) { throw new Error("剧集链接无效，请刷新列表后重新打开"); }
  }
  if (/^https?:\/\//i.test(s)) return { sid: "", apiBase: "", streamUrl: s };
  if (s.indexOf("hguo:") === 0) s = s.slice(5);
  var colon = s.indexOf(":");
  var tail = colon < 0 ? "" : s.slice(colon + 1);
  var ep = tail.match(/^ep-(\d+)$/);
  return { sid: colon < 0 ? s : s.slice(0, colon), apiBase: "", episode: ep ? number(ep[1]) : 0, streamUrl: /^https?:\/\//i.test(tail) ? tail : "" };
}
function detailBase(params, item, parsed) {
  return cfg({ apiBase: t(params && params.apiBase) || t(item && item.apiBase) || parsed.apiBase });
}
function flattenEpisodes(data) {
  var out = [];
  var seasons = Array.isArray(data.seasons) ? data.seasons : [];
  for (var s = 0; s < seasons.length; s++) {
    var arr = Array.isArray(seasons[s].episodes) ? seasons[s].episodes : [];
    for (var e = 0; e < arr.length; e++) out.push({
      value: arr[e], season: number(arr[e].seasonNumber) || number(seasons[s].seasonNumber) || s + 1,
      episode: number(arr[e].episodeNumber) || e + 1
    });
  }
  if (!out.length && Array.isArray(data.episodes)) {
    for (var i = 0; i < data.episodes.length; i++) out.push({
      value: data.episodes[i], season: number(data.episodes[i].seasonNumber) || 1,
      episode: number(data.episodes[i].episodeNumber) || i + 1
    });
  }
  return out;
}

function detailLog(message) {
  if (typeof console !== "undefined" && typeof console.log === "function") {
    console.log("[红果详情] " + message);
  }
}

async function testDetail(params) {
  params = params || {};
  var base = cfg(params);
  var sid = t(params.seriesId) || "7690487702315076670";
  detailLog("测试开始 seriesId=" + sid);
  var detail = await loadDetail(makeLink(base, sid));
  if (!detail || !Array.isArray(detail.episodeItems) || !detail.episodeItems.length) {
    throw new Error("详情测试未返回分集，请查看 [红果详情] 日志");
  }
  var playable = detail.episodeItems.filter(function (ep) { return !!t(ep.videoUrl); }).length;
  detailLog("测试通过 title=" + detail.title + " episodes=" + detail.episodeItems.length + " playable=" + playable);
  return [detail];
}

async function loadDetail(link, params) {
  // Log callback shape without exposing API credentials or playback tokens.
  detailLog("回调进入 version=" + WidgetMetadata.version + " input=" + typeof link +
    " keys=" + (link && typeof link === "object" ? Object.keys(link).join(",") : ""));
  var p, base;
  try {
    p = parseLink(extractLink(link));
    if (!p.sid) throw new Error("详情回调缺少剧集 ID，请刷新列表后重新打开");
    base = detailBase(params, link, p);
  } catch (error) {
    detailLog("回调参数解析失败");
    throw error;
  }
  var started = Date.now();
  detailLog("请求开始 seriesId=" + p.sid);
  var data;
  try {
    data = await httpJson(base + "/api/v1/providers/hongguo/items/" + encodeURIComponent(p.sid));
    detailLog("请求返回 elapsedMs=" + (Date.now() - started));
  } catch (error) {
    detailLog("请求失败 elapsedMs=" + (Date.now() - started) + " error=" + t(error && error.message));
    throw error;
  }
  var d = data || {};
  var cover = t(d.posterUrl || "");
  var eps = flattenEpisodes(d);
  var seriesLink = makeLink(base, p.sid);
  var episodeItems = [];
  for (var i = 0; i < eps.length; i++) {
    var entry = eps[i], ep = entry.value;
    episodeItems.push({
      id: "hguo:" + p.sid + ":" + (t(ep.id) || "s" + entry.season + "-ep-" + entry.episode),
      type: "url",
      // Playback history uses the selected item's title; episode numbers are separate.
      title: t(d.title) || p.sid,
      description: t(ep.title) || "第" + entry.episode + "集",
      coverUrl: cover,
      posterPath: cover,
      mediaType: "tv",
      season: entry.season,
      episode: entry.episode,
      seasonNumber: entry.season,
      episodeNumber: entry.episode,
      link: makeLink(base, p.sid, entry.episode, entry.season),
      // Keep direct playback compatibility for clients that require videoUrl
      // to display episodeItems. loadResource can still refresh it at playback.
      videoUrl: t(ep.streamUrl),
      playerType: "app"
    });
  }
  detailLog("分集转换完成 episodes=" + episodeItems.length + " elapsedMs=" + (Date.now() - started));
  var initialEpisode = episodeItems[0];
  if (p.episode) {
    initialEpisode = null;
    for (var j = 0; j < episodeItems.length; j++) {
      if (episodeItems[j].episode === p.episode && episodeItems[j].season === (p.season || 1)) {
        initialEpisode = episodeItems[j]; break;
      }
    }
    if (!initialEpisode) throw new Error("指定分集不存在，请刷新详情");
  }
  return {
    id: "hguo:" + p.sid,
    type: "detail",
    title: t(d.title) || p.sid,
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    description: t(d.description || "") + (d.episodeCount ? "　全" + d.episodeCount + "集" : ""),
    mediaType: "tv",
    episode: episodeItems.length,
    videoUrl: initialEpisode ? initialEpisode.videoUrl : "",
    playerType: "app",
    link: seriesLink,
    episodeItems: episodeItems
  };
}

async function loadResource(params) {
  params = params || {};
  var raw = extractLink(params);
  // Ignore player simulator placeholders before requiring API configuration.
  if (raw.indexOf("hguo:") !== 0 && raw.indexOf("hongguo:") !== 0 && !/^https?:\/\//i.test(raw)) return [];
  var p = parseLink(raw);
  var selectedId = parseLink(params && params.id);
  var streamUrl = p.streamUrl;
  if (!/^https?:\/\//i.test(t(streamUrl))) {
    if (!p.sid) return [];
    var base = detailBase(params, null, p);
    var data = await httpJson(makeLink(base, p.sid));
    var entries = flattenEpisodes(data);
    var sameSeries = selectedId.sid === p.sid;
    // A self-contained episode link takes precedence over stale parent context.
    var selectedRef = p.episode ? p : (sameSeries && selectedId.episode ? selectedId : null);
    var episode = selectedRef ? selectedRef.episode : number(params.episode) || number(params.episodeNumber);
    var season = selectedRef ? selectedRef.season || 1 : number(params.season) || number(params.seasonNumber) || 1;
    var selected = null;
    if (episode) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].episode === episode && entries[i].season === season) { selected = entries[i]; break; }
      }
      if (!selected) throw new Error("未找到第" + season + "季第" + episode + "集，请刷新详情");
    } else selected = entries[0];
    streamUrl = selected && t(selected.value.streamUrl);
  }
  if (!/^https?:\/\//i.test(t(streamUrl))) return [];
  return [{
    name: "红果短剧",
    description: "",
    url: streamUrl,
    playerType: "app",
    customHeaders: {
      "X-Forward-Skip-Redirect-Probe": "1"
    }
  }];
}

  return {
    loadList: loadList,
    search: search,
    loadDetail: loadDetail,
    loadResource: loadResource
  };
})();

// ============ 黄果（直连抓取源） ============
const Huangguo = (() => {
// ============ 常量 ============
const HUANGGUO_SITE = "https://huangguoai.com";
const HUANGGUO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const HUANGGUO_FALLBACK_COVER = HUANGGUO_SITE + "/favicon.ico";
const MAX_EPISODES = 300;
const EP_FETCH_CONCURRENCY = 6;
const DETAIL_LINK_PREFIX = "hg://detail/";
const STORAGE_KEY_WORKER = "hg_cover_worker";

// 封面解密 Worker 地址（代码内默认值，默认留空，不要内置任何人的私有 Worker）：
// 推荐在 App 的模块设置「封面代理(Worker)地址」里填写（优先级最高，无需改脚本）；
// 不方便前端配置时，也可直接把地址填到下面引号内。两者都为空则使用原始封面地址。
const HUANGGUO_COVER_WORKER_URL = "";

function normalizeWorker(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

// 运行期生效的 Worker：前端全局参数 > 脚本常量；另持久化到 storage，保证冷启动直接进详情也有效
let ACTIVE_COVER_WORKER = normalizeWorker(HUANGGUO_COVER_WORKER_URL);

const HUANGGUO_SORT_PARAM = {
  name: "channel",
  title: "排序",
  type: "enumeration",
  description: "选择内容排序",
  value: "latest",
  enumOptions: [
    { title: "最新更新", value: "latest" },
    { title: "当前热播", value: "hot" },
    { title: "独家原创", value: "original" },
    { title: "随机推荐", value: "random" }
  ]
};

// 共享的排序参数挂到四个频道模块（metadata 必须保持纯字面量、首条声明）
["hg_ai_duanju", "hg_ai_manju", "hg_ai_huanlian", "hg_ai_mogai"].forEach(moduleId => {
  const mod = WidgetMetadata.modules.find(m => m.id === moduleId);
  if (mod) mod.params = [HUANGGUO_SORT_PARAM].concat(mod.params || []);
});

const SECTION_URLS = {
  recommend: HUANGGUO_SITE + "/recommend",
  newest: HUANGGUO_SITE + "/newest",
  aiDuanju: HUANGGUO_SITE + "/ai-duanju/",
  aiManju: HUANGGUO_SITE + "/ai-manju/",
  aiHuanlian: HUANGGUO_SITE + "/ai-huanlian/",
  aiMogai: HUANGGUO_SITE + "/ai-mogai/"
};

const HUANGGUO_RANKING_URLS = {
  hot: HUANGGUO_SITE + "/ranks/hot/",
  recommend: HUANGGUO_SITE + "/ranks/recommend/",
  potential: HUANGGUO_SITE + "/ranks/potential/"
};

function applySettings(params) {
  const fromFrontend = normalizeWorker(params && params.coverWorker);
  ACTIVE_COVER_WORKER = fromFrontend || normalizeWorker(HUANGGUO_COVER_WORKER_URL);
  try {
    if (Widget.storage) Widget.storage.set(STORAGE_KEY_WORKER, ACTIVE_COVER_WORKER);
  } catch (error) { /* 旧版无 storage 时忽略 */ }
}

// 取当前生效的 Worker：内存值 > storage 记忆（冷启动进详情的兜底）> 脚本常量
function currentWorker() {
  if (ACTIVE_COVER_WORKER) return ACTIVE_COVER_WORKER;
  try {
    if (Widget.storage) ACTIVE_COVER_WORKER = normalizeWorker(Widget.storage.get(STORAGE_KEY_WORKER));
  } catch (error) { /* ignore */ }
  return ACTIVE_COVER_WORKER || normalizeWorker(HUANGGUO_COVER_WORKER_URL);
}

function pageNumber(params) {
  const page = parseInt(params && params.page, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function absoluteUrl(value, baseUrl) {
  const url = String(value || "").trim().replace(/&amp;/g, "&");
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^\/\//.test(url)) return "https:" + url;
  const base = baseUrl || (HUANGGUO_SITE + "/");
  if (url.charAt(0) === "/") {
    const originMatch = base.match(/^(https?:\/\/[^/]+)/i);
    return (originMatch ? originMatch[1] : HUANGGUO_SITE) + url;
  }
  const baseDir = base.replace(/[?#].*$/, "").replace(/\/[^/]*$/, "/");
  return baseDir + url;
}

function coverUrl(value) {
  const source = String(value || "").trim();
  const worker = currentWorker();
  if (!source || !worker || /^data:|^blob:/i.test(source) || source.indexOf(worker) === 0) return source;
  // 封面 CDN（pic.fisawck.cn）带 auth_key 的时效直链，App 图片加载器不带 Referer / 手机可能够不到，
  // 直出加载不到。需经"加 Referer 的透传代理 Worker"中转（Cloudflare 边缘能从云端够到该 CDN 并加 Referer）。
  // 故配了 Worker 就一律套；未配 Worker 才直出（best-effort）。
  return worker + (worker.indexOf("?") >= 0 ? "&" : "?") + "url=" + encodeURIComponent(source);
}

function hasUsableCover(value) {
  const cover = String(value || "").trim();
  return !!cover && cover !== HUANGGUO_FALLBACK_COVER &&
    !/^blob:|^data:/i.test(cover) &&
    !/cover-placeholder|avatar-default/i.test(cover);
}

// ForwardWidget 详情页只回传列表项的 link 字符串，列表封面通过 link 的 cover 参数携带
function makeDetailLink(id, poster) {
  let link = DETAIL_LINK_PREFIX + id + "/";
  if (poster) link += "?cover=" + encodeURIComponent(poster);
  return link;
}

function parseDetailLink(link) {
  const match = String(link || "").match(/^hg:\/\/detail\/(\d+)\/?/i);
  if (!match) return null;
  const coverMatch = String(link || "").match(/[?&]cover=([^&#]*)/i);
  let cover = "";
  if (coverMatch) {
    try { cover = decodeURIComponent(coverMatch[1] || ""); } catch (error) { cover = coverMatch[1] || ""; }
  }
  return { id: match[1], cover: cover };
}

function detailPageUrl(id) {
  return HUANGGUO_SITE + "/video/" + id + "/";
}

function episodePageUrl(id, episode) {
  const ep = parseInt(episode, 10) || 1;
  return HUANGGUO_SITE + "/video/" + id + "/ep-" + ep + "/";
}

function requestHeaders(referer) {
  return {
    "User-Agent": HUANGGUO_UA,
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    "Referer": referer || (HUANGGUO_SITE + "/")
  };
}

// ForwardWidget 运行环境不保证 fetch 存在，统一走 Widget.http
async function fetchPage(url, referer) {
  const requestUrl = String(url || "").replace(/^https?:\/\/[^/]+/i, HUANGGUO_SITE);
  try {
    const response = await Widget.http.get(requestUrl, {
      headers: requestHeaders(referer || (HUANGGUO_SITE + "/")),
      timeout: 30000
    });
    if (response && response.data !== null && response.data !== undefined) {
      return typeof response.data === "string" ? response.data : String(response.data);
    }
  } catch (error) {
    console.warn("黄果请求失败", requestUrl, error && error.message ? error.message : error);
  }
  return "";
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

function sortChannel(params) {
  const value = String((params && params.channel) || "latest");
  return ["latest", "hot", "original", "random"].indexOf(value) >= 0 ? value : "latest";
}

function withPage(url, page, channel) {
  const separator = url.indexOf("?") >= 0 ? "&" : "?";
  const pagePart = "page=" + (page && page > 1 ? page : 1);
  const widgetPath = url.replace(/^https?:\/\/[^/]+/i, "") + (channel ? "?sort=" + channel : "");
  return url + separator + pagePart + "&_hg_widget=" + encodeURIComponent(widgetPath);
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-|_]\s*(黄果短剧|黄果AI|黄果影视).*$/i, "")
    .trim();
}

// 统一的列表 VideoItem（type 必须为 "url"，靠 link 调顶层 loadDetail）
function buildCardVideoItem(args) {
  return {
    id: args.link,
    type: "url",
    mediaType: "tv",
    title: args.title,
    description: args.description || "",
    posterPath: args.poster,
    backdropPath: args.poster,
    coverUrl: args.poster,
    durationText: args.durationText || "",
    rating: args.rating,
    link: args.link
  };
}

// 从一段 HTML（卡片块）中提取封面地址，覆盖 WebView 渲染后与懒加载两种形态：
// 1) <img> 的 data-src/data-lazy-src/data-original/data-bg/data-cover/.../srcset/src
// 2) 容器上的 data-* 图片属性
// 3) style="background-image:url(...)"
// 4) 兜底：块内任意图片直链
function extractImageValue(block) {
  const source = String(block || "");
  const usable = value => {
    const v = String(value || "").trim().replace(/&amp;/g, "&");
    return v && !/^blob:|^data:|^javascript:/i.test(v) ? v : "";
  };
  const fromAttrs = tag => {
    const names = ["data-src", "data-lazy-src", "data-original", "data-bg", "data-cover",
      "data-poster", "data-image", "data-thumb", "data-srcset", "srcset", "src"];
    for (const name of names) {
      const hit = tag.match(new RegExp("\\b" + name + "\\s*=\\s*[\\\"']([^\\\"']+)", "i"));
      if (hit) {
        // srcset 形如 "url 1x, url2 2x"，取第一个 URL
        const first = String(hit[1]).split(",")[0].trim().split(/\s+/)[0];
        const v = usable(first);
        if (v) return v;
      }
    }
    return "";
  };

  const img = source.match(/<img\b[^>]*>/i);
  if (img) {
    const v = fromAttrs(img[0]);
    if (v) return v;
  }
  const dataAny = source.match(/\b(?:data-src|data-lazy-src|data-original|data-bg|data-cover|data-poster|data-image|data-thumb)=["']([^"']+)["']/i);
  if (dataAny) {
    const v = usable(dataAny[1]);
    if (v) return v;
  }
  const bg = source.match(/background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
  if (bg) {
    const v = usable(bg[1]);
    if (v) return v;
  }
  const bare = source.match(/https?:[^\s"'<>()]+?\.(?:jpg|jpeg|png|webp)(?:[?#][^\s"'<>()]*)?/i);
  return bare ? usable(bare[0]) : "";
}

// ============ 封面诊断（排查封面不显示时临时改 true；正常保持 false）============
const HUANGGUO_DEBUG_COVER = false;
function hgDebugCover(label, block, extractedRaw, finalPoster) {
  if (!HUANGGUO_DEBUG_COVER) return;
  try {
    const b = String(block || "");
    const markers = [];
    if (/<img\b/i.test(b)) markers.push("has-img");
    if (/data-src=/i.test(b)) markers.push("has-data-src");
    if (/data-lazy-src=/i.test(b)) markers.push("has-data-lazy-src");
    if (/data-original=/i.test(b)) markers.push("has-data-original");
    if (/data-cover=/i.test(b)) markers.push("has-data-cover");
    if (/data-poster=/i.test(b)) markers.push("has-data-poster");
    if (/data-bg=/i.test(b)) markers.push("has-data-bg");
    if (/background-image/i.test(b)) markers.push("has-bg-image");
    if (/\bsrc=/i.test(b)) markers.push("has-src");
    console.log("===== [黄果封面诊断/" + label + "] =====");
    console.log("[标记] " + (markers.join(", ") || "无任何图片标记 —— 封面可能由 JS 注入，原始 HTML 无图地址"));
    console.log("[提取原始值] " + JSON.stringify(extractedRaw));
    console.log("[最终 posterPath] " + finalPoster);
    console.log("[当前 Worker] " + (currentWorker() || "(空 —— 未配置封面代理 Worker)"));
    console.log("[卡片原始HTML 前800字]\n" + b.slice(0, 800));
    console.log("===== [/黄果封面诊断/" + label + "] =====");
  } catch (e) { /* 诊断本身不影响主流程 */ }
}

function parseCards(html, pageUrl, channel) {
  const rawHtml = String(html || "");
  const source = extractVisibleCardRegion(rawHtml, channel);
  const items = [];
  const seen = {};

  const cardRe = /<div\b[^>]*class=["'][^"']*\bhg-drama-card\b[^"']*["'][^>]*>/gi;
  const starts = [];
  let match;
  while ((match = cardRe.exec(source))) starts.push(match.index);

  const attr = (text, name) => {
    const re = new RegExp("\\b" + name + "\\s*=\\s*[\\\"']([^\\\"']*)", "i");
    const hit = String(text || "").match(re);
    return hit ? decodeBasicEntities(hit[1]) : "";
  };
  const fragment = (block, selector) => {
    const re = new RegExp("<[^>]*class=[\\\"'][^\\\"']*" + selector + "[^\\\"']*[\\\"'][^>]*>([\\s\\S]*?)<\\/", "i");
    const hit = String(block || "").match(re);
    return hit ? stripBasicTags(hit[1]) : "";
  };
  const image = block => {
    const value = extractImageValue(String(block || ""));
    return value ? coverUrl(absoluteUrl(value, pageUrl)) : HUANGGUO_FALLBACK_COVER;
  };

  for (let index = 0; index < starts.length; index++) {
    const block = source.slice(starts[index], starts[index + 1] || source.length);
    const hrefMatch = block.match(/href=["'](?:https?:\/\/huangguoai\.com)?\/(?:detail|video)\/(\d+)\/?["']/i);
    if (!hrefMatch) continue;
    const id = hrefMatch[1];
    if (seen[id]) continue;
    const imageTag = block.match(/<img\b[^>]*>/i);
    const title = cleanTitle(attr(block, "data-track-title") || fragment(block, "hg-drama-card__title") || attr(imageTag ? imageTag[0] : "", "alt"));
    if (!title) continue;
    const scoreText = fragment(block, "hg-drama-card__score");
    const episodeText = fragment(block, "hg-drama-card__episode");
    const description = fragment(block, "hg-drama-card__desc");
    const posterPath = image(block);
    if (index === 0) hgDebugCover("recommend", block, extractImageValue(String(block || "")), posterPath);
    const link = makeDetailLink(id, posterPath);
    seen[id] = true;
    items.push(buildCardVideoItem({
      link: link,
      title: title,
      description: description || (episodeText ? "集数: " + episodeText : ""),
      poster: posterPath,
      durationText: episodeText,
      rating: scoreText ? parseFloat(scoreText.replace(/[^0-9.]/g, "")) || undefined : undefined
    }));
  }

  return items;
}

function extractVisibleCardRegion(html, channel) {
  let source = String(html || "");
  const selectedChannel = ["latest", "hot", "original", "random"].indexOf(String(channel || "latest")) >= 0 ? String(channel || "latest") : "latest";
  if (selectedChannel === "latest") source = source.replace(/<template\b[\s\S]*?<\/template>/gi, "");

  const aliases = {
    latest: ["latest", "newest", "recent"],
    hot: ["hot", "popular", "trending", "top"],
    original: ["original", "exclusive"],
    random: ["random", "recommend", "recommended"]
  }[selectedChannel];
  const grids = [];
  const gridRe = /<div\b[^>]*class=["'][^"']*\bhg-card-grid\b[^"']*["'][^>]*>/gi;
  let gridMatch;
  while ((gridMatch = gridRe.exec(source))) grids.push({ index: gridMatch.index, tag: gridMatch[0] });
  let activeGrid = null;
  for (const grid of grids) {
    const tag = grid.tag.toLowerCase();
    if (selectedChannel === "latest" && /\bis-active\b/i.test(tag)) {
      activeGrid = grid;
      break;
    }
    if (aliases.some(alias => new RegExp("(?:data-channel-panel|data-channel|data-sort|data-tab|id)=[\\\"'][^\\\"']*" + alias + "[^\\\"']*[\\\"']", "i").test(tag))) {
      activeGrid = grid;
      break;
    }
  }
  if (!activeGrid && selectedChannel !== "latest") {
    const fallbackIndex = { hot: 1, original: 2, random: 3 }[selectedChannel];
    if (fallbackIndex !== undefined && grids[fallbackIndex]) activeGrid = grids[fallbackIndex];
  }
  if (activeGrid) {
    const tail = source.slice(activeGrid.index);
    const endMatch = tail.match(/<div\b[^>]*class=["'][^"']*\bhg-channel-pager\b[^"']*["'][^>]*>/i);
    return endMatch ? tail.slice(0, endMatch.index) : tail;
  }

  const firstGrid = source.match(/<div\b[^>]*class=["'][^"']*\bhg-card-grid\b[^"']*["'][^>]*>/i);
  if (firstGrid) {
    const tail = source.slice(firstGrid.index);
    const nextGrid = tail.slice(1).search(/<div\b[^>]*class=["'][^"']*\bhg-card-grid\b/i);
    return nextGrid >= 0 ? tail.slice(0, nextGrid + 1) : tail;
  }

  return source;
}

function stripBasicTags(value) {
  return decodeBasicEntities(String(value || "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeBasicEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

async function loadList(url, params, enableChannel) {
  try {
    const channel = enableChannel ? sortChannel(params) : "";
    const html = await fetchPage(withPage(url, pageNumber(params), channel), (params && params.referer) || (HUANGGUO_SITE + "/"));
    if (!html) return [];
    return parseCards(html, url, channel);
  } catch (error) {
    console.warn("黄果列表解析失败", url, error && error.message ? error.message : error);
    return [];
  }
}

async function loadRecommend(params = {}) {
  applySettings(params);
  return await loadList(SECTION_URLS.recommend, params);
}

async function loadNewest(params = {}) {
  applySettings(params);
  return await loadList(SECTION_URLS.newest, params);
}

async function loadAiDuanju(params = {}) {
  applySettings(params);
  return await loadList(SECTION_URLS.aiDuanju, params, true);
}

async function loadAiManju(params = {}) {
  applySettings(params);
  return await loadList(SECTION_URLS.aiManju, params, true);
}

async function loadAiHuanlian(params = {}) {
  applySettings(params);
  return await loadList(SECTION_URLS.aiHuanlian, params, true);
}

async function loadAiMogai(params = {}) {
  applySettings(params);
  return await loadList(SECTION_URLS.aiMogai, params, true);
}

async function loadTopics(params = {}) {
  applySettings(params);
  const key = String((params && params.topic) || "hot-aiduanju");
  const topicValues = [
    "hot-aiduanju",
    "luanlun-aiduanju",
    "paranormal-aiduanju",
    "oumei-duanju",
    "magic-drama",
    "mingxing-huanlian"
  ];
  const topic = topicValues.indexOf(key) >= 0 ? key : "hot-aiduanju";
  return await loadList(HUANGGUO_SITE + "/topics/" + topic + "/", params);
}

async function loadRanking(params = {}) {
  applySettings(params);
  const key = String((params && params.ranking) || "hot");
  const url = HUANGGUO_RANKING_URLS[key] || HUANGGUO_RANKING_URLS.hot;
  try {
    const html = await fetchPage(withPage(url, pageNumber(params)), HUANGGUO_SITE + "/");
    if (!html) return [];
    return parseRankingCards(html, url);
  } catch (error) {
    console.warn("黄果排行榜解析失败", key, error && error.message ? error.message : error);
    return [];
  }
}

function parseRankingCards(html, pageUrl) {
  const source = String(html || "");
  const matches = [];
  const itemRe = /<div\b[^>]*class=["'][^"']*\bhg-rank-item\b[^"']*["'][^>]*\bdata-rank-item\b[^>]*>/gi;
  let match;
  while ((match = itemRe.exec(source))) matches.push({ index: match.index, tag: match[0] });

  const items = [];
  const seen = {};
  for (let index = 0; index < matches.length; index++) {
    const start = matches[index].index;
    const end = matches[index + 1] ? matches[index + 1].index : source.length;
    const block = source.slice(start, end);
    const id = rankAttribute(matches[index].tag, "data-track-id");
    const title = cleanTitle(rankAttribute(matches[index].tag, "data-track-title"));
    if (!id || !title || seen[id]) continue;
    seen[id] = true;
    const synopsis = rankText(block, "hg-rank-item__desc");
    const ratingMatch = block.match(/(?:^|[^\d])([0-9]+(?:\.[0-9]+)?)\s*分(?:[^\d]|$)/i);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;
    const poster = rankImage(block, pageUrl) || HUANGGUO_FALLBACK_COVER;
    if (index === 0) hgDebugCover("ranking", block, rankImage(block, pageUrl), poster);
    items.push(buildCardVideoItem({
      link: makeDetailLink(id, poster),
      title: title,
      description: synopsis,
      poster: poster,
      rating: rating
    }));
  }
  return items;
}

function rankAttribute(tag, name) {
  const match = String(tag || "").match(new RegExp("\\b" + name + "=[\\\"']([^\\\"']*)", "i"));
  return match ? decodeBasicEntities(match[1]) : "";
}

function rankText(block, className) {
  const match = String(block || "").match(new RegExp("<[^>]*class=[\\\"'][^\\\"']*" + className + "[^\\\"']*[\\\"'][^>]*>([\\s\\S]*?)</", "i"));
  return match ? stripBasicTags(match[1]) : "";
}

function rankImage(block, pageUrl) {
  const source = String(block || "");
  const candidates = [];
  const pushAll = (re, text) => {
    let m;
    while ((m = re.exec(text))) candidates.push(m[1] || m[0]);
  };
  pushAll(/\b(?:data-src|data-lazy-src|data-original|data-image|data-cover|data-poster|data-thumb|content)=["']([^"']+)["']/gi, source);
  pushAll(/\bsrc=["']([^"']+)["']/gi, source);
  pushAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi, source);
  pushAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?/ig, source);
  for (const candidate of candidates) {
    const value = absoluteUrl(decodeBasicEntities(candidate), pageUrl);
    if (value && !/^blob:|^data:/i.test(value)) return coverUrl(value);
  }
  return "";
}

async function searchVideos(params = {}) {
  applySettings(params);
  const keyword = String((params && params.keyword) || "").trim();
  if (!keyword) return [];
  const page = pageNumber(params);
  const urls = [
    HUANGGUO_SITE + "/search/?keyword=" + encodeURIComponent(keyword),
    HUANGGUO_SITE + "/search/video/" + encodeURIComponent(keyword) + "/"
  ];
  for (const url of urls) {
    const result = await loadList(url, { page: page, referer: HUANGGUO_SITE + "/" });
    if (result.length) return result;
  }
  return [];
}

// ============ 播放地址解析（多重兜底，详情页与起播时共用）============

function isPlayableUrl(value) {
  const url = String(value || "").replace(/&amp;/g, "&");
  return /^https?:\/\//i.test(url) && /\.(?:m3u8|mp4|flv|ts)(?:[?#]|$)/i.test(url) && !/^blob:|^javascript:/i.test(url);
}

// 从任意文本里提取播放地址，按可信度排序尝试多种结构
function extractPlayUrl(html, pageUrl) {
  const raw = String(html || "");
  const unescaped = raw.replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/\\u0026/g, "&");

  const tryPick = (url) => {
    const candidate = absoluteUrl(url, pageUrl);
    return isPlayableUrl(candidate) ? candidate : "";
  };

  // 1) videoInitialData JSON（老结构）
  const initial = extractVideoInitialData(raw);
  if (initial && typeof initial === "object") {
    const directKeys = ["videoSrc", "previewSrc", "url", "playUrl", "videoUrl", "play_url", "video_url", "src", "file"];
    for (const key of directKeys) {
      if (isPlayableUrl(initial[key])) return tryPick(initial[key]);
    }
    const maps = ["epPlaySrcs", "playSrcs", "episodes", "sources"];
    for (const mapKey of maps) {
      const map = initial[mapKey];
      if (map && typeof map === "object") {
        for (const k of Object.keys(map)) {
          const v = map[k];
          const candidate = typeof v === "string" ? v : (v && (v.url || v.src || v.file || v.videoUrl));
          if (isPlayableUrl(candidate)) return tryPick(candidate);
        }
      }
    }
  }

  // 2) 常见 JSON 字段（含转义斜杠），如 "videoSrc":"https:\/\/...\/x.m3u8"
  const jsonFieldRe = /["']?(?:videoSrc|previewSrc|playUrl|play_url|videoUrl|video_url|playSrc|mediaUrl|media_url|file|src|url)["']?\s*:\s*["']([^"']{8,}?)["']/gi;
  let m;
  while ((m = jsonFieldRe.exec(unescaped))) {
    const candidate = tryPick(m[1]);
    if (candidate) return candidate;
  }

  // 3) sources / playlist 数组片段
  const arrayRe = /(?:sources|playLists?|playlist|videos)\s*:\s*\[([\s\S]{0,3000}?)\]/gi;
  while ((m = arrayRe.exec(unescaped))) {
    const inner = m[1];
    const urlRe = /https?:[^\s"'<>,\\]+?\.(?:m3u8|mp4|flv|ts)(?:[^\s"'<>,\\]*)?/ig;
    let u;
    while ((u = urlRe.exec(inner))) {
      const candidate = tryPick(u[0]);
      if (candidate) return candidate;
    }
  }

  // 4) og:video meta
  const og = raw.match(/<meta\b[^>]*(?:property|name)=["']og:video(?::url)?["'][^>]*content=["']([^"']+)["']/i)
    || raw.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:video(?::url)?["']/i);
  if (og) {
    const candidate = tryPick(og[1]);
    if (candidate) return candidate;
  }

  // 5) 页面里任意直链（m3u8 优先于 mp4）
  const bare = unescaped.match(/https?:[^\s"'<>,\\]+?\.m3u8(?:[^\s"'<>,\\]*)?/i)
    || unescaped.match(/https?:[^\s"'<>,\\]+?\.(?:mp4|flv)(?:[^\s"'<>,\\]*)?/i);
  if (bare) {
    const candidate = tryPick(bare[0]);
    if (candidate) return candidate;
  }

  return "";
}

function extractVideoInitialData(html) {
  const match = String(html || "").match(/<script\b[^>]*id=["']videoInitialData["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  const raw = String(match[1] || "").trim();
  const variants = [raw, raw.replace(/\\u0026/g, "&"), decodeBasicEntities(raw)];
  for (const value of variants) {
    try { return JSON.parse(value); } catch (error) { continue; }
  }
  return null;
}

function durationSeconds(value) {
  const text = String(value || "");
  const iso = text.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) {
    return (parseInt(iso[1] || "0", 10) * 3600) + (parseInt(iso[2] || "0", 10) * 60) + parseInt(iso[3] || "0", 10);
  }
  const seconds = parseInt(text, 10);
  return Number.isFinite(seconds) && seconds > 0 && seconds < 200000 ? seconds : 0;
}

function episodeNumber(text, fallback) {
  const value = String(text || "");
  const match = value.match(/(?:第\s*)?(\d{1,4})(?:\s*(?:集|话|期|章|集数))?/i);
  return match ? parseInt(match[1], 10) : fallback;
}

// 解析某一集播放页，返回 { pageUrl, videoUrl, title, duration, description }
async function resolveEpisodePlay(detailId, episode) {
  const ep = parseInt(episode, 10) || 1;
  const pageUrl = episodePageUrl(detailId, ep);
  const result = { pageUrl: pageUrl, videoUrl: "", duration: 0, title: "", description: "" };
  try {
    const html = await fetchPage(pageUrl, detailPageUrl(detailId));
    if (!html) return result;
    result.videoUrl = extractPlayUrl(html, pageUrl);
    const initial = extractVideoInitialData(html) || {};
    result.duration = durationSeconds(initial.duration);
    result.title = cleanTitle(initial.title || "");
    result.description = String(initial.description || "").trim();
  } catch (error) {
    console.warn("黄果剧集解析失败", pageUrl, error && error.message ? error.message : error);
  }
  return result;
}

// 详情页发现剧集：优先 data-ep-id 锚点，其次任意 /video/{id}/ep-N 链接，再次 JSON 数据岛
function discoverEpisodes(detailHtml, detailId) {
  const source = String(detailHtml || "");
  const episodes = [];
  const seen = {};
  const add = (number) => {
    const ep = parseInt(number, 10);
    if (!Number.isFinite(ep) || ep < 1 || seen[ep]) return;
    seen[ep] = true;
    episodes.push({ episode: ep });
  };

  let m;
  // 匹配 <a href="/video/{id}/ep-N/" data-ep-id="N"> 或 <a data-ep-id="N" href="/video/{id}/ep-N/">
  const dataEpRe = /<a\b[^>]*(?:href=["']([^"']*\/video\/\d+\/(?:ep-(\d+)\/?)?)["'][^>]*data-ep-id=["'](\d+)["']|data-ep-id=["'](\d+)["'][^>]*href=["']([^"']*\/video\/\d+\/(?:ep-(\d+)\/?)?)["'])[^>]*>/gi;
  while ((m = dataEpRe.exec(source))) add(m[3] || m[2] || m[4] || m[6] || "1");

  if (!episodes.length) {
    const hrefRe = /(?:href|data-href|data-url)\s*=\s*["'][^"']*\/video\/\d+\/(?:ep-(\d+)\/?)?["']/gi;
    let index = 0;
    while ((m = hrefRe.exec(source))) {
      add(m[1] || (++index));
    }
  }

  if (!episodes.length) {
    // JSON 数据岛：episodes:[{...}] 或 epList 等，提取 episode/ep/id/episode_id 字段与内嵌链接
    const islandRe = /["'](?:episodes|epList|episode_list|playList|videos)["']?\s*:\s*(\[[\s\S]{0,50000}?\])\s*[,}\]]/gi;
    while ((m = islandRe.exec(source))) {
      let arr = null;
      try { arr = JSON.parse(m[1].replace(/\\\//g, "/")); } catch (error) { continue; }
      if (!Array.isArray(arr)) continue;
      arr.forEach((item, index) => {
        if (typeof item === "number") return add(item);
        if (typeof item === "string") {
          const linkMatch = item.match(/\/video\/\d+\/(?:ep-(\d+)\/?)?/i);
          return add(linkMatch ? (linkMatch[1] || index + 1) : index + 1);
        }
        if (item && typeof item === "object") {
          // 集数从 1 开始，|| 兜底安全；不使用 ?? 以兼容旧版 App 的 JS 引擎
          const num = item.episode || item.ep || item.episode_id || item.episodeId || item.id || (index + 1);
          add(num);
        }
      });
      if (episodes.length) break;
    }
  }

  // 页内只有内嵌单视频时当作第 1 集
  if (!episodes.length && extractPlayUrl(source, detailPageUrl(detailId))) add(1);

  return episodes.map(e => e.episode).sort((a, b) => a - b).slice(0, MAX_EPISODES);
}

// ForwardWidget 只有扁平 episodeItems
function buildEpisodeItems(detailId, episodes, playResults, poster) {
  return episodes.map((ep, index) => {
    const data = playResults[index] || {};
    const videoUrl = data.videoUrl || "";
    return {
      id: data.pageUrl || episodePageUrl(detailId, ep),
      type: "url",
      mediaType: "tv",
      title: data.title || ("第 " + ep + " 集"),
      episodeNumber: ep,
      videoUrl: videoUrl,
      posterPath: poster,
      coverUrl: poster,
      playerType: videoUrl ? "app" : undefined
    };
  }).filter(ep => ep.videoUrl);
}

function parseDetailMeta(html, pageUrl, options) {
  const source = String(html || "");
  const meta = (name) => {
    const re = new RegExp("<meta\\b[^>]*(?:property|name)=[\\\"']" + name + "[\\\"'][^>]*content=[\\\"']([^\\\"']*)", "i");
    const reverse = new RegExp("<meta\\b[^>]*content=[\\\"']([^\\\"']*)[\\\"'][^>]*(?:property|name)=[\\\"']" + name + "[\\\"']", "i");
    const hit = source.match(re) || source.match(reverse);
    return hit ? decodeBasicEntities(hit[1]) : "";
  };
  const title = cleanTitle(meta("og:title") || stripBasicTags((source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") || stripBasicTags((source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""));
  const description = meta("og:description") || meta("description");
  const posterValue = options && options.skipPoster ? "" : meta("og:image");
  const author = parseAuthorInfo(source, pageUrl);
  return {
    title: title || "黄果短剧",
    description: description,
    poster: options && options.skipPoster
      ? ""
      : (coverUrl(absoluteUrl(posterValue, pageUrl)) || HUANGGUO_FALLBACK_COVER),
    author: author,
    releaseDate: meta("article:published_time") || undefined
  };
}

function parseAuthorInfo(html, pageUrl) {
  const source = String(html || "");
  const blockMatch = source.match(/<div\b[^>]*class=["'][^"']*\bhg-web-detail__author\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!blockMatch) return null;
  const block = blockMatch[1];
  const link = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  const image = block.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i);
  const name = link ? stripBasicTags(link[2]) : "";
  if (!name) return null;
  const avatar = image ? absoluteUrl(image[1], pageUrl) : "";
  return { name: name, avatar: avatar };
}

function parseRecommendations(html, pageUrl) {
  const source = String(html || "");
  const match = source.match(/<div\b[^>]*class=["'][^"']*\bhg-web-detail__related\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i);
  if (!match) return [];
  return parseRecommendationCards(match[1], pageUrl);
}

function parseRecommendationCards(html, pageUrl) {
  const source = String(html || "");
  const links = [];
  const linkRe = /<a\b[^>]*href=["'](?:https?:\/\/huangguoai\.com)?\/(?:detail|video)\/(\d+)\/?["'][^>]*>/gi;
  let match;
  while ((match = linkRe.exec(source))) links.push({ index: match.index, id: match[1] });
  const items = [];
  const seen = {};
  for (let index = 0; index < links.length; index++) {
    const start = links[index].index;
    const end = links[index + 1] ? links[index + 1].index : source.length;
    const block = source.slice(start, end);
    const id = links[index].id;
    if (seen[id]) continue;
    const titleMatch = block.match(/class=["'][^"']*\bhg-drama-card__title\b[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<img\b[^>]*alt=["']([^"']+)["']/i);
    const title = cleanTitle(titleMatch ? stripBasicTags(titleMatch[1]) : "");
    if (!title) continue;
    const poster = recommendationImage(block, pageUrl) || HUANGGUO_FALLBACK_COVER;
    const score = block.match(/hg-drama-card__score[^>]*>[\s\S]*?([0-9]+(?:\.[0-9]+)?)\s*分/i);
    items.push(buildCardVideoItem({
      link: makeDetailLink(id, poster),
      title: title,
      description: recommendationText(block, "hg-drama-card__desc"),
      poster: poster,
      rating: score ? parseFloat(score[1]) : undefined
    }));
    seen[id] = true;
  }
  return items;
}

function recommendationText(block, className) {
  const match = String(block || "").match(new RegExp("<[^>]*class=[\\\"'][^\\\"']*" + className + "[^\\\"']*[\\\"'][^>]*>([\\s\\S]*?)</", "i"));
  return match ? stripBasicTags(match[1]) : "";
}

function recommendationImage(block, pageUrl) {
  const value = extractImageValue(block);
  if (!value) return "";
  const url = absoluteUrl(value, pageUrl);
  return url ? coverUrl(url) : "";
}

// 顶层 loadDetail：App 用列表项的 link 字符串直接调用（不是 params 对象）
async function loadDetail(link) {
  const parsed = parseDetailLink(link);
  if (!parsed) return null;
  const detailId = parsed.id;
  const detailUrl = detailPageUrl(detailId);
  const listPoster = coverUrl(parsed.cover || "");

  const failDetail = (title, description) => ({
    id: link,
    type: "url",
    link: link,
    mediaType: "tv",
    title: title || "黄果短剧",
    description: description || "详情页请求失败，请稍后重试",
    posterPath: listPoster || HUANGGUO_FALLBACK_COVER,
    backdropPath: listPoster || HUANGGUO_FALLBACK_COVER,
    coverUrl: listPoster || HUANGGUO_FALLBACK_COVER,
    episodeItems: [],
    relatedItems: []
  });

  let html;
  try {
    html = await fetchPage(detailUrl, HUANGGUO_SITE + "/");
  } catch (error) {
    html = "";
  }
  if (!html) return failDetail("", "");

  try {
    const meta = parseDetailMeta(html, detailUrl, { skipPoster: hasUsableCover(listPoster) });
    const recommendations = parseRecommendations(html, detailUrl);
    const poster = listPoster || meta.poster || HUANGGUO_FALLBACK_COVER;

    const episodes = discoverEpisodes(html, detailId);
    const playResults = await mapLimit(episodes, EP_FETCH_CONCURRENCY, ep => resolveEpisodePlay(detailId, ep));
    const episodeItems = buildEpisodeItems(detailId, episodes, playResults, poster);
    const firstPlay = playResults.find(r => r && r.videoUrl);
    const duration = (playResults.find(r => r && r.duration) || {}).duration || 0;

    const detail = {
      id: link,
      type: "url",
      link: link,
      mediaType: "tv",
      title: meta.title,
      description: meta.description || meta.title,
      releaseDate: meta.releaseDate,
      posterPath: poster,
      backdropPath: poster,
      coverUrl: poster,
      duration: duration || undefined,
      durationText: duration ? Math.round(duration / 60) + "分钟" : "",
      episodeItems: episodeItems,
      relatedItems: recommendations,
      peoples: meta.author ? [{ title: meta.author.name, avatar: meta.author.avatar || "", role: "导演" }] : []
    };
    // 没有逐集播放地址时，最后兜底：详情页内嵌视频直接作为顶层播放地址
    if (!episodeItems.length && firstPlay && firstPlay.videoUrl) {
      detail.videoUrl = firstPlay.videoUrl;
      detail.playerType = "app";
    }
    return detail;
  } catch (error) {
    console.warn("黄果详情解析失败", detailUrl, error && error.message ? error.message : error);
    return failDetail("", "");
  }
}

// 固定 id "loadResource"、type:"stream"：起播/切集时调用，返回 VideoResource[]。
// 即使详情阶段没解析到地址，这里仍会按 link+集数重新抓播放页再解析一次。
async function loadResource(params = {}) {
  applySettings(params);
  const parsed = parseDetailLink(params.link);

  // 非黄果 link 但直接给了 videoUrl：原样返回（补通用头）
  if (!parsed) {
    const direct = String(params.videoUrl || "");
    if (!isPlayableUrl(direct)) return [];
    return [{
      name: params.name || "黄果短剧",
      description: "高清在线播放",
      url: direct,
      playerType: "app",
      customHeaders: requestHeaders(HUANGGUO_SITE + "/")
    }];
  }

  const ep = parseInt(params.episode, 10)
    || episodeNumber(params.episodeName || params.title, 1);
  const play = await resolveEpisodePlay(parsed.id, ep);
  if (!play.videoUrl) {
    console.warn("黄果未解析到播放地址", parsed.id, ep, play.pageUrl);
    return [];
  }
  return [{
    name: "第 " + ep + " 集",
    description: "高清在线播放",
    url: play.videoUrl,
    playerType: "app",
    customHeaders: requestHeaders(play.pageUrl)
  }];
}

  return {
    loadRecommend: loadRecommend,
    loadNewest: loadNewest,
    loadAiDuanju: loadAiDuanju,
    loadAiManju: loadAiManju,
    loadAiHuanlian: loadAiHuanlian,
    loadAiMogai: loadAiMogai,
    loadTopics: loadTopics,
    loadRanking: loadRanking,
    searchVideos: searchVideos,
    loadDetail: loadDetail,
    loadResource: loadResource
  };
})();

// ============ 对外封装（两个大类 + 统一搜索/详情/播放） ============
async function loadHongguoList(params) {
  return Hongguo.loadList(params || {});
}

async function loadHuangguoList(params) {
  params = params || {};
  switch (String(params.section || "recommend")) {
    case "newest":     return Huangguo.loadNewest(params);
    case "aiDuanju":   return Huangguo.loadAiDuanju(params);
    case "aiManju":    return Huangguo.loadAiManju(params);
    case "aiHuanlian": return Huangguo.loadAiHuanlian(params);
    case "aiMogai":    return Huangguo.loadAiMogai(params);
    case "topics":     return Huangguo.loadTopics(params);
    case "ranking":    return Huangguo.loadRanking(params);
    default:           return Huangguo.loadRecommend(params);
  }
}

async function searchDuanju(params) {
  params = params || {};
  if (String(params.source || "hongguo") === "huangguo") {
    return Huangguo.searchVideos(params);
  }
  return Hongguo.search(params);
}

async function loadDetail(link) {
  const s = String(link || "");
  if (s.indexOf("hg://detail/") === 0) return Huangguo.loadDetail(link);
  return Hongguo.loadDetail(link);
}

async function loadResource(params) {
  params = params || {};
  const s = String(params.link || params.videoUrl || "");
  if (s.indexOf("hg://detail/") === 0) return Huangguo.loadResource(params);
  return Hongguo.loadResource(params);
}
