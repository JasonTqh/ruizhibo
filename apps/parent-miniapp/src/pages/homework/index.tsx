// @ts-nocheck
import React, { useState } from "react";
import { Button, Image, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const API_ORIGIN = "http://localhost:3000";
const statusLabels = {
  pending: "待提交",
  submitted: "已提交 · 待批改",
  reviewed: "已批改",
  overdue: "已逾期",
};

export default function HomeworkPage() {
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [localFiles, setLocalFiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const children = await parentRequest("/parent/children");
      const groups = await Promise.all(
        children.map(async (student) => {
          const submissions = await parentRequest(
            `/parent/children/${student.id}/homework`,
          );
          return submissions.map((submission) => ({ ...submission, student }));
        }),
      );
      const nextItems = groups
        .flat()
        .sort(
          (left, right) =>
            new Date(right.homework.createdAt).getTime() -
            new Date(left.homework.createdAt).getTime(),
        );
      setItems(nextItems);
      setNotes((current) => {
        const next = { ...current };
        nextItems.forEach((item) => {
          if (next[item.id] === undefined) next[item.id] = item.content || "";
        });
        return next;
      });
    } catch (loadError) {
      setError(errorMessage(loadError, "作业加载失败，请确认 API 已启动。"));
    } finally {
      if (showLoading) setLoading(false);
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
      // 用户取消选择时无需提示。
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
      setError(errorMessage(submitError, "作业提交失败，请重试。"));
    } finally {
      setSubmittingId("");
    }
  }

  useDidShow(() => {
    load();
  });

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
        h(Text, { className: "title page-heading__title" }, "作业中心"),
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
        ? h(Text, { className: "feedback-state" }, "正在加载作业…")
        : items.length === 0
          ? h(Text, { className: "feedback-state" }, "暂无作业")
          : items.map((item) =>
              renderHomework(
                item,
                notes,
                setNotes,
                localFiles,
                chooseImages,
                removeImage,
                submittingId,
                submitHomework,
              ),
            ),
    ),
  );
}

function renderHomework(
  item,
  notes,
  setNotes,
  localFiles,
  chooseImages,
  removeImage,
  submittingId,
  submitHomework,
) {
  const assignment = item.homework;
  const editable = item.status !== "reviewed";
  const selectedFiles = localFiles[item.id] || [];
  const remoteImages = item.fileUrls || [];

  return h(
    View,
    {
      className: `homework-card${item.status === "reviewed" ? " homework-card--reviewed" : ""}`,
      key: item.id,
    },
    h(
      View,
      { className: "homework-card__heading" },
      h(
        View,
        { className: "homework-card__heading-main" },
        h(Text, { className: "homework-title" }, assignment.title),
        h(
          Text,
          { className: "muted" },
          `${item.student.name} · ${assignment.class.name} · ${assignment.subject}`,
        ),
      ),
      h(
        Text,
        { className: `homework-status homework-status--${item.status}` },
        statusLabels[item.status] || item.status,
      ),
    ),
    h(Text, { className: "homework-content" }, assignment.content),
    assignment.dueAt
      ? h(
          Text,
          { className: "homework-meta" },
          `截止：${formatDate(assignment.dueAt)}`,
        )
      : null,
    editable
      ? h(
          View,
          { className: "homework-submit-panel" },
          h(Text, { className: "field-label" }, "完成情况"),
          h(Textarea, {
            className: "homework-textarea",
            value: notes[item.id] || "",
            maxlength: 1000,
            placeholder: "填写孩子的完成情况（也可以只提交图片）",
            onInput: (event) =>
              setNotes((current) => ({
                ...current,
                [item.id]: event.detail.value,
              })),
          }),
          remoteImages.length || selectedFiles.length
            ? h(
                View,
                { className: "homework-images" },
                remoteImages.map((url) => {
                  const imageUrl = absoluteUrl(url);
                  return h(Image, {
                    className: "homework-image",
                    key: url,
                    src: imageUrl,
                    mode: "aspectFill",
                    onClick: () =>
                      Taro.previewImage({
                        current: imageUrl,
                        urls: remoteImages.map(absoluteUrl),
                      }),
                  });
                }),
                selectedFiles.map((path) =>
                  h(
                    View,
                    { className: "local-image-wrap", key: path },
                    h(Image, {
                      className: "homework-image",
                      src: path,
                      mode: "aspectFill",
                    }),
                    h(
                      Text,
                      {
                        className: "remove-image",
                        onClick: () => removeImage(item.id, path),
                      },
                      "×",
                    ),
                  ),
                ),
              )
            : null,
          h(
            View,
            { className: "homework-actions" },
            h(
              Button,
              {
                className: "homework-secondary-button",
                size: "mini",
                disabled: Boolean(submittingId),
                onClick: () => chooseImages(item.id),
              },
              "拍照 / 选图",
            ),
            h(
              Button,
              {
                className: "homework-primary-button",
                size: "mini",
                loading: submittingId === item.id,
                disabled: Boolean(submittingId),
                onClick: () => submitHomework(item),
              },
              item.status === "submitted" ? "重新提交" : "提交作业",
            ),
          ),
        )
      : h(
          View,
          { className: "review-result" },
          item.content
            ? h(
                Text,
                { className: "homework-content" },
                `提交：${item.content}`,
              )
            : null,
          remoteImages.length
            ? h(
                View,
                { className: "homework-images" },
                remoteImages.map((url) => {
                  const imageUrl = absoluteUrl(url);
                  return h(Image, {
                    className: "homework-image",
                    key: url,
                    src: imageUrl,
                    mode: "aspectFill",
                    onClick: () =>
                      Taro.previewImage({
                        current: imageUrl,
                        urls: remoteImages.map(absoluteUrl),
                      }),
                  });
                }),
              )
            : null,
          h(Text, { className: "review-label" }, "老师批语"),
          h(
            Text,
            { className: "review-remark" },
            item.remark || "已批改，无补充批语。",
          ),
          h(
            Text,
            { className: "homework-meta" },
            `批改：${formatDate(item.reviewedAt)}`,
          ),
        ),
  );
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
  const extension = path.split(".").pop().toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

function absoluteUrl(url) {
  return /^https?:\/\//.test(url) ? url : `${API_ORIGIN}${url}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
