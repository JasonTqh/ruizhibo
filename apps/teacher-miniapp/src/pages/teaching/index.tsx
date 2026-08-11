// @ts-nocheck
import React, { useState } from "react";
import {
  Button,
  Image,
  Input,
  Picker,
  Switch,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;

const statusLabels = {
  pending: "待提交",
  submitted: "待批改",
  reviewed: "已批改",
  overdue: "已逾期",
};

export default function TeachingPage() {
  const [activeTab, setActiveTab] = useState("records");
  const [recordMode, setRecordMode] = useState("teaching");
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachingRecords, setTeachingRecords] = useState([]);
  const [growthFeedbacks, setGrowthFeedbacks] = useState([]);
  const [homework, setHomework] = useState([]);
  const [teachingForm, setTeachingForm] = useState({
    classId: "",
    date: todayValue(),
    course: "",
    content: "",
    tags: "",
  });
  const [feedbackForm, setFeedbackForm] = useState({
    classId: "",
    studentId: "",
    title: "",
    content: "",
    visibleToParent: true,
  });
  const [homeworkForm, setHomeworkForm] = useState({
    classId: "",
    title: "",
    subject: "",
    content: "",
    dueDate: "",
    dueTime: "18:00",
  });
  const [remarks, setRemarks] = useState({});
  const [lastFeedback, setLastFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingRecord, setSavingRecord] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextClasses, nextRecords, nextFeedbacks, nextHomework] = await Promise.all([
        teacherRequest("/teacher/classes"),
        teacherRequest("/teacher/teaching-records"),
        teacherRequest("/teacher/growth-records"),
        teacherRequest("/teacher/homework"),
      ]);
      const defaultClassId =
        teachingForm.classId || nextClasses[0]?.id || "";
      const feedbackClassId = feedbackForm.classId || defaultClassId;
      const nextStudents = feedbackClassId
        ? await teacherRequest(`/teacher/classes/${feedbackClassId}/students`)
        : [];

      setClasses(nextClasses);
      setTeachingRecords(nextRecords);
      setGrowthFeedbacks(nextFeedbacks);
      setHomework(nextHomework);
      setStudents(nextStudents);
      setTeachingForm((current) => ({
        ...current,
        classId: current.classId || defaultClassId,
      }));
      setFeedbackForm((current) => ({
        ...current,
        classId: current.classId || feedbackClassId,
        studentId:
          nextStudents.some((item) => item.id === current.studentId)
            ? current.studentId
            : nextStudents[0]?.id || "",
      }));
      setHomeworkForm((current) => ({
        ...current,
        classId: current.classId || defaultClassId,
      }));
    } catch (loadError) {
      setError(errorMessage(loadError, "教学中心加载失败，请确认 API 已启动。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function changeFeedbackClass(classId) {
    setFeedbackForm((current) => ({ ...current, classId, studentId: "" }));
    setStudents([]);
    setError("");
    try {
      const nextStudents = await teacherRequest(
        `/teacher/classes/${classId}/students`,
      );
      setStudents(nextStudents);
      setFeedbackForm((current) => ({
        ...current,
        classId,
        studentId: nextStudents[0]?.id || "",
      }));
    } catch (studentError) {
      setError(errorMessage(studentError, "学生列表加载失败，请重试。"));
    }
  }

  async function saveTeachingRecord() {
    if (savingRecord) return;
    const course = teachingForm.course.trim();
    const content = teachingForm.content.trim();
    if (!teachingForm.classId || !teachingForm.date || !course || !content) {
      Taro.showToast({ title: "请填写班级、日期、课程主题和教学内容", icon: "none" });
      return;
    }

    setSavingRecord(true);
    setError("");
    try {
      await teacherRequest("/teacher/teaching-records", {
        method: "POST",
        data: {
          classId: teachingForm.classId,
          date: new Date(`${teachingForm.date}T12:00:00`).toISOString(),
          course,
          content,
          tags: splitTags(teachingForm.tags),
        },
      });
      setTeachingForm((current) => ({
        ...current,
        course: "",
        content: "",
        tags: "",
      }));
      await load(false);
      Taro.showToast({ title: "教学记录已保存", icon: "success" });
    } catch (saveError) {
      setError(errorMessage(saveError, "教学记录保存失败，请重试。"));
    } finally {
      setSavingRecord(false);
    }
  }

  async function saveGrowthFeedback() {
    if (savingFeedback) return;
    const title = feedbackForm.title.trim();
    const content = feedbackForm.content.trim();
    if (!feedbackForm.classId || !feedbackForm.studentId || !title || !content) {
      Taro.showToast({ title: "请选择学生并填写反馈标题和内容", icon: "none" });
      return;
    }

    setSavingFeedback(true);
    setError("");
    try {
      await teacherRequest(
        `/teacher/students/${feedbackForm.studentId}/growth-records`,
        {
          method: "POST",
          data: {
            title,
            content,
            visibleToParent: feedbackForm.visibleToParent,
          },
        },
      );
      const student = students.find((item) => item.id === feedbackForm.studentId);
      setLastFeedback({
        studentName: student?.name || "学生",
        title,
        visibleToParent: feedbackForm.visibleToParent,
      });
      setFeedbackForm((current) => ({
        ...current,
        title: "",
        content: "",
      }));
      await load(false);
      Taro.showToast({ title: "成长反馈已发布", icon: "success" });
    } catch (saveError) {
      setError(errorMessage(saveError, "成长反馈发布失败，请重试。"));
    } finally {
      setSavingFeedback(false);
    }
  }

  async function publishHomework() {
    if (publishing) return;
    const title = homeworkForm.title.trim();
    const subject = homeworkForm.subject.trim();
    const content = homeworkForm.content.trim();
    if (!homeworkForm.classId || !title || !subject || !content) {
      Taro.showToast({
        title: "请填写班级、标题、科目和作业要求",
        icon: "none",
      });
      return;
    }

    setPublishing(true);
    setError("");
    try {
      const data = {
        classId: homeworkForm.classId,
        title,
        subject,
        content,
      };
      if (homeworkForm.dueDate) {
        data.dueAt = new Date(
          `${homeworkForm.dueDate}T${homeworkForm.dueTime || "18:00"}:00`,
        ).toISOString();
      }
      await teacherRequest("/teacher/homework", { method: "POST", data });
      setHomeworkForm((current) => ({
        ...current,
        title: "",
        subject: "",
        content: "",
        dueDate: "",
      }));
      await load(false);
      Taro.showToast({ title: "作业已发布", icon: "success" });
    } catch (publishError) {
      setError(errorMessage(publishError, "作业发布失败，请重试。"));
    } finally {
      setPublishing(false);
    }
  }

  async function reviewSubmission(submission) {
    if (reviewingId) return;
    setReviewingId(submission.id);
    setError("");
    try {
      await teacherRequest(`/teacher/homework-submissions/${submission.id}`, {
        method: "PATCH",
        data: {
          status: "reviewed",
          remark: (remarks[submission.id] || "").trim(),
        },
      });
      await load(false);
      Taro.showToast({ title: "批改完成", icon: "success" });
    } catch (reviewError) {
      setError(errorMessage(reviewError, "批改失败，请刷新后重试。"));
    } finally {
      setReviewingId("");
    }
  }

  useDidShow(() => {
    load();
  });

  const pendingReviewCount = homework.reduce(
    (sum, assignment) =>
      sum + assignment.submissions.filter((item) => item.status === "submitted").length,
    0,
  );

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
    error
      ? h(
          View,
          { className: "teaching-error" },
          h(Text, null, error),
          h(Text, { className: "teaching-error__retry", onClick: () => load() }, "重试"),
        )
      : null,
    h(
      View,
      { className: "teaching-tabs" },
      topTab("records", "教学记录", `${teachingRecords.length} 条`, activeTab, setActiveTab),
      topTab("homework", "作业管理", `${pendingReviewCount} 份待批`, activeTab, setActiveTab),
    ),
    activeTab === "records"
      ? renderRecordCenter({
          recordMode,
          setRecordMode,
          classes,
          students,
          teachingRecords,
          growthFeedbacks,
          teachingForm,
          setTeachingForm,
          feedbackForm,
          setFeedbackForm,
          changeFeedbackClass,
          saveTeachingRecord,
          saveGrowthFeedback,
          savingRecord,
          savingFeedback,
          loading,
          lastFeedback,
        })
      : renderHomeworkCenter({
          classes,
          homework,
          homeworkForm,
          setHomeworkForm,
          remarks,
          setRemarks,
          loading,
          publishing,
          reviewingId,
          publishHomework,
          reviewSubmission,
        }),
  );
}

