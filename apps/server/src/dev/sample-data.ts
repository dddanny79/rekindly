import type { Db } from '../db/client';

/**
 * Invented sample data for performance tests and demos. Every name, company and
 * sentence is made up from the word lists below; nothing refers to real people.
 */

const FIRST = [
  'Anna',
  'Ben',
  'Clara',
  'David',
  'Elif',
  'Felix',
  'Greta',
  'Hannes',
  'Ida',
  'Jonas',
  'Katrin',
  'Lukas',
  'Mara',
  'Niklas',
  'Olga',
  'Paul',
  'Rosa',
  'Simon',
  'Tara',
  'Ulf',
  'Vera',
  'Wim',
  'Yara',
  'Zoë',
  'Jürgen',
  'Jana',
  'Björn',
  'Søren',
  'José',
  'Renée',
];
const LAST = [
  'Müller',
  'Schmidt',
  'Schneider',
  'Fischer',
  'Weber',
  'Meyer',
  'Wagner',
  'Becker',
  'Schulz',
  'Hoffmann',
  'Koch',
  'Richter',
  'Klein',
  'Wolf',
  'Schröder',
  'Neumann',
  'Schwarz',
  'Zimmermann',
  'Braun',
  'Krüger',
  'Hofmann',
  'Hartmann',
  'Lange',
  'Werner',
  'Krause',
  'Lehmann',
  'Köhler',
  'Weiß',
  'Jäger',
  'Groß',
  'Núñez',
  'Ødegaard',
];
const COMPANY_A = [
  'Nord',
  'Süd',
  'Rhein',
  'Alpen',
  'Hansa',
  'Main',
  'Elb',
  'Ruhr',
  'Isar',
  'Weser',
];
const COMPANY_B = [
  'Technik',
  'Logistik',
  'Bau',
  'Handel',
  'Software',
  'Werke',
  'Druck',
  'Food',
  'Energie',
  'Medien',
];
const COMPANY_C = ['GmbH', 'AG', 'KG', 'GmbH & Co. KG', 'eG'];
const CITIES = [
  'Köln',
  'Düsseldorf',
  'München',
  'Hamburg',
  'Berlin',
  'Leipzig',
  'Münster',
  'Würzburg',
  'Lübeck',
  'Göttingen',
];
const ROLES = [
  'Einkauf',
  'Vertrieb',
  'Geschäftsführung',
  'Buchhaltung',
  'IT-Leitung',
  'Personal',
  'Marketing',
  'Projektleitung',
  'Assistenz',
  'Technik',
];
const TAGS = [
  'kunde',
  'lieferant',
  'familie',
  'freunde',
  'nachbarn',
  'verein',
  'segeln',
  'laufen',
  'schule',
  'studium',
  'köln',
  'münchen',
  'presse',
  'beirat',
  'mentoring',
];
const FACTS = [
  'Tochter macht gerade Abitur',
  'trinkt keinen Kaffee',
  'fährt Rennrad',
  'spricht fließend Spanisch',
  'hat zwei Hunde',
  'mag italienisches Essen',
  'ist Frühaufsteher',
  'spielt Cello im Orchester',
  'baut gerade ein Haus',
  'war lange in Kanada',
  'Vegetarierin',
  'sammelt Schallplatten',
];
const WORDS = (
  'Angebot Budget Termin Projekt Rechnung Umzug Urlaub Messe Workshop Vertrag Lieferung Freigabe ' +
  'Standort Abstimmung Feedback Präsentation Planung Strategie Kunde Team Schulung Prototyp Muster ' +
  'Reklamation Ausschreibung Zeitplan Kosten Qualität Wartung Software Konferenz Geburtstag Hochzeit ' +
  'Garten Fahrrad Wanderung Konzert Theater Ausstellung Grillfest Ehrenamt Spende Laufgruppe Segeltörn ' +
  'nächste Woche später morgen gestern dringend vertraulich besprochen vereinbart verschoben zugesagt ' +
  'abgesagt nachgefragt erinnert geschickt geprüft verlängert erweitert reduziert übernommen'
).split(' ');

/** Small seeded PRNG (mulberry32), so runs are reproducible. */
function random(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(list: T[]) => list[int(list.length)]!;
  return { next, int, pick };
}

export interface SampleOptions {
  people: number;
  entries: number;
  organizations?: number;
  seed?: number;
}

