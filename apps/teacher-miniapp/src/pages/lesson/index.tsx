import React from "react";
import { Text, View } from "@tarojs/components";
import "./index.scss";

const h = React.createElement;

export default function LessonPage() {
  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "备课"),
      h(
        Text,
        { className: "empty-state" },
        "教案计划、授课准备和课程筛选功能正在规划中。",
      ),
    ),
  );
}
