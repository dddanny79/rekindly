import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';

/** A local SMTP server that keeps every received mail (raw text). */
export async function smtpSink() {
  const mails: string[] = [];
  const logins: { username?: string; password?: string }[] = [];
  const server = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth(auth, _session, callback) {
      logins.push({ username: auth.username, password: auth.password });
      callback(null, { user: auth.username });
    },
    onData(stream, _session, callback) {
      let raw = '';
      stream.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      stream.on('end', () => {
        mails.push(raw);
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.server.address() as AddressInfo).port;
  return {
    port,
    mails,
    logins,
    /** The six-digit code of the newest mail. */
    lastCode: () => /\b(\d{6})\b/.exec(mails.at(-1) ?? '')?.[1] ?? null,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
