import { describe, it, expect } from 'vitest';
import { backupRoot, manualBackupDir, scheduledBackupDir } from '@/lib/backupPaths';

describe('backupPaths — zálohy na namountovaný disk', () => {
  const NAS = { BACKUP_PATH: '/data/backups/daily' };
  it('NAS compose (jen BACKUP_PATH): cron → /data/backups/scheduled, ne /backups/scheduled v kontejneru', () => {
    expect(scheduledBackupDir(NAS, '/app')).toBe('/data/backups/scheduled');
    expect(manualBackupDir(NAS, '/app')).toBe('/data/backups/daily');
    expect(backupRoot(NAS, '/app')).toBe('/data/backups');
  });
  it('BACKUP_SCHEDULED_PATH má přednost', () => {
    expect(scheduledBackupDir({ ...NAS, BACKUP_SCHEDULED_PATH: '/x/sched' }, '/app')).toBe('/x/sched');
  });
  it('lokální vývoj bez env: vedle app/', () => {
    expect(scheduledBackupDir({}, '/repo/app')).toBe('/repo/backups/scheduled');
    expect(manualBackupDir({}, '/repo/app')).toBe('/repo/backups/daily');
  });
});
