/**
 * A small, realistic and completely invented data set for screenshots and the demo:
 * a handful of people across two spaces, with organizations, facts, a timeline,
 * follow-ups, birthdays and relationships. Dates are relative to today.
 *
 *   pnpm --filter @app/server showcase-data
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { relationshipTypes, spaces } from '../db/schema';
import { createEntry } from '../entries/service';
import { addFact } from '../facts/service';
import { createOrganization } from '../organizations/service';
import {
  addContactPoint,
  addPersonTag,
  addRelationship,
  createPerson,
  updatePerson,
} from '../people/service';
import { addReminder } from '../reminders/service';

const day = 86_400_000;
const ago = (days: number, hour = 10) => {
  const d = new Date(Date.now() - days * day);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const inDays = (days: number) => new Date(Date.now() + days * day).toISOString().slice(0, 10);
/** A birthday `days` from today, `age` years ago (or without a year). */
const birthday = (days: number, age?: number) => {
  const d = new Date(Date.now() + days * day);
  const md = d.toISOString().slice(5, 10);
  return age ? `${d.getUTCFullYear() - age}-${md}` : `--${md}`;
};

export function insertShowcase(db: Db) {
  const all = db.select().from(spaces).all();
  const privateSpace = all.find((s) => s.nameKey === 'seed.spaces.private')!.id;
  const business = all.find((s) => s.nameKey === 'seed.spaces.business')!.id;
  const type = (key: string) =>
    db
      .select()
      .from(relationshipTypes)
      .where(eq(relationshipTypes.nameKey, `seed.relationshipTypes.${key}`))
      .get()!.id;

  const org = (name: string, website?: string) =>
    createOrganization(db, { spaceId: business, name, kind: 'company', website }).id;
  const northwind = org('Northwind Labs', 'https://northwind.example.com');
  const bluepeak = org('Bluepeak Insurance', 'https://bluepeak.example.com');
  const studio = org('Lumen Design Studio');

  const person = (
    spaceId: string,
    firstName: string,
    lastName: string,
    fields: Parameters<typeof updatePerson>[2] = {},
    extra: { organizationId?: string; role?: string; listed?: boolean } = {},
  ) => {
    const p = createPerson(db, { spaceId, firstName, lastName, ...extra });
    if (Object.keys(fields).length) updatePerson(db, p.id, fields);
    return p.id;
  };
  const point = (personId: string, kind: 'email' | 'phone', value: string, label?: string) =>
    addContactPoint(db, personId, { kind, value, label });
  const note = (
    personIds: string[],
    kind: 'note' | 'call' | 'meeting' | 'message',
    daysAgo: number,
    bodyMd: string,
    title?: string,
    direction?: 'in' | 'out',
  ) => createEntry(db, { kind, personIds, bodyMd, title, direction, occurredAt: ago(daysAgo) });

  // Business ---------------------------------------------------------------------
  const maya = person(
    business,
    'Maya',
    'Chen',
    {
      summary: 'Head of Product at Northwind — our main contact for the pilot',
      birthday: birthday(24, 41),
      contactEveryDays: 30,
      metWhere: 'Product Summit, Amsterdam',
      metWhen: '2023-05',
      favorite: true,
    },
    { organizationId: northwind, role: 'Head of Product' },
  );
  point(maya, 'email', 'maya.chen@northwind.example.com', 'Work');
  point(maya, 'phone', '+1 415 555 0142', 'Mobile');
  addFact(db, maya, { text: 'Prefers calls before 10 am', pinned: true });
  addFact(db, maya, { text: 'Training for the Berlin Marathon in September' });
  addPersonTag(db, maya, 'pilot');

  const jonas = person(
    business,
    'Jonas',
    'Weber',
    { summary: 'CTO, decides on the integration', birthday: birthday(5, 46) },
    { organizationId: northwind, role: 'CTO' },
  );
  point(jonas, 'email', 'jonas.weber@northwind.example.com', 'Work');
  addFact(db, jonas, { text: 'Skeptical about cloud vendors — bring the self-hosting option' });
  addRelationship(db, maya, { personId: jonas, typeId: type('colleague') });

  const tom = person(
    business,
    'Tom',
    'Fischer',
    { summary: 'Account manager for our office insurance', contactEveryDays: 90 },
    { organizationId: bluepeak, role: 'Account Manager' },
  );
  point(tom, 'phone', '+49 30 5550 1876', 'Work');

  const priya = person(
    business,
    'Priya',
    'Raman',
    {
      summary: 'Freelance product designer, worked on our onboarding',
      metWhere: 'Config, San Francisco',
      metWhen: '2024-06',
    },
    { organizationId: studio, role: 'Founder' },
  );
  point(priya, 'email', 'priya@lumen.example.com');
  addFact(db, priya, { text: 'Two kids, Asha (7) and Dev (4)', pinned: true });
  addFact(db, priya, { text: 'Vegetarian; loves the ramen place near the station' });
  updatePerson(db, priya, { metThroughPersonId: maya });

  note(
    [maya],
    'call',
    3,
    'Talked about the **Q4 roadmap**. She wants a pilot with two teams in November and asked for a short proposal with pricing for 50 seats.\n\n- Send the proposal by Friday\n- Jonas joins the next call',
    undefined,
    'out',
  );
  addReminder(db, maya, { title: 'Send pilot proposal to Maya', dueOn: inDays(2) });
  note(
    [maya, jonas],
    'meeting',
    21,
    'Kick-off at their office. Jonas is worried about data residency — self-hosting answers that. Maya will champion it internally.',
    'Kick-off with Northwind',
  );
  note(
    [maya],
    'message',
    40,
    'Congratulated her on the promotion to Head of Product.',
    undefined,
    'out',
  );
  note(
    [jonas],
    'call',
    12,
    'Security questions: SSO, backups, audit log. Sent the docs afterwards.',
    undefined,
    'in',
  );
  note(
    [tom],
    'call',
    118,
    'Renewal in spring; he will check whether the new office needs a separate policy.',
    undefined,
    'in',
  );
  addReminder(db, tom, { title: 'Ask Tom about the new office policy', dueOn: inDays(-2) });
  note(
    [priya],
    'meeting',
    9,
    'Coffee. She is looking for a long-term client from January; very interested in the design system work.',
    'Coffee with Priya',
  );

  // Private ----------------------------------------------------------------------
  const sarah = person(privateSpace, 'Sarah', 'Miller', {
    summary: 'Friend from the climbing gym',
    birthday: birthday(2, 38),
    contactEveryDays: 21,
    favorite: true,
  });
  point(sarah, 'phone', '+49 170 5550 2231', 'Mobile');
  addFact(db, sarah, { text: 'Allergic to nuts', pinned: true });
  addFact(db, sarah, { text: 'Dreams of hiking the Alta Via 1 in the Dolomites' });
  addPersonTag(db, sarah, 'climbing');
  const luca = person(privateSpace, 'Luca', 'Rossi', {}, { listed: false });
  addRelationship(db, sarah, { personId: luca, typeId: type('partner') });
  note(
    [sarah],
    'meeting',
    26,
    'Dinner at hers with Luca. They are moving to Munich in spring — Luca got the job at the hospital.',
    'Dinner at Sarah’s',
  );
  addReminder(db, sarah, {
    title: 'Birthday present: hiking map of the Dolomites',
    dueOn: inDays(1),
  });

  const ben = person(privateSpace, 'Ben', 'Okafor', {
    summary: 'University friend, now in Lisbon',
    contactEveryDays: 90,
    birthday: birthday(61),
  });
  point(ben, 'email', 'ben.okafor@example.org');
  addFact(db, ben, { text: 'Works as a marine biologist' });
  note(
    [ben],
    'call',
    142,
    'Long call. He might visit in the summer with his daughter Ada.',
    undefined,
    'in',
  );

  const helen = person(privateSpace, 'Helen', 'Park', {
    summary: 'Neighbour, waters the plants when we travel',
    birthday: birthday(12, 72),
  });
  addFact(db, helen, { text: 'Has a spare key' });
  note(
    [helen],
    'note',
    6,
    'Brought her the parcel; she asked for help with the new phone next week.',
  );
  addReminder(db, helen, { title: 'Help Helen set up her phone', dueOn: inDays(0) });

  const nina = person(privateSpace, 'Nina', 'Novak', {
    summary: 'Book club; organizes the next meeting',
    contactEveryDays: 30,
  });
  addPersonTag(db, nina, 'book club');
  addPersonTag(db, sarah, 'book club');
  note(
    [nina, sarah],
    'meeting',
    15,
    'Book club: “The Remains of the Day”. Next: Nina picks something by Le Guin.',
    'Book club',
  );
}
