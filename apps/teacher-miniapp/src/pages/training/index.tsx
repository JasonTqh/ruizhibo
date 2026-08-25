// @ts-nocheck
import React, { useRef, useState } from "react";
import { Button, Input, Switch, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { teacherRequest } from "../../api";
import "./index.scss";

const assignmentLabels = {
  pending: "待开始",
  in_progress: "进行中",
  awaiting_safety: "待安全确认",
  completed: "已完成",
  frozen: "已冻结",
  terminated: "已终止",
};

const courseLabels = {
  locked: "未解锁",
  available: "可学习",
  in_progress: "学习中",
  awaiting_practical: "待实操确认",
  awaiting_safety: "待安全确认",
  completed: "已完成",
  exempted: "已免修",
};

const safetyLabels = {
  not_obtained: "尚未取得",
  awaiting_confirmation: "等待最终确认",
  valid: "有效",
  expiring: "即将到期",
  retraining_required: "需要复训",
};

export default function TrainingPage() {
  const [home, setHome] = useState(null);
  const [plan, setPlan] = useState(null);
  const [library, setLibrary] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [practical, setPractical] = useState([]);
  const [tab, setTab] = useState("plan");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState({ rating: 5, reflection: "", suggestion: "" });
  const [practicalTarget, setPracticalTarget] = useState(null);
  const [practicalDraft, setPracticalDraft] = useState({
    conclusion: "passed",
    checks: {},
    comment: "",
  });
  const loadingRef = useRef(false);

  async function load(query = search) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const nextHome = await teacherRequest("/teacher/training/home");
      setHome(nextHome);
      if (!nextHome.enabled) {
        setPlan(null);
        setLibrary([]);
        return;
      }
      const tasks = [
        nextHome.assignment
          ? teacherRequest("/teacher/training/current")
          : Promise.resolve(null),
        teacherRequest(`/teacher/training/library${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`),
        teacherRequest("/teacher/training/notifications"),
        teacherRequest("/teacher/training/practical/pending").catch(() => []),
      ];
      const [nextPlan, nextLibrary, nextNotifications, nextPractical] =
        await Promise.all(tasks);
      setPlan(nextPlan);
      setLibrary(nextLibrary);
      setNotifications(nextNotifications);
      setPractical(nextPractical);
    } catch (cause) {
      setError(message(cause, "教师学院加载失败"));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => void load());
  usePullDownRefresh(() => void load());

  async function submitFeedback() {
    if (!home?.feedbackInvitation) return;
    try {
      await teacherRequest(
        `/teacher/training/assignments/${home.feedbackInvitation.id}/feedback`,
        { method: "POST", data: feedback },
      );
      setFeedbackOpen(false);
      Taro.showToast({ title: "感谢你的反馈", icon: "success" });
      await load();
    } catch (cause) {
      Taro.showToast({ title: message(cause, "提交失败"), icon: "none" });
    }
  }

  function openPractical(item) {
    const items = item.snapshot?.payload?.practicalItems || [];
    setPracticalDraft({
      conclusion: "passed",
      checks: Object.fromEntries(items.map((entry) => [entry.id, true])),
      comment: "",
    });
    setPracticalTarget(item);
  }

  async function submitPractical() {
    if (!practicalTarget || !practicalDraft.comment.trim()) {
      Taro.showToast({ title: "请填写检查评语", icon: "none" });
      return;
    }
    const items = practicalTarget.snapshot?.payload?.practicalItems || [];
    if (
      practicalDraft.conclusion === "passed" &&
      items.some(
        (item) => item.isRequired && !practicalDraft.checks[item.id],
      )
    ) {
      Taro.showToast({ title: "必填项目未全部通过", icon: "none" });
      return;
    }
    try {
      await teacherRequest(`/teacher/training/practical/${practicalTarget.id}`, {
        method: "POST",
        data: {
          conclusion: practicalDraft.conclusion,
          comment: practicalDraft.comment.trim(),
          checklist: items.map((item) => ({
            itemId: item.id,
            passed: Boolean(practicalDraft.checks[item.id]),
          })),
        },
      });
      setPracticalTarget(null);
      Taro.showToast({ title: "实操检查已记录", icon: "success" });
      await load();
    } catch (cause) {
      Taro.showToast({ title: message(cause, "提交失败"), icon: "none" });
    }
  }

  if (!loading && home && !home.enabled) {
    return (
      <View className="training-page training-empty-page">
        <Text className="training-empty-icon">学</Text>
        <Text className="training-empty-title">教师学院暂未开放</Text>
        <Text className="training-empty-copy">校区启用后入口会自动恢复，既有数据不会删除。</Text>
      </View>
    );
  }

  return (
    <View className="training-page">
      <View className="training-hero">
        <Text className="training-hero__eyebrow">锐之博教师学院</Text>
        <Text className="training-hero__title">把每一步成长，学得扎实</Text>
        <Text className="training-hero__copy">
          {plan
            ? `第 ${plan.roundNumber} 轮 · ${assignmentLabels[plan.status] || plan.status}`
            : "当前没有进行中的培训任务，仍可查阅资料库"}
        </Text>
        {plan ? (
          <View className="training-progress-block">
            <View className="training-progress-meta">
              <Text>{plan.completedCourses}/{plan.totalCourses} 门课程</Text>
              <Text>{plan.progressPercent}%</Text>
            </View>
            <View className="training-progress"><View className="training-progress__bar" style={{ width: `${plan.progressPercent}%` }} /></View>
            <Text className="training-deadline">截止：{formatDate(plan.dueAt)}{plan.deadlineStatus === "overdue" ? " · 已逾期，可继续学习" : plan.deadlineStatus === "due_soon" ? " · 即将到期" : ""}</Text>
          </View>
        ) : null}
      </View>

      {error ? <View className="training-error"><Text>{error}</Text><Text onClick={() => void load()}>重新加载</Text></View> : null}

      {home?.enabled ? <View className={`training-safety-card training-safety-card--${home.safety?.status || "not_obtained"}`}>
        <View><Text className="training-safety-card__eyebrow">安全培训状态</Text><Text className="training-safety-card__title">{safetyLabels[home.safety?.status || "not_obtained"]}</Text><Text className="training-safety-card__copy">{home.safety?.validUntil?`有效期至 ${formatDate(home.safety.validUntil)}`:home.safety?.status === "awaiting_confirmation"?"学习与实操已完成，等待授权负责人最终确认":"完成安全课程、测验、实操及最终确认后取得"}</Text></View>
        {home.safety?.status === "expiring" || home.safety?.status === "retraining_required" ? <Text className="training-safety-card__badge">复训</Text> : null}
      </View> : null}

      {home?.feedbackInvitation ? (
        <View className="training-feedback-invite" onClick={() => setFeedbackOpen(true)}>
          <View><Text className="training-feedback-invite__title">{home.feedbackInvitation.roundNumber ? `第 ${home.feedbackInvitation.roundNumber} 轮培训已完成 🎉` : "已有培训轮次完成 🎉"}</Text><Text className="training-feedback-invite__copy">欢迎留下总体评分和建议，也可以稍后填写</Text></View>
          <Text className="training-arrow">›</Text>
        </View>
      ) : null}

      <View className="training-tabs">
        {[["plan","当前计划"],["library","资料库"],["notice",`提醒 ${home?.unreadNotifications || 0}`],["mentor",`带教 ${practical.length}`]].map(([key,label])=><View key={key} className={`training-tab${tab===key?" training-tab--active":""}`} onClick={()=>setTab(key)}><Text>{label}</Text></View>)}
      </View>

      {tab === "plan" ? <PlanView plan={plan} loading={loading} /> : null}
      {tab === "library" ? (
        <View>
          <View className="training-search"><Input value={search} placeholder="搜索课程名称或关键词" onInput={(event)=>setSearch(event.detail.value)} confirmType="search" onConfirm={()=>void load(search)} /><Button onClick={()=>void load(search)}>搜索</Button></View>
          <Text className="training-library-note">资料库查阅不计入正式培训进度；锁定的必修课程不能从搜索结果绕过。</Text>
          <View className="training-course-list">
            {library.map((course)=><View key={course.id} className={`training-course-card${course.formalLocked?" training-course-card--locked":""}`} onClick={()=>openLibraryCourse(course)}>
              <View className="training-course-card__number"><Text>{course.name.slice(0,1)}</Text></View>
              <View className="training-course-card__main"><Text className="training-course-card__name">{course.name}</Text><Text className="training-course-card__meta">{course.expectedMinutes} 分钟 · {course.formalLocked?"请先完成上一门必修课":"可查阅"}</Text><Text className="training-course-card__summary">{course.summary}</Text></View>
              <Text className="training-arrow">{course.formalLocked?"🔒":"›"}</Text>
            </View>)}
            {!library.length && !loading ? <Text className="training-empty-copy">没有找到匹配课程</Text>:null}
          </View>
        </View>
      ) : null}
      {tab === "notice" ? <NotificationView items={notifications} onRead={async(item)=>{if(!item.readAt){await teacherRequest(`/teacher/training/notifications/${item.id}/read`,{method:"POST"});await load();}}} /> : null}
      {tab === "mentor" ? <MentorView items={practical} onOpen={openPractical} /> : null}

      {feedbackOpen ? (
        <View className="training-sheet-mask" onClick={() => setFeedbackOpen(false)}>
          <View className="training-sheet" onClick={(event)=>event.stopPropagation()}>
            <Text className="training-sheet__title">培训反馈（自愿填写）</Text>
            <Text className="training-field-label">总体评分</Text>
            <View className="training-rating">{[1,2,3,4,5].map((value)=><Text key={value} className={value<=feedback.rating?"training-star training-star--active":"training-star"} onClick={()=>setFeedback({...feedback,rating:value})}>★</Text>)}</View>
            <Text className="training-field-label">培训感悟</Text>
            <Textarea className="training-textarea" value={feedback.reflection} maxlength={5000} onInput={(event)=>setFeedback({...feedback,reflection:event.detail.value})} />
            <Text className="training-field-label">改进建议</Text>
            <Textarea className="training-textarea" value={feedback.suggestion} maxlength={5000} onInput={(event)=>setFeedback({...feedback,suggestion:event.detail.value})} />
            <View className="training-sheet__actions"><Button onClick={()=>setFeedbackOpen(false)}>稍后填写</Button><Button className="training-primary" onClick={submitFeedback}>提交反馈</Button></View>
          </View>
        </View>
      ) : null}

      {practicalTarget ? (
        <View className="training-sheet-mask" onClick={() => setPracticalTarget(null)}>
          <View className="training-sheet" onClick={(event)=>event.stopPropagation()}>
            <Text className="training-sheet__title">
              {practicalTarget.assignment.teacher.name} · {practicalTarget.snapshot.courseName}
            </Text>
            <Text className="training-library-note">每次提交均永久保留，可在后续检查中追加新结论。</Text>
            {(practicalTarget.snapshot?.payload?.practicalItems || []).map((item) => (
              <View className="training-practical-row" key={item.id}>
                <View>
                  <Text className="training-field-label">{item.title}{item.isRequired ? "（必填）" : ""}</Text>
                  {item.instructions ? <Text className="training-practical-note">{item.instructions}</Text> : null}
                </View>
                <Switch
                  checked={Boolean(practicalDraft.checks[item.id])}
                  onChange={(event) => setPracticalDraft({
                    ...practicalDraft,
                    checks: { ...practicalDraft.checks, [item.id]: event.detail.value },
                  })}
                />
              </View>
            ))}
            <Text className="training-field-label">总体结论</Text>
            <View className="training-conclusion-row">
              {[["passed","通过"],["retraining_required","需复训"]].map(([value,label]) => (
                <Text
                  key={value}
                  className={practicalDraft.conclusion === value ? "training-conclusion training-conclusion--active" : "training-conclusion"}
                  onClick={() => setPracticalDraft({ ...practicalDraft, conclusion: value })}
                >{label}</Text>
              ))}
            </View>
            <Text className="training-field-label">检查评语</Text>
            <Textarea
              className="training-textarea"
              value={practicalDraft.comment}
              maxlength={2000}
              onInput={(event) => setPracticalDraft({ ...practicalDraft, comment: event.detail.value })}
            />
            <View className="training-sheet__actions">
              <Button onClick={() => setPracticalTarget(null)}>取消</Button>
              <Button className="training-primary" onClick={submitPractical}>提交检查</Button>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function PlanView({ plan, loading }) {
  if (!plan) return <View className="training-plain-empty"><Text>{loading?"正在加载…":"当前没有有效培训任务"}</Text></View>;
  return <View className="training-course-list">{plan.courses.map((course,index)=>{const unavailable=course.locked||plan.status==="frozen";return <View key={course.id} className={`training-course-card${unavailable?" training-course-card--locked":""}`} onClick={()=>{if(!unavailable) Taro.navigateTo({url:`/pages/training-course/index?id=${course.id}`});}}>
    <View className="training-course-card__number"><Text>{index+1}</Text></View>
    <View className="training-course-card__main"><Text className="training-course-card__name">{course.snapshot.courseName}</Text><Text className="training-course-card__meta">最低 {course.snapshot.minimumMinutes} 分钟 · {plan.status==="frozen"?"账号停用，进度已冻结":courseLabels[course.status] || course.status}</Text>{course.attempt?.latestQuiz?<Text className="training-course-card__summary">最近测验：{course.attempt.latestQuiz.score} 分</Text>:null}{course.attempt?.latestPractical?<Text className="training-course-card__summary">实操：{course.attempt.latestPractical.conclusion === "passed"?"已通过":"需要复训"}</Text>:null}</View>
    <Text className="training-arrow">{unavailable?"🔒":"›"}</Text>
  </View>})}</View>;
}

function NotificationView({ items, onRead }) {
  return <View className="training-notification-list">{items.map((item)=><View className={`training-notification${item.readAt?"":" training-notification--unread"}`} key={item.id} onClick={()=>void onRead(item)}><Text className="training-notification__title">{item.title}</Text><Text className="training-notification__content">{item.content}</Text><Text className="training-notification__time">{formatDate(item.createdAt)}</Text></View>)}{!items.length?<View className="training-plain-empty"><Text>暂无培训提醒</Text></View>:null}</View>;
}

function MentorView({ items, onOpen }) {
  return <View><Text className="training-library-note">带教负责人可逐项填写实操检查；每次提交都会保留，需复训后可再次追加。</Text>{items.map((item)=><View className="training-notification" key={item.id} onClick={()=>onOpen(item)}><Text className="training-notification__title">{item.assignment.teacher.name} · {item.snapshot.courseName}</Text><Text className="training-notification__content">当前等待实操检查，点击填写检查结果。</Text><Text className="training-arrow">填写 ›</Text></View>)}{!items.length?<View className="training-plain-empty"><Text>当前没有待确认的带教任务</Text></View>:null}</View>;
}

function openLibraryCourse(course) {
  if (course.formalLocked) {
    Taro.showToast({ title: "请先完成上一门必修课程", icon: "none" });
    return;
  }
  if (course.formalCourseId) {
    Taro.navigateTo({ url: `/pages/training-course/index?id=${course.formalCourseId}` });
  } else {
    Taro.navigateTo({ url: `/pages/training-library/index?id=${course.id}` });
  }
}

function formatDate(value) { return value ? new Date(value).toLocaleString("zh-CN",{hour12:false}) : "—"; }
function message(cause, fallback) { return cause instanceof Error ? cause.message : fallback; }
