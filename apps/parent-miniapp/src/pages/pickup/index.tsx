// @ts-nocheck
import React, { useRef, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro, { useDidShow, useLoad, usePullDownRefresh } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;
const ACTIVE_CHILD_KEY = "parentActiveChildId";

export default function ParentPickupPage() {
  const [requestedStudentId, setRequestedStudentId] = useState("");
  const [children, setChildren] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);

  useLoad((options) => setRequestedStudentId(options.studentId || ""));

  async function load(targetId = studentId) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const nextChildren = await parentRequest("/parent/children");
      const stored = Taro.getStorageSync(ACTIVE_CHILD_KEY);
      const nextChild =
        nextChildren.find((item) => item.id === targetId) ||
        nextChildren.find((item) => item.id === requestedStudentId) ||
        nextChildren.find((item) => item.id === stored) ||
        nextChildren[0];
      setChildren(nextChildren);
      setStudentId(nextChild?.id || "");
      if (!nextChild) {
        setToday(null);
        setHistory([]);
        return;
      }
      Taro.setStorageSync(ACTIVE_CHILD_KEY, nextChild.id);
      const [nextToday, nextHistory] = await Promise.all([
        parentRequest(`/parent/children/${nextChild.id}/pickup/today`),
        parentRequest(
          `/parent/children/${nextChild.id}/pickup-records?pageSize=50`,
        ),
      ]);
      setToday(nextToday);
      setHistory(nextHistory.items || []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "接送记录加载失败",
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => load());
  usePullDownRefresh(() => load());

  const child = children.find((item) => item.id === studentId) || children[0];
  const groups = groupByDate(history);
  const latest = today?.events?.[today.events.length - 1];

  return h(
    View,
    { className: "parent-pickup-page" },
    h(
      View,
      {
        className: `parent-pickup-hero parent-pickup-hero--${today?.status || "waiting_pickup"}`,
      },
      h(
        View,
        { className: "parent-pickup-hero__top" },
        h(
          View,
          null,
          h(
            Text,
            { className: "parent-pickup-hero__eyebrow" },
            child?.name || "我的孩子",
          ),
          h(
            Text,
            { className: "parent-pickup-hero__title" },
            statusText(today?.status),
          ),
          h(
            Text,
            { className: "parent-pickup-hero__hint" },
            statusDetail(today, latest),
          ),
        ),
        h(
          Text,
          {
            className: "parent-pickup-hero__refresh",
            onClick: () => !loading && load(),
          },
          loading ? "…" : "↻",
        ),
      ),
      latest?.isException
        ? h(
            Text,
            { className: "parent-pickup-hero__exception" },
            "⚠ 本次为临时或异常接送，处理详情已完整记录",
          )
        : null,
    ),
    error
      ? h(
          View,
          { className: "parent-pickup-error" },
          h(Text, null, error),
          h(
            Text,
            { className: "parent-pickup-error__retry", onClick: () => load() },
            "重试",
          ),
        )
      : null,
    children.length > 1
      ? h(
          View,
          { className: "parent-pickup-switch" },
          ...children.map((item) =>
            h(
              View,
              {
                key: item.id,
                className: `parent-pickup-switch__item${item.id === child?.id ? " parent-pickup-switch__item--active" : ""}`,
                onClick: () => item.id !== studentId && load(item.id),
              },
              h(Text, null, item.name),
            ),
          ),
        )
      : null,
    h(
      View,
      { className: "parent-pickup-heading" },
      h(Text, { className: "parent-pickup-heading__title" }, "接送历史"),
      h(Text, { className: "parent-pickup-heading__hint" }, "按日期保留责任链"),
    ),
    groups.length
      ? groups.map((group) =>
          h(
            View,
            { className: "pickup-day", key: group.date },
            h(
              View,
              { className: "pickup-day__heading" },
              h(
                Text,
                { className: "pickup-day__date" },
                displayDate(group.date),
              ),
              group.events.some((item) => item.isException)
                ? h(
                    Text,
                    { className: "pickup-day__exception" },
                    "⚠ 含异常接送",
                  )
                : h(Text, { className: "pickup-day__safe" }, "记录完整"),
            ),
            h(
              View,
              { className: "pickup-timeline" },
              ...group.events.map((event) =>
                h(
                  View,
                  {
                    className: `pickup-event${event.isException ? " pickup-event--exception" : ""}`,
                    key: event.id,
                  },
                  h(
                    View,
                    { className: "pickup-event__rail" },
                    h(View, {
                      className: `pickup-event__dot pickup-event__dot--${event.type}`,
                    }),
                    h(View, { className: "pickup-event__line" }),
                  ),
                  h(
                    View,
                    { className: "pickup-event__main" },
                    h(
                      View,
                      { className: "pickup-event__top" },
                      h(
                        Text,
                        { className: "pickup-event__title" },
                        eventTitle(event),
                      ),
                      h(
                        Text,
                        { className: "pickup-event__time" },
                        timeText(event.happenedAt),
                      ),
                    ),
                    h(
                      Text,
                      { className: "pickup-event__teacher" },
                      `经办教师：${event.teacher?.name || "-"}`,
                    ),
                    event.type === "left_center"
                      ? h(
                          Text,
                          { className: "pickup-event__person" },
                          `接送人：${relationshipText(event.relationshipSnapshot)} ${event.pickupPersonNameSnapshot || "-"}${event.phoneSnapshot ? `（${event.phoneSnapshot}）` : ""}`,
                        )
                      : null,
                    event.type === "arrived_at_center" &&
                      event.pickupPersonNameSnapshot
                      ? h(
                          Text,
                          { className: "pickup-event__person" },
                          `送达人：${relationshipText(event.relationshipSnapshot)} ${event.pickupPersonNameSnapshot}${event.phoneSnapshot ? `（${event.phoneSnapshot}）` : ""}`,
                        )
                      : null,
                    event.arrivalMethod
                      ? h(
                          Text,
                          { className: "pickup-event__meta" },
                          `到店方式：${arrivalMethodText(event.arrivalMethod)}`,
                        )
                      : null,
                    event.isException
                      ? h(
                          View,
                          { className: "pickup-event__exception-box" },
                          h(
                            Text,
                            null,
                            `异常原因：${event.exceptionReason || "临时授权"}`,
                          ),
                          h(
                            Text,
                            null,
                            `处理结果：${event.resolution || "已核验"}`,
                          ),
                        )
                      : null,
                    event.remark
                      ? h(
                          Text,
                          { className: "pickup-event__remark" },
                          `备注：${event.remark}`,
                        )
                      : null,
                  ),
                ),
              ),
            ),
          ),
        )
      : h(
          View,
          { className: "parent-pickup-empty" },
          h(Text, { className: "parent-pickup-empty__icon" }, "⌂"),
          h(Text, null, loading ? "正在加载接送记录…" : "暂无接送记录"),
        ),
  );
}

