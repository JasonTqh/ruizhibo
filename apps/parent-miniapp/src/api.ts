// @ts-nocheck
import Taro from "@tarojs/taro";
import { API_BASE_URL, AUTH_MODE } from "./config";

const TOKEN_KEY = `parentToken:${AUTH_MODE}`;
const BINDING_TOKEN_KEY = "parentWechatBindingToken";
const LOGIN_PAGE = "pages/login/index";

export async function parentLogin() {
  if (AUTH_MODE === "dev") return devLogin();

  try {
    return await wechatLogin();
  } catch (error) {
    if (currentRoute() !== LOGIN_PAGE) {
      await Taro.reLaunch({ url: `/${LOGIN_PAGE}` });
    }
    throw error;
  }
}

async function wechatLogin() {
  const login = await Taro.login();
  if (!login.code) throw new Error("未获取到微信登录凭证，请重试");
  const result = await publicRequest("/auth/wechat-login", {
    method: "POST",
    data: { code: login.code, role: "parent" },
  });
  if (result.status === "authenticated") {
    saveToken(result.token);
    Taro.removeStorageSync(BINDING_TOKEN_KEY);
    return result.token;
  }
  if (result.status === "binding_required" && result.bindingToken) {
    Taro.setStorageSync(BINDING_TOKEN_KEY, result.bindingToken);
    throw new Error("请先绑定家长手机号");
  }
  throw new Error("微信登录状态无效，请重试");
}

export async function bindParentWechatPhone(phoneCode) {
  const bindingToken = Taro.getStorageSync(BINDING_TOKEN_KEY);
  if (!bindingToken) throw new Error("绑定凭证已失效，请重新登录");
  const result = await publicRequest("/auth/bind-phone", {
    method: "POST",
    data: { bindingToken, phoneCode, role: "parent" },
  });
  if (result.status !== "authenticated" || !result.token) {
    throw new Error("手机号绑定失败，请重试");
  }
  saveToken(result.token);
  Taro.removeStorageSync(BINDING_TOKEN_KEY);
  return result;
}

export function hasParentBindingToken() {
  return Boolean(Taro.getStorageSync(BINDING_TOKEN_KEY));
}

export function resetParentWechatLogin() {
  Taro.removeStorageSync(BINDING_TOKEN_KEY);
  Taro.removeStorageSync(TOKEN_KEY);
}

export async function parentRequest(path, options = {}) {
  let token = Taro.getStorageSync(TOKEN_KEY);
  if (!token) token = await parentLogin();

  let response = await request(path, options, token);
  if (response.statusCode === 401) {
    Taro.removeStorageSync(TOKEN_KEY);
    token = await parentLogin();
    response = await request(path, options, token);
  }
  return responseData(response, `请求失败：${response.statusCode}`);
}

async function devLogin() {
  const result = await publicRequest("/auth/dev-login", {
    method: "POST",
    data: { role: "parent", phone: "13800000002" },
  });
  saveToken(result.token);
  return result.token;
}

async function publicRequest(path, options) {
  const response = await Taro.request({
    url: `${API_BASE_URL}${path}`,
    ...options,
    header: { "Content-Type": "application/json", ...options.header },
  });
  return responseData(response, `登录失败：${response.statusCode}`);
}

function request(path, options, token) {
  return Taro.request({
    url: `${API_BASE_URL}${path}`,
    method: "GET",
    ...options,
    header: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.header,
    },
  });
}

function responseData(response, fallback) {
  if (response.statusCode >= 400) {
    throw new Error(apiErrorMessage(response, fallback));
  }
  if (!response.data || response.data.data === undefined) {
    throw new Error("接口返回格式不正确");
  }
  return response.data.data;
}

function saveToken(token) {
  if (!token) throw new Error("登录接口未返回访问令牌");
  Taro.setStorageSync(TOKEN_KEY, token);
}

function currentRoute() {
  const pages = Taro.getCurrentPages();
  return pages[pages.length - 1]?.route || "";
}

function apiErrorMessage(response, fallback) {
  const message =
    response &&
    response.data &&
    (response.data.message || response.data.error?.message);
  return Array.isArray(message) ? message.join("；") : message || fallback;
}
