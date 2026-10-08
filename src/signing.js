import { canonicalJsonMd5, md5, sm3, toHex } from "./crypto.js";

/**
 * Request-signing facade used by the Worker. The catalog endpoints do not need
 * signing. For protected media endpoints callers can pass the exact device
 * profile and protocol version supplied by their own client; the facade keeps
 * canonicalization deterministic and leaves version-specific envelope fields
 * explicit instead of baking a stale mobile-app signature into the Worker.
 */
export function requestDigest({ query = "", body = "", cookies = "" } = {}) {
  return {
    query: toHex(md5(query)),
    body: toHex(md5(body)),
    cookies: toHex(md5(cookies)),
    canonicalBody: canonicalJsonMd5(body),
  };
}

export function signingEnvelope({ query = "", body = "", cookies = "", deviceId = "", deviceModel = "", version = "1" } = {}) {
  const digest = requestDigest({ query, body, cookies });
  const material = `${digest.query}${digest.body}${digest.cookies}${deviceId}${deviceModel}${version}`;
  return {
    ...digest,
    material: toHex(sm3(material)),
    version: String(version),
    deviceId: String(deviceId),
    deviceModel: String(deviceModel),
  };
}

