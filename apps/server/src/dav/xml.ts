import { XMLParser } from 'fast-xml-parser';

export const NS = {
  dav: 'DAV:',
  card: 'urn:ietf:params:xml:ns:carddav',
  cs: 'http://calendarserver.org/ns/',
} as const;

const PREFIX: Record<string, string> = { [NS.dav]: 'd', [NS.card]: 'card', [NS.cs]: 'cs' };

/** A property name with its namespace, e.g. { ns: 'DAV:', name: 'getetag' }. */
export interface PropName {
  ns: string;
  name: string;
}

export const prop = (ns: string, name: string): PropName => ({ ns, name });
export const propKey = (p: PropName) => `${p.ns}|${p.name}`;

export const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot', "'": 'apos' }[c]};`,
  );

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: false,
  parseTagValue: false,
  trimValues: true,
});

/** Parsed request body with namespace resolution for the element names. */
export class DavRequest {
  constructor(
    private readonly root: Node | null,
    private readonly rootName: string | null,
    private readonly namespaces: Map<string, string>,
  ) {}

  static parse(body: string): DavRequest {
    if (!body.trim()) return new DavRequest(null, null, new Map());
    let doc: Node;
    try {
      doc = parser.parse(body) as Node;
    } catch {
      return new DavRequest(null, null, new Map());
    }
    const rootName = Object.keys(doc).find((k) => !k.startsWith('?')) ?? null;
    const root = rootName ? ((doc[rootName] as Node) ?? {}) : null;
    const namespaces = new Map<string, string>();
    collectNamespaces(root, namespaces);
    return new DavRequest(typeof root === 'object' ? root : {}, rootName, namespaces);
  }

  private resolve(tag: string): PropName {
    const [prefix, local] = tag.includes(':') ? tag.split(':', 2) : ['', tag];
    return { ns: this.namespaces.get(prefix!) ?? (prefix ? prefix! : 'DAV:'), name: local! };
  }

  /** Local name of the root element (`propfind`, `sync-collection`, …). */
  get kind(): string | null {
    return this.rootName ? this.resolve(this.rootName).name : null;
  }

  private child(node: Node | null, name: string): Node | string | undefined {
    if (!node || typeof node !== 'object') return undefined;
    const key = Object.keys(node).find((k) => !k.startsWith('@') && this.resolve(k).name === name);
    return key === undefined ? undefined : (node[key] as Node | string);
  }

  /** Requested properties (`<prop>`), or null for `<allprop/>` / an empty body. */
  props(): PropName[] | null {
    const propNode = this.child(this.root, 'prop');
    if (!propNode || typeof propNode !== 'object') return null;
    return Object.keys(propNode)
      .filter((k) => !k.startsWith('@'))
      .map((k) => this.resolve(k));
  }

  /** `<href>` elements of an addressbook-multiget. */
  hrefs(): string[] {
    const value = this.child(this.root, 'href');
    const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return list.map((h) => (typeof h === 'string' ? h : String((h as Node)['#text'] ?? '')));
  }

  /** `<sync-token>` of a sync-collection request ('' = initial sync). */
  syncToken(): string {
    const value = this.child(this.root, 'sync-token');
    return typeof value === 'string' ? value : '';
  }
}

function collectNamespaces(node: unknown, into: Map<string, string>) {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Node)) {
    if (key === '@xmlns' && typeof value === 'string') into.set('', value);
    else if (key.startsWith('@xmlns:') && typeof value === 'string') into.set(key.slice(7), value);
    else if (!key.startsWith('@')) {
      for (const child of Array.isArray(value) ? value : [value]) collectNamespaces(child, into);
    }
  }
}

/** Properties of one resource: XML content per property, undefined = not found (404). */
export type PropValues = Map<string, { prop: PropName; xml: string | undefined }>;

function element(p: PropName, content: string | undefined, extraNs: string[]) {
  let prefix = PREFIX[p.ns];
  let decl = '';
  if (!prefix) {
    prefix = `x${extraNs.length}`;
    extraNs.push(p.ns);
    decl = ` xmlns:${prefix}="${escapeXml(p.ns)}"`;
  }
  return content === undefined || content === ''
    ? `<${prefix}:${p.name}${decl}/>`
    : `<${prefix}:${p.name}${decl}>${content}</${prefix}:${p.name}>`;
}

export interface DavResponse {
  href: string;
  /** Properties, or a plain status (e.g. 404 for a removed card in a sync report). */
  props?: PropValues;
  status?: string;
}

/** `207 Multi-Status` body. */
export function multistatus(responses: DavResponse[], syncToken?: string): string {
  const parts = responses.map((r) => {
    const href = `<d:href>${escapeXml(r.href)}</d:href>`;
    if (!r.props)
      return `<d:response>${href}<d:status>HTTP/1.1 ${r.status ?? '404 Not Found'}</d:status></d:response>`;
    const extraNs: string[] = [];
    const found: string[] = [];
    const missing: string[] = [];
    for (const { prop: p, xml } of r.props.values()) {
      if (xml === undefined) missing.push(element(p, undefined, extraNs));
      else found.push(element(p, xml, extraNs));
    }
    const propstat = (items: string[], status: string) =>
      items.length
        ? `<d:propstat><d:prop>${items.join('')}</d:prop><d:status>HTTP/1.1 ${status}</d:status></d:propstat>`
        : '';
    return `<d:response>${href}${propstat(found, '200 OK')}${propstat(missing, '404 Not Found')}</d:response>`;
  });
  const token =
    syncToken === undefined ? '' : `<d:sync-token>${escapeXml(syncToken)}</d:sync-token>`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:" xmlns:card="${NS.card}" xmlns:cs="${NS.cs}">${parts.join('')}${token}</d:multistatus>`;
}

/** A `DAV:error` body, e.g. for an invalid sync token. */
export const davError = (condition: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d="DAV:"><d:${condition}/></d:error>`;
