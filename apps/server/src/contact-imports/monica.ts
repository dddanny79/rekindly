/**
 * Monica 4.x: its JSON account export ("Settings → Export → Export to Json") and
 * data fetched from its API, both read into `MonicaData`, then mapped to an import
 * bundle. Format notes: docs/import.md.
 */
import type { PointKind } from '../dav/vcard';
import {
  emptyContact,
  finishContact,
  type ImportBundle,
  type ImportContact,
  type ImportEntry,
  type ImportRelationship,
  type ImportReminder,
  type RelationshipTypeRef,
} from './contact';

type Locale = 'en' | 'de';

/** Monica's special date: year unknown → only day and month count; age based → only the year. */
export interface MonicaDate {
  date: string;
  yearUnknown: boolean;
  ageBased: boolean;
}

export interface MonicaContact {
  id: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  nickname: string | null;
  description: string | null;
  starred: boolean;
  partial: boolean;
  active: boolean;
  dead: boolean;
  job: string | null;
  company: string | null;
  foodPreferences: string | null;
  tags: string[];
  birthdate: MonicaDate | null;
  deceasedDate: MonicaDate | null;
  firstMetDate: MonicaDate | null;
  firstMetThrough: string | null;
  howYouMet: string | null;
  stayInTouchDays: number | null;
  fields: { kind: 'email' | 'phone' | 'other'; typeName: string | null; value: string }[];
  addresses: {
    label: string | null;
    street: string | null;
    city: string | null;
    region: string | null;
    zip: string | null;
    country: string | null;
  }[];
  /** Base64 image data of the avatar photo. */
  photo: string | null;
  notes: { body: string; createdAt: string; favorite: boolean }[];
  calls: { calledAt: string; content: string | null; contactCalled: boolean }[];
  reminders: {
    title: string;
    initialDate: string;
    frequencyType: string;
    frequencyNumber: number;
    active: boolean;
    automatic: boolean;
  }[];
  tasks: { title: string; description: string | null; completed: boolean }[];
  lifeEvents: { name: string | null; note: string | null; happenedAt: string }[];
  conversations: { happenedAt: string; messages: { content: string; byMe: boolean }[] }[];
}

export interface MonicaData {
  contacts: MonicaContact[];
  activities: {
    summary: string | null;
    description: string | null;
    happenedAt: string;
    participants: string[];
  }[];
  /** `of` is `type` of `contact` (Monica: "of_contact is contact_is's <type>"). */
  relationships: { contact: string; of: string; type: string }[];
}

// Reading the export ------------------------------------------------------------------

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const bool = (v: unknown) => v === true || v === 1 || v === '1';
const props = (v: unknown) => obj(obj(v).properties);

/** `{count, type, values}` collections of an object's `data`, by type. */
function collections(v: unknown): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();
  const data = obj(v).data;
  if (!Array.isArray(data)) return map;
  for (const c of data) {
    const type = str(obj(c).type);
    const values = obj(c).values;
    if (type && Array.isArray(values)) map.set(type, [...(map.get(type) ?? []), ...values]);
  }
  return map;
}

const specialDate = (v: unknown): MonicaDate | null => {
  const d = obj(v);
  const date = str(d.date);
  return date
    ? { date, yearUnknown: bool(d.is_year_unknown), ageBased: bool(d.is_age_based) }
    : null;
};

export const isMonicaExport = (json: unknown) =>
  !!obj(json).account && typeof obj(json).version === 'string' && 'app_version' in obj(json);

