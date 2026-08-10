// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { parentRequest } from "../../api";

const h = React.createElement;

export default function MessagesPage() {
  const [notices, setNotices] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [expandedReceiptIds, setExpandedReceiptIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [sendingConversationId, setSendingConversationId] = useState("");

  async function loadNotices() {
    const nextNotices = await parentRequest("/parent/notices");
    setNotices(nextNotices);
  }

  async function loadConversations() {
    const nextConversations = await parentRequest("/parent/conversations");
    setConversations(nextConversations);
  }

  async function load(showLoading = true) {
    if (showLoading) {
      setLoading(true);
      setNotices([]);
      setConversations([]);
    }
    setError("");

    try {
      const failures = await Promise.all([
        loadNotices()
          .then(() => "")
          .catch(() => "通知与任务"),
        loadConversations()
          .then(() => "")
          .catch(() => "家校会话"),
      ]);
      const failedSections = failures.filter(Boolean);
      if (failedSections.length) {
        setError(`${failedSections.join("、")}加载失败，请重试。`);
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  async function toggleNotice(receipt) {
    if (expandedReceiptIds.includes(receipt.id)) {
      setExpandedReceiptIds((current) =>
        current.filter((receiptId) => receiptId !== receipt.id),
      );
      return;
    }

    if (!receipt.viewedAt) {
      const actionKey = `${receipt.id}:view`;
      setPendingAction(actionKey);
      setError("");
      try {
        const updated = await parentRequest(
          `/parent/notice-receipts/${receipt.id}/view`,
          {
            method: "POST",
          },
        );
        setNotices((current) =>
          current.map((item) =>
            item.id === receipt.id
              ? {
                  ...item,
                  viewedAt: updated.viewedAt,
                  confirmedAt: updated.confirmedAt,
                  status: updated.confirmedAt ? "confirmed" : "viewed",
                }
              : item,
          ),
        );
      } catch (viewError) {
        setError("通知标记为已查看失败，请重试。");
        return;
      } finally {
        setPendingAction("");
      }
    }

    setExpandedReceiptIds((current) =>
      current.includes(receipt.id) ? current : [...current, receipt.id],
    );
  }

  async function confirmNotice(receipt) {
    if (!receipt.viewedAt || receipt.confirmedAt) {
      return;
    }

    const actionKey = `${receipt.id}:confirm`;
    setPendingAction(actionKey);
    setError("");
    try {
      const updated = await parentRequest(
        `/parent/notice-receipts/${receipt.id}/confirm`,
        {
          method: "POST",
        },
      );
      setNotices((current) =>
        current.map((item) =>
          item.id === receipt.id
            ? {
                ...item,
                viewedAt: updated.viewedAt,
                confirmedAt: updated.confirmedAt,
                status: "confirmed",
              }
            : item,
        ),
      );
    } catch (confirmError) {
      setError("确认失败，请重试。");
    } finally {
      setPendingAction("");
    }
  }

  async function send(conversationId) {
    setSendingConversationId(conversationId);
    setError("");
    try {
      await parentRequest(`/parent/conversations/${conversationId}/messages`, {
        method: "POST",
        data: { content: "家长端测试消息" },
      });
      await loadConversations();
    } catch (sendError) {
      setError("消息发送失败，请重试。");
    } finally {
      setSendingConversationId("");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return h(
    View,
    { className: "page" },
    error
      ? h(
          View,
          { className: "feedback-state feedback-state--error" },
          h(Text, null, error),
        )
      : null,
    h(
      View,
      { className: "card" },
      h(
        View,
        { className: "page-heading" },
        h(Text, { className: "title page-heading__title" }, "通知与任务"),
        h(
          Button,
          {
            className: "refresh-button",
            size: "mini",
            loading,
            disabled: loading,
            onClick: () => load(),
          },
          "刷新",
        ),
      ),
      loading
        ? h(
            View,
            { className: "feedback-state" },
            h(Text, null, "正在加载通知与任务…"),
          )
        : notices.length === 0
          ? h(
              View,
              { className: "feedback-state" },
              h(Text, null, "暂无通知或任务"),
            )
          : notices.map((receipt) => {
              const notice = receipt.notice;
              const expanded = expandedReceiptIds.includes(receipt.id);
              const viewing = pendingAction === `${receipt.id}:view`;
              const confirming = pendingAction === `${receipt.id}:confirm`;
              const isTask = notice.kind === "task";
              const status = receipt.confirmedAt
                ? "已确认"
                : receipt.viewedAt
                  ? "已查看 · 待确认"
                  : "未查看";

              return h(
                View,
                {
                  className: `notice-card${receipt.confirmedAt ? " notice-card--confirmed" : ""}`,
                  key: receipt.id,
                },
                h(
                  View,
                  { className: "notice-card__heading" },
                  h(
                    Text,
                    {
                      className: `notice-kind${isTask ? " notice-kind--task" : ""}`,
                    },
                    isTask ? "任务" : "通知",
                  ),
                  h(
                    Text,
                    {
                      className: `notice-status${receipt.confirmedAt ? " notice-status--confirmed" : ""}`,
                    },
                    status,
                  ),
                ),
                h(Text, { className: "notice-title" }, notice.title),
                h(
                  Text,
                  { className: "muted" },
                  `${receipt.student.name} · ${notice.class.name} · ${notice.teacher.name}`,
                ),
                expanded
                  ? h(
                      View,
                      { className: "notice-detail" },
                      h(Text, { className: "notice-content" }, notice.content),
                      notice.dueAt
                        ? h(
                            Text,
                            { className: "muted notice-meta" },
                            `截止时间：${formatDate(notice.dueAt)}`,
                          )
                        : null,
                      h(
                        Text,
                        { className: "muted notice-meta" },
                        `发布时间：${formatDate(notice.createdAt)}`,
                      ),
                    )
                  : null,
                h(
                  View,
                  { className: "notice-actions" },
                  h(
                    Button,
                    {
                      className: "notice-action-button",
                      size: "mini",
                      loading: viewing,
                      disabled: Boolean(pendingAction),
                      onClick: () => toggleNotice(receipt),
                    },
                    expanded
                      ? "收起"
                      : receipt.viewedAt
                        ? "查看详情"
                        : "查看并标记已读",
                  ),
                  expanded && receipt.viewedAt && !receipt.confirmedAt
                    ? h(
                        Button,
                        {
                          className:
                            "notice-action-button notice-action-button--primary",
                          size: "mini",
                          loading: confirming,
                          disabled: Boolean(pendingAction),
                          onClick: () => confirmNotice(receipt),
                        },
                        isTask ? "确认任务" : "确认已知晓",
                      )
                    : null,
                ),
              );
            }),
    ),
    h(
      View,
      { className: "card communication-card" },
      h(Text, { className: "title" }, "家校沟通"),
      loading
        ? h(
            View,
            { className: "feedback-state" },
            h(Text, null, "正在加载会话…"),
          )
        : conversations.length === 0
          ? h(
              View,
              { className: "feedback-state" },
              h(Text, null, "暂无家校沟通会话"),
            )
          : conversations.map((conversation) =>
              h(
                View,
                { className: "section", key: conversation.id },
                h(
                  Text,
                  { className: "subtitle" },
                  `${conversation.student.name} · ${conversation.teacher ? conversation.teacher.name : "老师"}`,
                ),
                h(
                  Text,
                  { className: "muted" },
                  `未读 ${conversation.unreadCount}`,
                ),
                h(
                  Text,
                  { className: "conversation-preview" },
                  conversation.messages[0]
                    ? conversation.messages[0].content
                    : "暂无消息",
                ),
                h(
                  Button,
                  {
                    className: "conversation-action-button",
                    size: "mini",
                    loading: sendingConversationId === conversation.id,
                    disabled: Boolean(sendingConversationId),
                    onClick: () => send(conversation.id),
                  },
                  "发送测试消息",
                ),
              ),
            ),
    ),
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "--";
  }

  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
