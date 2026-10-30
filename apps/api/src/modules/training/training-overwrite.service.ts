import { ConflictException, Injectable } from "@nestjs/common";
import {
  Prisma,
  TrainingAssignmentStatus,
  TrainingCourseStatus,
  TrainingAttemptStatus,
} from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { TrainingAuditService } from "./training-audit.service";
import { TrainingLifecycleService } from "./training-lifecycle.service";
import {
  compareSnapshots,
  canonical,
  snapshotChecksum,
  versionedPayload,
} from "./training-overwrite.domain";
import type { TrainingCourseSnapshotPayload as Payload } from "./training.types";

const eligible = (courseId: string) => ({
  originalCourseId: courseId,
  status: {
    notIn: [TrainingCourseStatus.completed, TrainingCourseStatus.exempted],
  },
  assignment: {
    status: {
      in: [
        TrainingAssignmentStatus.pending,
        TrainingAssignmentStatus.in_progress,
        TrainingAssignmentStatus.awaiting_safety,
      ],
    },
    frozenAt: null,
  },
});
const targetInclude = {
  snapshot: true,
  assignment: {
    include: {
      teacher: { select: { id: true, name: true } },
      campus: { select: { id: true, name: true } },
    },
  },
  attempts: {
    orderBy: { attemptNumber: "desc" as const },
    take: 1,
    include: {
      chapterProgress: true,
      quizAttempts: true,
      practicalChecks: true,
    },
  },
} satisfies Prisma.TrainingAssignmentCourseInclude;
type Target = Prisma.TrainingAssignmentCourseGetPayload<{
  include: typeof targetInclude;
}>;

