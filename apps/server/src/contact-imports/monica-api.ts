/**
 * Fetches a Monica 4.x account through its API (personal access token) into the
 * same shape as the JSON export. Uses the account-wide lists (100 per page), so a
 * few hundred contacts need a few dozen requests; waits when Monica answers 429.
 */
import { DomainError } from '../lib/errors';
import type { MonicaContact, MonicaData, MonicaDate } from './monica';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);

export interface MonicaApiOptions {
  url: string;
  token: string;
  /** For tests: no waiting between retries. */
  wait?: (ms: number) => Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** `https://monica.example.com` (with or without `/api`) → API base URL. */
export function apiBase(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new DomainError(400, 'monica_invalid_url');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new DomainError(400, 'monica_invalid_url');
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '').replace(/\/api$/, '')}/api`;
}

async function get(base: string, path: string, options: MonicaApiOptions): Promise<Json> {
  const wait = options.wait ?? sleep;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${options.token.trim()}`, accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const cause = (error as Error).cause
        ? String((error as Error).cause)
        : (error as Error).message;
      throw new DomainError(502, 'monica_unreachable', cause);
    }
    if (res.status === 429 && attempt < 5) {
      await wait((Number(res.headers.get('retry-after')) || 60) * 1000);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new DomainError(400, 'monica_unauthorized');
    if (!res.ok) throw new DomainError(502, 'monica_unreachable', `HTTP ${res.status}`);
    try {
      return obj(await res.json());
    } catch {
      throw new DomainError(
        502,
        'monica_unreachable',
        'no JSON answer — is this a Monica address?',
      );
    }
  }
}

/** All pages of a list endpoint. */
async function all(base: string, path: string, options: MonicaApiOptions): Promise<Json[]> {
  const items: Json[] = [];
  const join = path.includes('?') ? '&' : '?';
  for (let page = 1; page < 10_000; page++) {
    const body = await get(base, `${path}${join}limit=100&page=${page}`, options);
    items.push(...list(body.data));
    const last = Number(obj(body.meta).last_page ?? 1);
    if (page >= last || !list(body.data).length) break;
  }
  return items;
}

const apiDate = (v: unknown): MonicaDate | null => {
  const d = obj(v);
  const date = str(d.date);
  return date
    ? { date, yearUnknown: d.is_year_unknown === true, ageBased: d.is_age_based === true }
    : null;
};

function emptyContact(id: string, c: Json): MonicaContact {
  const info = obj(c.information);
  return {
    id,
    firstName: str(c.first_name),
    middleName: null,
    lastName: str(c.last_name),
    nickname: str(c.nickname),
    description: str(c.description),
    starred: c.is_starred === true,
    partial: c.is_partial === true,
    active: c.is_active !== false,
    dead: c.is_dead === true,
    job: null,
    company: null,
    foodPreferences: null,
    tags: [],
    birthdate: apiDate(obj(info.dates).birthdate ?? info.birthdate),
    deceasedDate: apiDate(obj(info.dates).deceased_date ?? info.deceased_date),
    firstMetDate: null,
    firstMetThrough: null,
    howYouMet: null,
    stayInTouchDays: null,
    fields: [],
    addresses: [],
    photo: null,
    notes: [],
    calls: [],
    reminders: [],
    tasks: [],
    lifeEvents: [],
    conversations: [],
  };
}

const contactId = (v: unknown) => {
  const c = obj(v);
  return c.id === undefined ? null : String(c.id);
};

