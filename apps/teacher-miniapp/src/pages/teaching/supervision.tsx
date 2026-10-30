// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { Button, Picker, Text, View } from "@tarojs/components";
import { teacherRequest } from "../../api";
import { visibleTags } from "../../teaching-workflow";
import "./supervision.scss";
const h = React.createElement;
const emptyFilters = () => ({ teacherId: "", classId: "", from: "", to: "" });

export default function SupervisionPanel({ onContext, refreshKey }) {
  const [context, setContext] = useState(null);
  const [kind, setKind] = useState("lesson-plans");
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0 });
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const detailSequence = useRef(0);

  async function load() {
    const current = ++sequence.current;
    ++detailSequence.current;
    setLoading(true);
    setError("");
    setResult({ items: [], total: 0 });
    setDetail(null);
    setDetailLoading(false);
    try {
      const next = await teacherRequest("/teacher/supervision/context");
      if (sequence.current !== current) return;
      setContext(next);
      onContext(next);
      if (!next.isSupervisor || !next.campuses.length) return;
      const query = Object.entries({ ...applied, page, pageSize: 20 })
        .filter(([, v]) => v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&");
      const data = await teacherRequest(
        `/teacher/supervision/${kind}?${query}`,
      );
      if (sequence.current === current) setResult(data);
    } catch (e) {
      if (sequence.current === current)
        setError(e.message || "校区教学加载失败，请重试");
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return () => {
      ++sequence.current;
      ++detailSequence.current;
    };
  }, [kind, page, applied, refreshKey]);

  async function openDetail(id) {
    if (detail?.id === id) {
      ++detailSequence.current;
      setDetail(null);
      return;
    }
    const current = ++detailSequence.current;
    setDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const data = await teacherRequest(
        `/teacher/supervision/${kind}/${encodeURIComponent(id)}`,
      );
      if (detailSequence.current === current) setDetail(data);
    } catch (e) {
      if (detailSequence.current === current) {
        setResult({ items: [], total: 0 });
        setError(e.message || "详情加载失败，请重新查询");
      }
    } finally {
      if (detailSequence.current === current) setDetailLoading(false);
    }
  }
  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function selection(key, title, options) {
    const all = [{ id: "", name: `全部${title}` }, ...(options || [])];
    const index = Math.max(
      0,
      all.findIndex((item) => item.id === filters[key]),
    );
    return h(
      View,
      { className: "supervision-field" },
      h(Text, { className: "supervision-label" }, title),
      h(
        Picker,
        {
          mode: "selector",
          range: all,
          rangeKey: "name",
          value: index,
          onChange: (e) => update(key, all[Number(e.detail.value)].id),
        },
        h(View, { className: "supervision-picker" }, all[index].name),
      ),
    );
  }
  const lessons = kind === "lesson-plans";
  return h(
    View,
    { className: "supervision-panel" },
    h(
      Text,
      { className: "supervision-note" },
      context?.campuses.length
        ? `管理校区：${context.campuses.map((c) => c.name).join("、")}。仅供查看，草稿不公开。`
        : "尚未配置管理校区，请联系管理员在教师管理中配置。目前仍可查看本人教学。",
    ),
    h(
      View,
      { className: "teaching-tabs" },
      ...[
        ["lesson-plans", "备课计划"],
        ["teaching-records", "教学记录"],
      ].map(([key, label]) =>
        h(
          View,
          {
            key,
            className: `teaching-tab ${kind === key ? "teaching-tab--active" : ""}`,
            onClick: () => {
              setKind(key);
              setPage(1);
            },
          },
          label,
        ),
      ),
    ),
    context?.campuses.length
      ? h(
          View,
          { className: "supervision-filters" },
          selection("teacherId", "教师", context.teachers),
          selection(
            "classId",
            "班级",
            context.classes.map((c) => ({
              ...c,
              name: `${context.campuses.find((x) => x.id === c.campusId)?.name || ""} · ${c.name}`,
            })),
          ),
          h(
            View,
            { className: "supervision-field" },
            h(Text, { className: "supervision-label" }, "日期范围"),
            h(
              View,
              { className: "supervision-date-row" },
              ...[
                ["from", "开始日期"],
                ["to", "结束日期"],
              ].map(([key, label]) =>
                h(
                  Picker,
                  {
                    key,
                    mode: "date",
                    value: filters[key] || undefined,
                    onChange: (e) => update(key, e.detail.value),
                  },
                  h(
                    View,
                    { className: "supervision-picker" },
                    filters[key] || label,
                  ),
                ),
              ),
            ),
          ),
          h(
            View,
            { className: "supervision-actions" },
            h(
              Button,
              {
                disabled: loading,
                onClick: () => {
                  if (filters.from && filters.to && filters.from > filters.to) {
                    setError("开始日期不能晚于结束日期");
                    return;
                  }
                  setApplied({ ...filters });
                  setPage(1);
                },
              },
              "查询",
            ),
            h(
              Button,
              {
                disabled: loading,
                onClick: () => {
                  setFilters(emptyFilters());
                  setApplied(emptyFilters());
                  setPage(1);
                },
              },
              "重置",
            ),
          ),
        )
      : null,
    error
      ? h(
          View,
          { className: "teaching-error" },
          h(Text, null, error),
          h(Button, { onClick: load }, "重新加载"),
        )
      : null,
    loading
      ? h(View, { className: "supervision-empty" }, "正在加载校区教学…")
      : !error && context?.campuses.length
        ? h(
            View,
            null,
            h(
              Text,
              { className: "supervision-count" },
              `共 ${result.total} 条记录`,
            ),
            !result.items.length
              ? h(
                  View,
                  { className: "supervision-empty" },
                  "没有符合查询条件的记录",
                )
              : result.items.map((item) =>
                  h(
                    View,
                    { key: item.id, className: "supervision-card" },
                    h(
                      Text,
                      { className: "supervision-title" },
                      lessons ? item.theme : item.course,
                    ),
                    h(
                      Text,
                      { className: "supervision-meta" },
                      `${item.teacher.name} · ${item.class.campus.name} · ${item.class.name}`,
                    ),
                    h(
                      Text,
                      { className: "supervision-meta" },
                      `${dateLabel(lessons ? item.lessonDate : item.date)}${lessons ? ` · ${item.durationMinutes}分钟 · ${item.status === "archived" ? "已归档" : "已发布"}` : ""}`,
                    ),
                    lessons
                      ? h(
                          Text,
                          { className: "supervision-meta" },
                          item.teachingCompleted
                            ? "已补齐教学记录"
                            : "待补齐教学记录",
                        )
                      : null,
                    h(
                      Button,
                      {
                        className: "supervision-detail-button",
                        disabled: detailLoading,
                        onClick: () => openDetail(item.id),
                      },
                      detail?.id === item.id ? "收起详情" : "查看详情",
                    ),
                    detail?.id === item.id
                      ? h(
                          View,
                          { className: "supervision-detail" },
                          lessons
                            ? h(
                                View,
                                null,
                                h(
                                  Text,
                                  { className: "supervision-label" },
                                  "教学目标",
                                ),
                                h(
                                  Text,
                                  { className: "supervision-content" },
                                  detail.objectives,
                                ),
                              )
                            : null,
                          h(
                            Text,
                            { className: "supervision-label" },
                            lessons ? "备课内容" : "教学内容与课后记录",
                          ),
                          h(
                            Text,
                            { className: "supervision-content" },
                            detail.content,
                          ),
                          !lessons && visibleTags(detail.tags).length
                            ? h(
                                Text,
                                { className: "supervision-meta" },
                                `标签：${visibleTags(detail.tags).join("、")}`,
                              )
                            : null,
                        )
                      : null,
                  ),
                ),
            result.total > 20
              ? h(
                  View,
                  { className: "supervision-actions" },
                  h(
                    Button,
                    {
                      disabled: page <= 1 || loading,
                      onClick: () => setPage((p) => p - 1),
                    },
                    "上一页",
                  ),
                  h(Text, null, `${page} / ${Math.ceil(result.total / 20)}`),
                  h(
                    Button,
                    {
                      disabled: page * 20 >= result.total || loading,
                      onClick: () => setPage((p) => p + 1),
                    },
                    "下一页",
                  ),
                )
              : null,
          )
        : null,
    detailLoading
      ? h(Text, { className: "supervision-count" }, "正在加载详情…")
      : null,
  );
}
function dateLabel(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
