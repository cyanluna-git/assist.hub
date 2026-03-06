import prisma from "./prisma";

async function updateSummary() {
  const [,, materialId, summaryText] = process.argv;

  if (!materialId || !summaryText) {
    console.error("Usage: ts-node update_summary.ts <materialId> <summaryText>");
    process.exit(1);
  }

  try {
    // Note 레코드가 이미 있는지 확인
    const existingNote = await prisma.note.findFirst({
      where: { materialId: materialId }
    });

    if (existingNote) {
      await prisma.note.update({
        where: { id: existingNote.id },
        data: { aiSummary: summaryText }
      });
    } else {
      await prisma.note.create({
        data: {
          materialId: materialId,
          content: "",
          aiSummary: summaryText
        }
      });
    }
    console.log("DB에 AI 요약본이 저장되었습니다.");
  } catch (error) {
    console.error("DB 업데이트 중 오류 발생:", error);
  }
}

updateSummary();
