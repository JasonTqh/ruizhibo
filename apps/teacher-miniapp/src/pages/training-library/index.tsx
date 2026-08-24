// @ts-nocheck
import React, { useState } from "react";
import { Image, RichText, Text, Video, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

export default function TrainingLibraryPage() {
  const id = Taro.getCurrentInstance().router?.params?.id || "";
  const [course, setCourse] = useState(null);
  const [assets, setAssets] = useState({});
  const [error, setError] = useState("");

  async function load() {
    try {
      const courses = await teacherRequest("/teacher/training/library");
      const selected = courses.find((item) => item.id === id);
      if (!selected) throw new Error("课程资料不存在或已停用");
      if (selected.formalLocked) throw new Error(selected.lockedReason || "请先完成上一门必修课程");
      setCourse(selected);
      const ids = [...new Set(selected.chapters.flatMap((chapter)=>chapter.media.map((media)=>media.fileAssetId)))];
      const pairs = await Promise.all(ids.map(async(assetId)=>{
        const access = await teacherRequest(`/files/training/${assetId}/access`);
        return [assetId,resolveApiAssetUrl(access.url)];
      }));
      setAssets(Object.fromEntries(pairs));
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : "课程资料加载失败");
    }
  }

  useDidShow(()=>void load());

  if (!course) return <View className="library-page"><Text className={error?"library-error":"library-loading"}>{error || "正在加载课程资料…"}</Text></View>;
  return <View className="library-page">
    <View className="library-header"><Text className="library-header__eyebrow">资料库 · 自由查阅</Text><Text className="library-header__title">{course.name}</Text><Text className="library-header__summary">{course.summary}</Text></View>
    <View className="library-notice"><Text>本页查阅不记录正式培训进度；如课程属于当前培训计划，请从“当前计划”进入。</Text></View>
    {course.chapters.map((chapter,index)=><View className="library-chapter" key={chapter.id}>
      <Text className="library-chapter__title">{index+1}. {chapter.title}</Text>
      <RichText className="library-richtext" nodes={chapter.contentHtml} />
      {chapter.media.map((media)=>media.type === "image"?<View className="library-media" key={media.id}><Image className="library-image" src={assets[media.fileAssetId]} mode="widthFix" showMenuByLongpress={false} /><Text>{media.caption || "课程图片"}</Text></View>:<View className="library-media" key={media.id}><Video className="library-video" src={assets[media.fileAssetId]} controls showCastingButton={false} /><Text>{media.caption || "课程视频"}</Text></View>)}
    </View>)}
  </View>;
}
