// @ts-nocheck
import React, { useRef, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const ACTIVE_CHILD_KEY = "parentActiveChildId";
const filters = [
  ["all", "全部"],
  ["teacher_feedback", "老师反馈"],
  ["workflow", "日常流程"],
  ["homework", "作业"],
  ["attendance", "出勤"],
];

export default function GrowthPage() {
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState("");
  const [records, setRecords] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  async function load(showLoading = true) {
    const sequence = ++requestSequence.current;
    if (showLoading) setLoading(true);
    setError("");
    try {
      const nextChildren = await parentRequest("/parent/children");
      const storedChildId = Taro.getStorageSync(ACTIVE_CHILD_KEY);
      const nextChild =
        nextChildren.find((item) => item.id === storedChildId) ||
        nextChildren.find((item) => item.id === activeChildId) ||
        nextChildren[0];
      if (sequence !== requestSequence.current) return;
      setChildren(nextChildren);
      setActiveChildId(nextChild?.id || "");
      if (!nextChild) {
        setRecords([]);
        setAttendance([]);
        return;
      }
      Taro.setStorageSync(ACTIVE_CHILD_KEY, nextChild.id);
      const [nextRecords, nextAttendance] = await Promise.all([
        parentRequest(`/parent/children/${nextChild.id}/timeline`),
        parentRequest(`/parent/children/${nextChild.id}/attendance`),
      ]);
      if (sequence !== requestSequence.current) return;
      setRecords(nextRecords);
      setAttendance(nextAttendance);
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(errorMessage(loadError, "成长记录加载失败，请重试。"));
      }
    } finally {
      if (sequence === requestSequence.current && showLoading)
        setLoading(false);
    }
  }

  async function selectChild(childId) {
    if (childId === activeChildId || loading) return;
    const sequence = ++requestSequence.current;
    setActiveChildId(childId);
    Taro.setStorageSync(ACTIVE_CHILD_KEY, childId);
    setLoading(true);
    setError("");
    setRecords([]);
    setAttendance([]);
    try {
      const [nextRecords, nextAttendance] = await Promise.all([
        parentRequest(`/parent/children/${childId}/timeline`),
        parentRequest(`/parent/children/${childId}/attendance`),
      ]);
      if (sequence !== requestSequence.current) return;
      setRecords(nextRecords);
      setAttendance(nextAttendance);
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(errorMessage(loadError, "切换孩子失败，请重试。"));
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  const child = children.find((item) => item.id === activeChildId);
  const filteredRecords = records.filter(
    (record) => activeFilter === "all" || record.type === activeFilter,
  );
  const groups = groupRecords(filteredRecords);
  const attendanceSummary = summarizeAttendance(attendance);

  return h(
    View,
    { className: "growth-page" },
    h(
      View,
      { className: "growth-topbar" },
      h(
        View,
        null,
        h(Text, { className: "growth-eyebrow" }, "成长档案"),
        h(Text, { className: "growth-title" }, "每一次进步都有记录"),
      ),
      h(
        Button,
        {
          className: "growth-refresh",
          size: "mini",
          loading,
          disabled: loading,
          onClick: () => load(),
        },
        "刷新",
      ),
    ),
    children.length > 1
      ? h(
          View,
          { className: "growth-child-switcher" },
          children.map((item) =>
            h(
              View,
              {
                className: `growth-child-chip${item.id === activeChildId ? " growth-child-chip--active" : ""}`,
                key: item.id,
                onClick: () => selectChild(item.id),
              },
              h(Text, null, childDisplayName(children, item)),
            ),
          ),
        )
      : null,
    error
      ? h(
          View,
          { className: "growth-error" },
          h(Text, { className: "growth-error__text" }, error),
          h(
            Text,
            { className: "growth-error__retry", onClick: () => load() },
            "重新加载",
          ),
        )
      : null,
    child
      ? h(
          View,
          { className: "growth-child-card" },
          h(
            View,
            { className: "growth-child-avatar" },
            h(Text, null, child.name.slice(0, 1)),
          ),
          h(
            View,
            { className: "growth-child-main" },
            h(Text, { className: "growth-child-name" }, child.name),
            h(
              Text,
              { className: "growth-child-meta" },
              `${child.class?.name || "未分班"} · ${child.relation || "家长"}`,
            ),
          ),
          h(
            View,
            { className: "growth-child-count" },
            h(Text, { className: "growth-child-count__value" }, records.length),
            h(Text, { className: "growth-child-count__label" }, "条记录"),
          ),
        )
      : h(
          View,
          { className: "growth-empty-card" },
          h(
            Text,
            { className: "growth-empty-title" },
            loading ? "正在读取孩子信息…" : "尚未绑定孩子",
          ),
          h(
            Text,
            { className: "growth-empty-copy" },
            "请联系管理员完成孩子绑定后再查看成长档案。",
          ),
        ),
    child
      ? h(
          View,
          { className: "attendance-card" },
          h(
            View,
            { className: "attendance-heading" },
            h(Text, { className: "attendance-title" }, "近 30 天出勤"),
            h(
              Text,
              { className: "attendance-total" },
              attendanceSummary.total
                ? `${attendanceSummary.total} 条记录`
                : "暂无记录",
            ),
          ),
          h(
            View,
            { className: "attendance-grid" },
            attendanceMetric("到校", attendanceSummary.arrive, "green"),
            attendanceMetric("离校", attendanceSummary.leave, "blue"),
            attendanceMetric("迟到", attendanceSummary.late, "yellow"),
            attendanceMetric("缺勤", attendanceSummary.absence, "coral"),
          ),
        )
      : null,
    child
      ? h(
          View,
          { className: "growth-filter-card" },
          h(Text, { className: "growth-section-title" }, "成长时间线"),
          h(
            View,
            { className: "growth-filters" },
            filters.map(([value, label]) =>
              h(
                View,
                {
                  className: `growth-filter${activeFilter === value ? " growth-filter--active" : ""}`,
                  key: value,
                  onClick: () => setActiveFilter(value),
                },
                h(Text, null, label),
              ),
            ),
          ),
        )
      : null,
    loading
      ? h(Text, { className: "growth-state" }, "正在加载成长记录…")
      : child && groups.length === 0
        ? h(
            View,
            { className: "growth-empty-card" },
            h(Text, { className: "growth-empty-icon" }, "♧"),
            h(Text, { className: "growth-empty-title" }, "该分类暂无成长记录"),
            h(
              Text,
              { className: "growth-empty-copy" },
              "老师发布反馈或完成流程后会显示在这里。",
            ),
          )
        : groups.map((group) =>
            h(
              View,
              { className: "growth-day", key: group.key },
              h(Text, { className: "growth-day-label" }, group.label),
              h(
                View,
                { className: "growth-timeline" },
                group.records.map((record) =>
                  h(
                    View,
                    { className: "growth-record", key: record.id },
                    h(
                      View,
                      {
                        className: `growth-record-icon growth-record-icon--${recordTone(record.type)}`,
                      },
                      h(Text, null, recordIcon(record.type)),
                    ),
                    h(
                      View,
                      { className: "growth-record-main" },
                      h(
                        View,
                        { className: "growth-record-heading" },
                        h(
                          Text,
                          { className: "growth-record-type" },
                          recordTypeText(record.type),
                        ),
                        h(
                          Text,
                          { className: "growth-record-time" },
                          formatTime(record.happenedAt),
                        ),
                      ),
                      h(
                        Text,
                        { className: "growth-record-title" },
                        record.title,
                      ),
                      h(
                        Text,
                        { className: "growth-record-content" },
                        record.content,
                      ),
                      record.teacher?.name
                        ? h(
                            Text,
                            { className: "growth-record-teacher" },
                            `记录人：${record.teacher.name}`,
                          )
                        : null,
                    ),
                  ),
                ),
              ),
            ),
          ),
  );
}

function attendanceMetric(label, value, tone) {
  return h(
    View,
    { className: `attendance-metric attendance-metric--${tone}` },
    h(Text, { className: "attendance-metric__value" }, value),
    h(Text, { className: "attendance-metric__label" }, label),
  );
}

function summarizeAttendance(events) {
  const start = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = events.filter(
    (event) => new Date(event.happenedAt).getTime() >= start,
  );
  return recent.reduce(
    (summary, event) => {
      summary.total += 1;
      if (summary[event.type] !== undefined) summary[event.type] += 1;
      return summary;
    },
    { total: 0, arrive: 0, leave: 0, late: 0, absence: 0 },
  );
}

function groupRecords(records) {
  const groups = [];
  records.forEach((record) => {
    const date = new Date(record.happenedAt);
    const key = Number.isNaN(date.getTime()) ? "unknown" : dateKey(date);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, label: dateLabel(date), records: [] };
      groups.push(group);
    }
    group.records.push(record);
  });
  return groups;
}

function childDisplayName(children, child) {
  const matches = children.filter((item) => item.name === child.name);
  if (matches.length <= 1) return child.name;
  return `${child.name}（${matches.findIndex((item) => item.id === child.id) + 1}）`;
}

function recordTypeText(type) {
  return (
    {
      workflow: "日常流程",
      teacher_feedback: "老师反馈",
      homework: "作业记录",
      attendance: "出勤记录",
      notice: "通知记录",
    }[type] || "成长记录"
  );
}

function recordIcon(type) {
  return (
    {
      workflow: "✓",
      teacher_feedback: "♡",
      homework: "✎",
      attendance: "⌂",
      notice: "!",
    }[type] || "•"
  );
}

function recordTone(type) {
  return (
    {
      workflow: "green",
      teacher_feedback: "coral",
      homework: "yellow",
      attendance: "blue",
      notice: "purple",
    }[type] || "green"
  );
}

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateLabel(date) {
  if (Number.isNaN(date.getTime())) return "日期未知";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(date) === dateKey(today)) return "今天";
  if (dateKey(date) === dateKey(yesterday)) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