function renderRecordCenter(props) {
  const {
    recordMode,
    setRecordMode,
    classes,
    students,
    teachingRecords,
    growthFeedbacks,
    teachingForm,
    setTeachingForm,
    feedbackForm,
    setFeedbackForm,
    changeFeedbackClass,
    saveTeachingRecord,
    saveGrowthFeedback,
    savingRecord,
    savingFeedback,
    loading,
    lastFeedback,
  } = props;
  const teachingClassIndex = selectedIndex(classes, teachingForm.classId);
  const feedbackClassIndex = selectedIndex(classes, feedbackForm.classId);
  const studentIndex = selectedIndex(students, feedbackForm.studentId);

  return h(
    View,
    null,
    h(
      View,
      { className: "record-mode-switch" },
      modeTab("teaching", "班级教学记录", recordMode, setRecordMode),
      modeTab("feedback", "学生成长反馈", recordMode, setRecordMode),
    ),
    recordMode === "teaching"
      ? h(
          React.Fragment,
          null,
          h(
            View,
            { className: "teaching-card teaching-form-card" },
            cardHeading("新建教学记录", "记录当天课程内容与课堂情况"),
            pickerField(
              "班级 *",
              classes,
              teachingClassIndex,
              classes[teachingClassIndex]?.name || "暂无可用班级",
              (item) => setTeachingForm((current) => ({ ...current, classId: item.id })),
            ),
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
                    setTeachingForm((current) => ({ ...current, date: event.detail.value })),
                },
                h(View, { className: "picker-field" }, teachingForm.date),
              ),
            ),
            formInput("课程主题 *", teachingForm.course, "例如：绘本精读《好饿的毛毛虫》", (value) =>
              setTeachingForm((current) => ({ ...current, course: value })),
            ),
            textareaField("教学内容 *", teachingForm.content, "记录教学过程、课堂表现和需要跟进的事项", (value) =>
              setTeachingForm((current) => ({ ...current, content: value })),
            ),
            formInput("标签（可选）", teachingForm.tags, "使用逗号分隔，例如：阅读,表达", (value) =>
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
              savingRecord ? "保存中…" : "保存教学记录",
            ),
          ),
          h(
            View,
            { className: "teaching-card record-list-card" },
            cardHeading("历史教学记录", teachingRecords.length ? `共 ${teachingRecords.length} 条` : "暂无记录"),
            loading
              ? h(Text, { className: "teaching-empty" }, "正在加载教学记录…")
              : teachingRecords.length
                ? teachingRecords.map((record) => renderTeachingRecord(record))
                : h(Text, { className: "teaching-empty" }, "保存第一条教学记录后会显示在这里"),
          ),
        )
      : h(
          React.Fragment,
          null,
          h(
            View,
            { className: "teaching-card feedback-card" },
            cardHeading("发布成长反馈", "反馈可选择是否同步给家长"),
            pickerField(
              "班级 *",
              classes,
              feedbackClassIndex,
              classes[feedbackClassIndex]?.name || "暂无可用班级",
              (item) => changeFeedbackClass(item.id),
            ),
            pickerField(
              "学生 *",
              students,
              studentIndex,
              students[studentIndex]?.name || "该班级暂无学生",
              (item) => setFeedbackForm((current) => ({ ...current, studentId: item.id })),
            ),
            formInput("反馈标题 *", feedbackForm.title, "例如：今天主动帮助了同学", (value) =>
              setFeedbackForm((current) => ({ ...current, title: value })),
            ),
            textareaField("反馈内容 *", feedbackForm.content, "具体描述孩子的表现、进步和建议", (value) =>
              setFeedbackForm((current) => ({ ...current, content: value })),
            ),
            h(
              View,
              { className: "visibility-row" },
              h(
                View,
                { className: "visibility-row__main" },
                h(Text, { className: "visibility-row__title" }, "同步给家长"),
                h(
                  Text,
                  { className: "visibility-row__hint" },
                  feedbackForm.visibleToParent
                    ? "发布后将出现在家长端成长时间线"
                    : "仅当前教师和管理人员可见",
                ),
              ),
              h(Switch, {
                checked: feedbackForm.visibleToParent,
                color: "#2f8064",
                onChange: (event) =>
                  setFeedbackForm((current) => ({
                    ...current,
                    visibleToParent: event.detail.value,
                  })),
              }),
            ),
            lastFeedback
              ? h(
                  View,
                  { className: "feedback-success" },
                  h(Text, { className: "feedback-success__title" }, `已发布：${lastFeedback.studentName}`),
                  h(Text, { className: "feedback-success__content" }, lastFeedback.title),
                  h(
                    Text,
                    { className: "feedback-success__status" },
                    lastFeedback.visibleToParent ? "家长可见" : "仅内部可见",
                  ),
                )
              : null,
            h(
              Button,
              {
                className: "teaching-primary-button",
                loading: savingFeedback,
                disabled: loading || savingFeedback || students.length === 0,
                onClick: saveGrowthFeedback,
              },
              savingFeedback ? "发布中…" : "发布成长反馈",
            ),
          ),
          h(
            View,
            { className: "teaching-card feedback-history-card" },
            cardHeading(
              "历史成长反馈",
              growthFeedbacks.length ? `共 ${growthFeedbacks.length} 条` : "暂无反馈",
            ),
            loading
              ? h(Text, { className: "teaching-empty" }, "正在加载成长反馈…")
              : growthFeedbacks.length
                ? growthFeedbacks.map((record) => renderGrowthFeedback(record))
                : h(Text, { className: "teaching-empty" }, "发布第一条成长反馈后会显示在这里"),
          ),
        ),
  );
}

