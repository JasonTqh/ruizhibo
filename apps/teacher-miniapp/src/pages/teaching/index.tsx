// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { teacherRequest } from "../../api";

const h = React.createElement;

export default function TeachingPage() {
  const [homework, setHomework] = useState([]);

  async function load() {
    setHomework(await teacherRequest("/teacher/homework"));
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "作业管理"),
      h(Button, { className: "primary-button", onClick: load }, "刷新作业"),
      homework.map((item) =>
        h(
          View,
          { className: "section", key: item.id },
          h(Text, { className: "subtitle" }, item.title),
          h(Text, { className: "muted" }, item.subject),
          item.submissions.map((submission) =>
            h(Text, { className: "list-line", key: submission.id }, `${submission.student.name}：${submission.status}`),
          ),
        ),
      ),
    ),
  );
}
