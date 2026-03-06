import fs from "node:fs/promises";
import path from "node:path";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import DocumentViewer from "./DocumentViewer";

interface PageProps {
  searchParams: Promise<{ path: string }>;
}

export default async function ViewPage({ searchParams }: PageProps) {
  const { path: resourcePath } = await searchParams;

  if (!resourcePath) return notFound();

  const material = await prisma.material.findUnique({
    where: { id: resourcePath },
    include: { notes: true },
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

  return <DocumentViewer key={material.id} material={material} mdContent={mdContent} />;
}
