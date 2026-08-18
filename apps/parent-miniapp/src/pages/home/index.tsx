// @ts-nocheck
import React, { useRef, useState } from "react";
import { Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;
const ACTIVE_CHILD_KEY = "parentActiveChildId";

export default function HomePage() {
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState("");
  const [records, setRecords] = useState([]);
  const [homework, setHomework] = useState([]);
  const [notices, setNotices] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [pickup, setPickup] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [care, setCare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const nextChildren = await parentRequest("/parent/children");
      const storedChildId = Taro.getStorageSync(ACTIVE_CHILD_KEY);
      const nextChild =
        nextChildren.find((item) => item.id === storedChildId) ||
        nextChildren.find((item) => item.id === activeChildId) ||
        nextChildren[0];
      setChildren(nextChildren);
      setActiveChildId(nextChild?.id || "");
      if (nextChild) Taro.setStorageSync(ACTIVE_CHILD_KEY, nextChild.id);

      const [
        nextRecords,
        nextHomework,
        nextNotices,
        nextConversations,
        nextPickup,
        nextWorkflow,
        nextCare,
      ] = await Promise.all([
        nextChild
          ? parentRequest(`/parent/children/${nextChild.id}/timeline`)
          : Promise.resolve([]),
        nextChild
          ? parentRequest(`/parent/children/${nextChild.id}/homework`)
          : Promise.resolve([]),
        parentRequest("/parent/notices"),
        parentRequest("/parent/conversations"),
        nextChild
          ? parentRequest(`/parent/children/${nextChild.id}/pickup/today`)
          : Promise.resolve(null),
        nextChild
          ? parentRequest(`/parent/children/${nextChild.id}/workflow/today`)
          : Promise.resolve(null),
        nextChild
          ? parentRequest(`/parent/children/${nextChild.id}/care/today`)
          : Promise.resolve(null),
      ]);
      if (sequence !== requestSequence.current) return;
      setRecords(nextRecords);
      setHomework(nextHomework);
      setNotices(nextNotices);
      setConversations(nextConversations);
      setPickup(nextPickup);
      setWorkflow(nextWorkflow);
      setCare(nextCare);
      syncCommunicationBadge(nextNotices, nextConversations);
    } catch (loadError) {
      if (sequence === requestSequence.current)
        setError(
          loadError instanceof Error
            ? loadError.message
            : "首页加载失败，请稍后重试。",
        );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
      loadingRef.current = false;
    }
  }

  async function selectChild(childId) {
    if (childId === activeChildId || loading) return;
    loadingRef.current = true;
    const sequence = ++requestSequence.current;
    setActiveChildId(childId);
    Taro.setStorageSync(ACTIVE_CHILD_KEY, childId);
    setLoading(true);
    setError("");
    try {
      const [nextRecords, nextHomework, nextPickup, nextWorkflow, nextCare] =
        await Promise.all([
          parentRequest(`/parent/children/${childId}/timeline`),
          parentRequest(`/parent/children/${childId}/homework`),
          parentRequest(`/parent/children/${childId}/pickup/today`),
          parentRequest(`/parent/children/${childId}/workflow/today`),
          parentRequest(`/parent/children/${childId}/care/today`),
        ]);
      if (sequence !== requestSequence.current) return;
      setRecords(nextRecords);
      setHomework(nextHomework);
      setPickup(nextPickup);
      setWorkflow(nextWorkflow);
      setCare(nextCare);
    } catch (loadError) {
      if (sequence === requestSequence.current)
        setError("切换孩子失败，请重试。");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
      loadingRef.current = false;
    }
  }

  useDidShow(() => {
    load();
  });

  const child =
    children.find((item) => item.id === activeChildId) || children[0];
  const pendingHomework = homework.filter((item) =>
    ["pending", "overdue"].includes(item.status),
  );
  const pendingNotices = notices.filter((item) => !item.confirmedAt);
  const unreadCount = conversations.reduce(
    (sum, item) => sum + Number(item.unreadCount || 0),
    0,
  );

  return h(
    View,
    { className: "parent-home" },
    h(
      View,
      { className: "parent-home__topbar" },
      h(
        View,
        null,
        h(Text, { className: "parent-home__brand" }, "锐之博托管中心"),
        h(Text, { className: "parent-home__welcome" }, "让成长每天都看得见"),
      ),
      h(
        View,
        {
          className: `parent-refresh${loading ? " parent-refresh--loading" : ""}`,
          onClick: () => !loading && load(),
        },
        h(Text, null, "↻"),
      ),
    ),
    error
      ? h(
          View,
          { className: "parent-home__error" },
          h(Text, null, error),
          h(
            Text,
            { className: "parent-home__retry", onClick: load },
            "重新加载",
          ),
        )
      : null,
    children.length > 1
      ? h(
          View,
          { className: "child-switcher" },
          ...children.map((item) =>
            h(
              View,
              {
                className: `child-switcher__item${item.id === activeChildId ? " child-switcher__item--active" : ""}`,
                key: item.id,
                onClick: () => selectChild(item.id),
              },
              h(Text, null, childDisplayName(children, item)),
            ),
          ),
        )
      : null,
    child
      ? h(
          View,
          { className: "child-hero" },
          h(
            View,
            { className: "child-hero__avatar" },
            h(Text, null, child.name.slice(0, 1)),
          ),
          h(
            View,
            { className: "child-hero__main" },
            h(Text, { className: "child-hero__eyebrow" }, "我的孩子"),
            h(Text, { className: "child-hero__name" }, child.name),
            h(
              Text,
              { className: "child-hero__meta" },
              `${child.class?.name || "未分班"} · ${child.relation || "家长"}`,
            ),
          ),
          h(
            View,
            { className: "child-hero__today" },
            h(Text, { className: "child-hero__today-value" }, records.length),
            h(Text, { className: "child-hero__today-label" }, "成长记录"),
          ),
        )
      : h(
          View,
          { className: "parent-empty-card" },
          h(
            Text,
            { className: "parent-empty-card__title" },
            loading ? "正在加载孩子信息…" : "尚未绑定孩子",
          ),
          h(
            Text,
            { className: "parent-empty-card__hint" },
            "请联系管理员完成家长与孩子的绑定。",
          ),
        ),
    child
      ? pickupStatusCard(pickup, () =>
          Taro.navigateTo({ url: `/pages/pickup/index?studentId=${child.id}` }),
        )
      : null,
    child ? workflowTodayCard(workflow, loading) : null,
    child ? careTodayCard(care, loading) : null,
    h(
      View,
      { className: "parent-quick-grid" },
      quickItem(
        "▣",
        "作业中心",
        pendingHomework.length
          ? `${pendingHomework.length} 项待完成`
          : "查看全部作业",
        "green",
        () => Taro.navigateTo({ url: "/pages/homework/index" }),
      ),
      quickItem("↗", "成长记录", `${records.length} 条最新动态`, "yellow", () =>
        Taro.switchTab({ url: "/pages/growth/index" }),
      ),
      quickItem(
        "◇",
        "通知任务",
        pendingNotices.length
          ? `${pendingNotices.length} 项待确认`
          : "暂无待确认",
        "coral",
        () => Taro.switchTab({ url: "/pages/messages/index" }),
      ),
      quickItem(
        "◌",
        "家校沟通",
        unreadCount ? `${unreadCount} 条未读消息` : "联系班级老师",
        "blue",
        () => Taro.switchTab({ url: "/pages/messages/index" }),
      ),
    ),
    homeHeading("今日提醒", "重要事项不错过"),
    h(
      View,
      { className: "reminder-list" },
      pendingHomework.length
        ? reminderRow(
            "作业待完成",
            pendingHomework[0].homework?.title || "老师发布了新作业",
            "作业",
            "yellow",
            () => Taro.navigateTo({ url: "/pages/homework/index" }),
          )
        : reminderRow("今日作业", "当前没有待完成作业", "已完成", "green", () =>
            Taro.navigateTo({ url: "/pages/homework/index" }),
          ),
      pendingNotices.length
        ? reminderRow(
            "通知待确认",
            pendingNotices[0].notice?.title || "老师发布了新通知",
            `${pendingNotices.length} 项`,
            "coral",
            () => Taro.switchTab({ url: "/pages/messages/index" }),
          )
        : reminderRow(
            "通知任务",
            "所有通知均已查看确认",
            "已处理",
            "green",
            () => Taro.switchTab({ url: "/pages/messages/index" }),
          ),
      unreadCount
        ? reminderRow(
            "老师有新回复",
            "点击进入家校沟通查看消息",
            `${unreadCount} 条`,
            "blue",
            () => Taro.switchTab({ url: "/pages/messages/index" }),
          )
        : null,
    ),
    homeHeading("今日成长", "查看全部", () =>
      Taro.switchTab({ url: "/pages/growth/index" }),
    ),
    h(
      View,
      { className: "growth-preview" },
      records.length
        ? records.slice(0, 3).map((record, index) =>
            h(
              View,
              { className: "growth-preview__row", key: record.id },
              h(
                View,
                {
                  className: `growth-preview__icon growth-preview__icon--${recordTone(record.type, index)}`,
                },
                h(Text, null, recordIcon(record.type)),
              ),
              h(
                View,
                { className: "growth-preview__main" },
                h(
                  Text,
                  { className: "growth-preview__type" },
                  recordTypeText(record.type),
                ),
                h(Text, { className: "growth-preview__title" }, record.title),
                h(
                  Text,
                  { className: "growth-preview__content" },
                  record.content,
                ),
              ),
              h(
                Text,
                { className: "growth-preview__time" },
                shortDate(record.happenedAt),
              ),
            ),
          )
        : h(
            View,
            { className: "growth-preview__empty" },
            h(Text, { className: "growth-preview__empty-icon" }, "♧"),
            h(
              Text,
              null,
              loading ? "正在加载今日成长…" : "今天暂无新的成长记录",
            ),
          ),
    ),
  );
}

