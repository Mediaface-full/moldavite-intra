import nodemailer, { Transporter } from 'nodemailer';

// Email transport. Reads SMTP_* env vars; if SMTP_HOST is missing the
// transport falls back to a console-only logger so the app stays functional
// without SMTP configured (development, demos, dry-runs).

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
}

function readConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!host || !user || !pass || !from) return null;
  return {
    host,
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true only for port 465
    user,
    pass,
    from,
    replyTo: process.env.SMTP_REPLY_TO,
  };
}

let cachedTransport: Transporter | null = null;
function getTransport(): Transporter | null {
  if (cachedTransport) return cachedTransport;
  const cfg = readConfig();
  if (!cfg) return null;
  cachedTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return cachedTransport;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const cfg = readConfig();
  const transport = getTransport();

  if (!transport || !cfg) {
    // No SMTP configured — log and return success so caller flow doesn't break.
    console.log('[email] SMTP not configured; would have sent:', { to: msg.to, subject: msg.subject });
    return { ok: true, messageId: 'logged-only' };
  }

  try {
    const info = await transport.sendMail({
      from: cfg.from,
      to: msg.to,
      replyTo: cfg.replyTo,
      subject: msg.subject,
      html: msg.html,
      text: msg.text || stripHtml(msg.html),
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] send failed:', message);
    return { ok: false, error: message };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
