import { describe, expect, it } from 'vitest';
import { decodeText } from './contact';
import { detectMapping, parseCsv, parseLooseDate, readCsv } from './csv';
import { nameKey, phoneKey } from './match';
import { readVcards, splitVcards } from './vcf';

const IPHONE = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'PRODID:-//Apple Inc.//iPhone OS 18.0//EN',
  'N:Musterfrau;Erika;;;',
  'FN:Erika Musterfrau',
  'ORG:Beispiel GmbH;Vertrieb',
  'TITLE:Leitung',
  'item1.TEL;type=pref:+49 171 1234567',
  'item1.X-ABLabel:_$!<Mobile>!$_',
  'EMAIL;type=INTERNET;type=HOME:erika@example.com',
  'ADR;type=HOME:;;Musterstraße 1;Berlin;;10115;Deutschland',
  'BDAY;X-APPLE-OMIT-YEAR=1604:1604-10-24',
  'CATEGORIES:Klettern,Familie',
  'X-ABRELATEDNAMES:Max',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:;;;;',
  'FN:Beispiel AG',
  'ORG:Beispiel AG;',
  'X-ABShowAs:COMPANY',
  'TEL;type=WORK:+49 30 123',
  'END:VCARD',
].join('\r\n');

describe('vCard files', () => {
  it('splits a file with several cards', () => {
    expect(splitVcards(IPHONE)).toHaveLength(2);
  });

  it('reads iPhone cards: labels, birthday without year, categories as tags', () => {
    const [erika, company] = readVcards(IPHONE, 'de');
    expect(erika).toMatchObject({
      kind: 'person',
      firstName: 'Erika',
      lastName: 'Musterfrau',
      organization: ['Beispiel GmbH', 'Vertrieb'],
      title: 'Leitung',
      birthday: '--10-24',
      tags: ['Klettern', 'Familie'],
    });
    expect(erika!.points).toEqual([
      { kind: 'phone', label: 'Mobil', value: '+49 171 1234567', isPrimary: true },
      { kind: 'email', label: 'Privat', value: 'erika@example.com', isPrimary: false },
    ]);
    expect(erika!.addresses[0]).toMatchObject({ street: 'Musterstraße 1', city: 'Berlin' });
    expect(erika!.extraLines.some((l) => l.startsWith('X-ABRELATEDNAMES'))).toBe(true);
    // A card with only a company becomes an organization.
    expect(company).toMatchObject({ kind: 'organization', organization: ['Beispiel AG'] });
  });

  it('reads vCard 2.1 with quoted-printable and vCard 4.0 tel: URIs', () => {
    const [old, v4] = readVcards(
      [
        'BEGIN:VCARD',
        'VERSION:2.1',
        'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;',
        'NOTE;ENCODING=QUOTED-PRINTABLE:Erste Zeile=0D=0A=',
        'zweite Zeile',
        'TEL;CELL:0171 2345678',
        'END:VCARD',
        'BEGIN:VCARD',
        'VERSION:4.0',
        'FN:Max Mustermann',
        'N:Mustermann;Max;;;',
        'TEL;VALUE=uri;TYPE=cell:tel:+49-30-555',
        'BDAY:--0315',
        'END:VCARD',
      ].join('\n'),
      'en',
    );
    expect(old).toMatchObject({ firstName: 'Jürgen', lastName: 'Müller' });
    expect(old!.note).toBe('Erste Zeile\nzweite Zeile');
    expect(old!.points[0]).toMatchObject({ kind: 'phone', label: 'Mobile', value: '0171 2345678' });
    expect(v4!.points[0]!.value).toBe('+49-30-555');
    expect(v4!.birthday).toBe('--03-15');
  });
});