function syncCommunicationBadge(noticeItems, conversationItems) {
  const pending = noticeItems.filter((item) => !item.confirmedAt).length;
  const unread = conversationItems.reduce(
    (total, item) => total + Number(item.unreadCount || 0),
    0,
  );
  const total = pending + unread;
  const task = total
    ? Taro.setTabBarBadge({
        index: 2,
        text: total > 99 ? "99+" : String(total),
      })
    : Taro.removeTabBarBadge({ index: 2 });
  Promise.resolve(task).catch(() => undefined);
}

function pickupStatusCard(pickup, onClick) {
  const latest = pickup?.events?.[pickup.events.length - 1];
  const status = pickup?.status || "waiting_pickup";
  const detail =
    status === "left"
      ? `${timeText(latest?.happenedAt)} · ${pickupRelationshipText(latest?.relationshipSnapshot)} ${latest?.pickupPersonNameSnapshot || ""}接走`
      : status === "in_care"
        ? latest?.arrivalMethod === "parent_delivered" &&
          latest?.pickupPersonNameSnapshot
          ? `${timeText(latest?.happenedAt)} · ${pickupRelationshipText(latest.relationshipSnapshot)} ${latest.pickupPersonNameSnapshot}送达`
          : `${timeText(latest?.happenedAt)} · 已进入托管照护`
        : status === "picked_up"
          ? `${timeText(latest?.happenedAt)} · 正在前往锐之博`
          : status === "absent"
            ? `今日请假 / 缺勤${pickup?.absenceRemark ? ` · ${pickup.absenceRemark}` : ""}`
            : "尚未登记今日接送节点";
  return h(
    View,
    {
      className: `home-pickup home-pickup--${status}${latest?.isException ? " home-pickup--exception" : ""}`,
      onClick,
    },
    h(
      View,
      { className: "home-pickup__main" },
      h(Text, { className: "home-pickup__eyebrow" }, "今日接送"),
      h(Text, { className: "home-pickup__status" }, pickupStatusText(status)),
      h(Text, { className: "home-pickup__detail" }, detail),
      latest?.teacher?.name
        ? h(
            Text,
            { className: "home-pickup__handler" },
            `经办：${latest.teacher.name}`,
          )
        : null,
      latest?.isException
        ? h(
            Text,
            { className: "home-pickup__warning" },
            "⚠ 临时或异常接送，点击查看处理记录",
          )
        : null,
    ),
    h(Text, { className: "home-pickup__arrow" }, "查看记录 ›"),
  );
}

