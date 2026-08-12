// @ts-nocheck
import React, { useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

const quickActions = [
  {
    key: "workflow",
    icon: "✓",
    title: "流程打卡",
    description: "完成今日照护流程",
    tone: "green",
    action: () => Taro.switchTab({ url: "/pages/workflow/index" }),
  },
  {
    key: "teaching",
    icon: "✎",
    title: "教学与作业",
    description: "发布作业并完成批改",
    tone: "blue",
    action: () => Taro.switchTab({ url: "/pages/teaching/index" }),
  },
  {
    key: "notice",
    icon: "⌁",
    title: "通知任务",
    description: "发布内容并查看回执",
    tone: "coral",
    action: () => Taro.navigateTo({ url: "/pages/notices/index" }),
  },
  {
    key: "message",
    icon: "◌",
    title: "家校沟通",
    description: "查看并回复家长消息",
    tone: "purple",
    action: () => Taro.navigateTo({ url: "/pages/messages/index" }),
  },
];

export default function HomePage() {
  const [dashboard, setDashboard] = useState(null);
  const [profile, setProfile] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const [nextDashboard, nextProfile, nextConversations] = await Promise.all([
        teacherRequest("/teacher/dashboard"),
        teacherRequest("/me"),
        teacherRequest("/teacher/conversations"),
      ]);
      setDashboard(nextDashboard);
      setProfile(nextProfile);
      setConversations(nextConversations);
    } catch (err) {
      const message = err instanceof Error ? err.message : "工作台加载失败";
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  const workflow = dashboard?.workflow || {};
  const unreadCount = conversations.reduce(
    (sum, item) => sum + Number(item.unreadCount || 0),
    0,
  );
  const teacherName = profile?.name || "老师";
  const date = formatDate(dashboard?.date);

  return h(
    View,
    { className: "teacher-home" },
    h(
      View,
      { className: "home-topbar" },
      h(
        View,
        null,
        h(Text, { className: "home-brand" }, "锐之博 · 教师端"),
        h(Text, { className: "home-page-title" }, "工作台"),
      ),
      h(
        View,
        {
          className: `refresh-chip${loading ? " refresh-chip--loading" : ""}`,
          onClick: () => !loading && load(),
        },
        h(Text, { className: "refresh-chip__icon" }, "↻"),
        h(Text, null, loading ? "加载中" : "刷新"),
      ),
    ),
    error
      ? h(
          View,
          { className: "home-error" },
          h(Text, null, error),
          h(Text, { className: "home-error__retry", onClick: load }, "重新加载"),
        )
      : null,
    h(
      View,
      { className: "greeting-card" },
      h(
        View,
        { className: "greeting-card__copy" },
        h(Text, { className: "greeting-card__eyebrow" }, greetingText()),
        h(Text, { className: "greeting-card__title" }, `${teacherName}，今天也辛苦了`),
        h(Text, { className: "greeting-card__date" }, date),
      ),
      h(Text, { className: "greeting-card__mark" }, "RZB"),
      h(
        View,
        { className: "greeting-stats" },
        metric("班级", dashboard?.classCount || 0),
        metric("学生", dashboard?.studentCount || 0),
        metric("待批作业", dashboard?.homeworkPending || 0),
      ),
    ),
    sectionHeading("快捷工作", "高频事项一步直达"),
    h(
      View,
      { className: "quick-grid" },
      ...quickActions.map((item) =>
        h(
          View,
          {
            className: `quick-card quick-card--${item.tone}`,
            key: item.key,
            onClick: item.action,
          },
          h(Text, { className: "quick-card__icon" }, item.icon),
          h(Text, { className: "quick-card__title" }, item.title),
          h(Text, { className: "quick-card__description" }, item.description),
        ),
      ),
    ),
    sectionHeading("今日待办", "根据实时数据自动更新"),
    h(
      View,
      { className: "task-card" },
      taskRow(
        "流程打卡",
        workflow.uncheckedStepCount
          ? `还有 ${workflow.uncheckedStepCount} 个步骤待完成`
          : "今日流程已全部完成",
        workflow.uncheckedStepCount ? "待处理" : "已完成",
        workflow.uncheckedStepCount ? "warning" : "success",
        () => Taro.switchTab({ url: "/pages/workflow/index" }),
      ),
      taskRow(
        "作业批改",
        dashboard?.homeworkPending
          ? `${dashboard.homeworkPending} 份作业等待批改`
          : "当前没有待批作业",
        dashboard?.homeworkPending ? "去批改" : "已清空",
        dashboard?.homeworkPending ? "danger" : "success",
        () => Taro.switchTab({ url: "/pages/teaching/index" }),
      ),
      taskRow(
        "家长消息",
        unreadCount ? `${unreadCount} 条未读消息需要回复` : "家长消息均已查看",
        unreadCount ? "去回复" : "无未读",
        unreadCount ? "info" : "success",
        () => Taro.navigateTo({ url: "/pages/messages/index" }),
      ),
    ),
    sectionHeading("我的班级", `${dashboard?.classCount || 0} 个负责班级`),
    h(
      View,
      { className: "class-list" },
      dashboard?.classes?.length
        ? dashboard.classes.map((item, index) =>
            h(
              View,
              { className: "class-card", key: item.id },
              h(
                View,
                { className: `class-card__avatar class-card__avatar--${index % 3}` },
                h(Text, null, item.name.slice(0, 1)),
              ),
              h(
                View,
                { className: "class-card__main" },
                h(Text, { className: "class-card__name" }, item.name),
                h(Text, { className: "class-card__meta" }, `${item._count?.students || 0} 名学生`),
              ),
              h(Text, { className: "class-card__status" }, "负责班级"),
            ),
          )
        : h(Text, { className: "home-empty" }, loading ? "正在加载班级…" : "暂无负责班级"),
    ),
  );
}

function metric(label, value) {
  return h(
    View,
    { className: "greeting-stat" },
    h(Text, { className: "greeting-stat__value" }, value),
    h(Text, { className: "greeting-stat__label" }, label),
  );
}

function sectionHeading(title, hint) {
  return h(
    View,
    { className: "home-section-heading" },
    h(Text, { className: "home-section-heading__title" }, title),
    h(Text, { className: "home-section-heading__hint" }, hint),
  );
}

function taskRow(title, description, status, tone, onClick) {
  return h(
    View,
    { className: "task-row", onClick },
    h(View, { className: `task-row__dot task-row__dot--${tone}` }),
    h(
      View,
      { className: "task-row__main" },
      h(Text, { className: "task-row__title" }, title),
      h(Text, { className: "task-row__description" }, description),
    ),
    h(Text, { className: `task-row__status task-row__status--${tone}` }, status),
  );
}

function greetingText() {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}
