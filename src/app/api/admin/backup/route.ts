import { NextResponse } from 'next/server';
import { getSession, logActivity } from '@/lib/auth';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const backupDir = process.env.BACKUP_PATH || path.join(process.cwd(), '..', 'backups', 'daily');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const date = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `moldavite_manual_${date}.sql.gz`;
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

  try {
    await runBackup({ user, password, host, port, dbname, filepath });

    const stats = fs.statSync(filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    await logActivity(session.id, 'admin.backup', '', `Záloha: ${filename} (${sizeMB} MB)`);

    return NextResponse.json({
      success: true,
      filename,
      size: `${sizeMB} MB`,
    });
  } catch (err) {
    console.error('[admin/backup] failed', err);
    return NextResponse.json({ error: 'Záloha selhala' }, { status: 500 });
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

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const backupRoot = process.env.BACKUP_PATH
    ? path.dirname(process.env.BACKUP_PATH)
    : path.join(process.cwd(), '..', 'backups');
  const dirs = ['daily', 'weekly', 'monthly'];
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
