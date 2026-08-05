import React from "react";
import { Text, View } from "@tarojs/components";

const h = React.createElement;

export default function ProfilePage() {
  return h(View, { className: "page" }, h(View, { className: "card" }, h(Text, null, "我的：孩子信息、绑定关系、联系电话。")));
}
