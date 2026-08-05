// @ts-nocheck
import Taro from "@tarojs/taro";

const API_BASE_URL = "http://localhost:3000/api";
const TOKEN_KEY = "teacherToken";

export async function teacherLogin() {
  const response = await Taro.request({
    url: `${API_BASE_URL}/auth/dev-login`,
    method: "POST",
    data: {
      role: "teacher",
      phone: "13800000001",
    },
  });
  if (response.statusCode >= 400 || !response.data || !response.data.data) {
    throw new Error(`登录失败：${response.statusCode}`);
  }
  const token = response.data.data.token;
  Taro.setStorageSync(TOKEN_KEY, token);
  return token;
}

export async function teacherRequest(path, options = {}) {
  let token = Taro.getStorageSync(TOKEN_KEY);
  if (!token) {
    token = await teacherLogin();
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
    throw new Error(`请求失败：${response.statusCode}`);
  }

  if (!response.data || !response.data.data) {
    throw new Error("接口返回格式不正确");
  }

  return response.data.data;
}
