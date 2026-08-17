// @ts-nocheck
import React, { useState } from "react";
import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;
const MAX_PHOTO_COUNT = 3;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

export default function WorkflowPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingKey, setCheckingKey] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState({});
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const nextSessions = await teacherRequest("/teacher/workflow/today");
      setSessions(nextSessions);
      setSelectedPhotos((current) =>
        removeCheckedSelections(current, nextSessions),
      );
    } catch (loadError) {
      setError(errorMessage(loadError, "流程加载失败，请重试。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function choosePhotos(sessionId, stepId) {
    const key = stepKey(sessionId, stepId);
    const current = selectedPhotos[key] || [];
    if (current.length >= MAX_PHOTO_COUNT) {
      Taro.showToast({
        title: `最多选择 ${MAX_PHOTO_COUNT} 张照片`,
        icon: "none",
      });
      return;
    }

    try {
      const result = await Taro.chooseMedia({
        count: MAX_PHOTO_COUNT - current.length,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const files = result.tempFiles || [];
      const oversizedCount = files.filter(
        (file) => Number(file.size || 0) > MAX_UPLOAD_SIZE,
      ).length;
      const paths = files
        .filter((file) => Number(file.size || 0) <= MAX_UPLOAD_SIZE)
        .map((file) => file.tempFilePath)
        .filter(Boolean);
      if (oversizedCount > 0) {
        Taro.showToast({ title: "单张照片不能超过 10 MB", icon: "none" });
      }
      if (!paths.length) return;
      setSelectedPhotos((value) => ({
        ...value,
        [key]: [...(value[key] || []), ...paths].slice(0, MAX_PHOTO_COUNT),
      }));
    } catch (chooseError) {
      if (!String(chooseError?.errMsg || chooseError).includes("cancel")) {
        Taro.showToast({ title: "照片选择失败，请重试", icon: "none" });
      }
    }
  }

  function removePhoto(sessionId, stepId, path) {
    const key = stepKey(sessionId, stepId);
    setSelectedPhotos((current) => ({
      ...current,
      [key]: (current[key] || []).filter((item) => item !== path),
    }));
  }

  function previewPhotos(paths, currentPath) {
    const urls = paths.map((path) => resolveApiAssetUrl(path));
    Taro.previewImage({
      urls,
      current: resolveApiAssetUrl(currentPath),
    });
  }

  async function check(session, step) {
    if (checkingKey || step.checked) return;
    const key = stepKey(session.id, step.id);
    const localPhotos = selectedPhotos[key] || [];
    if (step.requirePhoto && localPhotos.length === 0) {
      Taro.showToast({ title: "请先上传打卡照片", icon: "none" });
      return;
    }

    setCheckingKey(key);
    setError("");
    try {
      const photoUrls = [];
      for (const path of localPhotos) {
        try {
          const asset = await uploadWorkflowImage(path);
          photoUrls.push(asset.url);
        } catch (uploadError) {
          throw new Error(
            `照片上传失败：${errorMessage(uploadError, "请检查网络后重试")}`,
          );
        }
      }
      const updatedStep = await teacherRequest(
        `/teacher/workflow/${session.id}/steps/${step.id}/check`,
        { method: "POST", data: { photoUrls } },
      );
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id
            ? {
                ...item,
                steps: item.steps.map((candidate) =>
                  candidate.id === step.id
                    ? { ...candidate, ...updatedStep }
                    : candidate,
                ),
              }
            : item,
        ),
      );
      setSelectedPhotos((current) => ({ ...current, [key]: [] }));
      Taro.showToast({ title: "打卡成功", icon: "success" });
    } catch (checkError) {
      setError(
        errorMessage(checkError, "打卡失败，照片和输入已保留，请重试。"),
      );
    } finally {
      setCheckingKey("");
    }
  }

  useDidShow(() => {
    load();
  });

  const summary = workflowSummary(sessions);
  const current = findGlobalCurrentStep(sessions);
  const currentClassSummary = current
    ? workflowSummary([current.session])
    : { checked: 0, total: 0, percent: 0 };

  return h(
    View,
    { className: "workflow-page" },
    h(
      View,
      { className: "workflow-sticky-summary" },
      h(
        View,
        { className: "workflow-sticky-summary__metric" },
        h(Text, { className: "workflow-sticky-summary__label" }, "全局进度"),
        h(
          Text,
          { className: "workflow-sticky-summary__value" },
          `${summary.percent}%`,
        ),
      ),
      h(
        View,
        { className: "workflow-sticky-summary__metric" },
        h(
          Text,
          { className: "workflow-sticky-summary__label" },
          current?.className || "班级进度",
        ),
        h(
          Text,
          { className: "workflow-sticky-summary__value" },
          currentClassSummary.total
            ? `${currentClassSummary.checked}/${currentClassSummary.total}`
            : "--",
        ),
      ),
      h(
        View,
        { className: "workflow-sticky-summary__current" },
        h(Text, { className: "workflow-sticky-summary__label" }, "当前环节"),
        h(
          Text,
          { className: "workflow-sticky-summary__current-name" },
          current?.step.name ||
            (summary.total && summary.checked === summary.total
              ? "全部完成"
              : "暂无待办"),
        ),
      ),
    ),
    h(
      View,
      { className: "workflow-hero" },
      h(
        View,
        { className: "workflow-hero__heading" },
        h(
          View,
          null,
          h(Text, { className: "workflow-eyebrow" }, formatToday()),
          h(Text, { className: "workflow-title" }, "一日流程"),
        ),
        h(
          Button,
          {
            className: "workflow-refresh",
            size: "mini",
            loading,
            disabled: loading || Boolean(checkingKey),
            onClick: () => load(),
          },
          "刷新",
        ),
      ),
      h(
        View,
        { className: "workflow-overview" },
        h(
          View,
          { className: "workflow-overview__number" },
          h(Text, { className: "workflow-percent" }, `${summary.percent}%`),
          h(Text, { className: "workflow-percent-label" }, "全局完成率"),
        ),
        h(
          View,
          { className: "workflow-overview__detail" },
          h(
            Text,
            { className: "workflow-progress-copy" },
            summary.total
              ? `已完成 ${summary.checked} / ${summary.total} 个环节`
              : "等待今日流程安排",
          ),
          h(
            View,
            {
              className:
                "workflow-progress-track workflow-progress-track--hero",
            },
            h(View, {
              className: "workflow-progress-fill workflow-progress-fill--hero",
              style: { width: `${summary.percent}%` },
            }),
          ),
          h(
            Text,
            { className: "workflow-current" },
            current
              ? `当前关注：${current.className} · ${current.step.name}`
              : summary.total && summary.checked === summary.total
                ? "今日流程已全部完成"
                : "暂无待处理环节",
          ),
        ),
      ),
    ),
    error
      ? h(
          View,
          { className: "workflow-error" },
          h(Text, { className: "workflow-error__text" }, error),
          h(
            Button,
            {
              size: "mini",
              className: "workflow-error__retry",
              onClick: () => load(),
            },
            "重试",
          ),
        )
      : null,
    loading
      ? h(Text, { className: "workflow-empty" }, "正在加载今日流程…")
      : sessions.length === 0
        ? h(
            View,
            { className: "workflow-empty-card" },
            h(Text, { className: "workflow-empty__icon" }, "日"),
            h(Text, { className: "workflow-empty__title" }, "今日暂无流程安排"),
            h(
              Text,
              { className: "workflow-empty__copy" },
              "请确认班级归属和启用中的流程模板。",
            ),
          )
        : sessions.map((session) =>
            h(SessionCard, {
              key: session.id,
              session,
              checkingKey,
              selectedPhotos,
              onChoosePhotos: choosePhotos,
              onRemovePhoto: removePhoto,
              onPreviewPhotos: previewPhotos,
              onCheck: check,
            }),
          ),
  );
}

function SessionCard({
  session,
  checkingKey,
  selectedPhotos,
  onChoosePhotos,
  onRemovePhoto,
  onPreviewPhotos,
  onCheck,
}) {
  const summary = workflowSummary([session]);
  const currentStep = findSessionCurrentStep(session);
  const groups = groupSteps(session.steps || []);

  return h(
    View,
    { className: "workflow-class-card" },
    h(
      View,
      { className: "workflow-class-sticky" },
      h(
        View,
        { className: "workflow-class-heading" },
        h(
          View,
          { className: "workflow-class-heading__main" },
          h(Text, { className: "workflow-class-name" }, session.class.name),
          h(
            Text,
            { className: "workflow-class-status" },
            summary.checked === summary.total && summary.total
              ? "今日流程已完成"
              : currentStep
                ? `当前环节：${currentStep.name}`
                : "等待开始",
          ),
        ),
        h(
          Text,
          { className: "workflow-class-count" },
          `${summary.checked}/${summary.total}`,
        ),
      ),
      h(
        View,
        { className: "workflow-progress-track" },
        h(View, {
          className: "workflow-progress-fill",
          style: { width: `${summary.percent}%` },
        }),
      ),
    ),
    groups.length === 0
      ? h(Text, { className: "workflow-empty" }, "该班级暂无流程步骤")
      : groups.map((group) =>
          h(
            View,
            { className: "workflow-group", key: group.key },
            h(
              View,
              { className: "workflow-group-heading" },
              h(Text, { className: "workflow-group-title" }, group.label),
              h(
                Text,
                { className: "workflow-group-count" },
                `${group.steps.length} 个环节`,
              ),
            ),
            group.steps.map((step) => {
              const key = stepKey(session.id, step.id);
              const localPhotos = selectedPhotos[key] || [];
              const checking = checkingKey === key;
              const current = currentStep?.id === step.id && !step.checked;
              return h(
                View,
                {
                  className: `workflow-step ${step.checked ? "workflow-step--checked" : ""} ${current ? "workflow-step--current" : ""}`,
                  key: step.id,
                },
                h(
                  View,
                  { className: "workflow-step__top" },
                  h(
                    View,
                    {
                      className: `workflow-step-dot ${step.checked ? "workflow-step-dot--checked" : ""}`,
                    },
                    step.checked ? "✓" : "",
                  ),
                  h(
                    View,
                    { className: "workflow-step__main" },
                    h(
                      View,
                      { className: "workflow-step__name-row" },
                      h(Text, { className: "workflow-step-name" }, step.name),
                      current
                        ? h(
                            Text,
                            { className: "workflow-tag workflow-tag--current" },
                            "当前",
                          )
                        : null,
                      step.requirePhoto
                        ? h(
                            Text,
                            { className: "workflow-tag workflow-tag--photo" },
                            "需照片",
                          )
                        : null,
                    ),
                    h(
                      Text,
                      { className: "workflow-step-time" },
                      step.timeRange,
                    ),
                    step.checked
                      ? h(
                          Text,
                          { className: "workflow-checked-time" },
                          `完成于 ${formatCheckedTime(step.checkedAt)}`,
                        )
                      : null,
                  ),
                  h(
                    Button,
                    {
                      size: "mini",
                      className: `workflow-check-button ${step.checked ? "workflow-check-button--checked" : ""}`,
                      loading: checking,
                      disabled:
                        step.checked ||
                        Boolean(checkingKey) ||
                        (step.requirePhoto && localPhotos.length === 0),
                      onClick: () => onCheck(session, step),
                    },
                    step.checked ? "已完成" : checking ? "提交中" : "打卡",
                  ),
                ),
                step.requirePhoto && !step.checked
                  ? h(PhotoEvidenceEditor, {
                      paths: localPhotos,
                      disabled: Boolean(checkingKey),
                      onChoose: () => onChoosePhotos(session.id, step.id),
                      onRemove: (path) =>
                        onRemovePhoto(session.id, step.id, path),
                      onPreview: (path) => onPreviewPhotos(localPhotos, path),
                    })
                  : null,
                step.checked && step.photoUrls?.length
                  ? h(PhotoEvidencePreview, {
                      paths: step.photoUrls,
                      onPreview: (path) =>
                        onPreviewPhotos(step.photoUrls, path),
                    })
                  : null,
              );
            }),
          ),
        ),
  );
}

function PhotoEvidenceEditor({
  paths,
  disabled,
  onChoose,
  onRemove,
  onPreview,
}) {
  return h(
    View,
    { className: "workflow-photo-panel" },
    h(
      View,
      { className: "workflow-photo-heading" },
      h(Text, { className: "workflow-photo-title" }, "打卡凭证"),
      h(Text, { className: "workflow-photo-tip" }, "请拍摄现场照片后再打卡"),
    ),
    h(
      View,
      { className: "workflow-photo-grid" },
      paths.map((path) =>
        h(
          View,
          { className: "workflow-photo-item", key: path },
          h(Image, {
            className: "workflow-photo-image",
            src: path,
            mode: "aspectFill",
            onClick: () => onPreview(path),
          }),
          h(
            View,
            {
              className: "workflow-photo-remove",
              onClick: () => onRemove(path),
            },
            "×",
          ),
        ),
      ),
      paths.length < MAX_PHOTO_COUNT
        ? h(
            Button,
            {
              className: "workflow-photo-add",
              disabled,
              onClick: onChoose,
            },
            h(Text, { className: "workflow-photo-add__icon" }, "+"),
            h(Text, { className: "workflow-photo-add__text" }, "拍照/相册"),
          )
        : null,
    ),
  );
}

function PhotoEvidencePreview({ paths, onPreview }) {
  return h(
    View,
    { className: "workflow-photo-panel workflow-photo-panel--done" },
    h(
      Text,
      { className: "workflow-photo-title" },
      `已上传凭证 · ${paths.length} 张`,
    ),
    h(
      View,
      { className: "workflow-photo-grid" },
      paths.map((path) =>
        h(Image, {
          className: "workflow-photo-image workflow-photo-image--done",
          key: path,
          src: resolveApiAssetUrl(path),
          mode: "aspectFill",
          onClick: () => onPreview(path),
        }),
      ),
    ),
  );
}

function workflowSummary(sessions) {
  const steps = sessions.flatMap((session) => session.steps || []);
  const checked = steps.filter((step) => step.checked).length;
  return {
    checked,
    total: steps.length,
    percent: steps.length ? Math.round((checked / steps.length) * 100) : 0,
  };
}

function findGlobalCurrentStep(sessions) {
  const active = sessions
    .map((session) => ({
      className: session.class.name,
      step: findSessionCurrentStep(session),
      session,
    }))
    .filter((item) => item.step);
  return active[0] || null;
}

function findSessionCurrentStep(session) {
  const pending = (session.steps || []).filter((step) => !step.checked);
  if (!pending.length) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    pending.find((step) => isWithinTimeRange(step.timeRange, minutes)) ||
    pending[0]
  );
}

