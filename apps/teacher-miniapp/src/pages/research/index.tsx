// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Button, Input, Picker, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const typeOptions = [
  { value: "discussion", label: "教学研讨" },
  { value: "observation", label: "听课评课" },
  { value: "training", label: "教师培训" },
];

function emptyForm() {
  const date = dateValue(new Date());
  return {
    campusId: "",
    type: "discussion",
    title: "",
    description: "",
    date,
    startTime: "14:00",
    endTime: "15:30",
    location: "",
    status: "draft",
  };
}

export default function ResearchPage() {
  const [classes, setClasses] = useState([]);
  const [activities, setActivities] = useState([]);
  const [type, setType] = useState("all");
  const [scope, setScope] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [form, setForm] = useState(emptyForm);

  const campuses = useMemo(() => {
    const seen = new Set();
    return classes
      .map((item) => item.campus)
      .filter((item) => item && !seen.has(item.id) && seen.add(item.id));
  }, [classes]);

  const summary = useMemo(
    () => ({
      total: activities.length,
      registered: activities.filter((item) =>
        ["registered", "attended"].includes(item.myParticipationStatus),
      ).length,
      organized: activities.filter((item) => item.isOrganizer).length,
    }),
    [activities],
  );

  async function load(nextType = type, nextScope = scope, showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextClasses, nextActivities] = await Promise.all([
        teacherRequest("/teacher/classes"),
        teacherRequest(
          `/teacher/research-activities?type=${nextType}&scope=${nextScope}`,
        ),
      ]);
      setClasses(nextClasses);
      setActivities(nextActivities);
    } catch (loadError) {
      setError(errorMessage(loadError, "教研活动加载失败，请重试。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  function changeType(nextType) {
    if (loading || nextType === type) return;
    setType(nextType);
    load(nextType, scope);
  }

  function changeScope(nextScope) {
    if (loading || nextScope === scope) return;
    setScope(nextScope);
    load(type, nextScope);
  }

  function openCreate() {
    setEditingId("");
    setForm({ ...emptyForm(), campusId: campuses[0]?.id || "" });
    setFormVisible(true);
  }

  function openEdit(activity) {
    setEditingId(activity.id);
    setForm({
      campusId: activity.campusId,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      date: dateValue(activity.startAt),
      startTime: timeValue(activity.startAt),
      endTime: timeValue(activity.endAt),
      location: activity.location,
      status: activity.status,
    });
    setFormVisible(true);
    Taro.pageScrollTo({ scrollTop: 0, duration: 160 }).catch(() => undefined);
  }

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(targetStatus) {
    if (saving) return;
    const title = form.title.trim();
    const description = form.description.trim();
    const location = form.location.trim();
    if (!form.campusId || !title || !description || !location) {
      Taro.showToast({ title: "请完整填写活动信息", icon: "none" });
      return;
    }
    const startAt = `${form.date}T${form.startTime}:00+08:00`;
    const endAt = `${form.date}T${form.endTime}:00+08:00`;
    if (new Date(endAt) <= new Date(startAt)) {
      Taro.showToast({ title: "结束时间必须晚于开始时间", icon: "none" });
      return;
    }

    setSaving(true);
    setError("");
    const data = {
      campusId: form.campusId,
      type: form.type,
      title,
      description,
      startAt,
      endAt,
      location,
      status: targetStatus,
    };
    try {
      if (editingId) {
        const { campusId, ...updateData } = data;
        await teacherRequest(`/teacher/research-activities/${editingId}`, {
          method: "PATCH",
          data: updateData,
        });
      } else {
        await teacherRequest("/teacher/research-activities", {
          method: "POST",
          data,
        });
      }
      setFormVisible(false);
      setEditingId("");
      Taro.showToast({
        title: targetStatus === "open" ? "活动已发布" : "草稿已保存",
        icon: "success",
      });
      await load(type, scope, false);
    } catch (saveError) {
      setError(errorMessage(saveError, "活动保存失败，表单内容已保留。"));
    } finally {
      setSaving(false);
    }
  }

  async function updateActivity(activity, status) {
    if (busyId) return;
    setBusyId(activity.id);
    setError("");
    try {
      await teacherRequest(`/teacher/research-activities/${activity.id}`, {
        method: "PATCH",
        data: { status },
      });
      Taro.showToast({ title: activityStatusToast(status), icon: "success" });
      await load(type, scope, false);
    } catch (actionError) {
      setError(errorMessage(actionError, "活动状态更新失败，请重试。"));
    } finally {
      setBusyId("");
    }
  }

  async function updateParticipation(activity, status) {
    if (busyId) return;
    setBusyId(activity.id);
    setError("");
    try {
      await teacherRequest(
        `/teacher/research-activities/${activity.id}/participation`,
        { method: "PATCH", data: { status } },
      );
      Taro.showToast({
        title: status === "registered" ? "报名成功" : "已取消报名",
        icon: "success",
      });
      await load(type, scope, false);
    } catch (actionError) {
      setError(errorMessage(actionError, "参与状态更新失败，请重试。"));
    } finally {
      setBusyId("");
    }
  }

  return h(
    View,
    { className: "research-page" },
    h(
      View,
      { className: "research-hero" },
      h(
        View,
        { className: "research-hero__row" },
        h(
          View,
          null,
          h(Text, { className: "research-eyebrow" }, "教师共同成长"),
          h(Text, { className: "research-title" }, "教研中心"),
          h(
            Text,
            { className: "research-description" },
            "汇集教学研讨、听课评课和培训活动。",
          ),
        ),
        h(
          Button,
          {
            className: "research-create",
            size: "mini",
            disabled: loading || !campuses.length,
            onClick: openCreate,
          },
          "+ 发起活动",
        ),
      ),
      h(
        View,
        { className: "research-summary" },
        metric(summary.total, "当前列表"),
        metric(summary.registered, "我的参与"),
        metric(summary.organized, "我发起的"),
      ),
    ),
    h(
      View,
      { className: "research-scope-tabs" },
      tab("upcoming", "近期活动", scope, changeScope),
      tab("mine", "与我相关", scope, changeScope),
      tab("all", "全部", scope, changeScope),
    ),
    h(
      View,
      { className: "research-type-tabs" },
      typeTab("all", "全部类型", type, changeType),
      ...typeOptions.map((item) =>
        typeTab(item.value, item.label, type, changeType),
      ),
    ),
    error
      ? h(
          View,
          { className: "research-feedback research-feedback--error" },
          h(Text, null, error),
          h(
            Text,
            {
              className: "research-feedback__retry",
              onClick: () => load(type, scope),
            },
            "重新加载",
          ),
        )
      : null,
    formVisible
      ? renderForm({
          campuses,
          form,
          editingId,
          saving,
          updateForm,
          close: () => !saving && setFormVisible(false),
          save,
        })
      : null,
    h(
      View,
      { className: "research-list-heading" },
      h(Text, { className: "research-list-title" }, scopeLabel(scope)),
      h(
        Text,
        { className: "research-refresh", onClick: () => load(type, scope) },
        loading ? "同步中…" : "↻ 刷新",
      ),
    ),
    loading && activities.length === 0
      ? h(Text, { className: "research-feedback" }, "正在加载教研活动…")
      : null,
    !loading && !error && activities.length === 0
      ? h(
          View,
          { className: "research-empty" },
          h(Text, { className: "research-empty__icon" }, "研"),
          h(Text, { className: "research-empty__title" }, "暂无匹配活动"),
          h(
            Text,
            { className: "research-empty__text" },
            scope === "mine" ? "你还没有发起或报名活动。" : "可以发起一场新的教研活动。",
          ),
        )
      : null,
    h(
      View,
      { className: "research-list" },
      activities.map((activity) =>
        activityCard(activity, {
          expanded: expandedId === activity.id,
          busy: busyId === activity.id,
          toggle: () =>
            setExpandedId(expandedId === activity.id ? "" : activity.id),
          edit: () => openEdit(activity),
          updateActivity: (status) => updateActivity(activity, status),
          updateParticipation: (status) =>
            updateParticipation(activity, status),
        }),
      ),
    ),
  );
}

function renderForm({ campuses, form, editingId, saving, updateForm, close, save }) {
  const campusIndex = Math.max(
    0,
    campuses.findIndex((item) => item.id === form.campusId),
  );
  const typeIndex = Math.max(
    0,
    typeOptions.findIndex((item) => item.value === form.type),
  );
  return h(
    View,
    { className: "research-form" },
    h(
      View,
      { className: "research-form__heading" },
      h(
        View,
        null,
        h(Text, { className: "research-form__title" }, editingId ? "编辑教研活动" : "发起教研活动"),
        h(Text, { className: "research-form__hint" }, "草稿仅自己可见，发布后同校区教师可报名。"),
      ),
      h(Text, { className: "research-form__close", onClick: close }, "×"),
    ),
    field(
      "所属校区",
      h(
        Picker,
        {
          mode: "selector",
          range: campuses.map((item) => item.name),
          value: campusIndex,
          disabled: Boolean(editingId),
          onChange: (event) =>
            updateForm("campusId", campuses[Number(event.detail.value)]?.id || ""),
        },
        h(View, { className: "research-picker" }, campuses[campusIndex]?.name || "请选择校区"),
      ),
    ),
    field(
      "活动类型",
      h(
        Picker,
        {
          mode: "selector",
          range: typeOptions.map((item) => item.label),
          value: typeIndex,
          onChange: (event) =>
            updateForm("type", typeOptions[Number(event.detail.value)]?.value),
        },
        h(View, { className: "research-picker" }, typeOptions[typeIndex]?.label),
      ),
    ),
    field(
      "活动主题",
      h(Input, {
        className: "research-input",
        value: form.title,
        maxlength: 100,
        placeholder: "例如：数学作业讲评示范课",
        onInput: (event) => updateForm("title", event.detail.value),
      }),
    ),
    field(
      "活动说明",
      h(Textarea, {
        className: "research-textarea",
        value: form.description,
        maxlength: 2000,
        placeholder: "填写活动目标、内容和准备事项",
        onInput: (event) => updateForm("description", event.detail.value),
      }),
    ),
    field(
      "活动日期",
      h(
        Picker,
        {
          mode: "date",
          value: form.date,
          onChange: (event) => updateForm("date", event.detail.value),
        },
        h(View, { className: "research-picker" }, form.date),
      ),
    ),
    h(
      View,
      { className: "research-form__grid" },
      field(
        "开始时间",
        h(
          Picker,
          {
            mode: "time",
            value: form.startTime,
            onChange: (event) => updateForm("startTime", event.detail.value),
          },
          h(View, { className: "research-picker" }, form.startTime),
        ),
      ),
      field(
        "结束时间",
        h(
          Picker,
          {
            mode: "time",
            value: form.endTime,
            onChange: (event) => updateForm("endTime", event.detail.value),
          },
          h(View, { className: "research-picker" }, form.endTime),
        ),
      ),
    ),
    field(
      "活动地点",
      h(Input, {
        className: "research-input",
        value: form.location,
        maxlength: 120,
        placeholder: "例如：二楼教研室",
        onInput: (event) => updateForm("location", event.detail.value),
      }),
    ),
    h(
      View,
      { className: "research-form__actions" },
      h(Button, { className: "research-button", disabled: saving, loading: saving, onClick: () => save("draft") }, "保存草稿"),
      h(Button, { className: "research-button research-button--primary", disabled: saving, loading: saving, onClick: () => save("open") }, "保存并发布"),
    ),
  );
}

function activityCard(activity, actions) {
  const registered = ["registered", "attended"].includes(
    activity.myParticipationStatus,
  );
  return h(
    View,
    { className: `research-card research-card--${activity.status}`, key: activity.id },
    h(
      View,
      { className: "research-card__top" },
      h(
        View,
        { className: `research-type research-type--${activity.type}` },
        typeLabel(activity.type),
      ),
      h(Text, { className: `research-status research-status--${activity.status}` }, activityStatusLabel(activity.status)),
    ),
    h(Text, { className: "research-card__title" }, activity.title),
    h(Text, { className: "research-card__time" }, formatRange(activity.startAt, activity.endAt)),
    h(Text, { className: "research-card__location" }, `⌖ ${activity.location}`),
    h(
      View,
      { className: "research-card__meta" },
      h(Text, null, `${activity.organizer?.name || "教师"} 发起`),
      h(Text, null, `${activity.participantCount} 人参与`),
      activity.isOrganizer ? h(Text, { className: "research-owner" }, "我发起的") : null,
    ),
    actions.expanded
      ? h(
          View,
          { className: "research-detail" },
          h(Text, { className: "research-detail__label" }, "活动说明"),
          h(Text, { className: "research-detail__content" }, activity.description),
          h(Text, { className: "research-detail__label" }, "参与教师"),
          h(
            Text,
            { className: "research-detail__content" },
            participantNames(activity.participants),
          ),
          h(Text, { className: "research-detail__campus" }, `范围：${activity.campus?.name || "当前校区"}`),
        )
      : h(Text, { className: "research-card__preview" }, activity.description),
    h(
      View,
      { className: "research-card__actions" },
      h(Button, { className: "research-button", size: "mini", onClick: actions.toggle }, actions.expanded ? "收起详情" : "查看详情"),
      activity.isOrganizer && !["completed", "cancelled"].includes(activity.status)
        ? h(Button, { className: "research-button", size: "mini", disabled: actions.busy, onClick: actions.edit }, "编辑")
        : null,
      activity.isOrganizer && activity.status === "draft"
        ? h(Button, { className: "research-button research-button--primary", size: "mini", disabled: actions.busy, loading: actions.busy, onClick: () => actions.updateActivity("open") }, "发布")
        : null,
      activity.isOrganizer && activity.status === "open"
        ? h(Button, { className: "research-button research-button--primary", size: "mini", disabled: actions.busy, loading: actions.busy, onClick: () => actions.updateActivity("completed") }, "结束活动")
        : null,
      activity.isOrganizer && ["draft", "open"].includes(activity.status)
        ? h(Button, { className: "research-button research-button--danger", size: "mini", disabled: actions.busy, onClick: () => actions.updateActivity("cancelled") }, "取消活动")
        : null,
      !activity.isOrganizer && activity.status === "open"
        ? h(Button, { className: `research-button${registered ? "" : " research-button--primary"}`, size: "mini", disabled: actions.busy, loading: actions.busy, onClick: () => actions.updateParticipation(registered ? "cancelled" : "registered") }, registered ? "取消报名" : "报名参加")
        : null,
    ),
  );
}

function field(label, control) {
  return h(View, { className: "research-field" }, h(Text, { className: "research-field__label" }, `${label} *`), control);
}

function metric(value, label) {
  return h(View, { className: "research-summary__item" }, h(Text, { className: "research-summary__value" }, String(value)), h(Text, { className: "research-summary__label" }, label));
}

function tab(key, label, current, onClick) {
  return h(View, { className: `research-scope-tab${current === key ? " research-scope-tab--active" : ""}`, onClick: () => onClick(key) }, label);
}

function typeTab(key, label, current, onClick) {
  return h(View, { className: `research-type-tab${current === key ? " research-type-tab--active" : ""}`, onClick: () => onClick(key) }, label);
}

function typeLabel(type) {
  return typeOptions.find((item) => item.value === type)?.label || type;
}

function activityStatusLabel(status) {
  return { draft: "草稿", open: "报名中", completed: "已结束", cancelled: "已取消" }[status] || status;
}

function activityStatusToast(status) {
  return { open: "活动已发布", completed: "活动已结束", cancelled: "活动已取消" }[status] || "状态已更新";
}

function scopeLabel(scope) {
  return { upcoming: "近期教研", mine: "与我相关", all: "全部活动" }[scope] || "教研活动";
}

function participantNames(participants = []) {
  const names = participants
    .filter((item) => item.status !== "cancelled")
    .map((item) => `${item.teacher?.name || "教师"}${item.status === "attended" ? "（已参加）" : ""}`);
  return names.length ? names.join("、") : "暂无教师报名";
}

function formatRange(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const pad = (value) => String(value).padStart(2, "0");
  return `${start.getMonth() + 1}月${start.getDate()}日 ${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function dateValue(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeValue(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