function workflowTodayCard(workflow, loading) {
  const timeline = workflow?.timeline || [];
  const summary = workflow?.summary || {};
  return h(
    View,
    { className: "home-workflow" },
    h(
      View,
      { className: "home-workflow__heading" },
      h(
        View,
        null,
        h(Text, { className: "home-workflow__eyebrow" }, "今日托管进度"),
        h(
          Text,
          { className: "home-workflow__title" },
          workflow?.isAbsent
            ? "今日已登记缺勤"
            : `${Number(summary.completed || 0)} 项已完成`,
        ),
      ),
      h(
        Text,
        { className: "home-workflow__count" },
        `${Number(summary.completed || 0)}/${Number(summary.total || 0)}`,
      ),
    ),
    timeline.length
      ? h(
          View,
          { className: "home-workflow__timeline" },
          ...timeline.map((item) =>
            h(
              View,
              { className: "home-workflow__item", key: item.id },
              h(
                Text,
                {
                  className: `home-workflow__icon home-workflow__icon--${item.effectiveStatus}`,
                },
                workflowStatusIcon(item.effectiveStatus),
              ),
              h(
                View,
                { className: "home-workflow__main" },
                h(Text, { className: "home-workflow__name" }, item.name),
                item.remark
                  ? h(Text, { className: "home-workflow__remark" }, item.remark)
                  : null,
                item.photoUrls?.length
                  ? h(
                      View,
                      { className: "home-workflow__photos" },
                      ...item.photoUrls.map((url) =>
                        h(Image, {
                          className: "home-workflow__photo",
                          key: url,
                          src: resolveApiAssetUrl(url),
                          mode: "aspectFill",
                          onClick: () =>
                            Taro.previewImage({
                              current: resolveApiAssetUrl(url),
                              urls: item.photoUrls.map(resolveApiAssetUrl),
                            }),
                        }),
                      ),
                    )
                  : null,
              ),
              h(
                View,
                { className: "home-workflow__result" },
                h(
                  Text,
                  { className: "home-workflow__status" },
                  workflowStatusLabel(item.effectiveStatus),
                ),
                item.completedAt
                  ? h(
                      Text,
                      { className: "home-workflow__time" },
                      timeText(item.completedAt),
                    )
                  : null,
              ),
            ),
          ),
        )
      : h(
          Text,
          { className: "home-workflow__empty" },
          loading ? "正在加载今日托管进度…" : "今天暂无托管流程记录",
        ),
  );
}

