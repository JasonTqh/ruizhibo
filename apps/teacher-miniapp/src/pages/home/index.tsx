// @ts-nocheck
import React, { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function HomePage() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setDashboard(await teacherRequest("/teacher/dashboard"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "请求失败";
      setError(message);
      Taro.showToast({ title: message, icon: "none" });
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  const workflow = dashboard && dashboard.workflow ? dashboard.workflow : {};

  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "教师工作台"),
      h(
        Button,
        {
          className: "primary-button",
          loading,
          disabled: loading,
          onClick: load,
        },
        loading ? "加载中" : "刷新数据",
      ),
      error ? h(Text, { className: "error-text" }, error) : null,
      loading && !dashboard
        ? h(Text, { className: "empty-state" }, "正在加载工作台…")
        : null,
      dashboard
        ? h(
            View,
            { className: "grid" },
            h(
              View,
              { className: "metric" },
              h(Text, null, "班级"),
              h(Text, null, dashboard.classCount),
            ),
            h(
              View,
              { className: "metric" },
              h(Text, null, "学生"),
              h(Text, null, dashboard.studentCount),
            ),
            h(
              View,
              { className: "metric" },
              h(Text, null, "待打卡"),
              h(Text, null, workflow.uncheckedStepCount || 0),
            ),
            h(
              View,
              { className: "metric" },
              h(Text, null, "待批作业"),
              h(Text, null, dashboard.homeworkPending),
            ),
          )
        : null,
      h(
        View,
        { className: "section" },
        h(Text, { className: "subtitle" }, "通知与任务"),
        h(
          Text,
          { className: "muted" },
          "向班级家长发布内容，并跟进查看与确认回执。",
        ),
        h(
          Button,
          {
            className: "primary-button workbench-entry-button",
            onClick: () => Taro.navigateTo({ url: "/pages/notices/index" }),
          },
          "发布通知 / 任务",
        ),
      ),
      h(
        View,
        { className: "section" },
        h(Text, { className: "subtitle" }, "家校沟通"),
        h(Text, { className: "muted" }, "查看家长留言并及时回复。"),
        h(
          Button,
          {
            className: "primary-button workbench-entry-button",
            onClick: () => Taro.navigateTo({ url: "/pages/messages/index" }),
          },
          "进入家校沟通",
        ),
      ),
    ),
  );
}
