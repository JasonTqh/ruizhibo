// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { parentRequest } from "../../api";

const h = React.createElement;

export default function GrowthPage() {
  const [records, setRecords] = useState([]);

  async function load() {
    const children = await parentRequest("/parent/children");
    if (children[0]) {
      setRecords(await parentRequest(`/parent/children/${children[0].id}/timeline`));
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
      h(Text, { className: "title" }, "成长时间线"),
      h(Button, { className: "primary-button", onClick: load }, "刷新"),
      records.map((record) =>
        h(
          View,
          { className: "section", key: record.id },
          h(Text, { className: "muted" }, record.type),
          h(Text, { className: "subtitle" }, record.title),
          h(Text, null, record.content),
        ),
      ),
    ),
  );
}
