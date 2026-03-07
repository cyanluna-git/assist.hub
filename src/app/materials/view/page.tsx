import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import DocumentViewer from "./DocumentViewer";
import type { RecentMaterialResumeView } from "@/lib/recent-materials";

interface PageProps {
  searchParams: Promise<{
    path?: string;
    resumeView?: string;
    artifactId?: string;
    summaryEdit?: string;
  }>;
}

export default async function ViewPage({ searchParams }: PageProps) {
  const { path: resourcePath, resumeView, artifactId, summaryEdit } = await searchParams;

  if (!resourcePath) return notFound();

  const material = await prisma.material.findUnique({
    where: { id: resourcePath },
    include: {
      notes: true,
      artifacts: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!material) return notFound();

  let mdContent = "";
  if (material.type === "md") {
    try {
      const fullPath = path.join(process.cwd(), "public", resourcePath);
      mdContent = await fs.readFile(fullPath, "utf-8");
    } catch {
      mdContent = "Error reading file content.";
    }
  }

  const initialResumeView: RecentMaterialResumeView =
    resumeView === "document" || resumeView === "summary" || resumeView === "artifact" ? resumeView : "default";

  return (
    <DocumentViewer
      key={material.id}
      material={material}
      mdContent={mdContent}
      initialResumeView={initialResumeView}
      initialResumeArtifactId={artifactId ?? null}
      initialSummaryEditing={summaryEdit === "1"}
    />
  );
}
