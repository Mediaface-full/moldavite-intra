// HTML šablony pro transakční emaily Moldavite Intra.
// Stylizace inline (gmail/outlook compat). Brand: tmavá zelená hlavička +
// světlý card body, gold accent na CTA. Šablony vrací { subject, html }.

import type { EmailMessage } from './email';

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://app.bohemianmoldavite.com';

interface BaseLayoutOptions {
  title: string;
  preheader?: string;
  body: string;
  ctaText?: string;
  ctaHref?: string;
  footerNote?: string;
}

function baseLayout({ title, preheader, body, ctaText, ctaHref, footerNote }: BaseLayoutOptions): string {
  const logoUrl = `${APP_URL}/logo.svg`;
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a3b21;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${escape(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f3ef;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(26,59,33,0.08);">
        <tr>
          <td style="background:#0f1f13;padding:32px 40px;text-align:center;">
            <img src="${logoUrl}" alt="Bohemian Moldavite" width="220" height="110" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1a3b21;">${escape(title)}</h1>
            <div style="font-size:15px;line-height:1.55;color:#334a37;">
              ${body}
            </div>
            ${ctaHref && ctaText ? `
              <div style="margin:32px 0 8px;">
                <a href="${escapeAttr(ctaHref)}"
                   style="display:inline-block;background:#2d6e35;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:500;">
                  ${escape(ctaText)}
                </a>
              </div>
              <p style="font-size:12px;color:#7a917e;margin:8px 0 0;">
                Pokud tlačítko nefunguje, zkopíruj do prohlížeče:<br>
                <span style="word-break:break-all;color:#2d6e35;">${escape(ctaHref)}</span>
              </p>
            ` : ''}
          </td>
        </tr>
        <tr>
          <td style="background:#f5f3ef;padding:20px 40px;text-align:center;border-top:1px solid #e3e0d8;">
            <p style="margin:0;font-size:12px;color:#7a917e;">
              ${footerNote ? escape(footerNote) + '<br>' : ''}
              <strong style="color:#1a3b21;">Bohemian Moldavite</strong> · Interní systém evidence<br>
              <a href="${APP_URL}" style="color:#2d6e35;text-decoration:none;">${APP_URL}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escape(s);
}

// ============================================================
// 1. Welcome / new user account
// ============================================================
export function tmplWelcomeUser(opts: {
  to: string;
  name: string | null;
  password: string;
}): EmailMessage {
  const greeting = opts.name ? `Vítej, ${opts.name}!` : 'Vítej!';
  const html = baseLayout({
    title: greeting,
    preheader: 'Tvůj účet do Moldavite Intra byl vytvořen.',
    body: `
      <p>Byl pro tebe vytvořen účet v interním systému <strong>Moldavite Intra</strong>.</p>
      <p>Přihlašovací údaje:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background:#f5f3ef;border-radius:8px;padding:16px;width:100%;">
        <tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Email</td><td style="padding:6px 16px;font-family:ui-monospace,Menlo,monospace;color:#1a3b21;">${escape(opts.to)}</td></tr>
        <tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Dočasné heslo</td><td style="padding:6px 16px;font-family:ui-monospace,Menlo,monospace;color:#c9a84c;font-weight:600;">${escape(opts.password)}</td></tr>
      </table>
      <p>Po prvním přihlášení si <strong>změň heslo</strong> v sekci Admin → Uživatelé → Upravit.</p>
    `,
    ctaText: 'Přihlásit se',
    ctaHref: `${APP_URL}/login`,
    footerNote: 'Tento e-mail byl odeslán automaticky — neodpovídej na něj.',
  });
  return {
    to: opts.to,
    subject: 'Vítej v Moldavite Intra — přihlašovací údaje',
    html,
  };
}

// ============================================================
// 2. Password changed (security notification)
// ============================================================
export function tmplPasswordChanged(opts: {
  to: string;
  name: string | null;
  changedBy: 'self' | 'admin';
  ip?: string;
  when: Date;
}): EmailMessage {
  const greeting = opts.name ? `Ahoj ${opts.name},` : 'Ahoj,';
  const actor = opts.changedBy === 'self' ? 'tebou' : 'administrátorem';
  const whenStr = opts.when.toLocaleString('cs-CZ', { dateStyle: 'long', timeStyle: 'short' });
  const html = baseLayout({
    title: 'Heslo bylo změněno',
    preheader: 'Tvé heslo do Moldavite Intra bylo právě změněno.',
    body: `
      <p>${greeting}</p>
      <p>Heslo k tvému účtu <strong>${escape(opts.to)}</strong> bylo právě změněno ${actor}.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background:#f5f3ef;border-radius:8px;padding:16px;width:100%;">
        <tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Datum a čas</td><td style="padding:6px 16px;color:#1a3b21;">${escape(whenStr)}</td></tr>
        ${opts.ip ? `<tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">IP adresa</td><td style="padding:6px 16px;font-family:ui-monospace,Menlo,monospace;color:#1a3b21;">${escape(opts.ip)}</td></tr>` : ''}
      </table>
      <p style="background:#fff8e6;border:1px solid #f3e0a3;border-radius:8px;padding:12px 16px;color:#7a5b00;">
        <strong>Pokud tuto změnu neprovedl(a) tys</strong>, okamžitě kontaktuj administrátora — tvůj účet mohl být kompromitován.
        Všechna existující přihlášení byla automaticky odhlášena.
      </p>
    `,
    ctaText: 'Otevřít aplikaci',
    ctaHref: `${APP_URL}`,
  });
  return {
    to: opts.to,
    subject: 'Změna hesla — Moldavite Intra',
    html,
  };
}

// ============================================================
// 3. Daily backup report (cron summary)
// ============================================================
export function tmplBackupReport(opts: {
  to: string;
  filename: string;
  sizeMB: string;
  durationSec?: number;
  totalBackups: number;
  totalDiskMB?: number;
}): EmailMessage {
  const html = baseLayout({
    title: 'Denní záloha proběhla',
    preheader: `${opts.filename} (${opts.sizeMB} MB) — ${opts.totalBackups} verzí v archivu`,
    body: `
      <p>Plánovaná záloha databáze byla úspěšně vytvořena.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background:#f5f3ef;border-radius:8px;padding:16px;width:100%;">
        <tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Soubor</td><td style="padding:6px 16px;font-family:ui-monospace,Menlo,monospace;color:#1a3b21;font-size:13px;">${escape(opts.filename)}</td></tr>
        <tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Velikost</td><td style="padding:6px 16px;color:#1a3b21;">${escape(opts.sizeMB)} MB</td></tr>
        ${opts.durationSec !== undefined ? `<tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Trvání</td><td style="padding:6px 16px;color:#1a3b21;">${opts.durationSec} s</td></tr>` : ''}
        <tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Verzí v archivu</td><td style="padding:6px 16px;color:#1a3b21;">${opts.totalBackups}</td></tr>
        ${opts.totalDiskMB !== undefined ? `<tr><td style="padding:6px 16px;color:#7a917e;font-size:13px;">Místo na disku</td><td style="padding:6px 16px;color:#1a3b21;">${opts.totalDiskMB} MB</td></tr>` : ''}
      </table>
      <p style="font-size:13px;color:#7a917e;">Zálohy se rotují — udržuje se 14 nejnovějších verzí. Soubory najdeš ve <code>backups/scheduled/</code> složce.</p>
    `,
    footerNote: 'Tento report přichází po každé úspěšné záloze.',
  });
  return {
    to: opts.to,
    subject: `✓ Záloha DB ${opts.filename}`,
    html,
  };
}

// ============================================================
// 4. Backup failed alert
// ============================================================
export function tmplBackupFailed(opts: {
  to: string;
  error: string;
  when: Date;
}): EmailMessage {
  const whenStr = opts.when.toLocaleString('cs-CZ', { dateStyle: 'long', timeStyle: 'short' });
  const html = baseLayout({
    title: '⚠ Záloha databáze SELHALA',
    preheader: `Plánovaná záloha skončila chybou: ${opts.error.slice(0, 100)}`,
    body: `
      <p style="background:#fff0f0;border:1px solid #f3a3a3;border-radius:8px;padding:12px 16px;color:#7a0000;">
        <strong>Plánovaná záloha v ${escape(whenStr)} selhala.</strong>
      </p>
      <p>Detail chyby:</p>
      <pre style="background:#f5f3ef;padding:12px;border-radius:6px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#1a3b21;white-space:pre-wrap;word-break:break-word;">${escape(opts.error)}</pre>
      <p>Zkontroluj log kontejneru <code>moldavite_app</code> a obnovu spusť ručně přes <strong>Admin → Backup</strong> nebo přes API.</p>
    `,
    ctaText: 'Spustit zálohu ručně',
    ctaHref: `${APP_URL}/admin/backup`,
  });
  return {
    to: opts.to,
    subject: '⚠ Záloha DB selhala — Moldavite Intra',
    html,
  };
}
