import { describe, expect, it } from 'vitest';
import { foldText, personDisplayName, personInitials, personSortName } from './text';

describe('foldText', () => {
  it('matches umlauts, transliterations and accents', () => {
    expect(foldText('Müller')).toBe(foldText('Mueller'));
    expect(foldText('Müller')).toBe(foldText('Muller'));
    expect(foldText('Strauß')).toBe('strauss');
    expect(foldText('José Núñez')).toBe('jose nunez');
    expect(foldText('Göbel')).toBe(foldText('Goebel'));
  });
});

describe('person names', () => {
  it('builds display and sort names', () => {
    const p = { prefix: 'Dr.', firstName: 'Jana', middleName: 'Maria', lastName: 'Berger' };
    expect(personDisplayName(p)).toBe('Dr. Jana Maria Berger');
    expect(personSortName(p)).toBe('Berger Jana Maria');
    expect(personDisplayName({ nickname: 'Bergi' })).toBe('Bergi');
    expect(personDisplayName({ firstName: 'Jana', nickname: 'Jani', lastName: 'Berger' })).toBe(
      'Jana (Jani) Berger',
    );
    expect(personDisplayName({ firstName: 'Jana', nickname: 'jana', lastName: 'Berger' })).toBe(
      'Jana Berger',
    );
    expect(personDisplayName({ nickname: 'Jani', lastName: 'Berger' })).toBe('Jani Berger');
    expect(personDisplayName({})).toBe('');
  });

  it('builds initials', () => {
    expect(personInitials({ firstName: 'Jana', lastName: 'Berger' })).toBe('JB');
    expect(personInitials({ nickname: 'bergi' })).toBe('B');
    expect(personInitials({ lastName: 'Berger' })).toBe('B');
  });
});
