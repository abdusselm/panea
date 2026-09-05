

export const SEARCH_PREFIX = "https://duckduckgo.com/?q=";
export const BLANK_URL = "about:blank";

const SCHEME = /^([a-z][a-z0-9+.\-]*):/i;
const HOST_PORT = /^[a-z0-9.\-]+:\d+(?=$|[/?#])/i;
const SAFE_SCHEMES = new Set(["http", "https", "file", "about"]);
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$|\?|#)/i;

export function normalizeUrl(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return "";

  const scheme = HOST_PORT.test(raw) ? null : raw.match(SCHEME);
  if (scheme) {
    if (!SAFE_SCHEMES.has(scheme[1].toLowerCase())) return "";
    return raw;
  }

  if (LOOPBACK.test(raw)) return "http://" + raw;
  if (looksLikeHost(raw)) return "https://" + raw;
  return SEARCH_PREFIX + encodeURIComponent(raw);
}

export function looksLikeHost(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw || /\s/.test(raw)) return false;
  const host = raw.split(/[/?#]/)[0].split(":")[0];
  if (!host.includes(".")) return false;
  const last = host.split(".").pop();
  return /^[a-z]{2,}$/i.test(last) || /^\d+$/.test(last);
}

export function hostLabel(url) {
  const raw = String(url == null ? "" : url).trim();
  if (!raw || raw === BLANK_URL) return "browser";
  const withoutScheme = raw.replace(SCHEME, "").replace(/^\/\//, "");
  const host = withoutScheme.split(/[/?#]/)[0];
  return host.replace(/^www\./i, "") || "browser";
}

export function isLoopbackUrl(url) {
  const raw = String(url == null ? "" : url).trim().replace(SCHEME, "").replace(/^\/\//, "");
  return LOOPBACK.test(raw);
}
