// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { teacherRequest } from "../../api";

const h = React.createElement;

export default function WorkflowPage() {
  const [sessions, setSessions] = useState([]);

  async function load() {
    setSessions(await teacherRequest("/teacher/workflow/today"));
  }

  async function check(sessionId, stepId) {
    await teacherRequest(`/teacher/workflow/${sessionId}/steps/${stepId}/check`, {
      method: "POST",
      data: {},
    });
    await load();
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
      h(Text, { className: "title" }, "一日流程打卡"),
      h(Button, { className: "primary-button", onClick: load }, "刷新流程"),
      sessions.map((session) =>
        h(
          View,
          { className: "section", key: session.id },
          h(Text, { className: "subtitle" }, session.class.name),
          session.steps.map((step) =>
            h(
              View,
              { className: "row", key: step.id },
              h(View, null, h(Text, null, step.name), h(Text, { className: "muted" }, step.timeRange)),
              h(
                Button,
                {
                  size: "mini",
                  disabled: step.checked,
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
