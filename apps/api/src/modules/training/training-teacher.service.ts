import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  TrainingAssignmentStatus,
  TrainingAttemptStatus,
  TrainingCourseStatus,
  TrainingStudyKind,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  StartStudySessionDto,
  StudyHeartbeatDto,
  SubmitQuizDto,
  SubmitTrainingFeedbackDto,
} from "./dto/training-teacher.dto";
import { TrainingAccessService } from "./training-access.service";
import { TrainingAuditService } from "./training-audit.service";
import {
  calculateHeartbeatSeconds,
  deadlineStatus,
  gradeQuiz,
  mergeWatchedRanges,
  VIDEO_COMPLETION_PERCENT,
  watchedPercent,
} from "./training.domain";
import { TrainingLifecycleService } from "./training-lifecycle.service";
import type {
  TrainingCourseSnapshotPayload,
  WatchedRange,
} from "./training.types";

const teacherAssignmentInclude = {
  campus: { select: { id: true, name: true } },
  mentor: { select: { id: true, name: true } },
  courses: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      snapshot: true,
      attempts: {
        orderBy: { attemptNumber: "desc" as const },
        take: 1,
        include: {
          chapterProgress: true,
          quizAttempts: { orderBy: { submittedAt: "desc" as const } },
          practicalChecks: {
            orderBy: { createdAt: "desc" as const },
            include: { reviewer: { select: { id: true, name: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.TrainingAssignmentInclude;

@Injectable()
export class TrainingTeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TrainingAccessService,
    private readonly audit: TrainingAuditService,
    private readonly lifecycle: TrainingLifecycleService,
  ) {}

  async home(teacherId: string) {
    const assignment = await this.currentAssignment(teacherId);
    const campusIds = assignment
      ? [assignment.campusId]
      : await this.teacherCampusIds(teacherId);
    const enabledFlags = await this.prisma.trainingFeatureFlag.findMany({
      where: { campusId: { in: campusIds }, enabled: true },
      select: { campusId: true },
    });
    const enabled = Boolean(
      assignment
        ? enabledFlags.some((flag) => flag.campusId === assignment.campusId)
        : enabledFlags.length,
    );
    if (!enabled) {
      return { data: { enabled: false, assignment: null } };
    }
    const [safety, unread, libraryCount, feedbackInvitation] = await Promise.all([
      this.prisma.trainingSafetyCredential.findUnique({
        where: { teacherId },
      }),
      this.prisma.trainingNotification.count({
        where: { userId: teacherId, readAt: null },
      }),
      this.prisma.trainingCourse.count({ where: { status: "enabled" } }),
      this.prisma.trainingAssignment.findFirst({
        where: {
          teacherId,
          status: TrainingAssignmentStatus.completed,
          feedback: null,
        },
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          roundNumber: true,
          completedAt: true,
          campus: { select: { id: true, name: true } },
        },
      }),
    ]);
    return {
      data: {
        enabled: true,
        assignment: assignment ? this.assignmentSummary(assignment) : null,
        safety,
        unreadNotifications: unread,
        libraryCount,
        feedbackInvitation,
      },
    };
  }

  async currentPlan(teacherId: string) {
    const assignment = await this.requireCurrentAssignment(teacherId);
    await this.access.assertCampusEnabled(assignment.campusId);
    return {
      data: {
        ...this.assignmentSummary(assignment),
        courses: assignment.courses.map((course) => ({
          id: course.id,
          sortOrder: course.sortOrder,
          status: course.status,
          locked: course.status === TrainingCourseStatus.locked,
          lockReason:
            course.status === TrainingCourseStatus.locked
              ? "请先完成上一门课程"
              : null,
          snapshot: {
            courseCode: course.snapshot.courseCode,
            courseName: course.snapshot.courseName,
            category: course.snapshot.category,
            minimumMinutes: course.snapshot.minimumMinutes,
            requiresPractical: course.snapshot.requiresPractical,
            isSafety: course.snapshot.isSafety,
          },
          attempt: course.attempts[0]
            ? this.attemptSummary(
                course.attempts[0],
                course.snapshot.payload as unknown as TrainingCourseSnapshotPayload,
              )
            : null,
        })),
      },
    };
  }

  async course(teacherId: string, assignmentCourseId: string) {
    const context = await this.requireTeacherCourse(teacherId, assignmentCourseId);
    await this.access.assertCampusEnabled(context.assignment.campusId);
    if (context.course.status === TrainingCourseStatus.locked) {
      throw new ForbiddenException("请先完成上一门课程，当前课程尚未解锁");
    }
    const payload = context.course.snapshot
      .payload as unknown as TrainingCourseSnapshotPayload;
    return {
      data: {
        assignmentId: context.assignment.id,
        assignmentStatus: context.assignment.status,
        deadlineStatus: deadlineStatus(new Date(), context.assignment.dueAt),
        course: {
          id: context.course.id,
          status: context.course.status,
          snapshot: publicSnapshot(payload),
          attempt: this.attemptSummary(context.attempt, payload),
        },
      },
    };
  }

  async library(teacherId: string, search?: string) {
    await this.assertAnyEnabledCampus(teacherId);
    const courses = await this.prisma.trainingCourse.findMany({
      where: {
        status: "enabled",
        OR: search
          ? [
              { name: { contains: search, mode: "insensitive" } },
              { summary: { contains: search, mode: "insensitive" } },
            ]
          : undefined,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        chapters: {
          where: { isEnabled: true },
          orderBy: { sortOrder: "asc" },
          include: {
            media: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });
    const assignment = await this.currentAssignment(teacherId);
    const formalByCourseId = new Map(
      assignment?.courses.map((course) => [course.originalCourseId, course]) ?? [],
    );
    return {
      data: courses.map((course) => {
        const formal = formalByCourseId.get(course.id);
        const formalLocked =
          !formal || formal.status === TrainingCourseStatus.locked;
        return {
          id: course.id,
          code: course.code,
          name: course.name,
          category: course.category,
          summary: course.summary,
          expectedMinutes: course.expectedMinutes,
          chapters: formalLocked ? [] : course.chapters,
          formalCourseId: formal?.id ?? null,
          formalStatus: formal?.status ?? null,
          formalLocked,
          lockedReason:
            !formal
              ? "课程未包含在当前培训计划中"
              : formal.status === TrainingCourseStatus.locked
                ? "请先完成上一门必修课程"
                : null,
          progressNotice: "资料库查阅不计入正式培训进度",
        };
      }),
    };
  }

  async startStudy(
    teacherId: string,
    assignmentCourseId: string,
    dto: StartStudySessionDto,
  ) {
    const context = await this.requireTeacherCourse(teacherId, assignmentCourseId);
    await this.assertLearnable(context);
    const payload = context.course.snapshot
      .payload as unknown as TrainingCourseSnapshotPayload;
    const chapter = payload.chapters.find(
      (item) => item.key === dto.chapterKey,
    );
    if (!chapter) {
      throw new NotFoundException("课程章节不存在");
    }
    const hasVideo = chapter.media.some((media) => media.type === "video");
    if (
      (dto.kind === TrainingStudyKind.video && !hasVideo) ||
      (dto.kind === TrainingStudyKind.content && hasVideo)
    ) {
      throw new BadRequestException("学习会话类型与章节内容不一致");
    }
    const session = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.trainingStudySession.findUnique({
        where: { clientSessionId: dto.clientSessionId },
      });
      if (existing) {
        if (
          existing.courseAttemptId !== context.attempt.id ||
          existing.chapterKey !== dto.chapterKey ||
          existing.kind !== dto.kind
        ) {
          throw new ConflictException("学习会话标识已被其他课程使用");
        }
        if (!existing.isActive) {
          throw new ConflictException("学习会话已经结束，请重新进入课程");
        }
        return existing;
      }
      const created = await tx.trainingStudySession.create({
        data: {
          clientSessionId: dto.clientSessionId,
          courseAttemptId: context.attempt.id,
          chapterKey: dto.chapterKey,
          kind: dto.kind,
        },
      });
      if (context.assignment.status === TrainingAssignmentStatus.pending) {
        await tx.trainingAssignment.update({
          where: { id: context.assignment.id },
          data: {
            status: TrainingAssignmentStatus.in_progress,
            startedAt: new Date(),
          },
        });
      }
      if (context.course.status === TrainingCourseStatus.available) {
        await tx.trainingAssignmentCourse.update({
          where: { id: context.course.id },
          data: { status: TrainingCourseStatus.in_progress },
        });
      }
      if (context.attempt.status === TrainingAttemptStatus.available) {
        await tx.trainingCourseAttempt.update({
          where: { id: context.attempt.id },
          data: { status: TrainingAttemptStatus.in_progress, startedAt: new Date() },
        });
      }
      return created;
    });
    return { data: session };
  }

  async heartbeat(teacherId: string, dto: StudyHeartbeatDto) {
    const session = await this.prisma.trainingStudySession.findUnique({
      where: { clientSessionId: dto.clientSessionId },
      include: {
        courseAttempt: {
          include: {
            assignmentCourse: {
              include: { assignment: true, snapshot: true },
            },
          },
        },
      },
    });
    if (!session) throw new NotFoundException("学习会话不存在");
    const course = session.courseAttempt.assignmentCourse;
    if (course.assignment.teacherId !== teacherId) {
      throw new ForbiddenException("不能更新其他教师的学习进度");
    }
    if (!session.isActive) {
      return { data: { updatedSession: session, creditedSeconds: 0 } };
    }
    await this.assertLearnable({
      assignment: course.assignment,
      course,
      attempt: session.courseAttempt,
    });
    if (session.kind === TrainingStudyKind.video) {
      const payload = course.snapshot
        .payload as unknown as TrainingCourseSnapshotPayload;
      const configuredVideo = payload.chapters
        .find((chapter) => chapter.key === session.chapterKey)
        ?.media.find((media) => media.type === "video");
      if (!configuredVideo) {
        throw new ConflictException("课程快照中不存在该视频章节");
      }
      if (
        dto.videoPositionSeconds !== undefined &&
        dto.videoDurationSeconds !== undefined &&
        dto.videoPositionSeconds > dto.videoDurationSeconds + 1
      ) {
        throw new BadRequestException("视频播放位置超出视频时长");
      }
      if (
        configuredVideo.durationSeconds &&
        dto.videoDurationSeconds &&
        Math.abs(configuredVideo.durationSeconds - dto.videoDurationSeconds) > 2
      ) {
        throw new BadRequestException("视频时长与课程快照不一致");
      }
    }
    const now = new Date();
    const effective = dto.visible && dto.active;
    const creditedSeconds = calculateHeartbeatSeconds(
      session.lastHeartbeatAt,
      now,
      effective,
      idleSeconds(),
    );
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.trainingStudySession.update({
        where: { id: session.id },
        data: {
          lastHeartbeatAt: now,
          accumulatedSeconds: { increment: creditedSeconds },
          isActive: dto.ended ? false : session.isActive,
          endedAt: dto.ended ? now : session.endedAt,
        },
      });
      if (creditedSeconds > 0) {
        await tx.trainingCourseAttempt.update({
          where: { id: session.courseAttemptId },
          data: {
            accumulatedSeconds: { increment: creditedSeconds },
            lastActivityAt: now,
          },
        });
        await tx.trainingAssignmentCourse.update({
          where: { id: course.id },
          data: { lastLearningAt: now },
        });
      }
      if (
        session.kind === TrainingStudyKind.video &&
        dto.videoDurationSeconds &&
        dto.videoPositionSeconds !== undefined
      ) {
        const current = await tx.trainingChapterProgress.findUnique({
          where: {
            courseAttemptId_chapterKey: {
              courseAttemptId: session.courseAttemptId,
              chapterKey: session.chapterKey,
            },
          },
        });
        const previousRanges = jsonRanges(current?.watchedRanges);
        const segment = this.acceptedVideoSegment(dto, creditedSeconds);
        const ranges = segment
          ? mergeWatchedRanges(
              previousRanges,
              segment,
              dto.videoDurationSeconds,
            )
          : previousRanges;
        await tx.trainingChapterProgress.upsert({
          where: {
            courseAttemptId_chapterKey: {
              courseAttemptId: session.courseAttemptId,
              chapterKey: session.chapterKey,
            },
          },
          update: {
            videoPositionSeconds: dto.videoPositionSeconds,
            videoDurationSeconds: dto.videoDurationSeconds,
            watchedRanges: ranges,
            watchedPercent: watchedPercent(ranges, dto.videoDurationSeconds),
            lastSavedAt: now,
          },
          create: {
            courseAttemptId: session.courseAttemptId,
            chapterKey: session.chapterKey,
            videoPositionSeconds: dto.videoPositionSeconds,
            videoDurationSeconds: dto.videoDurationSeconds,
            watchedRanges: ranges,
            watchedPercent: watchedPercent(ranges, dto.videoDurationSeconds),
            lastSavedAt: now,
          },
        });
      }
      await this.lifecycle.recomputeAttemptInTransaction(
        tx,
        session.courseAttemptId,
      );
      return { updatedSession, creditedSeconds };
    });
    return { data: result };
  }

  async completeChapter(
    teacherId: string,
    assignmentCourseId: string,
    chapterKey: string,
  ) {
    const context = await this.requireTeacherCourse(teacherId, assignmentCourseId);
    await this.assertLearnable(context);
    const payload = context.course.snapshot
      .payload as unknown as TrainingCourseSnapshotPayload;
    const chapter = payload.chapters.find((item) => item.key === chapterKey);
    if (!chapter) throw new NotFoundException("课程章节不存在");
    const progress = await this.prisma.trainingChapterProgress.findUnique({
      where: {
        courseAttemptId_chapterKey: {
          courseAttemptId: context.attempt.id,
          chapterKey,
        },
      },
    });
    if (
      chapter.media.some((media) => media.type === "video") &&
      (progress?.watchedPercent ?? 0) < VIDEO_COMPLETION_PERCENT
    ) {
      throw new ConflictException(
        `视频有效观看比例达到 ${VIDEO_COMPLETION_PERCENT}% 后才能完成本节`,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.trainingChapterProgress.upsert({
        where: {
          courseAttemptId_chapterKey: {
            courseAttemptId: context.attempt.id,
            chapterKey,
          },
        },
        update: { completedAt: progress?.completedAt ?? new Date() },
        create: {
          courseAttemptId: context.attempt.id,
          chapterKey,
          completedAt: new Date(),
        },
      });
      await this.lifecycle.recomputeAttemptInTransaction(tx, context.attempt.id);
      return item;
    });
    return { data: updated };
  }

  async submitQuiz(
    teacherId: string,
    assignmentCourseId: string,
    dto: SubmitQuizDto,
  ) {
    const context = await this.requireTeacherCourse(teacherId, assignmentCourseId);
    await this.assertLearnable(context);
    const payload = context.course.snapshot
      .payload as unknown as TrainingCourseSnapshotPayload;
    if (!payload.quiz) throw new NotFoundException("该课程没有配置测验");
    const completedChapterKeys = new Set(
      context.attempt.chapterProgress
        .filter((item) => item.completedAt)
        .map((item) => item.chapterKey),
    );
    if (
      payload.chapters.some(
        (chapter) => !completedChapterKeys.has(chapter.key),
      )
    ) {
      throw new ConflictException("完成全部课程章节后才能进入课后测验");
    }
    const previousCount = await this.prisma.trainingQuizAttempt.count({
      where: { courseAttemptId: context.attempt.id },
    });
    if (
      payload.quiz.maxAttempts !== null &&
      previousCount >= payload.quiz.maxAttempts
    ) {
      throw new ConflictException("本次课程的测验作答次数已用完");
    }
    const answers = Object.fromEntries(
      dto.answers.map((answer) => [answer.questionId, answer.answerIds]),
    );
    if (
      new Set(dto.answers.map((answer) => answer.questionId)).size !==
        dto.answers.length ||
      payload.quiz.questions.some((question) => !answers[question.id]) ||
      dto.answers.some(
        (answer) =>
          !payload.quiz?.questions.some(
            (question) => question.id === answer.questionId,
          ),
      )
    ) {
      throw new BadRequestException("必须且只能提交本次测验的全部题目");
    }
    const grade = gradeQuiz(
      payload.quiz.questions,
      answers,
      payload.quiz.passScore,
    );
    const attempt = await this.prisma.$transaction(async (tx) => {
      const record = await tx.trainingQuizAttempt.create({
        data: {
          courseAttemptId: context.attempt.id,
          attemptNumber: previousCount + 1,
          answers: dto.answers as unknown as Prisma.InputJsonValue,
          score: grade.score,
          passed: grade.passed,
        },
      });
      await this.lifecycle.recomputeAttemptInTransaction(tx, context.attempt.id);
      return record;
    });
    return {
      data: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        score: attempt.score,
        passed: attempt.passed,
        attemptsRemaining:
          payload.quiz.maxAttempts === null
            ? null
            : Math.max(0, payload.quiz.maxAttempts - attempt.attemptNumber),
      },
    };
  }

  async submitFeedback(
    teacherId: string,
    assignmentId: string,
    dto: SubmitTrainingFeedbackDto,
  ) {
    const assignment = await this.prisma.trainingAssignment.findFirst({
      where: { id: assignmentId, teacherId },
    });
    if (!assignment) throw new NotFoundException("培训任务不存在");
    if (assignment.status !== TrainingAssignmentStatus.completed) {
      throw new ConflictException("培训完成后才能提交总体反馈");
    }
    const existing = await this.prisma.trainingFeedback.findUnique({
      where: { assignmentId },
    });
    if (existing) throw new ConflictException("本轮培训已经提交过反馈");
    const feedback = await this.prisma.trainingFeedback.create({
      data: {
        assignmentId,
        teacherId,
        rating: dto.rating,
        reflection: dto.reflection?.trim() || null,
        suggestion: dto.suggestion?.trim() || null,
      },
    });
    return { data: feedback };
  }

  async notifications(teacherId: string) {
    const items = await this.prisma.trainingNotification.findMany({
      where: { userId: teacherId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { data: items };
  }

  async readNotification(teacherId: string, notificationId: string) {
    const result = await this.prisma.trainingNotification.updateMany({
      where: { id: notificationId, userId: teacherId, readAt: null },
      data: { readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException("培训通知不存在或已读");
    return { data: { id: notificationId, readAt: new Date() } };
  }

  private async currentAssignment(teacherId: string) {
    return this.prisma.trainingAssignment.findFirst({
      where: { teacherId, activeSlot: teacherId },
      include: teacherAssignmentInclude,
    });
  }

  private async requireCurrentAssignment(teacherId: string) {
    const assignment = await this.currentAssignment(teacherId);
    if (!assignment) throw new NotFoundException("当前没有有效培训任务");
    return assignment;
  }

  private async requireTeacherCourse(
    teacherId: string,
    assignmentCourseId: string,
  ) {
    const course = await this.prisma.trainingAssignmentCourse.findUnique({
      where: { id: assignmentCourseId },
      include: {
        snapshot: true,
        assignment: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
          include: {
            chapterProgress: true,
            quizAttempts: { orderBy: { submittedAt: "desc" } },
            practicalChecks: {
              orderBy: { createdAt: "desc" },
              include: { reviewer: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!course || course.assignment.teacherId !== teacherId) {
      throw new NotFoundException("培训课程任务不存在");
    }
    const attempt = course.attempts[0];
    if (!attempt) throw new ConflictException("课程学习尝试不存在");
    return { assignment: course.assignment, course, attempt };
  }

  private async assertLearnable(context: {
    assignment: { campusId: string; status: TrainingAssignmentStatus };
    course: { status: TrainingCourseStatus };
    attempt: { status: TrainingAttemptStatus };
  }) {
    await this.access.assertCampusEnabled(context.assignment.campusId);
    if (
      context.assignment.status === TrainingAssignmentStatus.frozen ||
      context.assignment.status === TrainingAssignmentStatus.terminated ||
      context.assignment.status === TrainingAssignmentStatus.completed
    ) {
      throw new ConflictException("当前培训任务不能继续学习");
    }
    if (context.course.status === TrainingCourseStatus.locked) {
      throw new ForbiddenException("请先完成上一门课程");
    }
    const endedCourseStatuses: TrainingCourseStatus[] = [
      TrainingCourseStatus.completed,
      TrainingCourseStatus.exempted,
      TrainingCourseStatus.awaiting_practical,
      TrainingCourseStatus.awaiting_safety,
    ];
    if (
      endedCourseStatuses.includes(context.course.status) ||
      context.attempt.status === TrainingAttemptStatus.superseded
    ) {
      throw new ConflictException("当前课程已结束，不能继续写入学习进度");
    }
  }

  private assignmentSummary(
    assignment: Awaited<ReturnType<TrainingTeacherService["currentAssignment"]>> & {},
  ) {
    const courses = assignment.courses;
    const completedStatuses: TrainingCourseStatus[] = [
      TrainingCourseStatus.completed,
      TrainingCourseStatus.exempted,
      TrainingCourseStatus.awaiting_safety,
    ];
    const completed = courses.filter((course) =>
      completedStatuses.includes(course.status),
    ).length;
    const currentStatuses: TrainingCourseStatus[] = [
      TrainingCourseStatus.available,
      TrainingCourseStatus.in_progress,
      TrainingCourseStatus.awaiting_practical,
      TrainingCourseStatus.awaiting_safety,
    ];
    const current = courses.find((course) =>
      currentStatuses.includes(course.status),
    );
    return {
      id: assignment.id,
      type: assignment.type,
      roundNumber: assignment.roundNumber,
      status: assignment.status,
      campus: assignment.campus,
      mentor: assignment.mentor,
      assignedAt: assignment.assignedAt,
      dueAt: assignment.dueAt,
      deadlineStatus: deadlineStatus(new Date(), assignment.dueAt),
      completedCourses: completed,
      totalCourses: courses.length,
      progressPercent: courses.length
        ? Math.round((completed / courses.length) * 100)
        : 0,
      currentCourse: current
        ? {
            id: current.id,
            name: current.snapshot.courseName,
            status: current.status,
          }
        : null,
    };
  }

  private attemptSummary(
    attempt: {
      attemptNumber: number;
      status: TrainingAttemptStatus;
      accumulatedSeconds: number;
      chapterProgress: Array<{
        chapterKey: string;
        completedAt: Date | null;
        videoPositionSeconds: number;
        watchedPercent: number;
      }>;
      quizAttempts: Array<{ score: number; passed: boolean; submittedAt: Date }>;
      practicalChecks: Array<{
        conclusion: string;
        checklistResults: Prisma.JsonValue;
        comment: string;
        createdAt: Date;
        reviewer: { id: string; name: string } | null;
      }>;
    },
    payloadValue: TrainingCourseSnapshotPayload,
  ) {
    const payload = payloadValue;
    return {
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      accumulatedSeconds: attempt.accumulatedSeconds,
      minimumSeconds: payload.course.minimumMinutes * 60,
      chapterProgress: attempt.chapterProgress,
      latestQuiz: attempt.quizAttempts[0] ?? null,
      quizAttemptCount: attempt.quizAttempts.length,
      latestPractical: attempt.practicalChecks[0] ?? null,
      practicalHistory: attempt.practicalChecks.map((check) => ({
        conclusion: check.conclusion,
        checklistResults: check.checklistResults,
        comment: check.comment,
        createdAt: check.createdAt,
        reviewer: check.reviewer,
      })),
    };
  }

  private acceptedVideoSegment(
    dto: StudyHeartbeatDto,
    creditedSeconds: number,
  ): WatchedRange | null {
    if (
      creditedSeconds <= 0 ||
      dto.watchedFrom === undefined ||
      dto.watchedTo === undefined ||
      dto.watchedTo <= dto.watchedFrom
    ) {
      return null;
    }
    const playbackRate = dto.playbackRate ?? 1;
    if (
      dto.watchedTo - dto.watchedFrom >
      creditedSeconds * playbackRate * 1.1 + 2
    ) {
      return null;
    }
    return [dto.watchedFrom, dto.watchedTo];
  }

  private async teacherCampusIds(teacherId: string) {
    const [classes, assignments] = await Promise.all([
      this.prisma.class.findMany({
        where: { teacherId },
        distinct: ["campusId"],
        select: { campusId: true },
      }),
      this.prisma.trainingAssignment.findMany({
        where: { teacherId },
        distinct: ["campusId"],
        select: { campusId: true },
      }),
    ]);
    return [
      ...new Set([
        ...classes.map((item) => item.campusId),
        ...assignments.map((item) => item.campusId),
      ]),
    ];
  }

  private async assertAnyEnabledCampus(teacherId: string) {
    const assignment = await this.currentAssignment(teacherId);
    if (assignment) {
      await this.access.assertCampusEnabled(assignment.campusId);
      return;
    }
    const campusIds = await this.teacherCampusIds(teacherId);
    const enabled = await this.prisma.trainingFeatureFlag.count({
      where: { campusId: { in: campusIds }, enabled: true },
    });
    if (!enabled) throw new ForbiddenException("所属校区暂未开放教师学院");
  }
}

function publicSnapshot(payload: TrainingCourseSnapshotPayload) {
  return {
    ...payload,
    quiz: payload.quiz
      ? {
          passScore: payload.quiz.passScore,
          maxAttempts: payload.quiz.maxAttempts,
          questions: payload.quiz.questions.map(
            ({ correctAnswers: _correctAnswers, explanation: _explanation, ...question }) =>
              question,
          ),
        }
      : null,
  };
}

function jsonRanges(value: Prisma.JsonValue | null | undefined): WatchedRange[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is [number, number] =>
        Array.isArray(item) &&
        item.length === 2 &&
        typeof item[0] === "number" &&
        typeof item[1] === "number",
    )
    .map(([start, end]) => [start, end]);
}

function idleSeconds() {
  const configured = Number(process.env.TRAINING_IDLE_SECONDS ?? 5 * 60);
  return Number.isFinite(configured) && configured >= 30 && configured <= 3_600
    ? Math.floor(configured)
    : 5 * 60;
}
