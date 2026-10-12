import type { LogLevel } from '../config';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };
let current: LogLevel = 'info';

/** Set from `LOG_LEVEL` at startup. */
export function setLogLevel(level: LogLevel) {
  current = level;
}

const pad = (n: number, length = 2) => String(n).padStart(length, '0');

/** ISO 8601 in local time (TZ) with offset: 2026-10-12T12:24:53.864+02:00. */
export function localTimestamp(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function write(level: LogLevel, message: string, error?: unknown) {
  if (ORDER[level] > ORDER[current]) return;
  const line = `${localTimestamp()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (error === undefined) out(line);
  else out(line, error);
}

/** Plain-text log lines on stdout/stderr (collected by Docker). */
export const log = {
  error: (message: string, error?: unknown) => write('error', message, error),
  warn: (message: string, error?: unknown) => write('warn', message, error),
  info: (message: string) => write('info', message),
  debug: (message: string) => write('debug', message),
};
