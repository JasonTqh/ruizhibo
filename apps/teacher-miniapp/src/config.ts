// @ts-nocheck
export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.TARO_APP_API_BASE_URL,
);
export const AUTH_MODE =
  process.env.TARO_APP_AUTH_MODE === "wechat" ? "wechat" : "dev";

const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");

export function resolveApiAssetUrl(url) {
  if (/^(?:https?:|data:|wxfile:|blob:)/i.test(url)) return url;
  return `${API_ORIGIN}/${url.replace(/^\/+/, "")}`;
}

function normalizeApiBaseUrl(value) {
  const normalized = (value || "").trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("小程序 API 地址未配置");
  return normalized;
}
