import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import {
  hashPassword,
  validateAdminPassword,
} from "../src/modules/auth/password";

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.ADMIN_PHONE?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!phone || !/^1\d{10}$/.test(phone)) {
    throw new Error("ADMIN_PHONE must be an 11-digit admin phone number");
  }

  const validationError = validateAdminPassword(password);
  if (validationError) {
    throw new Error(validationError);
  }

  const admin = await prisma.user.findFirst({
    where: { phone, role: UserRole.admin },
    select: { id: true, name: true, status: true },
  });
  if (!admin) {
    throw new Error("Admin user was not found");
  }
  if (admin.status !== UserStatus.active) {
    throw new Error("Admin user is disabled");
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: admin.id },
      data: { passwordHash },
    });
    await transaction.auditLog.create({
      data: {
        userId: admin.id,
        action: "auth.admin.password.set",
        targetType: "User",
        targetId: admin.id,
        detail: { source: "cli" },
      },
    });
  });

  console.log(`Admin password updated for ${admin.name} (${phone}).`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
