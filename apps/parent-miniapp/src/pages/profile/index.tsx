import React from "react";
import { Text, View } from "@tarojs/components";
import "./index.scss";

const h = React.createElement;

export default function ProfilePage() {
  return h(
    View,
    { className: "page" },
    h(
      View,
      { className: "card" },
      h(Text, { className: "title" }, "我的"),
      h(
        Text,
        { className: "feedback-state" },
        "孩子信息、绑定关系和联系电话管理功能正在规划中。",
      ),
    ),
  );
}
