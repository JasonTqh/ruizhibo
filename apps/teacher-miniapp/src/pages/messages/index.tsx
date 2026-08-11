// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function MessagesPage() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      setConversations(await teacherRequest("/teacher/conversations"));
    } catch (loadError) {
      setError(errorMessage(loadError, "会话加载失败，请确认 API 已启动。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  const unreadTotal = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) => total + Number(conversation.unreadCount || 0),
        0,
      ),
    [conversations],
  );

  function openConversation(conversation) {
    const parentName = conversation.parent?.name || "学生家长";
    const title = `${conversation.student.name} · ${parentName}`;
    Taro.navigateTo({
      url: `/pages/chat/index?conversationId=${conversation.id}&title=${encodeURIComponent(title)}`,
    });
  }

  return h(
    View,
    { className: "teacher-messages-page" },
    h(
      View,
      { className: "messages-hero" },
      h(
        View,
        { className: "messages-hero__main" },
        h(Text, { className: "messages-eyebrow" }, "家校协同"),
        h(Text, { className: "messages-title" }, "家校沟通"),
        h(
          Text,
          { className: "messages-description" },
          "回复家长咨询，进入页面时会自动同步最新消息。",
        ),
      ),
      h(
        View,
        { className: `messages-counter${unreadTotal ? " messages-counter--active" : ""}` },
        h(Text, { className: "messages-counter__value" }, unreadTotal > 99 ? "99+" : String(unreadTotal)),
        h(Text, { className: "messages-counter__label" }, "未读"),
      ),
    ),
    h(
      View,
      { className: "messages-toolbar" },
      h(Text, { className: "messages-toolbar__hint" }, loading ? "正在同步…" : "已自动刷新"),
      h(
        Button,
        {
          className: "messages-refresh",
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
          { className: "messages-feedback messages-feedback--error" },
          h(Text, null, error),
          h(Button, { size: "mini", onClick: () => load() }, "重试"),
        )
      : null,
    loading && conversations.length === 0
      ? h(View, { className: "messages-feedback" }, h(Text, null, "正在加载会话…"))
      : null,
    !loading && !error && conversations.length === 0
      ? h(
          View,
          { className: "messages-empty" },
          h(Text, { className: "messages-empty__icon" }, "聊"),
          h(Text, { className: "messages-empty__title" }, "暂无家校会话"),
          h(Text, { className: "messages-empty__text" }, "家长发起沟通后，会话会显示在这里。"),
        )
      : null,
    h(
      View,
      { className: "conversation-list" },
      conversations.map((conversation) => {
        const lastMessage = conversation.messages?.[0];
        const unreadCount = Number(conversation.unreadCount || 0);
        const studentName = conversation.student?.name || "学生";
        const parentName = conversation.parent?.name || "学生家长";
        const className = conversation.student?.class?.name || "未分班";
        return h(
          View,
          {
            className: `conversation-item${unreadCount ? " conversation-item--unread" : ""}`,
            key: conversation.id,
            onClick: () => openConversation(conversation),
          },
          h(
            View,
            { className: "conversation-avatar" },
            h(Text, null, studentName.slice(0, 1)),
          ),
          h(
            View,
            { className: "conversation-body" },
            h(
              View,
              { className: "conversation-topline" },
              h(Text, { className: "conversation-name" }, `${studentName} · ${parentName}`),
              h(Text, { className: "conversation-date" }, lastMessage ? formatConversationTime(lastMessage.createdAt) : ""),
            ),
            h(Text, { className: "conversation-class" }, className),
            h(
              View,
              { className: "conversation-bottomline" },
              h(
                Text,
                { className: "conversation-snippet" },
                lastMessage ? lastMessage.content : "暂无消息，点击开始沟通",
              ),
              unreadCount
                ? h(Text, { className: "conversation-unread" }, unreadCount > 99 ? "99+" : String(unreadCount))
                : h(Text, { className: "conversation-arrow" }, "›"),
            ),
          ),
        );
      }),
    ),
  );
}

function formatConversationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
