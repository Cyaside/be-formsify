import "dotenv/config";
import prisma from "../lib/prisma";
import { hashPassword } from "../lib/auth";

const DEMO_EMAIL = "demo@formsify.local";
const DEMO_PASSWORD = "demo1234";
const DEMO_FORM_TITLE = "Demo P1 - Open Recruitment Form";

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      passwordHash,
      name: "Demo User",
      provider: "LOCAL",
    },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "Demo User",
      provider: "LOCAL",
    },
  });

  await prisma.form.deleteMany({
    where: {
      ownerId: user.id,
      title: { startsWith: "Demo P1 -" },
    },
  });

  const form = await prisma.form.create({
    data: {
      ownerId: user.id,
      title: DEMO_FORM_TITLE,
      description: "Form demo untuk uji flow author/respondent.",
      thankYouTitle: "Terima kasih sudah mengisi!",
      thankYouMessage: "Respons demo kamu sudah tersimpan.",
      isPublished: true,
    },
  });

  const sectionIdentity = await prisma.section.create({
    data: {
      formId: form.id,
      title: "Identitas",
      description: "Informasi dasar peserta",
      order: 0,
    },
  });

  const sectionPreferences = await prisma.section.create({
    data: {
      formId: form.id,
      title: "Preferensi",
      description: "Pilihan dan minat",
      order: 1,
    },
  });

  const qName = await prisma.question.create({
    data: {
      formId: form.id,
      sectionId: sectionIdentity.id,
      title: "Nama lengkap",
      type: "SHORT_ANSWER",
      required: true,
      order: 0,
    },
  });

  const qRole = await prisma.question.create({
    data: {
      formId: form.id,
      sectionId: sectionPreferences.id,
      title: "Divisi yang diminati",
      type: "MCQ",
      required: true,
      order: 0,
      options: {
        create: [
          { label: "Frontend", order: 0 },
          { label: "Backend", order: 1 },
          { label: "UI/UX", order: 2 },
        ],
      },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  const qTools = await prisma.question.create({
    data: {
      formId: form.id,
      sectionId: sectionPreferences.id,
      title: "Tools yang pernah dipakai",
      type: "CHECKBOX",
      required: false,
      order: 1,
      options: {
        create: [
          { label: "React", order: 0 },
          { label: "Express", order: 1 },
          { label: "Figma", order: 2 },
          { label: "PostgreSQL", order: 3 },
        ],
      },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  const qCommitment = await prisma.question.create({
    data: {
      formId: form.id,
      sectionId: sectionPreferences.id,
      title: "Komitmen waktu per minggu",
      type: "DROPDOWN",
      required: true,
      order: 2,
      options: {
        create: [
          { label: "< 5 jam", order: 0 },
          { label: "5-10 jam", order: 1 },
          { label: "> 10 jam", order: 2 },
        ],
      },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });

  const frontendRole = qRole.options.find((option) => option.label === "Frontend");
  const backendRole = qRole.options.find((option) => option.label === "Backend");
  const reactTool = qTools.options.find((option) => option.label === "React");
  const expressTool = qTools.options.find((option) => option.label === "Express");
  const figmaTool = qTools.options.find((option) => option.label === "Figma");
  const commitment510 = qCommitment.options.find((option) => option.label === "5-10 jam");
  const commitment10Plus = qCommitment.options.find((option) => option.label === "> 10 jam");

  if (
    !frontendRole ||
    !backendRole ||
    !reactTool ||
    !expressTool ||
    !figmaTool ||
    !commitment510 ||
    !commitment10Plus
  ) {
    throw new Error("Failed to resolve seeded options");
  }

  await prisma.response.create({
    data: {
      formId: form.id,
      answers: {
        create: [
          { questionId: qName.id, text: "Andi Pratama" },
          { questionId: qRole.id, optionId: frontendRole.id },
          { questionId: qTools.id, optionId: reactTool.id },
          { questionId: qTools.id, optionId: figmaTool.id },
          { questionId: qCommitment.id, optionId: commitment510.id },
        ],
      },
    },
  });

  await prisma.response.create({
    data: {
      formId: form.id,
      answers: {
        create: [
          { questionId: qName.id, text: "Budi Santoso" },
          { questionId: qRole.id, optionId: backendRole.id },
          { questionId: qTools.id, optionId: expressTool.id },
          { questionId: qTools.id, optionId: reactTool.id },
          { questionId: qCommitment.id, optionId: commitment10Plus.id },
        ],
      },
    },
  });

  console.log("Demo seed complete");
  console.log(`Email    : ${DEMO_EMAIL}`);
  console.log(`Password : ${DEMO_PASSWORD}`);
  console.log(`Form ID   : ${form.id}`);
  console.log(`Share URL : http://localhost:3000/share/${form.id}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
