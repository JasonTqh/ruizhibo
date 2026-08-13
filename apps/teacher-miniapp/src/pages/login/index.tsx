// @ts-nocheck
import React, { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import {
  bindTeacherWechatPhone,
  hasTeacherBindingToken,
  resetTeacherWechatLogin,
  teacherLogin,
} from "../../api";
import "./index.scss";

const h = React.createElement;

export default function TeacherLoginPage() {
  const [bindingRequired, setBindingRequired] = useState(
    hasTeacherBindingToken(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await teacherLogin();
      await Taro.reLaunch({ url: "/pages/home/index" });
    } catch (loginError) {
      setBindingRequired(hasTeacherBindingToken());
      if (!hasTeacherBindingToken()) setError(errorMessage(loginError));
    } finally {
      setLoading(false);
    }
  }

  async function bindPhone(event) {
    const phoneCode = event.detail?.code;
    if (!phoneCode) {
      setError("需要授权微信绑定手机号后才能进入教师端");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await bindTeacherWechatPhone(phoneCode);
      await Taro.reLaunch({ url: "/pages/home/index" });
    } catch (bindError) {
      setError(errorMessage(bindError, "手机号绑定失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  async function restartLogin() {
    resetTeacherWechatLogin();
    setBindingRequired(false);
    await login();
  }

  useDidShow(() => {
    if (!hasTeacherBindingToken()) login();
  });

  return h(
    View,
    { className: "auth-page" },
    h(
      View,
      { className: "auth-card" },
      h(Text, { className: "auth-mark" }, "RZB"),
      h(Text, { className: "auth-title" }, "锐之博教师端"),
      h(
        Text,
        { className: "auth-description" },
        bindingRequired
          ? "首次使用需要验证管理员预留的教师手机号。"
          : "正在通过微信验证教师身份，请稍候。",
      ),
      error ? h(Text, { className: "auth-error" }, error) : null,
      bindingRequired
        ? h(
            Button,
            {
              className: "auth-button",
              type: "primary",
              openType: "getPhoneNumber",
              disabled: loading,
              onGetPhoneNumber: bindPhone,
            },
            loading ? "绑定中…" : "授权手机号并进入",
          )
        : h(
            Button,
            {
              className: "auth-button",
              type: "primary",
              loading,
              disabled: loading,
              onClick: login,
            },
            loading ? "登录中…" : "微信登录",
          ),
      bindingRequired && error
        ? h(
            Button,
            {
              className: "auth-retry",
              disabled: loading,
              onClick: restartLogin,
            },
            "重新获取登录凭证",
          )
        : null,
      h(
        Text,
        { className: "auth-help" },
        error.includes("已绑定家长端")
          ? "小程序内不能切换微信账号。开发者工具请点击右上角账号头像退出，再使用教师微信扫码登录；真机请使用教师微信账号或另一台设备打开。"
          : "账号由管理员创建，无法登录请联系管理员。",
      ),
    ),
  );
}

function errorMessage(error, fallback = "微信登录失败，请重试") {
  return error instanceof Error && error.message ? error.message : fallback;
}
