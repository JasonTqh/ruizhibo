import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  getAcademyData,
  getCurrentTeacher,
  loginTeacher,
  markTrainingNotificationRead,
} from "./api";
import { CourseDetail } from "./CourseDetail";
import type {
  AcademyData,
  AssignmentCourse,
  LibraryCourse,
  TeacherProfile,
  TrainingNotification,
} from "./types";

const TOKEN_KEY = "ruizhibo.teacherWeb.sessionToken";
type ViewKey = "overview" | "plan" | "library" | "notifications";

const viewLabels: Record<ViewKey, string> = {
  overview: "学习总览",
  plan: "我的计划",
  library: "课程资料库",
  notifications: "学院通知",
};

const statusLabels: Record<string, string> = {
  pending: "待开始",
  available: "可学习",
  in_progress: "学习中",
  awaiting_practical: "待实操",
  awaiting_safety: "待安全复核",
  passed: "已通过",
  completed: "已完成",
  failed: "待重学",
  locked: "未解锁",
  active: "进行中",
  overdue: "已逾期",
  valid: "有效",
  expired: "已过期",
};

function icon(name: "home" | "plan" | "book" | "bell" | "refresh" | "logout") {
  const paths = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    plan: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    book: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5" />
        <path d="M4 18v-5h5" />
        <path d="M6.1 9A7 7 0 0 1 18 6l2 5M4 13l2 5a7 7 0 0 0 11.9-3" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M14 3h7v18h-7" />
      </>
    ),
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [data, setData] = useState<AcademyData | null>(null);
  const [view, setView] = useState<ViewKey>("overview");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [booting, setBooting] = useState(Boolean(token));
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const readingNotificationsRef = useRef(new Set<string>());

  const signOut = useCallback((message?: string) => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setTeacher(null);
    setData(null);
    setView("overview");
    setSelectedCourseId(null);
    setNotice(message ?? null);
  }, []);

  const loadAcademy = useCallback(
    async (sessionToken: string, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const academy = await getAcademyData(sessionToken);
        setData(academy);
        setNotice(null);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          signOut("登录已过期，请重新登录");
          return;
        }
        setNotice(error instanceof Error ? error.message : "学院数据加载失败");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [signOut],
  );

  const readNotification = useCallback(
    async (item: TrainingNotification) => {
      if (!token || item.readAt || readingNotificationsRef.current.has(item.id))
        return;
      readingNotificationsRef.current.add(item.id);
      try {
        const result = await markTrainingNotificationRead(token, item.id);
        setData((current) =>
          current
            ? {
                ...current,
                home: {
                  ...current.home,
                  unreadNotifications: Math.max(
                    0,
                    (current.home.unreadNotifications ?? 0) - 1,
                  ),
                },
                notifications: current.notifications.map((notification) =>
                  notification.id === item.id
                    ? { ...notification, readAt: result.readAt }
                    : notification,
                ),
              }
            : current,
        );
        setNotice(null);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "通知状态更新失败");
      } finally {
        readingNotificationsRef.current.delete(item.id);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    let active = true;
    void getCurrentTeacher(token)
      .then(async (profile) => {
        if (!active) return;
        if (profile.role !== "teacher") {
          signOut("当前账号不是教师账号");
          return;
        }
        setTeacher(profile);
        await loadAcademy(token);
      })
      .catch((error: unknown) => {
        if (!active) return;
        signOut(
          error instanceof ApiError && error.status === 401
            ? "登录已过期，请重新登录"
            : "无法恢复登录状态，请重新登录",
        );
      })
      .finally(() => active && setBooting(false));
    return () => {
      active = false;
    };
  }, [loadAcademy, signOut, token]);

  if (booting) return <LoadingScreen />;
  if (!token || !teacher) {
    return (
      <LoginScreen
        initialNotice={notice}
        onAuthenticated={(nextToken, profile) => {
          sessionStorage.setItem(TOKEN_KEY, nextToken);
          setTeacher(profile);
          setToken(nextToken);
          setNotice(null);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">锐</div>
          <div>
            <strong>锐之博教师学院</strong>
            <span>专业成长工作台</span>
          </div>
        </div>

        <nav aria-label="教师学院导航">
          {(Object.keys(viewLabels) as ViewKey[]).map((key) => (
            <button
              className={view === key ? "nav-item active" : "nav-item"}
              key={key}
              onClick={() => {
                setSelectedCourseId(null);
                setView(key);
              }}
            >
              {icon(
                key === "overview"
                  ? "home"
                  : key === "plan"
                    ? "plan"
                    : key === "library"
                      ? "book"
                      : "bell",
              )}
              <span>{viewLabels[key]}</span>
              {key === "notifications" &&
              (data?.home.unreadNotifications ?? 0) > 0 ? (
                <b>{data?.home.unreadNotifications}</b>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="profile-mini">
            <span>{teacher.name.slice(0, 1)}</span>
            <div>
              <strong>{teacher.name}</strong>
              <small>{maskPhone(teacher.phone)}</small>
            </div>
          </div>
          <button className="logout-button" onClick={() => signOut()}>
            {icon("logout")}退出登录
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">TEACHER ACADEMY</span>
            <h1>{selectedCourseId ? "课程学习" : viewLabels[view]}</h1>
          </div>
          {!selectedCourseId ? (
            <button
              className="refresh-button"
              disabled={loading}
              onClick={() => void loadAcademy(token)}
            >
              {icon("refresh")}
              {loading ? "刷新中" : "刷新数据"}
            </button>
          ) : null}
        </header>

        {notice ? (
          <div className="inline-alert" role="alert">
            {notice}
          </div>
        ) : null}
        {!data && loading ? <DashboardSkeleton /> : null}
        {selectedCourseId ? (
          <CourseDetail
            assignmentCourseId={selectedCourseId}
            onBack={() => {
              setSelectedCourseId(null);
              setView("plan");
            }}
            onProgressChanged={() => void loadAcademy(token, true)}
            token={token}
          />
        ) : data ? (
          <AcademyView
            data={data}
            onOpenCourse={(courseId) => {
              setView("plan");
              setSelectedCourseId(courseId);
            }}
            onReadNotification={(item) => void readNotification(item)}
            teacher={teacher}
            view={view}
          />
        ) : null}
      </main>
    </div>
  );
}

function LoginScreen({
  initialNotice,
  onAuthenticated,
}: {
  initialNotice: string | null;
  onAuthenticated: (token: string, profile: TeacherProfile) => void;
}) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialNotice);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^1\d{10}$/.test(phone)) {
      setError("请输入 11 位教师手机号");
      return;
    }
    if (password.length < 12) {
      setError("教师学院密码至少需要 12 位");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await loginTeacher(phone, password);
      onAuthenticated(result.token, result.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="story-content">
          <div className="story-brand">
            <span>锐</span>锐之博托管中心
          </div>
          <p className="story-kicker">TEACHER GROWTH · 2026</p>
          <h1>
            把每一次学习，
            <br />
            变成带班的底气。
          </h1>
          <p className="story-copy">
            课程计划、专业资料与考核进度集中呈现，帮助每位老师清楚知道今天学什么、下一步做什么。
          </p>
          <div className="story-points">
            <div>
              <strong>01</strong>
              <span>
                计划清晰
                <br />
                <small>按轮次推进学习</small>
              </span>
            </div>
            <div>
              <strong>02</strong>
              <span>
                进度同步
                <br />
                <small>与教师端共用数据</small>
              </span>
            </div>
            <div>
              <strong>03</strong>
              <span>
                安全可控
                <br />
                <small>仅教师账号可进入</small>
              </span>
            </div>
          </div>
        </div>
        <div className="story-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand">
            <span>锐</span>锐之博教师学院
          </div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>教师登录</h2>
          <p className="login-subtitle">使用管理员为你开通的教师学院账号</p>

          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}

          <label>
            <span>教师手机号</span>
            <input
              autoComplete="username"
              inputMode="numeric"
              maxLength={11}
              placeholder="请输入 11 位手机号"
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value.replace(/\D/g, ""))
              }
            />
          </label>
          <label>
            <span>登录密码</span>
            <input
              autoComplete="current-password"
              placeholder="请输入教师学院密码"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button
            className="primary-button"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "正在验证…" : "进入教师学院"}
            <span aria-hidden="true">→</span>
          </button>
          <p className="login-help">首次登录或忘记密码，请联系管理员重置。</p>
        </form>
        <p className="login-footer">
          锐之博内部教学系统 · 请勿在公共设备保存密码
        </p>
      </section>
    </main>
  );
}

function AcademyView({
  view,
  teacher,
  data,
  onOpenCourse,
  onReadNotification,
}: {
  view: ViewKey;
  teacher: TeacherProfile;
  data: AcademyData;
  onOpenCourse: (courseId: string) => void;
  onReadNotification: (item: TrainingNotification) => void;
}) {
  if (!data.home.enabled) return <FeatureDisabled teacher={teacher} />;
  if (view === "plan")
    return (
      <PlanView
        courses={data.plan?.courses ?? []}
        onOpenCourse={onOpenCourse}
      />
    );
  if (view === "library")
    return <LibraryView courses={data.library} onOpenCourse={onOpenCourse} />;
  if (view === "notifications")
    return (
      <NotificationView
        items={data.notifications}
        onRead={onReadNotification}
      />
    );
  return (
    <Overview
      data={data}
      onOpenCourse={onOpenCourse}
      onReadNotification={onReadNotification}
      teacher={teacher}
    />
  );
}

function Overview({
  teacher,
  data,
  onOpenCourse,
  onReadNotification,
}: {
  teacher: TeacherProfile;
  data: AcademyData;
  onOpenCourse: (courseId: string) => void;
  onReadNotification: (item: TrainingNotification) => void;
}) {
  const assignment = data.home.assignment;
  const upcoming = data.plan?.courses.find(
    (course) =>
      !course.locked && !["passed", "completed"].includes(course.status),
  );
  return (
    <div className="content-stack">
      <section className="welcome-row">
        <div>
          <p>
            {timeGreeting()}，{teacher.name}老师
          </p>
          <h2>
            {upcoming
              ? `继续学习「${upcoming.snapshot.courseName}」`
              : "今天也为专业成长积累一步"}
          </h2>
        </div>
        {assignment ? (
          <span className={`deadline-chip ${assignment.deadlineStatus}`}>
            {deadlineText(assignment.dueAt, assignment.deadlineStatus)}
          </span>
        ) : null}
      </section>

      <section className="metric-grid">
        <Metric
          label="本轮进度"
          value={`${assignment?.progressPercent ?? 0}%`}
          detail={
            assignment
              ? `${assignment.completedCourses} / ${assignment.totalCourses} 门课程`
              : "暂无培训计划"
          }
          tone="green"
        />
        <Metric
          label="资料库"
          value={`${data.home.libraryCount ?? data.library.length}`}
          detail="门课程可供查阅"
          tone="gold"
        />
        <Metric
          label="学院通知"
          value={`${data.home.unreadNotifications ?? 0}`}
          detail="条未读消息"
          tone="blue"
        />
        <Metric
          label="安全资质"
          value={statusLabels[data.home.safety?.status ?? ""] ?? "待确认"}
          detail={
            data.home.safety?.validUntil
              ? `有效期至 ${formatDate(data.home.safety.validUntil)}`
              : "以学院复核结果为准"
          }
          tone="coral"
        />
      </section>

      <div className="overview-grid">
        <section className="panel plan-highlight">
          <PanelTitle
            title="当前培训计划"
            meta={assignment ? `第 ${assignment.roundNumber} 轮` : undefined}
          />
          {assignment ? (
            <>
              <div className="plan-heading">
                <div>
                  <span>{assignment.campus.name}</span>
                  <h3>{assignment.currentCourse?.name ?? "本轮课程已完成"}</h3>
                </div>
                <strong>{assignment.progressPercent}%</strong>
              </div>
              <div className="progress-track">
                <i style={{ width: `${assignment.progressPercent}%` }} />
              </div>
              <div className="plan-meta">
                <span>导师：{assignment.mentor?.name ?? "待安排"}</span>
                <span>截止：{formatDate(assignment.dueAt)}</span>
              </div>
              <CourseTimeline
                courses={data.plan?.courses.slice(0, 4) ?? []}
                onOpenCourse={onOpenCourse}
              />
            </>
          ) : (
            <EmptyState
              title="当前没有培训任务"
              copy="新的培训计划发布后会显示在这里。"
            />
          )}
        </section>

        <section className="panel">
          <PanelTitle
            title="最近通知"
            meta={`${data.home.unreadNotifications ?? 0} 条未读`}
          />
          <div className="notice-list compact">
            {data.notifications.slice(0, 4).map((item) => (
              <NoticeItem
                item={item}
                key={item.id}
                onRead={onReadNotification}
              />
            ))}
            {!data.notifications.length ? (
              <EmptyState
                title="暂无学院通知"
                copy="课程提醒和考核结果会出现在这里。"
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function PlanView({
  courses,
  onOpenCourse,
}: {
  courses: AssignmentCourse[];
  onOpenCourse: (courseId: string) => void;
}) {
  return (
    <section className="panel full-panel">
      <PanelTitle title="本轮课程" meta={`${courses.length} 门课程`} />
      <div className="course-list">
        {courses.map((course, index) => (
          <article
            className={course.locked ? "course-row locked" : "course-row"}
            key={course.id}
          >
            <span className="course-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="course-main">
              <div className="course-title-line">
                <h3>{course.snapshot.courseName}</h3>
                {course.snapshot.isSafety ? <em>安全必修</em> : null}
              </div>
              <p>
                {course.snapshot.category} · 建议学习{" "}
                {course.snapshot.minimumMinutes} 分钟
                {course.snapshot.requiresPractical ? " · 含实操考核" : ""}
              </p>
              <div className="mini-progress">
                <i style={{ width: `${courseProgress(course)}%` }} />
              </div>
            </div>
            <div className="course-status">
              <b className={`status ${course.status}`}>
                {statusLabels[course.status] ?? course.status}
              </b>
              <small>
                {course.lockReason ??
                  (course.attempt
                    ? `已学习 ${Math.floor(course.attempt.accumulatedSeconds / 60)} 分钟`
                    : "尚未开始")}
              </small>
              {!course.locked ? (
                <button
                  className="course-open-button"
                  onClick={() => onOpenCourse(course.id)}
                >
                  {course.attempt ? "继续学习" : "开始学习"} →
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!courses.length ? (
          <EmptyState
            title="当前没有培训课程"
            copy="请等待管理员发布新的培训计划。"
          />
        ) : null}
      </div>
    </section>
  );
}

function LibraryView({
  courses,
  onOpenCourse,
}: {
  courses: LibraryCourse[];
  onOpenCourse: (courseId: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const filtered = useMemo(
    () =>
      courses.filter((course) =>
        `${course.name}${course.summary}${course.category}`
          .toLowerCase()
          .includes(keyword.trim().toLowerCase()),
      ),
    [courses, keyword],
  );
  return (
    <div className="content-stack">
      <section className="library-toolbar">
        <div>
          <h2>专业资料，随时复习</h2>
          <p>资料库课程可随时查阅；当前培训课程会同步正式学习进度。</p>
        </div>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="搜索课程"
            placeholder="搜索课程名称或分类"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
      </section>
      <section className="library-grid">
        {filtered.map((course) => (
          <article
            className={
              course.formalLocked ? "library-card locked" : "library-card"
            }
            key={course.id}
          >
            <div className="library-card-top">
              <span>{course.code}</span>
              <b>{course.expectedMinutes} min</b>
            </div>
            <p>{course.category}</p>
            <h3>{course.name}</h3>
            <div className="library-summary">
              {course.summary || "课程简介待补充"}
            </div>
            <footer>
              <span
                className={
                  course.formalLocked ? "availability locked" : "availability"
                }
              >
                {course.formalLocked
                  ? (course.lockedReason ?? "暂不可学习")
                  : "可查阅"}
              </span>
              {course.formalCourseId && !course.formalLocked ? (
                <button
                  aria-label={`打开课程 ${course.name}`}
                  onClick={() => onOpenCourse(course.formalCourseId!)}
                >
                  打开课程 →
                </button>
              ) : (
                <span aria-hidden="true">—</span>
              )}
            </footer>
          </article>
        ))}
        {!filtered.length ? (
          <div className="panel library-empty">
            <EmptyState title="没有找到相关课程" copy="换一个关键词试试。" />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function NotificationView({
  items,
  onRead,
}: {
  items: TrainingNotification[];
  onRead: (item: TrainingNotification) => void;
}) {
  return (
    <section className="panel full-panel">
      <PanelTitle
        title="全部通知"
        meta={`${items.filter((item) => !item.readAt).length} 条未读`}
      />
      <div className="notice-list">
        {items.map((item) => (
          <NoticeItem item={item} key={item.id} onRead={onRead} />
        ))}
        {!items.length ? (
          <EmptyState
            title="暂无学院通知"
            copy="新的课程提醒和考核结果会出现在这里。"
          />
        ) : null}
      </div>
    </section>
  );
}

function CourseTimeline({
  courses,
  onOpenCourse,
}: {
  courses: AssignmentCourse[];
  onOpenCourse: (courseId: string) => void;
}) {
  return (
    <div className="course-timeline">
      {courses.map((course) => (
        <button
          className={
            course.locked
              ? "timeline-item locked"
              : `timeline-item ${course.status}`
          }
          disabled={course.locked}
          key={course.id}
          onClick={() => onOpenCourse(course.id)}
          type="button"
        >
          <i>
            {["passed", "completed"].includes(course.status)
              ? "✓"
              : course.sortOrder}
          </i>
          <span>
            <strong>{course.snapshot.courseName}</strong>
            <small>{statusLabels[course.status] ?? course.status}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function NoticeItem({
  item,
  onRead,
}: {
  item: TrainingNotification;
  onRead: (item: TrainingNotification) => void;
}) {
  return (
    <button
      className={item.readAt ? "notice-item" : "notice-item unread"}
      onClick={() => onRead(item)}
      type="button"
    >
      <i />
      <div>
        <div>
          <h3>{item.title}</h3>
          <time>{formatRelativeDate(item.createdAt)}</time>
        </div>
        <p>{item.content}</p>
      </div>
    </button>
  );
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PanelTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <header className="panel-title">
      <h2>{title}</h2>
      {meta ? <span>{meta}</span> : null}
    </header>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty-state">
      <i>◇</i>
      <strong>{title}</strong>
      <span>{copy}</span>
    </div>
  );
}

function FeatureDisabled({ teacher }: { teacher: TeacherProfile }) {
  return (
    <section className="panel disabled-state">
      <span>教师学院</span>
      <h2>{teacher.name}老师，所属校区暂未开放教师学院</h2>
      <p>
        开放后，你可以在这里查看培训计划、课程资料和学习通知。如有疑问，请联系校区管理员。
      </p>
    </section>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <div className="brand-mark">锐</div>
      <p>正在进入教师学院…</p>
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <i />
      <i />
      <i />
      <i />
      <div />
    </div>
  );
}

function courseProgress(course: AssignmentCourse) {
  if (["passed", "completed"].includes(course.status)) return 100;
  if (!course.attempt?.minimumSeconds) return 0;
  return Math.min(
    100,
    Math.round(
      (course.attempt.accumulatedSeconds / course.attempt.minimumSeconds) * 100,
    ),
  );
}

function maskPhone(phone: string | null) {
  return phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "教师账号";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString())
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function deadlineText(value: string, status: string) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (status === "overdue" || days < 0) return `已逾期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天截止";
  return `距截止 ${days} 天`;
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