function careTodayCard(care, loading) {
  const meals = [
    ["点心", care?.meal?.snack],
    ["晚餐", care?.meal?.dinner],
  ].filter(([, record]) => record);
  const exceptions = care?.exceptions || [];
  const attention = exceptions.filter((item) => item.needsAttention);
  return h(
    View,
    { className: "home-care" },
    h(
      View,
      { className: "home-care__heading" },
      h(
        View,
        null,
        h(Text, { className: "home-care__eyebrow" }, "今日生活"),
        h(
          Text,
          { className: "home-care__title" },
          attention.length
            ? `⚠ ${attention.length} 项需要关注`
            : "生活照护记录",
        ),
      ),
      h(
        Text,
        {
          className: attention.length
            ? "home-care__status home-care__status--attention"
            : "home-care__status",
        },
        attention.length ? "请留意" : "今日",
      ),
    ),
    h(
      View,
      { className: "home-care__summary" },
      meals.length
        ? meals.map(([label, record]) =>
            careSummaryItem(
              label,
              mealCareText(record.value),
              record.happenedAt,
            ),
          )
        : careSummaryItem("用餐", loading ? "加载中" : "未记录"),
      careSummaryItem(
        "饮水",
        care?.water?.count ? `${care.water.count} 次` : "未记录",
        care?.water?.lastAt,
      ),
      careSummaryItem(
        "休息",
        restCareText(care?.rest),
        care?.rest?.happenedAt,
      ),
      careSummaryItem(
        "情绪",
        moodCareText(care?.mood?.value),
        care?.mood?.happenedAt,
        ["low", "upset"].includes(care?.mood?.value) ? "attention" : "",
      ),
    ),
    exceptions.length
      ? h(
          View,
          { className: "home-care__attention-list" },
          ...exceptions.map((item) =>
            h(
              View,
              {
                className: `home-care__attention${item.needsAttention ? " home-care__attention--urgent" : ""}`,
                key: item.id,
              },
              h(
                View,
                { className: "home-care__attention-heading" },
                h(
                  Text,
                  { className: "home-care__attention-title" },
                  item.needsAttention ? "⚠ 需要关注" : "生活情况记录",
                ),
                h(
                  Text,
                  { className: "home-care__attention-time" },
                  timeText(item.happenedAt),
                ),
              ),
              h(
                Text,
                { className: "home-care__attention-remark" },
                item.remark,
              ),
              item.resolution
                ? h(
                    Text,
                    { className: "home-care__attention-resolution" },
                    `老师处理：${item.resolution}`,
                  )
                : null,
              item.teacher?.name
                ? h(
                    Text,
                    { className: "home-care__attention-teacher" },
                    `记录：${item.teacher.name}`,
                  )
                : null,
              item.photoUrls?.length
                ? h(
                    View,
                    { className: "home-care__photos" },
                    ...item.photoUrls.map((url) =>
                      h(Image, {
                        key: url,
                        className: "home-care__photo",
                        src: resolveApiAssetUrl(url),
                        mode: "aspectFill",
                        onClick: () =>
                          Taro.previewImage({
                            current: resolveApiAssetUrl(url),
                            urls: item.photoUrls.map(resolveApiAssetUrl),
                          }),
                      }),
                    ),
                  )
                : null,
            ),
          ),
        )
      : null,
  );
}