/** Reads Monica's JSON account export (format "1.0-preview.1"). */
export function readMonicaExport(json: unknown): MonicaData {
  const root = obj(json);
  const account = obj(root.account);
  const instance = obj(account.instance);
  const top = collections(account);

  const fieldTypes = new Map<string, { type: string | null; name: string | null }>();
  for (const t of (instance.contact_field_types as unknown[]) ?? []) {
    const p = props(t);
    fieldTypes.set(String(obj(t).uuid), { type: str(p.type), name: str(p.name) });
  }
  const photos = new Map<string, string>();
  for (const photo of top.get('photo') ?? []) {
    const url = str(props(photo).dataUrl);
    const base64 = url && /^data:image\/[^;]+;base64,(.*)$/s.exec(url)?.[1];
    if (base64) photos.set(String(obj(photo).uuid), base64);
  }
  // The user's own contact and contacts of subscribed address books are left out.
  const skip = new Set<string>();
  for (const user of top.get('user') ?? []) {
    const me = str(props(user).me_contact);
    if (me) skip.add(me);
  }
  for (const book of top.get('addressbook') ?? []) {
    for (const id of (props(book).contacts as unknown[]) ?? []) skip.add(String(id));
  }

  const contacts: MonicaContact[] = [];
  const participants = new Map<string, string[]>();
  for (const raw of top.get('contact') ?? []) {
    const id = String(obj(raw).uuid);
    if (skip.has(id)) continue;
    const p = props(raw);
    const data = collections(raw);
    const avatar = obj(p.avatar);
    for (const activity of data.get('activity') ?? []) {
      const key = String(activity);
      participants.set(key, [...(participants.get(key) ?? []), id]);
    }
    contacts.push({
      id,
      firstName: str(p.first_name),
      middleName: str(p.middle_name),
      lastName: str(p.last_name),
      nickname: str(p.nickname),
      description: str(p.description),
      starred: bool(p.is_starred),
      partial: bool(p.is_partial),
      active: p.is_active === undefined ? true : bool(p.is_active),
      dead: bool(p.is_dead),
      job: str(p.job),
      company: str(p.company),
      foodPreferences: str(p.food_preferences),
      tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      birthdate: specialDate(p.birthdate),
      deceasedDate: specialDate(p.deceased_date),
      firstMetDate: specialDate(p.first_met_date),
      firstMetThrough: str(p.first_met_through),
      howYouMet: str(p.first_met_additional_info),
      stayInTouchDays:
        typeof p.stay_in_touch_frequency === 'number' ? p.stay_in_touch_frequency : null,
      fields: (data.get('contact_field') ?? []).flatMap((f) => {
        const fp = props(f);
        const value = str(fp.data);
        if (!value) return [];
        const type = fieldTypes.get(String(fp.type));
        const kind = type?.type === 'email' ? 'email' : type?.type === 'phone' ? 'phone' : 'other';
        return [{ kind, typeName: type?.name ?? null, value } as const];
      }),
      addresses: (data.get('address') ?? []).map((a) => {
        const ap = props(a);
        return {
          label: str(ap.name),
          street: str(ap.street),
          city: str(ap.city),
          region: str(ap.province),
          zip: str(ap.postal_code),
          country: str(ap.country),
        };
      }),
      photo:
        avatar.avatar_source === 'photo' ? (photos.get(String(avatar.avatar_photo)) ?? null) : null,
      notes: (data.get('note') ?? []).flatMap((n) => {
        const body = str(props(n).body);
        return body
          ? [{ body, createdAt: String(obj(n).created_at), favorite: !!str(props(n).favorited_at) }]
          : [];
      }),
      calls: (data.get('call') ?? []).map((c) => {
        const cp = props(c);
        return {
          calledAt: String(cp.called_at ?? obj(c).created_at),
          content: str(cp.content),
          contactCalled: bool(cp.contact_called),
        };
      }),
      reminders: (data.get('reminder') ?? []).flatMap((r) => {
        const rp = props(r);
        const title = str(rp.title);
        const initialDate = str(rp.initial_date);
        if (!title || !initialDate) return [];
        return [
          {
            title,
            initialDate,
            frequencyType: String(rp.frequency_type ?? 'one_time'),
            frequencyNumber: Number(rp.frequency_number ?? 1) || 1,
            active: !bool(rp.inactive),
            // Monica's own birthday reminders; the birthday itself is imported.
            automatic: rp.delible === false,
          },
        ];
      }),
      tasks: (data.get('task') ?? []).flatMap((t) => {
        const tp = props(t);
        const title = str(tp.title);
        return title
          ? [{ title, description: str(tp.description), completed: bool(tp.completed) }]
          : [];
      }),
      lifeEvents: (data.get('life_event') ?? []).map((e) => {
        const ep = props(e);
        return {
          name: str(ep.name),
          note: str(ep.note),
          happenedAt: String(ep.happened_at ?? obj(e).created_at),
        };
      }),
      conversations: (data.get('conversation') ?? []).map((c) => {
        const cp = props(c);
        return {
          happenedAt: String(cp.happened_at ?? obj(c).created_at),
          messages: ((cp.messages as unknown[]) ?? []).flatMap((m) => {
            const content = str(props(m).content);
            return content ? [{ content, byMe: bool(props(m).written_by_me) }] : [];
          }),
        };
      }),
    });
  }

  const known = new Set(contacts.map((c) => c.id));
  return {
    contacts,
    activities: (top.get('activity') ?? []).flatMap((a) => {
      const ap = props(a);
      const people = (participants.get(String(obj(a).uuid)) ?? []).filter((id) => known.has(id));
      if (!people.length) return [];
      return [
        {
          summary: str(ap.summary),
          description: str(ap.description),
          happenedAt: String(ap.happened_at ?? obj(a).created_at),
          participants: people,
        },
      ];
    }),
    relationships: (top.get('relationship') ?? []).flatMap((r) => {
      const rp = props(r);
      const contact = str(rp.contact_is);
      const of = str(rp.of_contact);
      const type = str(rp.type);
      return contact && of && type && known.has(contact) && known.has(of)
        ? [{ contact, of, type }]
        : [];
    }),
  };
}

