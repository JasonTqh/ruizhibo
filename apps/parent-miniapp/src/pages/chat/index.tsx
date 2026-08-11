// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function ChatPage() {
  const router = useRouter();
  const params = router && router.params ? router.params : {};
  const conversationId = params.conversationId || "";
  const [messages, setMessages] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (!conversationId) {
      setError("会话参数缺失，请返回重试。");
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextMessages, me] = await Promise.all([
        parentRequest(`/parent/conversations/${conversationId}/messages`),
        parentRequest("/me"),
      ]);
      setMessages(nextMessages);
      setCurrentUserId(me.id);
    } catch (loadError) {
      setError(errorMessage(loadError, "消息加载失败，请重试。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function send() {
    if (sending || !conversationId) return;
    const nextContent = content.trim();
    if (!nextContent) {
      Taro.showToast({ title: "请输入消息内容", icon: "none" });
      return;
    }
    setSending(true);
    setError("");
    try {
      await parentRequest(`/parent/conversations/${conversationId}/messages`, {
        method: "POST",
        data: { content: nextContent },
      });
      setContent("");
      await load(false);
    } catch (sendError) {
      setError(errorMessage(sendError, "发送失败，输入内容已保留。"));
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!loading) scrollToLatest();
  }, [loading, messages.length]);

  function scrollToLatest() {
    Taro.nextTick(() => {
      Taro.pageScrollTo({ scrollTop: 999999, duration: 120 }).catch(
        () => undefined,
      );
    });
  }

  return h(
    View,
    { className: "chat-page" },
    h(
      View,
      { className: "chat-toolbar" },
      h(Text, { className: "muted" }, "打开会话会自动标记老师消息为已读"),
      h(
        Button,
        {
          className: "refresh-button chat-refresh-button",
          size: "mini",
          loading,
          disabled: loading,
          onClick: () => load(),
        },
        "刷新",
      ),
    ),
    error
      ? h(
          View,
          { className: "feedback-state feedback-state--error chat-error" },
          h(Text, null, error),
        )
      : null,
    h(
      View,
      { className: "message-list" },
      loading
        ? h(Text, { className: "feedback-state" }, "正在加载消息…")
        : messages.length === 0
          ? h(
              Text,
              { className: "feedback-state" },
              "还没有消息，可以先打个招呼",
            )
          : messages.map((message) => {
              const isOwn = message.senderId === currentUserId;
              return h(
                View,
                {
                  id: `message-${message.id}`,
                  className: `message-row${isOwn ? " message-row-own" : ""}`,
                  key: message.id,
                },
                h(
                  View,
                  {
                    className: `message-bubble${isOwn ? " message-bubble-own" : ""}`,
                  },
                  h(Text, { className: "message-content" }, message.content),
                ),
                h(
                  Text,
                  { className: "message-meta" },
                  `${formatDate(message.createdAt)}${isOwn ? ` · ${message.readAt ? "已读" : "未读"}` : ""}`,
                ),
              );
            }),
      h(View, { className: "message-list-end" }),
    ),
    h(
      View,
      { className: "message-composer" },
      h(Textarea, {
        className: "message-input",
        value: content,
        maxlength: 2000,
        autoHeight: true,
        adjustPosition: true,
        cursorSpacing: 24,
        confirmType: "send",
        confirmHold: false,
        disabled: sending || !conversationId,
        placeholder: "输入想对老师说的话",
        onInput: (event) => setContent(event.detail.value),
        onConfirm: send,
        onFocus: scrollToLatest,
        onKeyboardHeightChange: scrollToLatest,
      }),
      h(
        Button,
        {
          className: "message-send-button",
          loading: sending,
          disabled: sending || !conversationId || !content.trim(),
          onClick: send,
        },
        "发送",
      ),
    ),
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
