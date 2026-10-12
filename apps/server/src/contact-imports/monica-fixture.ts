/** An invented Monica 4.x JSON export (structure as Monica's ExportResources write it). */

const ts = (date: string) => `${date}T10:00:00.000000Z`;
const obj = (uuid: string, properties: Record<string, unknown>, data?: unknown[]) => ({
  uuid,
  created_at: ts('2024-01-10'),
  updated_at: ts('2024-01-10'),
  properties,
  ...(data ? { data } : {}),
});
const coll = (type: string, values: unknown[]) => ({ count: values.length, type, values });

export const ERIKA = 'c1000000-0000-4000-8000-000000000001';
export const MAX = 'c1000000-0000-4000-8000-000000000002';
export const LENA = 'c1000000-0000-4000-8000-000000000003';
export const OMA = 'c1000000-0000-4000-8000-000000000004';
export const ME = 'c1000000-0000-4000-8000-000000000009';
const EMAIL = 'b0000000-0000-4000-8000-0000000000e1';
const PHONE = 'b0000000-0000-4000-8000-0000000000e2';
const WHATSAPP = 'b0000000-0000-4000-8000-0000000000e3';
const DINNER = 'a5000000-0000-4000-8000-000000000001';
const PHOTO = 'a7000000-0000-4000-8000-000000000001';

const date = (d: string, yearUnknown = false, ageBased = false) => ({
  uuid: `d-${d}`,
  is_age_based: ageBased,
  is_year_unknown: yearUnknown,
  date: `${d}T00:00:00.000000Z`,
  created_at: ts('2024-01-10'),
  updated_at: ts('2024-01-10'),
});
const rel = (n: number, type: string, contactIs: string, ofContact: string) =>
  obj(`a6000000-0000-4000-8000-00000000000${n}`, {
    type,
    contact_is: contactIs,
    of_contact: ofContact,
  });

