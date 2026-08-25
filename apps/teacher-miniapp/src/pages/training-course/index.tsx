// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { Button, Image, RichText, Text, Video, View } from "@tarojs/components";
import Taro, {
  useDidHide,
  useDidShow,
  usePullDownRefresh,
  useUnload,
} from "@tarojs/taro";
import { teacherRequest } from "../../api";
import { resolveApiAssetUrl } from "../../config";
import "./index.scss";

const rates = [0.75, 1, 1.25, 1.5, 2];

export default function TrainingCoursePage() {
  const courseId = Taro.getCurrentInstance().router?.params?.id || "";
  const [detail, setDetail] = useState(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [assets, setAssets] = useState({});
  const [answers, setAnswers] = useState({});
  const [rate, setRate] = useState(1);
  const [quizResult, setQuizResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sessionRef = useRef(null);
  const visibleRef = useRef(true);
  const lastInteractionRef = useRef(Date.now());
  const videoPositionRef = useRef(0);
  const videoDurationRef = useRef(0);
  const lastSentPositionRef = useRef(0);
  const rateRef = useRef(1);

  async function load(startSession = false) {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      const next = await teacherRequest(`/teacher/training/courses/${courseId}`);
      setDetail(next);
      const chapters = next.course.snapshot.chapters || [];
      const progress = next.course.attempt.chapterProgress || [];
      const firstIncomplete = chapters.findIndex(
        (chapter) => !progress.some((item) => item.chapterKey === chapter.key && item.completedAt),
      );
      const nextIndex = firstIncomplete >= 0 ? firstIncomplete : Math.max(0, chapters.length - 1);
      setChapterIndex((current) => (current < chapters.length ? current : nextIndex));
      await loadAssetUrls(chapters);
      if (startSession && chapters.length) {
        await activateChapter(next, nextIndex);
        setChapterIndex(nextIndex);
      }
    } catch (cause) {
      setError(errorMessage(cause, "课程加载失败"));
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  async function loadAssetUrls(chapters) {
    const ids = [...new Set(chapters.flatMap((chapter) => chapter.media.map((media) => media.fileAssetId)))];
    const pairs = await Promise.all(
      ids.map(async (id) => {
        const result = await teacherRequest(`/files/training/${id}/access`);
        return [id, resolveApiAssetUrl(result.url)];
      }),
    );
    setAssets(Object.fromEntries(pairs));
  }

  async function activateChapter(source, index) {
    await sendHeartbeat(true).catch(() => undefined);
    const chapter = source.course.snapshot.chapters[index];
    if (!chapter) return;
    if (!isLearnableAssignment(source.assignmentStatus) || !isLearnableStatus(source.course.status)) {
      sessionRef.current = null;
      return;
    }
    const progress = source.course.attempt.chapterProgress.find((item) => item.chapterKey === chapter.key);
    const kind = chapter.media.some((media) => media.type === "video") ? "video" : "content";
    const clientSessionId = `training-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const session = await teacherRequest(`/teacher/training/courses/${courseId}/study/start`, {
      method: "POST",
      data: { clientSessionId, chapterKey: chapter.key, kind },
    });
    sessionRef.current = { ...session, clientSessionId, kind, chapterKey: chapter.key };
    videoPositionRef.current = Number(progress?.videoPositionSeconds || 0);
    lastSentPositionRef.current = videoPositionRef.current;
    videoDurationRef.current = Number(progress?.videoDurationSeconds || chapter.media.find((x)=>x.type === "video")?.durationSeconds || 0);
    lastInteractionRef.current = Date.now();
  }

  async function sendHeartbeat(ended = false) {
    const session = sessionRef.current;
    if (!session) return;
    const active = Date.now() - lastInteractionRef.current < 5 * 60 * 1000;
    const data = {
      clientSessionId: session.clientSessionId,
      visible: visibleRef.current,
      active: visibleRef.current && active,
      ended,
    };
    if (session.kind === "video" && videoDurationRef.current > 0) {
      data.videoPositionSeconds = videoPositionRef.current;
      data.videoDurationSeconds = videoDurationRef.current;
      data.watchedFrom = lastSentPositionRef.current;
      data.watchedTo = videoPositionRef.current;
      data.playbackRate = rateRef.current;
    }
    await teacherRequest("/teacher/training/study/heartbeat", { method: "POST", data });
    lastSentPositionRef.current = videoPositionRef.current;
    if (ended) sessionRef.current = null;
  }

  async function changeChapter(index) {
    if (!detail || index === chapterIndex) return;
    setChapterIndex(index);
    await activateChapter(detail, index).catch((cause) =>
      Taro.showToast({ title: errorMessage(cause, "章节打开失败"), icon: "none" }),
    );
  }

  async function completeChapter() {
    const chapter = detail?.course.snapshot.chapters[chapterIndex];
    if (!chapter) return;
    try {
      await sendHeartbeat(false);
      await teacherRequest(`/teacher/training/courses/${courseId}/chapters/complete`, {
        method: "POST",
        data: { chapterKey: chapter.key },
      });
      Taro.showToast({ title: "本节已完成", icon: "success" });
      await load(false);
      const nextIndex = Math.min(chapterIndex + 1, detail.course.snapshot.chapters.length - 1);
      if (nextIndex !== chapterIndex) await changeChapter(nextIndex);
    } catch (cause) {
      Taro.showToast({ title: errorMessage(cause, "暂不能完成本节"), icon: "none" });
    }
  }

  async function submitQuiz() {
    const quiz = detail?.course.snapshot.quiz;
    if (!quiz) return;
    if (quiz.questions.some((question) => !(answers[question.id]?.length))) {
      Taro.showToast({ title: "请完成全部题目", icon: "none" });
      return;
    }
    try {
      const result = await teacherRequest(`/teacher/training/courses/${courseId}/quiz`, {
        method: "POST",
        data: {
          answers: quiz.questions.map((question) => ({
            questionId: question.id,
            answerIds: answers[question.id],
          })),
        },
      });
      setQuizResult(result);
      Taro.showModal({
        title: result.passed ? "测验通过" : "测验未通过",
        content: `${result.score} 分${result.attemptsRemaining === null ? "" : `，剩余 ${result.attemptsRemaining} 次`}`,
        showCancel: false,
      });
      await load(false);
    } catch (cause) {
      Taro.showToast({ title: errorMessage(cause, "测验提交失败"), icon: "none" });
    }
  }

  function choose(question, optionId) {
    lastInteractionRef.current = Date.now();
    const current = answers[question.id] || [];
    const next = question.type === "multiple_choice"
      ? current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
      : [optionId];
    setAnswers({ ...answers, [question.id]: next });
  }

  function changeRate(value, mediaId) {
    rateRef.current = value;
    setRate(value);
    lastInteractionRef.current = Date.now();
    try { Taro.createVideoContext(`training-video-${mediaId}`).playbackRate(value); } catch { /* platform fallback */ }
  }

  useDidShow(() => {
    visibleRef.current = true;
    lastInteractionRef.current = Date.now();
    if (!detail) void load(true);
  });
  usePullDownRefresh(() => void load(false));
  useDidHide(() => {
    visibleRef.current = false;
    const chapter = detail?.course.snapshot.chapters[chapterIndex];
    chapter?.media.filter((x)=>x.type === "video").forEach((media)=>Taro.createVideoContext(`training-video-${media.id}`).pause());
    void sendHeartbeat(false);
  });
  useUnload(() => void sendHeartbeat(true));
  useEffect(() => {
    const timer = setInterval(() => void sendHeartbeat(false).catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, []);

  if (!detail) {
    return <View className="course-page"><Text className={error?"course-error":"course-loading"}>{error || (loading ? "正在加载课程…" : "课程不存在")}</Text></View>;
  }
  const course = detail.course;
  const snapshot = course.snapshot;
  const chapter = snapshot.chapters[chapterIndex];
  const progress = course.attempt.chapterProgress.find((item) => item.chapterKey === chapter?.key);
  const allChaptersDone = snapshot.chapters.every((item) => course.attempt.chapterProgress.some((p) => p.chapterKey === item.key && p.completedAt));
  const timePercent = snapshot.course.minimumMinutes ? Math.min(100, Math.round(course.attempt.accumulatedSeconds / (snapshot.course.minimumMinutes * 60) * 100)) : 100;

  return (
    <View className="course-page" onTouchStart={() => { lastInteractionRef.current = Date.now(); }}>
      <View className="course-header">
        <Text className="course-header__category">{snapshot.course.category} · {courseLabels(course.status)}</Text>
        <Text className="course-header__title">{snapshot.course.name}</Text>
        <Text className="course-header__summary">{snapshot.course.summary}</Text>
        <View className="course-time"><View><Text className="course-time__value">{formatDuration(course.attempt.accumulatedSeconds)}</Text><Text className="course-time__label">累计学习 / 最低 {snapshot.course.minimumMinutes} 分钟</Text></View><Text className="course-time__percent">{timePercent}%</Text></View>
        <View className="course-timebar"><View style={{width:`${timePercent}%`}} /></View>
      </View>

      <View className="course-chapter-tabs">
        {snapshot.chapters.map((item,index)=>{
          const done = course.attempt.chapterProgress.some((p)=>p.chapterKey===item.key&&p.completedAt);
          return <View key={item.key} className={`course-chapter-tab${index===chapterIndex?" course-chapter-tab--active":""}`} onClick={()=>void changeChapter(index)}><Text>{done?"✓ ":""}{index+1}</Text></View>;
        })}
      </View>

      {chapter ? <View className="course-content-card">
        <Text className="course-section-title">{chapterIndex+1}. {chapter.title}</Text>
        <RichText className="course-richtext" nodes={chapter.contentHtml} />
        {chapter.media.map((media)=>media.type === "image" ? <View className="course-media" key={media.id}><Image className="course-image" src={assets[media.fileAssetId]} mode="widthFix" showMenuByLongpress={false} /><Text className="course-media-caption">{media.caption || "课程图片"}</Text></View> : <View className="course-media" key={media.id}>
          <Video id={`training-video-${media.id}`} className="course-video" src={assets[media.fileAssetId]} controls initialTime={progress?.videoPositionSeconds || 0} showCenterPlayBtn showFullscreenBtn showCastingButton={false} onPlay={()=>{lastInteractionRef.current=Date.now();}} onPause={()=>void sendHeartbeat(false)} onTimeUpdate={(event)=>{videoPositionRef.current=event.detail.currentTime;videoDurationRef.current=event.detail.duration;lastInteractionRef.current=Date.now();}} onEnded={()=>void sendHeartbeat(false)} />
          <View className="course-rate-row"><Text>播放速度</Text>{rates.map((value)=><Text key={value} className={rate===value?"course-rate course-rate--active":"course-rate"} onClick={()=>changeRate(value,media.id)}>{value}×</Text>)}</View>
          <Text className="course-video-progress">有效观看 {Math.round(progress?.watchedPercent || 0)}%，达到 90% 后可完成本节</Text>
        </View>)}
        <Button className="course-complete-button" disabled={Boolean(progress?.completedAt)} onClick={completeChapter}>{progress?.completedAt?"本节已完成":"完成本节"}</Button>
      </View>:null}

      <View className="course-requirements">
        <Text className="course-section-title">课程完成条件</Text>
        <Requirement ok={allChaptersDone} label={`章节 ${course.attempt.chapterProgress.filter((x)=>x.completedAt).length}/${snapshot.chapters.length}`} />
        <Requirement ok={timePercent>=100} label={`最低学习时长 ${formatDuration(course.attempt.accumulatedSeconds)} / ${snapshot.course.minimumMinutes} 分钟`} />
        <Requirement ok={Boolean(course.attempt.latestQuiz?.passed)} neutral={!snapshot.quiz} label={snapshot.quiz?`测验 ${course.attempt.latestQuiz?.score ?? "未作答"} / 及格 ${snapshot.quiz.passScore}`:"无测验"} />
        <Requirement ok={Boolean(course.attempt.latestPractical?.conclusion === "passed")} neutral={!snapshot.course.requiresPractical} label={snapshot.course.requiresPractical?`实操 ${course.attempt.latestPractical?.conclusion === "passed"?"已通过":course.attempt.latestPractical?"需复训":"待带教确认"}`:"无需实操"} />
      </View>

      {course.attempt.practicalHistory?.length ? <View className="course-practical-history">
        <Text className="course-section-title">历次实操检查</Text>
        {course.attempt.practicalHistory.map((record,index)=><View className="course-practical-record" key={`${record.createdAt}-${index}`}>
          <View className="course-practical-record__header"><Text>{record.conclusion === "passed"?"通过":"需复训"}</Text><Text>{formatDate(record.createdAt)}</Text></View>
          <Text className="course-practical-record__meta">确认人：{record.reviewer?.name || "—"}</Text>
          {(Array.isArray(record.checklistResults)?record.checklistResults:[]).map((result)=><Text className="course-practical-record__item" key={result.itemId}>{result.passed?"✓":"✗"} {practicalItemName(snapshot.practicalItems,result.itemId)}{result.note?`：${result.note}`:""}</Text>)}
          <Text className="course-practical-record__comment">评语：{record.comment || "—"}</Text>
        </View>)}
      </View>:null}

      {snapshot.quiz ? <View className={`course-quiz${allChaptersDone?"":" course-quiz--locked"}`}>
        <Text className="course-section-title">课后测验</Text>
        {!allChaptersDone ? <Text className="course-quiz-lock">完成全部章节后开放测验</Text> : snapshot.quiz.questions.map((question,index)=><View className="course-question" key={question.id}><Text className="course-question__title">{index+1}. {question.prompt}{question.type === "multiple_choice"?"（多选）":""}</Text>{question.options.map((option)=><View key={option.id} className={`course-option${answers[question.id]?.includes(option.id)?" course-option--selected":""}`} onClick={()=>choose(question,option.id)}>{question.type !== "true_false" ? <Text className="course-option__key">{option.id}</Text> : null}<Text>{option.label}</Text></View>)}</View>)}
        {allChaptersDone ? <Button className="course-quiz-submit" onClick={submitQuiz}>提交测验</Button>:null}
        {quizResult ? <Text className={quizResult.passed?"course-quiz-result course-quiz-result--pass":"course-quiz-result"}>最近提交：{quizResult.score} 分，{quizResult.passed?"已通过":"未通过"}</Text>:null}
      </View>:null}

      {course.status === "awaiting_practical" ? <View className="course-waiting"><Text className="course-waiting__title">等待实操确认</Text><Text>带教负责人可多次记录检查结果；需要复训时，本课程会保持待确认状态。</Text></View>:null}
      {course.status === "awaiting_safety" ? <View className="course-waiting course-waiting--safety"><Text className="course-waiting__title">等待安全最终确认</Text><Text>全部学习与实操已完成，授权安全确认人提交责任声明后本轮培训完成。</Text></View>:null}
    </View>
  );
}

function Requirement({ ok, neutral, label }) { return <View className="course-requirement"><Text className={`course-requirement__icon${ok?" course-requirement__icon--ok":neutral?" course-requirement__icon--neutral":""}`}>{ok?"✓":neutral?"—":"○"}</Text><Text>{label}</Text></View>; }
function formatDuration(seconds) { const minutes=Math.floor(Number(seconds||0)/60); const remain=Math.floor(Number(seconds||0)%60); return `${minutes}分${remain}秒`; }
function formatDate(value) { return value ? new Date(value).toLocaleString("zh-CN",{hour12:false}) : "—"; }
function practicalItemName(items, itemId) { return items?.find((item)=>item.id === itemId)?.title || itemId; }
function errorMessage(cause, fallback) { return cause instanceof Error ? cause.message : fallback; }
const courseLabels = {available:"可学习",in_progress:"学习中",awaiting_practical:"待实操",awaiting_safety:"待安全确认",completed:"已完成",exempted:"已免修",locked:"未解锁"};
function isLearnableStatus(status) { return status === "available" || status === "in_progress"; }
function isLearnableAssignment(status) { return status === "pending" || status === "in_progress" || status === "awaiting_safety"; }
