import { resolve } from "node:path";

const taroSharedPath = resolve(
  __dirname,
  "../../../node_modules/.pnpm/@tarojs+shared@4.2.0/node_modules/@tarojs/shared",
);
const productionApiBaseUrl = "https://api.ruizhibo.com/api";
const developmentApiBaseUrl = "http://localhost:3000/api";
const isDevelopmentBuild =
  process.env.NODE_ENV === "development" || process.argv.includes("--watch");
const isProductionBuild = !isDevelopmentBuild;
const apiBaseUrl = isProductionBuild
  ? productionApiBaseUrl
  : process.env.TARO_APP_API_BASE_URL?.trim() || developmentApiBaseUrl;
const authMode = isProductionBuild
  ? "wechat"
  : process.env.TARO_APP_AUTH_MODE?.trim() || "dev";

export default {
  projectName: "teacher-miniapp",
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
    RUIZHIBO_API_BASE_URL: JSON.stringify(apiBaseUrl),
    RUIZHIBO_AUTH_MODE: JSON.stringify(authMode),
  },
  mini: {},
  h5: {},
};
