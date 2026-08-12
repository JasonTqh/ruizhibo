// @ts-nocheck
import React, { useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const ACTIVE_CHILD_KEY = "parentActiveChildId";

export default function HomePage() {
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState("");
  const [records, setRecords] = useState([]);
  const [homework, setHomework] = useState([]);
  const [notices, setNotices] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const nextChildren = await parentRequest("/parent/children");
      const storedChildId = Taro.getStorageSync(ACTIVE_CHILD_KEY);
      const nextChild =
        nextChildren.find((item) => item.id === storedChildId) ||
        nextChildren.find((item) => item.id === activeChildId) ||
        nextChildren[0];
      setChildren(nextChildren);
      setActiveChildId(nextChild?.id || "");
      if (nextChild) Taro.setStorageSync(ACTIVE_CHILD_KEY, nextChild.id);

      const [nextRecords, nextHomework, nextNotices, nextConversations] =
        await Promise.all([
          nextChild
            ? parentRequest(`/parent/children/${nextChild.id}/timeline`)
            : Promise.resolve([]),
          nextChild
            ? parentRequest(`/parent/children/${nextChild.id}/homework`)
            : Promise.resolve([]),
          parentRequest("/parent/notices"),
          parentRequest("/parent/conversations"),
        ]);
      if (sequence !== requestSequence.current) return;
      setRecords(nextRecords);
      setHomework(nextHomework);
      setNotices(nextNotices);
      setConversations(nextConversations);
      syncCommunicationBadge(nextNotices, nextConversations);
    } catch (loadError) {
      if (sequence === requestSequence.current) setError(
        loadError instanceof Error
          ? loadError.message
          : "首页加载失败，请稍后重试。",
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
      loadingRef.current = false;
    }
  }

  async function selectChild(childId) {
    if (childId === activeChildId || loading) return;
    loadingRef.current = true;
    const sequence = ++requestSequence.current;
    setActiveChildId(childId);
    Taro.setStorageSync(ACTIVE_CHILD_KEY, childId);
    setLoading(true);
    setError("");
    try {
      const [nextRecords, nextHomework] = await Promise.all([
        parentRequest(`/parent/children/${childId}/timeline`),
        parentRequest(`/parent/children/${childId}/homework`),
      ]);
      if (sequence !== requestSequence.current) return;
      setRecords(nextRecords);
      setHomework(nextHomework);
    } catch (loadError) {
      if (sequence === requestSequence.current) setError("切换孩子失败，请重试。");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
      loadingRef.current = false;
    }
  }

  useDidShow(() => {
    load();
  });

  const child =
    children.find((item) => item.id === activeChildId) || children[0];
  const pendingHomework = homework.filter((item) =>
    ["pending", "overdue"].includes(item.status),
  );
  const pendingNotices = notices.filter((item) => !item.confirmedAt);
  const unreadCount = conversations.reduce(
    (sum, item) => sum + Number(item.unreadCount || 0),
    0,
  );

  return h(
    View,
    { className: "parent-home" },
    h(
      View,
      { className: "parent-home__topbar" },
      h(
        View,
        null,
        h(Text, { className: "parent-home__brand" }, "锐之博托管中心"),
        h(Text, { className: "parent-home__welcome" }, "让成长每天都看得见"),
      ),
      h(
        View,
        {
          className: `parent-refresh${loading ? " parent-refresh--loading" : ""}`,
          onClick: () => !loading && load(),
        },
        h(Text, null, "↻"),
      ),
    ),
    error
      ? h(
          View,
          { className: "parent-home__error" },
          h(Text, null, error),
          h(
            Text,
            { className: "parent-home__retry", onClick: load },
            "重新加载",
          ),
        )
      : null,
    children.length > 1
      ? h(
          View,
          { className: "child-switcher" },
          ...children.map((item) =>
            h(
              View,
              {
                className: `child-switcher__item${item.id === activeChildId ? " child-switcher__item--active" : ""}`,
                key: item.id,
                onClick: () => selectChild(item.id),
              },
              h(Text, null, childDisplayName(children, item)),
            ),
          ),
        )
      : null,
    child
      ? h(
          View,
          { className: "child-hero" },
          h(
            View,
            { className: "child-hero__avatar" },
            h(Text, null, child.name.slice(0, 1)),
          ),
          h(
            View,
            { className: "child-hero__main" },
            h(Text, { className: "child-hero__eyebrow" }, "我的孩子"),
            h(Text, { className: "child-hero__name" }, child.name),
            h(
              Text,
              { className: "child-hero__meta" },
              `${child.class?.name || "未分班"} · ${child.relation || "家长"}`,
            ),
          ),
          h(
            View,
            { className: "child-hero__today" },
            h(Text, { className: "child-hero__today-value" }, records.length),
            h(Text, { className: "child-hero__today-label" }, "成长记录"),
          ),
        )
      : h(
          View,
          { className: "parent-empty-card" },
          h(
            Text,
            { className: "parent-empty-card__title" },
            loading ? "正在加载孩子信息…" : "尚未绑定孩子",
          ),
          h(
            Text,
            { className: "parent-empty-card__hint" },
            "请联系管理员完成家长与孩子的绑定。",
          ),
        ),
    h(
      View,
      { className: "parent-quick-grid" },
      quickItem(
        "▣",
        "作业中心",
        pendingHomework.length
          ? `${pendingHomework.length} 项待完成`
          : "查看全部作业",
        "green",
        () => Taro.navigateTo({ url: "/pages/homework/index" }),
      ),
      quickItem("↗", "成长记录", `${records.length} 条最新动态`, "yellow", () =>
        Taro.switchTab({ url: "/pages/growth/index" }),
      ),
      quickItem(
        "◇",
        "通知任务",
        pendingNotices.length
          ? `${pendingNotices.length} 项待确认`
          : "暂无待确认",
        "coral",
        () => Taro.switchTab({ url: "/pages/messages/index" }),
      ),
      quickItem(
        "◌",
        "家校沟通",
        unreadCount ? `${unreadCount} 条未读消息` : "联系班级老师",
        "blue",
        () => Taro.switchTab({ url: "/pages/messages/index" }),
      ),
    ),
    homeHeading("今日提醒", "重要事项不错过"),
    h(
      View,
      { className: "reminder-list" },
      pendingHomework.length
        ? reminderRow(
            "作业待完成",
            pendingHomework[0].homework?.title || "老师发布了新作业",
            "作业",
            "yellow",
            () => Taro.navigateTo({ url: "/pages/homework/index" }),
          )
        : reminderRow("今日作业", "当前没有待完成作业", "已完成", "green", () =>
            Taro.navigateTo({ url: "/pages/homework/index" }),
          ),
      pendingNotices.length
        ? reminderRow(
            "通知待确认",
            pendingNotices[0].notice?.title || "老师发布了新通知",
            `${pendingNotices.length} 项`,
            "coral",
            () => Taro.switchTab({ url: "/pages/messages/index" }),
          )
        : reminderRow(
            "通知任务",
            "所有通知均已查看确认",
            "已处理",
            "green",
            () => Taro.switchTab({ url: "/pages/messages/index" }),
          ),
      unreadCount
        ? reminderRow(
            "老师有新回复",
            "点击进入家校沟通查看消息",
            `${unreadCount} 条`,
            "blue",
            () => Taro.switchTab({ url: "/pages/messages/index" }),
          )
        : null,
    ),
    homeHeading("今日成长", "查看全部", () =>
      Taro.switchTab({ url: "/pages/growth/index" }),
    ),
    h(
      View,
      { className: "growth-preview" },
      records.length
        ? records
            .slice(0, 3)
            .map((record, index) =>
              h(
                View,
                { className: "growth-preview__row", key: record.id },
                h(
                  View,
                  {
                    className: `growth-preview__icon growth-preview__icon--${recordTone(record.type, index)}`,
                  },
                  h(Text, null, recordIcon(record.type)),
                ),
                h(
                  View,
                  { className: "growth-preview__main" },
                  h(
                    Text,
                    { className: "growth-preview__type" },
                    recordTypeText(record.type),
                  ),
                  h(Text, { className: "growth-preview__title" }, record.title),
                  h(
                    Text,
                    { className: "growth-preview__content" },
                    record.content,
                  ),
                ),
                h(
                  Text,
                  { className: "growth-preview__time" },
                  shortDate(record.happenedAt),
                ),
              ),
            )
        : h(
            View,
            { className: "growth-preview__empty" },
            h(Text, { className: "growth-preview__empty-icon" }, "♧"),
            h(
              Text,
              null,
              loading ? "正在加载今日成长…" : "今天暂无新的成长记录",
            ),
          ),
    ),
  );
}

