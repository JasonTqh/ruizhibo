import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const campus = await prisma.campus.upsert({
    where: { id: "seed-campus-main" },
    update: {},
    create: {
      id: "seed-campus-main",
      name: "锐之博托管中心",
      address: "请替换为真实地址",
      phone: "13800000000",
    },
  });

  const teacher = await prisma.user.upsert({
    where: { phone: "13800000001" },
    update: {},
    create: {
      role: UserRole.teacher,
      name: "李老师",
      phone: "13800000001",
    },
  });

  const parent = await prisma.user.upsert({
    where: { phone: "13800000002" },
    update: {},
    create: {
      role: UserRole.parent,
      name: "张小明家长",
      phone: "13800000002",
    },
  });

  const klass = await prisma.class.create({
    data: {
      campusId: campus.id,
      teacherId: teacher.id,
      name: "晚托 A 班",
    },
  });

  const student = await prisma.student.create({
    data: {
      classId: klass.id,
      name: "张小明",
      gender: "男",
    },
  });

  await prisma.studentGuardian.create({
    data: {
      studentId: student.id,
      parentId: parent.id,
      relation: "妈妈",
    },
  });

  console.log("Seed data created", {
    campus: campus.name,
    class: klass.name,
    teacher: teacher.name,
    parent: parent.name,
    student: student.name,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
