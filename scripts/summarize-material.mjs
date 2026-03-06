#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_MODEL = process.env.SUMMARY_MODEL || "gpt-5.3-codex";
const DEFAULT_REASONING_EFFORT = process.env.SUMMARY_REASONING_EFFORT || "xhigh";

function parseArgs(argv) {
  const args = { id: "", json: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--id") {
      args.id = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--json") {
      args.json = true;
    }
  }

  return args;
}

function walkFiles(dirPath, files = []) {
  if (!fs.existsSync(dirPath)) return files;

  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function findRelatedMarkdown(materialsRoot, localUrl) {
  const basename = path.basename(localUrl, path.extname(localUrl));
  const obsidianRoot = path.join(materialsRoot, "obsidian_notes");

  return walkFiles(obsidianRoot).find((filePath) => path.basename(filePath, ".md") === basename);
}

function trimSource(text, maxChars = 28000) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[문서가 길어 앞부분 ${maxChars}자만 전달됨]`;
}

async function runCodexSummary({ cwd, prompt, model, reasoningEffort }) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "assist-summary-"));
  const outputPath = path.join(tempDir, "summary.md");

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        "codex",
        [
          "exec",
          "-m",
          model,
          "-c",
          `model_reasoning_effort="${reasoningEffort}"`,
          "-c",
          'approval_policy="never"',
          "-s",
          "read-only",
          "--color",
          "never",
          "-C",
          cwd,
          "-o",
          outputPath,
          "-",
        ],
        {
          cwd,
          stdio: ["pipe", "ignore", "pipe"],
        },
      );

      let stderr = "";

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `codex exec exited with code ${code}`));
      });

      child.stdin.end(prompt);
    });

    return (await readFile(outputPath, "utf-8")).trim();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function upsertSummary(db, materialId, aiSummary) {
  const existing = db.prepare("SELECT id, content FROM Note WHERE materialId = ? LIMIT 1").get(materialId);
  const updatedAt = new Date().toISOString();

  if (existing) {
    db.prepare("UPDATE Note SET aiSummary = ?, updatedAt = ? WHERE id = ?").run(aiSummary, updatedAt, existing.id);
    return { updatedAt };
  }

  db.prepare("INSERT INTO Note (id, materialId, content, aiSummary, updatedAt) VALUES (?, ?, ?, ?, ?)").run(
    crypto.randomUUID(),
    materialId,
    "",
    aiSummary,
    updatedAt,
  );

  return { updatedAt };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.id) {
    throw new Error('Usage: node scripts/summarize-material.mjs --id "<materialId>" [--json]');
  }

  const cwd = process.cwd();
  const dbPath = path.join(cwd, "assist.db");
  const publicRoot = path.join(cwd, "public");
  const materialsRoot = path.join(publicRoot, "materials");
  const db = new Database(dbPath, { readonly: false });

  try {
    const material = db
      .prepare("SELECT id, title, type, localUrl FROM Material WHERE id = ? LIMIT 1")
      .get(args.id);

    if (!material) {
      throw new Error(`Material not found: ${args.id}`);
    }

    let sourceText = "";
    if (material.type === "md") {
      const mdPath = path.join(publicRoot, material.localUrl);
      if (fs.existsSync(mdPath)) {
        sourceText = fs.readFileSync(mdPath, "utf-8");
      }
    } else if (material.type === "pdf") {
      const relatedMarkdownPath = findRelatedMarkdown(materialsRoot, material.localUrl);
      if (relatedMarkdownPath && fs.existsSync(relatedMarkdownPath)) {
        sourceText = fs.readFileSync(relatedMarkdownPath, "utf-8");
      }
    }

    const prompt = [
      "당신은 MBA 학습용 문서 요약기다.",
      "반드시 한국어로만 답하고, 최종 출력은 Markdown 본문만 반환하라.",
      "형식은 아래를 정확히 따른다.",
      "## 한줄 요약",
      "## 핵심 내용",
      "- 3~5개 bullet",
      "## 시사점",
      "- 2~4개 bullet",
      "## 기억할 키워드",
      "- 3~6개 bullet",
      "",
      `문서 제목: ${material.title}`,
      `문서 유형: ${material.type}`,
      `문서 경로: ${material.localUrl}`,
      "",
      "문서 원문 또는 추출 텍스트:",
      trimSource(sourceText || `${material.title}\n원문 텍스트를 찾지 못했습니다. 제목과 문서 유형만 보고 개요 수준으로 요약하세요.`),
    ].join("\n");

    const aiSummary = await runCodexSummary({
      cwd,
      prompt,
      model: DEFAULT_MODEL,
      reasoningEffort: DEFAULT_REASONING_EFFORT,
    });

    const { updatedAt } = upsertSummary(db, material.id, aiSummary);
    const payload = {
      aiSummary,
      updatedAt,
      model: DEFAULT_MODEL,
      reasoningEffort: DEFAULT_REASONING_EFFORT,
    };

    if (args.json) {
      process.stdout.write(JSON.stringify(payload));
      return;
    }

    process.stdout.write(`${aiSummary}\n`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