function careSummaryItem(label, value, happenedAt, tone = "") {
  return h(
    View,
    {
      className: `home-care__item${tone ? ` home-care__item--${tone}` : ""}`,
    },
    h(Text, { className: "home-care__item-label" }, label),
    h(Text, { className: "home-care__item-value" }, value),
    happenedAt
      ? h(Text, { className: "home-care__item-time" }, timeText(happenedAt))
      : null,
  );
}

function mealCareText(value) {
  return (
    {
      good: "吃得很好",
      normal: "正常",
      little: "吃得较少",
      refused: "未进食",
    }[value] || "未记录"
  );
}

function restCareText(record) {
  if (!record) return "未记录";
  const label =
    {
      slept: "已睡眠",
      rested: "已休息",
      no_rest: "未休息",
    }[record.value] || record.value;
  return `${label}${record.durationMinutes ? ` ${record.durationMinutes} 分钟` : ""}`;
}

function moodCareText(value) {
  return (
    {
      good: "愉快",
      normal: "平稳",
      low: "低落",
      upset: "明显不开心",
    }[value] || "未记录"
  );
}

function quickItem(icon, title, description, tone, onClick) {
  return h(
    View,
    { className: "parent-quick-item", onClick },
    h(
      Text,
      { className: `parent-quick-item__icon parent-quick-item__icon--${tone}` },
      icon,
    ),
    h(Text, { className: "parent-quick-item__title" }, title),
    h(Text, { className: "parent-quick-item__description" }, description),
  );
}

function childDisplayName(children, child) {
  const matches = children.filter((item) => item.name === child.name);
  if (matches.length <= 1) return child.name;
  return `${child.name}（${matches.findIndex((item) => item.id === child.id) + 1}）`;
}

function homeHeading(title, action, onClick) {
  return h(
    View,
    { className: "parent-section-heading" },
    h(Text, { className: "parent-section-heading__title" }, title),
    h(Text, { className: "parent-section-heading__action", onClick }, action),
  );
}

function reminderRow(title, description, badge, tone, onClick) {
  return h(
    View,
    { className: "reminder-row", onClick },
    h(View, { className: `reminder-row__bar reminder-row__bar--${tone}` }),
    h(
      View,
      { className: "reminder-row__main" },
      h(Text, { className: "reminder-row__title" }, title),
      h(Text, { className: "reminder-row__description" }, description),
    ),
    h(
      Text,
      { className: `reminder-row__badge reminder-row__badge--${tone}` },
      badge,
    ),
  );
}

function recordTypeText(type) {
  const labels = {
    workflow: "流程记录",
    teacher_feedback: "老师反馈",
    homework: "作业记录",
    attendance: "出勤记录",
  };
  return labels[type] || "成长记录";
}

function recordIcon(type) {
  return (
    { workflow: "✓", teacher_feedback: "♡", homework: "✎", attendance: "⌂" }[
      type
    ] || "•"
  );
}

function recordTone(type, index) {
  return (
    {
      workflow: "green",
      teacher_feedback: "coral",
      homework: "yellow",
      attendance: "blue",
    }[type] || ["green", "blue", "yellow"][index % 3]
  );
}

function shortDate(value) {
  if (!value) return "今天";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`;
}

function pickupStatusText(status) {
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

function pickupRelationshipText(value) {
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

function timeText(value) {
  if (!value) return "今日";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function workflowStatusLabel(status) {
  return (
    {
      pending: "待处理",
      completed: "已完成",
      skipped: "已跳过",
      exception: "异常",
      absent: "缺勤",
    }[status] || "待处理"
  );
}

function workflowStatusIcon(status) {
  return (
    {
      pending: "○",
      completed: "✓",
      skipped: "—",
      exception: "!",
      absent: "休",
    }[status] || "○"
  );
}
