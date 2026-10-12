import { describe, expect, it } from 'vitest';
import { buildVcard, type CardData, foldLine, parseVcard, unfold } from './vcard';

const jana: CardData = {
  uid: 'p-1',
  prefix: 'Dr.',
  firstName: 'Jana',
  middleName: null,
  lastName: 'Müller',
  suffix: null,
  nickname: 'Jani',
  birthday: '--10-24',
  organization: ['Beispiel GmbH', 'Standort Köln'],
  title: 'Leitung Einkauf',
  note: 'Kundin seit 2019; mag Tee, keinen Kaffee.\nZweite Zeile',
  points: [
    { kind: 'phone', label: 'Mobil', value: '+49 170 5550142', isPrimary: true },
    { kind: 'phone', label: 'Zentrale Köln', value: '+49 221 5550100', isPrimary: false },
    { kind: 'email', label: 'Büro', value: 'jana@example.com', isPrimary: false },
    { kind: 'url', label: null, value: 'https://example.com', isPrimary: false },
    { kind: 'social', label: 'LinkedIn', value: 'linkedin.com/in/jana', isPrimary: false },
  ],
  addresses: [
    {
      label: 'Büro',
      street: 'Domplatz 1',
      zip: '50667',
      city: 'Köln',
      region: null,
      country: 'Deutschland',
    },
  ],
};

describe('vCard', () => {
  it('writes iOS-style vCard 3.0', () => {
    const text = buildVcard(jana, {
      link: { url: 'https://contacts.example.com/people/p-1', label: 'Personengedächtnis' },
    });
    expect(text.endsWith('\r\n')).toBe(true);
    const lines = unfold(text);
    expect(lines).toContain('N:Müller;Jana;;Dr.;');
    expect(lines).toContain('FN:Dr. Jana Müller');
    expect(lines).toContain('BDAY;X-APPLE-OMIT-YEAR=1604:1604-10-24');
    expect(lines).toContain('ORG:Beispiel GmbH;Standort Köln');
    expect(lines).toContain(
      String.raw`NOTE:Kundin seit 2019\; mag Tee\, keinen Kaffee.\nZweite Zeile`,
    );
    expect(lines).toContain('TEL;type=CELL,pref:+49 170 5550142');
    expect(lines).toContain('item1.TEL:+49 221 5550100');
    expect(lines).toContain('item1.X-ABLabel:Zentrale Köln');
    expect(lines).toContain('EMAIL;type=INTERNET,WORK:jana@example.com');
    expect(lines).toContain('ADR;type=WORK:;;Domplatz 1;Köln;;50667;Deutschland');
    expect(lines).toContain('item2.URL:https://contacts.example.com/people/p-1');
    // Every physical line is at most 75 octets.
    for (const line of text.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it('folds without splitting multi-byte characters', () => {
    const line = `NOTE:${'ä'.repeat(60)}`;
    const folded = foldLine(line);
    expect(folded.split('\r\n').every((part) => Buffer.byteLength(part) <= 75)).toBe(true);
    expect(unfold(folded)).toEqual([line]);
  });

  it('reads back what it wrote (round trip)', () => {
    const parsed = parseVcard(
      buildVcard(jana, {
        link: { url: 'https://contacts.example.com/people/p-1', label: 'X' },
      }),
      { locale: 'de', isOwnLink: (url) => url.includes('/people/p-1') },
    );
    expect(parsed).toMatchObject({
      uid: 'p-1',
      prefix: 'Dr.',
      firstName: 'Jana',
      lastName: 'Müller',
      nickname: 'Jani',
      birthday: '--10-24',
      organization: ['Beispiel GmbH', 'Standort Köln'],
      title: 'Leitung Einkauf',
      note: jana.note,
      points: jana.points,
      addresses: jana.addresses,
      extraLines: [],
    });
  });

  it('reads what an iPhone sends and keeps unknown lines', () => {
    const fromIphone = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'PRODID:-//Apple Inc.//iPhone OS 26.0//EN',
      'N:Berger;Tom;;;',
      'FN:Tom Berger',
      'item1.TEL;type=pref:+49 151 5550199',
      'item1.X-ABLabel:_$!<Mobile>!$_',
      'TEL;type=WORK;type=VOICE:0221 5550123',
      'item2.X-ABDATE;type=pref:2019-05-01',
      'item2.X-ABLabel:_$!<Anniversary>!$_',
      'X-ABRELATEDNAMES:Anna',
      'BDAY;VALUE=date:1979-03-08',
      'PHOTO;ENCODING=b;TYPE=JPEG:/9j/AAAA',
      'END:VCARD',
      '',
    ].join('\r\n');
    const parsed = parseVcard(fromIphone, { locale: 'en' });
    expect(parsed.firstName).toBe('Tom');
    expect(parsed.birthday).toBe('1979-03-08');
    expect(parsed.points).toEqual([
      { kind: 'phone', label: 'Mobile', value: '+49 151 5550199', isPrimary: true },
      { kind: 'phone', label: 'Work', value: '0221 5550123', isPrimary: false },
    ]);
    expect(parsed.photo?.length).toBeGreaterThan(0);
    expect(parsed.extraLines).toEqual([
      'item2.X-ABDATE;type=pref:2019-05-01',
      'item2.X-ABLabel:_$!<Anniversary>!$_',
      'X-ABRELATEDNAMES:Anna',
    ]);
    // Written back under a group name that cannot clash with the app's itemN.
    const back = unfold(buildVcard({ ...jana, points: [] }, { extraLines: parsed.extraLines }));
    expect(back).toContain('extra1.X-ABDATE;type=pref:2019-05-01');
    expect(back).toContain('extra1.X-ABLabel:_$!<Anniversary>!$_');
  });

  it('understands other birthday notations', () => {
    const bday = (line: string) =>
      parseVcard(`BEGIN:VCARD\r\n${line}\r\nEND:VCARD\r\n`, { locale: 'en' }).birthday;
    expect(bday('BDAY:19851024')).toBe('1985-10-24');
    expect(bday('BDAY:--1024')).toBe('--10-24');
    expect(bday('BDAY:--10-24')).toBe('--10-24');
    expect(bday('BDAY:1985-10-24T00:00:00Z')).toBe('1985-10-24');
    expect(bday('BDAY:nonsense')).toBeNull();
  });
});
