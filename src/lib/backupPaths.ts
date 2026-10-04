/**
 * Složky DB záloh — jedno pravidlo pro zápis (POST /api/admin/backup) i výpis (GET).
 *
 * Kořen = rodič BACKUP_PATH (na NAS `/data/backups/daily` → `/data/backups`, namountováno
 * z `/volume1/docker/moldavite/backups`). Cron zálohy jdou do `<kořen>/scheduled`, pokud
 * BACKUP_SCHEDULED_PATH neříká jinak.
 *
 * Proč (4. 10. 2026): zápis cronu dřív padal na `cwd/../backups/scheduled` = `/backups/scheduled`
 * uvnitř kontejneru (WORKDIR /app), kam není namountovaný disk → zálohy by zmizely s kontejnerem,
 * zatímco GET je hledal v `/data/backups/scheduled`. Compose na NAS BACKUP_SCHEDULED_PATH nemá.
 */
import path from 'path';

type Env = Record<string, string | undefined>;

export function backupRoot(env: Env = process.env, cwd = process.cwd()): string {
  return env.BACKUP_PATH ? path.dirname(env.BACKUP_PATH) : path.join(cwd, '..', 'backups');
}

export function manualBackupDir(env: Env = process.env, cwd = process.cwd()): string {
  return env.BACKUP_PATH || path.join(backupRoot(env, cwd), 'daily');
}

export function scheduledBackupDir(env: Env = process.env, cwd = process.cwd()): string {
  return env.BACKUP_SCHEDULED_PATH || path.join(backupRoot(env, cwd), 'scheduled');
}
