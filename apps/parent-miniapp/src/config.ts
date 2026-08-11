// @ts-nocheck
const DEFAULT_API_BASE_URL = "http://localhost:3000/api";

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.TARO_APP_API_BASE_URL,
);

const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

export function resolveApiAssetUrl(url) {
  if (/^(?:https?:|data:|wxfile:|blob:)/i.test(url)) return url;
  return `${API_ORIGIN}/${url.replace(/^\/+/, "")}`;
}

function normalizeApiBaseUrl(value) {
  const normalized = (value || DEFAULT_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  return normalized || DEFAULT_API_BASE_URL;
}
