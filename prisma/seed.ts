import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("test1234", 10);
  const users = [
    { name: "Admin", email: "admin@test.com", role: "ADMIN" },
    { name: "Maya Mentor", email: "mentor@test.com", role: "MENTOR" },
    { name: "Sam Student", email: "student@test.com", role: "STUDENT" },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }
  // Mentor available Mon–Fri 09:00–17:00 so /schedule/new has slots out of the box.
  const mentor = await db.user.findUniqueOrThrow({ where: { email: "mentor@test.com" } });
  if ((await db.availability.count({ where: { mentorId: mentor.id } })) === 0) {
    await db.availability.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        mentorId: mentor.id,
        weekday,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      })),
    });
  }
  // A sample program so the Students page has sessions to schedule.
  const student = await db.user.findUniqueOrThrow({ where: { email: "student@test.com" } });
  if ((await db.program.count()) === 0) {
    const titles = ["Orientation & Introduction to Budgeting", "Budgeting", "Banking", "Spending", "Earning"];
    const program = await db.program.create({
      data: { name: "Financial Literacy - Pilot Program L1", sessions: { create: titles.map((title, i) => ({ title, order: i + 1 })) } },
    });
    await db.user.update({ where: { id: student.id }, data: { programId: program.id } });
  }
  console.log("Seeded admin@test.com / mentor@test.com / student@test.com (password: test1234)");
}

main().finally(() => db.$disconnect());
