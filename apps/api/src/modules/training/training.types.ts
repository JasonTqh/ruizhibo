import type {
  TrainingCourseCategory,
  TrainingMediaType,
  TrainingQuestionType,
} from "@prisma/client";

export interface TrainingSnapshotMedia {
  id: string;
  type: TrainingMediaType;
  fileAssetId: string;
  caption: string | null;
  sortOrder: number;
  durationSeconds: number | null;
}

export interface TrainingSnapshotChapter {
  key: string;
  title: string;
  contentHtml: string;
  sortOrder: number;
  media: TrainingSnapshotMedia[];
}

export interface TrainingSnapshotQuestionOption {
  id: string;
  label: string;
}

export interface TrainingSnapshotQuestion {
  id: string;
  type: TrainingQuestionType;
  prompt: string;
  options: TrainingSnapshotQuestionOption[];
  correctAnswers: string[];
  score: number;
  explanation: string | null;
  sortOrder: number;
}

export interface TrainingSnapshotQuiz {
  passScore: number;
  maxAttempts: number | null;
  questions: TrainingSnapshotQuestion[];
}

export interface TrainingSnapshotPracticalItem {
  id: string;
  title: string;
  instructions: string | null;
  isRequired: boolean;
  sortOrder: number;
}

export interface TrainingCourseSnapshotPayload {
  schemaVersion: 1;
  course: {
    id: string;
    code: string;
    name: string;
    category: TrainingCourseCategory;
    summary: string;
    audience: string | null;
    expectedMinutes: number;
    minimumMinutes: number;
    sortOrder: number;
    requiresPractical: boolean;
    isSafety: boolean;
    coverAssetId: string | null;
  };
  chapters: TrainingSnapshotChapter[];
  quiz: TrainingSnapshotQuiz | null;
  practicalItems: TrainingSnapshotPracticalItem[];
}

export type WatchedRange = [number, number];