/** Inserts invented people, organizations and entries; the triggers queue them for search. */
export function insertSampleData(db: Db, options: SampleOptions) {
  const sqlite = db.$client;
  const rnd = random(options.seed ?? 42);
  const uuid = () => crypto.randomUUID();
  const spaces = (
    sqlite.prepare('select id from spaces where deleted_at is null order by sort').all() as {
      id: string;
    }[]
  ).map((s) => s.id);
  if (!spaces.length) throw new Error('No spaces; run the app once first.');

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const sentence = (n: number) =>
    Array.from({ length: n }, () => rnd.pick(WORDS))
      .join(' ')
      .replace(/^./, (c) => c.toUpperCase()) + '.';

  const insertOrg = sqlite.prepare(
    'insert into organizations (id, space_id, parent_id, kind, name) values (?, ?, ?, ?, ?)',
  );
  const insertPerson = sqlite.prepare(
    `insert into people (id, space_id, first_name, last_name, summary, birthday, contact_every_days)
     values (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPoint = sqlite.prepare(
    'insert into contact_points (id, person_id, kind, label, value, sort) values (?, ?, ?, ?, ?, ?)',
  );
  const insertAffiliation = sqlite.prepare(
    'insert into affiliations (id, person_id, organization_id, role, is_primary) values (?, ?, ?, ?, 1)',
  );
  const insertFact = sqlite.prepare(
    'insert into facts (id, person_id, text, pinned, sort) values (?, ?, ?, ?, ?)',
  );
  const insertTag = sqlite.prepare('insert into tags (id, name) values (?, ?)');
  const insertPersonTag = sqlite.prepare(
    'insert or ignore into person_tags (person_id, tag_id) values (?, ?)',
  );
  const insertEntry = sqlite.prepare(
    `insert into entries (id, space_id, kind, direction, occurred_at, title, body_md)
     values (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLink = sqlite.prepare('insert into entry_people (entry_id, person_id) values (?, ?)');
  const insertReminder = sqlite.prepare(
    'insert into reminders (id, person_id, title, due_at) values (?, ?, ?, ?)',
  );

  sqlite.transaction(() => {
    // Organizations: companies with sites below them.
    const orgsBySpace = new Map<string, string[]>(spaces.map((s) => [s, []]));
    const companies = Math.max(1, Math.round((options.organizations ?? options.people / 15) / 3));
    for (let i = 0; i < companies; i++) {
      const spaceId = spaces[i % spaces.length]!;
      const id = uuid();
      insertOrg.run(
        id,
        spaceId,
        null,
        'company',
        `${rnd.pick(COMPANY_A)} ${rnd.pick(COMPANY_B)} ${rnd.pick(COMPANY_C)} ${i + 1}`,
      );
      orgsBySpace.get(spaceId)!.push(id);
      for (const city of [rnd.pick(CITIES), rnd.pick(CITIES)]) {
        const site = uuid();
        insertOrg.run(site, spaceId, id, 'site', `Standort ${city}`);
        orgsBySpace.get(spaceId)!.push(site);
      }
    }

    const tagIds = TAGS.map((name) => {
      const id = uuid();
      insertTag.run(id, name);
      return id;
    });

    const people: { id: string; spaceId: string }[] = [];
    for (let i = 0; i < options.people; i++) {
      const id = uuid();
      const spaceId = spaces[i % spaces.length]!;
      const first = rnd.pick(FIRST);
      const last = rnd.pick(LAST);
      const birthday =
        rnd.next() < 0.6
          ? `${rnd.next() < 0.7 ? 1950 + rnd.int(55) : '-'}-${String(1 + rnd.int(12)).padStart(2, '0')}-${String(1 + rnd.int(28)).padStart(2, '0')}`
          : null;
      insertPerson.run(
        id,
        spaceId,
        first,
        last,
        rnd.next() < 0.5 ? `${rnd.pick(ROLES)} aus ${rnd.pick(CITIES)}` : null,
        birthday,
        rnd.next() < 0.1 ? rnd.pick([30, 90, 180]) : null,
      );
      people.push({ id, spaceId });
      const mail = `${first}.${last}${i}@example.com`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^\x20-\x7e]/g, '');
      insertPoint.run(uuid(), id, 'email', null, mail, 0);
      insertPoint.run(
        uuid(),
        id,
        'phone',
        'Mobil',
        `+49 1${50 + rnd.int(30)} ${1000000 + rnd.int(8999999)}`,
        1,
      );
      const orgs = orgsBySpace.get(spaceId)!;
      if (orgs.length && rnd.next() < 0.7)
        insertAffiliation.run(uuid(), id, rnd.pick(orgs), rnd.pick(ROLES));
      for (let f = 0; f < rnd.int(4); f++)
        insertFact.run(uuid(), id, rnd.pick(FACTS), f === 0 ? 1 : 0, f);
      for (let t = 0; t < rnd.int(3); t++) insertPersonTag.run(id, rnd.pick(tagIds));
      if (rnd.next() < 0.1) {
        insertReminder.run(
          uuid(),
          id,
          `${rnd.pick(WORDS)} klären`,
          iso(now + (rnd.int(60) - 30) * 86_400_000).slice(0, 10),
        );
      }
    }

    const kinds = ['note', 'call', 'call', 'meeting', 'message', 'event'] as const;
    for (let i = 0; i < options.entries; i++) {
      const first = rnd.pick(people);
      const kind = rnd.pick([...kinds]);
      const id = uuid();
      insertEntry.run(
        id,
        first.spaceId,
        kind,
        kind === 'call' || kind === 'message' ? rnd.pick(['in', 'out']) : null,
        iso(now - rnd.int(3 * 365) * 86_400_000 - rnd.int(86_400_000)),
        rnd.next() < 0.2 ? sentence(3) : null,
        Array.from({ length: 1 + rnd.int(4) }, () => sentence(6 + rnd.int(10))).join(' '),
      );
      insertLink.run(id, first.id);
      if (rnd.next() < 0.2) {
        const second = rnd.pick(people);
        if (second.id !== first.id) insertLink.run(id, second.id);
      }
    }
  })();
}
