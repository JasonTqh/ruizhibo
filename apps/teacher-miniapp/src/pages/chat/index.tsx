// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { teacherRequest } from "../../api";
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
        teacherRequest(`/teacher/conversations/${conversationId}/messages`),
        teacherRequest("/me"),
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
    const nextContent = content.trim();
    if (!nextContent) {
      Taro.showToast({ title: "请输入消息内容", icon: "none" });
      return;
    }
    setSending(true);
    setError("");
    try {
      await teacherRequest(
        `/teacher/conversations/${conversationId}/messages`,
        { method: "POST", data: { content: nextContent } },
      );
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

  return h(
    View,
    { className: "chat-page" },
    h(
      View,
      { className: "chat-toolbar" },
      h(Text, { className: "muted" }, "打开会话会自动标记对方消息为已读"),
      h(
        Button,
        {
          className: "secondary-button chat-refresh-button",
          size: "mini",
          loading,
          disabled: loading,
          onClick: () => load(),
        },
        "刷新",
      ),
    ),
    error ? h(Text, { className: "error-text chat-error" }, error) : null,
    h(
      View,
      { className: "message-list" },
      loading
        ? h(Text, { className: "empty-state" }, "正在加载消息…")
        : messages.length === 0
          ? h(Text, { className: "empty-state" }, "还没有消息，可以先打个招呼")
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
    ),
    h(
      View,
      { className: "message-composer" },
      h(Textarea, {
        className: "message-input",
        value: content,
        maxlength: 2000,
        autoHeight: true,
        placeholder: "输入回复内容",
        onInput: (event) => setContent(event.detail.value),
      }),
      h(
        Button,
        {
          className: "message-send-button",
          loading: sending,
          disabled: sending,
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