function syncCommunicationBadge(noticeItems, conversationItems) {
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

function quickItem(icon, title, description, tone, onClick) {
  return h(
    View,
    { className: "parent-quick-item", onClick },
    h(
      Text,
      { className: `parent-quick-item__icon parent-quick-item__icon--${tone}` },
      icon,
    ),
    h(Text, { className: "parent-quick-item__title" }, title),
    h(Text, { className: "parent-quick-item__description" }, description),
  );
}

function childDisplayName(children, child) {
  const matches = children.filter((item) => item.name === child.name);
  if (matches.length <= 1) return child.name;
  return `${child.name}（${matches.findIndex((item) => item.id === child.id) + 1}）`;
}

function homeHeading(title, action, onClick) {
  return h(
    View,
    { className: "parent-section-heading" },
    h(Text, { className: "parent-section-heading__title" }, title),
    h(Text, { className: "parent-section-heading__action", onClick }, action),
  );
}

function reminderRow(title, description, badge, tone, onClick) {
  return h(
    View,
    { className: "reminder-row", onClick },
    h(View, { className: `reminder-row__bar reminder-row__bar--${tone}` }),
    h(
      View,
      { className: "reminder-row__main" },
      h(Text, { className: "reminder-row__title" }, title),
      h(Text, { className: "reminder-row__description" }, description),
    ),
    h(
      Text,
      { className: `reminder-row__badge reminder-row__badge--${tone}` },
      badge,
    ),
  );
}

function recordTypeText(type) {
  const labels = {
    workflow: "流程记录",
    teacher_feedback: "老师反馈",
    homework: "作业记录",
    attendance: "出勤记录",
  };
  return labels[type] || "成长记录";
}

function recordIcon(type) {
  return (
    { workflow: "✓", teacher_feedback: "♡", homework: "✎", attendance: "⌂" }[
      type
    ] || "•"
  );
}

function recordTone(type, index) {
  return (
    {
      workflow: "green",
      teacher_feedback: "coral",
      homework: "yellow",
      attendance: "blue",
    }[type] || ["green", "blue", "yellow"][index % 3]
  );
}

function shortDate(value) {
  if (!value) return "今天";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`;
}
