import React from "react";
import { Text, View } from "@tarojs/components";

const h = React.createElement;

export default function LessonPage() {
  return h(View, { className: "page" }, h(View, { className: "card" }, h(Text, null, "备课：教案计划、授课准备、课程筛选。")));
}
