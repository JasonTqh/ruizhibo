import {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  completeTrainingChapter,
  getTrainingAssetAccess,
  getTrainingCourse,
  resolveApiAssetUrl,
  sendStudyHeartbeat,
  startStudySession,
  submitTrainingQuiz,
} from "./api";
import type {
  QuizSubmissionResult,
  TrainingChapter,
  TrainingCourseDetail,
  TrainingQuestion,
} from "./types";

type StudySession = {
  clientSessionId: string;
  chapterKey: string;
  kind: "content" | "video";
};

type CourseDetailProps = {
  token: string;
  assignmentCourseId: string;
  onBack: () => void;
  onProgressChanged: () => void;
};

const playbackRates = [0.75, 1, 1.25, 1.5, 2] as const;

export function CourseDetail({
  token,
  assignmentCourseId,
  onBack,
  onProgressChanged,
}: CourseDetailProps) {
  const [detail, setDetail] = useState<TrainingCourseDetail | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [quizResult, setQuizResult] = useState<QuizSubmissionResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const sessionRef = useRef<StudySession | null>(null);
  const lastInteractionRef = useRef(Date.now());
  const visibleRef = useRef(true);
  const videoPositionRef = useRef(0);
  const videoDurationRef = useRef(0);
  const lastSentPositionRef = useRef(0);
  const playbackRateRef = useRef(1);

  const loadCourse = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const next = await getTrainingCourse(token, assignmentCourseId);
        setDetail(next);
        setChapterIndex((current) => {
          if (current < next.course.snapshot.chapters.length) return current;
          const firstIncomplete = next.course.snapshot.chapters.findIndex(
            (chapter) =>
              !next.course.attempt.chapterProgress.some(
                (progress) =>
                  progress.chapterKey === chapter.key && progress.completedAt,
              ),
          );
          return Math.max(0, firstIncomplete);
        });

        const assetIds = [
          ...new Set(
            next.course.snapshot.chapters.flatMap((chapter) =>
              chapter.media.map((media) => media.fileAssetId),
            ),
          ),
        ];
        const assets = await Promise.allSettled(
          assetIds.map(async (assetId) => {
            const access = await getTrainingAssetAccess(token, assetId);
            return [assetId, resolveApiAssetUrl(access.url)] as const;
          }),
        );
        setAssetUrls(
          Object.fromEntries(
            assets
              .filter(
                (
                  item,
                ): item is PromiseFulfilledResult<readonly [string, string]> =>
                  item.status === "fulfilled",
              )
              .map((item) => item.value),
          ),
        );
        if (assets.some((item) => item.status === "rejected")) {
          setMessage({
            tone: "error",
            text: "部分课程素材暂时无法加载，可刷新后重试。",
          });
        }
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "课程加载失败",
        });
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [assignmentCourseId, token],
  );

  useEffect(() => {
    void loadCourse();
  }, [loadCourse]);

  const chapter = detail?.course.snapshot.chapters[chapterIndex];
  const progress = detail?.course.attempt.chapterProgress.find(
    (item) => item.chapterKey === chapter?.key,
  );
  const learnable = Boolean(
    detail &&
    ["pending", "in_progress", "awaiting_safety"].includes(
      detail.assignmentStatus,
    ) &&
    ["available", "in_progress"].includes(detail.course.status),
  );

  const transmitHeartbeat = useCallback(
    async (session: StudySession, ended = false, keepalive = false) => {
      const active = Date.now() - lastInteractionRef.current < 5 * 60 * 1000;
      const input: Parameters<typeof sendStudyHeartbeat>[1] = {
        clientSessionId: session.clientSessionId,
        visible: visibleRef.current,
        active: visibleRef.current && active,
        ended,
      };
      if (session.kind === "video" && videoDurationRef.current > 0) {
        input.videoPositionSeconds = videoPositionRef.current;
        input.videoDurationSeconds = videoDurationRef.current;
        input.watchedFrom = lastSentPositionRef.current;
        input.watchedTo = videoPositionRef.current;
        input.playbackRate = playbackRateRef.current;
      }
      await sendStudyHeartbeat(token, input, keepalive);
      lastSentPositionRef.current = videoPositionRef.current;
      if (
        ended &&
        sessionRef.current?.clientSessionId === session.clientSessionId
      ) {
        sessionRef.current = null;
      }
    },
    [token],
  );

  useEffect(() => {
    if (!chapter || !learnable) return;
    let disposed = false;
    const kind = chapter.media.some((media) => media.type === "video")
      ? "video"
      : "content";
    const clientSessionId = createClientSessionId();
    const session: StudySession = {
      clientSessionId,
      chapterKey: chapter.key,
      kind,
    };
    videoPositionRef.current = Number(progress?.videoPositionSeconds ?? 0);
    lastSentPositionRef.current = videoPositionRef.current;
    videoDurationRef.current = Number(
      progress?.videoDurationSeconds ??
        chapter.media.find((media) => media.type === "video")
          ?.durationSeconds ??
        0,
    );
    lastInteractionRef.current = Date.now();

    void startStudySession(token, assignmentCourseId, {
      clientSessionId,
      chapterKey: chapter.key,
      kind,
    })
      .then(() => {
        if (disposed) {
          return transmitHeartbeat(session, true, true).catch(() => undefined);
        }
        sessionRef.current = session;
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setMessage({
            tone: "error",
            text: error instanceof Error ? error.message : "学习计时启动失败",
          });
        }
      });

    return () => {
      disposed = true;
      if (sessionRef.current?.clientSessionId === clientSessionId) {
        sessionRef.current = null;
        void transmitHeartbeat(session, true, true).catch(() => undefined);
      }
    };
  }, [
    assignmentCourseId,
    chapter?.key,
    learnable,
    progress?.videoDurationSeconds,
    progress?.videoPositionSeconds,
    token,
    transmitHeartbeat,
  ]);

  useEffect(() => {
    const noteInteraction = () => {
      lastInteractionRef.current = Date.now();
    };
    const handleVisibility = () => {
      visibleRef.current = document.visibilityState === "visible";
      const current = sessionRef.current;
      if (current) void transmitHeartbeat(current).catch(() => undefined);
    };
    visibleRef.current = document.visibilityState === "visible";
    window.addEventListener("pointerdown", noteInteraction, { passive: true });
    window.addEventListener("keydown", noteInteraction);
    window.addEventListener("scroll", noteInteraction, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      if (current) void transmitHeartbeat(current).catch(() => undefined);
    }, 15_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", noteInteraction);
      window.removeEventListener("keydown", noteInteraction);
      window.removeEventListener("scroll", noteInteraction);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [transmitHeartbeat]);

  const allChaptersCompleted = useMemo(
    () =>
      Boolean(
        detail?.course.snapshot.chapters.every((item) =>
          detail.course.attempt.chapterProgress.some(
            (saved) => saved.chapterKey === item.key && saved.completedAt,
          ),
        ),
      ),
    [detail],
  );

  if (loading && !detail) return <CourseLoading onBack={onBack} />;
  if (!detail) {
    return (
      <section className="course-failure panel">
        <button className="text-button" onClick={onBack}>
          ← 返回课程列表
        </button>
        <h2>课程暂时无法打开</h2>
        <p>{message?.text ?? "请稍后重试。"}</p>
        <button className="secondary-button" onClick={() => void loadCourse()}>
          重新加载
        </button>
      </section>
    );
  }

  const course = detail.course;
  const snapshot = course.snapshot;
  const completedCount = course.attempt.chapterProgress.filter(
    (item) => item.completedAt,
  ).length;
  const timePercent = course.attempt.minimumSeconds
    ? Math.min(
        100,
        Math.round(
          (course.attempt.accumulatedSeconds / course.attempt.minimumSeconds) *
            100,
        ),
      )
    : 100;

  async function completeChapter() {
    if (!chapter || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const current = sessionRef.current;
      if (current) await transmitHeartbeat(current);
      await completeTrainingChapter(token, assignmentCourseId, chapter.key);
      setMessage({ tone: "success", text: "本节已完成，学习进度已同步。" });
      await loadCourse(false);
      onProgressChanged();
      if (chapterIndex < snapshot.chapters.length - 1) {
        setChapterIndex(chapterIndex + 1);
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "暂时无法完成本节",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz() {
    const quiz = snapshot.quiz;
    if (!quiz || busy) return;
    if (quiz.questions.some((question) => !answers[question.id]?.length)) {
      setMessage({ tone: "info", text: "请完成全部题目后再提交。" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await submitTrainingQuiz(
        token,
        assignmentCourseId,
        quiz.questions.map((question) => ({
          questionId: question.id,
          answerIds: answers[question.id],
        })),
      );
      setQuizResult(result);
      setMessage({
        tone: result.passed ? "success" : "info",
        text: result.passed
          ? `测验通过，本次得分 ${result.score} 分。`
          : `本次得分 ${result.score} 分，请复习后再次作答。`,
      });
      await loadCourse(false);
      onProgressChanged();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "测验提交失败",
      });
    } finally {
      setBusy(false);
    }
  }

  function chooseAnswer(question: TrainingQuestion, optionId: string) {
    lastInteractionRef.current = Date.now();
    const current = answers[question.id] ?? [];
    const next =
      question.type === "multiple_choice"
        ? current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        : [optionId];
    setAnswers((saved) => ({ ...saved, [question.id]: next }));
  }

  function handleOptionKey(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    question: TrainingQuestion,
    optionId: string,
  ) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      chooseAnswer(question, optionId);
    }
  }

  return (
    <div className="course-detail-page">
      <button className="course-back" onClick={onBack}>
        ← 返回我的计划
      </button>

      <section className="course-hero">
        <div className="course-hero-copy">
          <div className="course-hero-meta">
            <span>{snapshot.course.code}</span>
            <span>{snapshot.course.category}</span>
            {snapshot.course.isSafety ? <b>安全必修</b> : null}
          </div>
          <h2>{snapshot.course.name}</h2>
          <p>{snapshot.course.summary}</p>
          <div className="course-overall-progress">
            <div>
              <span>累计学习</span>
              <strong>
                {formatDuration(course.attempt.accumulatedSeconds)}
              </strong>
              <small>最低 {snapshot.course.minimumMinutes} 分钟</small>
            </div>
            <div
              className="course-progress-ring"
              style={
                { "--progress": `${timePercent * 3.6}deg` } as CSSProperties
              }
            >
              <span>{timePercent}%</span>
            </div>
          </div>
        </div>
        <div className="course-hero-number">
          <span>章节完成</span>
          <strong>
            {completedCount}
            <i>/{snapshot.chapters.length}</i>
          </strong>
          <small>{courseStatusText(course.status)}</small>
        </div>
      </section>

      {message ? (
        <div className={`course-message ${message.tone}`} role="status">
          {message.text}
        </div>
      ) : null}

      <div className="course-learning-grid">
        <aside className="chapter-sidebar panel">
          <header>
            <span>COURSE OUTLINE</span>
            <h3>课程目录</h3>
          </header>
          <div className="chapter-nav">
            {snapshot.chapters.map((item, index) => {
              const saved = course.attempt.chapterProgress.find(
                (value) => value.chapterKey === item.key,
              );
              return (
                <button
                  className={index === chapterIndex ? "active" : ""}
                  key={item.key}
                  onClick={() => {
                    setChapterIndex(index);
                    setMessage(null);
                  }}
                >
                  <i>
                    {saved?.completedAt
                      ? "✓"
                      : String(index + 1).padStart(2, "0")}
                  </i>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {saved?.completedAt
                        ? "已完成"
                        : item.media.some((media) => media.type === "video")
                          ? `视频 · ${Math.round(saved?.watchedPercent ?? 0)}%`
                          : "图文学习"}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="course-main-column">
          {chapter ? (
            <ChapterContent
              chapter={chapter}
              chapterIndex={chapterIndex}
              progress={progress}
              assetUrls={assetUrls}
              playbackRate={playbackRate}
              onPlaybackRate={(rate, video) => {
                playbackRateRef.current = rate;
                setPlaybackRate(rate);
                video.playbackRate = rate;
                lastInteractionRef.current = Date.now();
              }}
              onVideoProgress={(position, duration) => {
                videoPositionRef.current = position;
                videoDurationRef.current = duration;
                lastInteractionRef.current = Date.now();
              }}
              onVideoPause={() => {
                const current = sessionRef.current;
                if (current)
                  void transmitHeartbeat(current).catch(() => undefined);
              }}
            />
          ) : null}

          <div className="chapter-actions panel">
            <div>
              <strong>
                {progress?.completedAt ? "这一节已完成" : "完成阅读后记录进度"}
              </strong>
              <span>
                {progress?.completedAt
                  ? `完成于 ${formatDateTime(progress.completedAt)}`
                  : chapter?.media.some((media) => media.type === "video")
                    ? "视频有效观看达到 90% 后可完成"
                    : "系统会同步你的有效学习时长"}
              </span>
            </div>
            <button
              className="primary-action"
              disabled={!learnable || busy || Boolean(progress?.completedAt)}
              onClick={() => void completeChapter()}
            >
              {progress?.completedAt ? "已完成" : busy ? "保存中…" : "完成本节"}
            </button>
          </div>

          <CourseRequirements
            detail={detail}
            allChaptersCompleted={allChaptersCompleted}
            timePercent={timePercent}
          />

          {snapshot.quiz ? (
            <QuizPanel
              quiz={snapshot.quiz}
              answers={answers}
              disabled={!allChaptersCompleted || !learnable || busy}
              result={quizResult}
              latestQuiz={course.attempt.latestQuiz}
              onChoose={chooseAnswer}
              onKeyDown={handleOptionKey}
              onSubmit={() => void submitQuiz()}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChapterContent({
  chapter,
  chapterIndex,
  progress,
  assetUrls,
  playbackRate,
  onPlaybackRate,
  onVideoProgress,
  onVideoPause,
}: {
  chapter: TrainingChapter;
  chapterIndex: number;
  progress:
    | TrainingCourseDetail["course"]["attempt"]["chapterProgress"][number]
    | undefined;
  assetUrls: Record<string, string>;
  playbackRate: number;
  onPlaybackRate: (rate: number, video: HTMLVideoElement) => void;
  onVideoProgress: (position: number, duration: number) => void;
  onVideoPause: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  return (
    <article className="chapter-content panel">
      <header className="chapter-content-header">
        <span>第 {chapterIndex + 1} 节</span>
        <h2>{chapter.title}</h2>
      </header>
      {/* 课程 HTML 在 API 入库和快照输出前已统一清洗。 */}
      <div
        className="training-rich-text"
        dangerouslySetInnerHTML={{ __html: chapter.contentHtml }}
      />
      <div className="chapter-media-list">
        {chapter.media.map((media) => {
          const url = assetUrls[media.fileAssetId];
          if (!url)
            return (
              <div className="media-placeholder" key={media.id}>
                素材加载失败，请刷新页面后重试
              </div>
            );
          if (media.type === "image") {
            return (
              <figure className="training-image" key={media.id}>
                <img alt={media.caption || chapter.title} src={url} />
                <figcaption>{media.caption || "课程配图"}</figcaption>
              </figure>
            );
          }
          return (
            <figure className="training-video" key={media.id}>
              <video
                controls
                controlsList="nodownload"
                onLoadedMetadata={(event) => {
                  videoRef.current = event.currentTarget;
                  const savedPosition = Number(
                    progress?.videoPositionSeconds ?? 0,
                  );
                  if (savedPosition > 0 && event.currentTarget.currentTime < 1)
                    event.currentTarget.currentTime = savedPosition;
                  event.currentTarget.playbackRate = playbackRate;
                  onVideoProgress(
                    event.currentTarget.currentTime,
                    event.currentTarget.duration,
                  );
                }}
                onPause={onVideoPause}
                onPlay={(event) =>
                  onVideoProgress(
                    event.currentTarget.currentTime,
                    event.currentTarget.duration,
                  )
                }
                onTimeUpdate={(event) =>
                  onVideoProgress(
                    event.currentTarget.currentTime,
                    event.currentTarget.duration,
                  )
                }
                src={url}
              />
              <figcaption>{media.caption || "课程视频"}</figcaption>
              <div className="playback-row">
                <span>播放速度</span>
                {playbackRates.map((rate) => (
                  <button
                    className={playbackRate === rate ? "active" : ""}
                    key={rate}
                    onClick={() =>
                      videoRef.current && onPlaybackRate(rate, videoRef.current)
                    }
                  >
                    {rate}×
                  </button>
                ))}
                <small>
                  有效观看 {Math.round(progress?.watchedPercent ?? 0)}%
                </small>
              </div>
            </figure>
          );
        })}
      </div>
    </article>
  );
}

function CourseRequirements({
  detail,
  allChaptersCompleted,
  timePercent,
}: {
  detail: TrainingCourseDetail;
  allChaptersCompleted: boolean;
  timePercent: number;
}) {
  const { course } = detail;
  const quiz = course.snapshot.quiz;
  return (
    <section className="course-requirements-web panel">
      <header>
        <h3>课程完成条件</h3>
        <span>系统自动核验</span>
      </header>
      <div className="requirement-grid">
        <Requirement
          ok={allChaptersCompleted}
          title="完成全部章节"
          detail={`${course.attempt.chapterProgress.filter((item) => item.completedAt).length} / ${course.snapshot.chapters.length} 节`}
        />
        <Requirement
          ok={timePercent >= 100}
          title="达到最低学时"
          detail={`${formatDuration(course.attempt.accumulatedSeconds)} / ${course.snapshot.course.minimumMinutes} 分钟`}
        />
        <Requirement
          neutral={!quiz}
          ok={Boolean(course.attempt.latestQuiz?.passed)}
          title={quiz ? "通过课后测验" : "无需课后测验"}
          detail={
            quiz
              ? `最近 ${course.attempt.latestQuiz?.score ?? "未作答"} 分 / 及格 ${quiz.passScore} 分`
              : "本课程无测验要求"
          }
        />
        <Requirement
          neutral={!course.snapshot.course.requiresPractical}
          ok={course.attempt.latestPractical?.conclusion === "passed"}
          title={
            course.snapshot.course.requiresPractical
              ? "通过实操检查"
              : "无需实操检查"
          }
          detail={
            course.snapshot.course.requiresPractical
              ? practicalStatus(course.attempt.latestPractical?.conclusion)
              : "本课程无实操要求"
          }
        />
      </div>
    </section>
  );
}

function Requirement({
  ok,
  neutral = false,
  title,
  detail,
}: {
  ok: boolean;
  neutral?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={`requirement-item ${ok ? "done" : neutral ? "neutral" : ""}`}
    >
      <i>{ok ? "✓" : neutral ? "—" : "○"}</i>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function QuizPanel({
  quiz,
  answers,
  disabled,
  result,
  latestQuiz,
  onChoose,
  onKeyDown,
  onSubmit,
}: {
  quiz: NonNullable<TrainingCourseDetail["course"]["snapshot"]["quiz"]>;
  answers: Record<string, string[]>;
  disabled: boolean;
  result: QuizSubmissionResult | null;
  latestQuiz: TrainingCourseDetail["course"]["attempt"]["latestQuiz"];
  onChoose: (question: TrainingQuestion, optionId: string) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    question: TrainingQuestion,
    optionId: string,
  ) => void;
  onSubmit: () => void;
}) {
  return (
    <section className={`quiz-panel panel ${disabled ? "locked" : ""}`}>
      <header>
        <div>
          <span>KNOWLEDGE CHECK</span>
          <h3>课后测验</h3>
        </div>
        <p>
          及格线 {quiz.passScore} 分
          {quiz.maxAttempts === null
            ? " · 不限次数"
            : ` · 最多 ${quiz.maxAttempts} 次`}
        </p>
      </header>
      {!disabled || latestQuiz ? (
        quiz.questions.map((question, index) => (
          <fieldset key={question.id} disabled={disabled}>
            <legend>
              {index + 1}. {question.prompt}
              {question.type === "multiple_choice" ? "（多选）" : ""}
            </legend>
            <div className="quiz-options">
              {question.options.map((option) => {
                const selected = answers[question.id]?.includes(option.id);
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? "selected" : ""}
                    key={option.id}
                    onClick={() => onChoose(question, option.id)}
                    onKeyDown={(event) => onKeyDown(event, question, option.id)}
                    type="button"
                  >
                    <i>
                      {question.type === "multiple_choice"
                        ? selected
                          ? "✓"
                          : ""
                        : selected
                          ? "●"
                          : ""}
                    </i>
                    <span>
                      {question.type === "true_false"
                        ? trueFalseLabel(option.label)
                        : option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))
      ) : (
        <div className="quiz-lock-message">完成全部章节后开放测验</div>
      )}
      {!disabled ? (
        <button className="quiz-submit" onClick={onSubmit}>
          提交测验
        </button>
      ) : null}
      {result || latestQuiz ? (
        <div
          className={
            (result ?? latestQuiz)?.passed
              ? "quiz-latest passed"
              : "quiz-latest"
          }
        >
          最近成绩：<strong>{(result ?? latestQuiz)?.score} 分</strong> ·{" "}
          {(result ?? latestQuiz)?.passed ? "已通过" : "未通过"}
        </div>
      ) : null}
    </section>
  );
}

function CourseLoading({ onBack }: { onBack: () => void }) {
  return (
    <div className="course-detail-page">
      <button className="course-back" onClick={onBack}>
        ← 返回我的计划
      </button>
      <div className="course-detail-skeleton">
        <i />
        <i />
        <div />
      </div>
    </div>
  );
}

function createClientSessionId() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `teacher-web-${suffix}`.slice(0, 100);
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const remain = value % 60;
  return `${minutes}分${String(remain).padStart(2, "0")}秒`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function courseStatusText(status: string) {
  const labels: Record<string, string> = {
    available: "可学习",
    in_progress: "学习中",
    awaiting_practical: "等待实操确认",
    awaiting_safety: "等待安全确认",
    completed: "已完成",
    exempted: "已免修",
  };
  return labels[status] ?? status;
}

function practicalStatus(value?: string) {
  if (value === "passed") return "最近一次检查已通过";
  if (value) return "最近一次检查需复训";
  return "等待带教负责人检查";
}

function trueFalseLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "正确"].includes(normalized)) return "正确";
  if (["false", "no", "错误"].includes(normalized)) return "错误";
  return value;
}
