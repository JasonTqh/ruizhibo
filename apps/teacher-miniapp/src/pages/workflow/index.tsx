// @ts-nocheck
import React, { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function WorkflowPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingKey, setCheckingKey] = useState("");
  const [error, setError] = useState("");

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");
    try {
      setSessions(await teacherRequest("/teacher/workflow/today"));
    } catch (loadError) {
      setError(errorMessage(loadError, "流程加载失败，请重试。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function check(sessionId, stepId) {
    if (checkingKey) return;
    const nextCheckingKey = `${sessionId}:${stepId}`;
    setCheckingKey(nextCheckingKey);
    setError("");
    try {
      await teacherRequest(
        `/teacher/workflow/${sessionId}/steps/${stepId}/check`,
        { method: "POST", data: {} },
      );
      await load(false);
      Taro.showToast({ title: "打卡成功", icon: "success" });
    } catch (checkError) {
      setError(errorMessage(checkError, "打卡失败，请重试。"));
    } finally {
      setCheckingKey("");
    }
  }

  useDidShow(() => {
    load();
  });

  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "一日流程打卡"),
      h(
        Button,
        {
          className: "primary-button",
          loading,
          disabled: loading || Boolean(checkingKey),
          onClick: () => load(),
        },
        loading ? "加载中" : "刷新流程",
      ),
      error ? h(Text, { className: "error-text" }, error) : null,
      loading
        ? h(Text, { className: "empty-state" }, "正在加载今日流程…")
        : sessions.length === 0
          ? h(Text, { className: "empty-state" }, "今日暂无流程安排")
          : sessions.map((session) =>
        h(
          View,
          { className: "section", key: session.id },
          h(Text, { className: "subtitle" }, session.class.name),
          session.steps.length === 0
            ? h(Text, { className: "empty-state" }, "该班级暂无流程步骤")
            : session.steps.map((step) =>
            h(
              View,
              { className: "row", key: step.id },
              h(
                View,
                null,
                h(Text, null, step.name),
                h(Text, { className: "muted" }, step.timeRange),
              ),
              h(
                Button,
                {
                  size: "mini",
                  loading: checkingKey === `${session.id}:${step.id}`,
                  disabled: step.checked || Boolean(checkingKey),
                  onClick: () => check(session.id, step.id),
                },
                step.checked ? "已打卡" : "打卡",
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
