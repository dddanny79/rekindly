# Deployment

The app ships as **one Docker image** for `linux/amd64` and `linux/arm64`:
`ghcr.io/dddanny79/rekindly`. It serves the web app and the API on
port `3000` and keeps everything (SQLite database and uploaded photos) in the
volume `/data`. No other services are needed.

| Tag      | Content                                   |
| -------- | ----------------------------------------- |
| `edge`   | A recent state of `main`, built on demand |
| `1.2.3`  | A release; `1.2` follows the latest patch |
| `latest` | Latest release                            |

Images are built and published for releases (Git tags `v*`) and on demand
(GitHub → Actions → _Docker_ → _Run workflow_ on `main`). Coolify can build directly
from the repository instead and then always runs the current `main`.

## Configuration

| Variable      | Required | Default | Description                                                                                                                                  |
| ------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`  | **yes**  | –       | The address people open, e.g. `https://people.example.com`. Used for passkeys (WebAuthn) and to mark the session cookie `Secure` over HTTPS. |
| `TZ`          | no       | `UTC`   | Time zone, e.g. `Europe/Berlin` (log times, “today” when the browser does not send its date).                                                |
| `TRUST_PROXY` | no       | `false` | `true` behind a reverse proxy, so the login rate limit sees the real client address (`X-Forwarded-For`).                                     |
| `LOG_LEVEL`   | no       | `info`  | `error`, `warn`, `info` or `debug` (`debug` logs every request).                                                                             |
| `PORT`        | no       | `3000`  | Port inside the container.                                                                                                                   |
| `DATA_DIR`    | no       | `/data` | Database and files. Keep the default in Docker and mount a volume there.                                                                     |
| `APP_SECRET`  | no       | –       | Key for credentials stored in the database (backup targets). Without it, a random key is created once in `DATA_DIR/secret.key`.              |

Missing or invalid values stop the container at start with a message that lists
every problem, e.g. `PUBLIC_URL is required: …`.

Passkeys need a secure context: `https://…` or `http://localhost`. Over a plain
`http://` address on the network (IP, Tailscale name) only password sign-in works.

## Docker

```sh
docker run -d --name rekindly --restart unless-stopped \
  -p 3000:3000 \
  -v rekindly-data:/data \
  -e PUBLIC_URL=http://localhost:3000 \
  -e TZ=Europe/Berlin \
  ghcr.io/dddanny79/rekindly:latest
```

Open `PUBLIC_URL`; on the first start the setup wizard creates the only account.

The app runs as user `node` (uid/gid `1000`). A named volume gets the right owner
automatically. For a **bind mount** (`-v /srv/pg:/data`) the directory must belong
to uid 1000 first: `sudo chown 1000:1000 /srv/pg`. Otherwise the container stops
with “The data directory /data is not writable”.

## Docker Compose

See [`docker-compose.yml`](../docker-compose.yml):

```sh
docker compose up -d
docker compose logs -f
```

## Coolify

Two ways; both use the same settings from step 3 on.

