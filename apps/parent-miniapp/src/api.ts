// @ts-nocheck
import Taro from "@tarojs/taro";

const API_BASE_URL = "http://localhost:3000/api";
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
  const token = response.data.data.token;
  Taro.setStorageSync(TOKEN_KEY, token);
  return token;
}

export async function parentRequest(path, options = {}) {
  let token = Taro.getStorageSync(TOKEN_KEY);
  if (!token) {
    token = await parentLogin();
  }

  const response = await Taro.request({
    url: `${API_BASE_URL}${path}`,
    method: "GET",
    ...options,
    header: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.header,
    },
  });

  if (response.statusCode >= 400) {
    throw new Error("request failed");
  }

  return response.data.data;
}
