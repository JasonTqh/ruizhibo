// @ts-nocheck
import React, { useState } from "react";
import {
  Button,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todayValue() {
  const date = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDueAt(dateValue, timeValue) {
  if (!dateValue) return undefined;
  const dateParts = dateValue.split("-").map(Number);
  const timeParts = (timeValue || "20:00").split(":").map(Number);
  return new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0],
    timeParts[1],
  ).toISOString();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function statusText(status) {
  if (status === "confirmed") return "已确认";
  if (status === "viewed") return "已查看";
  return "未查看";
}

function receiptTimeText(receipt) {
  if (receipt.confirmedAt) {
    return `确认于 ${formatDateTime(receipt.confirmedAt)}`;
  }
  if (receipt.viewedAt) {
    return `查看于 ${formatDateTime(receipt.viewedAt)}`;
  }
  return "等待家长查看";
}

export default function NoticesPage() {
  const [classes, setClasses] = useState([]);
  const [notices, setNotices] = useState([]);
  const [classId, setClassId] = useState("");
  const [kind, setKind] = useState("notice");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("20:00");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [expandedNoticeId, setExpandedNoticeId] = useState("");
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setExpandedNoticeId("");
    setReceiptDetail(null);
    setReceiptError("");
    try {
      const [nextClasses, nextNotices] = await Promise.all([
        teacherRequest("/teacher/classes"),
        teacherRequest("/teacher/notices"),
      ]);
      setClasses(nextClasses);
      setNotices(nextNotices);
      setClassId((current) => {
        if (nextClasses.some((item) => item.id === current)) return current;
        return nextClasses[0] ? nextClasses[0].id : "";
      });
    } catch (loadError) {
      const message = errorMessage(loadError);
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (publishing) return;
    const nextTitle = title.trim();
    const nextContent = content.trim();

    if (!classId) {
      Taro.showToast({ title: "请先选择班级", icon: "none" });
      return;
    }
    if (!nextTitle) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return;
    }
    if (!nextContent) {
      Taro.showToast({ title: "请输入内容", icon: "none" });
      return;
    }

    const data = {
      classId,
      kind,
      title: nextTitle,
      content: nextContent,
    };
    if (kind === "task" && dueDate) {
      data.dueAt = toDueAt(dueDate, dueTime);
    }

    setPublishing(true);
    setError("");
    try {
      await teacherRequest("/teacher/notices", {
        method: "POST",
        data,
      });
      setTitle("");
      setContent("");
      setDueDate("");
      setDueTime("20:00");
      setExpandedNoticeId("");
      setReceiptDetail(null);
      Taro.showToast({ title: "发布成功", icon: "success" });
      await load();
    } catch (publishError) {
      const message = errorMessage(publishError);
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      setPublishing(false);
    }
  }

  async function loadReceipts(noticeId) {
    if (receiptLoading) return;
    setReceiptDetail(null);
    setReceiptError("");
    setReceiptLoading(true);
    try {
      const detail = await teacherRequest(
        `/teacher/notices/${noticeId}/receipts`,
      );
      setReceiptDetail(detail);
    } catch (loadError) {
      const message = errorMessage(loadError);
      setReceiptError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      setReceiptLoading(false);
    }
  }

  async function toggleReceipts(noticeId) {
    if (expandedNoticeId === noticeId) {
      setExpandedNoticeId("");
      setReceiptDetail(null);
      setReceiptError("");
      return;
    }

    setExpandedNoticeId(noticeId);
    await loadReceipts(noticeId);
  }

  useDidShow(() => {
    load();
  });

  const classNames = classes.map((item) => item.name);
  const selectedClassIndex = Math.max(
    0,
    classes.findIndex((item) => item.id === classId),
  );

  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card notices-card" },
      h(Text, { className: "title" }, "发布通知或任务"),
      h(
        Text,
        { className: "muted" },
        "发布后会按当前家长绑定生成回执，方便跟进查看与确认情况。",
      ),
      h(
        View,
        { className: "form-field" },
        h(
          Text,
          { className: "field-label" },
          "类型",
          h(Text, { className: "required-mark" }, " *"),
        ),
        h(
          View,
          { className: "notice-kind-switch" },
          h(
            Button,
            {
              size: "mini",
              className: `kind-button ${kind === "notice" ? "kind-button-active" : ""}`,
              onClick: () => setKind("notice"),
            },
            "通知",
          ),
          h(
            Button,
            {
              size: "mini",
              className: `kind-button ${kind === "task" ? "kind-button-active" : ""}`,
              onClick: () => setKind("task"),
            },
            "任务",
          ),
        ),
      ),
      h(
        View,
        { className: "form-field" },
        h(
          Text,
          { className: "field-label" },
          "接收班级",
          h(Text, { className: "required-mark" }, " *"),
        ),
        classes.length
          ? h(
              Picker,
              {
                mode: "selector",
                range: classNames,
                value: selectedClassIndex,
                onChange: (event) => {
                  const selected = classes[Number(event.detail.value)];
                  setClassId(selected ? selected.id : "");
                },
              },
              h(
                View,
                { className: "picker-field" },
                classes[selectedClassIndex].name,
              ),
            )
          : h(
              Text,
              { className: "warning-text" },
              loading
                ? "正在加载班级…"
                : "暂无可发布的班级，请先联系管理员分配班级。",
            ),
      ),
      h(
        View,
        { className: "form-field" },
        h(
          Text,
          { className: "field-label" },
          "标题",
          h(Text, { className: "required-mark" }, " *"),
        ),
        h(Input, {
          className: "form-input",
          value: title,
          maxlength: 60,
          placeholder:
            kind === "task" ? "例如：亲子阅读确认" : "例如：秋游活动安排",
          onInput: (event) => setTitle(event.detail.value),
        }),
      ),
      h(
        View,
        { className: "form-field" },
        h(
          Text,
          { className: "field-label" },
          "内容",
          h(Text, { className: "required-mark" }, " *"),
        ),
        h(Textarea, {
          className: "form-textarea",
          value: content,
          maxlength: 1000,
          autoHeight: false,
          placeholder: "请填写家长需要了解或完成的具体内容",
          onInput: (event) => setContent(event.detail.value),
        }),
      ),
      kind === "task"
        ? h(
            View,
            { className: "form-field" },
            h(Text, { className: "field-label" }, "截止时间（可选）"),
            h(
              View,
              { className: "deadline-row" },
              h(
                Picker,
                {
                  mode: "date",
                  value: dueDate || todayValue(),
                  start: todayValue(),
                  onChange: (event) => setDueDate(event.detail.value),
                },
                h(
                  View,
                  {
                    className: `picker-field ${dueDate ? "" : "picker-field-placeholder"}`,
                  },
                  dueDate || "选择日期",
                ),
              ),
              h(
                Picker,
                {
                  mode: "time",
                  value: dueTime,
                  onChange: (event) => setDueTime(event.detail.value),
                },
                h(View, { className: "picker-field" }, dueTime),
              ),
            ),
          )
        : null,
      error ? h(Text, { className: "error-text" }, error) : null,
      h(
        View,
        { className: "form-actions" },
        kind === "task" && dueDate
          ? h(
              Button,
              {
                className: "secondary-button",
                disabled: publishing,
                onClick: () => setDueDate(""),
              },
              "清除截止时间",
            )
          : null,
        h(
          Button,
          {
            type: "primary",
            loading: publishing,
            disabled: loading || publishing || !classes.length,
            onClick: publish,
          },
          publishing ? "发布中" : `发布${kind === "task" ? "任务" : "通知"}`,
        ),
      ),
    ),
    h(
      View,
      { className: "card notices-card" },
      h(
        View,
        { className: "row" },
        h(Text, { className: "title" }, "已发布"),
        h(
          Button,
          { size: "mini", loading, disabled: loading, onClick: load },
          loading ? "加载中" : "刷新",
        ),
      ),
      loading && notices.length === 0
        ? h(Text, { className: "empty-state" }, "正在加载通知与任务…")
        : null,
      !loading && !error && notices.length === 0
        ? h(Text, { className: "empty-state" }, "还没有发布通知或任务")
        : null,
      notices.map((notice) => {
        const summary = notice.receiptSummary || {};
        const isExpanded = expandedNoticeId === notice.id;
        const hasMatchingDetail =
          isExpanded &&
          receiptDetail &&
          receiptDetail.notice &&
          receiptDetail.notice.id === notice.id;
        const receipts =
          hasMatchingDetail && receiptDetail.receipts
            ? receiptDetail.receipts
            : [];
        const detailSummary =
          hasMatchingDetail && receiptDetail.summary
            ? receiptDetail.summary
            : summary;

        return h(
          View,
          { className: "section", key: notice.id },
          h(
            View,
            { className: "notice-heading" },
            h(
              View,
              { className: "notice-heading-main" },
              h(Text, { className: "subtitle" }, notice.title),
              h(
                Text,
                { className: "notice-meta" },
                `${notice.class ? notice.class.name : "未命名班级"} · ${formatDateTime(notice.createdAt)}`,
              ),
            ),
            h(
              Text,
              { className: `notice-kind-badge notice-kind-${notice.kind}` },
              notice.kind === "task" ? "任务" : "通知",
            ),
          ),
          h(Text, { className: "notice-content" }, notice.content),
          notice.dueAt
            ? h(
                Text,
                { className: "notice-meta" },
                `截止时间：${formatDateTime(notice.dueAt)}`,
              )
            : null,
          h(
            View,
            { className: "receipt-summary" },
            h(
              Text,
              { className: "receipt-summary-text" },
              `接收 ${detailSummary.totalCount || 0}`,
            ),
            h(
              Text,
              { className: "receipt-summary-text" },
              `已查看 ${detailSummary.viewedCount || 0}`,
            ),
            h(
              Text,
              { className: "receipt-summary-text" },
              `已确认 ${detailSummary.confirmedCount || 0}`,
            ),
            h(
              Text,
              { className: "receipt-summary-text" },
              `待确认 ${detailSummary.pendingCount || 0}`,
            ),
          ),
          notice.unboundStudentCount > 0
            ? h(
                Text,
                { className: "warning-text" },
                `${notice.unboundStudentCount} 名学生尚未绑定家长，未生成回执。`,
              )
            : null,
          h(
            View,
            { className: "notice-card-actions" },
            h(
              Button,
              {
                className: "secondary-button",
                size: "mini",
                loading: isExpanded && receiptLoading,
                disabled: receiptLoading,
                onClick: () => toggleReceipts(notice.id),
              },
              isExpanded ? "收起回执" : "查看回执",
            ),
          ),
          isExpanded
            ? h(
                View,
                { className: "receipt-panel" },
                receiptLoading
                  ? h(Text, { className: "empty-state" }, "正在加载回执…")
                  : null,
                receiptError
                  ? h(
                      View,
                      null,
                      h(Text, { className: "error-text" }, receiptError),
                      h(
                        Button,
                        {
                          className: "secondary-button",
                          size: "mini",
                          onClick: () => loadReceipts(notice.id),
                        },
                        "重新加载",
                      ),
                    )
                  : null,
                !receiptLoading && !receiptError && receiptDetail
                  ? h(
                      View,
                      null,
                      h(
                        Text,
                        { className: "muted" },
                        `共 ${detailSummary.totalCount || 0} 份 · 已确认 ${detailSummary.confirmedCount || 0} 份`,
                      ),
                      receipts.length === 0
                        ? h(Text, { className: "empty-state" }, "暂无家长回执")
                        : receipts.map((receipt) =>
                            h(
                              View,
                              { className: "receipt-row", key: receipt.id },
                              h(
                                View,
                                { className: "receipt-person" },
                                h(
                                  Text,
                                  { className: "receipt-person-name" },
                                  `${receipt.student ? receipt.student.name : "学生"} · ${receipt.parent ? receipt.parent.name : "家长"}`,
                                ),
                                h(
                                  Text,
                                  { className: "receipt-time" },
                                  receiptTimeText(receipt),
                                ),
                              ),
                              h(
                                Text,
                                {
                                  className: `receipt-status receipt-status-${receipt.status || "pending"}`,
                                },
                                statusText(receipt.status),
                              ),
                            ),
                          ),
                    )
                  : null,
              )
            : null,
        );
      }),
    ),
  );
}
