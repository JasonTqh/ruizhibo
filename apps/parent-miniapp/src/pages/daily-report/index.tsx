// @ts-nocheck
import React, { useRef, useState } from "react";
import { Image, Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { parentRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;
const ACTIVE_CHILD_KEY = "parentActiveChildId";

export default function ParentDailyReportPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState(
    router.params.studentId || Taro.getStorageSync(ACTIVE_CHILD_KEY) || "",
  );
  const [date, setDate] = useState(router.params.date || todayKey());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);

  async function load(nextDate = date) {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    if (report?.date !== nextDate) setReport(null);
    try {
      let targetStudentId = studentId;
      if (!targetStudentId) {
        const children = await parentRequest("/parent/children");
        targetStudentId = children[0]?.id || "";
        setStudentId(targetStudentId);
      }
      if (!targetStudentId) throw new Error("尚未绑定孩子");
      const next = await parentRequest(
        `/parent/students/${targetStudentId}/daily-report?date=${encodeURIComponent(nextDate)}`,
      );
      if (current === sequence.current) setReport(next);
    } catch (loadError) {
      if (current === sequence.current)
        setError(errorMessage(loadError, "托管报告加载失败"));
    } finally {
      if (current === sequence.current) setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => load());
  usePullDownRefresh(() => load());

  function changeDate(value) {
    setDate(value);
    load(value);
  }

  function moveDay(offset) {
    const target = new Date(`${date}T00:00:00+08:00`);
    target.setDate(target.getDate() + offset);
    const key = chinaDateKey(target);
    if (key > todayKey()) {
      Taro.showToast({ title: "不能查看未来报告", icon: "none" });
      return;
    }
    changeDate(key);
  }

  return h(
    View,
    { className: "parent-report-page" },
    h(
      View,
      { className: "parent-report-datebar" },
      h(
        Text,
        { className: "parent-report-day", onClick: () => moveDay(-1) },
        "‹ 上一天",
      ),
      h(
        Picker,
        {
          mode: "date",
          value: date,
          end: todayKey(),
          onChange: (event) => changeDate(event.detail.value),
        },
        h(
          View,
          { className: "parent-report-picker" },
          h(Text, null, `${date} ▾`),
        ),
      ),
      h(
        Text,
        {
          className: `parent-report-day${date === todayKey() ? " parent-report-day--disabled" : ""}`,
          onClick: () => date !== todayKey() && moveDay(1),
        },
        "下一天 ›",
      ),
    ),
    error
      ? h(
          View,
          { className: "parent-report-error" },
          h(Text, null, error),
          h(
            Text,
            { className: "parent-report-error__retry", onClick: () => load() },
            "重试",
          ),
        )
      : null,
    loading && !report
      ? h(
          View,
          { className: "parent-report-empty" },
          h(Text, null, "正在整理托管报告…"),
        )
      : report
        ? renderReport(report)
        : null,
  );
}

function renderReport(report) {
  if (report.isAbsent) {
    return h(
      React.Fragment,
      null,
      reportHeader(report),
      h(
        View,
        { className: "parent-report-section parent-report-absence" },
        h(
          Text,
          { className: "parent-report-section__title" },
          "今日无门店托管记录",
        ),
        h(
          Text,
          { className: "parent-report-absence__copy" },
          report.absence?.remark || "已登记请假 / 缺勤",
        ),
        report.absence?.teacher?.name
          ? h(
              Text,
              { className: "parent-report-muted" },
              `登记：${report.absence.teacher.name}`,
            )
          : null,
      ),
      teacherNoteSection(report.teacherNote),
    );
  }
  return h(
    React.Fragment,
    null,
    reportHeader(report),
    report.attention?.items?.length
      ? section(
          "需要关注",
          report.attention.items.map((item) =>
            row(
              item.label,
              `${levelText(item.level)}${item.happenedAt ? ` · ${timeText(item.happenedAt)}` : ""}`,
              "danger",
            ),
          ),
          `${report.attention.count} 条`,
        )
      : section("需要关注", [
          row("暂无已记录异常", "普通待处理和暂无记录不会被视为异常", "ok"),
        ]),
    section(
      "安全接送",
      report.pickup?.events?.length
        ? report.pickup.events.map((item) =>
            row(
              pickupTypeText(item.type),
              `${timeText(item.happenedAt)} · 经办：${item.teacher?.name || "未记录"}${item.pickupPersonName ? ` · ${relationshipText(item.relationship)} ${item.pickupPersonName}` : ""}`,
              item.isException || item.status !== "normal" ? "danger" : "",
            ),
          )
        : [emptyRow("暂无接送记录")],
    ),
    section(
      "今日托管流程",
      report.workflow?.steps?.length
        ? report.workflow.steps.map(workflowRow)
        : [emptyRow("暂无流程记录")],
      report.workflow?.summary
        ? `${report.workflow.summary.processed}/${report.workflow.summary.total} 已处理`
        : "",
    ),
    section("今日生活", careRows(report.care)),
    section(
      "今日作业",
      report.homework?.items?.length
        ? report.homework.items.map((item) =>
            row(
              item.title,
              `${homeworkStatusText(item.status)}${item.remark ? ` · ${item.remark}` : ""}`,
            ),
          )
        : [emptyRow("暂无作业记录")],
    ),
    section(
      "成长与反馈",
      report.growth?.items?.length
        ? report.growth.items.map((item) => row(item.title, item.content))
        : [emptyRow("暂无成长反馈")],
    ),
    teacherNoteSection(report.teacherNote),
  );
}

function reportHeader(report) {
  return h(
    View,
    {
      className: `parent-report-overview parent-report-overview--${report.status}`,
    },
    h(
      Text,
      { className: "parent-report-overview__eyebrow" },
      `${report.class.name} · ${report.date}`,
    ),
    h(
      Text,
      { className: "parent-report-overview__name" },
      `${report.student.name}的托管报告`,
    ),
    h(
      Text,
      { className: "parent-report-overview__status" },
      report.statusLabel,
    ),
    h(
      Text,
      { className: "parent-report-overview__meta" },
      report.attention?.count
        ? `⚠ ${report.attention.count} 条需要关注`
        : "暂无已记录异常",
    ),
  );
}

function section(title, rows, badge = "") {
  return h(
    View,
    { className: "parent-report-section" },
    h(
      View,
      { className: "parent-report-section__heading" },
      h(Text, { className: "parent-report-section__title" }, title),
      badge
        ? h(Text, { className: "parent-report-section__badge" }, badge)
        : null,
    ),
    ...rows,
  );
}

function teacherNoteSection(note) {
  return section(
    "老师寄语",
    note
      ? [row(note.teacher?.name || "班级老师", note.comment || "")]
      : [emptyRow("老师暂未发布今日寄语；接送和照护事实仍会实时显示。")],
    note?.publishedAt ? "已发布" : "",
  );
}

function workflowRow(item) {
  return h(
    View,
    {
      className: `parent-report-row parent-report-row--${item.status}`,
      key: `workflow:${item.stepKey}`,
    },
    h(
      View,
      { className: "parent-report-row__main" },
      h(Text, { className: "parent-report-row__title" }, item.name),
      h(
        Text,
        { className: "parent-report-row__copy" },
        `${workflowStatusText(item.status)}${item.remark ? ` · ${item.remark}` : ""}${item.teacher?.name ? ` · ${item.teacher.name}` : ""}`,
      ),
      item.photoUrls?.length
        ? h(
            View,
            { className: "parent-report-photos" },
            ...item.photoUrls.map((url) => photo(url, item.photoUrls)),
          )
        : null,
    ),
    h(
      Text,
      { className: "parent-report-row__time" },
      item.completedAt ? timeText(item.completedAt) : item.timeRange,
    ),
  );
}

function careRows(care) {
  const rows = [
    row(
      "点心",
      care?.meal?.snack ? careValueText(care.meal.snack.value) : "暂无记录",
    ),
    row(
      "晚餐",
      care?.meal?.dinner ? careValueText(care.meal.dinner.value) : "暂无记录",
    ),
    row("饮水", care?.water?.hasRecord ? `${care.water.count} 次` : "暂无记录"),
    row("休息", care?.rest ? restText(care.rest) : "暂无记录"),
    row("情绪", care?.mood ? careValueText(care.mood.value) : "暂无记录"),
  ];
  (care?.exceptions || []).forEach((item) =>
    rows.push(
      h(
        View,
        {
          className: "parent-report-row parent-report-row--danger",
          key: `care:exception:${item.happenedAt}`,
        },
        h(
          View,
          { className: "parent-report-row__main" },
          h(
            Text,
            { className: "parent-report-row__title" },
            `异常记录 · ${item.category || "其他"}`,
          ),
          h(
            Text,
            { className: "parent-report-row__copy" },
            `${item.remark || "已记录"}${item.resolution ? ` · 处理：${item.resolution}` : ""}${item.teacher?.name ? ` · ${item.teacher.name}` : ""}`,
          ),
          item.photoUrls?.length
            ? h(
                View,
                { className: "parent-report-photos" },
                ...item.photoUrls.map((url) => photo(url, item.photoUrls)),
              )
            : null,
        ),
        h(
          Text,
          { className: "parent-report-row__time" },
          timeText(item.happenedAt),
        ),
      ),
    ),
  );
  return rows;
}

function row(title, copy, tone = "") {
  return h(
    View,
    {
      className: `parent-report-row${tone ? ` parent-report-row--${tone}` : ""}`,
      key: `${title}:${copy}`,
    },
    h(
      View,
      { className: "parent-report-row__main" },
      h(Text, { className: "parent-report-row__title" }, title),
      h(Text, { className: "parent-report-row__copy" }, copy),
    ),
  );
}
function emptyRow(copy) {
  return row("暂无记录", copy, "empty");
}
function photo(url, urls) {
  const resolved = resolveApiAssetUrl(url);
  return h(Image, {
    className: "parent-report-photo",
    key: url,
    src: resolved,
    mode: "aspectFill",
    lazyLoad: true,
    onError: () => Taro.showToast({ title: "图片加载失败", icon: "none" }),
    onClick: () =>
      Taro.previewImage({
        current: resolved,
        urls: urls.map(resolveApiAssetUrl),
      }),
  });
}
function todayKey() {
  return chinaDateKey(new Date());
}
function chinaDateKey(value) {
  return new Date(value.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
function timeText(value) {
  if (!value) return "";
  const date = new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}
function pickupTypeText(type) {
  return (
    {
      picked_up_from_school: "学校接到",
      arrived_at_center: "安全到店",
      left_center: "离店交接",
    }[type] || type
  );
}
function relationshipText(value) {
  return (
    {
      father: "爸爸",
      mother: "妈妈",
      grandfather: "爷爷",
      grandmother: "奶奶",
      maternal_grandfather: "外公",
      maternal_grandmother: "外婆",
      sibling: "兄弟姐妹",
      relative: "亲属",
      other: "其他",
    }[value] ||
    value ||
    ""
  );
}
function workflowStatusText(status) {
  return (
    {
      completed: "已完成",
      skipped: "已跳过",
      exception: "异常",
      pending: "待处理 / 未记录完成",
    }[status] || status
  );
}
function homeworkStatusText(status) {
  return (
    {
      pending: "待完成",
      submitted: "已提交",
      reviewed: "已批阅",
      overdue: "逾期",
    }[status] || status
  );
}
function careValueText(value) {
  return (
    {
      good: "良好",
      normal: "正常 / 平稳",
      little: "吃得较少",
      refused: "未进食",
      slept: "已睡眠",
      rested: "已休息",
      no_rest: "未休息",
      low: "低落",
      upset: "明显不开心",
    }[value] ||
    value ||
    "已记录"
  );
}
function restText(record) {
  const base = careValueText(record.value);
  return record.durationMinutes
    ? `${base} ${record.durationMinutes} 分钟`
    : base;
}
function levelText(level) {
  return (
    { high: "优先关注", medium: "请留意", low: "普通提醒" }[level] || "请留意"
  );
}
function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}