// Mapping to the app -----------------------------------------------------------------

/** Monica's relationship types: a seeded type, or a custom one (found or created). */
const TYPES: Record<string, { ref: (l: Locale) => RelationshipTypeRef; reversed?: boolean }> = {};
const seeded = (key: string, names: string[], reversed = false) => {
  for (const name of names) TYPES[name] = { ref: () => ({ key }), reversed };
};
const custom = (
  names: Record<Locale, [string, string]>,
  monica: string,
  reverseMonica: string | null,
) => {
  const symmetric = !reverseMonica;
  TYPES[monica] = {
    ref: (l) => ({ name: names[l][0], reverseName: names[l][1], symmetric }),
  };
  if (reverseMonica) {
    TYPES[reverseMonica] = {
      ref: (l) => ({ name: names[l][0], reverseName: names[l][1], symmetric }),
      reversed: true,
    };
  }
};
seeded('partner', ['partner', 'spouse', 'date', 'lover']);
seeded('parent', ['parent']);
seeded('parent', ['child'], true);
seeded('sibling', ['sibling']);
seeded('friend', ['friend', 'bestfriend']);
seeded('colleague', ['colleague']);
seeded('manager', ['boss']);
seeded('manager', ['subordinate'], true);
custom({ en: ['Ex-partner', 'Ex-partner'], de: ['Ex-Partner/in', 'Ex-Partner/in'] }, 'ex', null);
TYPES.ex_husband = TYPES.ex!;
custom(
  { en: ['Grandparent', 'Grandchild'], de: ['Großelternteil', 'Enkelkind'] },
  'grandparent',
  'grandchild',
);
custom(
  { en: ['Uncle/aunt', 'Nephew/niece'], de: ['Onkel/Tante', 'Neffe/Nichte'] },
  'uncle',
  'nephew',
);
custom({ en: ['Cousin', 'Cousin'], de: ['Cousin/e', 'Cousin/e'] }, 'cousin', null);
custom({ en: ['Godparent', 'Godchild'], de: ['Pate/Patin', 'Patenkind'] }, 'godfather', 'godson');
custom(
  { en: ['Stepparent', 'Stepchild'], de: ['Stiefelternteil', 'Stiefkind'] },
  'stepparent',
  'stepchild',
);
custom({ en: ['Mentor', 'Mentee'], de: ['Mentor/in', 'Mentee'] }, 'mentor', 'protege');
custom(
  { en: ['In love with', 'Loved by'], de: ['Verliebt in', 'Geliebt von'] },
  'inlovewith',
  'lovedby',
);

