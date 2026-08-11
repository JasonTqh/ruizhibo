// @ts-nocheck
import Taro from "@tarojs/taro";
import { API_BASE_URL } from "./config";

const TOKEN_KEY = "parentToken";

export async function parentLogin() {
  const response = await Taro.request({
    url: `${API_BASE_URL}/auth/dev-login`,
    method: "POST",
    data: {
      role: "parent",
      phone: "13800000002",
    },
  });
  if (response.statusCode >= 400 || !response.data || !response.data.data) {
    throw new Error(
      apiErrorMessage(response, `登录失败：${response.statusCode}`),
    );
  }
  const token = response.data.data.token;
  Taro.setStorageSync(TOKEN_KEY, token);
  return token;
}

export async function parentRequest(path, options = {}) {
  let token = Taro.getStorageSync(TOKEN_KEY);
  if (!token) {
    token = await parentLogin();
  }

  let response = await request(path, options, token);
  if (response.statusCode === 401) {
    Taro.removeStorageSync(TOKEN_KEY);
    token = await parentLogin();
    response = await request(path, options, token);
  }

  if (response.statusCode >= 400) {
    throw new Error(
      apiErrorMessage(response, `请求失败：${response.statusCode}`),
    );
  }

  if (!response.data || response.data.data === undefined) {
    throw new Error("接口返回格式不正确");
  }

  return response.data.data;
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

function apiErrorMessage(response, fallback) {
  const message = response && response.data && response.data.message;
  return Array.isArray(message) ? message.join("；") : message || fallback;
}
