// @ts-nocheck
import React, { useRef, useState } from "react";
import { Image, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;
const statusFilters = [
  ["", "全部状态"],
  ["waiting_pickup", "待接"],
  ["picked_up", "已接到"],
  ["in_care", "托管中"],
  ["left", "已离店"],
  ["absence", "请假 / 缺勤"],
];

export default function DailyReportPage() {
  const [result, setResult] = useState({ date: todayKey(), items: [] });
  const [date, setDate] = useState(todayKey());
  const [classId, setClassId] = useState("");
  const [classOptions, setClassOptions] = useState([]);
  const [status, setStatus] = useState("");
  const [needsAttention, setNeedsAttention] = useState("");
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loadLock = useRef(false);
  const saveLock = useRef(false);

  async function load(overrides = {}) {
    if (loadLock.current) return;
    loadLock.current = true;
    setLoading(true);
    setError("");
    const next = {
      date,
      classId,
      status,
      needsAttention,
      ...overrides,
    };
    try {
      const query = [`date=${encodeURIComponent(next.date)}`];
      if (next.classId)
        query.push(`classId=${encodeURIComponent(next.classId)}`);
      if (next.status) query.push(`status=${encodeURIComponent(next.status)}`);
      if (next.needsAttention)
        query.push(`needsAttention=${next.needsAttention}`);
      const data = await teacherRequest(
        `/teacher/daily-reports?${query.join("&")}`,
      );
      setResult(data);
      if (!next.classId && !next.status && !next.needsAttention) {
        setClassOptions(uniqueClasses(data.items));
      }
    } catch (loadError) {
      setError(errorMessage(loadError, "托管报告加载失败"));
    } finally {
      loadLock.current = false;
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => load());
  usePullDownRefresh(() => (detail ? openDetail(detail.student.id) : load()));

  async function openDetail(studentId) {
    setLoading(true);
    setError("");
    try {
      const report = await teacherRequest(
        `/teacher/students/${studentId}/daily-report?date=${date}`,
      );
      setDetail(report);
      setNote(report.teacherNote?.comment || "");
    } catch (detailError) {
      const message = errorMessage(detailError, "报告详情加载失败");
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  async function saveNote(publish) {
    if (!detail || saveLock.current) return;
    if (publish && !note.trim()) {
      Taro.showToast({ title: "发布前请填写老师寄语", icon: "none" });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      await teacherRequest(
        `/teacher/students/${detail.student.id}/daily-report-note`,
        { method: "PUT", data: { date, comment: note, publish } },
      );
      Taro.showToast({
        title: publish ? "寄语已发布" : "草稿已保存",
        icon: "success",
      });
      await openDetail(detail.student.id);
    } catch (saveError) {
      Taro.showToast({
        title: errorMessage(saveError, "寄语保存失败"),
        icon: "none",
      });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const classes = classOptions.length
    ? classOptions
    : uniqueClasses(result.items);
  if (detail) {
    return h(
      View,
      { className: "daily-report-page" },
      h(
        View,
        { className: "report-detail-top" },
        h(
          Text,
          { className: "report-back", onClick: () => setDetail(null) },
          "‹ 返回列表",
        ),
        h(Text, { className: "report-detail-date" }, date),
        h(
          Text,
          {
            className: "report-refresh",
            onClick: () => openDetail(detail.student.id),
          },
          "刷新",
        ),
      ),
      error ? errorCard(error, () => openDetail(detail.student.id)) : null,
      fullReport(detail, true),
      h(
        View,
        { className: "report-note-editor" },
        h(
          View,
          { className: "report-section-heading" },
          h(Text, { className: "report-section-title" }, "老师寄语"),
          h(
            Text,
            {
              className: `report-note-state${detail.teacherNote?.isPublished ? " report-note-state--published" : ""}`,
            },
            detail.teacherNote?.isPublished ? "已发布" : "草稿 / 未发布",
          ),
        ),
        h(Textarea, {
          className: "report-note-input",
          maxlength: 500,
          value: note,
          placeholder: "写一句给家长的今日寄语（最多 500 字）",
          onInput: (event) => setNote(event.detail.value),
        }),
        h(Text, { className: "report-note-count" }, `${note.length}/500`),
        h(
          View,
          { className: "report-note-actions" },
          h(
            View,
            {
              className: `report-button report-button--secondary${saving ? " report-button--busy" : ""}`,
              onClick: () => !saving && saveNote(false),
            },
            h(
              Text,
              null,
              detail.teacherNote?.isPublished ? "取消发布并保存" : "保存草稿",
            ),
          ),
          h(
            View,
            {
              className: `report-button${saving ? " report-button--busy" : ""}`,
              onClick: () => !saving && saveNote(true),
            },
            h(
              Text,
              null,
              saving
                ? "保存中"
                : detail.teacherNote?.isPublished
                  ? "重新发布"
                  : "发布寄语",
            ),
          ),
        ),
        h(
          Text,
          { className: "report-note-hint" },
          "发布只影响寄语可见性，接送、流程、照护等事实始终实时更新。",
        ),
      ),
    );
  }

  return h(
    View,
    { className: "daily-report-page" },
    h(
      View,
      { className: "report-hero" },
      h(
        View,
        null,
        h(Text, { className: "report-hero__eyebrow" }, date),
        h(Text, { className: "report-hero__title" }, "学生托管报告"),
        h(
          Text,
          { className: "report-hero__hint" },
          "按学生查看今日事实，寄语单独保存与发布",
        ),
      ),
      h(
        Text,
        {
          className: "report-hero__refresh",
          onClick: () => !loading && load(),
        },
        loading ? "加载中" : "刷新",
      ),
    ),
    error ? errorCard(error, load) : null,
    h(
      View,
      { className: "report-filter-card" },
      h(
        Picker,
        {
          mode: "date",
          value: date,
          end: todayKey(),
          onChange: (event) => {
            const value = event.detail.value;
            setDate(value);
            load({ date: value });
          },
        },
        filterChip(`日期 ${date}`),
      ),
      classes.length > 1
        ? h(
            Picker,
            {
              mode: "selector",
              range: ["全部班级", ...classes.map((item) => item.name)],
              onChange: (event) => {
                const index = Number(event.detail.value);
                const value = index ? classes[index - 1].id : "";
                setClassId(value);
                load({ classId: value });
              },
            },
            filterChip(
              classId
                ? classes.find((item) => item.id === classId)?.name
                : "全部班级",
            ),
          )
        : null,
      h(
        Picker,
        {
          mode: "selector",
          range: statusFilters.map((item) => item[1]),
          onChange: (event) => {
            const value = statusFilters[Number(event.detail.value)][0];
            setStatus(value);
            load({ status: value });
          },
        },
        filterChip(
          statusFilters.find((item) => item[0] === status)?.[1] || "全部状态",
        ),
      ),
      h(
        View,
        {
          onClick: () => {
            const value = needsAttention === "true" ? "" : "true";
            setNeedsAttention(value);
            load({ needsAttention: value });
          },
        },
        filterChip(needsAttention === "true" ? "仅需关注 ✓" : "需要关注"),
      ),
    ),
    h(
      View,
      { className: "report-list-heading" },
      h(Text, { className: "report-list-title" }, "班级日报摘要"),
      h(
        Text,
        { className: "report-list-count" },
        `${result.items.length} 名学生`,
      ),
    ),
    result.items.length
      ? h(
          View,
          { className: "report-student-list" },
          ...result.items.map((item) =>
            summaryCard(item, () => openDetail(item.student.id)),
          ),
        )
      : h(
          View,
          { className: "report-empty" },
          h(
            Text,
            null,
            loading ? "正在加载报告…" : "当前筛选条件下暂无学生报告",
          ),
        ),
  );
}

function summaryCard(report, onClick) {
  const workflow = report.workflow?.summary;
  return h(
    View,
    {
      className: `report-student report-student--${report.status}${report.attention?.count ? " report-student--attention" : ""}`,
      onClick,
    },
    h(
      View,
      { className: "report-student__avatar" },
      h(Text, null, report.student.name.slice(0, 1)),
    ),
    h(
      View,
      { className: "report-student__main" },
      h(
        View,
        { className: "report-student__title-row" },
        h(Text, { className: "report-student__name" }, report.student.name),
        h(
          Text,
          { className: `report-status report-status--${report.status}` },
          report.statusLabel,
        ),
      ),
      h(Text, { className: "report-student__class" }, report.class.name),
      report.isAbsent
        ? h(
            Text,
            { className: "report-student__facts" },
            report.absence?.remark || "今日无门店托管记录",
          )
        : h(
            Text,
            { className: "report-student__facts" },
            workflow
              ? `流程 ${workflow.processed}/${workflow.total} 已处理`
              : "暂无流程记录",
            ` · 饮水 ${report.care?.summary?.water?.hasRecord ? `${report.care.summary.water.count} 次` : "暂无记录"}`,
          ),
      report.attention?.count
        ? h(
            Text,
            { className: "report-student__warning" },
            `⚠ ${report.attention.count} 条需要关注`,
          )
        : h(Text, { className: "report-student__ok" }, "无已记录异常"),
    ),
    h(
      View,
      { className: "report-student__side" },
      h(
        Text,
        {
          className: report.notePublished ? "report-published" : "report-draft",
        },
        report.notePublished ? "寄语已发布" : "寄语未发布",
      ),
      h(Text, { className: "report-student__link" }, "预览 ›"),
    ),
  );
}

function fullReport(report, teacherView) {
  if (report.isAbsent) {
    return h(
      React.Fragment,
      null,
      reportHeader(report),
      h(
        View,
        { className: "report-section report-absence" },
        h(Text, { className: "report-section-title" }, "今日无门店托管记录"),
        h(
          Text,
          { className: "report-absence__text" },
          report.absence?.remark || "已登记请假 / 缺勤",
        ),
        report.absence?.teacher?.name
          ? h(
              Text,
              { className: "report-muted" },
              `登记：${report.absence.teacher.name}`,
            )
          : null,
      ),
    );
  }
  return h(
    React.Fragment,
    null,
    reportHeader(report),
    report.attention?.items?.length
      ? reportSection(
          "需要关注",
          report.attention.items.map((item) =>
            factRow(
              item.label,
              `${levelText(item.level)}${item.happenedAt ? ` · ${timeText(item.happenedAt)}` : ""}`,
              "danger",
            ),
          ),
        )
      : reportSection("需要关注", [
          factRow(
            "暂无已记录异常",
            "普通待处理和暂无记录不会被标记为异常",
            "ok",
          ),
        ]),
    reportSection(
      "安全接送",
      report.pickup?.events?.length
        ? report.pickup.events.map((item) =>
            factRow(
              pickupTypeText(item.type),
              `${timeText(item.happenedAt)} · 经办：${item.teacher?.name || "未记录"}${item.pickupPersonName ? ` · ${item.pickupPersonName}` : ""}`,
              item.isException || item.status !== "normal" ? "danger" : "",
            ),
          )
        : [emptyRow("暂无接送记录")],
    ),
    reportSection(
      "今日托管流程",
      report.workflow?.steps?.length
        ? report.workflow.steps.map((item) => detailWorkflowRow(item))
        : [emptyRow("暂无流程记录")],
      report.workflow?.summary
        ? `${report.workflow.summary.processed}/${report.workflow.summary.total} 已处理`
        : "",
    ),
    reportSection("今日生活", careRows(report.care)),
    reportSection(
      "今日作业",
      report.homework?.items?.length
        ? report.homework.items.map((item) =>
            factRow(
              item.title,
              `${homeworkStatusText(item.status)}${item.remark ? ` · ${item.remark}` : ""}`,
            ),
          )
        : [emptyRow("暂无作业记录")],
    ),
    reportSection(
      "成长与反馈",
      report.growth?.items?.length
        ? report.growth.items.map((item) => factRow(item.title, item.content))
        : [emptyRow("暂无成长反馈")],
    ),
    teacherView && report.workflow?.summary?.pending && report.status === "left"
      ? h(
          View,
          { className: "report-inline-warning" },
          h(
            Text,
            null,
            `已离店但仍有 ${report.workflow.summary.pending} 个未处理步骤；报告不会自动改写状态。`,
          ),
        )
      : null,
  );
}

function reportHeader(report) {
  return h(
    View,
    { className: `report-overview report-overview--${report.status}` },
    h(
      Text,
      { className: "report-overview__eyebrow" },
      `${report.class.name} · ${report.date}`,
    ),
    h(
      Text,
      { className: "report-overview__name" },
      `${report.student.name}的托管报告`,
    ),
    h(Text, { className: "report-overview__status" }, report.statusLabel),
    h(
      Text,
      { className: "report-overview__meta" },
      report.attention?.count
        ? `⚠ ${report.attention.count} 条需要关注`
        : "暂无已记录异常",
    ),
  );
}

function reportSection(title, rows, badge = "") {
  return h(
    View,
    { className: "report-section" },
    h(
      View,
      { className: "report-section-heading" },
      h(Text, { className: "report-section-title" }, title),
      badge ? h(Text, { className: "report-section-badge" }, badge) : null,
    ),
    ...rows,
  );
}

function detailWorkflowRow(item) {
  return h(
    View,
    { className: "report-fact", key: `workflow:${item.stepKey}` },
    h(
      View,
      { className: "report-fact__main" },
      h(Text, { className: "report-fact__title" }, item.name),
      h(
        Text,
        { className: "report-fact__copy" },
        `${workflowStatusText(item.status)}${item.remark ? ` · ${item.remark}` : ""}${item.teacher?.name ? ` · ${item.teacher.name}` : ""}`,
      ),
      item.photoUrls?.length
        ? h(
            View,
            { className: "report-photo-list" },
            ...item.photoUrls.map((url) => reportPhoto(url, item.photoUrls)),
          )
        : null,
    ),
    h(
      Text,
      { className: "report-fact__time" },
      item.completedAt ? timeText(item.completedAt) : item.timeRange,
    ),
  );
}

function careRows(care) {
  const rows = [
    factRow(
      "点心",
      care?.meal?.snack ? careValueText(care.meal.snack.value) : "暂无记录",
    ),
    factRow(
      "晚餐",
      care?.meal?.dinner ? careValueText(care.meal.dinner.value) : "暂无记录",
    ),
    factRow(
      "饮水",
      care?.water?.hasRecord ? `${care.water.count} 次` : "暂无记录",
    ),
    factRow("休息", care?.rest ? restText(care.rest) : "暂无记录"),
    factRow("情绪", care?.mood ? careValueText(care.mood.value) : "暂无记录"),
  ];
  (care?.exceptions || []).forEach((item) => {
    rows.push(
      h(
        View,
        {
          className: "report-fact report-fact--danger",
          key: `care:exception:${item.happenedAt}`,
        },
        h(
          View,
          { className: "report-fact__main" },
          h(
            Text,
            { className: "report-fact__title" },
            `异常记录 · ${item.category || "其他"}`,
          ),
          h(
            Text,
            { className: "report-fact__copy" },
            `${item.remark || "已记录"}${item.resolution ? ` · 处理：${item.resolution}` : ""}${item.teacher?.name ? ` · ${item.teacher.name}` : ""}`,
          ),
          item.photoUrls?.length
            ? h(
                View,
                { className: "report-photo-list" },
                ...item.photoUrls.map((url) =>
                  reportPhoto(url, item.photoUrls),
                ),
              )
            : null,
        ),
        h(Text, { className: "report-fact__time" }, timeText(item.happenedAt)),
      ),
    );
  });
  return rows;
}

function factRow(title, copy, tone = "") {
  return h(
    View,
    {
      className: `report-fact${tone ? ` report-fact--${tone}` : ""}`,
      key: `${title}:${copy}`,
    },
    h(
      View,
      { className: "report-fact__main" },
      h(Text, { className: "report-fact__title" }, title),
      h(Text, { className: "report-fact__copy" }, copy),
    ),
  );
}
function emptyRow(copy) {
  return factRow("暂无记录", copy, "empty");
}
function filterChip(text) {
  return h(
    View,
    { className: "report-filter-chip" },
    h(Text, null, `${text} ▾`),
  );
}
function errorCard(message, retry) {
  return h(
    View,
    { className: "report-error" },
    h(Text, null, message),
    h(Text, { className: "report-error__retry", onClick: retry }, "重试"),
  );
}
function reportPhoto(url, urls) {
  const resolved = resolveApiAssetUrl(url);
  return h(Image, {
    className: "report-photo",
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
function uniqueClasses(items) {
  const map = new Map();
  items.forEach((item) => map.set(item.class.id, item.class));
  return Array.from(map.values());
}
function todayKey() {
  const value = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
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
