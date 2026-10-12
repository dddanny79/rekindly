# Mail: daily summary and sign-in codes

Settings → **Mail**. Mails always go to the address of your account.

## Mail server (SMTP)

Server, port, encryption (STARTTLS on 587, TLS/SSL on 465, or none for a local
relay), user name, password and sender. **Send test mail** checks the settings. The
password is stored encrypted with the instance key (`APP_SECRET` or
`DATA_DIR/secret.key`), never returned by the API and not part of exports or backups.

Alternatively set the server with environment variables; they take precedence and
the settings page then shows them read-only:

| Variable        | Example                             |
| --------------- | ----------------------------------- |
| `SMTP_HOST`     | `smtp.example.com`                  |
| `SMTP_PORT`     | `587` (default by `SMTP_SECURE`)    |
| `SMTP_SECURE`   | `starttls` (default), `tls`, `none` |
| `SMTP_USER`     | `rekindly@example.com`              |
| `SMTP_PASSWORD` | —                                   |
| `SMTP_FROM`     | `Rekindly <rekindly@example.com>`   |

Many providers only accept their own address (or the account's) as sender.

## Daily summary

Once a day from the chosen hour (server time zone, `TZ`): due and overdue follow-ups,
birthdays of the next 7 days and people overdue to contact, each with a link. No mail
when nothing is due. After a failure it tries again an hour later; the last result is
shown on the settings page. **Send today's summary now** sends it right away.

## Sign-in code by email (two-factor)

Settings → General → **Sign-in code by email**. When it is on, signing in with the
password also needs a six-digit code that is mailed to you:

- valid for 10 minutes, five attempts, single use;
- **passkeys** sign in without a code (they are two factors already);
- **“Trust this browser for 30 days”** skips the code on that browser; trusted
  browsers are listed in the settings and can be forgotten; changing the password
  forgets all of them;
- switching on sends a test code first, so it only turns on when mail really arrives;
  switching off needs the password.

**Locked out because mails do not arrive?** On the server:

```sh
docker exec rekindly node dist/cli.js disable-2fa
```
