// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { parentRequest } from "../../api";

const h = React.createElement;

export default function HomePage() {
  const [children, setChildren] = useState([]);
  const [records, setRecords] = useState([]);

  async function load() {
    setChildren([]);
    setRecords([]);
    const nextChildren = await parentRequest("/parent/children");
    setChildren(nextChildren);
    if (nextChildren[0]) {
      setRecords(
        await parentRequest(`/parent/children/${nextChildren[0].id}/timeline`),
      );
    }
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
      h(Text, { className: "title" }, "今日成长"),
      h(Button, { className: "primary-button", onClick: load }, "刷新"),
      children.map((child) =>
        h(
          View,
          { className: "section", key: child.id },
          h(Text, { className: "subtitle" }, child.name),
          h(
            Text,
            { className: "muted" },
            `${child.class.name} · ${child.relation}`,
          ),
        ),
      ),
      records
        .slice(0, 3)
        .map((record) =>
          h(
            View,
            { className: "section", key: record.id },
            h(Text, { className: "subtitle" }, record.title),
            h(Text, null, record.content),
          ),
        ),
    ),
  );
}