- **From the Git repository** (tested): `+ New` → _Public Repository_,
  `https://github.com/dddanny79/rekindly`, branch `main` (or a release tag),
  **Build Pack: Dockerfile** (not Docker Compose — the `docker-compose.yml` is an
  example for plain Docker and would publish port 3000 past Coolify's proxy), Base
  Directory `/`, Dockerfile Location `/Dockerfile`. With Auto Deploy, Coolify rebuilds
  on every push to the branch.
- **From the image:** `+ New` → _Docker Image_, `ghcr.io/dddanny79/rekindly:latest`
  (latest release), or a version such as `:0.3` to stay on one minor version.

Then:

3. **Ports Exposes:** `3000`. **Domains:** e.g. `https://people.example.com`;
   Coolify/Traefik provides the certificate.
4. **Environment variables** (runtime, not build variables):
   `PUBLIC_URL=https://people.example.com`, `TRUST_PROXY=true`, `TZ=Europe/Berlin`.
5. **Persistent storage:** a volume with destination path `/data`. Without it all
   data is lost on the next deploy.
6. **Health check:** `GET` `/api/health` on port `3000`. The image has no `curl`;
   Coolify falls back to BusyBox `wget`, which works since the server listens on
   IPv6 and IPv4. (Images before that fix need Host `127.0.0.1` here.) You can
   also turn Coolify's check off — the image's own Docker health check remains.
7. Deploy, open the domain and run the setup. Passkeys work there (HTTPS); switch
   them on in Settings.
8. **Backup until export/import exists:** _Scheduled Tasks_ → command
   `node dist/cli.js backup`, frequency `0 3 * * *` (snapshots in
   `/data/backups`, on the same disk — copy them off the server as well).

Migrations run automatically at start.

## Unraid, Portainer, Synology

Same as plain Docker: image `ghcr.io/dddanny79/rekindly:latest`, container
port `3000`, a path or volume for `/data` (owned by uid 1000, see above), and the
variables `PUBLIC_URL` and `TZ`. On Unraid use a path below `/mnt/user/appdata/`.

## Several people

Rekindly is made for **one person per installation**: nobody else can read your
notes, and there are no users, roles or permissions to get wrong. If several people
want to use it, each runs their own instance. It is one small container with its own
data volume, so a few of them fit on the same server.

With Docker Compose, one service and one volume per person, each with its own
address (behind a reverse proxy, e.g. `anna.example.com` and `ben.example.com`):

```yaml
services:
  anna:
    image: ghcr.io/dddanny79/rekindly:latest
    restart: unless-stopped
    environment:
      PUBLIC_URL: https://anna.example.com
      TRUST_PROXY: 'true'
      TZ: Europe/Berlin
    volumes:
      - anna:/data
  ben:
    image: ghcr.io/dddanny79/rekindly:latest
    restart: unless-stopped
    environment:
      PUBLIC_URL: https://ben.example.com
      TRUST_PROXY: 'true'
      TZ: Europe/Berlin
    volumes:
      - ben:/data

volumes:
  anna:
  ben:
```

In Coolify, create one application per person, each with its own domain and its own
persistent storage for `/data`. Every instance has its own setup, backups and sync.
To pass contacts from one person to another, export them as vCard (Settings → Data)
and import the file in the other instance; birthdays and follow-ups can be shared as
a calendar subscription (Settings → Sync).

## Reverse proxy

Terminate HTTPS at the proxy, forward to port 3000, set `PUBLIC_URL` to the
public `https://` address and `TRUST_PROXY=true`. Do not publish port 3000 to the
internet.

**Caddy**

```caddy
people.example.com {
  reverse_proxy app:3000
}
```

**nginx**

```nginx
server {
  listen 443 ssl;
  server_name people.example.com;
  # ssl_certificate …; ssl_certificate_key …;
  client_max_body_size 20m; # photo uploads (max. 15 MB)
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

**Traefik** (labels, without Coolify)

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.people.rule=Host(`people.example.com`)
  - traefik.http.routers.people.tls.certresolver=letsencrypt
  - traefik.http.services.people.loadbalancer.server.port=3000
```

## Backup and restore

Everything lives in `/data`:

- `app.sqlite` (+ `app.sqlite-wal`, `app.sqlite-shm` while running) — the database
- `files/` — photos
- `secret.key` — key for the stored backup credentials (unless `APP_SECRET` is set)

The simplest way: **automatic, encrypted backups** to WebDAV or S3, set up in the
app (Settings → Data) — see [export](export.md#automatic-backups). The snapshots
below are an additional, server-side option.

**Consistent backup while the app runs** (the image contains no `sqlite3` binary;
the app does it itself):

```sh
docker exec rekindly node dist/cli.js backup
# → /data/backups/app-20261012-210000.sqlite
```

Then copy `/data/backups/` and `/data/files/` into your backup chain (restic,
borg, Synology Hyper Backup, …) and delete old snapshots from `/data/backups/`.
A daily cron job on the host is enough, e.g.:

```sh
0 3 * * * docker exec rekindly node dist/cli.js backup && \
  find /var/lib/docker/volumes/rekindly-data/_data/backups -name 'app-*.sqlite' -mtime +14 -delete
```

Alternatively stop the container and copy the whole volume. A full export from the app
(Settings → Data) is a second, database-independent backup — see [export](export.md).

**Restore:**

```sh
docker stop rekindly
# in the volume: replace the database, remove the old WAL files
cp app-20261012-210000.sqlite /path/to/volume/app.sqlite
rm -f /path/to/volume/app.sqlite-wal /path/to/volume/app.sqlite-shm
# restore files/ from the same point in time
docker start rekindly
```

Afterwards rebuild the search index if in doubt:
`docker exec rekindly node dist/cli.js reindex`.

## Updating

Pull the new image and restart the container (Coolify: redeploy). On start the app
brings the database up to date by itself. Before it changes anything, it saves a copy
of the database as it was:

```
/data/backups/pre-update-20261016-094910267-0.3.1.sqlite
```

(time in UTC, then the version that did the update). The newest 3 copies are kept;
the app removes older ones itself. If no copy can be written (disk full, `/data/backups`
not writable), the app does not update and does not start — the log says why.

After the update, the app checks that every reference in the database still points to
an existing row. If not, it stops with a message naming the copy. Then go back to the
previous image version, restore that copy as described under **Restore** above, and
please report it as a bug.

## Other commands

```sh
docker exec -it rekindly node dist/cli.js reset-password
docker exec rekindly node dist/cli.js disable-2fa   # sign-in codes off (mail broken)
docker exec rekindly node dist/cli.js reindex
```