function isWithinTimeRange(timeRange, minutes) {
  const matches = String(timeRange || "").match(
    /(\d{1,2}):(\d{2})\s*[-–—~至]\s*(\d{1,2}):(\d{2})/,
  );
  if (!matches) return false;
  const start = Number(matches[1]) * 60 + Number(matches[2]);
  const end = Number(matches[3]) * 60 + Number(matches[4]);
  return minutes >= start && minutes <= end;
}

function groupSteps(steps) {
  const groups = [];
  steps.forEach((step) => {
    const phase = phaseForStep(step);
    let group = groups.find((item) => item.key === phase.key);
    if (!group) {
      group = { ...phase, steps: [] };
      groups.push(group);
    }
    group.steps.push(step);
  });
  return groups;
}

function phaseForStep(step) {
  const key = String(step.stepKey || "").toLowerCase();
  const name = String(step.name || "");
  if (key.includes("arrive") || /到校|签到|入校/.test(name)) {
    return { key: "arrival", label: "入校准备" };
  }
  if (key.includes("dinner") || /晚餐|午餐|休息|用餐/.test(name)) {
    return { key: "care", label: "生活照护" };
  }
  if (key.includes("leave") || /离校|交接|放学/.test(name)) {
    return { key: "departure", label: "离校交接" };
  }
  return { key: "learning", label: "学习时段" };
}

function removeCheckedSelections(current, sessions) {
  const next = { ...current };
  sessions.forEach((session) => {
    (session.steps || []).forEach((step) => {
      if (step.checked) delete next[stepKey(session.id, step.id)];
    });
  });
  return next;
}

function stepKey(sessionId, stepId) {
  return `${sessionId}:${stepId}`;
}

async function uploadWorkflowImage(path) {
  const base64 = await readFileAsBase64(path);
  const size = base64ByteLength(base64);
  if (size > MAX_UPLOAD_SIZE) {
    throw new Error("单张照片不能超过 10 MB");
  }
  return teacherRequest("/files", {
    method: "POST",
    data: {
      fileName: fileNameFromPath(path),
      mimeType: imageMimeType(base64),
      base64,
      size,
      scene: "workflow",
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
  return path.split(/[\\/]/).pop() || `workflow-${Date.now()}.jpg`;
}

function imageMimeType(base64) {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  throw new Error("仅支持 JPG、PNG、WebP 或 GIF 图片");
}

function base64ByteLength(base64) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function formatCheckedTime(value) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatToday() {
  const date = new Date();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
