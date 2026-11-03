// @ts-nocheck
import React, { useRef, useState } from "react";
import { Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const statuses = { active: "在读", inactive: "停读", graduated: "已毕业" };

export default function RosterPage() {
  const { params } = useRouter();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(params.classId || "");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const list = await teacherRequest("/teacher/classes");
      const next = await Promise.all(
        list.map(async (item) => ({
          ...item,
          students: await teacherRequest(
            `/teacher/classes/${encodeURIComponent(item.id)}/students`,
          ),
        })),
      );
      setClasses(next);
      if (classId && !next.some((item) => item.id === classId)) setClassId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "班级学生加载失败");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });
  const visible = classes.filter((item) => !classId || item.id === classId);
  const count = visible.reduce((sum, item) => sum + item.students.length, 0);

  return h(
    View,
    { className: "roster" },
    h(
      Text,
      { className: "roster-title" },
      params.mode === "students" ? "学生名册" : "班级与学生",
    ),
    h(
      View,
      { className: "roster-filters" },
      h(
        Text,
        {
          className: !classId ? "filter active" : "filter",
          onClick: () => setClassId(""),
        },
        "全部班级",
      ),
      ...classes.map((item) =>
        h(
          Text,
          {
            key: item.id,
            className: classId === item.id ? "filter active" : "filter",
            onClick: () => setClassId(item.id),
          },
          item.name,
        ),
      ),
    ),
    h(Input, {
      className: "roster-search",
      placeholder: "搜索学生姓名",
      value: query,
      onInput: (event) => setQuery(event.detail.value),
    }),
    loading
      ? h(Text, { className: "roster-empty" }, "正在加载…")
      : error
        ? h(
            View,
            { className: "roster-empty" },
            h(Text, null, error),
            h(Text, { className: "roster-retry", onClick: load }, "点击重试"),
          )
        : h(
            View,
            null,
            h(
              Text,
              { className: "roster-summary" },
              `${visible.length} 个班级 · ${count} 名学生`,
            ),
            ...visible.map((item) => {
              const students = item.students.filter((student) =>
                student.name.includes(query.trim()),
              );
              return h(
                View,
                { className: "roster-class", key: item.id },
                h(Text, { className: "roster-class-title" }, item.name),
                h(
                  Text,
                  { className: "roster-meta" },
                  `${item.campus?.name || ""} · ${item.students.length} 名学生`,
                ),
                ...students.map((student) =>
                  h(
                    View,
                    { className: "roster-student", key: student.id },
                    h(
                      View,
                      {
                        className: "roster-row",
                        onClick: () =>
                          setExpanded(
                            expanded === student.id ? "" : student.id,
                          ),
                      },
                      h(Text, { className: "roster-name" }, student.name),
                      h(
                        Text,
                        { className: "roster-meta" },
                        `${statuses[student.status] || "未知状态"} · ${expanded === student.id ? "收起 ∧" : "详情 ›"}`,
                      ),
                    ),
                    expanded === student.id
                      ? h(
                          View,
                          { className: "roster-details" },
                          h(Text, null, `班级：${item.name}`),
                          h(
                            Text,
                            null,
                            `性别：${{ male: "男", female: "女", M: "男", F: "女" }[student.gender] || student.gender || "未填写"}`,
                          ),
                          h(
                            Text,
                            null,
                            `生日：${student.birthday ? student.birthday.slice(0, 10) : "未填写"}`,
                          ),
                          h(
                            Text,
                            null,
                            `学籍状态：${statuses[student.status] || "未知状态"}`,
                          ),
                        )
                      : null,
                  ),
                ),
                !students.length
                  ? h(
                      Text,
                      { className: "roster-empty" },
                      query.trim() ? "未找到匹配学生" : "暂无学生",
                    )
                  : null,
              );
            }),
            !visible.length
              ? h(Text, { className: "roster-empty" }, "暂无负责班级")
              : null,
          ),
  );
}
