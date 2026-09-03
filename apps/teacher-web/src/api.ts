import type {
  AcademyData,
  CurrentPlan,
  LibraryCourse,
  QuizSubmissionResult,
  TeacherProfile,
  TrainingCourseDetail,
  TrainingHome,
  TrainingNotification,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(
  /\/$/,
  "",
);

type ApiEnvelope<T> = { data: T };
type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string | string[];
  };
  message?: string | string[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as
    ApiEnvelope<T> | ApiErrorEnvelope;

  if (!response.ok) {
    const rawMessage =
      "error" in body
        ? body.error?.message
        : (body as ApiErrorEnvelope).message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join("；")
      : rawMessage || "请求失败，请稍后重试";
    throw new ApiError(message, response.status);
  }

  return (body as ApiEnvelope<T>).data;
}

export function resolveApiAssetUrl(url: string) {
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  if (!/^https?:/i.test(API_BASE)) return `/${url.replace(/^\/+/, "")}`;
  return `${new URL(API_BASE).origin}/${url.replace(/^\/+/, "")}`;
}

export async function loginTeacher(phone: string, password: string) {
  return request<{ token: string; user: TeacherProfile }>(
    "/auth/teacher-web-login",
    {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    },
  );
}

export function getCurrentTeacher(token: string) {
  return request<TeacherProfile>("/me", {}, token);
}

export async function getAcademyData(token: string): Promise<AcademyData> {
  const home = await request<TrainingHome>("/teacher/training/home", {}, token);
  if (!home.enabled) {
    return { home, plan: null, library: [], notifications: [] };
  }

  const [plan, library, notifications] = await Promise.all([
    request<CurrentPlan>("/teacher/training/current", {}, token).catch(
      (error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      },
    ),
    request<LibraryCourse[]>("/teacher/training/library", {}, token),
    request<TrainingNotification[]>(
      "/teacher/training/notifications",
      {},
      token,
    ),
  ]);

  return { home, plan, library, notifications };
}

export function getTrainingCourse(token: string, assignmentCourseId: string) {
  return request<TrainingCourseDetail>(
    `/teacher/training/courses/${encodeURIComponent(assignmentCourseId)}`,
    {},
    token,
  );
}

export function startStudySession(
  token: string,
  assignmentCourseId: string,
  input: {
    clientSessionId: string;
    chapterKey: string;
    kind: "content" | "video";
  },
) {
  return request<{ clientSessionId: string }>(
    `/teacher/training/courses/${encodeURIComponent(assignmentCourseId)}/study/start`,
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
}

export function sendStudyHeartbeat(
  token: string,
  input: {
    clientSessionId: string;
    visible: boolean;
    active: boolean;
    ended?: boolean;
    videoPositionSeconds?: number;
    videoDurationSeconds?: number;
    watchedFrom?: number;
    watchedTo?: number;
    playbackRate?: number;
  },
  keepalive = false,
) {
  return request<{ creditedSeconds: number }>(
    "/teacher/training/study/heartbeat",
    { method: "POST", body: JSON.stringify(input), keepalive },
    token,
  );
}

export function completeTrainingChapter(
  token: string,
  assignmentCourseId: string,
  chapterKey: string,
) {
  return request<{ completedAt: string }>(
    `/teacher/training/courses/${encodeURIComponent(assignmentCourseId)}/chapters/complete`,
    { method: "POST", body: JSON.stringify({ chapterKey }) },
    token,
  );
}

export function submitTrainingQuiz(
  token: string,
  assignmentCourseId: string,
  answers: Array<{ questionId: string; answerIds: string[] }>,
) {
  return request<QuizSubmissionResult>(
    `/teacher/training/courses/${encodeURIComponent(assignmentCourseId)}/quiz`,
    { method: "POST", body: JSON.stringify({ answers }) },
    token,
  );
}

export function getTrainingAssetAccess(token: string, assetId: string) {
  return request<{
    assetId: string;
    mimeType: string;
    expiresAt: string;
    url: string;
  }>(`/files/training/${encodeURIComponent(assetId)}/access`, {}, token);
}

export function markTrainingNotificationRead(
  token: string,
  notificationId: string,
) {
  return request<{ id: string; readAt: string }>(
    `/teacher/training/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST" },
    token,
  );
}
