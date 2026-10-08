import { signRequest } from "./hongguo-signing.js";
import { aesCbcDecrypt } from "./crypto.js";
import { concat, hexBytes } from "./signing-hash.js";
export const DEVICE = Object.freeze({
  device_id: "1234567890123456789",
  iid: "9876543210987654321",
  install_id: "9876543210987654321",
  device_brand: "Redmi",
  device_model: "25053RT47C",
  device_type: "25053RT47C",
  device_manufacturer: "Xiaomi",
  os_version: "16",
  version_name: "7.1.3.32",
  x_tt_dt: "",
  sec_device_token: "",
  device_sec_device_token: "",
  ua: "com.phoenix.read/71332 (Linux; U; Android 16; zh_CN; 25053RT47C; Build/BP2A.250605.031.A3; Cronet/TTNetVersion:04657795 2026-01-23 QuicVersion:c67e9834 2025-09-08)",
});
const ENDPOINT =
  "https://api5-normal-sinfonlineb.fqnovel.com/novel/player/multi_video_model/v1/";
export function mediaRequest(videoId, device = DEVICE, now = Date.now()) {
  if (!/^\d{10,24}$/.test(videoId)) throw new Error("Invalid episode ID");
  const t = Math.floor(now / 1000),
    d = device;
  const params = {
    iid: d.install_id,
    device_id: d.device_id,
    ac: "wifi",
    channel: "update_64",
    aid: "8662",
    app_name: "novelread",
    version_code: "71332",
    version_name: d.version_name,
    device_platform: "android",
    os: "android",
    ssmix: "a",
    device_type: d.device_type || d.device_model,
    device_brand: d.device_brand,
    language: "zh",
    os_api: "36",
    os_version: d.os_version,
    manifest_version_code: "71332",
    resolution: "1280*2772",
    dpi: "520",
    update_version_code: "71332",
    host_abi: "arm64-v8a",
    dragon_device_type: "phone",
    pv_player: "71332",
    compliance_status: "0",
    need_personal_recommend: "1",
    player_so_load: "1",
    is_android_pad_screen: "0",
    ts: String(t),
    _rticket: String(now),
  };
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const body = JSON.stringify({
    biz_param: {
      detail_page_version: 0,
      device_level: 3,
      disable_digg_stat: false,
      need_all_video_definition: true,
      need_mp4_align: false,
      use_os_player: false,
      use_server_dns: false,
      video_platform: 1024,
    },
    mixed_video_id_map: { 1004: [videoId] },
  });
  return {
    url: `${ENDPOINT}?${query}`,
    init: {
      method: "POST",
      body,
      headers: {
        accept: "application/json; charset=utf-8,application/x-protobuf",
        "content-type": "application/json; charset=UTF-8",
        "x-xs-from-web": "0",
        "x-ss-req-ticket": String(now),
        "x-tt-request-tag": "t=0;n=0",
        "sdk-version": "2",
        "passport-sdk-version": "50561",
        "x-vc-bdturing-sdk-version": "3.7.2.cn",
        ...signRequest(query, body, t, d),
      },
    },
  };
}
export async function videoModel(videoId, device = DEVICE, fetcher = fetch) {
  const { url, init } = mediaRequest(videoId, device);
  const res = await fetcher(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Video model HTTP ${res.status}`);
  const json = await res.json();
  const raw = json.data?.[videoId]?.video_model;
  if (!raw)
    throw new Error(
      `Video model rejected: ${json.code ?? json.status_code ?? "missing model"} ${json.message || json.msg || ""}`,
    );
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}
export const decode64 = (value) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export function deriveContentKey(spade) {
  const raw = decode64(spade.trim());
  if (raw.length < 3) throw new Error("Invalid spade");
  let n = raw.length - (raw[0] ^ raw[1] ^ raw[2]) + 47;
  if (n <= 0 || n > raw.length * 2) throw new Error("Invalid spade length");
  n = Math.min(n, raw.length - 1);
  if (n < 33) throw new Error("Short spade");
  const data = raw.slice(1, n + 1);
  let a = 85,
    b = 246;
  for (let i = 0; i < n; i++) {
    let count = 0;
    for (let x = i; x; x >>>= 1) count += x & 1;
    const old = data[i],
      prev = i & 1 ? a : b;
    if (i & 1) a = old;
    else b = old;
    data[i] = (-21 - count + (prev ^ old)) & 255;
  }
  const hex = new TextDecoder().decode(data.slice(1, 33));
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("Invalid content key");
  return hexBytes(hex);
}
export async function decodeMediaUrl(value, keySeed) {
  if (/^https?:\/\//.test(value)) return value.replace(/^http:/, "https:");
  const raw = decode64(value),
    plain = new TextDecoder().decode(raw);
  if (/^https?:\/\//.test(plain)) return plain.replace(/^http:/, "https:");
  if (!keySeed) throw new Error("Encrypted URL without key seed");
  const h1 = new Uint8Array(await crypto.subtle.digest("SHA-512", keySeed));
  const suffix = hexBytes(
    "4dd4c2e6b83162090e52b3c7a6733ba41cb2462b829ab58a196b39db57177524f49baf7f08e8d68d26a72e37c1a95a2f1f05a51892aef2949732b62a38aadd58",
  );
  const h2 = new Uint8Array(
    await crypto.subtle.digest("SHA-512", concat(h1, suffix)),
  );
  return new TextDecoder()
    .decode(
      await aesCbcDecrypt(raw.slice(4), h2.slice(0, 16), h2.slice(16, 32)),
    )
    .replace(/^http:/, "https:");
}
export async function selectMedia(model, quality = 1080) {
  const entries = Object.values(model.video_list || {})
    .map((v) => ({ ...v, ...v.video_meta, ...v.encrypt_info }))
    .filter((v) => v.main_url || v.backup_url || v.backup_url_1);
  entries.sort((a, b) => {
    const h = (v) =>
      Number.parseInt(v.definition) ||
      Math.min(Number(v.vwidth) || 0, Number(v.vheight) || 0);
    const score = (v) => (h(v) <= quality ? 100000 : 0) + h(v);
    return (
      score(b) - score(a) || (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
    );
  });
  const item = entries[0];
  if (!item) throw new Error("No MP4 in video model");
  const spade = item.spade_a || model.spade_a;
  const key = spade ? deriveContentKey(spade) : null;
  if (item.encrypt && !key) throw new Error("Encrypted media without spade");
  const values = [item.main_url, item.backup_url, item.backup_url_1].filter(
    Boolean,
  );
  const urls = [];
  for (const v of values) urls.push(await decodeMediaUrl(v, null));
  return {
    urls: [...new Set(urls)],
    key,
    quality: item.definition,
    size: Number(item.size) || 0,
  };
}
