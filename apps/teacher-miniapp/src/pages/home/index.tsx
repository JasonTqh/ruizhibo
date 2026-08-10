// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { teacherRequest } from "../../api";

const h = React.createElement;

export default function HomePage() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    load();
  }, []);

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
        { className: "primary-button", loading, onClick: load },
        loading ? "加载中" : "刷新数据",
      ),
      error ? h(Text, { className: "error-text" }, error) : null,
      h(
        View,
        { className: "grid" },
        h(
          View,
          { className: "metric" },
          h(Text, null, "班级"),
          h(Text, null, dashboard ? dashboard.classCount : 0),
        ),
        h(
          View,
          { className: "metric" },
          h(Text, null, "学生"),
          h(Text, null, dashboard ? dashboard.studentCount : 0),
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
          h(Text, null, dashboard ? dashboard.homeworkPending : 0),
        ),
      ),
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
    ),
  );
}
