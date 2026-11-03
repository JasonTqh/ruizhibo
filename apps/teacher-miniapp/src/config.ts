// @ts-nocheck
const DEFAULT_API_BASE_URL = "https://api.ruizhibo.com/api";

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.RUIZHIBO_API_BASE_URL,
);
export const AUTH_MODE =
  process.env.RUIZHIBO_AUTH_MODE === "wechat" ? "wechat" : "dev";

const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

export function resolveApiAssetUrl(url) {
  if (/^(?:https?:|data:|wxfile:|blob:)/i.test(url)) return url;
  return `${API_ORIGIN}/${url.replace(/^\/+/, "")}`;
}

function normalizeApiBaseUrl(value) {
  const normalized = (value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
  return normalized || DEFAULT_API_BASE_URL;
}
