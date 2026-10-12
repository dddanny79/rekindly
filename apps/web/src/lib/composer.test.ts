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
    expect(parseCommands('/cal', today)).toEqual({ text: '/cal', removed: [] });
    expect(parseCommands('/call', today)).toEqual({ text: '/call', removed: [] });
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
    expect(parseCommands('/wv bald Text', today)).toEqual({ text: '/wv bald Text', removed: [] });
  });

  it('leaves unknown commands and normal text alone', () => {
    expect(parseCommands('/foo bar ', today)).toEqual({ text: '/foo bar ', removed: [] });
    expect(parseCommands('km/h und 3/4 ', today)).toEqual({ text: 'km/h und 3/4 ', removed: [] });
    expect(parseCommands('Text /meeting mehr', today)).toMatchObject({
      text: 'Text mehr',
      kind: 'meeting',
    });
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
