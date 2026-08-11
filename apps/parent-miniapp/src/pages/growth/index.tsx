// @ts-nocheck
import React, { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function GrowthPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const children = await parentRequest("/parent/children");
      setRecords(
        children[0]
          ? await parentRequest(
              `/parent/children/${children[0].id}/timeline`,
            )
          : [],
      );
    } catch (loadError) {
      setError(errorMessage(loadError, "成长记录加载失败，请重试。"));
    } finally {
      setLoading(false);
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
      h(Text, { className: "title" }, "成长时间线"),
      h(
        Button,
        {
          className: "primary-button",
          loading,
          disabled: loading,
          onClick: load,
        },
        loading ? "加载中" : "刷新",
      ),
      error
        ? h(
            View,
            { className: "feedback-state feedback-state--error" },
            h(Text, null, error),
          )
        : null,
      loading
        ? h(Text, { className: "feedback-state" }, "正在加载成长记录…")
        : records.length === 0
          ? h(Text, { className: "feedback-state" }, "暂无成长记录")
          : records.map((record) =>
        h(
          View,
          { className: "section", key: record.id },
          h(Text, { className: "muted" }, recordTypeText(record.type)),
          h(Text, { className: "subtitle" }, record.title),
          h(Text, null, record.content),
        ),
      ),
    ),
  );
}

function recordTypeText(type) {
  const labels = {
    workflow: "流程记录",
    teacher_feedback: "老师反馈",
    homework: "作业记录",
    attendance: "出勤记录",
  };
  return labels[type] || "成长记录";
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
