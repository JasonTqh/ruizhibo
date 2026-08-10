// @ts-nocheck
import React, { useEffect, useState } from "react";
import {
  Button,
  Image,
  Input,
  Picker,
  Text,
  Textarea,
  View,
} from "@tarojs/components";
import Taro from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const API_ORIGIN = "http://localhost:3000";

const statusLabels = {
  pending: "待提交",
  submitted: "待批改",
  reviewed: "已批改",
  overdue: "已逾期",
};

export default function TeachingPage() {
  const [classes, setClasses] = useState([]);
  const [homework, setHomework] = useState([]);
  const [form, setForm] = useState({
    classId: "",
    title: "",
    subject: "",
    content: "",
    dueDate: "",
    dueTime: "18:00",
  });
  const [remarks, setRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextClasses, nextHomework] = await Promise.all([
        teacherRequest("/teacher/classes"),
        teacherRequest("/teacher/homework"),
      ]);
      setClasses(nextClasses);
      setHomework(nextHomework);
      setForm((current) => ({
        ...current,
        classId: current.classId || (nextClasses[0] && nextClasses[0].id) || "",
      }));
    } catch (loadError) {
      setError(
        errorMessage(loadError, "作业数据加载失败，请确认 API 已启动。"),
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function publishHomework() {
    const title = form.title.trim();
    const subject = form.subject.trim();
    const content = form.content.trim();
    if (!form.classId || !title || !subject || !content) {
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
        classId: form.classId,
        title,
        subject,
        content,
      };
      if (form.dueDate) {
        data.dueAt = new Date(
          `${form.dueDate}T${form.dueTime || "18:00"}:00`,
        ).toISOString();
      }
      await teacherRequest("/teacher/homework", { method: "POST", data });
      setForm((current) => ({
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

  useEffect(() => {
    load();
  }, []);

  const classIndex = Math.max(
    0,
    classes.findIndex((item) => item.id === form.classId),
  );

  return h(
    View,
    { className: "page" },
    error ? h(Text, { className: "error-text" }, error) : null,
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "发布作业"),
      h(
        View,
        { className: "form-field" },
        h(Text, { className: "field-label" }, "班级 *"),
        h(
          Picker,
          {
            range: classes.map((item) => item.name),
            value: classIndex,
            disabled: classes.length === 0,
            onChange: (event) => {
              const nextClass = classes[Number(event.detail.value)];
              if (nextClass) {
                setForm((current) => ({ ...current, classId: nextClass.id }));
              }
            },
          },
          h(
            View,
            {
              className: `picker-field${classes.length ? "" : " picker-field-placeholder"}`,
            },
            classes[classIndex] ? classes[classIndex].name : "暂无可用班级",
          ),
        ),
      ),
      formInput("作业标题 *", form.title, "例如：认识春天", (value) =>
        setForm((current) => ({ ...current, title: value })),
      ),
      formInput("科目 *", form.subject, "例如：语言", (value) =>
        setForm((current) => ({ ...current, subject: value })),
      ),
      h(
        View,
        { className: "form-field" },
        h(Text, { className: "field-label" }, "作业要求 *"),
        h(Textarea, {
          className: "form-textarea",
          value: form.content,
          maxlength: 1000,
          placeholder: "请清晰描述任务和提交要求",
          onInput: (event) =>
            setForm((current) => ({
              ...current,
              content: event.detail.value,
            })),
        }),
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
              value: form.dueDate,
              onChange: (event) =>
                setForm((current) => ({
                  ...current,
                  dueDate: event.detail.value,
                })),
            },
            h(
              View,
              {
                className: `picker-field${form.dueDate ? "" : " picker-field-placeholder"}`,
              },
              form.dueDate || "选择日期",
            ),
          ),
          h(
            Picker,
            {
              mode: "time",
              value: form.dueTime,
              onChange: (event) =>
                setForm((current) => ({
                  ...current,
                  dueTime: event.detail.value,
                })),
            },
            h(View, { className: "picker-field" }, form.dueTime),
          ),
        ),
      ),
      h(
        Button,
        {
          className: "primary-button homework-submit-button",
          loading: publishing,
          disabled: publishing || classes.length === 0,
          onClick: publishHomework,
        },
        publishing ? "发布中…" : "发布给全班",
      ),
    ),
    h(
      View,
      { className: "card homework-list-card" },
      h(
        View,
        { className: "page-heading" },
        h(Text, { className: "title page-heading__title" }, "作业与批改"),
        h(
          Button,
          {
            className: "secondary-button",
            size: "mini",
            loading,
            disabled: loading,
            onClick: () => load(),
          },
          "刷新",
        ),
      ),
      loading
        ? h(Text, { className: "empty-state" }, "正在加载作业…")
        : homework.length === 0
          ? h(Text, { className: "empty-state" }, "尚未发布作业")
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
                    h(
                      Text,
                      { className: "muted" },
                      `${assignment.class.name} · ${assignment.subject}`,
                    ),
                  ),
                  h(
                    Text,
                    { className: "homework-count" },
                    `待批 ${assignment.submissions.filter((item) => item.status === "submitted").length}`,
                  ),
                ),
                h(Text, { className: "homework-content" }, assignment.content),
                assignment.dueAt
                  ? h(
                      Text,
                      { className: "notice-meta" },
                      `截止：${formatDate(assignment.dueAt)}`,
                    )
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
      ? h(
          Text,
          { className: "notice-meta" },
          `提交：${formatDate(submission.submittedAt)}`,
        )
      : null,
    submission.content
      ? h(Text, { className: "submission-content" }, submission.content)
      : null,
    submission.fileUrls && submission.fileUrls.length
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
              className: "primary-button review-button",
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
            h(
              Text,
              { className: "submission-content" },
              submission.remark || "已批改，无补充批语。",
            ),
            h(
              Text,
              { className: "notice-meta" },
              `批改：${formatDate(submission.reviewedAt)}`,
            ),
          )
        : h(Text, { className: "muted submission-waiting" }, "等待家长提交"),
  );
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