function renderHomeworkCenter(props) {
  const {
    classes,
    homework,
    homeworkForm,
    setHomeworkForm,
    remarks,
    setRemarks,
    loading,
    publishing,
    reviewingId,
    publishHomework,
    reviewSubmission,
  } = props;
  const classIndex = selectedIndex(classes, homeworkForm.classId);

  return h(
    View,
    null,
    h(
      View,
      { className: "teaching-card teaching-form-card" },
      cardHeading("发布作业", "发布后会自动为班级学生创建提交任务"),
      pickerField(
        "班级 *",
        classes,
        classIndex,
        classes[classIndex]?.name || "暂无可用班级",
        (item) => setHomeworkForm((current) => ({ ...current, classId: item.id })),
      ),
      formInput("作业标题 *", homeworkForm.title, "例如：认识春天", (value) =>
        setHomeworkForm((current) => ({ ...current, title: value })),
      ),
      formInput("科目 *", homeworkForm.subject, "例如：语言", (value) =>
        setHomeworkForm((current) => ({ ...current, subject: value })),
      ),
      textareaField("作业要求 *", homeworkForm.content, "请清晰描述任务和提交要求", (value) =>
        setHomeworkForm((current) => ({ ...current, content: value })),
      ),
      h(
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
              value: homeworkForm.dueDate,
              onChange: (event) =>
                setHomeworkForm((current) => ({ ...current, dueDate: event.detail.value })),
            },
            h(
              View,
              { className: `picker-field${homeworkForm.dueDate ? "" : " picker-field-placeholder"}` },
              homeworkForm.dueDate || "选择日期",
            ),
          ),
          h(
            Picker,
            {
              mode: "time",
              value: homeworkForm.dueTime,
              onChange: (event) =>
                setHomeworkForm((current) => ({ ...current, dueTime: event.detail.value })),
            },
            h(View, { className: "picker-field" }, homeworkForm.dueTime),
          ),
        ),
      ),
      h(
        Button,
        {
          className: "teaching-primary-button",
          loading: publishing,
          disabled: loading || publishing || classes.length === 0,
          onClick: publishHomework,
        },
        publishing ? "发布中…" : "发布给全班",
      ),
    ),
    h(
      View,
      { className: "teaching-card homework-list-card" },
      cardHeading("作业与批改", homework.length ? `共 ${homework.length} 份作业` : "暂无作业"),
      loading
        ? h(Text, { className: "teaching-empty" }, "正在加载作业…")
        : homework.length === 0
          ? h(Text, { className: "teaching-empty" }, "尚未发布作业")
          : homework.map((assignment) =>
              h(
                View,
                { className: "homework-card", key: assignment.id },
                h(
                  View,
                  { className: "homework-heading" },
                  h(
                    View,
                    { className: "homework-heading-main" },
                    h(Text, { className: "subtitle" }, assignment.title),
                    h(Text, { className: "muted" }, `${assignment.class.name} · ${assignment.subject}`),
                  ),
                  h(
                    Text,
                    { className: "homework-count" },
                    `待批 ${assignment.submissions.filter((item) => item.status === "submitted").length}`,
                  ),
                ),
                h(Text, { className: "homework-content" }, assignment.content),
                assignment.dueAt
                  ? h(Text, { className: "notice-meta" }, `截止：${formatDate(assignment.dueAt)}`)
                  : null,
                assignment.submissions.map((submission) =>
                  renderSubmission(
                    submission,
                    remarks,
                    setRemarks,
                    reviewingId,
                    reviewSubmission,
                  ),
                ),
              ),
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

function modeTab(key, title, activeMode, setActiveMode) {
  return h(
    View,
    {
      className: `record-mode-tab${activeMode === key ? " record-mode-tab--active" : ""}`,
      onClick: () => setActiveMode(key),
    },
    h(Text, null, title),
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
        { className: `picker-field${items.length ? "" : " picker-field-placeholder"}` },
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
        h(Text, { className: "teaching-record__meta" }, `${record.class.name} · ${formatDay(record.date)}`),
      ),
      h(Text, { className: "teaching-record__badge" }, "教学记录"),
    ),
    h(Text, { className: "teaching-record__content" }, record.content),
    record.tags?.length
      ? h(
          View,
          { className: "teaching-record__tags" },
          ...record.tags.map((tag) =>
            h(Text, { className: "teaching-record__tag", key: tag }, tag),
          ),
        )
      : null,
  );
}

