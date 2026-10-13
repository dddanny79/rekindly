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

The switch belongs to the instance: it is not part of an export or backup, so a
restore on another server never turns sign-in codes on there (the stored SMTP
password cannot be read on a different server). Switch it on again after a move.

## When mail does not arrive

**Settings → Mail → Send test mail** shows why sending failed:

| Message                              | Cause and fix                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The mail server does not answer**  | The connection never comes about. Either the host of the Rekindly server blocks outgoing mail ports (25, 465, 587; ask them to unblock or use port 2525 if your mail server offers it), or the **mail server's firewall blocks this server**: Fail2ban or mailcow's netfilter ban whole networks (mailcow: `/24` by default) after failed logins from anyone in them. Unban the server's IP and put it on the whitelist. Or host/port are simply wrong. |
| **Login refused**                    | User name or password wrong. Many providers want an app password.                                                                                                                                                                                                                                                                                                                                                                                       |
| **Encryption and port do not match** | Port 465 needs **TLS**, port 587 needs **STARTTLS**.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Sender or recipient refused**      | The sender must be the mailbox you log in with, or an alias it may send as.                                                                                                                                                                                                                                                                                                                                                                             |

To tell a blocked port from a blocking mail server, run this on the Rekindly server
(or in the container's terminal); it tries your mail server and, for comparison,
Gmail:

```sh
node -e "const n=require('net');const t=(h,p)=>new Promise(r=>{const s=n.connect({host:h,port:p,timeout:6000});s.on('connect',()=>{r(h+':'+p+' open');s.destroy()});s.on('timeout',()=>{r(h+':'+p+' timeout');s.destroy()});s.on('error',e=>r(h+':'+p+' '+e.code))});(async()=>{for(const h of ['mail.example.com','smtp.gmail.com'])for(const p of [465,587])console.log(await t(h,p))})()"
```

Gmail open but your mail server not: your mail server blocks this server. Both
timing out: the host blocks the ports.
