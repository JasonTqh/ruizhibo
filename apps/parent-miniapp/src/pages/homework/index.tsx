// @ts-nocheck
import React, { useRef, useState } from "react";
import { Button, Image, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;
const ACTIVE_CHILD_KEY = "parentActiveChildId";
const statusFilters = [
  ["all", "全部"],
  ["pending", "待提交"],
  ["submitted", "待批改"],
  ["reviewed", "已批改"],
  ["overdue", "已逾期"],
];
const statusLabels = {
  pending: "待提交",
  submitted: "待批改",
  reviewed: "已批改",
  overdue: "已逾期",
};

export default function HomeworkPage() {
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState("");
  const [items, setItems] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [notes, setNotes] = useState({});
  const [localFiles, setLocalFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
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
        setItems([]);
        return;
      }
      Taro.setStorageSync(ACTIVE_CHILD_KEY, nextChild.id);
      const submissions = await parentRequest(
        `/parent/children/${nextChild.id}/homework`,
      );
      if (sequence !== requestSequence.current) return;
      applyItems(submissions);
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(errorMessage(loadError, "作业加载失败，请确认 API 已启动。"));
      }
    } finally {
      if (sequence === requestSequence.current && showLoading)
        setLoading(false);
    }
  }

  function applyItems(submissions) {
    const nextItems = submissions
      .map((item) => ({ ...item, displayStatus: effectiveStatus(item) }))
      .sort(compareHomework);
    setItems(nextItems);
    setNotes((current) => {
      const next = { ...current };
      nextItems.forEach((item) => {
        if (next[item.id] === undefined) next[item.id] = item.content || "";
      });
      return next;
    });
  }

  async function selectChild(childId) {
    if (childId === activeChildId || loading || submittingId) return;
    const sequence = ++requestSequence.current;
    setActiveChildId(childId);
    Taro.setStorageSync(ACTIVE_CHILD_KEY, childId);
    setLoading(true);
    setError("");
    setItems([]);
    try {
      const submissions = await parentRequest(
        `/parent/children/${childId}/homework`,
      );
      if (sequence !== requestSequence.current) return;
      applyItems(submissions);
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(errorMessage(loadError, "切换孩子失败，请重试。"));
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  async function chooseImages(submissionId) {
    if (submittingId) return;
    const selected = localFiles[submissionId] || [];
    const remaining = 6 - selected.length;
    if (remaining <= 0) {
      Taro.showToast({ title: "最多选择 6 张图片", icon: "none" });
      return;
    }
    try {
      const result = await Taro.chooseImage({
        count: remaining,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
      });
      setLocalFiles((current) => ({
        ...current,
        [submissionId]: [
          ...(current[submissionId] || []),
          ...result.tempFilePaths,
        ].slice(0, 6),
      }));
    } catch (chooseError) {
      if (!String(chooseError?.errMsg || chooseError).includes("cancel")) {
        Taro.showToast({ title: "图片选择失败，请重试", icon: "none" });
      }
    }
  }

  function removeImage(submissionId, path) {
    setLocalFiles((current) => ({
      ...current,
      [submissionId]: (current[submissionId] || []).filter(
        (item) => item !== path,
      ),
    }));
  }

  async function submitHomework(item) {
    if (submittingId) return;
    const content = (notes[item.id] || "").trim();
    const selectedFiles = localFiles[item.id] || [];
    if (!content && selectedFiles.length === 0 && item.fileUrls.length === 0) {
      Taro.showToast({ title: "请填写完成情况或选择图片", icon: "none" });
      return;
    }

    setSubmittingId(item.id);
    setError("");
    try {
      const uploadedUrls = [];
      for (const path of selectedFiles) {
        const asset = await uploadHomeworkImage(path);
        uploadedUrls.push(asset.url);
      }
      const fileUrls = Array.from(
        new Set([...(item.fileUrls || []), ...uploadedUrls]),
      ).slice(0, 6);
      await parentRequest(`/parent/homework-submissions/${item.id}/submit`, {
        method: "POST",
        data: { content, fileUrls },
      });
      setLocalFiles((current) => ({ ...current, [item.id]: [] }));
      await load(false);
      Taro.showToast({ title: "作业已提交", icon: "success" });
    } catch (submitError) {
      setError(errorMessage(submitError, "作业提交失败，内容和图片已保留。"));
    } finally {
      setSubmittingId("");
    }
  }

  useDidShow(() => {
    load();
  });

  const child = children.find((item) => item.id === activeChildId);
  const counts = homeworkCounts(items);
  const visibleItems = items.filter(
    (item) => activeFilter === "all" || item.displayStatus === activeFilter,
  );

  return h(
    View,
    { className: "parent-homework-page" },
    h(
      View,
      { className: "parent-homework-topbar" },
      h(
        View,
        null,
        h(Text, { className: "parent-homework-eyebrow" }, "作业中心"),
        h(
          Text,
          { className: "parent-homework-title" },
          child ? `${child.name}的学习任务` : "孩子的学习任务",
        ),
      ),
      h(
        Button,
        {
          className: "parent-homework-refresh",
          size: "mini",
          loading,
          disabled: loading || Boolean(submittingId),
          onClick: () => load(),
        },
        "刷新",
      ),
    ),
    children.length > 1
      ? h(
          View,
          { className: "parent-homework-children" },
          children.map((item) =>
            h(
              View,
              {
                className: `parent-homework-child${item.id === activeChildId ? " parent-homework-child--active" : ""}`,
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
          { className: "parent-homework-error" },
          h(Text, { className: "parent-homework-error__text" }, error),
          h(
            Text,
            {
              className: "parent-homework-error__retry",
              onClick: () => load(),
            },
            "重试",
          ),
        )
      : null,
    child
      ? h(
          View,
          { className: "homework-summary" },
          summaryMetric("待提交", counts.pending, "green"),
          summaryMetric("待批改", counts.submitted, "yellow"),
          summaryMetric("已批改", counts.reviewed, "blue"),
          summaryMetric("已逾期", counts.overdue, "coral"),
        )
      : null,
    child
      ? h(
          View,
          { className: "homework-filter-bar" },
          statusFilters.map(([value, label]) =>
            h(
              View,
              {
                className: `homework-filter${activeFilter === value ? " homework-filter--active" : ""}`,
                key: value,
                onClick: () => setActiveFilter(value),
              },
              h(Text, null, label),
              value !== "all"
                ? h(
                    Text,
                    { className: "homework-filter__count" },
                    counts[value],
                  )
                : null,
            ),
          ),
        )
      : null,
    loading
      ? h(Text, { className: "parent-homework-state" }, "正在加载作业…")
      : !child
        ? h(
            View,
            { className: "parent-homework-empty" },
            h(
              Text,
              { className: "parent-homework-empty__title" },
              "尚未绑定孩子",
            ),
            h(
              Text,
              { className: "parent-homework-empty__copy" },
              "请联系管理员完成孩子绑定。",
            ),
          )
        : visibleItems.length === 0
          ? h(
              View,
              { className: "parent-homework-empty" },
              h(Text, { className: "parent-homework-empty__icon" }, "✓"),
              h(
                Text,
                { className: "parent-homework-empty__title" },
                "该状态下暂无作业",
              ),
              h(
                Text,
                { className: "parent-homework-empty__copy" },
                "切换其他状态可以查看历史任务。",
              ),
            )
          : visibleItems.map((item) =>
              h(HomeworkCard, {
                key: item.id,
                item,
                note: notes[item.id] || "",
                onNoteChange: (value) =>
                  setNotes((current) => ({ ...current, [item.id]: value })),
                localFiles: localFiles[item.id] || [],
                onChooseImages: () => chooseImages(item.id),
                onRemoveImage: (path) => removeImage(item.id, path),
                submittingId,
                onSubmit: () => submitHomework(item),
              }),
            ),
  );
}

function HomeworkCard({
  item,
  note,
  onNoteChange,
  localFiles,
  onChooseImages,
  onRemoveImage,
  submittingId,
  onSubmit,
}) {
  const assignment = item.homework;
  const status = item.displayStatus;
  const editable = status !== "reviewed";
  const remoteImages = item.fileUrls || [];
  const deadline = deadlineInfo(item);

  return h(
    View,
    { className: `parent-homework-card parent-homework-card--${status}` },
    h(
      View,
      { className: "parent-homework-card__heading" },
      h(
        View,
        { className: "parent-homework-card__main" },
        h(
          Text,
          { className: "parent-homework-card__subject" },
          assignment.subject || "综合任务",
        ),
        h(Text, { className: "parent-homework-card__title" }, assignment.title),
      ),
      h(
        Text,
        {
          className: `parent-homework-status parent-homework-status--${status}`,
        },
        statusLabels[status],
      ),
    ),
    h(
      View,
      { className: `homework-deadline homework-deadline--${deadline.tone}` },
      h(Text, { className: "homework-deadline__label" }, deadline.label),
      h(
        Text,
        { className: "homework-deadline__teacher" },
        assignment.teacher?.name || "班级老师",
      ),
    ),
    h(Text, { className: "parent-homework-content" }, assignment.content),
    editable
      ? h(
          View,
          { className: "parent-homework-submit" },
          status === "submitted"
            ? h(
                Text,
                { className: "homework-submitted-tip" },
                "已提交，老师批改前仍可更新完成情况。",
              )
            : null,
          h(Text, { className: "parent-homework-field-label" }, "完成情况"),
          h(Textarea, {
            className: "parent-homework-textarea",
            value: note,
            maxlength: 1000,
            placeholder: "填写孩子的完成情况（也可以只提交图片）",
            onInput: (event) => onNoteChange(event.detail.value),
          }),
          remoteImages.length || localFiles.length
            ? h(
                View,
                { className: "parent-homework-images" },
                remoteImages.map((url) => {
                  const imageUrl = resolveApiAssetUrl(url);
                  return h(Image, {
                    className: "parent-homework-image",
                    key: url,
                    src: imageUrl,
                    mode: "aspectFill",
                    onClick: () => previewRemoteImages(remoteImages, url),
                  });
                }),
                localFiles.map((path) =>
                  h(
                    View,
                    { className: "parent-homework-local-image", key: path },
                    h(Image, {
                      className: "parent-homework-image",
                      src: path,
                      mode: "aspectFill",
                      onClick: () =>
                        Taro.previewImage({ current: path, urls: localFiles }),
                    }),
                    h(
                      View,
                      {
                        className: "parent-homework-remove",
                        onClick: () => onRemoveImage(path),
                      },
                      "×",
                    ),
                  ),
                ),
              )
            : null,
          h(
            View,
            { className: "parent-homework-actions" },
            h(
              Button,
              {
                className: "parent-homework-image-button",
                size: "mini",
                disabled: Boolean(submittingId),
                onClick: onChooseImages,
              },
              "拍照 / 选图",
            ),
            h(
              Button,
              {
                className: "parent-homework-submit-button",
                size: "mini",
                loading: submittingId === item.id,
                disabled: Boolean(submittingId),
                onClick: onSubmit,
              },
              status === "submitted" ? "更新提交" : "提交作业",
            ),
          ),
        )
      : h(
          View,
          { className: "parent-review-result" },
          h(
            View,
            { className: "parent-review-heading" },
            h(Text, { className: "parent-review-heading__icon" }, "✓"),
            h(
              Text,
              { className: "parent-review-heading__title" },
              "老师已完成批改",
            ),
          ),
          item.content
            ? h(
                Text,
                { className: "parent-review-submission" },
                `提交内容：${item.content}`,
              )
            : null,
          remoteImages.length
            ? h(
                View,
                { className: "parent-homework-images" },
                remoteImages.map((url) =>
                  h(Image, {
                    className: "parent-homework-image",
                    key: url,
                    src: resolveApiAssetUrl(url),
                    mode: "aspectFill",
                    onClick: () => previewRemoteImages(remoteImages, url),
                  }),
                ),
              )
            : null,
          h(Text, { className: "parent-review-label" }, "老师批语"),
          h(
            Text,
            { className: "parent-review-remark" },
            item.remark || "已批改，无补充批语。",
          ),
          h(
            Text,
            { className: "parent-review-time" },
            `批改于 ${formatDate(item.reviewedAt)}`,
          ),
        ),
  );
}

function summaryMetric(label, value, tone) {
  return h(
    View,
    { className: `homework-summary__item homework-summary__item--${tone}` },
    h(Text, { className: "homework-summary__value" }, value),
    h(Text, { className: "homework-summary__label" }, label),
  );
}

function homeworkCounts(items) {
  return items.reduce(
    (counts, item) => {
      counts[item.displayStatus] += 1;
      return counts;
    },
    { pending: 0, submitted: 0, reviewed: 0, overdue: 0 },
  );
}

function effectiveStatus(item) {
  if (item.status !== "pending") return item.status;
  const dueAt = item.homework?.dueAt;
  return dueAt && new Date(dueAt).getTime() < Date.now()
    ? "overdue"
    : "pending";
}

function compareHomework(left, right) {
  const priority = { overdue: 0, pending: 1, submitted: 2, reviewed: 3 };
  const statusOrder =
    priority[left.displayStatus] - priority[right.displayStatus];
  if (statusOrder !== 0) return statusOrder;
  const leftDue = left.homework?.dueAt
    ? new Date(left.homework.dueAt).getTime()
    : Number.MAX_SAFE_INTEGER;
  const rightDue = right.homework?.dueAt
    ? new Date(right.homework.dueAt).getTime()
    : Number.MAX_SAFE_INTEGER;
  return leftDue - rightDue;
}

function deadlineInfo(item) {
  if (item.displayStatus === "reviewed") {
    return { label: `批改于 ${formatDate(item.reviewedAt)}`, tone: "done" };
  }
  if (item.displayStatus === "submitted") {
    return {
      label: `提交于 ${formatDate(item.submittedAt)} · 等待批改`,
      tone: "waiting",
    };
  }
  if (!item.homework?.dueAt) {
    return { label: "老师未设置截止时间", tone: "normal" };
  }
  const due = new Date(item.homework.dueAt);
  const remaining = due.getTime() - Date.now();
  if (remaining < 0) {
    const days = Math.max(
      1,
      Math.ceil(Math.abs(remaining) / (24 * 60 * 60 * 1000)),
    );
    return { label: `已逾期 ${days} 天 · 请尽快提交`, tone: "danger" };
  }
  if (remaining <= 24 * 60 * 60 * 1000) {
    const hours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
    return {
      label: `${hours} 小时后截止 · ${formatShortDate(due)}`,
      tone: "urgent",
    };
  }
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return {
    label:
      days <= 3
        ? `${days} 天后截止 · ${formatShortDate(due)}`
        : `截止 ${formatShortDate(due)}`,
    tone: days <= 3 ? "urgent" : "normal",
  };
}

function childDisplayName(children, child) {
  const matches = children.filter((item) => item.name === child.name);
  if (matches.length <= 1) return child.name;
  return `${child.name}（${matches.findIndex((item) => item.id === child.id) + 1}）`;
}

function previewRemoteImages(urls, current) {
  Taro.previewImage({
    current: resolveApiAssetUrl(current),
    urls: urls.map(resolveApiAssetUrl),
  });
}

async function uploadHomeworkImage(path) {
  const base64 = await readFileAsBase64(path);
  return parentRequest("/files", {
    method: "POST",
    data: {
      fileName: fileNameFromPath(path),
      mimeType: mimeTypeFromPath(path),
      base64,
      scene: "homework",
    },
  });
}

function readFileAsBase64(path) {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success: (result) => resolve(result.data),
      fail: reject,
    });
  });
}

function fileNameFromPath(path) {
  return path.split(/[\\/]/).pop() || `homework-${Date.now()}.jpg`;
}

function mimeTypeFromPath(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

function formatShortDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
