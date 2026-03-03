import { NextRequest, NextResponse } from "next/server";
import { listSessions, getMessages, getGeneratedFiles } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

const LOCAL_BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const VPS_HOST = process.env.VPS_HOST || "168.231.78.113";
const VPS_BACKUP_DIR = "/opt/eburon-backup";

interface BackupPayload {
  exportedAt: string;
  sessions: Array<{
    id: string;
    title: string;
    source: string;
    model?: string;
    created_at: string;
    messages: Array<{ role: string; content: string; timestamp?: string }>;
    files: Array<{ path: string; content: string; language?: string }>;
  }>;
}

async function buildBackup(): Promise<BackupPayload> {
  const sessions = await listSessions({ source: "web", limit: 200 });
  const allSessions = sessions ?? [];

  const backup: BackupPayload = {
    exportedAt: new Date().toISOString(),
    sessions: [],
  };

  for (const s of allSessions) {
    const [messages, files] = await Promise.all([
      getMessages(s.id),
      getGeneratedFiles(s.id),
    ]);

    backup.sessions.push({
      id: s.id,
      title: s.title,
      source: s.source,
      model: s.model,
      created_at: s.created_at,
      messages: (messages ?? []).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      })),
      files: (files ?? []).map(f => ({
        path: f.path,
        content: f.content,
        language: f.language,
      })),
    });
  }

  return backup;
}

async function saveLocal(backup: BackupPayload): Promise<string> {
  await fs.mkdir(LOCAL_BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(LOCAL_BACKUP_DIR, `eburon-backup-${ts}.json`);
  await fs.writeFile(filePath, JSON.stringify(backup, null, 2), "utf-8");
  return filePath;
}

async function saveToVPS(backup: BackupPayload): Promise<boolean> {
  try {
    const { execSync } = await import("child_process");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const tmpPath = `/tmp/eburon-backup-${ts}.json`;
    const { writeFileSync } = await import("fs");
    writeFileSync(tmpPath, JSON.stringify(backup, null, 2));

    execSync(
      `sshpass -p 'Master120221@' ssh -o StrictHostKeyChecking=no root@${VPS_HOST} "mkdir -p ${VPS_BACKUP_DIR}" 2>/dev/null`,
      { timeout: 10000 }
    );
    execSync(
      `sshpass -p 'Master120221@' scp -o StrictHostKeyChecking=no ${tmpPath} root@${VPS_HOST}:${VPS_BACKUP_DIR}/eburon-backup-${ts}.json`,
      { timeout: 30000 }
    );
    execSync(`rm -f ${tmpPath}`);
    return true;
  } catch {
    return false;
  }
}

// GET: list backups | POST: create backup | DELETE: prune old backups
export async function GET() {
  try {
    await fs.mkdir(LOCAL_BACKUP_DIR, { recursive: true });
    const files = await fs.readdir(LOCAL_BACKUP_DIR);
    const backups = files.filter(f => f.endsWith(".json")).sort().reverse();
    return NextResponse.json({ backups, dir: LOCAL_BACKUP_DIR });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targets: string[] = body.targets ?? ["local", "vps"];
    const backup = await buildBackup();
    const results: Record<string, unknown> = {
      sessions: backup.sessions.length,
      totalMessages: backup.sessions.reduce((a, s) => a + s.messages.length, 0),
      totalFiles: backup.sessions.reduce((a, s) => a + s.files.length, 0),
    };

    if (targets.includes("local")) {
      const localPath = await saveLocal(backup);
      results.local = localPath;
    }

    if (targets.includes("vps")) {
      const ok = await saveToVPS(backup);
      results.vps = ok ? "saved" : "failed (VPS unreachable)";
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
