// @ts-nocheck
import React, { useRef, useState } from "react";
import {
  Image,
  Input,
  Switch,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;
const MAX_PHOTO_COUNT = 3;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

const typeOptions = [
  ["meal", "用餐"],
  ["water", "饮水"],
  ["rest", "休息"],
  ["mood", "情绪"],
  ["exception", "异常"],
];

function emptyForm() {
  return {
    type: "meal",
    slot: "dinner",
    value: "normal",
    durationMinutes: "",
    category: "other",
    needsAttention: true,
    remark: "",
    resolution: "",
    photos: [],
  };
}

export default function CarePage() {
  const [data, setData] = useState(null);
  const [activeClassId, setActiveClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState("");
  const [error, setError] = useState("");
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const loadingRef = useRef(false);
  const actionLockRef = useRef(false);

  async function load(showLoading = true) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (showLoading) setLoading(true);
    setError("");
    try {
      const next = await teacherRequest("/teacher/care/today");
      setData(next);
      if (!next.classes.some((item) => item.id === activeClassId)) {
        setActiveClassId(next.classes[0]?.id || "");
      }
    } catch (loadError) {
      setError(errorMessage(loadError, "今日照护加载失败"));
    } finally {
      loadingRef.current = false;
      if (showLoading) setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => load());
  usePullDownRefresh(() => load(false));

  const activeClass = data?.classes?.find((item) => item.id === activeClassId);
  const students = activeClass?.students || [];
  const eligible = students.filter(
    (student) => !["absent", "left"].includes(student.pickupStatus),
  );

  async function submitBatch(type) {
    if (actionLockRef.current || !activeClass) return;
    const studentIds = eligible
      .filter((student) =>
        type === "meal"
          ? !student.care?.meal?.dinner
          : type === "rest"
            ? !student.care?.rest
            : true,
      )
      .map((student) => student.id);
    if (!studentIds.length) {
      Taro.showToast({ title: "当前没有待批量记录的学生", icon: "none" });
      return;
    }
    actionLockRef.current = true;
    setActionKey(`batch:${type}`);
    setError("");
    try {
      const body = { classId: activeClass.id, studentIds };
      if (type === "meal") Object.assign(body, { slot: "dinner", value: "normal" });
      if (type === "rest") Object.assign(body, { value: "rested" });
      const result = await teacherRequest(`/teacher/care/${type}/batch`, {
        method: "POST",
        data: body,
      });
      const count = Number(result.created || 0);
      Taro.showToast({ title: `已记录 ${count} 人`, icon: "success" });
      await load(false);
    } catch (batchError) {
      const message = errorMessage(batchError, "批量记录失败");
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      actionLockRef.current = false;
      setActionKey("");
    }
  }

  function openStudent(student) {
    setEditingStudent(student);
    setForm(emptyForm());
  }

  function selectType(type) {
    setForm((current) => ({
      ...emptyForm(),
      type,
      value: type === "rest" ? "rested" : "normal",
      photos: current.photos,
    }));
  }

  async function choosePhotos() {
    if (form.photos.length >= MAX_PHOTO_COUNT) {
      Taro.showToast({ title: "最多选择 3 张照片", icon: "none" });
      return;
    }
    try {
      const result = await Taro.chooseMedia({
        count: MAX_PHOTO_COUNT - form.photos.length,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const files = result.tempFiles || [];
      const oversized = files.some(
        (file) => Number(file.size || 0) > MAX_UPLOAD_SIZE,
      );
      const paths = files
        .filter((file) => Number(file.size || 0) <= MAX_UPLOAD_SIZE)
        .map((file) => file.tempFilePath)
        .filter(Boolean);
      if (oversized) {
        Taro.showToast({ title: "单张照片不能超过 10 MB", icon: "none" });
      }
      setForm((current) => ({
        ...current,
        photos: [...current.photos, ...paths].slice(0, MAX_PHOTO_COUNT),
      }));
    } catch (chooseError) {
      if (!String(chooseError?.errMsg || chooseError).includes("cancel")) {
        Taro.showToast({ title: "照片选择失败", icon: "none" });
      }
    }
  }

  async function submitStudent() {
    if (!editingStudent || actionLockRef.current) return;
    if (form.type === "exception" && !form.remark.trim()) {
      Taro.showToast({ title: "请填写异常事实", icon: "none" });
      return;
    }
    actionLockRef.current = true;
    setActionKey(`student:${editingStudent.id}`);
    setError("");
    try {
      const photoUrls = [];
      for (const path of form.photos) {
        try {
          const asset = await uploadCareImage(path);
          photoUrls.push(asset.url);
        } catch (uploadError) {
          throw new Error(`照片上传失败：${errorMessage(uploadError, "请检查网络后重试")}`);
        }
      }
      const body = studentPayload(form, photoUrls);
      await teacherRequest(
        `/teacher/students/${editingStudent.id}/care-records/${form.type}`,
        { method: "POST", data: body },
      );
      Taro.showToast({ title: "照护记录已保存", icon: "success" });
      setEditingStudent(null);
      setForm(emptyForm());
      await load(false);
    } catch (submitError) {
      const message = errorMessage(submitError, "照护记录保存失败");
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      actionLockRef.current = false;
      setActionKey("");
    }
  }

  return h(
    View,
    { className: "care-page" },
    h(
      View,
      { className: "care-hero" },
      h(
        View,
        null,
        h(Text, { className: "care-hero__date" }, data?.date || "今日"),
        h(Text, { className: "care-hero__title" }, "今日生活照护"),
        h(Text, { className: "care-hero__hint" }, "正常情况批量记录，例外与异常单独处理"),
      ),
      h(
        View,
        {
          className: `care-refresh${loading ? " care-refresh--loading" : ""}`,
          onClick: () => !loading && load(),
        },
        h(Text, null, loading ? "加载中" : "刷新"),
      ),
    ),
    error
      ? h(
          View,
          { className: "care-error" },
          h(Text, null, error),
          h(Text, { className: "care-error__retry", onClick: () => load() }, "重试"),
        )
      : null,
    data?.classes?.length > 1
      ? h(
          View,
          { className: "care-class-tabs" },
          ...data.classes.map((klass) =>
            h(
              View,
              {
                key: klass.id,
                className: `care-class-tab${klass.id === activeClassId ? " care-class-tab--active" : ""}`,
                onClick: () => setActiveClassId(klass.id),
              },
              h(Text, null, klass.name),
            ),
          ),
        )
      : null,
    activeClass
      ? h(
          React.Fragment,
          null,
          classSummary(activeClass),
          h(
            View,
            { className: "care-batch-card" },
            h(Text, { className: "care-section-title" }, "全班快捷记录"),
            h(Text, { className: "care-section-hint" }, `${eligible.length} 名当前可操作学生`),
            h(
              View,
              { className: "care-batch-actions" },
              batchButton("晚餐正常", "meal", actionKey, submitBatch),
              batchButton("全班饮水 +1", "water", actionKey, submitBatch),
              batchButton("已休息", "rest", actionKey, submitBatch),
            ),
          ),
          h(Text, { className: "care-list-title" }, "学生今日照护"),
          h(
            View,
            { className: "care-student-list" },
            ...students.map((student) => studentCard(student, () => openStudent(student))),
          ),
        )
      : h(
          View,
          { className: "care-empty" },
          h(Text, null, loading ? "正在加载班级…" : "暂无负责班级"),
        ),
    editingStudent
      ? editorPanel(
          editingStudent,
          form,
          setForm,
          selectType,
          choosePhotos,
          submitStudent,
          () => !actionLockRef.current && setEditingStudent(null),
          Boolean(actionKey),
        )
      : null,
  );
}

function classSummary(klass) {
  const summary = klass.summary || {};
  return h(
    View,
    { className: "care-summary" },
    h(
      View,
      { className: "care-summary__heading" },
      h(Text, { className: "care-summary__class" }, klass.name),
      h(
        Text,
        { className: summary.needsAttention ? "care-summary__attention" : "care-summary__ok" },
        summary.needsAttention ? `⚠ ${summary.needsAttention} 项需关注` : "暂无待关注异常",
      ),
    ),
    h(
      View,
      { className: "care-summary__grid" },
      summaryMetric("晚餐正常", Number(summary.dinner?.normal || 0) + Number(summary.dinner?.good || 0)),
      summaryMetric("已饮水", summary.water?.events || 0),
      summaryMetric("已休息", Number(summary.rest?.slept || 0) + Number(summary.rest?.rested || 0)),
      summaryMetric("异常", summary.exceptions || 0, summary.exceptions ? "danger" : ""),
    ),
  );
}

function summaryMetric(label, value, tone = "") {
  return h(
    View,
    { className: `care-summary__metric${tone ? ` care-summary__metric--${tone}` : ""}` },
    h(Text, { className: "care-summary__value" }, value),
    h(Text, { className: "care-summary__label" }, label),
  );
}

function batchButton(label, type, actionKey, onClick) {
  const busy = actionKey === `batch:${type}`;
  return h(
    View,
    {
      className: `care-batch-button${busy ? " care-batch-button--busy" : ""}`,
      onClick: () => !actionKey && onClick(type),
    },
    h(Text, null, busy ? "处理中…" : label),
  );
}

function studentCard(student, onClick) {
  const care = student.care || {};
  const dinner = care.meal?.dinner;
  const exceptionCount = care.exceptions?.length || 0;
  return h(
    View,
    {
      key: student.id,
      className: `care-student${exceptionCount ? " care-student--exception" : ""}`,
      onClick,
    },
    h(
      View,
      { className: "care-student__avatar" },
      h(Text, null, student.name.slice(0, 1)),
    ),
    h(
      View,
      { className: "care-student__main" },
      h(
        View,
        { className: "care-student__title-row" },
        h(Text, { className: "care-student__name" }, student.name),
        h(
          Text,
          { className: `care-student__pickup care-student__pickup--${student.pickupStatus}` },
          pickupStatusText(student.pickupStatus),
        ),
      ),
      h(
        Text,
        { className: "care-student__facts" },
        `晚餐 ${mealText(dinner?.value)} · 饮水 ${care.water?.count || 0} 次 · 休息 ${restText(care.rest)}`,
      ),
      h(
        Text,
        { className: exceptionCount ? "care-student__warning" : "care-student__mood" },
        exceptionCount
          ? `⚠ ${exceptionCount} 条异常${care.needsAttentionCount ? `，${care.needsAttentionCount} 条需关注` : ""}`
          : `情绪 ${moodText(care.mood?.value)}`,
      ),
    ),
    h(Text, { className: "care-student__arrow" }, "记录 ›"),
  );
}

function editorPanel(student, form, setForm, selectType, choosePhotos, submit, close, busy) {
  return h(
    View,
    { className: "care-editor-mask", onClick: close },
    h(
      View,
      { className: "care-editor", onClick: (event) => event.stopPropagation() },
      h(
        View,
        { className: "care-editor__heading" },
        h(
          View,
          null,
          h(Text, { className: "care-editor__title" }, `${student.name} · 今日照护`),
          h(Text, { className: "care-editor__hint" }, pickupStatusText(student.pickupStatus)),
        ),
        h(Text, { className: "care-editor__close", onClick: close }, "×"),
      ),
      h(
        View,
        { className: "care-type-tabs" },
        ...typeOptions.map(([value, label]) =>
          h(
            View,
            {
              key: value,
              className: `care-type-tab${form.type === value ? " care-type-tab--active" : ""}`,
              onClick: () => !busy && selectType(value),
            },
            h(Text, null, label),
          ),
        ),
      ),
      form.type === "meal"
        ? h(
            React.Fragment,
            null,
            fieldLabel("餐次"),
            choiceGroup(
              [["snack", "点心"], ["dinner", "晚餐"]],
              form.slot,
              (slot) => setForm((current) => ({ ...current, slot })),
            ),
            fieldLabel("用餐情况"),
            choiceGroup(
              [["good", "吃得很好"], ["normal", "正常"], ["little", "较少"], ["refused", "未进食"]],
              form.value,
              (value) => setForm((current) => ({ ...current, value })),
            ),
          )
        : null,
      form.type === "rest"
        ? h(
            React.Fragment,
            null,
            fieldLabel("休息情况"),
            choiceGroup(
              [["slept", "已睡眠"], ["rested", "已休息"], ["no_rest", "未休息"]],
              form.value,
              (value) => setForm((current) => ({ ...current, value })),
            ),
            fieldLabel("时长（分钟，可选）"),
            h(Input, {
              className: "care-editor__input",
              type: "number",
              value: form.durationMinutes,
              placeholder: "1–240",
              onInput: (event) => setForm((current) => ({ ...current, durationMinutes: event.detail.value })),
            }),
          )
        : null,
      form.type === "mood"
        ? h(
            React.Fragment,
            null,
            fieldLabel("情绪状态"),
            choiceGroup(
              [["good", "愉快"], ["normal", "平稳"], ["low", "低落"], ["upset", "明显不开心"]],
              form.value,
              (value) => setForm((current) => ({ ...current, value })),
            ),
          )
        : null,
      form.type === "water"
        ? h(Text, { className: "care-editor__notice" }, "保存后新增 1 次饮水事实。")
        : null,
      form.type === "exception"
        ? h(
            React.Fragment,
            null,
            fieldLabel("异常类别"),
            choiceGroup(
              [["physical", "身体不适"], ["emotional", "情绪"], ["injury", "受伤"], ["behavior", "行为"], ["other", "其他"]],
              form.category,
              (category) => setForm((current) => ({ ...current, category })),
            ),
            fieldLabel("异常事实（必填）"),
            h(Textarea, {
              className: "care-editor__textarea",
              value: form.remark,
              maxlength: 1000,
              placeholder: "只记录观察到的事实，不填写医疗诊断",
              onInput: (event) => setForm((current) => ({ ...current, remark: event.detail.value })),
            }),
            fieldLabel("处理情况（可选）"),
            h(Textarea, {
              className: "care-editor__textarea care-editor__textarea--short",
              value: form.resolution,
              maxlength: 1000,
              placeholder: "例如：已安排休息并联系家长",
              onInput: (event) => setForm((current) => ({ ...current, resolution: event.detail.value })),
            }),
            h(
              View,
              { className: "care-attention-row" },
              h(Text, null, "需要家长关注"),
              h(Switch, {
                checked: form.needsAttention,
                color: "#cf6758",
                onChange: (event) => setForm((current) => ({ ...current, needsAttention: event.detail.value })),
              }),
            ),
          )
        : h(
            React.Fragment,
            null,
            fieldLabel("备注（可选）"),
            h(Textarea, {
              className: "care-editor__textarea care-editor__textarea--short",
              value: form.remark,
              maxlength: 500,
              placeholder: "补充实际情况",
              onInput: (event) => setForm((current) => ({ ...current, remark: event.detail.value })),
            }),
          ),
      fieldLabel("照片（可选，最多 3 张）"),
      h(
        View,
        { className: "care-editor__photos" },
        ...form.photos.map((path) =>
          h(
            View,
            { className: "care-editor__photo-wrap", key: path },
            h(Image, {
              className: "care-editor__photo",
              src: resolveApiAssetUrl(path),
              mode: "aspectFill",
              onClick: () => Taro.previewImage({ current: path, urls: form.photos }),
            }),
            h(
              Text,
              {
                className: "care-editor__photo-remove",
                onClick: () => setForm((current) => ({ ...current, photos: current.photos.filter((item) => item !== path) })),
              },
              "×",
            ),
          ),
        ),
        form.photos.length < MAX_PHOTO_COUNT
          ? h(View, { className: "care-editor__photo-add", onClick: choosePhotos }, h(Text, null, "+\n拍照/相册"))
          : null,
      ),
      h(
        View,
        { className: `care-editor__submit${busy ? " care-editor__submit--busy" : ""}`, onClick: () => !busy && submit() },
        h(Text, null, busy ? "正在保存…" : "保存记录"),
      ),
    ),
  );
}

function fieldLabel(label) {
  return h(Text, { className: "care-editor__label" }, label);
}

function choiceGroup(options, value, onChange) {
  return h(
    View,
    { className: "care-choice-group" },
    ...options.map(([option, label]) =>
      h(
        View,
        {
          key: option,
          className: `care-choice${option === value ? " care-choice--active" : ""}`,
          onClick: () => onChange(option),
        },
        h(Text, null, label),
      ),
    ),
  );
}

function studentPayload(form, photoUrls) {
  const common = { remark: form.remark.trim() || undefined, photoUrls };
  if (form.type === "meal") return { ...common, slot: form.slot, value: form.value };
  if (form.type === "rest")
    return {
      ...common,
      value: form.value,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
    };
  if (form.type === "mood") return { ...common, value: form.value };
  if (form.type === "exception")
    return {
      category: form.category,
      needsAttention: form.needsAttention,
      remark: form.remark.trim(),
      resolution: form.resolution.trim() || undefined,
      photoUrls,
    };
  return common;
}

function mealText(value) {
  return ({ good: "很好", normal: "正常", little: "较少", refused: "未吃" }[value] || "未记录");
}

function restText(record) {
  if (!record) return "未记录";
  const label = { slept: "已睡", rested: "已休息", no_rest: "未休息" }[record.value] || record.value;
  return `${label}${record.durationMinutes ? ` ${record.durationMinutes} 分钟` : ""}`;
}

function moodText(value) {
  return ({ good: "愉快", normal: "平稳", low: "低落", upset: "明显不开心" }[value] || "未记录");
}

function pickupStatusText(status) {
  return ({ waiting_pickup: "等待接送", picked_up: "接送途中", in_care: "已到店", left: "已离店", absent: "今日缺勤" }[status] || "状态待更新");
}

async function uploadCareImage(path) {
  const base64 = await readFileAsBase64(path);
  const size = base64ByteLength(base64);
  if (size > MAX_UPLOAD_SIZE) throw new Error("单张照片不能超过 10 MB");
  return teacherRequest("/files", {
    method: "POST",
    data: {
      fileName: path.split(/[\\/]/).pop() || `care-${Date.now()}.jpg`,
      mimeType: imageMimeType(base64),
      base64,
      size,
      scene: "care",
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

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
