import { resolve } from "node:path";
import { isIP } from "node:net";

const taroSharedPath = resolve(
  __dirname,
  "../../../node_modules/.pnpm/@tarojs+shared@4.2.0/node_modules/@tarojs/shared",
);
const defaultApiBaseUrl = "http://localhost:3000/api";
const authMode = (
  process.env.TARO_APP_AUTH_MODE?.trim() || "dev"
).toLowerCase();
if (!["dev", "wechat"].includes(authMode)) {
  throw new Error("TARO_APP_AUTH_MODE must be either dev or wechat");
}
const configuredApiBaseUrl = process.env.TARO_APP_API_BASE_URL?.trim();
const apiBaseUrl = (configuredApiBaseUrl || defaultApiBaseUrl).replace(
  /\/+$/,
  "",
);

if (authMode === "wechat") {
  if (!configuredApiBaseUrl) {
    throw new Error(
      "TARO_APP_API_BASE_URL must be configured for a WeChat release build",
    );
  }

  const apiUrl = new URL(apiBaseUrl);
  const hostname = apiUrl.hostname.replace(/^\[|\]$/g, "");
  const expectedApiBaseUrl = `https://${apiUrl.hostname}/api`;
  if (
    apiUrl.protocol !== "https:" ||
    apiBaseUrl !== expectedApiBaseUrl ||
    apiUrl.pathname.replace(/\/+$/, "") !== "/api" ||
    Boolean(
      apiUrl.search || apiUrl.hash || apiUrl.username || apiUrl.password,
    ) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    !hostname.includes(".") ||
    isIP(hostname) !== 0
  ) {
    throw new Error(
      "TARO_APP_API_BASE_URL must be a public HTTPS domain ending in /api, without a port, query, fragment, or credentials",
    );
  }
}

export default {
  projectName: "parent-miniapp",
  date: "2026-06-16",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: {
    type: "webpack5",
    prebundle: {
      enable: false,
    },
  },
  alias: {
    "@tarojs/shared": taroSharedPath,
  },
  env: {
    TARO_APP_API_BASE_URL: JSON.stringify(apiBaseUrl),
    TARO_APP_AUTH_MODE: JSON.stringify(authMode),
  },
  mini: {},
  h5: {},
};
