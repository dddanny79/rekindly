import { describe, expect, it } from 'vitest';
import { mentionAt, parseCommands } from './composer';

describe('parseCommands', () => {
  const today = new Date(2026, 9, 11);

  it('consumes completed kind and direction commands', () => {
    expect(parseCommands('/call /in Budget freigegeben', today)).toMatchObject({
      text: 'Budget freigegeben',
      kind: 'call',
      direction: 'in',
    });
    expect(parseCommands('/treffen Standortbegehung', today)).toMatchObject({
      kind: 'meeting',
      text: 'Standortbegehung',
    });
  });

  it('waits until a command is complete', () => {
    expect(parseCommands('/cal', today)).toEqual({ text: '/cal', questions: [], removed: [] });
    expect(parseCommands('/call', today)).toEqual({ text: '/call', questions: [], removed: [] });
  });

  it('parses follow-ups', () => {
    expect(parseCommands('/wv 2w Angebot schicken', today)).toMatchObject({
      text: 'Angebot schicken',
      reminderDueOn: '2026-10-25',
    });
    expect(parseCommands('Angebot schicken /wv 2w ', today)).toMatchObject({
      text: 'Angebot schicken ',
      reminderDueOn: '2026-10-25',
    });
    expect(parseCommands('/wv bald Text', today)).toEqual({
      text: '/wv bald Text',
      questions: [],
      removed: [],
    });
  });

  it('leaves unknown commands and normal text alone', () => {
    expect(parseCommands('/foo bar ', today)).toEqual({
      text: '/foo bar ',
      questions: [],
      removed: [],
    });
    expect(parseCommands('km/h und 3/4 ', today)).toEqual({
      text: 'km/h und 3/4 ',
      questions: [],
      removed: [],
    });
    expect(parseCommands('Text /meeting mehr', today)).toMatchObject({
      text: 'Text mehr',
      kind: 'meeting',
    });
  });

  it('takes the rest of the line as a question for next time', () => {
    expect(parseCommands('/frag Wie lief der Umzug? ', today)).toMatchObject({
      text: '',
      questions: ['Wie lief der Umzug?'],
    });
    expect(
      parseCommands(
        '/call Budget freigegeben\n/ask How was the marathon?\n/frage Neue Stelle? ',
        today,
      ),
    ).toMatchObject({
      text: 'Budget freigegeben\n',
      kind: 'call',
      questions: ['How was the marathon?', 'Neue Stelle?'],
    });
    // Commands inside a question belong to its text; an empty question is no command.
    expect(parseCommands('/ask Did /call work? ', today)).toMatchObject({
      questions: ['Did /call work?'],
    });
    expect(parseCommands('/ask  ', today).questions).toEqual([]);
  });
});

describe('mentionAt', () => {
  it('finds the mention before the caret', () => {
    expect(mentionAt('Mit @Tho', 8)).toEqual({ query: 'Tho', start: 4 });
    expect(mentionAt('@', 1)).toEqual({ query: '', start: 0 });
    expect(mentionAt('mail@example.com', 16)).toBeNull();
    expect(mentionAt('Mit @Thomas Albers und', 22)).toBeNull();
  });
});