const TEXT: Record<Locale, Record<string, string>> = {
  en: {
    me: 'Me',
    deceased: 'Deceased',
    deceasedOn: 'Deceased on {{date}}',
    bornAbout: 'Born around {{year}}',
    food: 'Food preferences: {{text}}',
    lifeEvent: 'Life event',
  },
  de: {
    me: 'Ich',
    deceased: 'Verstorben',
    deceasedOn: 'Verstorben am {{date}}',
    bornAbout: 'Geboren um {{year}}',
    food: 'Essensvorlieben: {{text}}',
    lifeEvent: 'Lebensereignis',
  },
};
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');

const day = (iso: string) => iso.slice(0, 10);
/** Monica's timestamps (`…000000Z`, or `YYYY-MM-DD` from the API) → ISO. */
const isoTime = (value: string) => {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

function birthday(d: MonicaDate | null): string | null {
  if (!d || d.ageBased) return null;
  const date = day(d.date);
  return d.yearUnknown ? `--${date.slice(5)}` : date;
}

/** Messenger apps among Monica's contact field types; everything else is a profile/link. */
const MESSENGERS = /whatsapp|telegram|signal|threema|skype|wire|matrix|discord|slack|jabber|xmpp/i;

function point(field: MonicaContact['fields'][number]) {
  if (field.kind === 'email')
    return { kind: 'email' as PointKind, label: null, value: field.value };
  if (field.kind === 'phone')
    return { kind: 'phone' as PointKind, label: null, value: field.value };
  const label = field.typeName;
  if (label && MESSENGERS.test(label))
    return { kind: 'messenger' as PointKind, label, value: field.value };
  return {
    kind: (/^https?:\/\//i.test(field.value) && !label ? 'url' : 'social') as PointKind,
    label,
    value: field.value,
  };
}

/** The next date of a repeating reminder, from its first date (Monica: every n weeks/months/years). */
export function nextDue(r: MonicaContact['reminders'][number], today: string): string | null {
  let date = day(r.initialDate);
  if (r.frequencyType === 'one_time') return date >= today ? date : null;
  const step = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
    const next = new Date(Date.UTC(y, m - 1, dd));
    if (r.frequencyType === 'week') next.setUTCDate(next.getUTCDate() + 7 * r.frequencyNumber);
    else if (r.frequencyType === 'month') next.setUTCMonth(next.getUTCMonth() + r.frequencyNumber);
    else next.setUTCFullYear(next.getUTCFullYear() + r.frequencyNumber);
    return next.toISOString().slice(0, 10);
  };
  for (let i = 0; date < today && i < 5000; i++) date = step(date);
  return date;
}

function countryName(code: string | null, locale: Locale): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Monica data → contacts, timeline entries and relationships for the import. */
export function monicaBundle(data: MonicaData, locale: Locale, now = new Date()): ImportBundle {
  const t = TEXT[locale];
  const today = now.toISOString().slice(0, 10);
  const entries: ImportEntry[] = [];
  const contacts: ImportContact[] = [];

  for (const m of data.contacts) {
    const facts: string[] = [];
    const reminders: ImportReminder[] = [];
    if (m.dead) {
      facts.push(
        m.deceasedDate && !m.deceasedDate.ageBased && !m.deceasedDate.yearUnknown
          ? fill(t.deceasedOn!, { date: day(m.deceasedDate.date) })
          : t.deceased!,
      );
    }
    if (m.birthdate?.ageBased)
      facts.push(fill(t.bornAbout!, { year: m.birthdate.date.slice(0, 4) }));
    if (m.foodPreferences) facts.push(fill(t.food!, { text: m.foodPreferences }));

    for (const note of m.notes) {
      // Favorite notes are what one should know about someone: facts.
      if (note.favorite) facts.push(note.body);
      else {
        entries.push({
          kind: 'note',
          direction: null,
          occurredAt: isoTime(note.createdAt),
          title: null,
          bodyMd: note.body,
          people: [m.id],
        });
      }
    }
    for (const call of m.calls) {
      entries.push({
        kind: 'call',
        direction: call.contactCalled ? 'in' : 'out',
        occurredAt: isoTime(call.calledAt),
        title: null,
        bodyMd: call.content ?? '',
        people: [m.id],
      });
    }
    for (const event of m.lifeEvents) {
      entries.push({
        kind: 'event',
        direction: null,
        occurredAt: isoTime(event.happenedAt),
        title: event.name ?? t.lifeEvent!,
        bodyMd: event.note ?? '',
        people: [m.id],
      });
    }
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.nickname || '?';
    for (const conversation of m.conversations) {
      if (!conversation.messages.length) continue;
      entries.push({
        kind: 'message',
        direction: null,
        occurredAt: isoTime(conversation.happenedAt),
        title: null,
        bodyMd: conversation.messages
          .map((msg) => `**${msg.byMe ? t.me : name}:** ${msg.content}`)
          .join('\n\n'),
        people: [m.id],
      });
    }
    for (const r of m.reminders) {
      if (!r.active || r.automatic) continue;
      const dueOn = nextDue(r, today);
      if (dueOn) {
        reminders.push({
          title: r.title,
          dueOn,
          recurrence: r.frequencyType === 'year' && r.frequencyNumber === 1 ? 'yearly' : 'none',
        });
      }
    }
    // Open tasks are follow-ups, due now.
    for (const task of m.tasks) {
      if (!task.completed) reminders.push({ title: task.title, dueOn: today, recurrence: 'none' });
    }

    const c: ImportContact = {
      ...emptyContact(),
      firstName: m.firstName,
      middleName: m.middleName,
      lastName: m.lastName,
      nickname: m.nickname,
      birthday: birthday(m.birthdate),
      organization: m.company ? [m.company] : [],
      title: m.job,
      note: m.description,
      points: m.fields.map((f) => ({ ...point(f), isPrimary: false })),
      addresses: m.addresses.map((a) => ({
        label: a.label,
        street: a.street,
        zip: a.zip,
        city: a.city,
        region: a.region,
        country: countryName(a.country, locale),
      })),
      tags: m.tags,
      favorite: m.starred,
      photo: m.photo ? Buffer.from(m.photo, 'base64') : null,
      sourceId: m.id,
      listed: !m.partial,
      archived: !m.active,
      contactEveryDays: m.stayInTouchDays && m.stayInTouchDays > 0 ? m.stayInTouchDays : null,
      metWhere: m.howYouMet,
      metWhen: m.firstMetDate && !m.firstMetDate.yearUnknown ? day(m.firstMetDate.date) : null,
      metThroughSourceId: m.firstMetThrough,
      facts,
      reminders,
    };
    // A job without a company stays visible as “who is this”.
    if (!m.company && m.job && !c.note) c.note = m.job;
    const finished = finishContact(c);
    if (finished) contacts.push(finished);
  }

  for (const a of data.activities) {
    entries.push({
      kind: 'meeting',
      direction: null,
      occurredAt: isoTime(a.happenedAt),
      title: a.summary,
      bodyMd: a.description ?? '',
      people: a.participants,
    });
  }

  // Monica stores each relationship twice (once per direction): keep one.
  const relationships: ImportRelationship[] = [];
  const seen = new Set<string>();
  for (const r of data.relationships) {
    const type = TYPES[r.type];
    const ref: RelationshipTypeRef = type
      ? type.ref(locale)
      : { name: r.type, reverseName: r.type, symmetric: true };
    const [from, to] = type?.reversed ? [r.of, r.contact] : [r.contact, r.of];
    const symmetric =
      'key' in ref
        ? ['partner', 'sibling', 'friend', 'colleague'].includes(ref.key)
        : ref.symmetric;
    const pair = symmetric ? [from, to].sort().join('|') : `${from}|${to}`;
    const key = `${JSON.stringify(ref)}|${pair}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({ from, to, type: ref });
  }
  return { contacts, entries, relationships };
}
