import {
  PrismaClient,
  TeacherEmploymentStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import {
  hashPassword,
  validateTeacherWebPassword,
} from "../src/modules/auth/password";

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.TEACHER_WEB_PHONE?.trim();
  const password = process.env.TEACHER_WEB_PASSWORD ?? "";
  if (!phone || !/^1\d{10}$/.test(phone)) {
    throw new Error(
      "TEACHER_WEB_PHONE must be an 11-digit teacher phone number",
    );
  }

  const validationError = validateTeacherWebPassword(password);
  if (validationError) throw new Error(validationError);

  const teacher = await prisma.user.findFirst({
    where: { phone, role: UserRole.teacher },
    select: {
      id: true,
      name: true,
      status: true,
      employmentStatus: true,
    },
  });
  if (!teacher) throw new Error("Teacher user was not found");
  if (
    teacher.status !== UserStatus.active ||
    teacher.employmentStatus !== TeacherEmploymentStatus.employed
  ) {
    throw new Error("Teacher user is disabled or has resigned");
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: teacher.id },
      data: { passwordHash },
    });
    await transaction.auditLog.create({
      data: {
        userId: teacher.id,
        action: "auth.teacher_web.password.set",
        targetType: "User",
        targetId: teacher.id,
        detail: { source: "cli" },
      },
    });
  });

  console.log(`Teacher web password updated for ${teacher.name} (${phone}).`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
