/** 红果短剧 Forward 插件（VPS 版）：apiBase 由 generate-duanju.js 自动填充。 */
WidgetMetadata = {
  id: "forward.hongguo.full",
  title: "红果短剧",
  version: "2.3.6",
  requiredVersion: "0.0.1",
  description: "配置自己的 API 地址，浏览、搜索和播放红果短剧",
  author: "",
  site: "",
  detailCacheDuration: 180,
  globalParams: [
    {
      name: "apiBase",
      title: "API 地址",
      type: "input",
      value: "__API_BASE__"
    }
  ],
  modules: [
    {
      id: "loadList",
      title: "分类",
      functionName: "loadList",
      cacheDuration: 300,
      params: [
        { name: "page", title: "页码", type: "page" },
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
        }
      ]
    },
    {
      id: "testDetail",
      title: "详情测试（默认人中之龙第一季）",
      functionName: "testDetail",
      cacheDuration: 0,
      params: [
        { name: "seriesId", title: "测试剧集 ID", type: "input", value: "7690487702315076670" }
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
    functionName: "search",
    params: [
      { name: "keyword", title: "关键词", type: "input" },
      { name: "page", title: "页码", type: "page" }
    ]
  }
};

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
