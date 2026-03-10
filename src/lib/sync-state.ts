import prisma from "./prisma";

export const SYNC_LABELS = {
  CLASSROOM: "Google Classroom",
  GMAIL: "Gmail Bulletin",
  RSS: "External RSS",
} as const;

export type SyncStateKey = keyof typeof SYNC_LABELS;
export type SyncStatus = "IDLE" | "RUNNING" | "SUCCESS" | "ERROR";

export type SyncRunResult =
  | { ok: true; count: number; message: string }
  | { ok: false; message: string };

export type SyncStateView = {
  key: SyncStateKey;
  label: string;
  status: SyncStatus;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastSucceededAt: Date | null;
  lastMessage: string | null;
  lastItemCount: number | null;
};

function normalizeStatus(status?: string | null): SyncStatus {
  if (status === "RUNNING" || status === "SUCCESS" || status === "ERROR") {
    return status;
  }

  return "IDLE";
}

function normalizeRow(row: {
  key: string;
  label: string;
  status: string;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastSucceededAt: Date | null;
  lastMessage: string | null;
  lastItemCount: number | null;
}): SyncStateView {
  return {
    key: row.key as SyncStateKey,
    label: row.label,
    status: normalizeStatus(row.status),
    lastStartedAt: row.lastStartedAt,
    lastFinishedAt: row.lastFinishedAt,
    lastSucceededAt: row.lastSucceededAt,
    lastMessage: row.lastMessage,
    lastItemCount: row.lastItemCount,
  };
}

function buildDefaultState(key: SyncStateKey): SyncStateView {
  return {
    key,
    label: SYNC_LABELS[key],
    status: "IDLE",
    lastStartedAt: null,
    lastFinishedAt: null,
    lastSucceededAt: null,
    lastMessage: null,
    lastItemCount: null,
  };
}

async function ensureSyncState(key: SyncStateKey) {
  await prisma.syncState.upsert({
    where: { key },
    update: { label: SYNC_LABELS[key] },
    create: {
      key,
      label: SYNC_LABELS[key],
      status: "IDLE",
    },
  });
}

export async function fetchSyncState(key: SyncStateKey): Promise<SyncStateView> {
  const row = await prisma.syncState.findUnique({ where: { key } });
  return row ? normalizeRow(row) : buildDefaultState(key);
}

export async function fetchSyncStates(keys: SyncStateKey[]): Promise<Record<SyncStateKey, SyncStateView>> {
  const rows = await prisma.syncState.findMany({
    where: { key: { in: keys } },
  });

  const byKey = new Map(rows.map((row) => [row.key as SyncStateKey, normalizeRow(row)]));

  return keys.reduce(
    (acc, key) => {
      acc[key] = byKey.get(key) ?? buildDefaultState(key);
      return acc;
    },
    {} as Record<SyncStateKey, SyncStateView>,
  );
}

export async function runTrackedSync(
  key: SyncStateKey,
  runner: () => Promise<{ count: number; message: string }>,
): Promise<SyncRunResult> {
  const startedAt = new Date();
  await ensureSyncState(key);
  await prisma.syncState.update({
    where: { key },
    data: {
      status: "RUNNING",
      lastStartedAt: startedAt,
      lastMessage: null,
    },
  });

  try {
    const result = await runner();
    const finishedAt = new Date();

    await prisma.syncState.update({
      where: { key },
      data: {
        status: "SUCCESS",
        lastFinishedAt: finishedAt,
        lastSucceededAt: finishedAt,
        lastMessage: result.message,
        lastItemCount: result.count,
      },
    });

    return {
      ok: true,
      count: result.count,
      message: result.message,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "알 수 없는 동기화 오류";

    await prisma.syncState.update({
      where: { key },
      data: {
        status: "ERROR",
        lastFinishedAt: finishedAt,
        lastMessage: message,
      },
    });

    return {
      ok: false,
      message,
    };
  }
}
