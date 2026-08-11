import React from "react";
import { Text, View } from "@tarojs/components";
import "./index.scss";

const h = React.createElement;

export default function ResearchPage() {
  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "教研"),
      h(
        Text,
        { className: "empty-state" },
        "听课评课、教学研讨和教师培训功能正在规划中。",
      ),
    ),
  );
}