describe('CSV files', () => {
  it('parses quotes, line breaks in fields and the delimiter', () => {
    expect(parseCsv('a;b\n"x;1";"Zeile\n2"\n\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'Zeile\n2'],
    ]);
    expect(parseCsv('a,"b ""c"""\r\n1,2')).toEqual([
      ['a', 'b "c"'],
      ['1', '2'],
    ]);
  });

  it('reads a Google Contacts export', () => {
    const csv = [
      'First Name,Middle Name,Last Name,Nickname,Birthday,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Address 1 - Label,Address 1 - Street,Address 1 - City,Address 1 - Postal Code,Address 1 - Country,Organization Name,Organization Title,Website 1 - Value',
      'Erika,,Musterfrau,Riki,1985-10-24,Kennt sich mit Booten aus,* myContacts ::: * starred ::: Segeln,* Home,erika@example.com ::: erika.m@example.org,Mobile,+49 171 1234567,Home,Musterstraße 1,Berlin,10115,Deutschland,Beispiel GmbH,Leitung,https://example.com',
    ].join('\n');
    const result = readCsv(csv, 'de');
    expect(result.template).toBe('google');
    const [erika] = result.contacts;
    expect(erika).toMatchObject({
      firstName: 'Erika',
      lastName: 'Musterfrau',
      nickname: 'Riki',
      birthday: '1985-10-24',
      note: 'Kennt sich mit Booten aus',
      tags: ['Segeln'],
      favorite: true,
      organization: ['Beispiel GmbH'],
      title: 'Leitung',
    });
    expect(erika!.points).toEqual([
      { kind: 'email', label: 'Privat', value: 'erika@example.com', isPrimary: false },
      { kind: 'email', label: 'Privat', value: 'erika.m@example.org', isPrimary: false },
      { kind: 'phone', label: 'Mobil', value: '+49 171 1234567', isPrimary: false },
      { kind: 'url', label: null, value: 'https://example.com', isPrimary: false },
    ]);
    expect(erika!.addresses).toEqual([
      {
        label: 'Privat',
        street: 'Musterstraße 1',
        zip: '10115',
        city: 'Berlin',
        region: null,
        country: 'Deutschland',
      },
    ]);
  });

  it('reads an Outlook export (English): Title is the prefix, US dates, address groups', () => {
    const csv = [
      'Title,First Name,Middle Name,Last Name,Suffix,Company,Department,Job Title,Business Street,Business City,Business Postal Code,Business Country/Region,Home Phone,Mobile Phone,E-mail Address,Birthday,Notes',
      'Dr.,Max,,Mustermann,,Beispiel AG,Einkauf,Leiter,Hauptstraße 5,Köln,50667,Deutschland,030 1234,0171 999,max@example.com,10/24/1985,',
    ].join('\r\n');
    const result = readCsv(csv, 'en');
    expect(result.template).toBe('outlook');
    expect(result.contacts[0]).toMatchObject({
      prefix: 'Dr.',
      firstName: 'Max',
      lastName: 'Mustermann',
      organization: ['Beispiel AG', 'Einkauf'],
      title: 'Leiter',
      birthday: '1985-10-24',
    });
    expect(result.contacts[0]!.points.map((p) => [p.label, p.value])).toEqual([
      ['Home', '030 1234'],
      ['Mobile', '0171 999'],
      [null, 'max@example.com'],
    ]);
    expect(result.contacts[0]!.addresses[0]).toMatchObject({ label: 'Work', city: 'Köln' });
  });

  it('reads a German Outlook export in Windows-1252 with semicolons', () => {
    const text =
      'Vorname;Nachname;E-Mail-Adresse;Mobiltelefon;Straße privat;Ort privat;Geburtstag\r\nJürgen;Größe;j@example.com;0171 1;Am Weg 2;München;24.10.1985\r\n';
    const decoded = decodeText(Buffer.from(text, 'latin1'));
    const { contacts, template } = readCsv(decoded, 'de');
    expect(template).toBe('outlook');
    expect(contacts[0]).toMatchObject({
      firstName: 'Jürgen',
      lastName: 'Größe',
      birthday: '1985-10-24',
    });
    expect(contacts[0]!.addresses[0]).toMatchObject({
      label: 'Privat',
      street: 'Am Weg 2',
      city: 'München',
    });
  });

  it('a custom mapping replaces the detected one; rows without a name are dropped', () => {
    const csv = 'Wer,Kontakt\nErika Musterfrau,erika@example.com\n,nur@example.com\n';
    expect(detectMapping(['Wer', 'Kontakt']).mapping).toEqual([null, null]);
    const { contacts } = readCsv(csv, 'de', [
      { field: 'fullName' },
      { field: 'email', label: 'Arbeit' },
    ]);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ firstName: 'Erika', lastName: 'Musterfrau' });
    expect(contacts[0]!.points[0]).toMatchObject({ value: 'erika@example.com', label: 'Büro' });
  });

  it('parses birthdays in the common spellings', () => {
    expect(parseLooseDate('1985-10-24')).toBe('1985-10-24');
    expect(parseLooseDate('--10-24')).toBe('--10-24');
    expect(parseLooseDate('24.10.1985')).toBe('1985-10-24');
    expect(parseLooseDate('24.10.')).toBe('--10-24');
    expect(parseLooseDate('10/24/1985')).toBe('1985-10-24');
    expect(parseLooseDate('0.0.00')).toBeNull();
    expect(parseLooseDate('morgen')).toBeNull();
  });
});

describe('duplicate keys', () => {
  it('compares phone numbers by their last digits and names folded', () => {
    expect(phoneKey('+49 171 1234567')).toBe(phoneKey('0171/1234567'));
    expect(phoneKey('112')).toBeNull();
    expect(nameKey('Jürgen', 'Müller')).toBe(nameKey('Juergen', 'Mueller'));
    expect(nameKey('Erika', null)).toBeNull();
  });
});
