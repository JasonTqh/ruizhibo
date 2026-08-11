// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function ChatPage() {
  const router = useRouter();
  const params = router?.params || {};
  const conversationId = params.conversationId || "";
  const [messages, setMessages] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [scrollTarget, setScrollTarget] = useState("message-list-end");

  useEffect(() => {
    if (!params.title) return;
    try {
      Taro.setNavigationBarTitle({ title: decodeURIComponent(params.title) });
    } catch {
      Taro.setNavigationBarTitle({ title: "沟通详情" });
    }
  }, [params.title]);

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
        currentUserId ? Promise.resolve({ id: currentUserId }) : teacherRequest("/me"),
      ]);
      setMessages(nextMessages);
      setCurrentUserId(me.id);
      scrollToLatest(nextMessages);
    } catch (loadError) {
      setError(errorMessage(loadError, "消息加载失败，请重试。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

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
      await teacherRequest(`/teacher/conversations/${conversationId}/messages`, {
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

  function scrollToLatest(nextMessages = messages) {
    const lastMessage = nextMessages[nextMessages.length - 1];
    const target = lastMessage ? `message-${lastMessage.id}` : "message-list-end";
    setScrollTarget("");
    Taro.nextTick(() => setScrollTarget(target));
  }

  return h(
    View,
    { className: "teacher-chat-page" },
    h(
      View,
      { className: "chat-statusbar" },
      h(
        View,
        { className: "chat-statusbar__copy" },
        h(Text, { className: "chat-statusbar__title" }, "消息已同步"),
        h(Text, { className: "chat-statusbar__hint" }, "进入会话后，对方消息会自动标记为已读"),
      ),
      h(
        Button,
        {
          className: "chat-refresh",
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
          { className: "chat-feedback chat-feedback--error" },
          h(Text, null, error),
        )
      : null,
    h(
      ScrollView,
      {
        className: "chat-scroll",
        scrollY: true,
        scrollWithAnimation: true,
        scrollIntoView: scrollTarget,
        enhanced: true,
        showScrollbar: false,
      },
      h(
        View,
        { className: "chat-message-list" },
        loading && messages.length === 0
          ? h(Text, { className: "chat-feedback" }, "正在加载消息…")
          : null,
        !loading && !error && messages.length === 0
          ? h(
              View,
              { className: "chat-empty" },
              h(Text, { className: "chat-empty__title" }, "开始一次家校沟通"),
              h(Text, { className: "chat-empty__text" }, "可以先向家长问好或反馈孩子的情况。"),
            )
          : null,
        messages.map((message) => {
          const isOwn = message.senderId === currentUserId;
          return h(
            View,
            {
              id: `message-${message.id}`,
              className: `chat-message${isOwn ? " chat-message--own" : ""}`,
              key: message.id,
            },
            h(
              View,
              { className: `chat-bubble${isOwn ? " chat-bubble--own" : ""}` },
              h(Text, { className: "chat-content" }, message.content),
            ),
            h(
              Text,
              { className: "chat-meta" },
              `${formatMessageTime(message.createdAt)}${isOwn ? ` · ${message.readAt ? "已读" : "未读"}` : ""}`,
            ),
          );
        }),
        h(View, { id: "message-list-end", className: "chat-list-end" }),
      ),
    ),
    h(
      View,
      { className: "chat-composer" },
      h(
        View,
        { className: "chat-input-wrap" },
        h(Textarea, {
          className: "chat-input",
          value: content,
          maxlength: 2000,
          autoHeight: true,
          adjustPosition: true,
          cursorSpacing: 18,
          confirmType: "send",
          confirmHold: false,
          disabled: sending || !conversationId,
          placeholder: "输入回复内容",
          onInput: (event) => setContent(event.detail.value),
          onConfirm: send,
          onFocus: () => scrollToLatest(),
        }),
        content.length > 1600
          ? h(Text, { className: "chat-count" }, `${content.length}/2000`)
          : null,
      ),
      h(
        Button,
        {
          className: "chat-send",
          loading: sending,
          disabled: sending || !conversationId || !content.trim(),
          onClick: send,
        },
        sending ? "发送中" : "发送",
      ),
    ),
  );
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
