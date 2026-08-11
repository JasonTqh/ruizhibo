// @ts-nocheck
import React, { useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { parentRequest } from "../../api";
import "./index.scss";

const h = React.createElement;

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [nextProfile, nextChildren] = await Promise.all([
        parentRequest("/me"),
        parentRequest("/parent/children"),
      ]);
      setProfile(nextProfile);
      setChildren(nextChildren);
    } catch (loadError) {
      setError(errorMessage(loadError, "资料加载失败，请重试。"));
    } finally {
      setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  return h(
    View,
    { className: "profile-page" },
    h(
      View,
      { className: "profile-topbar" },
      h(
        View,
        null,
        h(Text, { className: "profile-eyebrow" }, "个人中心"),
        h(Text, { className: "profile-title" }, "我的资料与孩子绑定"),
      ),
      h(
        Button,
        {
          className: "profile-refresh",
          size: "mini",
          loading,
          disabled: loading,
          onClick: load,
        },
        "刷新",
      ),
    ),
    error
      ? h(
          View,
          { className: "profile-error" },
          h(Text, { className: "profile-error__text" }, error),
          h(
            Text,
            { className: "profile-error__retry", onClick: load },
            "重新加载",
          ),
        )
      : null,
    loading && !profile
      ? h(Text, { className: "profile-state" }, "正在加载个人资料…")
      : profile
        ? h(
            View,
            { className: "profile-hero" },
            h(
              View,
              { className: "profile-avatar" },
              h(Text, null, profile.name?.slice(0, 1) || "家"),
            ),
            h(
              View,
              { className: "profile-hero__main" },
              h(
                View,
                { className: "profile-name-row" },
                h(Text, { className: "profile-name" }, profile.name || "家长"),
                h(Text, { className: "profile-role" }, "家长账号"),
              ),
              h(
                Text,
                { className: "profile-phone" },
                profile.phone || "未绑定手机号",
              ),
              h(
                Text,
                { className: "profile-account-id" },
                `账号编号 · ${shortId(profile.id)}`,
              ),
            ),
          )
        : null,
    profile
      ? h(
          View,
          { className: "profile-readonly" },
          h(Text, { className: "profile-readonly__icon" }, "i"),
          h(
            View,
            { className: "profile-readonly__main" },
            h(
              Text,
              { className: "profile-readonly__title" },
              "当前资料为只读信息",
            ),
            h(
              Text,
              { className: "profile-readonly__copy" },
              "姓名、手机号及孩子绑定暂不支持在小程序内修改，如有变化请联系中心管理员。",
            ),
          ),
        )
      : null,
    profile
      ? h(
          View,
          { className: "profile-info-card" },
          h(Text, { className: "profile-section-title" }, "账号资料"),
          profileInfoRow("家长姓名", profile.name || "--"),
          profileInfoRow("手机号码", profile.phone || "未绑定"),
          profileInfoRow("账号角色", "学生家长"),
          profileInfoRow("资料状态", "正常使用", "green"),
        )
      : null,
    profile
      ? h(
          View,
          { className: "profile-children-section" },
          h(
            View,
            { className: "profile-section-heading" },
            h(Text, { className: "profile-section-title" }, "已绑定孩子"),
            h(
              Text,
              { className: "profile-section-count" },
              `${children.length} 人`,
            ),
          ),
          children.length
            ? children.map((child) =>
                h(
                  View,
                  { className: "profile-child-card", key: child.id },
                  h(
                    View,
                    { className: "profile-child-heading" },
                    h(
                      View,
                      { className: "profile-child-avatar" },
                      h(Text, null, child.name.slice(0, 1)),
                    ),
                    h(
                      View,
                      { className: "profile-child-main" },
                      h(
                        Text,
                        { className: "profile-child-name" },
                        childDisplayName(children, child),
                      ),
                      h(
                        Text,
                        { className: "profile-child-class" },
                        child.class?.name || "暂未分班",
                      ),
                    ),
                    h(
                      Text,
                      { className: "profile-relation" },
                      child.relation || "家长",
                    ),
                  ),
                  h(
                    View,
                    { className: "profile-child-details" },
                    childDetail("性别", child.gender || "未填写"),
                    childDetail("生日", formatBirthday(child.birthday)),
                    childDetail("状态", studentStatusText(child.status)),
                  ),
                ),
              )
            : h(
                View,
                { className: "profile-empty" },
                h(Text, { className: "profile-empty__title" }, "尚未绑定孩子"),
                h(
                  Text,
                  { className: "profile-empty__copy" },
                  "请联系中心管理员建立家长与孩子的绑定关系。",
                ),
              ),
        )
      : null,
    profile
      ? h(
          View,
          { className: "profile-help-card" },
          h(Text, { className: "profile-help-title" }, "需要修改资料？"),
          h(
            Text,
            { className: "profile-help-copy" },
            "为保障孩子信息安全，绑定关系和关键信息由中心管理员统一维护。",
          ),
          h(Text, { className: "profile-help-tag" }, "请联系托管中心管理员"),
        )
      : null,
  );
}

function profileInfoRow(label, value, tone) {
  return h(
    View,
    { className: "profile-info-row" },
    h(Text, { className: "profile-info-label" }, label),
    h(
      Text,
      {
        className: `profile-info-value${tone ? ` profile-info-value--${tone}` : ""}`,
      },
      value,
    ),
  );
}

function childDetail(label, value) {
  return h(
    View,
    { className: "profile-child-detail" },
    h(Text, { className: "profile-child-detail__label" }, label),
    h(Text, { className: "profile-child-detail__value" }, value),
  );
}

function childDisplayName(children, child) {
  const matches = children.filter((item) => item.name === child.name);
  if (matches.length <= 1) return child.name;
  return `${child.name}（${matches.findIndex((item) => item.id === child.id) + 1}）`;
}

function shortId(id) {
  if (!id) return "--";
  return id.length <= 8 ? id : id.slice(-8).toUpperCase();
}

function formatBirthday(value) {
  if (!value) return "未填写";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未填写";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function studentStatusText(status) {
  return (
    { active: "在读", inactive: "已停用", graduated: "已结业" }[status] ||
    "未知"
  );
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
