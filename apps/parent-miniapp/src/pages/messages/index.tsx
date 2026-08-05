// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { parentRequest } from "../../api";

const h = React.createElement;

export default function MessagesPage() {
  const [conversations, setConversations] = useState([]);

  async function load() {
    setConversations(await parentRequest("/parent/conversations"));
  }

  async function send(conversationId) {
    await parentRequest(`/parent/conversations/${conversationId}/messages`, {
      method: "POST",
      data: { content: "家长端测试消息" },
    });
    await load();
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "家校沟通"),
      h(Button, { className: "primary-button", onClick: load }, "刷新"),
      conversations.map((conversation) =>
        h(
          View,
          { className: "section", key: conversation.id },
          h(Text, { className: "subtitle" }, `${conversation.student.name} · ${conversation.teacher ? conversation.teacher.name : "老师"}`),
          h(Text, { className: "muted" }, `未读 ${conversation.unreadCount}`),
          h(Text, null, conversation.messages[0] ? conversation.messages[0].content : "暂无消息"),
          h(Button, { size: "mini", onClick: () => send(conversation.id) }, "发送测试消息"),
        ),
      ),
    ),
  );
}
