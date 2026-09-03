export type TeacherProfile = {
  id: string;
  role: "teacher";
  name: string;
  phone: string | null;
};

export type AssignmentSummary = {
  id: string;
  type: string;
  roundNumber: number;
  status: string;
  campus: { id: string; name: string };
  mentor: { id: string; name: string } | null;
  assignedAt: string;
  dueAt: string;
  deadlineStatus: string;
  completedCourses: number;
  totalCourses: number;
  progressPercent: number;
  currentCourse: { id: string; name: string; status: string } | null;
};

export type TrainingHome = {
  enabled: boolean;
  assignment: AssignmentSummary | null;
  safety?: {
    status?: string;
    validUntil?: string | null;
  } | null;
  unreadNotifications?: number;
  libraryCount?: number;
};

export type AssignmentCourse = {
  id: string;
  sortOrder: number;
  status: string;
  locked: boolean;
  lockReason: string | null;
  snapshot: {
    courseCode: string;
    courseName: string;
    category: string;
    minimumMinutes: number;
    requiresPractical: boolean;
    isSafety: boolean;
  };
  attempt: {
    attemptNumber: number;
    status: string;
    accumulatedSeconds: number;
    minimumSeconds: number;
  } | null;
};

export type CurrentPlan = AssignmentSummary & {
  courses: AssignmentCourse[];
};

export type LibraryCourse = {
  id: string;
  code: string;
  name: string;
  category: string;
  summary: string;
  expectedMinutes: number;
  formalCourseId: string | null;
  formalStatus: string | null;
  formalLocked: boolean;
  lockedReason: string | null;
  progressNotice: string;
};

export type TrainingNotification = {
  id: string;
  type: string;
  title: string;
  content: string;
  readAt: string | null;
  createdAt: string;
};

export type AcademyData = {
  home: TrainingHome;
  plan: CurrentPlan | null;
  library: LibraryCourse[];
  notifications: TrainingNotification[];
};

export type TrainingMedia = {
  id: string;
  type: "image" | "video";
  fileAssetId: string;
  caption: string | null;
  sortOrder: number;
  durationSeconds: number | null;
};

export type TrainingChapter = {
  key: string;
  title: string;
  contentHtml: string;
  sortOrder: number;
  media: TrainingMedia[];
};

export type TrainingQuestion = {
  id: string;
  type: "single_choice" | "multiple_choice" | "true_false";
  prompt: string;
  options: Array<{ id: string; label: string }>;
  score: number;
  sortOrder: number;
};

export type ChapterProgress = {
  chapterKey: string;
  completedAt: string | null;
  videoPositionSeconds: number;
  videoDurationSeconds?: number;
  watchedPercent: number;
};

export type CourseAttempt = {
  attemptNumber: number;
  status: string;
  accumulatedSeconds: number;
  minimumSeconds: number;
  chapterProgress: ChapterProgress[];
  latestQuiz: { score: number; passed: boolean; submittedAt: string } | null;
  quizAttemptCount: number;
  latestPractical: {
    conclusion: string;
    comment: string;
    createdAt: string;
  } | null;
};

export type TrainingCourseDetail = {
  assignmentId: string;
  assignmentStatus: string;
  deadlineStatus: string;
  course: {
    id: string;
    status: string;
    snapshot: {
      schemaVersion: 1;
      course: {
        id: string;
        code: string;
        name: string;
        category: string;
        summary: string;
        audience: string | null;
        expectedMinutes: number;
        minimumMinutes: number;
        requiresPractical: boolean;
        isSafety: boolean;
        coverAssetId: string | null;
      };
      chapters: TrainingChapter[];
      quiz: {
        passScore: number;
        maxAttempts: number | null;
        questions: TrainingQuestion[];
      } | null;
      practicalItems: Array<{
        id: string;
        title: string;
        instructions: string | null;
        isRequired: boolean;
        sortOrder: number;
      }>;
    };
    attempt: CourseAttempt;
  };
};

export type QuizSubmissionResult = {
  id: string;
  attemptNumber: number;
  score: number;
  passed: boolean;
  attemptsRemaining: number | null;
};
