// @ts-nocheck
import React, { useMemo, useRef, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function MessagesPage() {
  const [activeSection, setActiveSection] = useState("notices");
  const [notices, setNotices] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [expandedReceiptIds, setExpandedReceiptIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const loadingRef = useRef(false);

  async function load(showLoading = true) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [noticeResult, conversationResult] = await Promise.allSettled([
        parentRequest("/parent/notices"),
        parentRequest("/parent/conversations"),
      ]);

      const failedSections = [];
      let nextNotices = notices;
      let nextConversations = conversations;
      if (noticeResult.status === "fulfilled") {
        nextNotices = noticeResult.value;
        setNotices(nextNotices);
      } else {
        failedSections.push("通知任务");
      }
      if (conversationResult.status === "fulfilled") {
        nextConversations = conversationResult.value;
        setConversations(nextConversations);
      } else {
        failedSections.push("家校会话");
      }
      if (failedSections.length) {
        setError(`${failedSections.join("、")}加载失败，请重试。`);
      }
      syncTabBarBadge(nextNotices, nextConversations);
    } finally {
      if (showLoading) setLoading(false);
      loadingRef.current = false;
    }
  }

  useDidShow(() => {
    load();
  });

  const pendingNoticeCount = useMemo(
    () => notices.filter((receipt) => !receipt.confirmedAt).length,
    [notices],
  );
  const unreadMessageCount = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) => total + Number(conversation.unreadCount || 0),
        0,
      ),
    [conversations],
  );

  function updateNotices(updater) {
    setNotices((current) => {
      const next = updater(current);
      syncTabBarBadge(next, conversations);
      return next;
    });
  }

  async function toggleNotice(receipt) {
    if (pendingAction) return;
    if (expandedReceiptIds.includes(receipt.id)) {
      setExpandedReceiptIds((current) => current.filter((id) => id !== receipt.id));
      return;
    }

    if (!receipt.viewedAt) {
      const actionKey = `${receipt.id}:view`;
      setPendingAction(actionKey);
      setError("");
      try {
        const updated = await parentRequest(`/parent/notice-receipts/${receipt.id}/view`, {
          method: "POST",
        });
        updateNotices((current) =>
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
        setError(errorMessage(viewError, "通知标记为已查看失败，请重试。"));
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
    if (pendingAction || !receipt.viewedAt || receipt.confirmedAt) return;
    const actionKey = `${receipt.id}:confirm`;
    setPendingAction(actionKey);
    setError("");
    try {
      const updated = await parentRequest(`/parent/notice-receipts/${receipt.id}/confirm`, {
        method: "POST",
      });
      updateNotices((current) =>
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
      Taro.showToast({ title: "确认成功", icon: "success" });
    } catch (confirmError) {
      setError(errorMessage(confirmError, "确认失败，请重试。"));
    } finally {
      setPendingAction("");
    }
  }

  function openConversation(conversation) {
    const title = `${conversation.student?.name || "孩子"} · ${conversation.teacher?.name || "老师"}`;
    Taro.navigateTo({
      url: `/pages/chat/index?conversationId=${conversation.id}&title=${encodeURIComponent(title)}`,
    });
  }

  return h(
    View,
    { className: "parent-messages-page" },
    h(
      View,
      { className: "communication-hero" },
      h(Text, { className: "communication-eyebrow" }, "家校协同"),
      h(Text, { className: "communication-title" }, "通知与沟通"),
      h(Text, { className: "communication-description" }, "集中处理老师发布的事项，并保持家校沟通畅通。"),
      h(
        View,
        { className: "communication-summary" },
        summaryItem(String(pendingNoticeCount), "待确认事项"),
        h(View, { className: "communication-summary__divider" }),
        summaryItem(String(unreadMessageCount), "未读消息"),
      ),
    ),
    h(
      View,
      { className: "communication-tabs" },
      sectionButton("notices", "通知任务", pendingNoticeCount, activeSection, setActiveSection),
      sectionButton("conversations", "家校会话", unreadMessageCount, activeSection, setActiveSection),
    ),
    h(
      View,
      { className: "communication-toolbar" },
      h(Text, { className: "communication-toolbar__hint" }, loading ? "正在同步…" : "进入页面已自动刷新"),
      h(
        Button,
        {
          className: "communication-refresh",
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
          { className: "communication-feedback communication-feedback--error" },
          h(Text, null, error),
          h(Button, { size: "mini", onClick: () => load() }, "重试"),
        )
      : null,
    activeSection === "notices"
      ? h(
          View,
          { className: "notice-list" },
          loading && notices.length === 0
            ? h(Text, { className: "communication-feedback" }, "正在加载通知与任务…")
            : null,
          !loading && notices.length === 0
            ? emptyState("通", "暂无通知或任务", "老师发布的新事项会显示在这里。")
            : null,
          notices.map((receipt) =>
            renderNotice(receipt, {
              expanded: expandedReceiptIds.includes(receipt.id),
              pendingAction,
              onToggle: toggleNotice,
              onConfirm: confirmNotice,
            }),
          ),
        )
      : h(
          View,
          { className: "parent-conversation-list" },
          loading && conversations.length === 0
            ? h(Text, { className: "communication-feedback" }, "正在加载家校会话…")
            : null,
          !loading && conversations.length === 0
            ? emptyState("聊", "暂无家校会话", "完成孩子绑定后，可在这里联系班级老师。")
            : null,
          conversations.map((conversation) =>
            renderConversation(conversation, () => openConversation(conversation)),
          ),
        ),
  );
}

function summaryItem(value, label) {
  return h(
    View,
    { className: "communication-summary__item" },
    h(Text, { className: "communication-summary__value" }, value),
    h(Text, { className: "communication-summary__label" }, label),
  );
}

function sectionButton(key, label, count, activeSection, setActiveSection) {
  const active = activeSection === key;
  return h(
    View,
    {
      className: `communication-tab${active ? " communication-tab--active" : ""}`,
      onClick: () => setActiveSection(key),
    },
    h(Text, { className: "communication-tab__label" }, label),
    count
      ? h(Text, { className: "communication-tab__count" }, count > 99 ? "99+" : String(count))
      : null,
  );
}

function renderNotice(receipt, actions) {
  const notice = receipt.notice || {};
  const isTask = notice.kind === "task";
  const status = receipt.confirmedAt ? "已确认" : receipt.viewedAt ? "待确认" : "未查看";
  const viewing = actions.pendingAction === `${receipt.id}:view`;
  const confirming = actions.pendingAction === `${receipt.id}:confirm`;
  return h(
    View,
    {
      className: `parent-notice-card${receipt.confirmedAt ? " parent-notice-card--done" : ""}`,
      key: receipt.id,
    },
    h(
      View,
      { className: "parent-notice-card__top" },
      h(Text, { className: `parent-notice-kind${isTask ? " parent-notice-kind--task" : ""}` }, isTask ? "任务" : "通知"),
      h(Text, { className: `parent-notice-status parent-notice-status--${receipt.confirmedAt ? "done" : receipt.viewedAt ? "pending" : "new"}` }, status),
    ),
    h(Text, { className: "parent-notice-title" }, notice.title || "未命名事项"),
    h(
      Text,
      { className: "parent-notice-source" },
      `${receipt.student?.name || "孩子"} · ${notice.class?.name || "班级"} · ${notice.teacher?.name || "老师"}`,
    ),
    actions.expanded
      ? h(
          View,
          { className: "parent-notice-detail" },
          h(Text, { className: "parent-notice-content" }, notice.content || "暂无详细内容"),
          notice.dueAt
            ? h(Text, { className: "parent-notice-deadline" }, `截止：${formatDate(notice.dueAt)}`)
            : null,
          h(Text, { className: "parent-notice-time" }, `发布：${formatDate(notice.createdAt)}`),
        )
      : h(
          Text,
          { className: "parent-notice-preview" },
          notice.content || "点击查看详情",
        ),
    h(
      View,
      { className: "parent-notice-actions" },
      h(
        Button,
        {
          className: "parent-notice-button",
          size: "mini",
          loading: viewing,
          disabled: Boolean(actions.pendingAction),
          onClick: () => actions.onToggle(receipt),
        },
        actions.expanded ? "收起" : receipt.viewedAt ? "查看详情" : "查看并标记已读",
      ),
      actions.expanded && receipt.viewedAt && !receipt.confirmedAt
        ? h(
            Button,
            {
              className: "parent-notice-button parent-notice-button--primary",
              size: "mini",
              loading: confirming,
              disabled: Boolean(actions.pendingAction),
              onClick: () => actions.onConfirm(receipt),
            },
            isTask ? "确认任务" : "确认已知晓",
          )
        : null,
    ),
  );
}

function renderConversation(conversation, onOpen) {
  const lastMessage = conversation.messages?.[0];
  const unread = Number(conversation.unreadCount || 0);
  const studentName = conversation.student?.name || "孩子";
  const teacherName = conversation.teacher?.name || "老师";
  return h(
    View,
    {
      className: `parent-conversation${unread ? " parent-conversation--unread" : ""}`,
      key: conversation.id,
      onClick: onOpen,
    },
    h(View, { className: "parent-conversation__avatar" }, h(Text, null, teacherName.slice(0, 1))),
    h(
      View,
      { className: "parent-conversation__body" },
      h(
        View,
        { className: "parent-conversation__top" },
        h(Text, { className: "parent-conversation__name" }, `${studentName} · ${teacherName}`),
        h(Text, { className: "parent-conversation__time" }, lastMessage ? formatShortDate(lastMessage.createdAt) : ""),
      ),
      h(
        View,
        { className: "parent-conversation__bottom" },
        h(Text, { className: "parent-conversation__preview" }, lastMessage ? lastMessage.content : "暂无消息，点击开始沟通"),
        unread
          ? h(Text, { className: "parent-conversation__unread" }, unread > 99 ? "99+" : String(unread))
          : h(Text, { className: "parent-conversation__arrow" }, "›"),
      ),
    ),
  );
}

function emptyState(icon, title, description) {
  return h(
    View,
    { className: "communication-empty" },
    h(Text, { className: "communication-empty__icon" }, icon),
    h(Text, { className: "communication-empty__title" }, title),
    h(Text, { className: "communication-empty__text" }, description),
  );
}

function syncTabBarBadge(noticeItems, conversationItems) {
  const pending = noticeItems.filter((item) => !item.confirmedAt).length;
  const unread = conversationItems.reduce(
    (total, item) => total + Number(item.unreadCount || 0),
    0,
  );
  const total = pending + unread;
  const task = total
    ? Taro.setTabBarBadge({ index: 2, text: total > 99 ? "99+" : String(total) })
    : Taro.removeTabBarBadge({ index: 2 });
  Promise.resolve(task).catch(() => undefined);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  if (date.toDateString() === now.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
