// @ts-nocheck
import React, { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function HomePage() {
  const [children, setChildren] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const nextChildren = await parentRequest("/parent/children");
      setChildren(nextChildren);
      setRecords(
        nextChildren[0]
          ? await parentRequest(
              `/parent/children/${nextChildren[0].id}/timeline`,
            )
          : [],
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "首页加载失败，请确认 API 已启动。",
      );
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
        h(Text, { className: "title page-heading__title" }, "今日成长"),
        h(
          Button,
          {
            className: "refresh-button",
            size: "mini",
            loading,
            disabled: loading,
            onClick: load,
          },
          "刷新",
        ),
      ),
      loading
        ? h(Text, { className: "feedback-state" }, "正在加载今日成长…")
        : null,
      children.length === 0 && !loading && !error
        ? h(Text, { className: "feedback-state" }, "暂无已绑定的孩子")
        : children.map((child) =>
            h(
              View,
              { className: "section", key: child.id },
              h(Text, { className: "subtitle" }, child.name),
              h(
                Text,
                { className: "muted" },
                `${child.class.name} · ${child.relation}`,
              ),
            ),
          ),
      h(
        Button,
        {
          className: "primary-button homework-entry-button",
          disabled: loading || children.length === 0,
          onClick: () => Taro.navigateTo({ url: "/pages/homework/index" }),
        },
        "查看与提交作业",
      ),
      !loading && children.length > 0 && records.length === 0
        ? h(Text, { className: "feedback-state" }, "今天暂无新的成长记录")
        : records.slice(0, 3).map((record) =>
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
