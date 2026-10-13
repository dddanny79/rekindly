import nodemailer from 'nodemailer';
import { DomainError } from '../lib/errors';
import { log } from '../lib/log';
import type { SmtpConfig } from './config';

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

/**
 * The API error for a failed delivery, so the app can explain the likely cause
 * (docs/mail.md): server not reachable, login refused, TLS mode not matching the
 * port, or sender/recipient refused. Anything else stays `mail_failed`.
 */
export function failureCode(error: unknown): string {
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'EAUTH') return 'mail_auth_failed';
  if (code === 'EENVELOPE') return 'mail_rejected';
  if (/wrong version number|ssl3_get_record|unknown protocol|tls|ssl/i.test(message))
    return 'mail_tls_mismatch';
  if (
    code === 'ETIMEDOUT' ||
    code === 'EDNS' ||
    code === 'ECONNECTION' ||
    /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|timeout/i.test(message)
  )
    return 'mail_unreachable';
  return 'mail_failed';
}

/** Sends one mail to the account's address; failures carry their reason as detail. */
export async function sendMail(config: SmtpConfig, mail: Mail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    auth: config.username ? { user: config.username, pass: config.password ?? '' } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({ from: config.from, to: config.to, ...mail });
  } catch (error) {
    const detail = (error as Error).message.slice(0, 300);
    log.warn(`Mail to ${config.to} failed: ${detail}`);
    throw new DomainError(502, failureCode(error), detail);
  } finally {
    transport.close();
  }
}

const escape = (value: string) =>
  value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A plain, readable HTML body: heading, paragraphs and link lists. */
export function htmlMail(
  title: string,
  blocks: { heading?: string; lines: { text: string; href?: string }[] }[],
  footer: string,
) {
  const body = blocks
    .map(
      (b) =>
        `${b.heading ? `<h2 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:24px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px">${escape(b.heading)}</h2>` : ''}<ul style="list-style:none;padding:0;margin:0">${b.lines
          .map(
            (l) =>
              `<li style="padding:6px 0;border-bottom:1px solid #eee">${l.href ? `<a href="${escape(l.href)}" style="color:#1a1a1a">${escape(l.text)}</a>` : escape(l.text)}</li>`,
          )
          .join('')}</ul>`,
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#faf8f4;font:15px/1.5 -apple-system,Segoe UI,sans-serif;color:#1a1a1a"><div style="max-width:560px;margin:0 auto;padding:24px 16px"><h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;margin:0 0 8px">${escape(title)}</h1>${body}<p style="margin-top:24px;font-size:12px;color:#777">${escape(footer)}</p></div></body></html>`;
}
