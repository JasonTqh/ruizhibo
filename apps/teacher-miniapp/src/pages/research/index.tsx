import React from "react";
import { Text, View } from "@tarojs/components";

const h = React.createElement;

export default function ResearchPage() {
  return h(View, { className: "page" }, h(View, { className: "card" }, h(Text, null, "教研：听课评课、教学研讨、教师培训。")));
}
