// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Button, Image, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { parentRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const h = React.createElement;
const MAX_IMAGE_COUNT = 3;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

export default function ChatPage() {
  const router = useRouter();
  const params = router?.params || {};
  const conversationId = params.conversationId || "";
  const [messages, setMessages] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [scrollTarget, setScrollTarget] = useState("message-list-end");

  useEffect(() => {
    if (!params.title) return;
    try {
      Taro.setNavigationBarTitle({ title: decodeURIComponent(params.title) });
    } catch {
      Taro.setNavigationBarTitle({ title: "沟通详情" });
    }
  }, [params.title]);

  async function load(showLoading = true) {
    if (!conversationId) {
      setError("会话参数缺失，请返回重试。");
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [nextMessages, me] = await Promise.all([
        parentRequest(`/parent/conversations/${conversationId}/messages`),
        currentUserId ? Promise.resolve({ id: currentUserId }) : parentRequest("/me"),
      ]);
      setMessages(nextMessages);
      setCurrentUserId(me.id);
      scrollToLatest(nextMessages);
    } catch (loadError) {
      setError(errorMessage(loadError, "消息加载失败，请重试。"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useDidShow(() => {
    load();
  });

  async function send() {
    if (sending || uploading || !conversationId) return;
    const nextContent = content.trim();
    if (!nextContent) {
      Taro.showToast({ title: "请输入消息内容", icon: "none" });
      return;
    }
    setSending(true);
    setError("");
    try {
      await parentRequest(`/parent/conversations/${conversationId}/messages`, {
        method: "POST",
        data: { content: nextContent },
      });
      setContent("");
      await load(false);
    } catch (sendError) {
      setError(errorMessage(sendError, "发送失败，输入内容已保留。"));
    } finally {
      setSending(false);
    }
  }

  async function chooseAndSendImages() {
    if (sending || uploading || !conversationId) return;
    try {
      const result = await Taro.chooseMedia({
        count: MAX_IMAGE_COUNT,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const files = result.tempFiles || [];
      const validFiles = files.filter(
        (file) => Number(file.size || 0) <= MAX_UPLOAD_SIZE,
      );
      if (validFiles.length !== files.length) {
        Taro.showToast({ title: "单张图片不能超过 10 MB", icon: "none" });
      }
      if (!validFiles.length) return;

      setUploading(true);
      setError("");
      const fileUrls = [];
      for (const file of validFiles) {
        const asset = await uploadMessageImage(file.tempFilePath);
        fileUrls.push(asset.url);
      }
      await parentRequest(`/parent/conversations/${conversationId}/messages`, {
        method: "POST",
        data: { kind: "image", fileUrls },
      });
      await load(false);
    } catch (uploadError) {
      if (!String(uploadError?.errMsg || uploadError).includes("cancel")) {
        setError(errorMessage(uploadError, "图片发送失败，请重试。"));
      }
    } finally {
      setUploading(false);
    }
  }

  function scrollToLatest(nextMessages = messages) {
    const lastMessage = nextMessages[nextMessages.length - 1];
    const target = lastMessage ? `message-${lastMessage.id}` : "message-list-end";
    setScrollTarget("");
    Taro.nextTick(() => setScrollTarget(target));
  }

  return h(
    View,
    { className: "parent-chat-page" },
    h(
      View,
      { className: "parent-chat-status" },
      h(
        View,
        { className: "parent-chat-status__copy" },
        h(Text, { className: "parent-chat-status__title" }, "与老师沟通"),
        h(Text, { className: "parent-chat-status__hint" }, "进入会话后，老师消息会自动标记为已读"),
      ),
      h(
        Button,
        {
          className: "parent-chat-refresh",
          size: "mini",
          loading,
          disabled: loading,
          onClick: () => load(),
        },
        "刷新",
      ),
    ),
    error
      ? h(
          View,
          { className: "parent-chat-feedback parent-chat-feedback--error" },
          h(Text, null, error),
        )
      : null,
    h(
      ScrollView,
      {
        className: "parent-chat-scroll",
        scrollY: true,
        scrollWithAnimation: true,
        scrollIntoView: scrollTarget,
        enhanced: true,
        showScrollbar: false,
      },
      h(
        View,
        { className: "parent-chat-list" },
        loading && messages.length === 0
          ? h(Text, { className: "parent-chat-feedback" }, "正在加载消息…")
          : null,
        !loading && !error && messages.length === 0
          ? h(
              View,
              { className: "parent-chat-empty" },
              h(Text, { className: "parent-chat-empty__title" }, "开始一次家校沟通"),
              h(Text, { className: "parent-chat-empty__text" }, "可以向老师询问孩子的学习与在校情况。"),
            )
          : null,
        messages.map((message) => {
          const isOwn = message.senderId === currentUserId;
          const imageUrls =
            message.kind === "image" ? message.fileUrls || [] : [];
          return h(
            View,
            {
              id: `message-${message.id}`,
              className: `parent-chat-message${isOwn ? " parent-chat-message--own" : ""}`,
              key: message.id,
            },
            h(
              View,
              {
                className: `parent-chat-bubble${isOwn ? " parent-chat-bubble--own" : ""}${imageUrls.length ? " parent-chat-bubble--image" : ""}`,
              },
              imageUrls.length
                ? h(
                    View,
                    { className: "parent-chat-image-grid" },
                    imageUrls.map((url) =>
                      h(Image, {
                        className: "parent-chat-image",
                        key: url,
                        src: resolveApiAssetUrl(url),
                        mode: "aspectFill",
                        onClick: () => previewImages(imageUrls, url),
                      }),
                    ),
                  )
                : null,
              !imageUrls.length || (message.content && message.content !== "[图片]")
                ? h(Text, { className: "parent-chat-content" }, message.content)
                : null,
            ),
            h(
              Text,
              { className: "parent-chat-meta" },
              `${formatMessageTime(message.createdAt)}${isOwn ? ` · ${message.readAt ? "已读" : "未读"}` : ""}`,
            ),
          );
        }),
        h(View, { id: "message-list-end", className: "parent-chat-list-end" }),
      ),
    ),
    h(
      View,
      { className: "parent-chat-composer" },
      h(
        Button,
        {
          className: "parent-chat-image-button",
          loading: uploading,
          disabled: sending || uploading || !conversationId,
          onClick: chooseAndSendImages,
        },
        uploading ? "上传" : "图片",
      ),
      h(
        View,
        { className: "parent-chat-input-wrap" },
        h(Textarea, {
          className: "parent-chat-input",
          value: content,
          maxlength: 2000,
          autoHeight: true,
          adjustPosition: true,
          cursorSpacing: 18,
          confirmType: "send",
          confirmHold: false,
          disabled: sending || uploading || !conversationId,
          placeholder: "输入想对老师说的话",
          onInput: (event) => setContent(event.detail.value),
          onConfirm: send,
          onFocus: () => scrollToLatest(),
        }),
        content.length > 1600
          ? h(Text, { className: "parent-chat-count" }, `${content.length}/2000`)
          : null,
      ),
      h(
        Button,
        {
          className: "parent-chat-send",
          loading: sending,
          disabled: sending || uploading || !conversationId || !content.trim(),
          onClick: send,
        },
        sending ? "发送中" : "发送",
      ),
    ),
  );
}

function previewImages(urls, current) {
  Taro.previewImage({
    current: resolveApiAssetUrl(current),
    urls: urls.map(resolveApiAssetUrl),
  });
}

async function uploadMessageImage(path) {
  const base64 = await readFileAsBase64(path);
  const size = base64ByteLength(base64);
  if (size > MAX_UPLOAD_SIZE) {
    throw new Error("单张图片不能超过 10 MB");
  }
  return parentRequest("/files", {
    method: "POST",
    data: {
      fileName: fileNameFromPath(path),
      mimeType: imageMimeType(base64),
      base64,
      size,
      scene: "message",
    },
  });
}

function readFileAsBase64(path) {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath: path,
      encoding: "base64",
      success: (result) => resolve(result.data),
      fail: reject,
    });
  });
}

function fileNameFromPath(path) {
  return path.split(/[\\/]/).pop() || `message-${Date.now()}.jpg`;
}

function imageMimeType(base64) {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  throw new Error("仅支持 JPG、PNG、WebP 或 GIF 图片");
}

function base64ByteLength(base64) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