/** Reads everything the import uses from a Monica account's API. */
export async function fetchMonica(options: MonicaApiOptions): Promise<MonicaData> {
  const base = apiBase(options.url);
  const contacts = new Map<string, MonicaContact>();
  const relationships: MonicaData['relationships'] = [];

  for (const c of await all(base, '/contacts?with=contactfields', options)) {
    if (c.is_me === true) continue;
    const id = String(c.id);
    const info = obj(c.information);
    const career = obj(info.career);
    const met = obj(info.how_you_met);
    const contact = emptyContact(id, c);
    Object.assign(contact, {
      job: str(career.job),
      company: str(career.company),
      foodPreferences: str(info.food_preferences),
      tags: list(c.tags).flatMap((t) => (str(t.name) ? [str(t.name)!] : [])),
      firstMetDate: apiDate(met.first_met_date),
      firstMetThrough: contactId(met.first_met_through_contact),
      howYouMet: str(met.general_information),
      stayInTouchDays:
        typeof c.stay_in_touch_frequency === 'number' ? c.stay_in_touch_frequency : null,
      fields: list(c.contactFields).flatMap((f) => {
        const value = str(f.content);
        const type = obj(f.contact_field_type);
        const kind = type.type === 'email' ? 'email' : type.type === 'phone' ? 'phone' : 'other';
        return value ? [{ kind, typeName: str(type.name), value }] : [];
      }),
      addresses: list(c.addresses).map((a) => ({
        label: str(a.name),
        street: str(a.street),
        city: str(a.city),
        region: str(a.province),
        zip: str(a.postal_code),
        country: str(obj(a.country).iso) ?? str(obj(a.country).name),
      })),
    });
    contacts.set(id, contact);
    for (const group of Object.values(obj(obj(info.relationships)))) {
      for (const r of list(obj(group).contacts)) {
        const other = obj(r.contact);
        const otherId = contactId(other);
        const type = str(obj(r.relationship).name);
        if (!otherId || !type) continue;
        // Partial contacts only appear here.
        if (!contacts.has(otherId) && other.is_partial === true) {
          contacts.set(otherId, emptyContact(otherId, other));
        }
        relationships.push({ contact: id, of: otherId, type });
      }
    }
  }

  const owner = (item: Json) => contacts.get(contactId(item.contact) ?? '');
  for (const n of await all(base, '/notes', options)) {
    const body = str(n.body);
    if (body)
      owner(n)?.notes.push({
        body,
        createdAt: String(n.created_at),
        favorite: n.is_favorited === true,
      });
  }
  for (const c of await all(base, '/calls', options)) {
    owner(c)?.calls.push({
      calledAt: String(c.called_at ?? c.created_at),
      content: str(c.content),
      contactCalled: c.contact_called === true || c.contact_called === 1,
    });
  }
  for (const r of await all(base, '/reminders', options)) {
    const title = str(r.title);
    const initialDate = str(r.initial_date);
    if (!title || !initialDate) continue;
    owner(r)?.reminders.push({
      title,
      initialDate,
      frequencyType: String(r.frequency_type ?? 'one_time'),
      frequencyNumber: Number(r.frequency_number ?? 1) || 1,
      active: true,
      automatic: r.delible === false,
    });
  }
  for (const t of await all(base, '/tasks', options)) {
    const title = str(t.title);
    if (title)
      owner(t)?.tasks.push({
        title,
        description: str(t.description),
        completed: t.completed === true,
      });
  }
  const activities: MonicaData['activities'] = [];
  for (const a of await all(base, '/activities', options)) {
    const participants = list(obj(a.attendees).contacts)
      .map((c) => contactId(c))
      .filter((id): id is string => !!id && contacts.has(id));
    if (!participants.length) continue;
    activities.push({
      summary: str(a.summary),
      description: str(a.description),
      happenedAt: String(a.happened_at ?? a.created_at),
      participants,
    });
  }

  const known = new Set(contacts.keys());
  return {
    contacts: [...contacts.values()].map((c) => ({
      ...c,
      firstMetThrough: c.firstMetThrough && known.has(c.firstMetThrough) ? c.firstMetThrough : null,
    })),
    activities,
    relationships: relationships.filter((r) => known.has(r.contact) && known.has(r.of)),
  };
}

/** What the fetch endpoint returns; the import reads it like an export file. */
export const MONICA_API_FORMAT = 'personengedaechtnis-monica-api';

export const isMonicaApiFile = (json: unknown) => obj(json).format === MONICA_API_FORMAT;