@Injectable()
export class TrainingOverwriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: TrainingAuditService,
    private readonly lifecycle: TrainingLifecycleService,
  ) {}
  private targets(
    client: Prisma.TransactionClient | PrismaService,
    courseId: string,
  ) {
    return client.trainingAssignmentCourse.findMany({
      where: eligible(courseId),
      include: targetInclude,
      orderBy: { id: "asc" },
    });
  }
  private token(
    actorId: string,
    updatedAt: Date,
    payload: Payload,
    targets: Target[],
  ) {
    return createHmac(
      "sha256",
      process.env.JWT_SECRET || "local-training-preview",
    )
      .update(
        JSON.stringify({
          actorId,
          updatedAt: updatedAt.toISOString(),
          payload: canonical(payload),
          targets: targets.map((t) => ({
            id: t.id,
            snapshot: t.snapshotId,
            attempt: t.currentAttemptNumber,
            status: t.status,
            assignmentStatus: t.assignment.status,
          })),
        }),
      )
      .digest("hex");
  }
  async preview(
    actorId: string,
    courseId: string,
    updatedAt: Date,
    payload: Payload,
  ) {
    const targets = await this.targets(this.prisma, courseId);
    return {
      data: {
        token: this.token(actorId, updatedAt, payload, targets),
        count: targets.length,
        targets: targets.map((t) => ({
          id: t.id,
          assignmentId: t.assignmentId,
          teacher: t.assignment.teacher,
          campus: t.assignment.campus,
          status: t.status,
          ...compareSnapshots(t.snapshot.payload as unknown as Payload, payload)
            .summary,
        })),
        notice:
          "仅覆盖未冻结活跃任务中的未完成、未免修课程。累计时长保留；变化部分重新完成；截止日期、带教及校区保持不变。",
      },
    };
  }
  async confirm(
    tx: Prisma.TransactionClient,
    actorId: string,
    courseId: string,
    updatedAt: Date,
    payload: Payload,
    token?: string,
  ) {
    if (!token) throw new ConflictException("请先预览覆盖影响并确认");
    let targets = await this.targets(tx, courseId);
    for (const teacherId of [
      ...new Set(targets.map((t) => t.assignment.teacherId)),
    ].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training:${teacherId}`}))`;
    }
    targets = await this.targets(tx, courseId);
    if (this.token(actorId, updatedAt, payload, targets) !== token)
      throw new ConflictException("课程或在用任务已变化，请重新预览后确认覆盖");
    return targets;
  }
  async apply(
    tx: Prisma.TransactionClient,
    actorId: string,
    targets: Target[],
    latest: Payload,
    reason: string,
  ) {
    for (const course of targets) {
      const old = course.attempts[0];
      if (!old) throw new ConflictException("课程缺少学习记录，请先核查任务");
      const payload = versionedPayload(latest, randomUUID());
      const diff = compareSnapshots(
        course.snapshot.payload as unknown as Payload,
        payload,
      );
      const snapshot = await tx.trainingCourseSnapshot.create({
        data: {
          originalCourseId: course.originalCourseId,
          courseCode: payload.course.code,
          courseName: payload.course.name,
          category: payload.course.category,
          minimumMinutes: payload.course.minimumMinutes,
          requiresPractical: payload.course.requiresPractical,
          isSafety: payload.course.isSafety,
          checksum: snapshotChecksum(payload),
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.trainingCourseAttempt.updateMany({
        where: { assignmentCourseId: course.id, snapshotId: null },
        data: { snapshotId: course.snapshotId },
      });
      await tx.trainingCourseAttempt.update({
        where: { id: old.id },
        data: { status: TrainingAttemptStatus.superseded },
      });
      await tx.trainingStudySession.updateMany({
        where: { courseAttemptId: old.id, isActive: true },
        data: { isActive: false, endedAt: new Date() },
      });
      const attempt = await tx.trainingCourseAttempt.create({
        data: {
          assignmentCourseId: course.id,
          snapshotId: snapshot.id,
          attemptNumber: course.currentAttemptNumber + 1,
          status: old.startedAt
            ? TrainingAttemptStatus.in_progress
            : TrainingAttemptStatus.available,
          accumulatedSeconds: old.accumulatedSeconds,
          startedAt: old.startedAt,
          lastActivityAt: old.lastActivityAt,
        },
      });
      for (const pair of diff.chapters) {
        const progress = old.chapterProgress.find(
          (p) => p.chapterKey === pair.before.key,
        );
        if (progress)
          await tx.trainingChapterProgress.create({
            data: {
              courseAttemptId: attempt.id,
              chapterKey: pair.after.key,
              completedAt: progress.completedAt,
              videoPositionSeconds: progress.videoPositionSeconds,
              videoDurationSeconds: progress.videoDurationSeconds,
              watchedRanges: progress.watchedRanges ?? Prisma.JsonNull,
              watchedPercent: progress.watchedPercent,
              lastSavedAt: progress.lastSavedAt,
            },
          });
      }
      if (diff.quizUnchanged)
        for (const quiz of old.quizAttempts) {
          const answers = Array.isArray(quiz.answers)
            ? quiz.answers.map((answer: any) => ({
                ...answer,
                questionId:
                  diff.questions.find((p) => p.before.id === answer.questionId)
                    ?.after.id ?? answer.questionId,
              }))
            : quiz.answers;
          await tx.trainingQuizAttempt.create({
            data: {
              courseAttemptId: attempt.id,
              attemptNumber: quiz.attemptNumber,
              answers: answers as Prisma.InputJsonValue,
              score: quiz.score,
              passed: quiz.passed,
              submittedAt: quiz.submittedAt,
            },
          });
        }
      if (diff.practicalUnchanged)
        for (const check of old.practicalChecks) {
          const results = Array.isArray(check.checklistResults)
            ? check.checklistResults.map((r: any) => ({
                ...r,
                itemId:
                  diff.practical.find((p) => p.before.id === r.itemId)?.after
                    .id ?? r.itemId,
              }))
            : check.checklistResults;
          await tx.trainingPracticalCheck.create({
            data: {
              courseAttemptId: attempt.id,
              reviewerId: check.reviewerId,
              conclusion: check.conclusion,
              checklistResults: results as Prisma.InputJsonValue,
              comment: check.comment,
              createdAt: check.createdAt,
            },
          });
        }
      await tx.trainingAssignmentCourse.update({
        where: { id: course.id },
        data: {
          snapshotId: snapshot.id,
          currentAttemptNumber: attempt.attemptNumber,
          status:
            course.status === TrainingCourseStatus.locked
              ? TrainingCourseStatus.locked
              : TrainingCourseStatus.in_progress,
          completedAt: null,
        },
      });
      // A pending safety qualification cannot remain valid when its supporting course is replaced.
      if (
        course.snapshot.isSafety &&
        course.status === TrainingCourseStatus.awaiting_safety
      ) {
        await tx.trainingSafetyCredential.updateMany({
          where: { teacherId: course.assignment.teacherId },
          data: {
            status: "retraining_required",
            latestRecordId: null,
            validFrom: null,
            validUntil: null,
          },
        });
        await tx.trainingSafetyRecord.create({
          data: {
            teacherId: course.assignment.teacherId,
            campusId: course.assignment.campusId,
            assignmentId: course.assignmentId,
            courseAttemptId: old.id,
            actorId,
            action: "invalidated",
            reason: "课程版本更新，需依据新要求重新核验",
          },
        });
        await tx.trainingAssignment.update({
          where: { id: course.assignmentId },
          data: {
            status: course.assignment.startedAt ? "in_progress" : "pending",
          },
        });
      }
      if (course.status !== TrainingCourseStatus.locked)
        await this.lifecycle.recomputeAttemptInTransaction(tx, attempt.id);
      await tx.trainingNotification.create({
        data: {
          userId: course.assignment.teacherId,
          type: "assignment_created",
          title: "培训课程已更新",
          content: `《${payload.course.name}》已更新，请重新进入课程。已有时长保留，变化内容需重新完成。`,
          assignmentId: course.assignmentId,
          assignmentCourseId: course.id,
          dedupeKey: `course-updated:${attempt.id}`,
        },
      });
      await this.audit.log(
        {
          actorId,
          campusId: course.assignment.campusId,
          assignmentId: course.assignmentId,
          action: "course.overwrite",
          targetType: "TrainingAssignmentCourse",
          targetId: course.id,
          before: {
            snapshotId: course.snapshotId,
            attemptId: old.id,
            minimumMinutes: course.snapshot.minimumMinutes,
          },
          after: {
            snapshotId: snapshot.id,
            attemptId: attempt.id,
            ...diff.summary,
            carriedQuiz: diff.quizUnchanged,
            carriedPractical: diff.practicalUnchanged,
          },
          reason,
        },
        tx,
      );
    }
    return { overwrittenCount: targets.length };
  }
}
