// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Button, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const durationOptions = [30, 40, 45, 60, 90, 120];
const emptyForm = () => ({
  classId: "",
  theme: "",
  lessonDate: todayValue(),
  durationMinutes: 45,
  objectives: "",
  content: "",
  status: "draft",
});

export default function LessonPage() {
  const [classes, setClasses] = useState([]);
  const [lessonPlans, setLessonPlans] = useState([]);
  const [scope, setScope] = useState("week");
  const [form, setForm] = useState(emptyForm);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusActionId, setStatusActionId] = useState("");
  const [error, setError] = useState("");

  async function load(nextScope = scope, showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextClasses, nextPlans] = await Promise.all([
        teacherRequest("/teacher/classes"),
        teacherRequest(`/teacher/lesson-plans?scope=${nextScope}`),
      ]);
      setClasses(nextClasses);
      setLessonPlans(nextPlans);
      setForm((current) => ({
        ...current,
        classId:
          nextClasses.some((item) => item.id === current.classId)
            ? current.classId
            : nextClasses[0]?.id || "",
      }));
    } catch (loadError) {
      setError(errorMessage(loadError, "备课数据加载失败，请重试。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  const summary = useMemo(() => {
    const published = lessonPlans.filter((item) => item.status === "published").length;
    const draft = lessonPlans.filter((item) => item.status === "draft").length;
    return { total: lessonPlans.length, published, draft };
  }, [lessonPlans]);

  function changeScope(nextScope) {
    if (loading || nextScope === scope) return;
    setScope(nextScope);
    load(nextScope);
  }

  function openCreate() {
    setEditingId("");
    setForm({ ...emptyForm(), classId: classes[0]?.id || "" });
    setFormVisible(true);
  }

  function openEdit(plan) {
    setEditingId(plan.id);
    setForm({
      classId: plan.classId,
      theme: plan.theme,
      lessonDate: inputDate(plan.lessonDate),
      durationMinutes: plan.durationMinutes,
      objectives: plan.objectives,
      content: plan.content,
      status: plan.status,
    });
    setFormVisible(true);
    Taro.pageScrollTo({ scrollTop: 0, duration: 160 }).catch(() => undefined);
  }

  function closeForm() {
    if (saving) return;
    setFormVisible(false);
    setEditingId("");
  }

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(targetStatus = "draft") {
    if (saving) return;
    const theme = form.theme.trim();
    const objectives = form.objectives.trim();
    const content = form.content.trim();
    const durationMinutes = Number(form.durationMinutes);
    if (!form.classId || !form.lessonDate || !theme || !objectives || !content) {
      Taro.showToast({ title: "请完整填写教案信息", icon: "none" });
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
      Taro.showToast({ title: "授课时长应为 10 至 480 分钟", icon: "none" });
      return;
    }

    setSaving(true);
    setError("");
    const data = {
      classId: form.classId,
      theme,
      lessonDate: `${form.lessonDate}T12:00:00.000Z`,
      durationMinutes,
      objectives,
      content,
      status: targetStatus,
    };
    try {
      if (editingId) {
        await teacherRequest(`/teacher/lesson-plans/${editingId}`, {
          method: "PATCH",
          data,
        });
      } else {
        await teacherRequest("/teacher/lesson-plans", { method: "POST", data });
      }
      setFormVisible(false);
      setEditingId("");
      Taro.showToast({
        title: targetStatus === "published" ? "教案已发布" : "草稿已保存",
        icon: "success",
      });
      await load(scope, false);
    } catch (saveError) {
      setError(errorMessage(saveError, "教案保存失败，表单内容已保留。"));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(plan, status) {
    if (statusActionId) return;
    setStatusActionId(plan.id);
    setError("");
    try {
      await teacherRequest(`/teacher/lesson-plans/${plan.id}/status`, {
        method: "PATCH",
        data: { status },
      });
      Taro.showToast({ title: statusToast(status), icon: "success" });
      await load(scope, false);
    } catch (statusError) {
      setError(errorMessage(statusError, "教案状态更新失败，请重试。"));
    } finally {
      setStatusActionId("");
    }
  }

  return h(
    View,
    { className: "lesson-page" },
    h(
      View,
      { className: "lesson-hero" },
      h(
        View,
        { className: "lesson-hero__heading" },
        h(
          View,
          null,
          h(Text, { className: "lesson-eyebrow" }, "教学准备"),
          h(Text, { className: "lesson-title" }, "备课中心"),
          h(Text, { className: "lesson-description" }, "把教学目标和课堂安排提前沉淀为可复用教案。"),
        ),
        h(
          Button,
          {
            className: "lesson-create-button",
            size: "mini",
            disabled: loading || !classes.length,
            onClick: openCreate,
          },
          "+ 新建教案",
        ),
      ),
      h(
        View,
        { className: "lesson-summary" },
        summaryMetric(summary.total, "当前列表"),
        summaryMetric(summary.published, "已发布"),
        summaryMetric(summary.draft, "草稿"),
      ),
    ),
    h(
      View,
      { className: "lesson-tabs" },
      filterButton("week", "本周", scope, changeScope),
      filterButton("all", "全部", scope, changeScope),
      filterButton("draft", "草稿", scope, changeScope),
    ),
    error
      ? h(
          View,
          { className: "lesson-feedback lesson-feedback--error" },
          h(Text, null, error),
          h(Text, { className: "lesson-feedback__retry", onClick: () => load(scope) }, "重新加载"),
        )
      : null,
    formVisible
      ? renderForm({
          classes,
          form,
          editingId,
          saving,
          updateForm,
          closeForm,
          save,
        })
      : null,
    h(
      View,
      { className: "lesson-list-heading" },
      h(Text, { className: "lesson-list-heading__title" }, scopeTitle(scope)),
      h(
        View,
        { className: "lesson-refresh", onClick: () => load(scope) },
        h(Text, null, loading ? "同步中…" : "↻ 刷新"),
      ),
    ),
    loading && lessonPlans.length === 0
      ? h(Text, { className: "lesson-feedback" }, "正在加载教案…")
      : null,
    !loading && !error && lessonPlans.length === 0
      ? h(
          View,
          { className: "lesson-empty" },
          h(Text, { className: "lesson-empty__icon" }, "备"),
          h(Text, { className: "lesson-empty__title" }, "当前没有教案"),
          h(Text, { className: "lesson-empty__text" }, scope === "draft" ? "没有待完善的草稿。" : "点击“新建教案”开始准备课程。"),
        )
      : null,
    h(
      View,
      { className: "lesson-list" },
      lessonPlans.map((plan) =>
        renderPlanCard(plan, {
          expanded: expandedId === plan.id,
          busy: statusActionId === plan.id,
          onToggle: () => setExpandedId(expandedId === plan.id ? "" : plan.id),
          onEdit: () => openEdit(plan),
          onStatus: (status) => changeStatus(plan, status),
        }),
      ),
    ),
  );
}

function renderForm({ classes, form, editingId, saving, updateForm, closeForm, save }) {
  const classIndex = Math.max(0, classes.findIndex((item) => item.id === form.classId));
  const durationIndex = Math.max(0, durationOptions.indexOf(Number(form.durationMinutes)));
  return h(
    View,
    { className: "lesson-form-card" },
    h(
      View,
      { className: "lesson-form-heading" },
      h(
        View,
        null,
        h(Text, { className: "lesson-form-title" }, editingId ? "编辑教案" : "新建教案"),
        h(Text, { className: "lesson-form-hint" }, "先保存草稿，确认后再发布。"),
      ),
      h(Text, { className: "lesson-form-close", onClick: closeForm }, "×"),
    ),
    formField(
      "授课班级",
      h(
        Picker,
        {
          mode: "selector",
          range: classes.map((item) => item.name),
          value: classIndex,
          onChange: (event) => updateForm("classId", classes[Number(event.detail.value)]?.id || ""),
        },
        h(View, { className: "lesson-picker" }, classes[classIndex]?.name || "请选择班级"),
      ),
    ),
    formField(
      "课程主题",
      h(Input, {
        className: "lesson-input",
        value: form.theme,
        maxlength: 80,
        placeholder: "例如：认识时间与钟表",
        onInput: (event) => updateForm("theme", event.detail.value),
      }),
    ),
    h(
      View,
      { className: "lesson-form-grid" },
      formField(
        "授课日期",
        h(
          Picker,
          {
            mode: "date",
            value: form.lessonDate,
            onChange: (event) => updateForm("lessonDate", event.detail.value),
          },
          h(View, { className: "lesson-picker" }, form.lessonDate),
        ),
      ),
      formField(
        "授课时长",
        h(
          Picker,
          {
            mode: "selector",
            range: durationOptions.map((value) => `${value} 分钟`),
            value: durationIndex,
            onChange: (event) => updateForm("durationMinutes", durationOptions[Number(event.detail.value)]),
          },
          h(View, { className: "lesson-picker" }, `${form.durationMinutes} 分钟`),
        ),
      ),
    ),
    formField(
      "教学目标",
      h(Textarea, {
        className: "lesson-textarea lesson-textarea--short",
        value: form.objectives,
        maxlength: 1000,
        placeholder: "本节课希望学生理解或掌握什么？",
        onInput: (event) => updateForm("objectives", event.detail.value),
      }),
    ),
    formField(
      "教学内容与步骤",
      h(Textarea, {
        className: "lesson-textarea",
        value: form.content,
        maxlength: 4000,
        placeholder: "填写导入、讲解、练习、总结等课堂安排",
        onInput: (event) => updateForm("content", event.detail.value),
      }),
    ),
    h(
      View,
      { className: "lesson-form-actions" },
      h(
        Button,
        { className: "lesson-draft-button", loading: saving, disabled: saving, onClick: () => save("draft") },
        "保存草稿",
      ),
      h(
        Button,
        { className: "lesson-publish-button", loading: saving, disabled: saving, onClick: () => save("published") },
        "保存并发布",
      ),
    ),
  );
}

function renderPlanCard(plan, actions) {
  return h(
    View,
    { className: `lesson-card lesson-card--${plan.status}`, key: plan.id },
    h(
      View,
      { className: "lesson-card__top" },
      h(
        View,
        { className: "lesson-date-box" },
        h(Text, { className: "lesson-date-box__day" }, dayValue(plan.lessonDate)),
        h(Text, { className: "lesson-date-box__month" }, monthValue(plan.lessonDate)),
      ),
      h(
        View,
        { className: "lesson-card__main" },
        h(Text, { className: "lesson-card__theme" }, plan.theme),
        h(Text, { className: "lesson-card__meta" }, `${plan.class?.name || "班级"} · ${plan.durationMinutes} 分钟 · ${weekDay(plan.lessonDate)}`),
      ),
      h(Text, { className: `lesson-status lesson-status--${plan.status}` }, statusLabel(plan.status)),
    ),
    actions.expanded
      ? h(
          View,
          { className: "lesson-detail" },
          detailBlock("教学目标", plan.objectives),
          detailBlock("教学内容与步骤", plan.content),
          h(Text, { className: "lesson-updated" }, `最后更新：${formatDateTime(plan.updatedAt)}`),
        )
      : h(Text, { className: "lesson-objective-preview" }, plan.objectives),
    h(
      View,
      { className: "lesson-card__actions" },
      h(Button, { className: "lesson-action-button", size: "mini", onClick: actions.onToggle }, actions.expanded ? "收起详情" : "查看详情"),
      plan.status !== "archived"
        ? h(Button, { className: "lesson-action-button", size: "mini", disabled: actions.busy, onClick: actions.onEdit }, "编辑")
        : null,
      plan.status === "draft"
        ? h(Button, { className: "lesson-action-button lesson-action-button--primary", size: "mini", loading: actions.busy, disabled: actions.busy, onClick: () => actions.onStatus("published") }, "发布")
        : plan.status === "published"
          ? h(Button, { className: "lesson-action-button", size: "mini", loading: actions.busy, disabled: actions.busy, onClick: () => actions.onStatus("archived") }, "归档")
          : h(Button, { className: "lesson-action-button", size: "mini", loading: actions.busy, disabled: actions.busy, onClick: () => actions.onStatus("draft") }, "转为草稿"),
    ),
  );
}

function formField(label, control) {
  return h(View, { className: "lesson-field" }, h(Text, { className: "lesson-field__label" }, `${label} *`), control);
}

function detailBlock(title, content) {
  return h(View, { className: "lesson-detail-block" }, h(Text, { className: "lesson-detail-block__title" }, title), h(Text, { className: "lesson-detail-block__content" }, content));
}

function filterButton(key, label, active, onClick) {
  return h(View, { className: `lesson-tab${active === key ? " lesson-tab--active" : ""}`, onClick: () => onClick(key) }, h(Text, null, label));
}

function summaryMetric(value, label) {
  return h(View, { className: "lesson-summary__item" }, h(Text, { className: "lesson-summary__value" }, String(value)), h(Text, { className: "lesson-summary__label" }, label));
}

function scopeTitle(scope) {
  return { week: "本周教案", all: "全部教案", draft: "草稿箱" }[scope] || "教案列表";
}

function statusLabel(status) {
  return { draft: "草稿", published: "已发布", archived: "已归档" }[status] || status;
}

function statusToast(status) {
  return { draft: "已转为草稿", published: "教案已发布", archived: "教案已归档" }[status] || "状态已更新";
}

function todayValue() {
  return inputDate(new Date());
}

function inputDate(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayValue(value) {
  return String(new Date(value).getDate()).padStart(2, "0");
}

function monthValue(value) {
  return `${new Date(value).getMonth() + 1}月`;
}

function weekDay(value) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(value).getDay()];
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
