export type UserRole = "admin" | "teacher" | "parent";

export type StudentStatus = "active" | "inactive" | "graduated";

export type AttendanceType = "arrive" | "leave" | "late" | "absence";

export type GrowthRecordType =
  | "attendance"
  | "homework"
  | "workflow"
  | "teacher_feedback"
  | "notice";

export interface ApiResponse<T> {
  data: T;
  requestId?: string;
}

export interface UserProfile {
  id: string;
  role: UserRole;
  name: string;
  phone?: string;
}

export interface StudentSummary {
  id: string;
  name: string;
  className: string;
  status: StudentStatus;
}

export interface GrowthRecord {
  id: string;
  studentId: string;
  type: GrowthRecordType;
  title: string;
  content: string;
  happenedAt: string;
  visibleToParent: boolean;
}

export interface WorkflowStepSummary {
  id: string;
  stepKey: string;
  name: string;
  timeRange: string;
  requirePhoto: boolean;
  checked: boolean;
  checkedAt?: string;
  photoUrls: string[];
}