export function monicaExport(photoBase64: string) {
  return {
    version: '1.0-preview.1',
    app_version: '4.1.2',
    export_date: '2026-10-01T08:00:00.000000Z',
    url: 'https://monica.example.org',
    exported_by: '0b7c1e7e-1111-4a8e-9a1a-000000000001',
    account: {
      uuid: '0b7c1e7e-0000-4a8e-9a1a-000000000000',
      created_at: ts('2020-01-10'),
      updated_at: ts('2026-09-30'),
      data: [
        coll('user', [
          {
            uuid: 'u1',
            first_name: 'Erika',
            last_name: 'Nutzerin',
            email: 'nutzerin@example.com',
            properties: { locale: 'de', me_contact: ME },
          },
        ]),
        coll('contact', [
          obj(
            ERIKA,
            {
              first_name: 'Erika',
              last_name: 'Musterfrau',
              nickname: 'Riki',
              description: 'Kletterpartnerin',
              is_starred: true,
              is_partial: false,
              is_active: true,
              is_dead: false,
              job: 'Architektin',
              company: 'Beispiel Planungs GmbH',
              food_preferences: 'vegetarisch',
              stay_in_touch_frequency: 30,
              avatar: { avatar_source: 'photo', avatar_photo: PHOTO },
              tags: ['Klettern'],
              birthdate: date('2021-06-14', true),
              first_met_date: date('2015-05-01'),
              first_met_through: LENA,
            },
            [
              coll('call', [
                obj('e1', {
                  called_at: ts('2026-08-20'),
                  content: 'Über die Alpentour gesprochen',
                  contact_called: true,
                }),
              ]),
              coll('contact_field', [
                obj('f1', { data: 'erika@example.com', type: EMAIL }),
                obj('f2', { data: '+49 30 1234567', type: PHONE }),
                obj('f3', { data: '+49 170 1234567', type: WHATSAPP }),
              ]),
              coll('note', [
                obj('n1', {
                  body: 'Trinkt lieber Tee als Kaffee.',
                  favorited_at: ts('2025-12-02'),
                }),
                obj('n2', { body: 'Plant einen Umzug nach Leipzig.' }),
              ]),
              coll('reminder', [
                obj('r1', {
                  initial_date: '2099-11-15T00:00:00.000000Z',
                  title: 'Nach der neuen Wohnung fragen',
                  frequency_type: 'one_time',
                  frequency_number: 1,
                  delible: true,
                  inactive: false,
                }),
                obj('r2', {
                  initial_date: '2021-06-14T00:00:00.000000Z',
                  title: 'Erika zum Geburtstag gratulieren',
                  frequency_type: 'year',
                  frequency_number: 1,
                  delible: false,
                  inactive: false,
                }),
              ]),
              coll('address', [
                obj('ad1', {
                  name: 'Zuhause',
                  street: 'Musterstraße 1',
                  city: 'Berlin',
                  province: null,
                  postal_code: '10115',
                  latitude: null,
                  longitude: null,
                  country: 'DE',
                }),
              ]),
              coll('activity', [DINNER]),
            ],
          ),
          obj(MAX, {
            first_name: 'Max',
            last_name: 'Mustermann',
            is_starred: false,
            is_partial: true,
            is_active: true,
            is_dead: false,
          }),
          obj(
            LENA,
            {
              first_name: 'Lena',
              last_name: 'Beispiel',
              is_starred: false,
              is_partial: false,
              is_active: false,
              is_dead: false,
              birthdate: date('1990-01-01', false, true),
            },
            [
              coll('task', [
                obj('t1', { title: 'Buch zurückgeben', completed: false }),
                obj('t2', { title: 'Erledigtes', completed: true }),
              ]),
              coll('life_event', [
                obj('l1', {
                  name: 'Neuer Job',
                  note: 'Wechsel zur Stadtbibliothek',
                  happened_at: ts('2025-03-01'),
                }),
              ]),
              coll('conversation', [
                obj('cv1', {
                  happened_at: ts('2026-02-02'),
                  messages: [
                    obj('m1', {
                      content: 'Hast du Zeit am Samstag?',
                      written_at: ts('2026-02-02'),
                      written_by_me: true,
                    }),
                    obj('m2', {
                      content: 'Ja, gern!',
                      written_at: ts('2026-02-02'),
                      written_by_me: false,
                    }),
                  ],
                }),
              ]),
              coll('activity', [DINNER]),
            ],
          ),
          obj(OMA, {
            first_name: 'Hilde',
            last_name: 'Musterfrau',
            is_partial: true,
            is_active: true,
            is_dead: true,
            deceased_date: date('2019-03-03'),
          }),
          obj(ME, { first_name: 'Erika', last_name: 'Nutzerin', is_partial: false }),
        ]),
        coll('relationship', [
          rel(1, 'spouse', ERIKA, MAX),
          rel(2, 'spouse', MAX, ERIKA),
          rel(3, 'grandparent', ERIKA, OMA),
          rel(4, 'grandchild', OMA, ERIKA),
          rel(5, 'child', LENA, ERIKA),
          rel(6, 'parent', ERIKA, LENA),
        ]),
        coll('photo', [
          obj(PHOTO, {
            original_filename: 'erika.png',
            filesize: 100,
            mime_type: 'image/png',
            dataUrl: `data:image/png;base64,${photoBase64}`,
          }),
        ]),
        coll('activity', [
          obj(DINNER, {
            summary: 'Abendessen beim Italiener',
            description: 'Neuen Job gefeiert',
            happened_at: ts('2026-07-12'),
            type: 'b1',
          }),
        ]),
      ],
      properties: { journal_entries: [], modules: [], reminder_rules: [], audit_logs: [] },
      instance: {
        contact_field_types: [
          obj(EMAIL, { name: 'Email', protocol: 'mailto:', delible: false, type: 'email' }),
          obj(PHONE, { name: 'Phone', protocol: 'tel:', delible: false, type: 'phone' }),
          obj(WHATSAPP, { name: 'Whatsapp', protocol: 'https://wa.me/', delible: true }),
        ],
        genders: [],
        activity_types: [],
        activity_type_categories: [],
        life_event_types: [],
        life_event_categories: [],
      },
    },
  };
}