function groupByDate(items) {
  const groups = new Map();
  for (const item of items) {
    const key = String(item.serviceDate || "").slice(0, 10);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  return Array.from(groups.entries()).map(([date, events]) => ({
    date,
    events,
  }));
}

function statusText(status) {
  return (
    {
      waiting_pickup: "等待接送",
      picked_up: "已接到，正在前往中心",
      in_care: "已安全到店",
      left: "已安全离店",
      absent: "今日请假 / 缺勤",
    }[status] || "等待接送"
  );
}

function statusDetail(today, latest) {
  if (today?.status === "absent") {
    return `今日无需接送${today?.absenceRemark ? ` · ${today.absenceRemark}` : ""}`;
  }
  if (!latest) return "今日尚未登记接送节点";
  if (today?.status === "left") {
    return `${timeText(latest.happenedAt)} · ${relationshipText(latest.relationshipSnapshot)} ${latest.pickupPersonNameSnapshot || ""}接走`;
  }
  return `${timeText(latest.happenedAt)} · ${latest.teacher?.name || "老师"}经办`;
}

function eventTitle(event) {
  if (event.type === "picked_up_from_school") return "已从学校接到";
  if (event.type === "arrived_at_center") return "安全到达锐之博";
  if (event.type === "left_center") {
    if (event.status === "temporary_authorization") return "⚠ 临时授权离店";
    if (event.status === "exception") return "⚠ 异常接送离店";
    return "已完成离店交接";
  }
  return event.type;
}

function relationshipText(value) {
  return (
    {
      father: "父亲",
      mother: "母亲",
      grandfather: "爷爷",
      grandmother: "奶奶",
      maternal_grandfather: "外公",
      maternal_grandmother: "外婆",
      sibling: "兄弟姐妹",
      relative: "亲属",
      other: "其他",
    }[value] ||
    value ||
    "接送人"
  );
}

function arrivalMethodText(value) {
  return (
    {
      teacher_pickup: "教师从学校接送",
      parent_delivered: "家长送达",
      self_arrived: "学生自行到店",
      other: "其他方式",
    }[value] || value
  );
}

function timeText(value) {
  if (!value) return "-";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function displayDate(value) {
  const [year, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日 · ${year}`;
}
