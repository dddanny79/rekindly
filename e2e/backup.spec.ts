import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

/** A minimal WebDAV folder in memory: PUT, GET, DELETE, PROPFIND. */
function webdav() {
  const files = new Map<string, Buffer>();
  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('/').pop() ?? '');
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'PUT') {
        files.set(name, Buffer.concat(chunks));
        return res.writeHead(201).end();
      }
      if (req.method === 'DELETE') {
        files.delete(name);
        return res.writeHead(204).end();
      }
      if (req.method === 'GET') {
        const file = files.get(name);
        return file ? res.writeHead(200).end(file) : res.writeHead(404).end();
      }
      if (req.method === 'PROPFIND') {
        const items = [...files].map(
          ([n, data]) =>
            `<d:response><d:href>/backups/${encodeURIComponent(n)}</d:href><d:propstat><d:prop><d:getcontentlength>${data.length}</d:getcontentlength><d:getlastmodified>${new Date().toUTCString()}</d:getlastmodified></d:prop></d:propstat></d:response>`,
        );
        return res
          .writeHead(207, { 'content-type': 'application/xml' })
          .end(
            `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${items.join('')}</d:multistatus>`,
          );
      }
      res.writeHead(405).end();
    });
  });
  return { server, files };
}

const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
  );

test('set up an encrypted WebDAV backup, back up now, see a failure on Today', async ({ page }) => {
  const { server, files } = webdav();
  const port = await listen(server);

  await page.goto('/settings/data');
  const section = page.getByRole('region', { name: 'Automatic backup' });
  await section
    .getByRole('textbox', { name: 'Folder URL' })
    .fill(`http://127.0.0.1:${port}/backups/`);
  await section.getByRole('textbox', { name: 'User name' }).fill('erika');
  await section.getByLabel('Password', { exact: true }).fill('webdav-secret');
  await section.getByLabel('Backup password', { exact: true }).fill('lange-geheime-phrase');
  await section.getByLabel('Repeat backup password').fill('lange-geheime-phrase');
  await section.getByRole('button', { name: 'Save' }).click();
  await expect(section.getByText('Saved.')).toBeVisible();

  await section.getByRole('button', { name: 'Test connection' }).click();
  await expect(section.getByText('Connection works.')).toBeVisible();

  await section.getByRole('button', { name: 'Back up now' }).click();
  await expect(section.getByText(/^Last backup:/)).toBeVisible();
  const names = [...files.keys()];
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^personengedaechtnis-.*\.backup$/);
  // Encrypted: neither the export format nor invented names are readable.
  const stored = files.get(names[0]!)!;
  expect(stored.subarray(0, 10).toString()).toBe('PGBACKUP1\n');
  expect(stored.includes('personengedaechtnis-export')).toBe(false);

  await section.getByRole('button', { name: 'Show backups at the target' }).click();
  await expect(section.getByRole('listitem')).toHaveCount(1);

  // The target goes away: the next backup fails and Today says so.
  await new Promise((resolve) => server.close(resolve));
  await section.getByRole('button', { name: 'Back up now' }).click();
  await expect(section.getByText(/^Failed on/)).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The automatic backup failed');
  await page.getByRole('link', { name: 'Check backup settings' }).click();
  await expect(page).toHaveURL(/\/settings\/data$/);

  // Switched off, the warning disappears again (and does not bother other tests).
  await section.getByRole('checkbox', { name: 'Back up automatically every night' }).uncheck();
  await section.getByRole('button', { name: 'Save' }).click();
  await expect(section.getByText('Saved.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('The automatic backup failed')).toHaveCount(0);
});
