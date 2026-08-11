import { resolve } from "node:path";

const taroSharedPath = resolve(
  __dirname,
  "../../../node_modules/.pnpm/@tarojs+shared@4.2.0/node_modules/@tarojs/shared",
);

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
  mini: {},
  h5: {},
};
