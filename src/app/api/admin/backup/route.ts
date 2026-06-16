import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { tmplBackupReport, tmplBackupFailed } from '@/lib/emailTemplates';
import { spawn } from 'child_process';
import { timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Authorisation: either an admin session (manual UI backup) OR a valid
// x-cron-secret header (Task Scheduler / cron). Returns caller tag for
// activity log ("admin:<id>" or "cron") on success, null on failure.
async function authorise(request: Request): Promise<
  | { ok: true; tag: string; userId: number | null }
  | { ok: false; status: number; error: string }
> {
  const cronHeader = request.headers.get('x-cron-secret');
  if (cronHeader) {
    const expected = process.env.CRON_SECRET || '';
    if (!expected) return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
    try {
      const a = Buffer.from(cronHeader);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return { ok: true, tag: 'cron', userId: null };
      }
    } catch {
      /* fall through */
    }
    return { ok: false, status: 401, error: 'Invalid cron secret' };
  }

  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, tag: `admin:${session.id}`, userId: session.id };
}

export async function POST(request: Request) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Scheduled runs (cron) should land in a separate subdir so retention
  // policies can differ from ad-hoc manual backups.
  const backupDir = auth.tag === 'cron'
    ? (process.env.BACKUP_SCHEDULED_PATH || path.join(process.cwd(), '..', 'backups', 'scheduled'))
    : (process.env.BACKUP_PATH || path.join(process.cwd(), '..', 'backups', 'daily'));
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const date = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const prefix = auth.tag === 'cron' ? 'moldavite_scheduled' : 'moldavite_manual';
  const filename = `${prefix}_${date}.sql.gz`;
  const filepath = path.join(backupDir, filename);

  const dbUrl = process.env.DATABASE_URL || '';
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid DATABASE_URL' }, { status: 500 });
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    return NextResponse.json({ error: 'Invalid DATABASE_URL protocol' }, { status: 500 });
  }

  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const host = parsed.hostname;
  const port = parsed.port || '5432';
  const dbname = parsed.pathname.replace(/^\//, '');

  const startedAt = Date.now();
  try {
    await runBackup({ user, password, host, port, dbname, filepath });

    // Best-effort retention: keep last 14 scheduled backups.
    if (auth.tag === 'cron') {
      pruneOld(backupDir, 14);
    }

    const stats = fs.statSync(filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    const durationSec = Math.round((Date.now() - startedAt) / 1000);

    if (auth.userId !== null) {
      await logActivity(auth.userId, 'admin.backup', '', `Záloha: ${filename} (${sizeMB} MB)`);
    }

    // Send report email for cron-triggered backups (admin manual ones can
    // see the result in UI directly, no need to email).
    if (auth.tag === 'cron' && process.env.BACKUP_REPORT_EMAIL) {
      const totalBackups = countBackups(backupDir);
      const totalDiskMB = sumBackupSize(backupDir);
      try {
        await sendEmail(tmplBackupReport({
          to: process.env.BACKUP_REPORT_EMAIL,
          filename,
          sizeMB,
          durationSec,
          totalBackups,
          totalDiskMB: Math.round(totalDiskMB),
        }));
      } catch (err) {
        console.error('[admin/backup] report email failed:', err);
      }
    }

    return NextResponse.json({
      success: true,
      by: auth.tag,
      filename,
      size: `${sizeMB} MB`,
    });
  } catch (err) {
    console.error('[admin/backup] failed', err);
    if (auth.tag === 'cron' && process.env.BACKUP_REPORT_EMAIL) {
      try {
        await sendEmail(tmplBackupFailed({
          to: process.env.BACKUP_REPORT_EMAIL,
          error: err instanceof Error ? err.message : String(err),
          when: new Date(),
        }));
      } catch (mailErr) {
        console.error('[admin/backup] failure email failed:', mailErr);
      }
    }
    // Detail chyby vracíme jen authentizovanému adminovi (ne cronu) — UI ho
    // zobrazí, aby uživatel věděl, co řešit (chybějící pg_dump, perms, …).
    const detail = err instanceof Error ? err.message : String(err);
    const hint = diagnosticHint(detail);
    return NextResponse.json(
      {
        error: 'Záloha selhala',
        detail: auth.tag.startsWith('admin:') ? detail : undefined,
        hint: auth.tag.startsWith('admin:') ? hint : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * Mapuje typické chybové stavy na user-friendly hint co dělat.
 * Vrací krátký český text s konkrétním návodem; null pokud chybu neznáme.
 */
function diagnosticHint(detail: string): string | null {
  if (/spawn pg_dump ENOENT|pg_dump.*not found/i.test(detail)) {
    return 'Binárka pg_dump není v PATH. V Dockeru: chybí postgresql-client v Dockerfile. Lokálně na Macu: `brew install postgresql@16`.';
  }
  if (/spawn gzip ENOENT/i.test(detail)) {
    return 'Binárka gzip není v PATH. V alpine Dockeru: `apk add --no-cache gzip`.';
  }
  if (/EACCES|permission denied/i.test(detail)) {
    return 'Backup složka není zapisovatelná. Zkontroluj práva na BACKUP_PATH (nebo /backups/ v kontejneru). Owner musí být nextjs uid 1001.';
  }
  if (/ENOENT.*backups/i.test(detail) || /ENOSPC/i.test(detail)) {
    return 'Backup složka neexistuje nebo je disk plný. Zkontroluj BACKUP_PATH a `df -h`.';
  }
  if (/password authentication failed|authentication failed/i.test(detail)) {
    return 'DATABASE_URL má špatné heslo nebo username — pg_dump se nedokázal autentizovat.';
  }
  if (/connection refused|could not connect/i.test(detail)) {
    return 'Databáze není dostupná. Zkontroluj host/port v DATABASE_URL a že kontejner moldavite_db běží.';
  }
  if (/server version mismatch|server version: .* pg_dump version/i.test(detail)) {
    return 'Verze pg_dump je starší než Postgres server. V Dockerfile použij postgresql-client verze ≥ DB verze.';
  }
  if (/timeout/i.test(detail)) {
    return 'Backup trval déle než 60 s. Databáze je velká nebo pomalá — zvedni timeout v runBackup().';
  }
  return null;
}

function countBackups(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.sql.gz')).length;
  } catch {
    return 0;
  }
}

function sumBackupSize(dir: string): number {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.sql.gz'))
      .reduce((sum, f) => sum + fs.statSync(path.join(dir, f)).size, 0) / 1024 / 1024;
  } catch {
    return 0;
  }
}

function runBackup(opts: {
  user: string; password: string; host: string; port: string; dbname: string; filepath: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const pgDump = spawn('pg_dump', [
      '-h', opts.host,
      '-p', opts.port,
      '-U', opts.user,
      '-d', opts.dbname,
      '--no-owner',
      '--no-acl',
    ], {
      env: { ...process.env, PGPASSWORD: opts.password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const gzip = spawn('gzip', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = fs.createWriteStream(opts.filepath);

    pgDump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(out);

    let pgErr = '';
    pgDump.stderr.on('data', (d) => { pgErr += d.toString(); });
    const timeout = setTimeout(() => {
      pgDump.kill('SIGKILL');
      gzip.kill('SIGKILL');
      reject(new Error('backup timeout'));
    }, 60_000);

    const done = () => { clearTimeout(timeout); };

    pgDump.on('error', (e) => { done(); reject(e); });
    gzip.on('error', (e) => { done(); reject(e); });
    out.on('error', (e) => { done(); reject(e); });

    out.on('close', () => {
      done();
      if (pgDump.exitCode !== 0) return reject(new Error(`pg_dump exit ${pgDump.exitCode}: ${pgErr.slice(0, 500)}`));
      if (gzip.exitCode !== 0) return reject(new Error(`gzip exit ${gzip.exitCode}`));
      resolve();
    });
  });
}

function pruneOld(dir: string, keep: number) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.sql.gz'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (let i = keep; i < files.length; i++) {
      try {
        fs.unlinkSync(path.join(dir, files[i].name));
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[admin/backup] prune failed', err);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const backupRoot = process.env.BACKUP_PATH
    ? path.dirname(process.env.BACKUP_PATH)
    : path.join(process.cwd(), '..', 'backups');
  const dirs = ['daily', 'weekly', 'monthly', 'scheduled'];
  const backups: Array<{ name: string; type: string; size: string; date: string }> = [];

  for (const dir of dirs) {
    const dirPath = path.join(backupRoot, dir);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.sql.gz')).sort().reverse();
    for (const file of files) {
      const stats = fs.statSync(path.join(dirPath, file));
      backups.push({
        name: file,
        type: dir,
        size: `${(stats.size / 1024).toFixed(0)} KB`,
        date: stats.mtime.toISOString(),
      });
    }
  }

  return NextResponse.json({ backups });
}
