import { createHash, createHmac } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

/** A backup file at the target. */
export interface RemoteFile {
  name: string;
  size: number;
  modified: string | null;
}

/** Where backups go: WebDAV or S3-compatible storage. */
export interface BackupTarget {
  put(name: string, data: Buffer): Promise<void>;
  list(): Promise<RemoteFile[]>;
  get(name: string): Promise<Buffer>;
  remove(name: string): Promise<void>;
}

/** A failed request to the target, with a message meant for the user. */
export class TargetError extends Error {}

export const BACKUP_PREFIX = 'personengedaechtnis-';
export const BACKUP_SUFFIX = '.backup';
export const isBackupName = (name: string) =>
  name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX) && !name.includes('/');

const xml = new XMLParser({ removeNSPrefix: true, parseTagValue: false });
const asList = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

async function request(url: string, init: RequestInit, what: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  } catch (error) {
    throw new TargetError(
      `${what}: ${(error as Error).cause ? String((error as Error).cause) : (error as Error).message}`,
    );
  }
  return res;
}

const fail = async (res: Response, what: string) => {
  const body = (await res.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
  throw new TargetError(`${what}: HTTP ${res.status}${body ? ` – ${body}` : ''}`);
};

// WebDAV -------------------------------------------------------------------------------

export interface WebdavConfig {
  /** Folder URL, e.g. https://cloud.example.com/remote.php/dav/files/me/Backups/ */
  url: string;
  username: string;
  password: string;
}

export function webdavTarget(config: WebdavConfig): BackupTarget {
  const base = config.url.endsWith('/') ? config.url : `${config.url}/`;
  const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  const headers = { authorization: auth };
  const fileUrl = (name: string) => `${base}${encodeURIComponent(name)}`;

  return {
    async put(name, data) {
      const upload = () =>
        request(fileUrl(name), { method: 'PUT', headers, body: new Uint8Array(data) }, 'Upload');
      let res = await upload();
      if (res.status === 404 || res.status === 409) {
        // The folder does not exist yet.
        await request(base, { method: 'MKCOL', headers }, 'Create folder');
        res = await upload();
      }
      if (!res.ok) await fail(res, 'Upload');
    },
    async list() {
      const res = await request(
        base,
        {
          method: 'PROPFIND',
          headers: { ...headers, depth: '1', 'content-type': 'application/xml' },
          body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>',
        },
        'List',
      );
      if (res.status === 404) return [];
      if (!res.ok) await fail(res, 'List');
      const doc = xml.parse(await res.text()) as {
        multistatus?: { response?: unknown };
      };
      return asList(doc.multistatus?.response as Record<string, unknown>[] | undefined).flatMap(
        (r) => {
          const href = decodeURIComponent(String(r.href ?? ''));
          const name = href.replace(/\/$/, '').split('/').pop() ?? '';
          if (!isBackupName(name)) return [];
          const props = asList(r.propstat as Record<string, unknown>[])
            .map((p) => p.prop as Record<string, unknown>)
            .find((p) => p?.getcontentlength !== undefined);
          return [
            {
              name,
              size: Number(props?.getcontentlength ?? 0),
              modified: props?.getlastmodified
                ? new Date(String(props.getlastmodified)).toISOString()
                : null,
            },
          ];
        },
      );
    },
    async get(name) {
      const res = await request(fileUrl(name), { headers }, 'Download');
      if (!res.ok) await fail(res, 'Download');
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(name) {
      const res = await request(fileUrl(name), { method: 'DELETE', headers }, 'Delete');
      if (!res.ok && res.status !== 404) await fail(res, 'Delete');
    },
  };
}

// S3 (Signature Version 4) ---------------------------------------------------------------

export interface S3Config {
  /** e.g. https://fsn1.your-objectstorage.com or https://s3.eu-central-1.amazonaws.com */
  endpoint: string;
  region: string;
  bucket: string;
  /** Folder inside the bucket, e.g. "personengedaechtnis/"; may be empty. */
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) =>
  createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as S3 expects it (slashes kept in paths). */
const encode = (value: string, keepSlash = false) =>
  encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(keepSlash ? /%2F/g : /$^/, '/');

/**
 * AWS Signature Version 4 for S3: returns the Authorization header value.
 * `headers` must contain host, x-amz-date and x-amz-content-sha256.
 */
export function signV4(input: {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): string {
  const amzDate = input.headers['x-amz-date']!;
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${input.region}/s3/aws4_request`;
  const names = Object.keys(input.headers)
    .map((h) => h.toLowerCase())
    .sort();
  const lower = Object.fromEntries(
    Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')]),
  );
  const canonical = [
    input.method,
    encode(input.path, true),
    Object.keys(input.query)
      .sort()
      .map((k) => `${encode(k)}=${encode(input.query[k]!)}`)
      .join('&'),
    names.map((h) => `${h}:${lower[h]}\n`).join(''),
    names.join(';'),
    lower['x-amz-content-sha256'],
  ].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  let key: Buffer = hmac(`AWS4${input.secretAccessKey}`, date);
  for (const part of [input.region, 's3', 'aws4_request']) key = hmac(key, part);
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
}

export function s3Target(config: S3Config): BackupTarget {
  const endpoint = new URL(config.endpoint);
  const prefix = config.prefix ? config.prefix.replace(/^\/+/, '').replace(/\/?$/, '/') : '';
  // Path style (endpoint/bucket/key) works with AWS and the S3-compatible services.
  const bucketPath = `${endpoint.pathname.replace(/\/$/, '')}/${config.bucket}`;

  async function call(
    method: string,
    key: string,
    query: Record<string, string> = {},
    body?: Buffer,
    what = 'S3',
  ) {
    const path = `${bucketPath}/${key}`;
    const headers: Record<string, string> = {
      host: endpoint.host,
      'x-amz-date': new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, 'Z'),
      'x-amz-content-sha256': sha256(body ?? ''),
    };
    const authorization = signV4({
      method,
      path,
      query,
      headers,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
    const qs = Object.keys(query).length
      ? `?${Object.entries(query)
          .map(([k, v]) => `${encode(k)}=${encode(v)}`)
          .join('&')}`
      : '';
    // fetch sets Host itself; it is only part of the signature.
    const sent = Object.fromEntries(Object.entries(headers).filter(([k]) => k !== 'host'));
    return request(
      `${endpoint.origin}${encode(path, true)}${qs}`,
      {
        method,
        headers: { ...sent, authorization },
        body: body ? new Uint8Array(body) : undefined,
      },
      what,
    );
  }

  return {
    async put(name, data) {
      const res = await call('PUT', `${prefix}${name}`, {}, data, 'Upload');
      if (!res.ok) await fail(res, 'Upload');
    },
    async list() {
      const files: RemoteFile[] = [];
      let token: string | undefined;
      do {
        const query: Record<string, string> = { 'list-type': '2', prefix };
        if (token) query['continuation-token'] = token;
        const res = await call('GET', '', query, undefined, 'List');
        if (!res.ok) await fail(res, 'List');
        const doc = xml.parse(await res.text()) as {
          ListBucketResult?: {
            Contents?: unknown;
            IsTruncated?: string;
            NextContinuationToken?: string;
          };
        };
        const result = doc.ListBucketResult ?? {};
        for (const item of asList(result.Contents as Record<string, string>[] | undefined)) {
          const name = String(item.Key ?? '').slice(prefix.length);
          if (!isBackupName(name)) continue;
          files.push({
            name,
            size: Number(item.Size ?? 0),
            modified: item.LastModified ? new Date(item.LastModified).toISOString() : null,
          });
        }
        token = result.IsTruncated === 'true' ? result.NextContinuationToken : undefined;
      } while (token);
      return files;
    },
    async get(name) {
      const res = await call('GET', `${prefix}${name}`, {}, undefined, 'Download');
      if (!res.ok) await fail(res, 'Download');
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(name) {
      const res = await call('DELETE', `${prefix}${name}`, {}, undefined, 'Delete');
      if (!res.ok && res.status !== 404) await fail(res, 'Delete');
    },
  };
}
