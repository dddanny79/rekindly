import { describe, expect, it } from 'vitest';
import {
  containsWords,
  foldText,
  personDisplayName,
  personInitials,
  personSortName,
  sameWords,
} from './text';

describe('foldText', () => {
  it('matches umlauts, transliterations and accents', () => {
    expect(foldText('Müller')).toBe(foldText('Mueller'));
    expect(foldText('Müller')).toBe(foldText('Muller'));
    expect(foldText('Strauß')).toBe('strauss');
    expect(foldText('José Núñez')).toBe('jose nunez');
    expect(foldText('Göbel')).toBe(foldText('Goebel'));
  });
});

describe('word matching', () => {
  it('finds names in any order', () => {
    expect(containsWords('Berger, Jana', 'jana berger')).toBe(true);
    expect(containsWords('Berger, Jana', 'bergér ja')).toBe(true);
    expect(containsWords('Berger, Jana', 'jana müller')).toBe(false);
    expect(containsWords('Berger, Jana', '')).toBe(true);
    expect(sameWords('Berger, Jana', 'Jana Berger')).toBe(true);
    expect(sameWords('Berger, Jana', 'Jana')).toBe(false);
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

  it('writes the last name first when asked', () => {
    const order = 'lastFirst' as const;
    expect(personDisplayName({ firstName: 'Jana', lastName: 'Berger' }, order)).toBe(
      'Berger, Jana',
    );
    expect(
      personDisplayName({ firstName: 'Jana', nickname: 'Jani', lastName: 'Berger' }, order),
    ).toBe('Berger, Jana (Jani)');
    expect(personDisplayName({ prefix: 'Dr.', firstName: 'Jana', lastName: 'Berger' }, order)).toBe(
      'Berger, Dr. Jana',
    );
    expect(
      personDisplayName(
        { firstName: 'Jana', middleName: 'Maria', lastName: 'Berger', suffix: 'MBA' },
        order,
      ),
    ).toBe('Berger, Jana Maria, MBA');
    expect(personDisplayName({ nickname: 'Jani', lastName: 'Berger' }, order)).toBe('Berger, Jani');
    // Only one part: unchanged.
    expect(personDisplayName({ firstName: 'Jana' }, order)).toBe('Jana');
    expect(personDisplayName({ prefix: 'Dr.', lastName: 'Berger' }, order)).toBe('Dr. Berger');
    expect(personDisplayName({ nickname: 'Bergi' }, order)).toBe('Bergi');
    expect(personDisplayName({}, order)).toBe('');
  });

  it('sorts by first name when asked', () => {
    const p = { firstName: 'Jana', middleName: 'Maria', lastName: 'Berger' };
    expect(personSortName(p, 'firstName')).toBe('Jana Maria Berger');
    expect(personSortName({ nickname: 'Jani', lastName: 'Berger' }, 'firstName')).toBe(
      'Jani Berger',
    );
    expect(personSortName({ lastName: 'Berger' }, 'firstName')).toBe('Berger');
  });

  it('builds initials', () => {
    expect(personInitials({ firstName: 'Jana', lastName: 'Berger' })).toBe('JB');
    expect(personInitials({ nickname: 'bergi' })).toBe('B');
    expect(personInitials({ lastName: 'Berger' })).toBe('B');
  });
});
