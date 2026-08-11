// @ts-nocheck
import React, { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function MessagesPage() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setConversations(await teacherRequest("/teacher/conversations"));
    } catch (loadError) {
      setError(errorMessage(loadError, "会话加载失败，请确认 API 已启动。"));
    } finally {
      setLoading(false);
    }
  }

  function openConversation(conversation) {
    const parentName = conversation.parent
      ? conversation.parent.name
      : "学生家长";
    const title = `${conversation.student.name} · ${parentName}`;
    Taro.navigateTo({
      url: `/pages/chat/index?conversationId=${conversation.id}&title=${encodeURIComponent(title)}`,
    });
  }

  useDidShow(() => {
    load();
  });

  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(
        View,
        { className: "page-heading" },
        h(Text, { className: "title page-heading__title" }, "家校沟通"),
        h(
          Button,
          {
            className: "secondary-button",
            size: "mini",
            loading,
            disabled: loading,
            onClick: load,
          },
          "刷新",
        ),
      ),
      error ? h(Text, { className: "error-text" }, error) : null,
      loading
        ? h(Text, { className: "empty-state" }, "正在加载会话…")
        : conversations.length === 0
          ? h(Text, { className: "empty-state" }, "暂无家校沟通会话")
          : conversations.map((conversation) => {
              const lastMessage = conversation.messages[0];
              return h(
                View,
                {
                  className: "conversation-card",
                  key: conversation.id,
                  onClick: () => openConversation(conversation),
                },
                h(
                  View,
                  { className: "conversation-heading" },
                  h(
                    View,
                    { className: "conversation-heading-main" },
                    h(
                      Text,
                      { className: "conversation-title" },
                      `${conversation.student.name} · ${conversation.parent ? conversation.parent.name : "学生家长"}`,
                    ),
                    h(
                      Text,
                      { className: "muted" },
                      conversation.student.class.name,
                    ),
                  ),
                  conversation.unreadCount > 0
                    ? h(
                        Text,
                        { className: "unread-badge" },
                        conversation.unreadCount > 99
                          ? "99+"
                          : conversation.unreadCount,
                      )
                    : null,
                ),
                h(
                  Text,
                  { className: "conversation-preview" },
                  lastMessage ? lastMessage.content : "暂无消息，点击开始沟通",
                ),
                lastMessage
                  ? h(
                      Text,
                      { className: "conversation-time" },
                      formatDate(lastMessage.createdAt),
                    )
                  : null,
              );
            }),
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