function renderGrowthFeedback(record) {
  return h(
    View,
    { className: "growth-feedback-record", key: record.id },
    h(
      View,
      { className: "growth-feedback-record__heading" },
      h(
        View,
        { className: "growth-feedback-record__heading-main" },
        h(Text, { className: "growth-feedback-record__title" }, record.title),
        h(
          Text,
          { className: "growth-feedback-record__meta" },
          `${record.student.name} · ${record.student.class.name} · ${formatDate(record.happenedAt)}`,
        ),
      ),
      h(
        Text,
        {
          className: `growth-feedback-record__visibility${record.visibleToParent ? " growth-feedback-record__visibility--parent" : " growth-feedback-record__visibility--internal"}`,
        },
        record.visibleToParent ? "家长可见" : "仅内部可见",
      ),
    ),
    h(Text, { className: "growth-feedback-record__content" }, record.content),
  );
}

function renderSubmission(
  submission,
  remarks,
  setRemarks,
  reviewingId,
  reviewSubmission,
) {
  const canReview = submission.status === "submitted";
  return h(
    View,
    { className: "submission-card", key: submission.id },
    h(
      View,
      { className: "submission-heading" },
      h(Text, { className: "submission-name" }, submission.student.name),
      h(
        Text,
        { className: `homework-status homework-status-${submission.status}` },
        statusLabels[submission.status] || submission.status,
      ),
    ),
    submission.submittedAt
      ? h(Text, { className: "notice-meta" }, `提交：${formatDate(submission.submittedAt)}`)
      : null,
    submission.content
      ? h(Text, { className: "submission-content" }, submission.content)
      : null,
    submission.fileUrls?.length
      ? h(
          View,
          { className: "homework-images" },
          submission.fileUrls.map((url) => {
            const imageUrl = absoluteUrl(url);
            return h(Image, {
              className: "homework-image",
              key: url,
              src: imageUrl,
              mode: "aspectFill",
              onClick: () =>
                Taro.previewImage({
                  current: imageUrl,
                  urls: submission.fileUrls.map(absoluteUrl),
                }),
            });
          }),
        )
      : null,
    canReview
      ? h(
          View,
          { className: "review-box" },
          h(Textarea, {
            className: "form-textarea review-textarea",
            value: remarks[submission.id] || "",
            maxlength: 500,
            placeholder: "填写批语（可选）",
            onInput: (event) =>
              setRemarks((current) => ({
                ...current,
                [submission.id]: event.detail.value,
              })),
          }),
          h(
            Button,
            {
              className: "teaching-primary-button review-button",
              loading: reviewingId === submission.id,
              disabled: Boolean(reviewingId),
              onClick: () => reviewSubmission(submission),
            },
            "完成批改",
          ),
        )
      : submission.status === "reviewed"
        ? h(
            View,
            { className: "review-result" },
            h(Text, { className: "submission-content" }, submission.remark || "已批改，无补充批语。"),
            h(Text, { className: "notice-meta" }, `批改：${formatDate(submission.reviewedAt)}`),
          )
        : h(Text, { className: "muted submission-waiting" }, "等待家长提交"),
  );
}

function selectedIndex(items, id) {
  return Math.max(0, items.findIndex((item) => item.id === id));
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

function absoluteUrl(url) {
  return resolveApiAssetUrl(url);
}

function formatDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "--";
  const pad = (part) => String(part).padStart(2, "0");
  return `${formatDay(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
