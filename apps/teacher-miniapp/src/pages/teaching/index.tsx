// @ts-nocheck
import React, { useRef, useState } from "react";
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
import LessonPage from "../lesson/index";
import SupervisionPanel from "./supervision";
import {
  lessonTag,
  pendingLessons,
  recordFromLesson,
  visibleTags,
} from "../../teaching-workflow";
import "./index.scss";

const h = React.createElement;

export default function TeachingPage() {
  const [viewScope, setViewScope] = useState("mine");
  const [supervision, setSupervision] = useState(null);
  const [supervisionRefresh, setSupervisionRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState("records");
  const [classes, setClasses] = useState([]);
  const [teachingRecords, setTeachingRecords] = useState([]);
  const [lessonPlans, setLessonPlans] = useState([]);
  const [sourcePlan, setSourcePlan] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  const saveLock = useRef(false);
  const [teachingForm, setTeachingForm] = useState({
    classId: "",
    date: todayValue(),
    course: "",
    content: "",
    tags: "",
  });
  const [loading, setLoading] = useState(true);
  const [savingRecord, setSavingRecord] = useState(false);
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextClasses, nextRecords, nextPlans, nextSupervision] =
        await Promise.all([
          teacherRequest("/teacher/classes"),
          teacherRequest("/teacher/teaching-records"),
          teacherRequest("/teacher/lesson-plans?scope=all"),
          teacherRequest("/teacher/supervision/context"),
        ]);
      const defaultClassId = teachingForm.classId || nextClasses[0]?.id || "";
      setSupervision(nextSupervision);
      setClasses(nextClasses);
      setTeachingRecords(nextRecords);
      setLessonPlans(nextPlans);
      setTeachingForm((current) => ({
        ...current,
        classId: current.classId || defaultClassId,
      }));
    } catch (loadError) {
      setError(
        errorMessage(loadError, "教学中心加载失败，请确认 API 已启动。"),
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function saveTeachingRecord() {
    if (saveLock.current) return;
    const course = teachingForm.course.trim();
    const content = teachingForm.content.trim();
    if (!teachingForm.classId || !teachingForm.date || !course || !content) {
      Taro.showToast({
        title: "请填写班级、日期、课程主题和教学内容",
        icon: "none",
      });
      return;
    }

    saveLock.current = true;
    setSavingRecord(true);
    setError("");
    try {
      if (sourcePlan) {
        const currentRecords = await teacherRequest(
          "/teacher/teaching-records",
        );
        if (
          currentRecords.some((record) =>
            record.tags?.includes(lessonTag(sourcePlan.id)),
          )
        ) {
          Taro.showToast({ title: "该教案已补齐，请刷新查看", icon: "none" });
          await load(false);
          return;
        }
      }
      await teacherRequest("/teacher/teaching-records", {
        method: "POST",
        data: {
          classId: teachingForm.classId,
          date: new Date(`${teachingForm.date}T12:00:00`).toISOString(),
          course,
          content: sourcePlan
            ? `【备课目标】\n${sourcePlan.objectives}\n\n【备课内容】\n${sourcePlan.content}\n\n【课后教学记录】\n${content}`
            : content,
          tags: [
            ...splitTags(teachingForm.tags),
            ...(sourcePlan ? [lessonTag(sourcePlan.id)] : []),
          ],
        },
      });
      setTeachingForm((current) => ({
        ...current,
        course: "",
        content: "",
        tags: "",
      }));
      setSourcePlan(null);
      setFormVisible(false);
      await load(false);
      Taro.showToast({ title: "教学记录已保存", icon: "success" });
    } catch (saveError) {
      setError(errorMessage(saveError, "教学记录保存失败，请重试。"));
    } finally {
      saveLock.current = false;
      setSavingRecord(false);
    }
  }

  function completeLesson(plan) {
    if (saveLock.current) return;
    if (sourcePlan?.id === plan.id) {
      Taro.pageScrollTo({ scrollTop: 0, duration: 160 });
      return;
    }
    if (teachingForm.content.trim()) {
      Taro.showToast({ title: "请先保存或取消当前课后记录", icon: "none" });
      return;
    }
    setSourcePlan(plan);
    setFormVisible(true);
    setTeachingForm(recordFromLesson(plan));
    Taro.pageScrollTo({ scrollTop: 0, duration: 160 });
  }

  function selectTab(tab) {
    if (saveLock.current) return;
    setActiveTab(tab);
    if (tab === "records") load(false);
  }

  useDidShow(() => {
    setSupervisionRefresh((value) => value + 1);
    load();
  });

  const scopeSwitch = supervision?.isSupervisor
    ? h(
        View,
        { className: "supervision-scope" },
        ...[
          ["mine", "我的教学"],
          ["campus", "校区教学"],
        ].map(([key, label]) =>
          h(
            Button,
            {
              key,
              className: viewScope === key ? "supervision-scope-active" : "",
              disabled: savingRecord,
              onClick: () => {
                setViewScope(key);
                if (key === "mine") load(false);
              },
            },
            label,
          ),
        ),
      )
    : null;
  const showCampus = viewScope === "campus" && supervision?.isSupervisor;

  const pendingPlans = pendingLessons(lessonPlans, teachingRecords);

  return h(
    View,
    { className: "teaching-page" },
    h(
      View,
      { className: "teaching-header" },
      h(
        View,
        null,
        h(Text, { className: "teaching-header__eyebrow" }, "教师工作"),
        h(Text, { className: "teaching-header__title" }, "教学中心"),
      ),
      h(
        View,
        { className: "teaching-refresh", onClick: () => load() },
        h(Text, null, loading ? "加载中" : "↻ 刷新"),
      ),
    ),
    scopeSwitch,
    showCampus
      ? h(SupervisionPanel, {
          onContext: setSupervision,
          refreshKey: supervisionRefresh,
        })
      : null,
    h(
      View,
      { style: { display: showCampus ? "none" : "block" } },
      error
        ? h(
            View,
            { className: "teaching-error" },
            h(Text, null, error),
            h(
              Text,
              { className: "teaching-error__retry", onClick: () => load() },
              "重试",
            ),
          )
        : null,
      h(
        View,
        { className: "teaching-tabs" },
        topTab("lesson", "备课计划", "准备课程", activeTab, selectTab),
        topTab(
          "records",
          "教学记录",
          `${pendingPlans.length} 条待补齐`,
          activeTab,
          selectTab,
        ),
      ),
      activeTab === "records"
        ? renderRecordCenter({
            pendingPlans,
            sourcePlan,
            formVisible,
            openForm: () => setFormVisible(true),
            completeLesson,
            cancelLesson: () => {
              setSourcePlan(null);
              setFormVisible(false);
              setTeachingForm((current) => ({
                ...current,
                course: "",
                content: "",
                tags: "",
              }));
            },
            classes,
            teachingRecords,
            teachingForm,
            setTeachingForm,
            saveTeachingRecord,
            savingRecord,
            loading,
          })
        : null,
      h(
        View,
        { style: { display: activeTab === "lesson" ? "block" : "none" } },
        h(LessonPage, { embedded: true }),
      ),
    ),
  );
}

function renderRecordCenter(props) {
  const {
    pendingPlans,
    sourcePlan,
    formVisible,
    openForm,
    completeLesson,
    cancelLesson,
    classes,
    teachingRecords,
    teachingForm,
    setTeachingForm,
    saveTeachingRecord,
    savingRecord,
    loading,
  } = props;
  const teachingClassIndex = selectedIndex(classes, teachingForm.classId);

  return h(
    React.Fragment,
    null,
    !formVisible
      ? h(
          Button,
          { className: "teaching-primary-button", onClick: openForm },
          "+ 新建教学记录",
        )
      : null,
    formVisible
      ? h(
          View,
          { className: "teaching-card teaching-form-card" },
          cardHeading(
            sourcePlan ? "补齐课后教学记录" : "新建教学记录",
            sourcePlan
              ? "备课信息已带入，请在授课结束后填写实际课堂情况"
              : "可从下方待补齐列表选择教案，也可直接记录课程",
          ),
          sourcePlan
            ? h(
                View,
                { className: "lesson-source" },
                h(
                  Text,
                  { className: "lesson-source__title" },
                  `${sourcePlan.class?.name || "班级"} · ${sourcePlan.theme}`,
                ),
                h(Text, null, `教学目标：${sourcePlan.objectives}`),
                h(
                  Text,
                  { className: "lesson-source__content" },
                  `备课内容：${sourcePlan.content}`,
                ),
                h(
                  Button,
                  {
                    size: "mini",
                    disabled: savingRecord,
                    onClick: cancelLesson,
                  },
                  "取消补齐",
                ),
              )
            : null,
          !sourcePlan
            ? pickerField(
                "班级 *",
                classes,
                teachingClassIndex,
                classes[teachingClassIndex]?.name || "暂无可用班级",
                (item) =>
                  setTeachingForm((current) => ({
                    ...current,
                    classId: item.id,
                  })),
              )
            : null,
          h(
            View,
            { className: "form-field" },
            h(Text, { className: "field-label" }, "日期 *"),
            h(
              Picker,
              {
                mode: "date",
                value: teachingForm.date,
                onChange: (event) =>
                  setTeachingForm((current) => ({
                    ...current,
                    date: event.detail.value,
                  })),
              },
              h(View, { className: "picker-field" }, teachingForm.date),
            ),
          ),
          formInput(
            "课程主题 *",
            teachingForm.course,
            "例如：绘本精读《好饿的毛毛虫》",
            (value) =>
              setTeachingForm((current) => ({
                ...current,
                course: value,
              })),
          ),
          textareaField(
            sourcePlan ? "实际课堂情况与课后反思 *" : "教学内容 *",
            teachingForm.content,
            "填写实际完成内容、学生表现、教学效果和后续跟进事项",
            (value) =>
              setTeachingForm((current) => ({
                ...current,
                content: value,
              })),
          ),
          formInput(
            "标签（可选）",
            teachingForm.tags,
            "使用逗号分隔，例如：阅读,表达",
            (value) =>
              setTeachingForm((current) => ({ ...current, tags: value })),
          ),
          h(
            Button,
            {
              className: "teaching-primary-button",
              loading: savingRecord,
              disabled: loading || savingRecord || classes.length === 0,
              onClick: saveTeachingRecord,
            },
            savingRecord
              ? "保存中…"
              : sourcePlan
                ? "确认授课结束并保存"
                : "保存教学记录",
          ),
        )
      : null,
    h(
      View,
      { className: "teaching-card" },
      cardHeading("待课后补齐", "已发布教案自动同步，授课后补充实际情况"),
      loading
        ? h(Text, { className: "teaching-empty" }, "正在同步教案…")
        : pendingPlans.length
          ? pendingPlans.map((plan) =>
              h(
                View,
                { className: "pending-lesson", key: plan.id },
                h(Text, { className: "teaching-record__course" }, plan.theme),
                h(
                  Text,
                  { className: "teaching-record__meta" },
                  `${plan.class?.name || "班级"} · ${formatDay(plan.lessonDate)} · ${plan.durationMinutes} 分钟`,
                ),
                h(
                  Text,
                  { className: "pending-lesson__status" },
                  "待授课 / 待补齐",
                ),
                h(
                  Button,
                  {
                    className: "teaching-primary-button",
                    size: "mini",
                    disabled: savingRecord,
                    onClick: () => completeLesson(plan),
                  },
                  "授课后补齐记录",
                ),
              ),
            )
          : h(
              Text,
              { className: "teaching-empty" },
              "暂无待补齐记录，发布备课计划后会自动显示在这里",
            ),
    ),
    h(
      View,
      { className: "teaching-card record-list-card" },
      cardHeading(
        "历史教学记录",
        teachingRecords.length ? `共 ${teachingRecords.length} 条` : "暂无记录",
      ),
      loading
        ? h(Text, { className: "teaching-empty" }, "正在加载教学记录…")
        : teachingRecords.length
          ? teachingRecords.map((record) => renderTeachingRecord(record))
          : h(
              Text,
              { className: "teaching-empty" },
              "保存第一条教学记录后会显示在这里",
            ),
    ),
  );
}

function topTab(key, title, meta, activeTab, setActiveTab) {
  return h(
    View,
    {
      className: `teaching-tab${activeTab === key ? " teaching-tab--active" : ""}`,
      onClick: () => setActiveTab(key),
    },
    h(Text, { className: "teaching-tab__title" }, title),
    h(Text, { className: "teaching-tab__meta" }, meta),
  );
}

function cardHeading(title, hint) {
  return h(
    View,
    { className: "teaching-card-heading" },
    h(Text, { className: "teaching-card-heading__title" }, title),
    h(Text, { className: "teaching-card-heading__hint" }, hint),
  );
}

function pickerField(label, items, index, display, onSelect) {
  return h(
    View,
    { className: "form-field" },
    h(Text, { className: "field-label" }, label),
    h(
      Picker,
      {
        range: items.map((item) => item.name),
        value: index,
        disabled: items.length === 0,
        onChange: (event) => {
          const item = items[Number(event.detail.value)];
          if (item) onSelect(item);
        },
      },
      h(
        View,
        {
          className: `picker-field${items.length ? "" : " picker-field-placeholder"}`,
        },
        display,
      ),
    ),
  );
}

function formInput(label, value, placeholder, onChange) {
  return h(
    View,
    { className: "form-field" },
    h(Text, { className: "field-label" }, label),
    h(Input, {
      className: "form-input",
      value,
      placeholder,
      onInput: (event) => onChange(event.detail.value),
    }),
  );
}

function textareaField(label, value, placeholder, onChange) {
  return h(
    View,
    { className: "form-field" },
    h(Text, { className: "field-label" }, label),
    h(Textarea, {
      className: "form-textarea",
      value,
      maxlength: 1000,
      placeholder,
      onInput: (event) => onChange(event.detail.value),
    }),
  );
}

function renderTeachingRecord(record) {
  return h(
    View,
    { className: "teaching-record", key: record.id },
    h(
      View,
      { className: "teaching-record__heading" },
      h(
        View,
        { className: "teaching-record__heading-main" },
        h(Text, { className: "teaching-record__course" }, record.course),
        h(
          Text,
          { className: "teaching-record__meta" },
          `${record.class.name} · ${formatDay(record.date)}`,
        ),
      ),
      h(Text, { className: "teaching-record__badge" }, "已完成"),
    ),
    h(Text, { className: "teaching-record__content" }, record.content),
    visibleTags(record.tags).length
      ? h(
          View,
          { className: "teaching-record__tags" },
          ...visibleTags(record.tags).map((tag) =>
            h(Text, { className: "teaching-record__tag", key: tag }, tag),
          ),
        )
      : null,
  );
}

function selectedIndex(items, id) {
  return Math.max(
    0,
    items.findIndex((item) => item.id === id),
  );
}

function splitTags(value) {
  return Array.from(
    new Set(
      value
        .split(/[,，、]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
}

function todayValue() {
  const date = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
